const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    // 1. Owner / Personal Details
    ownerFullName: {
      type: String,
      required: [true, 'Owner full name is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
    },
    otpVerified: {
      type: Boolean,
      default: false,
    },
    alternateMobile: {
      type: String,
      trim: true,
      default: '',
    },
    emailAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    profilePhoto: {
      type: String,
      default: '',
    },

    // 2. Business / Shop Details
    businessName: {
      type: String,
      required: [true, 'Business/Shop name is required'],
      trim: true,
    },
    businessType: {
      type: String,
      default: 'Building Material Shop',
    },
    businessCategories: {
      type: [String],
      default: [],
    },
    businessDescription: {
      type: String,
      default: '',
    },
    businessPhotos: {
      type: [String],
      default: [],
    },

    // 3. Business Address & Location
    state: {
      type: String,
      default: 'Uttar Pradesh',
    },
    district: {
      type: String,
      default: 'Lucknow',
    },
    cityTown: {
      type: String,
      default: 'Lucknow',
    },
    areaLocality: {
      type: String,
      default: '',
    },
    fullShopAddress: {
      type: String,
      required: [true, 'Full shop address is required'],
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
    },
    mapLocation: {
      type: String,
      default: '',
    },

    // 4. Verification Documents
    aadhaarNumber: {
      type: String,
      default: '',
    },
    aadhaarFrontImg: {
      type: String,
      default: '',
    },
    aadhaarBackImg: {
      type: String,
      default: '',
    },
    panNumber: {
      type: String,
      default: '',
    },
    panCardImg: {
      type: String,
      default: '',
    },
    gstNumber: {
      type: String,
      default: '',
    },
    shopProofDoc: {
      type: String,
      default: '',
    },

    // 5. Login Credentials
    password: {
      type: String,
      select: false,
    },

    // 6. Registration Status
    status: {
      type: String,
      default: 'Pending',
    },
    rejectionReason: {
      type: String,
      default: '',
    },

    // Commercial & Delivery Settings
    freeDeliveryKm: {
      type: Number,
      default: 5,
    },
    perKmCharge: {
      type: Number,
      default: 15,
    },
    isStoreOnline: {
      type: Boolean,
      default: true,
    },
    // Bank & Payout Details
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      upiId: { type: String, default: '' },
      isVerified: { type: Boolean, default: false },
    },
    // Wallet / Earnings summary
    totalEarnings: {
      type: Number,
      default: 0,
    },
    pendingPayout: {
      type: Number,
      default: 0,
    },
    settledPayout: {
      type: Number,
      default: 0,
    },
    customCommissions: {
      type: Map,
      of: Number,
      default: {},
    },
    fcmToken: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Vendor', vendorSchema);

