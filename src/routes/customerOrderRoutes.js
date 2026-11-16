const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const SystemSettings = require('../models/SystemSettings');
const { protectCustomer } = require('../middleware/authMiddleware');

// Initialize Razorpay client with User's credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_6kz5nGEzi8uXRw',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'SMtig3JkAqFP7nIMpODyyuAL',
});

// @route   POST /api/customer/orders/create-razorpay-order
// @desc    Create Razorpay Order ID for Online Payment
// @access  Protected (Customer)
router.post('/create-razorpay-order', protectCustomer, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const options = {
      amount: Math.round(Number(amount) * 100), // amount in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now().toString().slice(-8)}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_6kz5nGEzi8uXRw',
      order: razorpayOrder,
    });
  } catch (error) {
    console.error('[Razorpay Create Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate Razorpay payment',
      error: error.message,
    });
  }
});

// @route   POST /api/customer/orders/place
// @desc    Place a new construction material order (Flipkart style checkout)
// @access  Protected (Customer)
router.post('/place', protectCustomer, async (req, res) => {
  try {
    const {
      vendorId,
      vendorName,
      category,
      items,
      totalAmount,
      deliveryCharge,
      paymentMode,
      siteAddress,
      deliveryLandmark,
      distanceKm,
      orderNotes,
      paymentId,
      razorpayOrderId,
    } = req.body;

    if (!vendorName || !items || !totalAmount || !siteAddress) {
      return res.status(400).json({
        success: false,
        message: 'Missing required order fields (vendor, items, totalAmount, siteAddress)',
      });
    }

    // Generate unique Flipkart style Order ID (e.g. OD89240182)
    const orderId = `OD${Date.now().toString().slice(-8)}`;

    // Generate 4-digit customer delivery OTP (e.g. 4826)
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // Verify vendor details if vendorId provided
    let verifiedVendorId = vendorId;
    if (!verifiedVendorId) {
      const v = await Vendor.findOne({ businessName: vendorName });
      if (v) verifiedVendorId = v._id;
    }

    // Dynamic Commission Calculation:
    // 1. Check if Category has a specific commission rate configured
    // 2. Otherwise check Global SystemSettings default commission rate
    // 3. Fallback to 5% default
    let calculatedCommission = 0;
    const materialCost = Number(totalAmount) - (Number(deliveryCharge) || 0); // Commission is charged on material cost
    const baseAmountForCommission = materialCost > 0 ? materialCost : Number(totalAmount);

    let commissionRate = 5; // default 5%
    let isPercentage = true;

    try {
      if (category) {
        const cat = await Category.findOne({
          $or: [
            { _id: category },
            { name: new RegExp(`^${category}$`, 'i') },
          ],
        });
        if (cat && cat.commissionRate != null) {
          commissionRate = Number(cat.commissionRate);
          isPercentage = cat.commissionType !== 'fixed';
        }
      }

      if (commissionRate === 5) {
        const settings = await SystemSettings.findOne();
        if (settings && settings.defaultCommissionRate != null) {
          commissionRate = Number(settings.defaultCommissionRate);
          isPercentage = settings.commissionType !== 'fixed';
        }
      }
    } catch (_) {}

    if (isPercentage) {
      calculatedCommission = Math.round((baseAmountForCommission * commissionRate) / 100);
    } else {
      calculatedCommission = Math.round(commissionRate);
    }

    const newOrder = await Order.create({
      orderId,
      customer: req.customer.fullName || 'Valued Customer',
      customerPhone: req.customer.mobileNumber,
      customerId: req.customer._id,
      vendor: vendorName,
      vendorId: verifiedVendorId,
      category: category || '',
      items,
      totalAmount: Number(totalAmount),
      deliveryCharge: Number(deliveryCharge) || 0,
      adminCommission: calculatedCommission,
      paymentMode: paymentMode || 'COD',
      paymentId: paymentId || '',
      razorpayOrderId: razorpayOrderId || '',
      paymentStatus: paymentMode === 'Online' ? 'Completed' : 'Pending',
      status: 'Pending',
      driver: 'Not Assigned',
      deliveryOtp,
      siteAddress,
      deliveryLandmark: deliveryLandmark || '',
      distanceKm: Number(distanceKm) || 0,
      orderNotes: orderNotes || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully! Delivery OTP generated.',
      order: newOrder,
    });
  } catch (error) {
    console.error('[Place Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: error.message,
    });
  }
});

// @route   GET /api/customer/orders
// @desc    Get all orders placed by the logged-in customer (strictly isolated by customerId / phone)
// @access  Protected (Customer)
router.get('/', protectCustomer, async (req, res) => {
  try {
    const customerId = req.customer._id;
    const cleanPhone = req.customer.mobileNumber;

    const orders = await Order.find({
      $or: [{ customerId }, { customerPhone: cleanPhone }],
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[Customer Orders Fetch Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/customer/orders/addresses
// @desc    Get customer's saved construction site addresses
// @access  Protected (Customer)
router.get('/addresses', protectCustomer, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer._id);
    return res.status(200).json({
      success: true,
      addresses: customer.savedAddresses || [],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/customer/orders/addresses
// @desc    Add a new site address for customer
// @access  Protected (Customer)
router.post('/addresses', protectCustomer, async (req, res) => {
  try {
    const { tag, contactName, contactPhone, fullAddress, landmark, city, pincode, isDefault } = req.body;

    if (!fullAddress) {
      return res.status(400).json({ success: false, message: 'Full site address is required' });
    }

    const customer = await Customer.findById(req.customer._id);

    if (isDefault) {
      customer.savedAddresses.forEach((a) => (a.isDefault = false));
    }

    customer.savedAddresses.push({
      tag: tag || 'Site Address',
      contactName: contactName || customer.fullName,
      contactPhone: contactPhone || customer.mobileNumber,
      fullAddress,
      landmark: landmark || '',
      city: city || 'Lucknow',
      pincode: pincode || '',
      isDefault: isDefault || customer.savedAddresses.length === 0,
    });

    await customer.save();

    return res.status(201).json({
      success: true,
      message: 'Site address saved successfully!',
      addresses: customer.savedAddresses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

