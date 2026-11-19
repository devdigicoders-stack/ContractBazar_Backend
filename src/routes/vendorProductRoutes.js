const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protectVendor } = require('../middleware/authMiddleware');
const { sendPushNotification } = require('../services/notificationService');

// Helper to notify subscribed customers when a product is restocked
async function notifySubscribersOnRestock(product, oldStock, newStock) {
  try {
    const wasOutOfStock = oldStock <= 0 || product.inStock === false;
    const isNowInStock = newStock > 0 && product.inStock === true;

    if (wasOutOfStock && isNowInStock && product.stockSubscribers && product.stockSubscribers.length > 0) {
      const Customer = require('../models/Customer');
      // Resolve valid FCM tokens for subscribers
      const tokens = [];
      for (const sub of product.stockSubscribers) {
        if (sub.fcmToken && sub.fcmToken.length > 10) {
          tokens.push(sub.fcmToken);
        } else if (sub.phone) {
          const cust = await Customer.findOne({ mobileNumber: sub.phone.toString().trim() });
          if (cust && cust.fcmToken && cust.fcmToken.length > 10) {
            tokens.push(cust.fcmToken);
          }
        }
      }

      const uniqueTokens = [...new Set(tokens)];

      if (uniqueTokens.length > 0) {
        console.log(`[Restock Alert] Sending push notification to ${uniqueTokens.length} customer(s) for restocked item: ${product.name}`);
        await sendPushNotification({
          tokens: uniqueTokens,
          title: '🎉 Item Back In Stock!',
          body: `${product.name} ab uplabdh hai! Turant order karein isse pehle ki stock phir se khatam ho jaye.`,
          data: {
            productId: product._id.toString(),
            category: product.categoryName || '',
            type: 'PRODUCT_BACK_IN_STOCK',
          },
        });
      }

      // Clear subscribers list after notifying
      product.stockSubscribers = [];
      await product.save();
    }
  } catch (err) {
    console.warn('[Notify Restock Subscribers Warning]:', err.message);
  }
}

// All catalog and rate endpoints are strictly isolated per logged-in vendor

// @route   GET /api/vendor/products
// @desc    Get all catalog products & rates belonging strictly to the logged-in vendor
// @access  Protected (Vendor)
router.get('/', protectVendor, async (req, res) => {
  try {
    const { category, inStock } = req.query;
    const filter = { vendorId: req.vendor._id };

    if (category && category !== 'All') {
      filter.categoryName = { $regex: new RegExp(category, 'i') };
    }
    if (inStock !== undefined) {
      filter.inStock = inStock === 'true';
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error('[Vendor Get Products Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor catalog',
      error: error.message,
    });
  }
});

// @route   POST /api/vendor/products
// @desc    Add a new product to vendor catalog with unit, price, and stock
// @access  Protected (Vendor)
router.post('/', protectVendor, async (req, res) => {
  try {
    const {
      name,
      categoryName,
      brandName,
      qualityGrade,
      unit,
      price,
      discountPrice,
      minOrderQuantity,
      maxOrderQuantity,
      availableStock,
      stockUnit,
      inStock,
      image,
      images,
      description,
      dimensions,
      weight,
      freeDeliveryDistanceKm,
      additionalDeliveryChargePerKm,
      isActive,
    } = req.body;

    if (!name || !price || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Product name, price, and unit are required',
      });
    }

    const product = await Product.create({
      vendorId: req.vendor._id,
      vendorName: req.vendor.businessName,
      name,
      categoryName: categoryName || 'Construction Material',
      brandName: brandName || '',
      qualityGrade: qualityGrade || '',
      unit,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : null,
      minOrderQuantity: minOrderQuantity ? Number(minOrderQuantity) : 1,
      maxOrderQuantity: maxOrderQuantity ? Number(maxOrderQuantity) : null,
      availableStock: availableStock ? Number(availableStock) : 1000,
      stockUnit: stockUnit || 'Pieces',
      inStock: inStock !== undefined ? inStock : true,
      image: image || (images && images.length > 0 ? images[0] : ''),
      images: images || [],
      description: description || '',
      dimensions: dimensions || '',
      weight: weight || '',
      freeDeliveryDistanceKm: freeDeliveryDistanceKm ? Number(freeDeliveryDistanceKm) : 5,
      additionalDeliveryChargePerKm: additionalDeliveryChargePerKm ? Number(additionalDeliveryChargePerKm) : 15,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      success: true,
      message: 'Product added to catalog successfully!',
      product,
    });
  } catch (error) {
    console.error('[Vendor Add Product Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add product',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/products/:id
// @desc    Update complete product details (Name, price, category, stock, image, description)
// @access  Protected (Vendor)
router.put('/:id', protectVendor, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in your catalog',
      });
    }

    const updatableFields = [
      'name',
      'categoryName',
      'brandName',
      'qualityGrade',
      'unit',
      'price',
      'discountPrice',
      'minOrderQuantity',
      'maxOrderQuantity',
      'availableStock',
      'stockUnit',
      'inStock',
      'image',
      'images',
      'description',
      'dimensions',
      'weight',
      'freeDeliveryDistanceKm',
      'additionalDeliveryChargePerKm',
      'isActive',
    ];

    const previousStock = product.availableStock != null ? product.availableStock : 1000;

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    if (product.availableStock !== undefined) {
      if (product.availableStock <= 0) {
        product.inStock = false;
      } else {
        product.inStock = true;
      }
    }

    await product.save();

    // Check if restocked and notify interested customers
    await notifySubscribersOnRestock(product, previousStock, product.availableStock);

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully!',
      product,
    });
  } catch (error) {
    console.error('[Vendor Update Product Full Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product details',
      error: error.message,
    });
  }
});

// @route   PUT /api/vendor/products/:id/rate
// @desc    Fast rate & stock updater (Discussion rule: Daily rate change with 1 tap)
// @access  Protected (Vendor)
router.put('/:id/rate', protectVendor, async (req, res) => {
  try {
    const { price, discountPrice, inStock, availableStock } = req.body;

    const product = await Product.findOne({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in your catalog',
      });
    }

    const previousStock = product.availableStock != null ? product.availableStock : 1000;

    if (price !== undefined) product.price = Number(price);
    if (discountPrice !== undefined) product.discountPrice = discountPrice ? Number(discountPrice) : null;
    if (availableStock !== undefined) {
      product.availableStock = Number(availableStock);
      // If stock > 0, automatically mark product inStock as true! If stock <= 0, mark inStock as false.
      if (product.availableStock <= 0) {
        product.inStock = false;
      } else {
        product.inStock = true;
      }
    } else if (inStock !== undefined) {
      product.inStock = Boolean(inStock);
    }

    await product.save();

    // Check if restocked and notify
    await notifySubscribersOnRestock(product, previousStock, product.availableStock);

    return res.status(200).json({
      success: true,
      message: 'Rate & stock updated successfully!',
      product,
    });
  } catch (error) {
    console.error('[Vendor Update Rate Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update rate',
      error: error.message,
    });
  }
});

// @route   DELETE /api/vendor/products/:id
// @desc    Delete product from vendor catalog
// @access  Protected (Vendor)
router.delete('/:id', protectVendor, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      vendorId: req.vendor._id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in your catalog',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product removed from catalog',
    });
  } catch (error) {
    console.error('[Vendor Delete Product Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message,
    });
  }
});

module.exports = router;

