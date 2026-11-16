const mongoose = require('mongoose');

const MediaFileSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
  },
  mimetype: {
    type: String,
    default: 'image/jpeg',
  },
  size: {
    type: Number,
    default: 0,
  },
  data: {
    type: Buffer,
    required: true,
  },
  appType: {
    type: String,
    default: 'vendor',
  },
  category: {
    type: String,
    default: 'documents',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('MediaFile', MediaFileSchema);

