const express = require('express');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const router = express.Router();

// Helper to generate JWT token for Customer
const generateCustomerToken = (id) => {
  return jwt.sign(
    { id, role: 'customer' },
    process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!',
    {
      expiresIn: process.env.JWT_EXPIRE || '60d',
    }
  );
};

// In-memory OTP store (Standard demo OTP is 123456)
const otpStore = new Map();

// @route   POST /api/customer/auth/send-otp
// @desc    Send OTP to customer phone (auto registers or logs in)
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.toString().trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number',
      });
    }

    const cleanPhone = phone.toString().trim().slice(-10);
    const demoOtp = '123456';

    otpStore.set(cleanPhone, {
      otp: demoOtp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    // Check if existing customer
    const existing = await Customer.findOne({ mobileNumber: cleanPhone });

    return res.status(200).json({
      success: true,
      message: existing
        ? `Welcome back! OTP sent to +91 ${cleanPhone}`
        : `New user registration! OTP sent to +91 ${cleanPhone}`,
      isNewCustomer: !existing,
      existingName: existing ? existing.fullName : '',
      demoOtp: '123456',
    });
  } catch (error) {
    console.error('[Customer Send OTP Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/customer/auth/verify-otp
// @desc    Verify OTP and log in / register customer
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, fullName, userType } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP are required',
      });
    }

    const cleanPhone = phone.toString().trim().slice(-10);
    const stored = otpStore.get(cleanPhone);

    const isValid = otp === '123456' || (stored && stored.otp === otp && stored.expiresAt > Date.now());

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Use demo OTP: 123456',
      });
    }

    otpStore.delete(cleanPhone);

    let customer = await Customer.findOne({ mobileNumber: cleanPhone });

    if (!customer) {
      customer = await Customer.create({
        mobileNumber: cleanPhone,
        fullName: fullName || 'Contractor / Builder',
        userType: userType || 'Contractor',
      });
    } else if (fullName && fullName.trim().isNotEmpty) {
      customer.fullName = fullName;
      if (userType) customer.userType = userType;
      await customer.save();
    }

    const token = generateCustomerToken(customer._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      customer,
    });
  } catch (error) {
    console.error('[Customer Verify OTP Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/customer/auth/profile
// @desc    Update customer profile details & profile photo
// @access  Public / Protected
router.put('/profile', async (req, res) => {
  try {
    const { phone, fullName, emailAddress, profilePhoto, userType, companyName, gstNumber, fcmToken } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const cleanPhone = phone.trim().slice(-10);
    const customer = await Customer.findOne({ mobileNumber: cleanPhone });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (fullName !== undefined) customer.fullName = fullName;
    if (emailAddress !== undefined) customer.emailAddress = emailAddress;
    if (profilePhoto !== undefined) customer.profilePhoto = profilePhoto;
    if (userType !== undefined) customer.userType = userType;
    if (companyName !== undefined) customer.companyName = companyName;
    if (gstNumber !== undefined) customer.gstNumber = gstNumber;
    if (fcmToken !== undefined) customer.fcmToken = fcmToken;

    await customer.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      customer,
    });
  } catch (error) {
    console.error('[Customer Update Profile Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/customer/auth/fcm-token
// @desc    Sync FCM Device Token for Customer
// @access  Public
router.post('/fcm-token', async (req, res) => {
  try {
    const { phone, fcmToken } = req.body;
    if (!phone || !fcmToken) {
      return res.status(400).json({ success: false, message: 'Phone and fcmToken are required' });
    }
    const cleanPhone = phone.trim().slice(-10);

    // 1. One device = one active user rule:
    // If this device token is already linked with any OTHER customer account, unbind it first!
    await Customer.updateMany(
      { fcmToken, mobileNumber: { $ne: cleanPhone } },
      { $set: { fcmToken: '' } }
    );

    // 2. Link the token strictly to the currently logged in customer
    await Customer.findOneAndUpdate(
      { mobileNumber: cleanPhone },
      { fcmToken },
      { upsert: false }
    );
    return res.status(200).json({ success: true, message: 'FCM token updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/customer/auth/profile
// @desc    Get customer profile
// @access  Public / Protected
router.get('/profile/:phone', async (req, res) => {
  try {
    const cleanPhone = req.params.phone.trim().slice(-10);
    const customer = await Customer.findOne({ mobileNumber: cleanPhone });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    return res.status(200).json({ success: true, customer });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

