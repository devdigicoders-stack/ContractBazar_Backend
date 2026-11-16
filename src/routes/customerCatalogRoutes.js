const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');

// @route   GET /api/customer/catalog/categories
// @desc    Get all active construction categories configured by Admin
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find({ status: 'Active' }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error('[Get Customer Categories Error]:', error);
    return res.status(500).json({ success: false, message: error.message, categories: [] });
  }
});

// @route   GET /api/customer/catalog/vendors
// @desc    Get all active & approved vendors/bhatthas, optionally filtered by category
// @access  Public
router.get('/vendors', async (req, res) => {
  try {
    const { category, search, lat, lng } = req.query;

    const filter = {
      status: 'Approved',
      isStoreOnline: true,
    };

    if (category && category !== 'All') {
      filter.businessCategories = { $regex: new RegExp(category, 'i') };
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const cleanSearch = search.trim();
      filter.$or = [
        { businessName: { $regex: new RegExp(cleanSearch, 'i') } },
        { fullShopAddress: { $regex: new RegExp(cleanSearch, 'i') } },
        { cityTown: { $regex: new RegExp(cleanSearch, 'i') } },
        { areaLocality: { $regex: new RegExp(cleanSearch, 'i') } },
      ];
    }

    const vendors = await Vendor.find(filter)
      .select('-password -aadhaarFrontImg -aadhaarBackImg -panCardImg -shopProofDoc')
      .sort({ createdAt: -1 });

    // For each vendor, attach their active products
    const vendorListWithProducts = await Promise.all(
      vendors.map(async (v) => {
        const productFilter = {
          vendorId: v._id,
          isActive: true,
        };
        if (category && category !== 'All') {
          productFilter.categoryName = { $regex: new RegExp(category, 'i') };
        }

        const products = await Product.find(productFilter).sort({ inStock: -1, price: 1 });

        return {
          id: v._id,
          name: v.businessName,
          ownerName: v.ownerFullName,
          mobileNumber: v.mobileNumber,
          vendorType: v.businessType || 'Building Material Store',
          address: v.fullShopAddress,
          city: v.cityTown,
          district: v.district,
          state: v.state,
          pincode: v.pincode,
          mapLocation: v.mapLocation || '',
          freeDeliveryKm: v.freeDeliveryKm || 5.0,
          perKmCharge: v.perKmCharge || 15.0,
          isStoreOnline: v.isStoreOnline,
          categories: v.businessCategories,
          productsCount: products.length,
          products: products.map((p) => ({
            id: p._id,
            name: p.name,
            categoryName: p.categoryName,
            brandName: p.brandName,
            unit: p.unit,
            price: p.price,
            discountPrice: p.discountPrice,
            inStock: p.inStock,
            image: p.image,
            images: p.images,
            description: p.description,
          })),
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: vendorListWithProducts.length,
      vendors: vendorListWithProducts,
    });
  } catch (error) {
    console.error('[Get Customer Vendors Error]:', error);
    return res.status(500).json({ success: false, message: error.message, vendors: [] });
  }
});

// @route   GET /api/customer/catalog/vendors/:id
// @desc    Get single vendor details and their complete product list
// @access  Public
router.get('/vendors/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .select('-password -aadhaarFrontImg -aadhaarBackImg -panCardImg -shopProofDoc');

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const products = await Product.find({
      vendorId: vendor._id,
      isActive: true,
    }).sort({ inStock: -1, price: 1 });

    return res.status(200).json({
      success: true,
      vendor: {
        id: vendor._id,
        name: vendor.businessName,
        ownerName: vendor.ownerFullName,
        mobileNumber: vendor.mobileNumber,
        vendorType: vendor.businessType || 'Building Material Store',
        address: vendor.fullShopAddress,
        city: vendor.cityTown,
        district: vendor.district,
        state: vendor.state,
        pincode: vendor.pincode,
        freeDeliveryKm: vendor.freeDeliveryKm || 5.0,
        perKmCharge: vendor.perKmCharge || 15.0,
        isStoreOnline: vendor.isStoreOnline,
        categories: vendor.businessCategories,
        products,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

