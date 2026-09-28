// ============================================================
// Batches Routes — Harvest Entry & Batch Management
// ============================================================

const express = require('express');
const router = express.Router();
const { getDb, calculateExpiryDate } = require('../database');

// ============================================================
// GET /batches — List all batches
// ============================================================
router.get('/', (req, res) => {
  const db = getDb();
  const statusFilter = req.query.status || 'all';

  let query = `
    SELECT b.*, c.crop_name, sb.bay_code,
      CAST(julianday(b.estimated_expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
  `;

  if (statusFilter !== 'all') {
    query += ` WHERE b.status = ?`;
    query += ` ORDER BY b.estimated_expiry_date ASC`;
    const batches = db.prepare(query).all(statusFilter);
    res.render('batch-list', { title: 'All Crop Batches — Bantay Pananim', batches, statusFilter });
  } else {
    query += ` ORDER BY b.estimated_expiry_date ASC`;
    const batches = db.prepare(query).all();
    res.render('batch-list', { title: 'All Crop Batches — Bantay Pananim', batches, statusFilter });
  }
});

// ============================================================
// GET /batches/new — Show harvest entry form
// ============================================================
router.get('/new', (req, res) => {
  const db = getDb();
  const crops = db.prepare('SELECT * FROM crops ORDER BY crop_name').all();
  const bays = db.prepare(`
    SELECT * FROM storage_bays WHERE status IN ('Available', 'Occupied')
    ORDER BY bay_code
  `).all();

  res.render('batch-form', {
    title: 'Register New Crop Harvest — Bantay Pananim',
    crops,
    bays,
  });
});

// ============================================================
// POST /batches — Create new batch
// ============================================================
router.post('/', (req, res) => {
  const db = getDb();
  const { crop_id, bay_id, initial_weight_kg, moisture_content, date_received } = req.body;

  // Validate inputs
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

  // Get crop details for expiry calculation
  const crop = db.prepare('SELECT * FROM crops WHERE crop_id = ?').get(parseInt(crop_id));
  if (!crop) {
    req.flash('error', '⚠️ Selected crop type not found.');
    return res.redirect('/batches/new');
  }

  // Check bay capacity
  const bay = db.prepare('SELECT * FROM storage_bays WHERE bay_id = ?').get(parseInt(bay_id));
  if (!bay) {
    req.flash('error', '⚠️ Selected storage room not found.');
    return res.redirect('/batches/new');
  }

  const currentLoad = db.prepare(`
    SELECT COALESCE(SUM(remaining_weight_kg), 0) as total
    FROM batches WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')
  `).get(parseInt(bay_id));

  if (currentLoad.total + weight > bay.capacity_kg) {
    req.flash('error', `⚠️ Not enough room! ${bay.bay_code} can only hold ${bay.capacity_kg - currentLoad.total} kg more.`);
    return res.redirect('/batches/new');
  }

  // Calculate expiry date
  const expiryDate = calculateExpiryDate(
    date_received,
    crop.standard_shelf_life_days,
    moisture,
    crop.max_safe_moisture_percentage
  );

  // Determine initial status
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  let status = 'Fresh';
  if (daysUntilExpiry < 0) status = 'Spoiled';
  else if (daysUntilExpiry <= 7) status = 'Priority';
  else if (daysUntilExpiry <= 14) status = 'Warning';

  // Insert batch
  db.prepare(`
    INSERT INTO batches (crop_id, bay_id, initial_weight_kg, remaining_weight_kg, moisture_content, date_received, estimated_expiry_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(parseInt(crop_id), parseInt(bay_id), weight, weight, moisture, date_received, expiryDate, status);

  // Update bay status to Occupied
  db.prepare(`UPDATE storage_bays SET status = 'Occupied' WHERE bay_id = ?`).run(parseInt(bay_id));

  // Moisture warning
  let msg = `✅ Successfully registered ${weight} kg of ${crop.crop_name} in ${bay.bay_code}!`;
  if (moisture > crop.max_safe_moisture_percentage) {
    msg += ` ⚠️ WARNING: Moisture level (${moisture}%) is above the safe limit (${crop.max_safe_moisture_percentage}%). Shelf life has been reduced.`;
  }
  msg += ` Estimated safe until: ${expiryDate}`;

  req.flash('success', msg);
  res.redirect('/batches');
});

// ============================================================
// POST /batches/:id/spoiled — Mark batch as spoiled
// ============================================================
router.post('/:id/spoiled', (req, res) => {
  const db = getDb();
  const batchId = parseInt(req.params.id);

  const batch = db.prepare(`
    SELECT b.*, c.crop_name, sb.bay_code
    FROM batches b
    JOIN crops c ON b.crop_id = c.crop_id
    JOIN storage_bays sb ON b.bay_id = sb.bay_id
    WHERE b.batch_id = ?
  `).get(batchId);

  if (!batch) {
    req.flash('error', '⚠️ Batch not found.');
    return res.redirect('/batches');
  }

  db.prepare(`UPDATE batches SET status = 'Spoiled' WHERE batch_id = ?`).run(batchId);

  // Check if bay should be set to Available
  const remainingInBay = db.prepare(`
    SELECT COUNT(*) as count FROM batches
    WHERE bay_id = ? AND status NOT IN ('Fulfilled', 'Spoiled')
  `).get(batch.bay_id);

  if (remainingInBay.count === 0) {
    db.prepare(`UPDATE storage_bays SET status = 'Available' WHERE bay_id = ?`).run(batch.bay_id);
  }

  req.flash('success', `🔴 ${batch.crop_name} batch in ${batch.bay_code} has been marked as SPOILED.`);
  res.redirect('/batches');
});

module.exports = router;
