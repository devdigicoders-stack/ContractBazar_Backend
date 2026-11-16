const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage configuration with dynamic folder routing by category / document type
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // App wise / Category wise subfolders
    // e.g., 'vendor/aadhaar', 'vendor/pan', 'vendor/shop_proof', 'vendor/profile', 'vendor/shop_photos'
    const appType = req.body.appType || req.query.appType || 'vendor';
    const category = req.body.category || req.query.category || file.fieldname || 'documents';
    
    // Clean string for folder name
    const safeApp = appType.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');

    const targetDir = path.join(__dirname, '../../uploads', safeApp, safeCategory);

    // Ensure directory exists recursively
    fs.mkdirSync(targetDir, { recursive: true });

    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  },
});

// File filter (accept common image & pdf formats)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|pdf|doc|docx/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (allowedTypes.test(ext) || allowedTypes.test(mime)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type! Only JPG, PNG, WEBP, and PDF documents are allowed.'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit per document
  },
  fileFilter,
});

module.exports = upload;

