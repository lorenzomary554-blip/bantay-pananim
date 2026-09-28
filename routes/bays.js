// ============================================================
// Storage Bays (Rooms) Routes — Visual Grid
// ============================================================

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ============================================================
// GET /storage-rooms — Visual grid of all storage rooms
// ============================================================
router.get('/', (req, res) => {
  const db = getDb();

  const bays = db.prepare(`
    SELECT sb.*,
      (SELECT COALESCE(SUM(b.remaining_weight_kg), 0)
       FROM batches b WHERE b.bay_id = sb.bay_id
       AND b.status NOT IN ('Fulfilled', 'Spoiled')) as current_load_kg
    FROM storage_bays sb
    ORDER BY sb.bay_code
  `).all();

  // Get batch details for each occupied bay
  const bayDetails = bays.map(bay => {
    const batches = db.prepare(`
      SELECT b.*, c.crop_name,
        CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
      FROM batches b
      JOIN crops c ON b.crop_id = c.crop_id
      WHERE b.bay_id = ? AND b.status NOT IN ('Fulfilled', 'Spoiled')
      ORDER BY b.estimated_expiry_date ASC
    `).all(bay.bay_id);

    // Determine worst status for the bay
    let worstStatus = 'Empty';
    if (bay.status === 'Maintenance') {
      worstStatus = 'Maintenance';
    } else if (batches.length > 0) {
      const statusPriority = { 'Priority': 3, 'Warning': 2, 'Fresh': 1 };
      worstStatus = batches.reduce((worst, b) => {
        return (statusPriority[b.status] || 0) > (statusPriority[worst] || 0) ? b.status : worst;
      }, 'Fresh');
    }

    return {
      ...bay,
      batches,
      worstStatus,
      utilizationPercent: bay.capacity_kg > 0
        ? Math.round((bay.current_load_kg / bay.capacity_kg) * 100)
        : 0
    };
  });

  res.render('storage-grid', {
    title: 'Storage Rooms — Bantay Pananim',
    bays: bayDetails,
  });
});

// ============================================================
// POST /storage-rooms/:id/status — Toggle maintenance status
// ============================================================
router.post('/:id/status', (req, res) => {
  const db = getDb();
  const bayId = parseInt(req.params.id);
  const { newStatus } = req.body;

  if (!['Available', 'Maintenance'].includes(newStatus)) {
    req.flash('error', '⚠️ Invalid status.');
    return res.redirect('/storage-rooms');
  }

  // Check if bay has active batches before setting to maintenance
  if (newStatus === 'Maintenance') {
    const activeBatches = db.prepare(`
      SELECT COUNT(*) as count FROM batches
      WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')
    `).get(bayId);

    if (activeBatches.count > 0) {
      req.flash('error', '⚠️ Cannot set to Maintenance — this room still has active crop batches! Sell or move them first.');
      return res.redirect('/storage-rooms');
    }
  }

  db.prepare('UPDATE storage_bays SET status = ? WHERE bay_id = ?').run(newStatus, bayId);

  const bay = db.prepare('SELECT bay_code FROM storage_bays WHERE bay_id = ?').get(bayId);
  req.flash('success', `✅ ${bay.bay_code} has been set to ${newStatus}.`);
  res.redirect('/storage-rooms');
});

module.exports = router;
