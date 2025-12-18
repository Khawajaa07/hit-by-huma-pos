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
    const params = [];
    let paramIndex = 1;
    
    if (!includeInactive) {
      whereClause += ' AND p.is_active = true';
    }
    
    if (categoryId) {
      whereClause += ` AND p.category_id = $${paramIndex++}`;
      params.push(parseInt(categoryId));
    }
    
    if (search) {
      whereClause += ` AND (p.product_name ILIKE $${paramIndex} OR p.product_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Get products with pagination
    const result = await db.query(
      `SELECT p.*, c.category_name,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.product_id AND pv.is_active = true) as variant_count,
        (SELECT COALESCE(SUM(i.quantity_on_hand), 0) FROM product_variants pv2 
         LEFT JOIN inventory i ON pv2.variant_id = i.variant_id 
         WHERE pv2.product_id = p.product_id) as total_stock
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       ${whereClause}
       ORDER BY p.product_name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, parseInt(limit), offset]
    );
    
    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM products p ${whereClause}`,
      params
    );
    
    // Transform to camelCase for frontend
    const products = result.recordset.map(p => ({
      id: p.product_id,
      code: p.product_code,
      name: p.product_name,
      categoryId: p.category_id,
      category: { id: p.category_id, name: p.category_name },
      description: p.description,
      basePrice: p.base_price,
      costPrice: p.cost_price,
      taxRate: p.tax_rate,
      hasVariants: p.has_variants,
      isActive: p.is_active,
      variantCount: parseInt(p.variant_count) || 0,
      totalStock: parseInt(p.total_stock) || 0,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));

    res.json({
      products,
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

// Get all categories (including inactive) for management
router.get('/categories', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM categories ORDER BY sort_order, category_name`
    );
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Create category
router.post('/categories', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { category_name, description, sort_order = 0 } = req.body;
    
    if (!category_name) {
      throw new ValidationError('Category name is required');
    }
    
    const result = await db.query(
      `INSERT INTO categories (category_name, description, sort_order, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [category_name, description || null, sort_order]
    );
    
    res.status(201).json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Update category
router.put('/categories/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category_name, description, sort_order, is_active } = req.body;
    
    if (!category_name) {
      throw new ValidationError('Category name is required');
    }
    
    const result = await db.query(
      `UPDATE categories 
       SET category_name = $1, description = $2, sort_order = $3, is_active = $4
       WHERE category_id = $5
       RETURNING *`,
      [category_name, description || null, sort_order || 0, is_active !== false, id]
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Category not found');
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Delete category (soft delete)
router.delete('/categories/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if category has products
    const productsCheck = await db.query(
      `SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND is_active = true`,
      [id]
    );
    
    if (parseInt(productsCheck.recordset[0].count) > 0) {
      throw new ValidationError('Cannot delete category with active products. Please move or delete products first.');
    }
    
    const result = await db.query(
      `UPDATE categories SET is_active = false WHERE category_id = $1 RETURNING *`,
      [id]
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Category not found');
    }
    
    res.json({ message: 'Category deleted successfully' });
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
    const { productCode, productName, name, code, categoryId, category_id, description, basePrice, costPrice, taxRate, barcode, initialStock, initial_stock } = req.body;
    const finalName = productName || name;
    const finalCode = productCode || code || `PRD-${Date.now()}`;
    const finalCategoryId = categoryId || category_id || null;
    const finalInitialStock = initialStock || initial_stock || 0;
    
    if (!finalName) {
      throw new ValidationError('Product name is required');
    }
    
    // Create the product
    const result = await db.query(
      `INSERT INTO products (product_code, product_name, category_id, description, base_price, cost_price, tax_rate, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [finalCode, finalName, finalCategoryId, description || null, basePrice, costPrice || 0, taxRate || 0, req.user.user_id]
    );
    
    const product = result.recordset[0];
    
    // Create a default variant for this product
    const variantResult = await db.query(
      `INSERT INTO product_variants (product_id, sku, variant_name, price, cost_price, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [product.product_id, finalCode, 'Default', basePrice, costPrice || 0]
    );
    
    const variant = variantResult.recordset[0];
    
    // If initial stock is provided, create inventory record for the variant
    if (finalInitialStock && parseInt(finalInitialStock) > 0) {
      await db.query(
        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (variant_id, location_id) 
         DO UPDATE SET quantity_on_hand = inventory.quantity_on_hand + $3, updated_at = CURRENT_TIMESTAMP`,
        [variant.variant_id, req.user.default_location_id || 1, parseInt(finalInitialStock)]
      );
    }
    
    res.status(201).json({ ...product, variant });
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productName, name, code, productCode, categoryId, category_id, description, basePrice, costPrice, taxRate, isActive, barcode, initialStock, initial_stock, stock } = req.body;
    
    const finalName = productName || name;
    const finalCategoryId = categoryId || category_id;
    const finalCode = code || productCode;
    const finalStock = stock ?? initialStock ?? initial_stock;
    
    console.log('PUT /products/:id - Request body:', JSON.stringify(req.body));
    console.log('PUT /products/:id - Parsed values:', { id, finalName, finalCode, basePrice, costPrice, isActive, finalStock, stockFromBody: stock });
    
    const result = await db.query(
      `UPDATE products 
       SET product_name = COALESCE(@finalName, product_name),
           product_code = COALESCE(@finalCode, product_code),
           category_id = COALESCE(@finalCategoryId, category_id),
           description = COALESCE(@description, description),
           base_price = COALESCE(@basePrice, base_price),
           cost_price = COALESCE(@costPrice, cost_price),
           tax_rate = COALESCE(@taxRate, tax_rate),
           is_active = COALESCE(@isActive, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = @productId
       RETURNING *`,
      { finalName, finalCode, finalCategoryId, description, basePrice, costPrice, taxRate, isActive, productId: parseInt(id) }
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Product not found');
    }
    
    const p = result.recordset[0];
    
    // Update stock if provided
    if (finalStock !== null && finalStock !== undefined) {
      // Get the default variant for this product
      const variantResult = await db.query(
        `SELECT variant_id FROM product_variants WHERE product_id = @productId LIMIT 1`,
        { productId: parseInt(id) }
      );
      
      let variantId;
      
      if (variantResult.recordset.length > 0) {
        variantId = variantResult.recordset[0].variant_id;
      } else {
        // Create a default variant if none exists
        const newVariantResult = await db.query(
          `INSERT INTO product_variants (product_id, sku, variant_name, price, cost_price, is_active)
           VALUES (@productId, @sku, 'Default', @price, @costPrice, true)
           RETURNING variant_id`,
          { productId: parseInt(id), sku: p.product_code, price: p.base_price, costPrice: p.cost_price || 0 }
        );
        variantId = newVariantResult.recordset[0].variant_id;
      }
      
      const locationId = req.user?.default_location_id || 1;
      const stockQty = parseInt(finalStock);
      
      console.log('Updating stock:', { variantId, locationId, stockQty });
      
      // Check if inventory record exists
      const existingInventory = await db.query(
        `SELECT inventory_id FROM inventory WHERE variant_id = @variantId AND location_id = @locationId`,
        { variantId, locationId }
      );
      
      if (existingInventory.recordset.length > 0) {
        // Update existing inventory record
        await db.query(
          `UPDATE inventory SET quantity_on_hand = @stockQty, updated_at = CURRENT_TIMESTAMP
           WHERE variant_id = @variantId AND location_id = @locationId`,
          { stockQty, variantId, locationId }
        );
      } else {
        // Insert new inventory record
        await db.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand, updated_at)
           VALUES (@variantId, @locationId, @stockQty, CURRENT_TIMESTAMP)`,
          { variantId, locationId, stockQty }
        );
      }
    }
    
    // Get updated total stock
    const stockResult = await db.query(
      `SELECT COALESCE(SUM(i.quantity_on_hand), 0) as total_stock 
       FROM product_variants pv 
       LEFT JOIN inventory i ON pv.variant_id = i.variant_id 
       WHERE pv.product_id = @productId`,
      { productId: parseInt(id) }
    );
    
    // Return transformed response matching GET format
    res.json({
      id: p.product_id,
      code: p.product_code,
      name: p.product_name,
      categoryId: p.category_id,
      description: p.description,
      basePrice: p.base_price,
      costPrice: p.cost_price,
      taxRate: p.tax_rate,
      isActive: p.is_active,
      totalStock: parseInt(stockResult.recordset[0]?.total_stock) || 0,
      updatedAt: p.updated_at
    });
  } catch (error) {
    next(error);
  }
});

// Delete product (soft delete)
router.delete('/:id', authorize('products'), async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Soft delete - set is_active to false
    const result = await db.query(
      `UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE product_id = $1 RETURNING *`,
      [parseInt(id)]
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Product not found');
    }
    
    // Also deactivate variants
    await db.query(
      `UPDATE product_variants SET is_active = false WHERE product_id = $1`,
      [parseInt(id)]
    );
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
