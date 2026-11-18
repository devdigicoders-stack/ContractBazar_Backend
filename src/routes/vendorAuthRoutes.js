const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Vendor = require('../models/Vendor');

const router = express.Router();

// Helper to generate JWT token for Vendor
const generateVendorToken = (id) => {
  return jwt.sign(
    { id, role: 'vendor' },
    process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!',
    {
      expiresIn: process.env.JWT_EXPIRE || '30d',
    }
  );
};

// In-memory or temporary OTP store (For production/SMS gateway, this sends via Fast2SMS/Twilio)
// Standard demo OTP is 123456
const otpStore = new Map();

// @route   POST /api/vendor/auth/send-otp
// @desc    Send OTP to vendor mobile number for login
//          Rules:
//          1. Check if vendor mobile number exists in database. If NOT -> Ask to register.
//          2. If exists but status !== 'Approved' -> Show status (e.g. Pending review, not approved yet).
//          3. If Approved -> Send demo OTP 123456 to enter app.
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, purpose } = req.body;

    if (!phone || phone.toString().trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number',
      });
    }

    const cleanPhone = phone.toString().trim();

    // Check vendor in database
    const vendor = await Vendor.findOne({ mobileNumber: cleanPhone });

    // If purpose is 'registration', allow sending OTP if not already approved/registered
    if (purpose === 'registration') {
      if (vendor) {
        return res.status(400).json({
          success: false,
          isRegistered: true,
          message: 'Mobile number is already registered. Please go to Login.',
        });
      }
      const otp = '123456';
      otpStore.set(cleanPhone, {
        otp,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });
      return res.status(200).json({
        success: true,
        message: `OTP sent successfully for registration. (Use demo OTP: 123456)`,
        otp,
      });
    }

    // Default purpose is LOGIN:
    // 1. Not in database
    if (!vendor) {
      return res.status(404).json({
        success: false,
        isRegistered: false,
        message: 'Yeh number registered nahi hai. Kripya pehle registration karein.',
      });
    }

    // 2. In database but NOT approved yet
    if (vendor.status !== 'Approved') {
      let statusMsg = 'Aapka account abhi approve nahi hua hai. Admin approval pending hai.';
      if (vendor.status === 'Rejected') {
        statusMsg = `Aapka registration reject kar diya gaya hai: ${vendor.rejectionReason || 'Kripya admin se sampark karein.'}`;
      } else if (vendor.status === 'Resubmit') {
        statusMsg = `Aapko documents dobara submit karne honge: ${vendor.rejectionReason || 'Kripya KYC update karein.'}`;
      }
      return res.status(403).json({
        success: false,
        isRegistered: true,
        status: vendor.status,
        vendorName: vendor.ownerFullName,
        shopName: vendor.businessName,
        message: statusMsg,
      });
    }

    // 3. Vendor IS Approved -> Send OTP 123456
    const otp = '123456';
    otpStore.set(cleanPhone, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to +91 ${cleanPhone}. (Use demo OTP: 123456)`,
      otp,
      isRegistered: true,
      vendorStatus: 'Approved',
      vendor: {
        id: vendor._id,
        ownerFullName: vendor.ownerFullName,
        businessName: vendor.businessName,
      },
    });
  } catch (error) {
    console.error('[Vendor Send OTP Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
});

// @route   POST /api/vendor/auth/verify-otp-and-login
// @desc    Verify OTP and log in vendor (ALLOWED ONLY IF STATUS IS 'Approved')
// @access  Public
router.post('/verify-otp-and-login', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and 6-digit OTP are required',
      });
    }

    const cleanPhone = phone.toString().trim();
    const stored = otpStore.get(cleanPhone);

    // Accept stored OTP or fallback demo OTP 123456
    const isValidOtp = otp === '123456' || (stored && stored.otp === otp && stored.expiresAt > Date.now());

    if (!isValidOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP. Please use 123456 or request a new OTP.',
      });
    }

    // Check if vendor is registered in database
    const vendor = await Vendor.findOne({ mobileNumber: cleanPhone });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        isRegistered: false,
        message: 'Mobile number not registered as a vendor. Please complete registration first.',
      });
    }

    // CRITICAL USER BUSINESS RULE: "admin panel se aproved krte hi login kr sake ok"
    if (vendor.status !== 'Approved') {
      return res.status(403).json({
        success: false,
        isRegistered: true,
        status: vendor.status,
        rejectionReason: vendor.rejectionReason || '',
        message:
          vendor.status === 'Pending'
            ? 'Your application is under review by Admin. You can login once your account is Approved.'
            : vendor.status === 'Rejected'
            ? `Your application was rejected: ${vendor.rejectionReason || 'Please contact Admin'}`
            : vendor.status === 'Resubmit'
            ? `Documents need resubmission: ${vendor.rejectionReason || 'Please update KYC documents'}`
            : `Account is ${vendor.status}. Login not allowed until Approved.`,
      });
    }

    // Mark verified
    vendor.otpVerified = true;
    await vendor.save();

    // Generate Vendor JWT
    const token = generateVendorToken(vendor._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful! Welcome to Contract Bazar Vendor Panel.',
      token,
      vendor: {
        id: vendor._id,
        ownerFullName: vendor.ownerFullName,
        mobileNumber: vendor.mobileNumber,
        businessName: vendor.businessName,
        businessType: vendor.businessType,
        businessCategories: vendor.businessCategories,
        fullShopAddress: vendor.fullShopAddress,
        cityTown: vendor.cityTown,
        district: vendor.district,
        state: vendor.state,
        pincode: vendor.pincode,
        status: vendor.status,
        freeDeliveryKm: vendor.freeDeliveryKm,
        perKmCharge: vendor.perKmCharge,
      },
    });
  } catch (error) {
    console.error('[Vendor Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP & login',
      error: error.message,
    });
  }
});

// @route   POST /api/vendor/auth/register
// @desc    Register a new Vendor (5-step registration submission, status starts as 'Pending')
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const {
      ownerFullName,
      mobileNumber,
      alternateMobile,
      emailAddress,
      businessName,
      businessType,
      businessCategories,
      businessDescription,
      state,
      district,
      cityTown,
      areaLocality,
      fullShopAddress,
      pincode,
      mapLocation,
      aadhaarNumber,
      aadhaarFrontImg,
      aadhaarBackImg,
      panNumber,
      panCardImg,
      gstNumber,
      shopProofDoc,
      password,
    } = req.body;

    if (!ownerFullName || !mobileNumber || !businessName || !fullShopAddress || !pincode) {
      return res.status(400).json({
        success: false,
        message: 'Owner name, mobile number, business name, address, and pincode are required',
      });
    }

    const cleanPhone = mobileNumber.toString().trim();

    // Check if already exists
    const existing = await Vendor.findOne({ mobileNumber: cleanPhone });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Vendor with mobile number ${cleanPhone} is already registered (Status: ${existing.status})`,
        status: existing.status,
        vendorId: existing._id,
      });
    }

    // Optional password hashing if provided
    let hashedPassword = '';
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const newVendor = await Vendor.create({
      ownerFullName: ownerFullName.trim(),
      mobileNumber: cleanPhone,
      alternateMobile: alternateMobile ? alternateMobile.toString().trim() : '',
      emailAddress: emailAddress ? emailAddress.toString().trim().toLowerCase() : '',
      businessName: businessName.trim(),
      businessType: businessType || 'Building Material Shop',
      businessCategories: Array.isArray(businessCategories) ? businessCategories : [],
      businessDescription: businessDescription || '',
      state: state || 'Uttar Pradesh',
      district: district || 'Lucknow',
      cityTown: cityTown || 'Lucknow',
      areaLocality: areaLocality || '',
      fullShopAddress: fullShopAddress.trim(),
      pincode: pincode.toString().trim(),
      mapLocation: mapLocation || '',
      aadhaarNumber: aadhaarNumber ? aadhaarNumber.toString().trim() : '',
      aadhaarFrontImg: aadhaarFrontImg || '',
      aadhaarBackImg: aadhaarBackImg || '',
      panNumber: panNumber ? panNumber.toString().trim() : '',
      panCardImg: panCardImg || '',
      gstNumber: gstNumber ? gstNumber.toString().trim() : '',
      shopProofDoc: shopProofDoc || '',
      password: hashedPassword || undefined,
      status: 'Pending', // ALWAYS starts in Pending awaiting Super Admin approval
      rejectionReason: '',
      freeDeliveryKm: 10,
      perKmCharge: 15,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully! Your application is pending review by Admin.',
      vendor: {
        id: newVendor._id,
        ownerFullName: newVendor.ownerFullName,
        mobileNumber: newVendor.mobileNumber,
        businessName: newVendor.businessName,
        status: newVendor.status,
        createdAt: newVendor.createdAt,
      },
    });
  } catch (error) {
    console.error('[Vendor Registration Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register vendor',
      error: error.message,
    });
  }
});

