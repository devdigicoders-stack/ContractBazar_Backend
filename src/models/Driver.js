const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      default: 'Tractor-Trolley',
    },
    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
    },
    drivingLicenseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    drivingLicenseDocument: {
      type: String,
      default: '',
    },
    aadhaarNumber: {
      type: String,
      trim: true,
    },
    aadhaarDocument: {
      type: String,
      default: '',
    },
    rcDocument: {
      type: String,
      default: '',
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    vendorName: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: 'Lucknow',
    },
    state: {
      type: String,
      default: 'Uttar Pradesh',
    },
    status: {
      type: String,
      default: 'Pending',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    currentLocation: {
      type: {
        type: String,
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [80.9462, 26.8467],
      },
      address: {
        type: String,
        default: '',
      },
    },
    totalTripsCompleted: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 4.8,
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

driverSchema.index({ status: 1 });
driverSchema.index({ vehicleNumber: 1 });

module.exports = mongoose.model('Driver', driverSchema);
