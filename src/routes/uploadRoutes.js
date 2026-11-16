const express = require('express');
const router = express.Router();
const path = require('path');
const upload = require('../middleware/uploadMiddleware');

// @route   POST /api/upload/single
// @desc    Upload a single document/image categorized by app & category
// @access  Public (Used during Vendor / Driver registration)
router.post('/single', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided for upload',
      });
    }

    const appType = req.body.appType || req.query.appType || 'vendor';
    const category = req.body.category || req.query.category || req.file.fieldname || 'documents';

    // Construct relative URL for storage and client access
    const relativePath = `/uploads/${appType}/${category}/${req.file.filename}`.replace(/\\/g, '/');

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: relativePath,
        category,
        appType,
      },
    });
  } catch (error) {
    console.error('[Upload Single Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process file upload',
      error: error.message,
    });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files
// @access  Public
router.post('/multiple', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided for upload',
      });
    }

    const appType = req.body.appType || req.query.appType || 'vendor';
    const category = req.body.category || req.query.category || 'documents';

    const uploadedFiles = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/${appType}/${category}/${file.filename}`.replace(/\\/g, '/'),
    }));

    return res.status(200).json({
      success: true,
      message: `${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('[Upload Multiple Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process multiple uploads',
      error: error.message,
    });
  }
});

module.exports = router;

