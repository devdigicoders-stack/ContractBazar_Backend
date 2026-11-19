const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
const Customer = require('../models/Customer');
const { sendPushNotification } = require('../services/notificationService');

// Helper to generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id, role: 'driver' }, process.env.JWT_SECRET || 'contract_bazar_secret', {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  });
};

// @route   POST /api/delivery/auth/send-otp
// @desc    Check driver phone and send OTP
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone || phone.toString().trim().length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Kripya sahi 10-digit mobile number darj karein',
      });
    }

    const cleanPhone = phone.toString().trim();
    const driver = await Driver.findOne({ phone: cleanPhone });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Ye mobile number registered nahi hai! Kripya apne bhattha/vendor ya admin se sampark karein.',
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP safaltapoorvak bhej diya gaya hai (${cleanPhone})! Demo OTP: 123456`,
      demoOtp: '123456',
      driverName: driver.name,
      vehicleNumber: driver.vehicleNumber,
    });
  } catch (error) {
    console.error('[Delivery Send OTP Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sending OTP',
      error: error.message,
    });
  }
});

// @route   POST /api/delivery/auth/verify-otp
// @desc    Verify OTP and log in driver
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body || {};

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number aur OTP dono zaroori hain',
      });
    }

    const cleanPhone = phone.toString().trim();
    const cleanOtp = otp.toString().trim();

    // Verify Demo OTP (123456)
    if (cleanOtp !== '123456' && cleanOtp !== '1234') {
      return res.status(400).json({
        success: false,
        message: 'Galat OTP! Demo OTP 123456 darj karein.',
      });
    }

    const driver = await Driver.findOne({ phone: cleanPhone });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver profile nahi mili. Kripya vendor se contact karein.',
      });
    }

    // Auto mark online upon login
    driver.isOnline = true;
    await driver.save();

    const token = generateToken(driver._id);

    return res.status(200).json({
      success: true,
      message: `Swagat hai, ${driver.name}!`,
      token,
      driver: {
        _id: driver._id,
        id: driver._id,
        deliveryId: `DB-${driver._id.toString().slice(-4).toUpperCase()}`,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        vendorId: driver.vendorId,
        vendorName: driver.vendorName || 'Contract Bazar Bhattha',
        vendorPhone: '9876543210',
        isOnline: driver.isOnline,
        todayEarnings: driver.totalEarnings || 0,
        completedTripsToday: driver.totalTripsCompleted || 0,
        rating: driver.rating || 4.9,
        drivingLicenseNumber: driver.drivingLicenseNumber || '',
        drivingLicenseDocument: driver.drivingLicenseDocument || '',
        aadhaarNumber: driver.aadhaarNumber || '',
        aadhaarDocument: driver.aadhaarDocument || '',
        rcDocument: driver.rcDocument || '',
        profilePhoto: driver.profilePhoto || '',
        city: driver.city || 'Lucknow',
        state: driver.state || 'Uttar Pradesh',
        status: driver.status || 'Approved',
      },
    });
  } catch (error) {
    console.error('[Delivery Verify OTP Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP',
      error: error.message,
    });
  }
});

// @route   GET /api/delivery/orders/assigned
// @desc    Get real assigned delivery trips for logged-in driver phone / vehicle
// @access  Public / Protected
router.get('/orders/assigned', async (req, res) => {
  try {
    const { phone, vehicleNumber } = req.query;

    const filter = {
      status: { $in: ['Dispatched', 'Out for Delivery', 'Confirmed', 'Delivered'] },
    };

    if (phone || vehicleNumber) {
      filter.$or = [];
      if (phone) filter.$or.push({ driverPhone: phone });
      if (vehicleNumber) filter.$or.push({ vehicleNumber: vehicleNumber });
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[Delivery Assigned Orders Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned delivery orders',
      error: error.message,
    });
  }
});

// @route   PUT /api/delivery/orders/:id/status
// @desc    Update delivery trip status with granular delivery boy steps & push notifications
// @access  Public / Protected
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, internalStatus } = req.body;

    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const order = await Order.findOne(
      isObjectId ? { $or: [{ _id: id }, { orderId: id }] } : { orderId: id }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const targetInternal = internalStatus || status;

    // Delivery Boy Statuses:
    // 1. Accepted
    // 2. Reached Vendor Location
    // 3. Order Picked Up (Mapped customer status: Picked Up)
    // 4. In Transit (Mapped customer status: In Transit)
    // 5. Reached Customer Location
    // 6. Out for Delivery (Mapped customer status: Out for Delivery)
    // 7. Delivered (Mapped customer status: Delivered)

    let customerFacingStatus = order.status;
    let title = '';
    let description = '';
    let custNotifTitle = '';
    let custNotifBody = '';
    let vendorNotifTitle = '';
    let vendorNotifBody = '';

    if (targetInternal === 'Accepted') {
      order.internalStatus = 'Accepted';
      title = 'Delivery Accepted';
      description = `${order.driver || 'Delivery partner'} has accepted the delivery assignment.`;
    } else if (targetInternal === 'Reached Vendor Location') {
      order.internalStatus = 'Reached Vendor Location';
      title = 'Driver Reached Bhattha/Store';
      description = `${order.driver || 'Driver'} reached the vendor pickup location.`;
      vendorNotifTitle = '📍 Driver Reached Shop/Bhattha';
      vendorNotifBody = `Driver (${order.driver}) aapki dukaan/bhattha par pahunch gaya hai. Parcel hand over karein.`;
    } else if (targetInternal === 'Order Picked Up') {
      order.internalStatus = 'Order Picked Up';
      order.status = 'Picked Up';
      customerFacingStatus = 'Picked Up';
      title = 'Picked Up';
      description = 'Delivery partner has collected your order.';
      custNotifTitle = '📦 Order Picked Up!';
      custNotifBody = `Delivery partner (${order.driver}) ne aapka material bhattha/store se load kar liya hai.`;
      vendorNotifTitle = '✅ Order Dispatched with Driver';
      vendorNotifBody = `Driver ne Order (#${order.orderId}) collect kar liya hai.`;
    } else if (targetInternal === 'In Transit') {
      order.internalStatus = 'In Transit';
      order.status = 'In Transit';
      customerFacingStatus = 'In Transit';
      title = 'In Transit';
      description = 'Your order is on its way.';
      custNotifTitle = '🚚 Order In Transit';
      custNotifBody = `Aapka order raste me hai aur customer address ki taraf nikal chuka hai.`;
    } else if (targetInternal === 'Reached Customer Location') {
      order.internalStatus = 'Reached Customer Location';
      title = 'Driver Reached Customer Site';
      description = `${order.driver || 'Driver'} has arrived at your delivery address.`;
      custNotifTitle = '📍 Driver Reached Your Site!';
      custNotifBody = `Driver aapke location par pahunch gaya hai. Kripya unloading ki taiyari karein.`;
    } else if (targetInternal === 'Out for Delivery') {
      order.internalStatus = 'Out for Delivery';
      order.status = 'Out for Delivery';
      customerFacingStatus = 'Out for Delivery';
      title = 'Out for Delivery';
      description = 'Your order is on the way to your doorstep.';
      custNotifTitle = '🚨 Out for Delivery!';
      custNotifBody = `Aapka order delivery ke liye nikal chuka hai. Delivery OTP: ${order.deliveryOtp}`;
    } else {
      order.status = status || order.status;
      order.internalStatus = targetInternal;
      title = status;
      description = `Order updated to ${status}`;
    }

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: customerFacingStatus,
      title: title || customerFacingStatus,
      description: description,
      time: new Date(),
    });

    await order.save();

    // Push notification to Customer if applicable
    if (custNotifTitle && order.customerId) {
      try {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: custNotifTitle,
            body: custNotifBody,
            data: {
              orderId: order.orderId,
              status: order.status,
              internalStatus: order.internalStatus,
              type: 'ORDER_STATUS_UPDATE',
            },
          });
        }
      } catch (e) {}
    }

    // Push notification to Vendor if applicable
    if (vendorNotifTitle && order.vendorId) {
      try {
        const vendorDoc = await Vendor.findById(order.vendorId);
        if (vendorDoc && vendorDoc.fcmToken) {
          sendPushNotification({
            tokens: vendorDoc.fcmToken,
            title: vendorNotifTitle,
            body: vendorNotifBody,
            data: {
              orderId: order.orderId,
              status: order.status,
              internalStatus: order.internalStatus,
              type: 'VENDOR_ORDER_UPDATE',
            },
          });
        }
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${order.internalStatus}`,
      order,
    });
  } catch (error) {
    console.error('[Delivery Update Status Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/delivery/orders/:id/verify-and-complete
// @desc    Flipkart style OTP verification & POD (Proof of Delivery) upload & Payment Collection
// @access  Public / Protected
router.post('/orders/:id/verify-and-complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { otp, proofImage, notes, paymentCollected, collectedMode } = req.body;

    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const order = await Order.findOne(
      isObjectId ? { $or: [{ _id: id }, { orderId: id }] } : { orderId: id }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify OTP strictly against the Customer's order OTP (Flipkart style verification)
    const submittedOtp = (otp || '').toString().trim();
    const actualOrderOtp = (order.deliveryOtp || '').toString().trim();

    if (!submittedOtp) {
      return res.status(400).json({
        success: false,
        message: 'Kripya customer ke mobile app par dikh raha 4-digit OTP darj karein.',
      });
    }

    if (actualOrderOtp && submittedOtp !== actualOrderOtp) {
      return res.status(400).json({
        success: false,
        message: `Galat OTP! Customer app par diya gaya sahi delivery OTP (${actualOrderOtp ? '••••' : ''}) hi darj karein.`,
      });
    }

    // Update Order Status to Delivered (Real-time sync with Customer App, Vendor App, Admin Panel)
    order.status = 'Delivered';
    order.internalStatus = 'Delivered';
    order.deliveredAt = new Date();

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: 'Delivered',
      title: 'Delivered',
      description: 'Your order has been delivered successfully.',
      time: new Date(),
    });

    // Payment collection logic (Flipkart style: Cash Collected / Pre-paid Online)
    if (order.paymentMode === 'COD') {
      order.paymentStatus = 'Paid';
      order.paymentCollectedByDriver = paymentCollected !== false;
      order.collectedPaymentMode = collectedMode || 'Cash';
    } else {
      order.paymentStatus = 'Paid';
    }

    if (proofImage) {
      order.proofOfDeliveryImage = proofImage;
    }
    if (notes) {
      order.orderNotes = (order.orderNotes ? order.orderNotes + ' | ' : '') + notes;
    }
    await order.save();

    // Increment driver stats and earnings
    if (order.driverPhone) {
      await Driver.findOneAndUpdate(
        { phone: order.driverPhone },
        {
          $inc: {
            totalTripsCompleted: 1,
            totalEarnings: order.deliveryCharge || 450,
          },
        }
      );
    }

    // 1. Notify Customer that order has been delivered
    try {
      if (order.customerId) {
        const custDoc = await Customer.findById(order.customerId);
        if (custDoc && custDoc.fcmToken) {
          sendPushNotification({
            tokens: custDoc.fcmToken,
            title: '🎉 Material Delivered Ho Gaya!',
            body: `Aapka order (#${order.orderId}) safaltapoorvak deliver ho gaya hai. Status: Delivered. Contract Bazar use karne ke liye dhanyawad!`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              status: 'Delivered',
              type: 'ORDER_DELIVERED',
            },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Deliver Cust Error]:', pushErr.message);
    }

    // 2. Notify Vendor that delivery is complete & payment collected
    try {
      if (order.vendorId) {
        const vendorDoc = await Vendor.findById(order.vendorId);
        if (vendorDoc && vendorDoc.fcmToken) {
          sendPushNotification({
            tokens: vendorDoc.fcmToken,
            title: '💰 Order Delivered & Payment Done!',
            body: `Driver ne Order (#${order.orderId}) deliver kar diya hai. Total: ₹${order.totalAmount}`,
            data: {
              orderId: order.orderId,
              category: order.category || '',
              status: 'Delivered',
              type: 'VENDOR_ORDER_DELIVERED',
            },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Deliver Vendor Error]:', pushErr.message);
    }

    // 3. Notify Driver Confirmation
    try {
      if (order.driverPhone) {
        const driverDoc = await Driver.findOne({ phone: order.driverPhone });
        if (driverDoc && driverDoc.fcmToken) {
          sendPushNotification({
            tokens: driverDoc.fcmToken,
            title: '✅ Trip Successfully Completed!',
            body: `Order (#${order.orderId}) deliver ho gaya hai. Aapki kamai add kar di gayi hai.`,
            data: {
              orderId: order.orderId,
              status: 'Delivered',
              type: 'TRIP_COMPLETED',
            },
          });
        }
      }
    } catch (pushErr) {
      console.warn('[FCM Deliver Driver Error]:', pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Trip delivered successfully! POD saved and payment marked Paid.',
      order,
    });
  } catch (error) {
    console.error('[Delivery Complete Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/delivery/orders/:id/resend-otp
// @desc    Generate a fresh 4-digit Delivery OTP and update on Customer App & SMS
// @access  Public / Protected
router.post('/orders/:id/resend-otp', async (req, res) => {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const order = await Order.findOne(
      isObjectId ? { $or: [{ _id: id }, { orderId: id }] } : { orderId: id }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Order pehle hi deliver ho chuka hai!',
      });
    }

    // Generate fresh 4-digit numeric OTP (1000 - 9999)
    const freshOtp = Math.floor(1000 + Math.random() * 9000).toString();
    order.deliveryOtp = freshOtp;
    await order.save();

    console.log(`[Resend OTP]: Order ${order.orderId} fresh OTP is ${freshOtp} for customer ${order.customer} (${order.customerPhone})`);

    return res.status(200).json({
      success: true,
      message: `Naya OTP safaltapoorvak bhej diya gaya hai! Customer app par naya OTP update ho gaya hai.`,
      newOtp: freshOtp,
      customerPhone: order.customerPhone,
      orderId: order.orderId,
    });
  } catch (error) {
    console.error('[Resend Delivery OTP Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/delivery/profile/status
// @desc    Toggle driver Online / Offline (duty on/off)
// @access  Public / Protected
router.put('/profile/status', async (req, res) => {
  try {
    const { phone, isOnline } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { phone },
      { isOnline: Boolean(isOnline) },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Duty status updated: ${driver.isOnline ? 'Online' : 'Offline'}`,
      isOnline: driver.isOnline,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/delivery/wallet
// @desc    Get driver wallet summary, total earnings, payout history
// @access  Public / Protected
router.get('/wallet', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Driver phone is required' });
    }

    const driver = await Driver.findOne({ phone: phone.trim() });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Fetch all completed orders for this driver
    const completedOrders = await Order.find({
      $or: [{ driverPhone: phone.trim() }, { vehicleNumber: driver.vehicleNumber }],
      status: 'Delivered',
    }).sort({ deliveredAt: -1, updatedAt: -1 });

    const totalEarned = completedOrders.reduce((sum, o) => sum + (o.deliveryCharge || 450), 0);
    const balance = totalEarned; // Available balance

    return res.status(200).json({
      success: true,
      wallet: {
        totalEarnings: totalEarned,
        availableBalance: balance,
        completedTripsCount: completedOrders.length,
        driverName: driver.name,
        vehicleNumber: driver.vehicleNumber,
        bankDetails: {
          accountHolder: driver.name,
          bankName: 'State Bank of India',
          accountNumber: '••••••••4829',
          ifscCode: 'SBIN0001234',
        },
        trips: completedOrders.map((o) => ({
          orderId: o.orderId,
          customer: o.customer,
          vendor: o.vendor,
          amount: o.deliveryCharge || 450,
          date: o.deliveredAt || o.updatedAt,
          paymentMode: o.collectedPaymentMode || o.paymentMode || 'COD',
        })),
      },
    });
  } catch (error) {
    console.error('[Driver Wallet Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/delivery/profile
// @desc    Get complete driver profile with uploaded KYC & Vehicle documents
// @access  Public / Protected
router.get('/profile', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Driver phone is required' });
    }

    const driver = await Driver.findOne({ phone: phone.trim() });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver profile not found' });
    }

    return res.status(200).json({
      success: true,
      driver: {
        _id: driver._id,
        id: driver._id,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        vendorId: driver.vendorId,
        vendorName: driver.vendorName || 'Contract Bazar Bhattha',
        drivingLicenseNumber: driver.drivingLicenseNumber || '',
        drivingLicenseDocument: driver.drivingLicenseDocument || '',
        aadhaarNumber: driver.aadhaarNumber || '',
        aadhaarDocument: driver.aadhaarDocument || '',
        rcDocument: driver.rcDocument || '',
        profilePhoto: driver.profilePhoto || '',
        city: driver.city || 'Lucknow',
        state: driver.state || 'Uttar Pradesh',
        status: driver.status || 'Approved',
        isOnline: driver.isOnline,
        rating: driver.rating || 4.9,
        totalEarnings: driver.totalEarnings || 0,
        totalTripsCompleted: driver.totalTripsCompleted || 0,
        createdAt: driver.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/delivery/fcm-token
// @desc    Sync FCM Device Token for Delivery Driver
// @access  Public / Protected
router.post('/fcm-token', async (req, res) => {
  try {
    const { phone, driverId, fcmToken } = req.body;
    if (!fcmToken || (!phone && !driverId)) {
      return res.status(400).json({ success: false, message: 'Phone/DriverId and fcmToken are required' });
    }
    const cleanPhone = phone ? phone.toString().trim().slice(-10) : '';
    const filter = driverId ? { _id: driverId } : { phone: cleanPhone };

    // Unbind this token from any OTHER driver
    await Driver.updateMany(
      { fcmToken, ...(driverId ? { _id: { $ne: driverId } } : { phone: { $ne: cleanPhone } }) },
      { $set: { fcmToken: '' } }
    );

    await Driver.findOneAndUpdate(filter, { fcmToken });
    return res.status(200).json({ success: true, message: 'Driver FCM token updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