// @route   GET /api/vendor/auth/status/:phone
// @desc    Check vendor application verification status by phone number
// @access  Public
router.get('/status/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = phone.toString().trim();

    const vendor = await Vendor.findOne({ mobileNumber: cleanPhone });
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: `No vendor application found for mobile number ${cleanPhone}`,
      });
    }

    return res.status(200).json({
      success: true,
      vendor: {
        id: vendor._id,
        ownerFullName: vendor.ownerFullName,
        businessName: vendor.businessName,
        mobileNumber: vendor.mobileNumber,
        status: vendor.status,
        rejectionReason: vendor.rejectionReason || '',
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Vendor Check Status Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor application status',
      error: error.message,
    });
  }
});

// @route   GET /api/vendor/auth/me
// @desc    Get currently authenticated vendor profile
// @access  Private (Vendor Protected)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!'
    );

    const vendor = await Vendor.findById(decoded.id).select('-password');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    return res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: error.message,
    });
  }
});

// @route   POST /api/vendor/auth/fcm-token
// @desc    Sync FCM Device Token for Vendor
// @access  Public / Protected
router.post('/fcm-token', async (req, res) => {
  try {
    const { phone, vendorId, fcmToken } = req.body;
    if (!fcmToken || (!phone && !vendorId)) {
      return res.status(400).json({ success: false, message: 'Phone/VendorId and fcmToken are required' });
    }
    const filter = vendorId ? { _id: vendorId } : { mobileNumber: phone.toString().trim() };
    await Vendor.findOneAndUpdate(filter, { fcmToken });
    return res.status(200).json({ success: true, message: 'Vendor FCM token updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

