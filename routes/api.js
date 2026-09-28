// ============================================================
// API Routes — JSON Endpoints for Charts
// ============================================================

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ============================================================
// GET /api/chart-data — Status distribution for pie chart
// ============================================================
router.get('/chart-data', (req, res) => {
  const db = getDb();

  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(remaining_weight_kg), 0) as total_kg
    FROM batches
    GROUP BY status
  `).all();

  // Crop distribution
  const cropDistribution = db.prepare(`
    SELECT c.crop_name, COALESCE(SUM(b.remaining_weight_kg), 0) as total_kg
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    WHERE b.status NOT IN ('Fulfilled', 'Spoiled')
    GROUP BY c.crop_name
    ORDER BY total_kg DESC
  `).all();

  res.json({
    statusCounts,
    cropDistribution,
  });
});

// ============================================================
// GET /api/crops — Crop details for form helpers
// ============================================================
router.get('/crops/:id', (req, res) => {
  const db = getDb();
  const crop = db.prepare('SELECT * FROM crops WHERE crop_id = ?').get(parseInt(req.params.id));
  if (!crop) return res.status(404).json({ error: 'Crop not found' });
  res.json(crop);
});

module.exports = router;
