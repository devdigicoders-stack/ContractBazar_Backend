const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    vendorName: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    categoryName: {
      type: String,
      required: true,
    },
    brandName: {
      type: String,
      default: '',
    },
    qualityGrade: {
      type: String,
      default: '',
    },
    unit: {
      type: String,
      required: true,
      default: 'Piece',
    },
    price: {
      type: Number,
      required: true,
    },
    discountPrice: {
      type: Number,
      default: null,
    },
    minOrderQuantity: {
      type: Number,
      default: 1,
    },
    maxOrderQuantity: {
      type: Number,
      default: null,
    },
    availableStock: {
      type: Number,
      default: 1000,
    },
    stockUnit: {
      type: String,
      default: 'Pieces',
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    image: {
      type: String,
      default: '',
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: '',
    },
    dimensions: {
      type: String,
      default: '',
    },
    weight: {
      type: String,
      default: '',
    },
    freeDeliveryDistanceKm: {
      type: Number,
      default: 5.0,
    },
    additionalDeliveryChargePerKm: {
      type: Number,
      default: 15.0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    stockSubscribers: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
        phone: { type: String, default: '' },
        fcmToken: { type: String, default: '' },
        subscribedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', productSchema);

