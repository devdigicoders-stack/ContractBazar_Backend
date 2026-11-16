const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Helper to generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!',
    {
      expiresIn: process.env.JWT_EXPIRE || '30d',
    }
  );
};

// @desc    Admin Login
// @route   POST /api/admin/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    // Check if admin exists (need password explicitly because select: false)
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your admin account has been deactivated. Please contact support.',
      });
    }

    // Check password
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Update lastLogin
    admin.lastLogin = new Date();
    await admin.save({ validateBeforeSave: false });

    // Generate JWT
    const token = generateToken(admin._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful! Welcome to Contract Bazar Admin Panel.',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        phone: admin.phone,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    console.error('[Admin Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during admin login',
      error: error.message,
    });
  }
};

// @desc    Get Current Logged-in Admin Profile
// @route   GET /api/admin/auth/me
// @access  Private (Admin Protected)
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('-password');
    return res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error('[Admin Profile Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin profile',
      error: error.message,
    });
  }
};

// @desc    Change Admin Password
// @route   PUT /api/admin/auth/change-password
// @access  Private (Admin Protected)
const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password, new password, and confirm password are required',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Get admin with password field
    const admin = await Admin.findById(req.admin._id).select('+password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found',
      });
    }

    // Verify current password
    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password (pre-save hook will hash it)
    admin.password = newPassword;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully! You can now login with your new password.',
    });
  } catch (error) {
    console.error('[Change Password Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message,
    });
  }
};

module.exports = {
  loginAdmin,
  getAdminProfile,
  changeAdminPassword,
};

