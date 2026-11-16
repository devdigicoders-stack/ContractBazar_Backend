const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    vendor: {
      type: String,
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    category: {
      type: String,
      default: '',
    },
    items: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
    adminCommission: {
      type: Number,
      default: 0,
    },
    paymentMode: {
      type: String,
      default: 'COD',
    },
    paymentId: {
      type: String,
      default: '',
    },
    razorpayOrderId: {
      type: String,
      default: '',
    },
    paymentStatus: {
      type: String,
      default: 'Pending',
    },
    status: {
      type: String,
      default: 'Pending',
    },
    driver: {
      type: String,
      default: 'Not Assigned',
    },
    driverPhone: {
      type: String,
      default: '',
    },
    vehicleNumber: {
      type: String,
      default: '',
    },
    deliveryOtp: {
      type: String,
      default: '4826',
    },
    siteAddress: {
      type: String,
      default: '',
    },
    deliveryLandmark: {
      type: String,
      default: '',
    },
    distanceKm: {
      type: Number,
      default: 0,
    },
    orderNotes: {
      type: String,
      default: '',
    },
    proofOfDeliveryImage: {
      type: String,
      default: '',
    },
    deliveredAt: {
      type: Date,
    },
    paymentCollectedByDriver: {
      type: Boolean,
      default: false,
    },
    collectedPaymentMode: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Order', orderSchema);

