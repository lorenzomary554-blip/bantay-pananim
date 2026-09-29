// ============================================================
// Bantay Pananim v1.0 — Database Layer
// SQLite database setup, schema creation, and seed data
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');

// On Render.com the persistent disk is mounted at /data
// Locally it sits next to server.js
const DB_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DB_PATH = path.join(DB_DIR, 'bantay_pananim.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// ============================================================
// Schema Creation
// ============================================================
function createTables() {
  const conn = getDb();

  conn.exec(`
    CREATE TABLE IF NOT EXISTS crops (
      crop_id INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_name TEXT NOT NULL UNIQUE,
      standard_shelf_life_days INTEGER NOT NULL,
      max_safe_moisture_percentage REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_bays (
      bay_id INTEGER PRIMARY KEY AUTOINCREMENT,
      bay_code TEXT NOT NULL UNIQUE,
      capacity_kg REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Available'
        CHECK(status IN ('Available', 'Occupied', 'Maintenance'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
      crop_id INTEGER NOT NULL,
      bay_id INTEGER NOT NULL,
      initial_weight_kg REAL NOT NULL,
      remaining_weight_kg REAL NOT NULL,
      moisture_content REAL,
      date_received TEXT NOT NULL,
      estimated_expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Fresh'
        CHECK(status IN ('Fresh', 'Warning', 'Priority', 'Fulfilled', 'Spoiled')),
      FOREIGN KEY (crop_id) REFERENCES crops(crop_id),
      FOREIGN KEY (bay_id) REFERENCES storage_bays(bay_id)
    );

    CREATE TABLE IF NOT EXISTS dispatch_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      quantity_dispatched_kg REAL NOT NULL,
      dispatch_date TEXT NOT NULL,
      buyer_name TEXT,
      override_reason TEXT,
      FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
    );
  `);
}

// ============================================================
// Expiry Calculation Engine
// ============================================================
function calculateExpiryDate(dateReceived, shelfLifeDays, moistureContent, maxSafeMoisture) {
  const moistureRatio = moistureContent / maxSafeMoisture;
  let multiplier;

  if (moistureRatio <= 0.8) {
    multiplier = 1.2; // Drier than ideal — longer shelf life
  } else if (moistureRatio <= 1.0) {
    multiplier = 1.0; // Within safe range
  } else if (moistureRatio <= 1.2) {
    multiplier = 0.6; // Slightly over — significantly reduced
  } else {
    multiplier = 0.3; // Dangerously moist — very short shelf life
  }

  const adjustedDays = Math.floor(shelfLifeDays * multiplier);
  const received = new Date(dateReceived);
  received.setDate(received.getDate() + adjustedDays);
  return received.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================================
// Batch Status Updater
// Recalculates status for all active batches based on current date
// ============================================================
function updateAllBatchStatuses() {
  const conn = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeBatches = conn.prepare(`
    SELECT batch_id, estimated_expiry_date, remaining_weight_kg, status
    FROM batches
    WHERE status NOT IN ('Fulfilled', 'Spoiled')
  `).all();

  const updateStmt = conn.prepare(`
    UPDATE batches SET status = ? WHERE batch_id = ?
  `);

  const updateBayStmt = conn.prepare(`
    UPDATE storage_bays SET status = 'Available'
    WHERE bay_id = ? AND NOT EXISTS (
      SELECT 1 FROM batches WHERE bay_id = storage_bays.bay_id
      AND status NOT IN ('Fulfilled', 'Spoiled')
    )
  `);

  const transaction = conn.transaction(() => {
    for (const batch of activeBatches) {
      const expiry = new Date(batch.estimated_expiry_date);
      expiry.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

      let newStatus;
      if (batch.remaining_weight_kg <= 0) {
        newStatus = 'Fulfilled';
      } else if (daysUntilExpiry < 0) {
        newStatus = 'Spoiled';
      } else if (daysUntilExpiry <= 7) {
        newStatus = 'Priority';
      } else if (daysUntilExpiry <= 14) {
        newStatus = 'Warning';
      } else {
        newStatus = 'Fresh';
      }

      if (newStatus !== batch.status) {
        updateStmt.run(newStatus, batch.batch_id);
      }
    }
  });

  transaction();
}

// ============================================================
// Seed Data
// ============================================================
function seedData() {
  const conn = getDb();

  // Check if data already exists
  const cropCount = conn.prepare('SELECT COUNT(*) as count FROM crops').get();
  if (cropCount.count > 0) return;

  // --- Seed Crops ---
  const insertCrop = conn.prepare(`
    INSERT INTO crops (crop_name, standard_shelf_life_days, max_safe_moisture_percentage)
    VALUES (?, ?, ?)
  `);

  const crops = [
    ['Rice (Bigas)', 90, 14.0],
    ['Corn (Mais)', 120, 13.0],
    ['Mungbean (Monggo)', 180, 12.0],
    ['Dried Cassava (Kamoteng Kahoy)', 60, 15.0],
    ['Peanuts (Mani)', 150, 9.0],
  ];

  for (const crop of crops) {
    insertCrop.run(...crop);
  }

  // --- Seed Storage Bays ---
  const insertBay = conn.prepare(`
    INSERT INTO storage_bays (bay_code, capacity_kg, status)
    VALUES (?, ?, ?)
  `);

  const bays = [
    ['Room A1', 5000, 'Occupied'],
    ['Room A2', 5000, 'Occupied'],
    ['Room A3', 3000, 'Available'],
    ['Room A4', 3000, 'Maintenance'],
    ['Room B1', 8000, 'Occupied'],
    ['Room B2', 8000, 'Occupied'],
    ['Room B3', 4000, 'Available'],
    ['Room B4', 4000, 'Occupied'],
  ];

  for (const bay of bays) {
    insertBay.run(...bay);
  }

  // --- Seed Batches ---
  const insertBatch = conn.prepare(`
    INSERT INTO batches (crop_id, bay_id, initial_weight_kg, remaining_weight_kg, moisture_content, date_received, estimated_expiry_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date();

  // Helper to format date offset
  function dateOffset(days) {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Batch 1: Rice in Room A1 — received 70 days ago, expiry in ~20 days → Fresh
  const rice = crops[0];
  const batch1Received = dateOffset(-70);
  const batch1Expiry = calculateExpiryDate(batch1Received, rice[1], 12.0, rice[2]);
  insertBatch.run(1, 1, 3000, 2500, 12.0, batch1Received, batch1Expiry, 'Fresh');

  // Batch 2: Rice in Room A2 — received 80 days ago, high moisture → Warning/Priority
  const batch2Received = dateOffset(-80);
  const batch2Expiry = calculateExpiryDate(batch2Received, rice[1], 13.5, rice[2]);
  insertBatch.run(1, 2, 2000, 1800, 13.5, batch2Received, batch2Expiry, 'Warning');

  // Batch 3: Corn in Room B1 — received 40 days ago → Fresh
  const corn = crops[1];
  const batch3Received = dateOffset(-40);
  const batch3Expiry = calculateExpiryDate(batch3Received, corn[1], 11.0, corn[2]);
  insertBatch.run(2, 5, 5000, 5000, 11.0, batch3Received, batch3Expiry, 'Fresh');

  // Batch 4: Mungbean in Room B2 — received 60 days ago → Fresh
  const mungbean = crops[2];
  const batch4Received = dateOffset(-60);
  const batch4Expiry = calculateExpiryDate(batch4Received, mungbean[1], 10.0, mungbean[2]);
  insertBatch.run(3, 6, 2000, 2000, 10.0, batch4Received, batch4Expiry, 'Fresh');

  // Batch 5: Dried Cassava in Room B4 — received 55 days ago, normal moisture → Priority
  const cassava = crops[3];
  const batch5Received = dateOffset(-55);
  const batch5Expiry = calculateExpiryDate(batch5Received, cassava[1], 14.0, cassava[2]);
  insertBatch.run(4, 8, 1500, 1200, 14.0, batch5Received, batch5Expiry, 'Priority');

  // Batch 6: Peanuts in Room A1 — received 20 days ago → Fresh (shares room with batch 1)
  const peanuts = crops[4];
  const batch6Received = dateOffset(-20);
  const batch6Expiry = calculateExpiryDate(batch6Received, peanuts[1], 7.5, peanuts[2]);
  insertBatch.run(5, 1, 800, 800, 7.5, batch6Received, batch6Expiry, 'Fresh');

  // --- Seed a few dispatch logs ---
  const insertDispatch = conn.prepare(`
    INSERT INTO dispatch_logs (batch_id, quantity_dispatched_kg, dispatch_date, buyer_name, override_reason)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertDispatch.run(1, 500, dateOffset(-10), 'Juan Dela Cruz', null);

  // Now update statuses based on actual dates
  updateAllBatchStatuses();
}

// ============================================================
// Initialize
// ============================================================
function initializeDatabase() {
  createTables();
  seedData();
}

module.exports = {
  getDb,
  initializeDatabase,
  calculateExpiryDate,
  updateAllBatchStatuses,
};
