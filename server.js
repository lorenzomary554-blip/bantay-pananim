// ============================================================
// Bantay Pananim v1.0 — Express Server Entry Point
// ============================================================

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const { initializeDatabase, updateAllBatchStatuses } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Initialize Database
// ============================================================
initializeDatabase();

// ============================================================
// View Engine
// ============================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// Middleware
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session & Flash Messages
app.use(session({
  secret: 'bantay-pananim-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(flash());

// Make flash messages available to all views
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPath = req.path;
  next();
});

// Update batch statuses on every request (lightweight with SQLite)
app.use((req, res, next) => {
  // Only update on page loads, not static assets
  if (!req.path.startsWith('/css') && !req.path.startsWith('/js') && !req.path.startsWith('/img')) {
    updateAllBatchStatuses();
  }
  next();
});

// ============================================================
// Routes
// ============================================================
const dashboardRoutes = require('./routes/dashboard');
const batchRoutes = require('./routes/batches');
const bayRoutes = require('./routes/bays');
const dispatchRoutes = require('./routes/dispatch');
const apiRoutes = require('./routes/api');

app.use('/', dashboardRoutes);
app.use('/batches', batchRoutes);
app.use('/storage-rooms', bayRoutes);
app.use('/dispatch', dispatchRoutes);
app.use('/api', apiRoutes);

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found — Bantay Pananim',
    currentPath: req.path
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🌾 ═══════════════════════════════════════════════`);
  console.log(`   Bantay Pananim v1.0 is running!`);
  console.log(`   Open your browser at: http://localhost:${PORT}`);
  console.log(`🌾 ═══════════════════════════════════════════════\n`);
});

module.exports = app;
