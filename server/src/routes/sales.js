const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize, verifyManagerPIN } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get all sales
router.get('/', async (req, res, next) => {
  try {
    const { locationId, startDate, endDate, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { limit: parseInt(limit), offset };
    
    if (locationId) {
      whereClause += ' AND s.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND s.created_at >= @startDate';
      params.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND s.created_at <= @endDate';
      params.endDate = endDate;
    }
    
    if (status) {
      whereClause += ' AND s.status = @status';
      params.status = status;
    }
    
    const result = await db.query(
      `SELECT s.*, u.first_name as cashier_first_name, u.last_name as cashier_last_name,
              c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone,
              l.location_name
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN locations l ON s.location_id = l.location_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT @limit OFFSET @offset`,
      params
    );
    
    res.json({ sales: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get sale by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const saleResult = await db.query(
      `SELECT s.*, u.first_name as cashier_first_name, u.last_name as cashier_last_name,
              c.first_name as customer_first_name, c.last_name as customer_last_name, c.phone as customer_phone,
              l.location_name, l.address as location_address, l.phone as location_phone
       FROM sales s
       INNER JOIN users u ON s.user_id = u.user_id
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN locations l ON s.location_id = l.location_id
       WHERE s.sale_id = @id`,
      { id: parseInt(id) }
    );
    
    if (saleResult.recordset.length === 0) {
      throw new NotFoundError('Sale not found');
    }
    
    const itemsResult = await db.query(
      `SELECT si.*, pv.sku, pv.variant_name, p.product_name
       FROM sale_items si
       INNER JOIN product_variants pv ON si.variant_id = pv.variant_id
       INNER JOIN products p ON pv.product_id = p.product_id
       WHERE si.sale_id = @id`,
      { id: parseInt(id) }
    );
    
    const paymentsResult = await db.query(
      `SELECT sp.*, pm.method_name
       FROM sale_payments sp
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE sp.sale_id = @id`,
      { id: parseInt(id) }
    );
    
    res.json({
      sale: saleResult.recordset[0],
      items: itemsResult.recordset,
      payments: paymentsResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Get payment methods
router.get('/payment-methods/list', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM payment_methods WHERE is_active = true ORDER BY sort_order`
    );
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Create sale
router.post('/', [
  body('items').isArray({ min: 1 }),
  body('payments').isArray({ min: 1 }),
  body('locationId').isInt(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { items, payments, locationId, customerId, discountAmount, discountType, discountReason, notes, shiftId } = req.body;
    
    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    
    for (const item of items) {
      const lineTotal = item.unitPrice * item.quantity;
      subtotal += lineTotal;
      taxAmount += item.taxAmount || 0;
    }
    
    const totalAmount = subtotal + taxAmount - (discountAmount || 0);
    
    // Generate sale number
    const saleNumber = `S-${Date.now()}`;
    
    // Insert sale
    const saleResult = await db.query(
      `INSERT INTO sales (sale_number, location_id, shift_id, user_id, customer_id, subtotal, tax_amount, discount_amount, discount_type, discount_reason, total_amount, notes)
       VALUES (@saleNumber, @locationId, @shiftId, @userId, @customerId, @subtotal, @taxAmount, @discountAmount, @discountType, @discountReason, @totalAmount, @notes)
       RETURNING sale_id`,
      { 
        saleNumber,
        locationId,
        shiftId: shiftId || null,
        userId: req.user.user_id,
        customerId: customerId || null,
        subtotal,
        taxAmount,
        discountAmount: discountAmount || 0,
        discountType: discountType || null,
        discountReason: discountReason || null,
        totalAmount,
        notes: notes || null
      }
    );
    
    const saleId = saleResult.recordset[0].sale_id;
    
    // Insert sale items and update inventory
    for (const item of items) {
      await db.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, discount_amount, tax_amount, line_total)
         VALUES (@saleId, @variantId, @quantity, @unitPrice, @discountAmount, @taxAmount, @lineTotal)`,
        { 
          saleId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxAmount: item.taxAmount || 0,
          lineTotal: item.unitPrice * item.quantity
        }
      );
      
      // Update inventory
      await db.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand - @quantity, updated_at = CURRENT_TIMESTAMP
         WHERE variant_id = @variantId AND location_id = @locationId`,
        { quantity: item.quantity, variantId: item.variantId, locationId }
      );
      
      // Log inventory transaction
      await db.query(
        `INSERT INTO inventory_transactions (variant_id, location_id, transaction_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, user_id)
         SELECT @variantId, @locationId, 'SALE', @quantity, quantity_on_hand + @quantity, quantity_on_hand, 'SALE', @saleId, @userId
         FROM inventory WHERE variant_id = @variantId AND location_id = @locationId`,
        { variantId: item.variantId, locationId, quantity: -item.quantity, saleId, userId: req.user.user_id }
      );
    }
    
    // Insert payments
    for (const payment of payments) {
      await db.query(
        `INSERT INTO sale_payments (sale_id, payment_method_id, amount, reference_number)
         VALUES (@saleId, @paymentMethodId, @amount, @reference)`,
        { 
          saleId,
          paymentMethodId: payment.paymentMethodId,
          amount: payment.amount,
          reference: payment.referenceNumber || null
        }
      );
    }
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`location-${locationId}`).emit('sale-completed', { saleId, saleNumber, totalAmount });
    
    res.status(201).json({ 
      success: true, 
      saleId, 
      saleNumber,
      totalAmount 
    });
  } catch (error) {
    next(error);
  }
});

// Park sale
router.post('/park', async (req, res, next) => {
  try {
    const { locationId, customerId, cartData, notes } = req.body;
    
    const result = await db.query(
      `INSERT INTO parked_sales (location_id, user_id, customer_id, cart_data, notes)
       VALUES (@locationId, @userId, @customerId, @cartData, @notes)
       RETURNING parked_id`,
      { 
        locationId, 
        userId: req.user.user_id, 
        customerId: customerId || null, 
        cartData: JSON.stringify(cartData),
        notes: notes || null
      }
    );
    
    res.json({ success: true, parkedId: result.recordset[0].parked_id });
  } catch (error) {
    next(error);
  }
});

// Get parked sales
router.get('/parked/list', async (req, res, next) => {
  try {
    const { locationId } = req.query;
    
    const result = await db.query(
      `SELECT ps.*, u.first_name, u.last_name, c.phone as customer_phone
       FROM parked_sales ps
       LEFT JOIN users u ON ps.user_id = u.user_id
       LEFT JOIN customers c ON ps.customer_id = c.customer_id
       WHERE ps.location_id = @locationId
       ORDER BY ps.created_at DESC`,
      { locationId: parseInt(locationId) }
    );
    
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

// Get parked sale by ID
router.get('/parked/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `SELECT * FROM parked_sales WHERE parked_id = @id`,
      { id: parseInt(id) }
    );
    
    if (result.recordset.length === 0) {
      throw new NotFoundError('Parked sale not found');
    }
    
    res.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

// Delete parked sale
router.delete('/parked/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await db.query(`DELETE FROM parked_sales WHERE parked_id = @id`, { id: parseInt(id) });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Void sale
router.post('/:id/void', authorize('void'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { managerPIN, reason } = req.body;
    
    // Get sale items to restore inventory
    const itemsResult = await db.query(
      `SELECT si.*, s.location_id FROM sale_items si
       INNER JOIN sales s ON si.sale_id = s.sale_id
       WHERE si.sale_id = @id`,
      { id: parseInt(id) }
    );
    
    // Restore inventory
    for (const item of itemsResult.recordset) {
      await db.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand + @quantity
         WHERE variant_id = @variantId AND location_id = @locationId`,
        { quantity: item.quantity, variantId: item.variant_id, locationId: item.location_id }
      );
    }
    
    // Update sale status
    await db.query(
      `UPDATE sales SET status = 'voided', voided_by = @voidedBy, voided_at = CURRENT_TIMESTAMP, void_reason = @reason
       WHERE sale_id = @id`,
      { id: parseInt(id), voidedBy: req.user.user_id, reason }
    );
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Apply discount (for validation)
router.post('/apply-discount', async (req, res, next) => {
  try {
    const { discountPercent, discountAmount, subtotal } = req.body;
    
    // Get max discount setting
    const settingResult = await db.query(
      `SELECT setting_value FROM settings WHERE setting_key = 'max_discount_without_approval'`
    );
    
    const maxDiscount = settingResult.recordset.length > 0 
      ? parseFloat(settingResult.recordset[0].setting_value) 
      : 10;
    
    const actualPercent = discountPercent || (discountAmount / subtotal * 100);
    
    res.json({
      requiresApproval: actualPercent > maxDiscount,
      maxWithoutApproval: maxDiscount
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
