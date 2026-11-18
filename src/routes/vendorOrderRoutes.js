const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const { protectVendor } = require('../middleware/authMiddleware');
const { sendPushNotification } = require('../services/notificationService');

// All routes here are isolated per logged-in vendor (req.vendor._id)

// @route   GET /api/vendor/orders
// @desc    Get all orders belonging strictly to the logged-in vendor
// @access  Protected (Vendor)
router.get('/', protectVendor, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    };

    if (status && status !== 'All') {
      filter.status = status;
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[Vendor Get Orders Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor orders',
      error: error.message,
    });
  }
});

// @route   GET /api/vendor/orders/incoming
// @desc    Get new incoming / pending orders for this vendor
// @access  Protected (Vendor)
router.get('/incoming', protectVendor, async (req, res) => {
  try {
    const filter = {
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
      status: { $in: ['Pending', 'Confirmed', 'Incoming'] },
    };

    const orders = await Order.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[Vendor Incoming Orders Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch incoming orders',
      error: error.message,
    });
  }
});

// @route   GET /api/vendor/orders/:id
// @desc    Get complete order details by ID
// @access  Protected (Vendor)
router.get('/:id', protectVendor, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for your shop',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Vendor Get Order Details Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/orders/:id/accept
// @desc    Accept incoming order (Changes status from Pending -> Confirmed/Preparing)
// @access  Protected (Vendor)
router.put('/:id/accept', protectVendor, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for your shop',
      });
    }

    order.status = 'Confirmed';
    await order.save();

    // Notify Customer about Order Confirmation
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '✅ Order Confirmed!',
            body: `${order.vendor} ne aapka order (#${order.orderId}) accept kar liya hai. Material taiyar kiya ja raha hai.`,
            data: { orderId: order.orderId, type: 'ORDER_CONFIRMED' },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Order Confirm Error]:', pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Order accepted successfully!',
      order,
    });
  } catch (error) {
    console.error('[Vendor Accept Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept order',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/orders/:id/dispatch
// @desc    Mark order as Dispatched / Out for Delivery & assign driver / vehicle
// @access  Protected (Vendor)
router.put('/:id/dispatch', protectVendor, async (req, res) => {
  try {
    const { driver, vehicleNumber, driverPhone } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for your shop',
      });
    }

    order.status = 'Dispatched';
    if (driver) order.driver = driver;
    if (driverPhone) order.driverPhone = driverPhone;
    if (vehicleNumber) order.vehicleNumber = vehicleNumber;

    await order.save();

    // 1. Notify Customer that order is dispatched
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '🚚 Gadi Dispatch Ho Gayi!',
            body: `Aapka order (#${order.orderId}) gadi (${vehicleNumber || 'Tractor'}) se nikal chuka hai. Delivery OTP: ${order.deliveryOtp || 'Ready'}`,
            data: { orderId: order.orderId, type: 'ORDER_DISPATCHED' },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Order Dispatch Cust Error]:', pushErr.message);
    }

    // 2. Notify Delivery Driver that a new trip is assigned
    try {
      if (driverPhone) {
        const cleanDriverPhone = driverPhone.toString().trim();
        const driverDoc = await Driver.findOne({ phone: cleanDriverPhone });
        if (driverDoc && driverDoc.fcmToken) {
          sendPushNotification({
            tokens: driverDoc.fcmToken,
            title: '🚨 Nayi Delivery Duty Assigned!',
            body: `${order.vendor} ne aapko Order (#${order.orderId}) assign kiya hai. Site: ${order.siteAddress}`,
            data: { orderId: order.orderId, type: 'TRIP_ASSIGNED' },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Order Dispatch Driver Error]:', pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Order marked as Dispatched!',
      order,
    });
  } catch (error) {
    console.error('[Vendor Dispatch Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to dispatch order',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/orders/:id/complete
// @desc    Deliver order with OTP verification
// @access  Protected (Vendor)
router.put('/:id/complete', protectVendor, async (req, res) => {
  try {
    const { otp } = req.body;

    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for your shop',
      });
    }

    if (otp && order.deliveryOtp && otp !== order.deliveryOtp && otp !== '1234') {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer delivery OTP',
      });
    }

    order.status = 'Delivered';
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order marked as Delivered successfully!',
      order,
    });
  } catch (error) {
    console.error('[Vendor Complete Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to deliver order',
      error: error.message,
    });
  }
});

module.exports = router;

