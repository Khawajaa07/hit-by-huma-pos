const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get inventory for a location
router.get('/', async (req, res, next) => {
  try {
    const { locationId, search, lowStock, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE pv.is_active = true';
    const params = { limit: parseInt(limit), offset };
    
    if (locationId) {
      whereClause += ' AND i.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (search) {
      whereClause += ' AND (pv.sku ILIKE @search OR p.product_name ILIKE @search)';
      params.search = `%${search}%`;
    }
    
    if (lowStock === 'true') {
      whereClause += ' AND i.quantity_on_hand <= i.reorder_level';
    }
    
    const result = await db.query(
      `SELECT i.*, pv.sku, pv.barcode, pv.variant_name, pv.price,
              p.product_name, l.location_name
       FROM inventory i
       INNER JOIN product_variants pv ON i.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       INNER JOIN locations l ON i.location_id = l.location_id
       ${whereClause}
       ORDER BY p.product_name, pv.variant_name
       LIMIT @limit OFFSET @offset`,
      params
    );
    
    res.json({ inventory: result.recordset });
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
       WHERE i.variant_id = @variantId 
         AND i.location_id != @currentLocationId
         AND i.quantity_on_hand > 0
       ORDER BY i.quantity_on_hand DESC`,
      { variantId: parseInt(variantId), currentLocationId: parseInt(currentLocationId) }
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
    res.json(result.recordset);
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
    const params = { limit: parseInt(limit), offset };
    
    if (variantId) {
      whereClause += ' AND it.variant_id = @variantId';
      params.variantId = parseInt(variantId);
    }
    
    if (locationId) {
      whereClause += ' AND it.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    const result = await db.query(
      `SELECT it.*, pv.sku, u.first_name, u.last_name, l.location_name
       FROM inventory_transactions it
       INNER JOIN product_variants pv ON it.variant_id = pv.variant_id
       INNER JOIN locations l ON it.location_id = l.location_id
       LEFT JOIN users u ON it.user_id = u.user_id
       ${whereClause}
       ORDER BY it.created_at DESC
       LIMIT @limit OFFSET @offset`,
      params
    );
    
    res.json({ transactions: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Adjust inventory
router.post('/adjust', authorize('inventory'), [
  body('variantId').isInt(),
  body('locationId').isInt(),
  body('adjustment').isInt(),
  body('reason').notEmpty(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { variantId, locationId, adjustment, reason } = req.body;
    
    // Get current stock
    let currentResult = await db.query(
      `SELECT quantity_on_hand FROM inventory WHERE variant_id = @variantId AND location_id = @locationId`,
      { variantId, locationId }
    );
    
    let currentStock = 0;
    
    if (currentResult.recordset.length === 0) {
      // Create inventory record if it doesn't exist
      await db.query(
        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES (@variantId, @locationId, 0)`,
        { variantId, locationId }
      );
    } else {
      currentStock = currentResult.recordset[0].quantity_on_hand;
    }
    
    const newStock = currentStock + adjustment;
    
    // Update inventory
    await db.query(
      `UPDATE inventory SET quantity_on_hand = @newStock, updated_at = CURRENT_TIMESTAMP
       WHERE variant_id = @variantId AND location_id = @locationId`,
      { newStock, variantId, locationId }
    );
    
    // Log transaction
    await db.query(
      `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, notes, user_id)
       VALUES (@variantId, @locationId, 'ADJUSTMENT', @adjustment, @before, @after, @reason, @userId)`,
      { 
        variantId, 
        locationId, 
        adjustment, 
        before: currentStock, 
        after: newStock, 
        reason, 
        userId: req.user.user_id 
      }
    );
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`location-${locationId}`).emit('inventory-updated', { variantId, locationId, newStock });
    
    res.json({ success: true, previousStock: currentStock, newStock });
  } catch (error) {
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
      `SELECT quantity_on_hand FROM inventory WHERE variant_id = @variantId AND location_id = @locationId`,
      { variantId, locationId }
    );
    
    let currentStock = 0;
    
    if (currentResult.recordset.length === 0) {
      await db.query(
        `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES (@variantId, @locationId, @quantity)`,
        { variantId, locationId, quantity }
      );
    } else {
      currentStock = currentResult.recordset[0].quantity_on_hand;
      await db.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand + @quantity, updated_at = CURRENT_TIMESTAMP
         WHERE variant_id = @variantId AND location_id = @locationId`,
        { quantity, variantId, locationId }
      );
    }
    
    const newStock = currentStock + quantity;
    
    // Log transaction
    await db.query(
      `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, notes, user_id)
       VALUES (@variantId, @locationId, 'RECEIVE', @quantity, @before, @after, @notes, @userId)`,
      { 
        variantId, 
        locationId, 
        quantity, 
        before: currentStock, 
        after: newStock, 
        notes: notes || 'Stock received', 
        userId: req.user.user_id 
      }
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
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand - @quantity
         WHERE variant_id = @variantId AND location_id = @fromLocationId`,
        { quantity, variantId, fromLocationId }
      );
      
      // Increase at destination (upsert)
      const existing = await db.query(
        `SELECT inventory_id FROM inventory WHERE variant_id = @variantId AND location_id = @toLocationId`,
        { variantId, toLocationId }
      );
      
      if (existing.recordset.length === 0) {
        await db.query(
          `INSERT INTO inventory (variant_id, location_id, quantity_on_hand) VALUES (@variantId, @toLocationId, @quantity)`,
          { variantId, toLocationId, quantity }
        );
      } else {
        await db.query(
          `UPDATE inventory SET quantity_on_hand = quantity_on_hand + @quantity
           WHERE variant_id = @variantId AND location_id = @toLocationId`,
          { quantity, variantId, toLocationId }
        );
      }
    }
    
    res.json({ success: true, message: 'Transfer completed' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
