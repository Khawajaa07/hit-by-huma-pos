const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get inventory for a location with summary
router.get('/', async (req, res, next) => {
  try {
    const { locationId, search, lowStock, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Start from product_variants and LEFT JOIN to inventory so we see all variants
    // including those with no inventory record (out of stock)
    let whereClause = 'WHERE pv.is_active = true AND p.is_active = true';
    const params = [];
    let paramIndex = 1;
    
    // For location filter, we need to handle variants without inventory differently
    let locationJoin = 'CROSS JOIN locations l';
    let inventoryJoin = 'LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.location_id = l.location_id';
    
    if (locationId) {
      whereClause += ` AND l.location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }
    
    if (search) {
      whereClause += ` AND (pv.sku ILIKE $${paramIndex} OR p.product_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (lowStock === 'true') {
      whereClause += ' AND COALESCE(i.quantity_on_hand, 0) <= COALESCE(i.reorder_level, 5) AND COALESCE(i.quantity_on_hand, 0) > 0';
    }
    
    // Get inventory items - use LEFT JOIN to include variants without inventory records
    const result = await db.query(
      `SELECT i.inventory_id, pv.variant_id, l.location_id, 
              COALESCE(i.quantity_on_hand, 0) as quantity_on_hand, 
              COALESCE(i.quantity_reserved, 0) as quantity_reserved, 
              COALESCE(i.reorder_level, 5) as reorder_level, 
              COALESCE(i.reorder_quantity, 10) as reorder_quantity, 
              i.bin_location, i.updated_at,
              pv.sku, pv.barcode, pv.variant_name, pv.price, pv.cost_price,
              p.product_id, p.product_name, p.product_code, l.location_name
       FROM product_variants pv
       INNER JOIN products p ON pv.product_id = p.product_id
       ${locationJoin}
       ${inventoryJoin}
       ${whereClause}
       ORDER BY p.product_name, pv.variant_name
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, parseInt(limit), offset]
    );
    
    // Transform to frontend format
    const inventory = result.recordset.map(item => ({
      id: item.inventory_id || `${item.variant_id}-${item.location_id}`,
      variantId: item.variant_id,
      locationId: item.location_id,
      quantity: item.quantity_on_hand,
      reserved: item.quantity_reserved,
      reorderLevel: item.reorder_level,
      reorderQuantity: item.reorder_quantity,
      binLocation: item.bin_location,
      updatedAt: item.updated_at,
      sku: item.sku,
      barcode: item.barcode,
      productName: item.product_name,
      variantName: item.variant_name,
      productCode: item.product_code,
      locationName: item.location_name,
      variant: {
        id: item.variant_id,
        sku: item.sku,
        name: item.variant_name,
        price: parseFloat(item.price) || 0,
        costPrice: parseFloat(item.cost_price) || 0
      }
    }));
    
    // Calculate summary
    const summary = {
      totalProducts: inventory.length,
      totalValue: inventory.reduce((sum, item) => sum + (item.quantity * item.variant.price), 0),
      lowStock: inventory.filter(item => item.quantity > 0 && item.quantity <= item.reorderLevel).length,
      outOfStock: inventory.filter(item => item.quantity <= 0).length
    };
    
    res.json({ inventory, summary });
  } catch (error) {
    next(error);
  }
});

// Check stock at other locations
router.get('/check-other-locations/:variantId', async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { currentLocationId } = req.query;
    
    const result = await db.query(
      `SELECT i.*, l.location_name, l.phone
       FROM inventory i
       INNER JOIN locations l ON i.location_id = l.location_id
       WHERE i.variant_id = $1 
         AND i.location_id != $2
         AND i.quantity_on_hand > 0
       ORDER BY i.quantity_on_hand DESC`,
      [parseInt(variantId), parseInt(currentLocationId)]
    );
    
    res.json({ locations: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get locations
router.get('/locations', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM locations WHERE is_active = true ORDER BY location_name`
    );
    // Transform to expected format
    const locations = result.recordset.map(loc => ({
      LocationID: loc.location_id,
      LocationName: loc.location_name,
      ...loc
    }));
    res.json({ locations });
  } catch (error) {
    next(error);
  }
});

// Get inventory transactions
router.get('/transactions', async (req, res, next) => {
  try {
    const { variantId, locationId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (variantId) {
      whereClause += ` AND it.variant_id = $${paramIndex++}`;
      params.push(parseInt(variantId));
    }
    
    if (locationId) {
      whereClause += ` AND it.location_id = $${paramIndex++}`;
      params.push(parseInt(locationId));
    }
    
    const result = await db.query(
      `SELECT it.*, pv.sku, u.first_name, u.last_name, l.location_name
       FROM inventory_transactions it
       INNER JOIN product_variants pv ON it.variant_id = pv.variant_id
       INNER JOIN locations l ON it.location_id = l.location_id
       LEFT JOIN users u ON it.user_id = u.user_id
       ${whereClause}
       ORDER BY it.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, parseInt(limit), offset]
    );
    
    res.json({ transactions: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Adjust inventory
router.post('/adjust', async (req, res, next) => {
  try {
    const { variantId, locationId, adjustment, reason } = req.body;
    
    // Validate required fields
    if (!variantId || !locationId || adjustment === undefined) {
      return res.status(400).json({ 
        error: 'ValidationError', 
        message: 'variantId, locationId, and adjustment are required',
        received: { variantId, locationId, adjustment }
      });
    }
    
    console.log('Adjusting inventory:', { variantId, locationId, adjustment, reason });
    
    // Get current stock
    let currentResult = await db.query(
      `SELECT quantity_on_hand FROM inventory WHERE variant_id = $1 AND location_id = $2`,
      [parseInt(variantId), parseInt(locationId)]
    );
    
    let currentStock = 0;
    
    if (currentResult.recordset.length === 0) {
      // Create inventory record if it doesn't exist
      console.log('Creating new inventory record');
      await db.query(
        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES ($1, $2, 0)`,
        [parseInt(variantId), parseInt(locationId)]
      );
    } else {
      currentStock = parseInt(currentResult.recordset[0].quantity_on_hand) || 0;
    }
    
    const newStock = currentStock + parseInt(adjustment);
    
    console.log('Updating stock:', { currentStock, adjustment, newStock });
    
    // Update inventory
    await db.query(
      `UPDATE inventory SET quantity_on_hand = $1, updated_at = CURRENT_TIMESTAMP
       WHERE variant_id = $2 AND location_id = $3`,
      [newStock, parseInt(variantId), parseInt(locationId)]
    );
    
    // Log transaction
    try {
      await db.query(
        `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, notes, user_id)
         VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, $6, $7)`,
        [parseInt(variantId), parseInt(locationId), parseInt(adjustment), currentStock, newStock, reason || 'Stock adjustment', req.user?.user_id || 1]
      );
    } catch (txError) {
      console.log('Transaction log error (non-fatal):', txError.message);
    }
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`location-${locationId}`).emit('inventory-updated', { variantId, locationId, newStock });
    }
    
    console.log('Inventory adjustment successful:', { previousStock: currentStock, newStock });
    res.json({ success: true, previousStock: currentStock, newStock });
  } catch (error) {
    console.error('Inventory adjust error:', error);
    next(error);
  }
});

// Receive inventory
router.post('/receive', authorize('inventory'), [
  body('variantId').isInt(),
  body('locationId').isInt(),
  body('quantity').isInt({ min: 1 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { variantId, locationId, quantity, notes } = req.body;
    
    // Upsert inventory
    let currentResult = await db.query(
      `SELECT quantity_on_hand FROM inventory WHERE variant_id = $1 AND location_id = $2`,
      [variantId, locationId]
    );
    
    let currentStock = 0;
    
    if (currentResult.recordset.length === 0) {
      await db.query(
        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES ($1, $2, $3)`,
        [variantId, locationId, quantity]
      );
    } else {
      currentStock = currentResult.recordset[0].quantity_on_hand;
      await db.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = CURRENT_TIMESTAMP
         WHERE variant_id = $2 AND location_id = $3`,
        [quantity, variantId, locationId]
      );
    }
    
    const newStock = currentStock + quantity;
    
    // Log transaction
    await db.query(
      `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, notes, user_id)
       VALUES ($1, $2, 'RECEIVE', $3, $4, $5, $6, $7)`,
      [variantId, locationId, quantity, currentStock, newStock, notes || 'Stock received', req.user.user_id]
    );
    
    res.json({ success: true, previousStock: currentStock, newStock });
  } catch (error) {
    next(error);
  }
});

// Create transfer between locations
router.post('/transfers', authorize('inventory'), async (req, res, next) => {
  try {
    const { fromLocationId, toLocationId, items, notes } = req.body;
    
    for (const item of items) {
      const { variantId, quantity } = item;
      
      // Decrease from source
      await db.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand - $1
         WHERE variant_id = $2 AND location_id = $3`,
        [quantity, variantId, fromLocationId]
      );
      
      // Increase at destination (upsert)
      const existing = await db.query(
        `SELECT inventory_id FROM inventory WHERE variant_id = $1 AND location_id = $2`,
        [variantId, toLocationId]
      );
      
      if (existing.recordset.length === 0) {
        await db.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES ($1, $2, $3)`,
          [variantId, toLocationId, quantity]
        );
      } else {
        await db.query(
          `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1
           WHERE variant_id = $2 AND location_id = $3`,
          [quantity, variantId, toLocationId]
        );
      }
    }
    
    res.json({ success: true, message: 'Transfer completed' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
