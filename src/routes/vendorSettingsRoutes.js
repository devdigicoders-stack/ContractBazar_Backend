const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Driver = require('../models/Driver');
const { protectVendor } = require('../middleware/authMiddleware');

// @route   GET /api/vendor/settings/profile
// @desc    Get complete logged-in vendor profile, settings & store status
// @access  Protected (Vendor)
router.get('/profile', protectVendor, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id).select('-password');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    return res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    console.error('[Get Vendor Profile Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/vendor/settings/delivery-policy
// @desc    Update Vendor Free Delivery Radius and Per-KM Charge
// @access  Protected (Vendor)
router.put('/delivery-policy', protectVendor, async (req, res) => {
  try {
    const { freeDeliveryKm, perKmCharge } = req.body;

    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (freeDeliveryKm !== undefined) vendor.freeDeliveryKm = Number(freeDeliveryKm);
    if (perKmCharge !== undefined) vendor.perKmCharge = Number(perKmCharge);

    await vendor.save();

    return res.status(200).json({
      success: true,
      message: 'Delivery policy updated successfully!',
      freeDeliveryKm: vendor.freeDeliveryKm,
      perKmCharge: vendor.perKmCharge,
    });
  } catch (error) {
    console.error('[Update Delivery Policy Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/vendor/settings/store-status
// @desc    Toggle Store Open / Closed status (Online / Offline)
// @access  Protected (Vendor)
router.put('/store-status', protectVendor, async (req, res) => {
  try {
    const { isStoreOnline } = req.body;

    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (isStoreOnline !== undefined) {
      vendor.isStoreOnline = Boolean(isStoreOnline);
    }

    await vendor.save();

    return res.status(200).json({
      success: true,
      message: `Store is now ${vendor.isStoreOnline ? 'Open / Online' : 'Closed / Offline'}`,
      isStoreOnline: vendor.isStoreOnline,
    });
  } catch (error) {
    console.error('[Update Store Status Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/vendor/settings/bank-payouts
// @desc    Get vendor bank details & earnings breakdown
// @access  Protected (Vendor)
router.get('/bank-payouts', protectVendor, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const orderFilter = {
      $or: [{ vendorId: vendor._id }, { vendor: vendor.businessName }],
    };

    const orders = await Order.find(orderFilter);
    const deliveredOrders = orders.filter((o) => o.status === 'Delivered');

    // Calculate Online vs COD breakdown
    let totalOnline = 0;
    let totalCOD = 0;
    let totalGross = 0;

    deliveredOrders.forEach((o) => {
      const amt = o.totalAmount || 0;
      totalGross += amt;
      if (o.paymentMode === 'Online' || o.paymentMode === 'UPI') {
        totalOnline += amt;
      } else {
        totalCOD += amt;
      }
    });

    return res.status(200).json({
      success: true,
      bankDetails: vendor.bankDetails || {},
      financials: {
        totalGrossEarnings: totalGross,
        totalOnlineEarnings: totalOnline,
        totalCodeEarnings: totalCOD,
        pendingPayout: totalOnline * 0.95, // 95% payout after platform fee placeholder
        settledPayout: vendor.settledPayout || 0,
        deliveredOrdersCount: deliveredOrders.length,
      },
      recentSettlements: [],
    });
  } catch (error) {
    console.error('[Get Bank Payouts Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/vendor/settings/bank-details
// @desc    Update Vendor Bank Account & UPI Details
// @access  Protected (Vendor)
router.put('/bank-details', protectVendor, async (req, res) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    vendor.bankDetails = {
      accountHolderName: accountHolderName || vendor.bankDetails?.accountHolderName || '',
      accountNumber: accountNumber || vendor.bankDetails?.accountNumber || '',
      ifscCode: ifscCode ? ifscCode.toUpperCase().trim() : vendor.bankDetails?.ifscCode || '',
      bankName: bankName || vendor.bankDetails?.bankName || '',
      upiId: upiId ? upiId.toLowerCase().trim() : vendor.bankDetails?.upiId || '',
      isVerified: false, // will be verified by admin
    };

    await vendor.save();

    return res.status(200).json({
      success: true,
      message: 'Bank details saved successfully! Verification pending by admin.',
      bankDetails: vendor.bankDetails,
    });
  } catch (error) {
    console.error('[Update Bank Details Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/vendor/settings/dashboard-summary
// @desc    Get dashboard metrics: Total orders, today orders, delivered, total earnings, active products, drivers
// @access  Protected (Vendor)
router.get('/dashboard-summary', protectVendor, async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const vendorName = req.vendor.businessName;

    const orderFilter = {
      $or: [{ vendorId }, { vendor: vendorName }],
    };

    const orders = await Order.find(orderFilter);

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((o) => o.status === 'Delivered');
    const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Confirmed');
    const dispatchedOrders = orders.filter((o) => o.status === 'Dispatched');

    // Total gross sales from delivered orders
    const totalEarnings = deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const activeProducts = await Product.countDocuments({ vendorId, isActive: true });
    const totalDrivers = await Driver.countDocuments({ vendorId });

    return res.status(200).json({
      success: true,
      summary: {
        totalOrders,
        pendingOrders: pendingOrders.length,
        dispatchedOrders: dispatchedOrders.length,
        deliveredOrders: deliveredOrders.length,
        totalEarnings,
        activeProducts,
        totalDrivers,
      },
    });
  } catch (error) {
    console.error('[Dashboard Summary Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

