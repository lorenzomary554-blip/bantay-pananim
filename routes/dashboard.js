// ============================================================
// Dashboard Route — Main Overview
// ============================================================

const express = require('express');
const router = express.Router();
const { dbAll, dbGet } = require('../database');

router.get('/', async (req, res) => {
  try {
    const [
      totalStoredRow,
      activeBatchesRow,
      needsSaleRow,
      urgentRow,
      spoiledRow,
      roomsInUseRow,
      totalRoomsRow,
      attentionBatches,
    ] = await Promise.all([
      dbGet(`SELECT COALESCE(SUM(remaining_weight_kg), 0) as total FROM batches WHERE status NOT IN ('Fulfilled', 'Spoiled')`),
      dbGet(`SELECT COUNT(*) as count FROM batches WHERE status NOT IN ('Fulfilled', 'Spoiled')`),
      dbGet(`SELECT COUNT(*) as count FROM batches WHERE status IN ('Warning', 'Priority')`),
      dbGet(`SELECT COUNT(*) as count FROM batches WHERE status = 'Priority'`),
      dbGet(`SELECT COUNT(*) as count FROM batches WHERE status = 'Spoiled'`),
      dbGet(`SELECT COUNT(*) as count FROM storage_bays WHERE status = 'Occupied'`),
      dbGet(`SELECT COUNT(*) as count FROM storage_bays`),
      dbAll(`
        SELECT b.*, c.crop_name, sb.bay_code,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        WHERE b.status IN ('Warning', 'Priority')
        ORDER BY b.estimated_expiry_date ASC
        LIMIT 5
      `),
    ]);

    res.render('dashboard', {
      title: 'Dashboard — Bantay Pananim',
      totalStored: totalStoredRow.total,
      activeBatches: activeBatchesRow.count,
      needsSaleThisWeek: needsSaleRow.count,
      urgentCount: urgentRow.count,
      spoiledCount: spoiledRow.count,
      roomsInUse: roomsInUseRow.count,
      totalRooms: totalRoomsRow.count,
      attentionBatches,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

module.exports = router;
