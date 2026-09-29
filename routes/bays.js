// ============================================================
// Storage Bays (Rooms) Routes — Visual Grid
// ============================================================

const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database');

// GET /storage-rooms
router.get('/', async (req, res) => {
  try {
    const bays = await dbAll(`
      SELECT sb.*,
        (SELECT COALESCE(SUM(b.remaining_weight_kg), 0)
         FROM batches b WHERE b.bay_id = sb.bay_id
         AND b.status NOT IN ('Fulfilled', 'Spoiled')) as current_load_kg
      FROM storage_bays sb ORDER BY sb.bay_code
    `);

    const bayDetails = await Promise.all(bays.map(async (bay) => {
      const batches = await dbAll(`
        SELECT b.*, c.crop_name,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        WHERE b.bay_id = ? AND b.status NOT IN ('Fulfilled', 'Spoiled')
        ORDER BY b.estimated_expiry_date ASC
      `, [bay.bay_id]);

      let worstStatus = 'Empty';
      if (bay.status === 'Maintenance') {
        worstStatus = 'Maintenance';
      } else if (batches.length > 0) {
        const statusPriority = { 'Priority': 3, 'Warning': 2, 'Fresh': 1 };
        worstStatus = batches.reduce((worst, b) =>
          (statusPriority[b.status] || 0) > (statusPriority[worst] || 0) ? b.status : worst, 'Fresh');
      }

      return {
        ...bay,
        batches,
        worstStatus,
        utilizationPercent: bay.capacity_kg > 0
          ? Math.round((bay.current_load_kg / bay.capacity_kg) * 100) : 0,
      };
    }));

    res.render('storage-grid', { title: 'Storage Rooms — Bantay Pananim', bays: bayDetails });
  } catch (err) {
    console.error('Storage rooms error:', err);
    res.status(500).send('Error loading storage rooms');
  }
});

// POST /storage-rooms/:id/status
router.post('/:id/status', async (req, res) => {
  try {
    const bayId = parseInt(req.params.id);
    const { newStatus } = req.body;

    if (!['Available', 'Maintenance'].includes(newStatus)) {
      req.flash('error', '⚠️ Invalid status.');
      return res.redirect('/storage-rooms');
    }

    if (newStatus === 'Maintenance') {
      const active = await dbGet(
        `SELECT COUNT(*) as count FROM batches WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')`,
        [bayId]
      );
      if (active.count > 0) {
        req.flash('error', '⚠️ Cannot set to Maintenance — this room still has active crop batches!');
        return res.redirect('/storage-rooms');
      }
    }

    await dbRun('UPDATE storage_bays SET status = ? WHERE bay_id = ?', [newStatus, bayId]);
    const bay = await dbGet('SELECT bay_code FROM storage_bays WHERE bay_id = ?', [bayId]);
    req.flash('success', `✅ ${bay.bay_code} has been set to ${newStatus}.`);
    res.redirect('/storage-rooms');
  } catch (err) {
    console.error('Bay status error:', err);
    req.flash('error', '⚠️ Something went wrong.');
    res.redirect('/storage-rooms');
  }
});

module.exports = router;
