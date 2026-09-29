// ============================================================
// Dispatch Routes — FIFO Sale/Dispatch Engine
// ============================================================

const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../database');

// GET /dispatch
router.get('/', async (req, res) => {
  try {
    const cropFilter = req.query.crop_id || '';

    const crops = await dbAll(`
      SELECT DISTINCT c.* FROM crops c
      JOIN batches b ON c.crop_id = b.crop_id
      WHERE b.status NOT IN ('Fulfilled', 'Spoiled') AND b.remaining_weight_kg > 0
      ORDER BY c.crop_name
    `);

    let batches;
    if (cropFilter) {
      batches = await dbAll(`
        SELECT b.*, c.crop_name, sb.bay_code,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        WHERE b.status NOT IN ('Fulfilled', 'Spoiled') AND b.remaining_weight_kg > 0 AND b.crop_id = ?
        ORDER BY b.date_received ASC, b.estimated_expiry_date ASC
      `, [parseInt(cropFilter)]);
    } else {
      batches = await dbAll(`
        SELECT b.*, c.crop_name, sb.bay_code,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        WHERE b.status NOT IN ('Fulfilled', 'Spoiled') AND b.remaining_weight_kg > 0
        ORDER BY b.date_received ASC, b.estimated_expiry_date ASC
      `);
    }

    const fifoRecommendation = batches.length > 0 ? batches[0] : null;

    res.render('dispatch-form', {
      title: 'Sell / Dispatch Crops — Bantay Pananim',
      crops, batches, fifoRecommendation, cropFilter,
    });
  } catch (err) {
    console.error('Dispatch form error:', err);
    res.status(500).send('Error loading dispatch page');
  }
});

// POST /dispatch
router.post('/', async (req, res) => {
  try {
    const { batch_id, quantity_dispatched_kg, buyer_name, override_reason } = req.body;

    if (!batch_id || !quantity_dispatched_kg) {
      req.flash('error', '⚠️ Please select a batch and enter the quantity to sell.');
      return res.redirect('/dispatch');
    }

    const quantity = parseFloat(quantity_dispatched_kg);
    if (isNaN(quantity) || quantity <= 0) {
      req.flash('error', '⚠️ Please enter a valid quantity greater than 0.');
      return res.redirect('/dispatch');
    }

    const batch = await dbGet(`
      SELECT b.*, c.crop_name, sb.bay_code FROM batches b
      JOIN crops c ON b.crop_id = c.crop_id
      JOIN storage_bays sb ON b.bay_id = sb.bay_id
      WHERE b.batch_id = ?
    `, [parseInt(batch_id)]);

    if (!batch) {
      req.flash('error', '⚠️ Batch not found.');
      return res.redirect('/dispatch');
    }

    if (quantity > batch.remaining_weight_kg) {
      req.flash('error', `⚠️ Cannot sell ${quantity} kg — only ${batch.remaining_weight_kg} kg remaining.`);
      return res.redirect('/dispatch');
    }

    const today = new Date().toISOString().split('T')[0];

    await dbRun(
      `INSERT INTO dispatch_logs (batch_id, quantity_dispatched_kg, dispatch_date, buyer_name, override_reason) VALUES (?, ?, ?, ?, ?)`,
      [parseInt(batch_id), quantity, today, buyer_name || null, override_reason || null]
    );

    const newRemaining = batch.remaining_weight_kg - quantity;
    if (newRemaining <= 0) {
      await dbRun(`UPDATE batches SET remaining_weight_kg = 0, status = 'Fulfilled' WHERE batch_id = ?`, [parseInt(batch_id)]);
      const remaining = await dbGet(
        `SELECT COUNT(*) as count FROM batches WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')`,
        [batch.bay_id]
      );
      if (remaining.count === 0) {
        await dbRun(`UPDATE storage_bays SET status = 'Available' WHERE bay_id = ?`, [batch.bay_id]);
      }
      req.flash('success', `✅ Sold ALL ${quantity} kg of ${batch.crop_name} from ${batch.bay_code}. Batch fully dispatched!`);
    } else {
      await dbRun(`UPDATE batches SET remaining_weight_kg = ? WHERE batch_id = ?`, [newRemaining, parseInt(batch_id)]);
      req.flash('success', `✅ Sold ${quantity} kg of ${batch.crop_name} from ${batch.bay_code}. Remaining: ${newRemaining} kg.`);
    }

    res.redirect('/dispatch/history');
  } catch (err) {
    console.error('Dispatch post error:', err);
    req.flash('error', '⚠️ Something went wrong.');
    res.redirect('/dispatch');
  }
});

// GET /dispatch/history
router.get('/history', async (req, res) => {
  try {
    const [logs, totalRow, countRow] = await Promise.all([
      dbAll(`
        SELECT dl.*, b.batch_id, c.crop_name, sb.bay_code,
          b.initial_weight_kg, b.remaining_weight_kg, b.status as batch_status
        FROM dispatch_logs dl
        JOIN batches b ON dl.batch_id = b.batch_id
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        ORDER BY dl.dispatch_date DESC, dl.log_id DESC
      `),
      dbGet(`SELECT COALESCE(SUM(quantity_dispatched_kg), 0) as total FROM dispatch_logs`),
      dbGet(`SELECT COUNT(*) as count FROM dispatch_logs`),
    ]);

    res.render('dispatch-log', {
      title: 'Sale History — Bantay Pananim',
      logs,
      totalDispatched: totalRow.total,
      totalTransactions: countRow.count,
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).send('Error loading history');
  }
});

module.exports = router;
