const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      default: 'Contractor / Builder',
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
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
    userType: {
      type: String,
      default: 'Contractor', // Contractor, Individual Home Builder, Architect, Engineer
    },
    companyName: {
      type: String,
      default: '',
    },
    gstNumber: {
      type: String,
      default: '',
    },
    savedAddresses: [
      {
        tag: { type: String, default: 'My Construction Site' },
        contactName: { type: String, default: '' },
        contactPhone: { type: String, default: '' },
        fullAddress: { type: String, required: true },
        landmark: { type: String, default: '' },
        city: { type: String, default: 'Lucknow' },
        state: { type: String, default: 'Uttar Pradesh' },
        pincode: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
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

module.exports = mongoose.model('Customer', customerSchema);

