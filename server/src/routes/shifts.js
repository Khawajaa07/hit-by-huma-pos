const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

// Get current shift for user
router.get('/current', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT s.*, l.location_name
       FROM shifts s
       INNER JOIN locations l ON s.location_id = l.location_id
       WHERE s.user_id = @userId AND s.status = 'active'
       ORDER BY s.start_time DESC
       LIMIT 1`,
      { userId: req.user.user_id }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ hasActiveShift: false });
    }
    
    // Get shift stats
    const shift = result.recordset[0];
    const statsResult = await db.query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales
       FROM sales
       WHERE shift_id = @shiftId AND status = 'completed'`,
      { shiftId: shift.shift_id }
    );
    
    res.json({ 
      hasActiveShift: true, 
      shift: {
        ...shift,
        ...statsResult.recordset[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Clock in
router.post('/clock-in', [
  body('locationId').isInt(),
  body('openingCash').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { locationId, openingCash, terminalId } = req.body;
    
    // Check for existing active shift
    const existing = await db.query(
      `SELECT shift_id FROM shifts WHERE user_id = @userId AND status = 'active'`,
      { userId: req.user.user_id }
    );
    
    if (existing.recordset.length > 0) {
      throw new ValidationError('You already have an active shift');
    }
    
    const result = await db.query(
      `INSERT INTO shifts (user_id, location_id, terminal_id, opening_cash, status)
       VALUES (@userId, @locationId, @terminalId, @openingCash, 'active')
       RETURNING *`,
      { 
        userId: req.user.user_id, 
        locationId, 
        terminalId: terminalId || null, 
        openingCash 
      }
    );
    
    res.status(201).json({ success: true, shift: result.recordset[0] });
  } catch (error) {
    next(error);
  }
});

// Clock out
router.post('/clock-out', [
  body('shiftId').isInt(),
  body('closingCash').isNumeric(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { shiftId, closingCash, notes } = req.body;
    
    // Get shift details and calculate expected cash
    const shiftResult = await db.query(
      `SELECT s.*, 
        COALESCE(SUM(CASE WHEN pm.method_type = 'cash' THEN sp.amount ELSE 0 END), 0) as cash_sales
       FROM shifts s
       LEFT JOIN sales sl ON s.shift_id = sl.shift_id AND sl.status = 'completed'
       LEFT JOIN sale_payments sp ON sl.sale_id = sp.sale_id
       LEFT JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE s.shift_id = @shiftId
       GROUP BY s.shift_id, s.user_id, s.location_id, s.terminal_id, s.opening_cash, 
                s.closing_cash, s.expected_cash, s.cash_difference, s.start_time, 
                s.end_time, s.status, s.notes, s.created_at`,
      { shiftId }
    );
    
    if (shiftResult.recordset.length === 0) {
      throw new NotFoundError('Shift not found');
    }
    
    const shift = shiftResult.recordset[0];
    const expectedCash = shift.opening_cash + shift.cash_sales;
    const cashDifference = closingCash - expectedCash;
    
    const result = await db.query(
      `UPDATE shifts SET 
        closing_cash = @closingCash,
        expected_cash = @expectedCash,
        cash_difference = @cashDifference,
        end_time = CURRENT_TIMESTAMP,
        status = 'closed',
        notes = @notes
       WHERE shift_id = @shiftId
       RETURNING *`,
      { shiftId, closingCash, expectedCash, cashDifference, notes: notes || null }
    );
    
    res.json({ 
      success: true, 
      shift: result.recordset[0],
      summary: {
        expectedCash,
        actualCash: closingCash,
        difference: cashDifference
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get shift history
router.get('/history', async (req, res, next) => {
  try {
    const { userId, locationId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = { limit: parseInt(limit), offset };
    
    if (userId) {
      whereClause += ' AND s.user_id = @userId';
      params.userId = parseInt(userId);
    }
    
    if (locationId) {
      whereClause += ' AND s.location_id = @locationId';
      params.locationId = parseInt(locationId);
    }
    
    if (startDate) {
      whereClause += ' AND s.start_time >= @startDate';
      params.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND s.start_time <= @endDate';
      params.endDate = endDate;
    }
    
    const result = await db.query(
      `SELECT s.*, u.first_name, u.last_name, l.location_name,
        (SELECT COUNT(*) FROM sales WHERE shift_id = s.shift_id AND status = 'completed') as transaction_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE shift_id = s.shift_id AND status = 'completed') as total_sales
       FROM shifts s
       INNER JOIN users u ON s.user_id = u.user_id
       INNER JOIN locations l ON s.location_id = l.location_id
       ${whereClause}
       ORDER BY s.start_time DESC
       LIMIT @limit OFFSET @offset`,
      params
    );
    
    res.json({ shifts: result.recordset });
  } catch (error) {
    next(error);
  }
});

// Get shift by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const shiftResult = await db.query(
      `SELECT s.*, u.first_name, u.last_name, l.location_name
       FROM shifts s
       INNER JOIN users u ON s.user_id = u.user_id
       INNER JOIN locations l ON s.location_id = l.location_id
       WHERE s.shift_id = @id`,
      { id: parseInt(id) }
    );
    
    if (shiftResult.recordset.length === 0) {
      throw new NotFoundError('Shift not found');
    }
    
    // Get sales summary
    const salesResult = await db.query(
      `SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(discount_amount), 0) as total_discounts
       FROM sales
       WHERE shift_id = @id AND status = 'completed'`,
      { id: parseInt(id) }
    );
    
    // Get payments by method
    const paymentsResult = await db.query(
      `SELECT pm.method_name, COALESCE(SUM(sp.amount), 0) as total
       FROM sale_payments sp
       INNER JOIN sales s ON sp.sale_id = s.sale_id
       INNER JOIN payment_methods pm ON sp.payment_method_id = pm.payment_method_id
       WHERE s.shift_id = @id AND s.status = 'completed'
       GROUP BY pm.method_name`,
      { id: parseInt(id) }
    );
    
    res.json({
      shift: shiftResult.recordset[0],
      summary: salesResult.recordset[0],
      paymentBreakdown: paymentsResult.recordset
    });
  } catch (error) {
    next(error);
  }
});

// Reconcile shift
router.post('/:id/reconcile', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    await db.query(
      `UPDATE shifts SET status = 'reconciled', notes = COALESCE(@notes, notes)
       WHERE shift_id = @id`,
      { id: parseInt(id), notes }
    );
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
