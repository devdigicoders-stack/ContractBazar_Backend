const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    platformName: {
      type: String,
      default: 'Contract Bazar',
    },
    supportPhone: {
      type: String,
      default: '+91 9876543210',
    },
    supportEmail: {
      type: String,
      default: 'support@contractbazar.com',
    },
    emergencyHelpline: {
      type: String,
      default: '1800-123-4567',
    },
    // Delivery Configuration
    defaultFreeDeliveryKm: {
      type: Number,
      default: 5,
    },
    defaultPerKmCharge: {
      type: Number,
      default: 15,
    },
    maxDeliveryRadiusKm: {
      type: Number,
      default: 50,
    },
    // Commission Defaults
    defaultCommissionType: {
      type: String,
      default: 'Percentage',
    },
    defaultCommissionRate: {
      type: Number,
      default: 5, // 5%
    },
    // Platform operational toggles
    allowNewVendorRegistrations: {
      type: Boolean,
      default: true,
    },
    autoVerifyDriverLicense: {
      type: Boolean,
      default: false,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    maintenanceNotice: {
      type: String,
      default: 'Contract Bazar platform is currently under maintenance. We will be back shortly.',
    },
    // Payout settings
    minPayoutAmount: {
      type: Number,
      default: 1000,
    },
    payoutCycleDays: {
      type: Number,
      default: 7, // weekly
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);

