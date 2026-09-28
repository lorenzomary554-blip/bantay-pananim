// ============================================================
// Dispatch Routes — FIFO Sale/Dispatch Engine
// ============================================================

const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// ============================================================
// GET /dispatch — Dispatch form with FIFO recommendation
// ============================================================
router.get('/', (req, res) => {
  const db = getDb();
  const cropFilter = req.query.crop_id || '';

  // Get all crops that have active batches
  const crops = db.prepare(`
    SELECT DISTINCT c.*
    FROM crops c
    JOIN batches b ON c.crop_id = b.crop_id
    WHERE b.status NOT IN ('Fulfilled', 'Spoiled') AND b.remaining_weight_kg > 0
    ORDER BY c.crop_name
  `).all();

  // Get FIFO-recommended batches (oldest first)
  let batchesQuery = `
    SELECT b.*, c.crop_name, sb.bay_code,
      CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
    WHERE b.status NOT IN ('Fulfilled', 'Spoiled') AND b.remaining_weight_kg > 0
  `;

  let batches;
  if (cropFilter) {
    batchesQuery += ` AND b.crop_id = ? ORDER BY b.date_received ASC, b.estimated_expiry_date ASC`;
    batches = db.prepare(batchesQuery).all(parseInt(cropFilter));
  } else {
    batchesQuery += ` ORDER BY b.date_received ASC, b.estimated_expiry_date ASC`;
    batches = db.prepare(batchesQuery).all();
  }

  // The first batch is the FIFO recommendation
  const fifoRecommendation = batches.length > 0 ? batches[0] : null;

  res.render('dispatch-form', {
    title: 'Sell / Dispatch Crops — Bantay Pananim',
    crops,
    batches,
    fifoRecommendation,
    cropFilter,
  });
});

// ============================================================
// POST /dispatch — Record a dispatch/sale
// ============================================================
router.post('/', (req, res) => {
  const db = getDb();
  const { batch_id, quantity_dispatched_kg, buyer_name, override_reason } = req.body;

  // Validate
  if (!batch_id || !quantity_dispatched_kg) {
    req.flash('error', '⚠️ Please select a batch and enter the quantity to sell.');
    return res.redirect('/dispatch');
  }

  const quantity = parseFloat(quantity_dispatched_kg);
  if (isNaN(quantity) || quantity <= 0) {
    req.flash('error', '⚠️ Please enter a valid quantity greater than 0.');
    return res.redirect('/dispatch');
  }

  const batch = db.prepare(`
    SELECT b.*, c.crop_name, sb.bay_code
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
    WHERE b.batch_id = ?
  `).get(parseInt(batch_id));

  if (!batch) {
    req.flash('error', '⚠️ Batch not found.');
    return res.redirect('/dispatch');
  }

  if (quantity > batch.remaining_weight_kg) {
    req.flash('error', `⚠️ Cannot sell ${quantity} kg — only ${batch.remaining_weight_kg} kg remaining in this batch.`);
    return res.redirect('/dispatch');
  }

  const today = new Date().toISOString().split('T')[0];

  // Record dispatch
  db.prepare(`
    INSERT INTO dispatch_logs (batch_id, quantity_dispatched_kg, dispatch_date, buyer_name, override_reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(parseInt(batch_id), quantity, today, buyer_name || null, override_reason || null);

  // Update batch remaining weight
  const newRemaining = batch.remaining_weight_kg - quantity;
  if (newRemaining <= 0) {
    // Batch fully dispatched
    db.prepare(`
      UPDATE batches SET remaining_weight_kg = 0, status = 'Fulfilled' WHERE batch_id = ?
    `).run(parseInt(batch_id));

    // Check if bay should be set to Available
    const remainingInBay = db.prepare(`
      SELECT COUNT(*) as count FROM batches
      WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')
    `).get(batch.bay_id);

    if (remainingInBay.count === 0) {
      db.prepare(`UPDATE storage_bays SET status = 'Available' WHERE bay_id = ?`).run(batch.bay_id);
    }

    req.flash('success', `✅ Sold ALL ${quantity} kg of ${batch.crop_name} from ${batch.bay_code}. Batch fully dispatched!`);
  } else {
    db.prepare(`
      UPDATE batches SET remaining_weight_kg = ? WHERE batch_id = ?
    `).run(newRemaining, parseInt(batch_id));

    req.flash('success', `✅ Sold ${quantity} kg of ${batch.crop_name} from ${batch.bay_code}. Remaining: ${newRemaining} kg.`);
  }

  res.redirect('/dispatch/history');
});

// ============================================================
// GET /dispatch/history — Dispatch log
// ============================================================
router.get('/history', (req, res) => {
  const db = getDb();

  const logs = db.prepare(`
    SELECT dl.*, b.batch_id, c.crop_name, sb.bay_code,
      b.initial_weight_kg, b.remaining_weight_kg, b.status as batch_status
    FROM dispatch_logs dl
    JOIN batches b ON dl.batch_id = b.batch_id
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
    ORDER BY dl.dispatch_date DESC, dl.log_id DESC
  `).all();

  // Summary stats
  const totalDispatched = db.prepare(`
    SELECT COALESCE(SUM(quantity_dispatched_kg), 0) as total FROM dispatch_logs
  `).get();

  const totalTransactions = db.prepare(`
    SELECT COUNT(*) as count FROM dispatch_logs
  `).get();

  res.render('dispatch-log', {
    title: 'Sale History — Bantay Pananim',
    logs,
    totalDispatched: totalDispatched.total,
    totalTransactions: totalTransactions.count,
  });
});

module.exports = router;
