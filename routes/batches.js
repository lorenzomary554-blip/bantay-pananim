// ============================================================
// Batches Routes — Harvest Entry & Batch Management
// ============================================================

const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun, calculateExpiryDate } = require('../database');

// GET /batches — List all batches
router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status || 'all';
    let batches;
    if (statusFilter !== 'all') {
      batches = await dbAll(`
        SELECT b.*, c.crop_name, sb.bay_code,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        WHERE b.status = ?
        ORDER BY b.estimated_expiry_date ASC
      `, [statusFilter]);
    } else {
      batches = await dbAll(`
        SELECT b.*, c.crop_name, sb.bay_code,
          CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
        FROM batches b
        JOIN crops c ON b.crop_id = c.crop_id
        JOIN storage_bays sb ON b.bay_id = sb.bay_id
        ORDER BY b.estimated_expiry_date ASC
      `);
    }
    res.render('batch-list', { title: 'All Crop Batches — Bantay Pananim', batches, statusFilter });
  } catch (err) {
    console.error('Batches list error:', err);
    res.status(500).send('Error loading batches');
  }
});

// GET /batches/new — Show harvest entry form
router.get('/new', async (req, res) => {
  try {
    const [crops, bays] = await Promise.all([
      dbAll('SELECT * FROM crops ORDER BY crop_name'),
      dbAll(`SELECT * FROM storage_bays WHERE status IN ('Available', 'Occupied') ORDER BY bay_code`),
    ]);
    res.render('batch-form', { title: 'Register New Crop Harvest — Bantay Pananim', crops, bays });
  } catch (err) {
    console.error('Batch form error:', err);
    res.status(500).send('Error loading form');
  }
});

// POST /batches — Create new batch
router.post('/', async (req, res) => {
  try {
    const { crop_id, bay_id, initial_weight_kg, moisture_content, date_received } = req.body;

    if (!crop_id || !bay_id || !initial_weight_kg || !moisture_content || !date_received) {
      req.flash('error', '⚠️ Please fill in all required fields.');
      return res.redirect('/batches/new');
    }

    const weight = parseFloat(initial_weight_kg);
    const moisture = parseFloat(moisture_content);

    if (isNaN(weight) || weight <= 0) {
      req.flash('error', '⚠️ Please enter a valid weight greater than 0.');
      return res.redirect('/batches/new');
    }
    if (isNaN(moisture) || moisture < 0 || moisture > 100) {
      req.flash('error', '⚠️ Moisture must be between 0 and 100 percent.');
      return res.redirect('/batches/new');
    }

    const crop = await dbGet('SELECT * FROM crops WHERE crop_id = ?', [parseInt(crop_id)]);
    if (!crop) {
      req.flash('error', '⚠️ Selected crop type not found.');
      return res.redirect('/batches/new');
    }

    const bay = await dbGet('SELECT * FROM storage_bays WHERE bay_id = ?', [parseInt(bay_id)]);
    if (!bay) {
      req.flash('error', '⚠️ Selected storage room not found.');
      return res.redirect('/batches/new');
    }

    const loadRow = await dbGet(
      `SELECT COALESCE(SUM(remaining_weight_kg), 0) as total FROM batches WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')`,
      [parseInt(bay_id)]
    );

    if (loadRow.total + weight > bay.capacity_kg) {
      req.flash('error', `⚠️ Not enough room! ${bay.bay_code} can only hold ${bay.capacity_kg - loadRow.total} kg more.`);
      return res.redirect('/batches/new');
    }

    const expiryDate = calculateExpiryDate(date_received, crop.standard_shelf_life_days, moisture, crop.max_safe_moisture_percentage);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    let status = 'Fresh';
    if (daysUntilExpiry < 0) status = 'Spoiled';
    else if (daysUntilExpiry <= 7) status = 'Priority';
    else if (daysUntilExpiry <= 14) status = 'Warning';

    await dbRun(
      `INSERT INTO batches (crop_id, bay_id, initial_weight_kg, remaining_weight_kg, moisture_content, date_received, estimated_expiry_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [parseInt(crop_id), parseInt(bay_id), weight, weight, moisture, date_received, expiryDate, status]
    );
    await dbRun(`UPDATE storage_bays SET status = 'Occupied' WHERE bay_id = ?`, [parseInt(bay_id)]);

    let msg = `✅ Successfully registered ${weight} kg of ${crop.crop_name} in ${bay.bay_code}!`;
    if (moisture > crop.max_safe_moisture_percentage) {
      msg += ` ⚠️ WARNING: Moisture (${moisture}%) is above the safe limit (${crop.max_safe_moisture_percentage}%). Shelf life has been reduced.`;
    }
    msg += ` Estimated safe until: ${expiryDate}`;

    req.flash('success', msg);
    res.redirect('/batches');
  } catch (err) {
    console.error('Create batch error:', err);
    req.flash('error', '⚠️ Something went wrong. Please try again.');
    res.redirect('/batches/new');
  }
});

// POST /batches/:id/spoiled — Mark batch as spoiled
router.post('/:id/spoiled', async (req, res) => {
  try {
    const batchId = parseInt(req.params.id);
    const batch = await dbGet(`
      SELECT b.*, c.crop_name, sb.bay_code FROM batches b
      JOIN crops c ON b.crop_id = c.crop_id
      JOIN storage_bays sb ON b.bay_id = sb.bay_id
      WHERE b.batch_id = ?
    `, [batchId]);

    if (!batch) {
      req.flash('error', '⚠️ Batch not found.');
      return res.redirect('/batches');
    }

    await dbRun(`UPDATE batches SET status = 'Spoiled' WHERE batch_id = ?`, [batchId]);

    const remaining = await dbGet(
      `SELECT COUNT(*) as count FROM batches WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')`,
      [batch.bay_id]
    );
    if (remaining.count === 0) {
      await dbRun(`UPDATE storage_bays SET status = 'Available' WHERE bay_id = ?`, [batch.bay_id]);
    }

    req.flash('success', `🔴 ${batch.crop_name} batch in ${batch.bay_code} has been marked as SPOILED.`);
    res.redirect('/batches');
  } catch (err) {
    console.error('Spoil batch error:', err);
    req.flash('error', '⚠️ Something went wrong.');
    res.redirect('/batches');
  }
});

module.exports = router;
