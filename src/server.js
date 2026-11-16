const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Connect to Database
const connectDB = require('./config/db');
connectDB();

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // Allow frontend development port & mobile apps
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded media files publicly (App-wise & Category-wise)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Contract Bazar Backend API',
    time: new Date().toISOString(),
  });
});

// Public Category Route (For CustomerApp & VendorApp)
const { getPublicCategories } = require('./controllers/categoryController');
app.get('/api/categories', getPublicCategories);

// File Upload Routes (Vendor Documents, KYC, Product Images)
app.use('/api/upload', require('./routes/uploadRoutes'));

// Vendor Authentication & Registration Routes
app.use('/api/vendor/auth', require('./routes/vendorAuthRoutes'));

// Customer Authentication & Onboarding Routes
app.use('/api/customer/auth', require('./routes/customerAuthRoutes'));

// Customer Orders & Address Routes (Strictly Customer Isolated)
app.use('/api/customer/orders', require('./routes/customerOrderRoutes'));

// Customer Public Catalog & Vendor Browsing Routes
app.use('/api/customer/catalog', require('./routes/customerCatalogRoutes'));

// Vendor Specific Order Management (Incoming, Accept, Dispatch, Delivered - strictly vendor isolated)
app.use('/api/vendor/orders', require('./routes/vendorOrderRoutes'));

// Vendor Catalog & Rates Management (strictly vendor isolated)
app.use('/api/vendor/products', require('./routes/vendorProductRoutes'));

// Vendor Fleet & Driver Management (strictly vendor isolated)
app.use('/api/vendor/drivers', require('./routes/vendorDriverRoutes'));

// Vendor Store Settings & Delivery Policy Management
app.use('/api/vendor/settings', require('./routes/vendorSettingsRoutes'));

// Delivery App Authentication & Order Dispatch Routes
app.use('/api/delivery/auth', require('./routes/deliveryAuthRoutes'));

// Admin Routes
app.use('/api/admin/auth', require('./routes/adminAuthRoutes'));
app.use('/api/admin/panel', require('./routes/adminPanelRoutes'));

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Contract Bazar Backend Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🛡️  Admin Auth: http://localhost:${PORT}/api/admin/auth/login`);
  console.log(`===============================================`);
});

module.exports = app;

