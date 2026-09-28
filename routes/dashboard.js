// ============================================================
// Dashboard Route — Main Overview
// ============================================================

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

router.get('/', (req, res) => {
  const db = getDb();

  // Total stored weight
  const totalStored = db.prepare(`
    SELECT COALESCE(SUM(remaining_weight_kg), 0) as total
    FROM batches WHERE status NOT IN ('Fulfilled', 'Spoiled')
  `).get();

  // Active batches count
  const activeBatches = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches WHERE status NOT IN ('Fulfilled', 'Spoiled')
  `).get();

  // Batches needing sale this week (Warning + Priority)
  const needsSaleThisWeek = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches WHERE status IN ('Warning', 'Priority')
  `).get();

  // Urgent / spoiling batches
  const urgentCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches WHERE status = 'Priority'
  `).get();

  // Spoiled batches
  const spoiledCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches WHERE status = 'Spoiled'
  `).get();

  // Rooms in use
  const roomsInUse = db.prepare(`
    SELECT COUNT(*) as count
    FROM storage_bays WHERE status = 'Occupied'
  `).get();

  // Total rooms
  const totalRooms = db.prepare(`
    SELECT COUNT(*) as count FROM storage_bays
  `).get();

  // Recent batches needing attention
  const attentionBatches = db.prepare(`
    SELECT b.*, c.crop_name, sb.bay_code,
      CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
    WHERE b.status IN ('Warning', 'Priority')
    ORDER BY b.estimated_expiry_date ASC
    LIMIT 5
  `).all();

  res.render('dashboard', {
    title: 'Dashboard — Bantay Pananim',
    totalStored: totalStored.total,
    activeBatches: activeBatches.count,
    needsSaleThisWeek: needsSaleThisWeek.count,
    urgentCount: urgentCount.count,
    spoiledCount: spoiledCount.count,
    roomsInUse: roomsInUse.count,
    totalRooms: totalRooms.count,
    attentionBatches,
  });
});

module.exports = router;
