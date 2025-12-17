const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    
    // Get user from database
    const result = await db.query(
      `SELECT u.*, r.role_name, r.permissions, l.location_code, l.location_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN locations l ON u.default_location_id = l.location_id
       WHERE u.user_id = @userId AND u.is_active = true`,
      { userId: decoded.userId }
    );
    
    if (result.recordset.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    req.user = result.recordset[0];
    
    // Parse permissions safely
    try {
      req.user.permissions = typeof req.user.permissions === 'string' 
        ? JSON.parse(req.user.permissions) 
        : (req.user.permissions || {});
    } catch (e) {
      req.user.permissions = {};
    }
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired token'));
    }
    next(error);
  }
};

// Check specific permission
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    const userPermissions = req.user.permissions;
    
    // Admin has all permissions
    if (userPermissions.all === true || userPermissions['*']) {
      return next();
    }
    
    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(permission => {
      // Check exact match
      if (userPermissions[permission]) return true;
      
      // Check wildcard
      const category = permission.split('.')[0];
      return userPermissions[category] === true;
    });
    
    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    
    next();
  };
};

// Verify Manager PIN for sensitive operations
const verifyManagerPIN = async (req, res, next) => {
  try {
    const { managerPIN } = req.body;
    
    if (!managerPIN) {
      throw new ForbiddenError('Manager PIN required for this operation');
    }
    
    // Find manager with this PIN at the same location
    const result = await db.query(
      `SELECT u.user_id, u.first_name, u.last_name, r.role_name
       FROM users u
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE u.pin_hash = @pin 
         AND u.is_active = true
         AND (u.default_location_id = @locationId OR r.role_name = 'admin')`,
      { 
        pin: managerPIN,
        locationId: req.user.default_location_id
      }
    );
    
    if (result.recordset.length === 0) {
      throw new ForbiddenError('Invalid Manager PIN');
    }
    
    req.approvedBy = result.recordset[0];
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  authorize,
  verifyManagerPIN,
};
