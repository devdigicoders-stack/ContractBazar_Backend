const express = require('express');
const router = express.Router();
const { loginAdmin, getAdminProfile, changeAdminPassword } = require('../controllers/adminAuthController');
const { protectAdmin } = require('../middleware/authMiddleware');

// Public route: Login
router.post('/login', loginAdmin);

// Protected route: Check current profile / verify token
router.get('/me', protectAdmin, getAdminProfile);

// Protected route: Change Password
router.put('/change-password', protectAdmin, changeAdminPassword);

module.exports = router;

