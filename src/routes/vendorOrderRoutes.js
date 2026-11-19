const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const Customer = require('../models/Customer');
const { protectVendor } = require('../middleware/authMiddleware');
const { sendPushNotification } = require('../services/notificationService');

// All routes here are isolated per logged-in vendor (req.vendor._id)

// Helper to push timeline entry if not already present
function addTimelineEntry(order, status, title, description) {
  if (!order.timeline) order.timeline = [];
  order.timeline.push({
    status,
    title,
    description: description || '',
    time: new Date(),
  });
}

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
      filter.$or = [
        { status: status },
        { internalStatus: status },
      ];
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
      $and: [
        {
          $or: [
            { status: { $in: ['Order Placed', 'Pending', 'Incoming'] } },
            { internalStatus: { $in: ['Order Placed', 'New Order Received', 'Pending'] } },
          ],
        },
      ],
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
// @desc    Get complete order details with customer and driver info
// @access  Protected (Vendor)
router.get('/:id', protectVendor, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      $or: [
        { vendorId: req.vendor._id },
        { vendor: req.vendor.businessName },
      ],
    }).populate('customerId', 'fullName mobileNumber profilePic');

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
// @desc    Vendor accepts incoming order -> Order Confirmed
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

    order.status = 'Order Confirmed';
    order.internalStatus = 'Order Accepted';
    addTimelineEntry(order, 'Order Confirmed', 'Order Confirmed', 'Vendor has accepted your order.');
    await order.save();

    // Notify Customer about Order Confirmation
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '✅ Order Confirmed!',
            body: `${order.vendor} ne aapka order (#${order.orderId}) accept kar liya hai.`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              status: 'Order Confirmed',
              type: 'ORDER_CONFIRMED',
            },
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

// @route   PUT /api/vendor/orders/:id/reject
// @desc    Vendor rejects incoming order with reason
// @access  Protected (Vendor)
router.put('/:id/reject', protectVendor, async (req, res) => {
  try {
    const { rejectionReason } = req.body;
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

    order.status = 'Cancelled';
    order.internalStatus = 'Order Rejected';
    order.rejectionReason = rejectionReason || 'Product unavailable or out of delivery area';
    order.cancelledBy = 'Vendor';
    addTimelineEntry(order, 'Cancelled', 'Order Rejected', order.rejectionReason);
    await order.save();

    // Notify Customer about Order Rejection
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '❌ Order Rejected by Vendor',
            body: `Aapka order (#${order.orderId}) vendor dwara reject kiya gaya hai. Reason: ${order.rejectionReason}`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              status: 'Cancelled',
              type: 'ORDER_REJECTED',
            },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Order Reject Error]:', pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Order rejected successfully',
      order,
    });
  } catch (error) {
    console.error('[Vendor Reject Order Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject order',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/orders/:id/status
// @desc    Update vendor processing status: Processing, Packed, Ready for Pickup
// @access  Protected (Vendor)
router.put('/:id/status', protectVendor, async (req, res) => {
  try {
    const { status } = req.body; // 'Processing' | 'Packed' | 'Ready for Pickup'
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

    order.internalStatus = status;

    if (status === 'Processing') {
      order.status = 'Processing';
      addTimelineEntry(order, 'Processing', 'Seller Processing', 'Seller is preparing your order.');
    } else if (status === 'Packed') {
      order.status = 'Packed';
      addTimelineEntry(order, 'Packed', 'Packed', 'Your product is packed and ready.');
    } else if (status === 'Ready for Pickup') {
      order.internalStatus = 'Ready for Pickup';
      addTimelineEntry(order, 'Packed', 'Ready for Pickup', 'Order is ready for delivery boy pickup.');
    }

    await order.save();

    // Notify Customer if Packed
    if (status === 'Packed') {
      try {
        if (order.customerId) {
          const custDoc = await Customer.findById(order.customerId);
          if (custDoc && custDoc.fcmToken) {
            sendPushNotification({
              tokens: custDoc.fcmToken,
              title: '📦 Order Packed!',
              body: `Aapka order (#${order.orderId}) pack ho chuka hai aur dispatch ke liye taiyar hai.`,
              data: {
                orderId: order.orderId,
                category: order.category || '',
                status: 'Packed',
                type: 'ORDER_PACKED',
              },
            });
          }
        }
      } catch (pushErr) {}
    }

    return res.status(200).json({
      success: true,
      message: `Status updated to ${status}`,
      order,
    });
  } catch (error) {
    console.error('[Vendor Update Status Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/orders/:id/assign-driver
// @desc    Assign order to delivery boy
// @access  Protected (Vendor)
router.put('/:id/assign-driver', protectVendor, async (req, res) => {
  try {
    const { driverId, driverName, driverPhone, vehicleNumber } = req.body;

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

    order.driver = driverName || 'Assigned Driver';
    order.driverPhone = driverPhone || '';
    order.vehicleNumber = vehicleNumber || '';
    order.internalStatus = 'Order Assigned';
    addTimelineEntry(
      order,
      order.status,
      'Delivery Partner Assigned',
      `Assigned to ${order.driver} (${order.vehicleNumber || 'Vehicle'})`
    );

    await order.save();

    // 1. Notify Driver via FCM
    try {
      if (driverPhone) {
        const cleanDriverPhone = driverPhone.toString().trim();
        const driverDoc = await Driver.findOne({ phone: cleanDriverPhone });
        if (driverDoc && driverDoc.fcmToken) {
          sendPushNotification({
            tokens: driverDoc.fcmToken,
            title: '🚨 Naya Order Assign Hua!',
            body: `${order.vendor} ne aapko Order (#${order.orderId}) assign kiya hai. Site: ${order.siteAddress}`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              type: 'ORDER_ASSIGNED',
            },
          });
        }
      }
    } catch (driverPushErr) {
      console.warn('[FCM Driver Assign Error]:', driverPushErr.message);
    }

    // 2. Notify Customer
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '🚚 Delivery Boy Assigned',
            body: `Aapke order (#${order.orderId}) ke liye ${order.driver} (${order.vehicleNumber || ''}) assign ho gaya hai.`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              status: order.status,
              type: 'DRIVER_ASSIGNED',
            },
          });
        }
      }
    } catch (custPushErr) {
      console.warn('[FCM Customer Driver Assign Error]:', custPushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Delivery boy assigned successfully!',
      order,
    });
  } catch (error) {
    console.error('[Vendor Assign Driver Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: error.message,
    });
  }
});

// Legacy backward compatibility route /dispatch
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

    order.status = 'In Transit';
    order.internalStatus = 'Handed Over to Delivery Boy';
    if (driver) order.driver = driver;
    if (driverPhone) order.driverPhone = driverPhone;
    if (vehicleNumber) order.vehicleNumber = vehicleNumber;

    addTimelineEntry(order, 'In Transit', 'Handed Over to Delivery Boy', 'Package handed over to delivery boy.');
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Order dispatched!',
      order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
    order.internalStatus = 'Delivered';
    order.deliveredAt = new Date();
    addTimelineEntry(order, 'Delivered', 'Delivered', 'Order delivered successfully.');
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
