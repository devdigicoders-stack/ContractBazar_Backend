const Category = require('../models/Category');
const Vendor = require('../models/Vendor');

// Initial default construction categories for Contract Bazar
const defaultConstructionCategories = [
  {
    name: 'Bricks (ईंट / भट्ठा)',
    hindiName: 'ईंट',
    commissionType: 'percentage',
    commissionRate: 5,
    status: 'Active',
    units: ['Piece (नग)', '1,000 Pieces (हज़ार ईंट)', 'Trolley (ट्रॉली)', 'Truck (ट्रक)'],
    description: '1st Class Red Clay Bricks, Fly Ash Bricks, Cement Blocks for construction.',
  },
  {
    name: 'Morang (मौरंग)',
    hindiName: 'मौरंग',
    commissionType: 'percentage',
    commissionRate: 4,
    status: 'Active',
    units: ['CFT (Cubic Feet)', 'Brass (100 CFT)', 'Ton (टन)', 'Trolley (120 CFT)', 'Dumper (500 CFT)'],
    description: 'Red Coarse Morang for concrete foundation and column casting.',
  },
  {
    name: 'Sand / Balu (बालू)',
    hindiName: 'बालू',
    commissionType: 'percentage',
    commissionRate: 4,
    status: 'Active',
    units: ['CFT (Cubic Feet)', 'Brass (100 CFT)', 'Ton (टन)', 'Trolley', 'Dumper'],
    description: 'River Sand / Fine Balu for plastering and brick masonry work.',
  },
  {
    name: 'Cement (सीमेंट)',
    hindiName: 'सीमेंट',
    commissionType: 'fixed',
    commissionRate: 15,
    status: 'Active',
    units: ['Bag (50 KG बोरी)', 'Ton (20 Bags)', 'Truckload (200-400 Bags)'],
    description: 'OPC & PPC 43 / 53 Grade Cement (UltraTech, Ambuja, ACC, etc.).',
  },
  {
    name: 'Iron & Steel (सरिया / TMT)',
    hindiName: 'सरिया',
    commissionType: 'percentage',
    commissionRate: 2.5,
    status: 'Active',
    units: ['KG (किलोग्राम)', 'Quintal (100 KG)', 'Ton (1,000 KG)', 'Piece (12m Rod)', 'Bundle'],
    description: 'Fe 550D / Fe 500 TMT Steel Rebars (8mm, 10mm, 12mm, 16mm, 20mm, 25mm).',
  },
  {
    name: 'Gitti / Aggregate (गिट्टी)',
    hindiName: 'गिट्टी',
    commissionType: 'percentage',
    commissionRate: 4,
    status: 'Active',
    units: ['CFT (Cubic Feet)', 'Brass (100 CFT)', 'Ton (टन)', 'Dumper (500 CFT)'],
    description: '10mm, 20mm and 40mm crushed blue stone aggregate for concrete.',
  },
];

// @desc    Get all categories with active vendors count
// @route   GET /api/admin/panel/categories
// @access  Private (Admin Protected)
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 }).lean();

    // Enhance each category with vendor count from Vendor model
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const keyword = cat.name.split(' ')[0];
        const vendorCount = await Vendor.countDocuments({
          businessCategories: { $regex: keyword, $options: 'i' },
        });

        return {
          ...cat,
          totalVendors: vendorCount,
          activeProducts: 0,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: categoriesWithCounts.length,
      categories: categoriesWithCounts,
    });
  } catch (error) {
    console.error('[Get Categories Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new Category
// @route   POST /api/admin/panel/categories
// @access  Private (Admin Protected)
const createCategory = async (req, res) => {
  try {
    const { name, commissionType, commissionRate, hindiName, status, units, description, image, icon } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required (उदा. Bricks, Cement)',
      });
    }

    if (commissionRate === undefined || commissionRate === null || isNaN(commissionRate)) {
      return res.status(400).json({
        success: false,
        message: 'Valid commission rate is required',
      });
    }

    const rate = parseFloat(commissionRate);
    if (rate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Commission rate cannot be negative',
      });
    }

    const existing = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Category "${name.trim()}" already exists!`,
      });
    }

    const newCategory = new Category({
      name: name.trim(),
      hindiName: hindiName ? hindiName.trim() : '',
      commissionType: commissionType === 'fixed' ? 'fixed' : 'percentage',
      commissionRate: rate,
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      units: Array.isArray(units) ? units : (units ? [units] : []),
      description: description ? description.trim() : '',
      image: image ? image.trim() : '',
      icon: icon ? icon.trim() : '',
    });

    await newCategory.save();

    return res.status(201).json({
      success: true,
      message: `Category "${newCategory.name}" created successfully!`,
      category: newCategory,
    });
  } catch (error) {
    console.error('[Create Category Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an existing Category
// @route   PUT /api/admin/panel/categories/:id
// @access  Private (Admin Protected)
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, commissionType, commissionRate, hindiName, status, units, description, image, icon } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (name && name.trim() !== '') {
      category.name = name.trim();
    }
    if (hindiName !== undefined) {
      category.hindiName = hindiName.trim();
    }
    if (commissionType) {
      category.commissionType = commissionType === 'fixed' ? 'fixed' : 'percentage';
    }
    if (commissionRate !== undefined && !isNaN(commissionRate)) {
      const rate = parseFloat(commissionRate);
      if (rate < 0) {
        return res.status(400).json({ success: false, message: 'Commission rate cannot be negative' });
      }
      category.commissionRate = rate;
    }
    if (status) {
      category.status = status === 'Inactive' ? 'Inactive' : 'Active';
    }
    if (units !== undefined) {
      category.units = Array.isArray(units) ? units : (units ? [units] : []);
    }
    if (description !== undefined) {
      category.description = description.trim();
    }
    if (image !== undefined) {
      category.image = image ? image.trim() : '';
    }
    if (icon !== undefined) {
      category.icon = icon ? icon.trim() : '';
    }

    await category.save();

    return res.status(200).json({
      success: true,
      message: `Category "${category.name}" updated successfully!`,
      category,
    });
  } catch (error) {
    console.error('[Update Category Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a Category
// @route   DELETE /api/admin/panel/categories/:id
// @access  Private (Admin Protected)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await Category.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Category "${category.name}" deleted successfully!`,
    });
  } catch (error) {
    console.error('[Delete Category Error]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Public Categories Route (For CustomerApp & VendorApp)
// @route   GET /api/categories
// @access  Public
const getPublicCategories = async (req, res) => {
  try {
    const categories = await Category.find({ status: 'Active' }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getPublicCategories,
};

