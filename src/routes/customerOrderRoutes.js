const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Category = require('../models/Category');
const SystemSettings = require('../models/SystemSettings');
const { protectCustomer } = require('../middleware/authMiddleware');
const { sendPushNotification } = require('../services/notificationService');

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
      status: 'Order Placed',
      internalStatus: 'New Order Received',
      timeline: [
        {
          status: 'Order Placed',
          title: 'Order Placed',
          description: 'Your order has been placed successfully.',
          time: new Date(),
        },
      ],
      driver: 'Not Assigned',
      deliveryOtp,
      siteAddress,
      deliveryLandmark: deliveryLandmark || '',
      distanceKm: Number(distanceKm) || 0,
      orderNotes: orderNotes || '',
    });

    // Notify Customer about Order Placed & Confirmed
    try {
      if (req.customer && req.customer.fcmToken) {
        sendPushNotification({
          tokens: req.customer.fcmToken,
          title: '🎉 Order Placed & Confirmed!',
          body: `Aapka order (#${newOrder.orderId}) safaltapoorvak book ho gaya hai. Status: Confirmed (Pending Dispatch). Delivery OTP: ${deliveryOtp}`,
          data: {
            orderId: newOrder.orderId,
            category: newOrder.category || '',
            status: 'Confirmed',
            type: 'ORDER_CONFIRMED',
          },
        });
      }
    } catch (custPushErr) {
      console.warn('[FCM Customer Order Place Notification Error]:', custPushErr.message);
    }

    // Notify Vendor via FCM
    try {
      if (verifiedVendorId) {
        const vendorDoc = await Vendor.findById(verifiedVendorId);
        if (vendorDoc && vendorDoc.fcmToken) {
          sendPushNotification({
            tokens: vendorDoc.fcmToken,
            title: '🔔 Naya Order Prapt Hua!',
            body: `${newOrder.customer} ne ₹${newOrder.totalAmount} ka naya order (#${newOrder.orderId}) diya hai.`,
            data: {
              orderId: newOrder.orderId,
              category: newOrder.category || '',
              type: 'NEW_ORDER',
            },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Order Place Notification Error]:', pushErr.message);
    }

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

// @route   POST /api/customer/orders/:id/cancel
// @desc    Customer cancels order (Strictly restricted by user rules)
// @access  Protected (Customer)
router.post('/:id/cancel', protectCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: id }, { orderId: id }],
      $or: [{ customerId: req.customer._id }, { customerPhone: req.customer.mobileNumber }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Cancellation Policy Rules specified by user:
    // Order Placed -> Allowed
    // Order Confirmed -> Allowed
    // Processing -> Allowed
    // Packed -> Allowed
    // Shipped / Ready for Pickup -> Allowed / Policy dependent
    // In Transit -> Not allowed
    // Reached Nearest Hub / Site -> Not allowed
    // Out for Delivery -> Not allowed
    // Delivered -> Not allowed
    const nonCancellableStatuses = [
      'In Transit',
      'Reached Nearest Hub',
      'Reached Customer Location',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
    ];

    if (nonCancellableStatuses.includes(order.status) || nonCancellableStatuses.includes(order.internalStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order cancel nahi kiya ja sakta kyonki order '${order.status}' stage par hai. Delivery partner parcel lekar nikal chuka hai.`,
      });
    }

    order.status = 'Cancelled';
    order.internalStatus = 'Cancelled by Customer';
    order.cancellationReason = reason || 'Customer requested cancellation';
    order.cancelledBy = 'Customer';

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'Cancelled',
      title: 'Order Cancelled',
      description: `Cancelled by customer. Reason: ${order.cancellationReason}`,
      time: new Date(),
    });

    await order.save();

    // Notify Vendor about cancellation
    try {
      if (order.vendorId) {
        const vendorDoc = await Vendor.findById(order.vendorId);
        if (vendorDoc && vendorDoc.fcmToken) {
          sendPushNotification({
            tokens: vendorDoc.fcmToken,
            title: '⚠️ Order Cancelled by Customer',
            body: `${order.customer} ne Order (#${order.orderId}) cancel kar diya hai. Reason: ${order.cancellationReason}`,
            data: {
              orderId: order.orderId,
              status: 'Cancelled',
              type: 'ORDER_CANCELLED_BY_CUSTOMER',
            },
          });
        }
      }
    } catch (e) {}

    // Notify Driver if driver was assigned
    try {
      if (order.driverPhone) {
        const Driver = require('../models/Driver');
        const driverDoc = await Driver.findOne({ phone: order.driverPhone });
        if (driverDoc && driverDoc.fcmToken) {
          sendPushNotification({
            tokens: driverDoc.fcmToken,
            title: '⚠️ Assigned Order Cancelled',
            body: `Order (#${order.orderId}) customer dwara cancel kar diya gaya hai.`,
            data: {
              orderId: order.orderId,
              status: 'Cancelled',
              type: 'ORDER_CANCELLED',
            },
          });
        }
      }
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order,
    });
  } catch (error) {
    console.error('[Customer Cancel Order Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/customer/orders/:id/track
// @desc    Get tracking timeline with exact 7 customer steps
// @access  Protected (Customer)
router.get('/:id/track', protectCustomer, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({
      $or: [{ _id: id }, { orderId: id }],
      $or: [{ customerId: req.customer._id }, { customerPhone: req.customer.mobileNumber }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // 7 Customer Milestones specified by user:
    // 1. Order Placed
    // 2. Order Confirmed
    // 3. Packed
    // 4. Picked Up
    // 5. In Transit
    // 6. Out for Delivery
    // 7. Delivered

    const statusOrder = [
      'Order Placed',
      'Order Confirmed',
      'Packed',
      'Picked Up',
      'In Transit',
      'Out for Delivery',
      'Delivered',
    ];

    // Determine current index based on order.status and internalStatus
    let currentKey = order.status;
    if (order.status === 'Pending') currentKey = 'Order Placed';
    if (order.status === 'Confirmed' || order.status === 'Processing') currentKey = 'Order Confirmed';
    if (order.internalStatus === 'Packed' || order.internalStatus === 'Ready for Pickup') currentKey = 'Packed';
    if (order.internalStatus === 'Order Picked Up') currentKey = 'Picked Up';
    if (order.status === 'Dispatched') currentKey = 'In Transit';

    let currentIndex = statusOrder.indexOf(currentKey);
    if (currentIndex === -1) {
      if (order.status === 'Delivered') currentIndex = 6;
      else currentIndex = 0;
    }

    const steps = [
      {
        step: 1,
        title: 'Order Placed',
        subtitle: 'Your order has been placed successfully.',
        completed: currentIndex >= 0,
        current: currentIndex === 0,
      },
      {
        step: 2,
        title: 'Order Confirmed',
        subtitle: 'Vendor has accepted your order.',
        completed: currentIndex >= 1,
        current: currentIndex === 1,
      },
      {
        step: 3,
        title: 'Packed',
        subtitle: 'Your product is packed and ready.',
        completed: currentIndex >= 2,
        current: currentIndex === 2,
      },
      {
        step: 4,
        title: 'Picked Up',
        subtitle: 'Delivery partner has collected your order.',
        completed: currentIndex >= 3,
        current: currentIndex === 3,
      },
      {
        step: 5,
        title: 'In Transit',
        subtitle: 'Your order is on its way.',
        completed: currentIndex >= 4,
        current: currentIndex === 4,
      },
      {
        step: 6,
        title: 'Out for Delivery',
        subtitle: 'Your order is on the way to your doorstep.',
        completed: currentIndex >= 5,
        current: currentIndex === 5,
      },
      {
        step: 7,
        title: 'Delivered',
        subtitle: 'Your order has been delivered successfully.',
        completed: currentIndex >= 6,
        current: currentIndex === 6,
      },
    ];

    const canCancel = !['In Transit', 'Reached Customer Location', 'Out for Delivery', 'Delivered', 'Cancelled'].includes(
      order.status
    );

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      currentStatus: order.status,
      internalStatus: order.internalStatus,
      deliveryOtp: order.deliveryOtp,
      canCancel,
      steps,
      timeline: order.timeline || [],
      driver: {
        name: order.driver,
        phone: order.driverPhone,
        vehicleNumber: order.vehicleNumber,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

