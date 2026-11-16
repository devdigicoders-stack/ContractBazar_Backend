const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/uploadMiddleware');
const MediaFile = require('../models/MediaFile');

// @route   POST /api/upload/single
// @desc    Upload a single document/image and persist to both Disk and MongoDB Atlas
// @access  Public
router.post('/single', upload.single('file'), async (req, res) => {
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

    // Also persist directly into MongoDB Atlas for 100% permanence across Render restarts
    try {
      let fileBuffer = req.file.buffer;
      if (!fileBuffer && req.file.path && fs.existsSync(req.file.path)) {
        fileBuffer = fs.readFileSync(req.file.path);
      }

      if (fileBuffer) {
        await MediaFile.findOneAndUpdate(
          { url: relativePath },
          {
            url: relativePath,
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype || 'image/jpeg',
            size: req.file.size || fileBuffer.length,
            data: fileBuffer,
            appType,
            category,
          },
          { upsert: true, new: true }
        );
      }
    } catch (dbErr) {
      console.warn('[MediaFile Atlas Persistence Warning]:', dbErr.message);
    }

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
// @desc    Upload multiple files and persist to MongoDB
// @access  Public
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided for upload',
      });
    }

    const appType = req.body.appType || req.query.appType || 'vendor';
    const category = req.body.category || req.query.category || 'documents';

    const uploadedFiles = [];

    for (const file of req.files) {
      const relativePath = `/uploads/${appType}/${category}/${file.filename}`.replace(/\\/g, '/');
      
      try {
        let fileBuffer = file.buffer;
        if (!fileBuffer && file.path && fs.existsSync(file.path)) {
          fileBuffer = fs.readFileSync(file.path);
        }

        if (fileBuffer) {
          await MediaFile.findOneAndUpdate(
            { url: relativePath },
            {
              url: relativePath,
              filename: file.filename,
              originalName: file.originalname,
              mimetype: file.mimetype || 'image/jpeg',
              size: file.size || fileBuffer.length,
              data: fileBuffer,
              appType,
              category,
            },
            { upsert: true, new: true }
          );
        }
      } catch (e) {
        console.warn('[MediaFile Multi Atlas Warning]:', e.message);
      }

      uploadedFiles.push({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: relativePath,
      });
    }

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
