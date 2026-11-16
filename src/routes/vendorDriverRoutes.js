const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const { protectVendor } = require('../middleware/authMiddleware');

// All fleet & driver endpoints strictly isolated per logged-in vendor

// @route   GET /api/vendor/drivers
// @desc    Get all fleet drivers added by the logged-in vendor
// @access  Protected (Vendor)
router.get('/', protectVendor, async (req, res) => {
  try {
    const drivers = await Driver.find({
      vendorId: req.vendor._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: drivers.length,
      drivers,
    });
  } catch (error) {
    console.error('[Vendor Get Drivers Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor fleet',
      error: error.message,
    });
  }
});

// @route   POST /api/vendor/drivers
// @desc    Add a new driver / tractor vehicle to vendor fleet
// @access  Protected (Vendor)
router.post('/', protectVendor, async (req, res) => {
  try {
    const {
      name,
      phone,
      vehicleType,
      vehicleNumber,
      drivingLicenseNumber,
      drivingLicenseDocument,
      aadhaarNumber,
      aadhaarDocument,
      rcDocument,
      profilePhoto,
    } = req.body;

    if (!name || !phone || !vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: 'Driver name, phone number, and vehicle number are required',
      });
    }

    const cleanPhone = phone.toString().trim();

    // Check if phone already registered
    const existing = await Driver.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Driver with phone +91 ${cleanPhone} is already registered!`,
      });
    }

    const driver = await Driver.create({
      vendorId: req.vendor._id,
      vendorName: req.vendor.businessName,
      name: name.trim(),
      phone: cleanPhone,
      vehicleType: vehicleType || 'Tractor-Trolley',
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      drivingLicenseNumber: drivingLicenseNumber ? drivingLicenseNumber.trim().toUpperCase() : 'DL-PENDING',
      drivingLicenseDocument: drivingLicenseDocument || '',
      aadhaarNumber: aadhaarNumber ? aadhaarNumber.trim() : '',
      aadhaarDocument: aadhaarDocument || '',
      rcDocument: rcDocument || '',
      profilePhoto: profilePhoto || '',
      city: req.vendor.cityTown || 'Lucknow',
      state: req.vendor.state || 'Uttar Pradesh',
      status: 'Approved', // Vendor's own drivers are ready for immediate dispatch
      isOnline: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Driver added to your fleet successfully!',
      driver,
    });
  } catch (error) {
    console.error('[Vendor Add Driver Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add driver',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/drivers/:id/status
// @desc    Toggle driver availability (isOnline / Active)
// @access  Protected (Vendor)
router.put('/:id/status', protectVendor, async (req, res) => {
  try {
    const { isOnline } = req.body;

    const driver = await Driver.findOne({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found in your fleet',
      });
    }

    if (isOnline !== undefined) {
      driver.isOnline = Boolean(isOnline);
    }
    await driver.save();

    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${driver.isOnline ? 'Active' : 'Inactive'}`,
      driver,
    });
  } catch (error) {
    console.error('[Vendor Update Driver Status Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update driver status',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/drivers/:id
// @desc    Update driver profile, vehicle details, and KYC documents
// @access  Protected (Vendor)
router.put('/:id', protectVendor, async (req, res) => {
  try {
    const {
      name,
      phone,
      vehicleType,
      vehicleNumber,
      drivingLicenseNumber,
      drivingLicenseDocument,
      aadhaarNumber,
      aadhaarDocument,
      rcDocument,
      profilePhoto,
    } = req.body;

    const driver = await Driver.findOne({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found in your fleet',
      });
    }

    if (name) driver.name = name.trim();
    if (phone) {
      const cleanPhone = phone.toString().trim();
      // Check if another driver has this phone
      if (cleanPhone !== driver.phone) {
        const exist = await Driver.findOne({ phone: cleanPhone });
        if (exist) {
          return res.status(400).json({
            success: false,
            message: `Phone number +91 ${cleanPhone} is already in use by another driver`,
          });
        }
        driver.phone = cleanPhone;
      }
    }
    if (vehicleType) driver.vehicleType = vehicleType;
    if (vehicleNumber) driver.vehicleNumber = vehicleNumber.trim().toUpperCase();
    if (drivingLicenseNumber !== undefined) driver.drivingLicenseNumber = drivingLicenseNumber.trim().toUpperCase();
    if (drivingLicenseDocument) driver.drivingLicenseDocument = drivingLicenseDocument;
    if (aadhaarNumber !== undefined) driver.aadhaarNumber = aadhaarNumber.trim();
    if (aadhaarDocument) driver.aadhaarDocument = aadhaarDocument;
    if (rcDocument) driver.rcDocument = rcDocument;
    if (profilePhoto) driver.profilePhoto = profilePhoto;

    await driver.save();

    return res.status(200).json({
      success: true,
      message: `Driver '${driver.name}' details updated successfully!`,
      driver,
    });
  } catch (error) {
    console.error('[Vendor Edit Driver Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update driver details',
      error: error.message,
    });
  }
});

// @route   DELETE /api/vendor/drivers/:id
// @desc    Remove driver from vendor fleet
// @access  Protected (Vendor)
router.delete('/:id', protectVendor, async (req, res) => {
  try {
    const driver = await Driver.findOneAndDelete({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found in your fleet',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Driver removed from your fleet',
    });
  } catch (error) {
    console.error('[Vendor Delete Driver Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove driver',
      error: error.message,
    });
  }
});

// @route   GET /api/vendor/drivers/:id/tracking
// @desc    Get detailed driver tracking info with assigned orders & customer details for Vendor App
// @access  Protected (Vendor)
router.get('/:id/tracking', protectVendor, async (req, res) => {
  try {
    const driver = await Driver.findOne({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found in your fleet',
      });
    }

    const Order = require('../models/Order');
    const assignedOrders = await Order.find({
      $and: [
        {
          $or: [
            { vendorId: req.vendor._id },
            { vendor: { $regex: new RegExp(req.vendor.businessName, 'i') } },
          ],
        },
        {
          $or: [
            { driverPhone: driver.phone },
            { vehicleNumber: driver.vehicleNumber },
            { driver: driver.name },
          ],
        },
      ],
    }).sort({ createdAt: -1 });

    let completedCount = 0;
    let activeCount = 0;
    assignedOrders.forEach((o) => {
      if (o.status === 'Delivered') completedCount++;
      else if (o.status === 'Dispatched' || o.status === 'Out for Delivery') activeCount++;
    });

    return res.status(200).json({
      success: true,
      driver,
      stats: {
        totalAssigned: assignedOrders.length,
        activeCount,
        completedCount,
      },
      assignedOrders,
    });
  } catch (error) {
    console.error('[Vendor Get Driver Tracking Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load driver tracking details',
      error: error.message,
    });
  }
});

module.exports = router;

