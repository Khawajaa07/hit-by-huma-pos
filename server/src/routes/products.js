const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all products with variants
router.get('/', async (req, res, next) => {
  try {
    const { categoryId, search, page = 1, limit = 50, includeInactive } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = {};
    
    if (!includeInactive) {
      whereClause += ' AND p.is_active = true';
    }
    
    if (categoryId) {
      whereClause += ' AND p.category_id = @categoryId';
      params.categoryId = parseInt(categoryId);
    }
    
    if (search) {
      whereClause += ' AND (p.product_name ILIKE @search OR p.product_code ILIKE @search)';
      params.search = `%${search}%`;
    }
    
    // Get products with pagination
    const result = await db.query(
      `SELECT p.*, c.category_name,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_active = true) as variant_count
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       ${whereClause}
       ORDER BY p.product_name
       LIMIT @limit OFFSET @offset`,
      { ...params, limit: parseInt(limit), offset }
    );
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM products p ${whereClause}`,
      params
    );
    
    res.json({
      products: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.recordset[0].total),
        pages: Math.ceil(countResult.recordset[0].total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Quick search for POS
router.get('/search/quick', async (req, res, next) => {
  try {
    const { q, locationId } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ products: [] });
    }
    
    const result = await db.query(
      `SELECT pv.variant_id, pv.sku, pv.barcode, pv.variant_name, pv.price,
              p.product_name, p.product_code,
              COALESCE(i.quantity_on_hand, 0) as stock
       FROM product_variants pv
       INNER JOIN products p ON pv.product_id = p.product_id
       LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.location_id = @locationId
       WHERE pv.is_active = true AND p.is_active = true
         AND (pv.sku ILIKE @search OR pv.barcode = @exactSearch 
              OR p.product_name ILIKE @search OR pv.variant_name ILIKE @search)
       LIMIT 20`,
      { search: `%${q}%`, exactSearch: q, locationId: parseInt(locationId) || 1 }
    );
    
    res.json({ products: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get product by ID with variants
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const productResult = await db.query(
      `SELECT p.*, c.category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.product_id = @id`,
      { id: parseInt(id) }
    );
    
    if (productResult.recordset.length === 0) {
      throw new NotFoundError('Product not found');
    }
    
    const variantsResult = await db.query(
      `SELECT * FROM product_variants WHERE product_id = @id ORDER BY variant_name`,
      { id: parseInt(id) }
    );
    
    res.json({
      ...productResult.recordset[0],
      variants: variantsResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Get categories
router.get('/categories/list', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, category_name`
    );
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Get attributes
router.get('/attributes/list', async (req, res, next) => {
  try {
    const attributesResult = await db.query(
      `SELECT * FROM attributes WHERE is_active = true ORDER BY sort_order`
    );
    
    const valuesResult = await db.query(
      `SELECT * FROM attribute_values WHERE is_active = true ORDER BY sort_order`
    );
    
    const attributes = attributesResult.recordset.map(attr => ({
      ...attr,
      values: valuesResult.recordset.filter(v => v.attribute_id === attr.attribute_id)
    }));
    
    res.json(attributes);
  } catch (error) {
    next(error);
  }
});

// Create product
router.post('/', authorize('products'), [
  body('name').optional().notEmpty(),
  body('productName').optional().notEmpty(),
  body('basePrice').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    // Support both frontend field names (name/code) and backend field names (productName/productCode)
    const { productCode, productName, name, code, categoryId, description, basePrice, costPrice, taxRate, barcode } = req.body;
    const finalName = productName || name;
    const finalCode = productCode || code || `PRD-${Date.now()}`;
    
    if (!finalName) {
      throw new ValidationError('Product name is required');
    }
    
    const result = await db.query(
      `INSERT INTO products (product_code, product_name, category_id, description, base_price, cost_price, tax_rate, barcode, created_by)
       VALUES (@productCode, @productName, @categoryId, @description, @basePrice, @costPrice, @taxRate, @barcode, @createdBy)
       RETURNING *`,
      { 
        productCode: finalCode,
        productName: finalName,
        categoryId: categoryId || null,
        description: description || null,
        basePrice,
        costPrice: costPrice || 0,
        taxRate: taxRate || 0,
        barcode: barcode || null,
        createdBy: req.user.user_id
      }
    );
    
    res.status(201).json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productName, categoryId, description, basePrice, costPrice, taxRate, isActive } = req.body;
    
    const result = await db.query(
      `UPDATE products 
       SET product_name = COALESCE(@productName, product_name),
           category_id = COALESCE(@categoryId, category_id),
           description = COALESCE(@description, description),
           base_price = COALESCE(@basePrice, base_price),
           cost_price = COALESCE(@costPrice, cost_price),
           tax_rate = COALESCE(@taxRate, tax_rate),
           is_active = COALESCE(@isActive, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = @id
       RETURNING *`,
      { id: parseInt(id), productName, categoryId, description, basePrice, costPrice, taxRate, isActive }
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Product not found');
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
