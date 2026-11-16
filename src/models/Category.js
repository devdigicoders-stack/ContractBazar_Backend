const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
    },
    hindiName: {
      type: String,
      trim: true,
      default: '',
    },
    commissionType: {
      type: String,
      default: 'percentage',
    },
    commissionRate: {
      type: Number,
      required: [true, 'Commission rate is required'],
      default: 5,
    },
    status: {
      type: String,
      default: 'Active',
    },
    units: {
      type: [String],
      default: [],
    },
    icon: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Category', categorySchema);
