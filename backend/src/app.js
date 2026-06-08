const express = require('express');
const cors = require('cors');
const db = require('./config/db');

const authRoutes = require('./routes/auth');
const categoriesRoutes = require('./routes/categories');
const itemsRoutes = require('./routes/items');
const vendorsRoutes = require('./routes/vendors');
const customersRoutes = require('./routes/customers');
const purchaseOrdersRoutes = require('./routes/purchase-orders');
const inwardRoutes = require('./routes/inward');
const outwardRoutes = require('./routes/outward');
const stockTransfersRoutes = require('./routes/stock-transfers');
const batchesRoutes = require('./routes/batches');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', require('express').static(require('path').join(__dirname, '../uploads')));

// Health check — must be before all other routes
app.get('/api/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime(), timestamp: new Date() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/inward', inwardRoutes);
app.use('/api/outward', outwardRoutes);
app.use('/api/stock-transfers', stockTransfersRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/audit-log', require('./routes/audit-log'));
app.use('/api/normalize', require('./routes/normalize'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/custom-fields', require('./routes/custom-fields'));
app.use('/api/system', require('./routes/system'));
app.use('/api/intelligence', require('./routes/intelligence'));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

module.exports = app;
