// ============================================================
// API Routes — JSON Endpoints for Charts
// ============================================================

const express = require('express');
const router = express.Router();
const { dbAll, dbGet } = require('../database');

// GET /api/chart-data
router.get('/chart-data', async (req, res) => {
  try {
    const [statusCounts, cropDistribution] = await Promise.all([
      dbAll(`SELECT status, COUNT(*) as count, COALESCE(SUM(remaining_weight_kg), 0) as total_kg FROM batches GROUP BY status`),
      dbAll(`
        SELECT c.crop_name, COALESCE(SUM(b.remaining_weight_kg), 0) as total_kg
        FROM batches b JOIN crops c ON b.crop_id = c.crop_id
        WHERE b.status NOT IN ('Fulfilled', 'Spoiled')
        GROUP BY c.crop_name ORDER BY total_kg DESC
      `),
    ]);
    res.json({ statusCounts, cropDistribution });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crops/:id
router.get('/crops/:id', async (req, res) => {
  try {
    const crop = await dbGet('SELECT * FROM crops WHERE crop_id = ?', [parseInt(req.params.id)]);
    if (!crop) return res.status(404).json({ error: 'Crop not found' });
    res.json(crop);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
