const express = require('express');
const router = express.Router();
const { protectAdmin } = require('../middleware/authMiddleware');
const {
  getDashboardStats,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getVendors,
  createVendor,
  updateVendorStatus,
  deleteVendor,
  getVendorDetail360,
  getOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  getRevenueCommissionStats,
  getSettings,
  updateSettings,
  getDrivers,
  createDriver,
  updateDriverStatus,
  deleteDriver,
  getDriverDetail360,
} = require('../controllers/adminPanelController');

// All panel routes are protected with protectAdmin
router.use(protectAdmin);

// Dashboard
router.get('/dashboard-stats', getDashboardStats);

// Revenue & Commissions
router.get('/revenue-commission', getRevenueCommissionStats);

// Platform Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

// Drivers / Delivery Agents
router.get('/drivers', getDrivers);
router.get('/drivers/:id/detail360', getDriverDetail360);
router.post('/drivers', createDriver);
router.put('/drivers/:id/status', updateDriverStatus);
router.delete('/drivers/:id', deleteDriver);

// Categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Vendors
router.get('/vendors', getVendors);
router.get('/vendors/:id/detail360', getVendorDetail360);
router.post('/vendors', createVendor);
router.put('/vendors/:id/status', updateVendorStatus);
router.delete('/vendors/:id', deleteVendor);

// Orders
router.get('/orders', getOrders);
router.post('/orders', createOrder);
router.put('/orders/:id/status', updateOrderStatus);
router.delete('/orders/:id', deleteOrder);

module.exports = router;

