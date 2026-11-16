const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Vendor = require('../models/Vendor');
const Customer = require('../models/Customer');

const protectCustomer = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!'
      );

      req.customer = await Customer.findById(decoded.id);

      if (!req.customer) {
        return res.status(401).json({
          success: false,
          message: 'Customer account not found or deactivated',
        });
      }

      next();
    } catch (error) {
      console.error('[Customer Auth Error]:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired customer token',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized! Customer token is missing',
    });
  }
};

const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!'
      );

      req.admin = await Admin.findById(decoded.id).select('-password');

      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin account not found or deactivated',
        });
      }

      if (!req.admin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Admin account is currently disabled',
        });
      }

      next();
    } catch (error) {
      console.error('[Auth Error]:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired authentication token',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized! Please provide a valid Bearer token',
    });
  }
};

const protectVendor = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'contract_bazar_super_secure_jwt_secret_key_2026_@#!'
      );

      req.vendor = await Vendor.findById(decoded.id).select('-password');

      if (!req.vendor) {
        return res.status(401).json({
          success: false,
          message: 'Vendor account not found or deactivated',
        });
      }

      if (req.vendor.status !== 'Approved') {
        return res.status(403).json({
          success: false,
          message: 'Vendor is not approved by Admin',
        });
      }

      next();
    } catch (error) {
      console.error('[Vendor Auth Error]:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired vendor token',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized! Vendor token is missing',
    });
  }
};

module.exports = {
  protectAdmin,
  protectVendor,
  protectCustomer,
};

