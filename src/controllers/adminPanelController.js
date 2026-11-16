const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const Order = require('../models/Order');
const SystemSettings = require('../models/SystemSettings');
const Driver = require('../models/Driver');
const Product = require('../models/Product');

// ==========================================
// OPTIMIZED DASHBOARD STATS (Fast Parallel Aggregate)
// ==========================================
const getDashboardStats = async (req, res) => {
  try {
    // 7 Days Weekly Dates Array calculation for chart
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Run all database queries in parallel with Promise.all for maximum speed
    const [
      totalOrdersCount,
      pendingOrdersCount,
      deliveredOrdersCount,
      totalVendorsCount,
      pendingVendorsCount,
      approvedVendorsCount,
      financialStats,
      weeklyStats,
      categoryStats,
      recentOrders,
      recentVendors,
    ] = await Promise.all([
      // 1. Total Orders
      Order.countDocuments(),

      // 2. Pending/Active Orders
      Order.countDocuments({
        status: { $in: ['Pending', 'Confirmed', 'Dispatched', 'Out for Delivery'] },
      }),

      // 3. Delivered Orders
      Order.countDocuments({ status: 'Delivered' }),

      // 4. Total Vendors
      Vendor.countDocuments(),

      // 5. Pending KYC Vendors
      Vendor.countDocuments({ status: 'Pending' }),

      // 6. Approved Vendors
      Vendor.countDocuments({ status: 'Approved' }),

      // 7. Overall Revenue & Commission
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$adminCommission' },
            totalDeliveryCharges: { $sum: '$deliveryCharge' },
          },
        },
      ]),

      // 8. 7-Day Day-by-Day Revenue Trend (Aggregation Pipeline)
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            dailyRevenue: { $sum: '$totalAmount' },
            dailyCommission: { $sum: '$adminCommission' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 9. Vendor Distribution by Business Type
      Vendor.aggregate([
        {
          $group: {
            _id: '$businessType',
            count: { $sum: 1 },
          },
        },
      ]),

      // 10. Recent Orders (Indexed Sort)
      Order.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .select('orderId customer customerPhone vendor items totalAmount adminCommission paymentMode status createdAt')
        .lean(),

      // 11. Recent Pending KYC Vendors
      Vendor.find({ status: 'Pending' })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('businessName ownerFullName mobileNumber businessType state district fullShopAddress status createdAt')
        .lean(),
    ]);

    // Build complete 7-day chart dataset (fill 0 for days without orders)
    const dayNames = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
    const chartLabels = [];
    const revenueTrendData = [];
    const commissionTrendData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = `${dayNames[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;
      chartLabels.push(dayLabel);

      const dayMatch = weeklyStats.find((item) => item._id === dateStr);
      revenueTrendData.push(dayMatch ? dayMatch.dailyRevenue : 0);
      commissionTrendData.push(dayMatch ? dayMatch.dailyCommission : 0);
    }

    const totalRevenue = financialStats[0]?.totalRevenue || 0;
    const totalCommission = financialStats[0]?.totalCommission || 0;
    const totalDeliveryCharges = financialStats[0]?.totalDeliveryCharges || 0;

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        totalOrdersCount,
        pendingOrdersCount,
        deliveredOrdersCount,
        totalVendorsCount,
        pendingVendorsCount,
        approvedVendorsCount,
        totalRevenue,
        totalCommission,
        totalDeliveryCharges,
      },
      chart: {
        categories: chartLabels,
        revenueData: revenueTrendData,
        commissionData: commissionTrendData,
      },
      vendorDistribution: categoryStats,
      recentOrders,
      recentVendors,
    });
  } catch (error) {
    console.error('[Dashboard Stats Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate dashboard data',
      error: error.message,
    });
  }
};

// ==========================================
// CATEGORIES CONTROLLERS (Delegated to CategoryController)
// ==========================================
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('./categoryController');

// ==========================================
// VENDORS CONTROLLERS
// ==========================================
const getVendors = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (category && category !== 'All') {
      filter.$or = [
        { businessCategories: { $in: [new RegExp(category, 'i')] } },
        { businessType: { $regex: category, $options: 'i' } }
      ];
    }

    if (search && search.trim() !== '') {
      const q = search.trim();
      const searchCriteria = [
        { businessName: { $regex: q, $options: 'i' } },
        { ownerFullName: { $regex: q, $options: 'i' } },
        { mobileNumber: { $regex: q, $options: 'i' } },
        { fullShopAddress: { $regex: q, $options: 'i' } },
        { businessCategories: { $in: [new RegExp(q, 'i')] } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchCriteria }];
        delete filter.$or;
      } else {
        filter.$or = searchCriteria;
      }
    }

    const vendors = await Vendor.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: vendors.length, vendors });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateVendorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, freeDeliveryKm, perKmCharge, customCommissions } = req.body;

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (status) {
      // Rule: Once Approved, cannot be directly Rejected (can only be Blocked or Suspended)
      if (vendor.status === 'Approved' && status === 'Rejected') {
        return res.status(400).json({
          success: false,
          message: 'An Approved vendor cannot be Rejected. You can Block or Deactivate the vendor instead.',
        });
      }
      vendor.status = status;
    }

    if (rejectionReason !== undefined) vendor.rejectionReason = rejectionReason;
    if (freeDeliveryKm !== undefined) vendor.freeDeliveryKm = Number(freeDeliveryKm);
    if (perKmCharge !== undefined) vendor.perKmCharge = Number(perKmCharge);
    if (customCommissions !== undefined) vendor.customCommissions = customCommissions;

    await vendor.save();
    return res.status(200).json({ success: true, message: `Vendor status updated to ${vendor.status}`, vendor });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createVendor = async (req, res) => {
  try {
    const {
      ownerFullName,
      mobileNumber,
      alternateMobile,
      emailAddress,
      businessName,
      businessType,
      businessCategories,
      businessDescription,
      fullShopAddress,
      cityTown,
      district,
      state,
      pincode,
      landmark,
      latitude,
      longitude,
      aadhaarNumber,
      panNumber,
      gstNumber,
      freeDeliveryKm,
      perKmCharge,
      status,
    } = req.body;

    if (!ownerFullName || !mobileNumber || !businessName) {
      return res.status(400).json({
        success: false,
        message: 'Owner name, mobile number, and business name are required',
      });
    }

    const existingVendor = await Vendor.findOne({ mobileNumber });
    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: `Vendor with mobile number ${mobileNumber} already exists`,
      });
    }

    const newVendor = await Vendor.create({
      ownerFullName,
      mobileNumber,
      alternateMobile: alternateMobile || '',
      emailAddress: emailAddress || '',
      businessName,
      businessType: businessType || 'Building Material Shop',
      businessCategories: businessCategories || [],
      businessDescription: businessDescription || '',
      fullShopAddress: fullShopAddress || '',
      cityTown: cityTown || '',
      district: district || 'Lucknow',
      state: state || 'Uttar Pradesh',
      pincode: pincode || '226001',
      landmark: landmark || '',
      latitude: latitude || 26.8467,
      longitude: longitude || 80.9462,
      location: {
        type: 'Point',
        coordinates: [longitude ? Number(longitude) : 80.9462, latitude ? Number(latitude) : 26.8467],
        address: fullShopAddress || '',
      },
      aadhaarNumber: aadhaarNumber || '',
      panNumber: panNumber || '',
      gstNumber: gstNumber || '',
      freeDeliveryKm: freeDeliveryKm ? Number(freeDeliveryKm) : 5,
      perKmCharge: perKmCharge ? Number(perKmCharge) : 15,
      status: status || 'Pending',
    });

    return res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      vendor: newVendor,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    return res.status(200).json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ORDERS CONTROLLERS
// ==========================================
const getOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (search && search.trim() !== '') {
      const q = search.trim();
      filter.$or = [
        { orderId: { $regex: q, $options: 'i' } },
        { customer: { $regex: q, $options: 'i' } },
        { vendor: { $regex: q, $options: 'i' } },
        { customerPhone: { $regex: q, $options: 'i' } },
      ];
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, driver } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (status) {
      order.status = status;
    }

    if (driver !== undefined) {
      order.driver = driver;
    }

    await order.save();
    return res.status(200).json({
      success: true,
      message: `Order status updated to ${order.status}`,
      order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createOrder = async (req, res) => {
  try {
    const {
      customer,
      customerPhone,
      vendor,
      vendorId,
      category,
      items,
      totalAmount,
      deliveryCharge,
      adminCommission,
      paymentMode,
      siteAddress,
      driver,
    } = req.body;

    if (!customer || !customerPhone || !items || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, phone, items, and total amount are required',
      });
    }

    // Auto-generate order ID like CB-91823
    const orderId = `CB-${Math.floor(10000 + Math.random() * 90000)}`;
    const deliveryOtp = `${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder = await Order.create({
      orderId,
      customer,
      customerPhone,
      vendor: vendor || 'Direct Contractor Bazar Store',
      vendorId: vendorId || null,
      category: category || 'Bricks & Cement',
      items,
      totalAmount: Number(totalAmount),
      deliveryCharge: deliveryCharge ? Number(deliveryCharge) : 0,
      adminCommission: adminCommission ? Number(adminCommission) : Math.round(Number(totalAmount) * 0.05),
      paymentMode: paymentMode || 'COD',
      status: 'Pending',
      driver: driver || 'Not Assigned',
      deliveryOtp,
      siteAddress: siteAddress || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: newOrder,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndDelete(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.status(200).json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// REVENUE & COMMISSION REPORT CONTROLLER
// ==========================================
const getRevenueCommissionStats = async (req, res) => {
  try {
    const { timeRange } = req.query; // '7days', '30days', 'all'
    const now = new Date();
    let startDate = new Date();

    if (timeRange === '30days') {
      startDate.setDate(now.getDate() - 30);
    } else if (timeRange === 'all') {
      startDate = new Date(2020, 0, 1);
    } else {
      // default 7 days
      startDate.setDate(now.getDate() - 7);
    }
    startDate.setHours(0, 0, 0, 0);

    const [
      overallTotals,
      commissionByCategory,
      commissionByVendor,
      recentCommissionOrders,
    ] = await Promise.all([
      // Overall Financials
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalGrossSales: { $sum: '$totalAmount' },
            totalAdminCommission: { $sum: '$adminCommission' },
            totalDeliveryCharges: { $sum: '$deliveryCharge' },
            totalVendorPayout: {
              $sum: { $subtract: ['$totalAmount', '$adminCommission'] },
            },
            totalOrders: { $sum: 1 },
          },
        },
      ]),

      // Commission Breakdown by Material/Category
      Order.aggregate([
        {
          $group: {
            _id: { $ifNull: ['$category', 'Other Materials'] },
            totalSales: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$adminCommission' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { totalCommission: -1 } },
      ]),

      // Top Earning Vendors
      Order.aggregate([
        {
          $group: {
            _id: '$vendor',
            vendorSales: { $sum: '$totalAmount' },
            platformCommission: { $sum: '$adminCommission' },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { platformCommission: -1 } },
        { $limit: 10 },
      ]),

      // Recent 20 Financial Transactions from Orders
      Order.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .select('orderId customer vendor category items totalAmount deliveryCharge adminCommission paymentMode status createdAt')
        .lean(),
    ]);

    const totals = overallTotals[0] || {
      totalGrossSales: 0,
      totalAdminCommission: 0,
      totalDeliveryCharges: 0,
      totalVendorPayout: 0,
      totalOrders: 0,
    };

    return res.status(200).json({
      success: true,
      totals,
      commissionByCategory,
      commissionByVendor,
      recentTransactions: recentCommissionOrders,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// SYSTEM SETTINGS CONTROLLERS
// ==========================================
const getSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    return res.status(200).json({ success: true, settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();
    return res.status(200).json({
      success: true,
      message: 'Platform settings updated successfully',
      settings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// DRIVERS / DELIVERY FLEET CONTROLLERS
// ==========================================
const getDrivers = async (req, res) => {
  try {
    const { status, vehicleType, search } = req.query;
    const filter = {};

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (vehicleType && vehicleType !== 'All') {
      filter.vehicleType = vehicleType;
    }

    if (search && search.trim() !== '') {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { vehicleNumber: { $regex: q, $options: 'i' } },
        { drivingLicenseNumber: { $regex: q, $options: 'i' } },
        { city: { $regex: q, $options: 'i' } },
      ];
    }

    const drivers = await Driver.find(filter).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, count: drivers.length, drivers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    if (status) {
      driver.status = status;
    }

    if (rejectionReason !== undefined) {
      driver.rejectionReason = rejectionReason;
    }

    await driver.save();
    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${driver.status}`,
      driver,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createDriver = async (req, res) => {
  try {
    const {
      name,
      phone,
      vehicleType,
      vehicleNumber,
      drivingLicenseNumber,
      aadhaarNumber,
      city,
      state,
      status,
      isOnline,
    } = req.body;

    if (!name || !phone || !vehicleNumber || !drivingLicenseNumber) {
      return res.status(400).json({
        success: false,
        message: 'Driver name, phone, vehicle number, and driving license are required',
      });
    }

    const existingDriver = await Driver.findOne({ phone });
    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: `Driver with phone ${phone} already exists`,
      });
    }

    const newDriver = await Driver.create({
      name,
      phone,
      vehicleType: vehicleType || 'Tractor-Trolley',
      vehicleNumber,
      drivingLicenseNumber,
      aadhaarNumber: aadhaarNumber || '',
      city: city || 'Lucknow',
      state: state || 'Uttar Pradesh',
      status: status || 'Approved',
      isOnline: isOnline !== undefined ? isOnline : true,
      totalTripsCompleted: 0,
      rating: 5.0,
    });

    return res.status(201).json({
      success: true,
      message: 'Driver registered successfully',
      driver: newDriver,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findByIdAndDelete(id);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    return res.status(200).json({ success: true, message: 'Driver deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// VENDOR 360° DETAILED PROFILE & WORK TRACKING
// ==========================================
const getVendorDetail360 = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id).select('-password');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Parallel fetch: Products, Orders, Fleet Drivers
    const [products, orders, drivers] = await Promise.all([
      Product.find({ vendorId: id }).sort({ createdAt: -1 }),
      Order.find({
        $or: [
          { vendorId: id },
          { vendor: { $regex: new RegExp(vendor.businessName, 'i') } }
        ]
      }).sort({ createdAt: -1 }),
      Driver.find({ vendorId: id }).sort({ createdAt: -1 }),
    ]);

    // Financial & Operational Metrics
    let totalGrossRevenue = 0;
    let totalAdminCommission = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    let dispatchedCount = 0;
    let cancelledCount = 0;
    const uniqueCustomerMap = new Map();

    orders.forEach((ord) => {
      totalGrossRevenue += Number(ord.totalAmount) || 0;
      totalAdminCommission += Number(ord.adminCommission) || 0;

      if (ord.status === 'Delivered') deliveredCount++;
      else if (ord.status === 'Dispatched' || ord.status === 'Out for Delivery') dispatchedCount++;
      else if (ord.status === 'Cancelled') cancelledCount++;
      else pendingCount++;

      if (ord.customerPhone) {
        if (!uniqueCustomerMap.has(ord.customerPhone)) {
          uniqueCustomerMap.set(ord.customerPhone, {
            name: ord.customer || 'Customer',
            phone: ord.customerPhone,
            totalOrders: 0,
            totalSpent: 0,
            lastOrderDate: ord.createdAt,
          });
        }
        const cData = uniqueCustomerMap.get(ord.customerPhone);
        cData.totalOrders++;
        cData.totalSpent += Number(ord.totalAmount) || 0;
      }
    });

    const vendorNetPayout = totalGrossRevenue - totalAdminCommission;

    return res.status(200).json({
      success: true,
      vendor,
      stats: {
        totalProducts: products.length,
        totalOrders: orders.length,
        deliveredCount,
        pendingCount,
        dispatchedCount,
        cancelledCount,
        totalDrivers: drivers.length,
        totalCustomers: uniqueCustomerMap.size,
        totalGrossRevenue,
        totalAdminCommission,
        vendorNetPayout,
      },
      products,
      orders,
      drivers,
      customers: Array.from(uniqueCustomerMap.values()),
    });
  } catch (error) {
    console.error('[Get Vendor 360 Detail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// DRIVER 360° DETAILED PROFILE & ORDER TRIP TRACKING
// ==========================================
const getDriverDetail360 = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id).populate('vendorId', 'businessName ownerName contactNumber fullShopAddress');
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    // Find all trips assigned to this driver by phone or name or vehicleNumber
    const assignedOrders = await Order.find({
      $or: [
        { driverPhone: driver.phone },
        { vehicleNumber: driver.vehicleNumber },
        { driver: driver.name },
      ]
    }).sort({ createdAt: -1 });

    let totalTrips = assignedOrders.length;
    let completedTrips = 0;
    let activeTrips = 0;
    let totalDriverEarnings = 0;

    assignedOrders.forEach((o) => {
      const charge = Number(o.deliveryCharge) || 450;
      totalDriverEarnings += charge;
      if (o.status === 'Delivered') completedTrips++;
      else if (o.status === 'Dispatched' || o.status === 'Out for Delivery') activeTrips++;
    });

    return res.status(200).json({
      success: true,
      driver,
      vendor: driver.vendorId || { businessName: driver.vendorName || 'Not Attached' },
      stats: {
        totalTrips,
        completedTrips,
        activeTrips,
        totalDriverEarnings,
      },
      assignedOrders,
    });
  } catch (error) {
    console.error('[Get Driver 360 Detail Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getVendors,
  createVendor,
  updateVendorStatus,
  deleteVendor,
  getVendorDetail360,
  getOrders,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  getRevenueCommissionStats,
  getSettings,
  updateSettings,
  getDrivers,
  createDriver,
  updateDriverStatus,
  deleteDriver,
  getDriverDetail360,
};
