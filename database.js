// ============================================================
// Bantay Pananim v1.0 — Database Layer
// Uses 'sqlite3' package (cross-platform, works on Render.com)
// ============================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// On Render.com the persistent disk is mounted at /data
// Locally it sits next to server.js
const DB_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const DB_PATH = path.join(DB_DIR, 'bantay_pananim.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('DB connection error:', err.message);
    });
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

// ============================================================
// Schema Creation
// ============================================================
function createTables() {
  return new Promise((resolve, reject) => {
    const conn = getDb();
    conn.serialize(() => {
      conn.run(`CREATE TABLE IF NOT EXISTS crops (
        crop_id INTEGER PRIMARY KEY AUTOINCREMENT,
        crop_name TEXT NOT NULL UNIQUE,
        standard_shelf_life_days INTEGER NOT NULL,
        max_safe_moisture_percentage REAL NOT NULL
      )`);

      conn.run(`CREATE TABLE IF NOT EXISTS storage_bays (
        bay_id INTEGER PRIMARY KEY AUTOINCREMENT,
        bay_code TEXT NOT NULL UNIQUE,
        capacity_kg REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Available'
          CHECK(status IN ('Available', 'Occupied', 'Maintenance'))
      )`);

      conn.run(`CREATE TABLE IF NOT EXISTS batches (
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
      )`);

      conn.run(`CREATE TABLE IF NOT EXISTS dispatch_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        quantity_dispatched_kg REAL NOT NULL,
        dispatch_date TEXT NOT NULL,
        buyer_name TEXT,
        override_reason TEXT,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
      )`, resolve);
    });
  });
}

// ============================================================
// Expiry Calculation Engine
// ============================================================
function calculateExpiryDate(dateReceived, shelfLifeDays, moistureContent, maxSafeMoisture) {
  const moistureRatio = moistureContent / maxSafeMoisture;
  let multiplier;

  if (moistureRatio <= 0.8) {
    multiplier = 1.2;
  } else if (moistureRatio <= 1.0) {
    multiplier = 1.0;
  } else if (moistureRatio <= 1.2) {
    multiplier = 0.6;
  } else {
    multiplier = 0.3;
  }

  const adjustedDays = Math.floor(shelfLifeDays * multiplier);
  const received = new Date(dateReceived);
  received.setDate(received.getDate() + adjustedDays);
  return received.toISOString().split('T')[0];
}

// ============================================================
// Synchronous DB helpers using sqlite3 in serialized mode
// These wrap sqlite3 callbacks into sync-like flow via serialize
// ============================================================

// Run a query that returns all rows
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Run a query that returns one row
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Run INSERT/UPDATE/DELETE
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ============================================================
// Batch Status Updater
// ============================================================
function updateAllBatchStatuses() {
  const conn = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  conn.all(
    `SELECT batch_id, estimated_expiry_date, remaining_weight_kg, status
     FROM batches WHERE status NOT IN ('Fulfilled', 'Spoiled')`,
    [],
    (err, batches) => {
      if (err || !batches) return;
      conn.serialize(() => {
        for (const batch of batches) {
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
            conn.run('UPDATE batches SET status = ? WHERE batch_id = ?', [newStatus, batch.batch_id]);
          }
        }
      });
    }
  );
}

// ============================================================
// Seed Data
// ============================================================
async function seedData() {
  const cropCount = await dbGet('SELECT COUNT(*) as count FROM crops');
  if (cropCount && cropCount.count > 0) return;

  const crops = [
    ['Rice (Bigas)', 90, 14.0],
    ['Corn (Mais)', 120, 13.0],
    ['Mungbean (Monggo)', 180, 12.0],
    ['Dried Cassava (Kamoteng Kahoy)', 60, 15.0],
    ['Peanuts (Mani)', 150, 9.0],
  ];

  for (const crop of crops) {
    await dbRun(
      'INSERT OR IGNORE INTO crops (crop_name, standard_shelf_life_days, max_safe_moisture_percentage) VALUES (?, ?, ?)',
      crop
    );
  }

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
    await dbRun(
      'INSERT OR IGNORE INTO storage_bays (bay_code, capacity_kg, status) VALUES (?, ?, ?)',
      bay
    );
  }

  function dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  const batchData = [
    [1, 1, 3000, 2500, 12.0, dateOffset(-70), calculateExpiryDate(dateOffset(-70), 90, 12.0, 14.0), 'Fresh'],
    [1, 2, 2000, 1800, 13.5, dateOffset(-80), calculateExpiryDate(dateOffset(-80), 90, 13.5, 14.0), 'Warning'],
    [2, 5, 5000, 5000, 11.0, dateOffset(-40), calculateExpiryDate(dateOffset(-40), 120, 11.0, 13.0), 'Fresh'],
    [3, 6, 2000, 2000, 10.0, dateOffset(-60), calculateExpiryDate(dateOffset(-60), 180, 10.0, 12.0), 'Fresh'],
    [4, 8, 1500, 1200, 14.0, dateOffset(-55), calculateExpiryDate(dateOffset(-55), 60, 14.0, 15.0), 'Priority'],
    [5, 1, 800, 800, 7.5, dateOffset(-20), calculateExpiryDate(dateOffset(-20), 150, 7.5, 9.0), 'Fresh'],
  ];

  for (const b of batchData) {
    await dbRun(
      `INSERT INTO batches (crop_id, bay_id, initial_weight_kg, remaining_weight_kg, moisture_content,
        date_received, estimated_expiry_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      b
    );
  }

  await dbRun(
    'INSERT INTO dispatch_logs (batch_id, quantity_dispatched_kg, dispatch_date, buyer_name, override_reason) VALUES (?, ?, ?, ?, ?)',
    [1, 500, dateOffset(-10), 'Juan Dela Cruz', null]
  );

  updateAllBatchStatuses();
}

// ============================================================
// Initialize
// ============================================================
async function initializeDatabase() {
  await createTables();
  await seedData();
}

module.exports = {
  getDb,
  dbAll,
  dbGet,
  dbRun,
  initializeDatabase,
  calculateExpiryDate,
  updateAllBatchStatuses,
};
