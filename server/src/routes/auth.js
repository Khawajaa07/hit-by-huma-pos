const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ValidationError, UnauthorizedError } = require('../middleware/errorHandler');

const router = express.Router();

// Login
router.post('/login', [
  body('employeeCode').notEmpty().withMessage('Employee code is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { employeeCode, password, locationId } = req.body;
    
    const result = await db.query(
      `SELECT u.*, r.role_name, r.permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.employee_code = @employeeCode AND u.is_active = true`,
      { employeeCode }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    const user = result.recordset[0];
    
    // TEMPORARY: Plain text password comparison (for development only)
    const validPassword = password === user.password_hash || await bcrypt.compare(password, user.password_hash).catch(() => false);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // Update last login
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = @userId',
      { userId: user.user_id }
    );
    
    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.user_id, role: user.role_name },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.user_id },
      process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    
    // Parse permissions safely
    let permissions = [];
    try {
      permissions = typeof user.permissions === 'string' 
        ? JSON.parse(user.permissions) 
        : (user.permissions || {});
    } catch (e) {
      permissions = {};
    }
    
    res.json({
      success: true,
      user: {
        id: user.user_id,
        employeeCode: user.employee_code,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role_name,
        permissions,
        locationId: user.default_location_id,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh Token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret');
    
    const result = await db.query(
      `SELECT u.*, r.role_name, r.permissions
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = @userId AND u.is_active = true`,
      { userId: decoded.userId }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('User not found');
    }
    
    const user = result.recordset[0];
    
    const accessToken = jwt.sign(
      { userId: user.user_id, role: user.role_name },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});

// Get Current User
router.get('/me', authenticate, async (req, res) => {
  res.json({
    id: req.user.user_id,
    employeeCode: req.user.employee_code,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    email: req.user.email,
    role: req.user.role_name,
    permissions: req.user.permissions,
    locationId: req.user.default_location_id,
    locationName: req.user.location_name,
  });
});

// Change Password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    
    const { currentPassword, newPassword } = req.body;
    
    const result = await db.query(
      'SELECT password_hash FROM users WHERE user_id = @userId',
      { userId: req.user.user_id }
    );
    
    const validPassword = await bcrypt.compare(currentPassword, result.recordset[0].password_hash);
    if (!validPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await db.query(
      'UPDATE users SET password_hash = @password, updated_at = CURRENT_TIMESTAMP WHERE user_id = @userId',
      { password: hashedPassword, userId: req.user.user_id }
    );
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Verify Manager PIN
router.post('/verify-pin', authenticate, [
  body('pin').notEmpty().isLength({ min: 4, max: 6 }),
], async (req, res, next) => {
  try {
    const { pin } = req.body;
    
    const result = await db.query(
      `SELECT u.user_id, u.first_name, u.last_name, r.role_name
       FROM users u
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE u.pin_hash = @pin 
         AND u.is_active = true
         AND r.role_name IN ('admin', 'manager')`,
      { pin }
    );
    
    if (result.recordset.length === 0) {
      return res.json({ valid: false });
    }
    
    res.json({ 
      valid: true,
      manager: {
        id: result.recordset[0].user_id,
        name: `${result.recordset[0].first_name} ${result.recordset[0].last_name}`,
        role: result.recordset[0].role_name,
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
