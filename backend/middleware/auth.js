const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure they still exist and are active
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid token or user not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};

const requireOwnerOrTenant = async (req, res, next) => {
  try {
    const { tenantId, propertyId } = req.params;
    
    if (req.user.role === 'owner') {
      // Owners can access their own properties and tenants
      if (propertyId) {
        const propertyResult = await pool.query(
          'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
          [propertyId, req.user.id]
        );
        if (propertyResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied to this property' });
        }
      }
      
      if (tenantId) {
        const tenantResult = await pool.query(`
          SELECT t.id FROM tenants t
          JOIN properties p ON t.property_id = p.id
          WHERE t.id = $1 AND p.owner_id = $2
        `, [tenantId, req.user.id]);
        
        if (tenantResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied to this tenant' });
        }
      }
    } else if (req.user.role === 'tenant') {
      // Tenants can only access their own data
      if (tenantId) {
        const tenantResult = await pool.query(
          'SELECT id FROM tenants WHERE id = $1 AND user_id = $2',
          [tenantId, req.user.id]
        );
        if (tenantResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ message: 'Server error during authorization' });
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireOwnerOrTenant
};