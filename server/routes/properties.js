const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

// Get all properties (owners see their own, tenants see assigned properties)
router.get('/', async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user.role === 'owner') {
      query = `
        SELECT p.*, 
               COUNT(DISTINCT l.id) as active_leases,
               COUNT(DISTINCT t.id) as total_tenants
        FROM properties p
        LEFT JOIN leases l ON p.id = l.property_id AND l.status = 'active'
        LEFT JOIN tenants t ON l.tenant_id = t.id
        WHERE p.owner_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `;
      params = [req.user.id];
    } else {
      // Tenant view - show properties they have leases for
      query = `
        SELECT p.*, l.start_date, l.end_date, l.monthly_rent
        FROM properties p
        JOIN leases l ON p.id = l.property_id
        WHERE l.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
        AND l.status = 'active'
        ORDER BY p.name
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json({ properties: result.rows });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ error: 'Failed to get properties' });
  }
});

// Get single property by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT p.*, 
               COUNT(DISTINCT l.id) as active_leases,
               COUNT(DISTINCT t.id) as total_tenants
        FROM properties p
        LEFT JOIN leases l ON p.id = l.property_id AND l.status = 'active'
        LEFT JOIN tenants t ON l.tenant_id = t.id
        WHERE p.id = $1 AND p.owner_id = $2
        GROUP BY p.id
      `;
      params = [id, req.user.id];
    } else {
      query = `
        SELECT p.*, l.start_date, l.end_date, l.monthly_rent
        FROM properties p
        JOIN leases l ON p.id = l.property_id
        WHERE p.id = $1 AND l.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
        AND l.status = 'active'
      `;
      params = [id, req.user.id];
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json({ property: result.rows[0] });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ error: 'Failed to get property' });
  }
});

// Create new property (owners only)
router.post('/', requireOwner, [
  body('name').notEmpty().trim(),
  body('address').notEmpty().trim(),
  body('propertyType').notEmpty().trim(),
  body('bedrooms').optional().isInt({ min: 0 }),
  body('bathrooms').optional().isInt({ min: 0 }),
  body('squareFeet').optional().isFloat({ min: 0 }),
  body('purchasePrice').optional().isFloat({ min: 0 }),
  body('purchaseDate').optional().isISO8601(),
  body('status').optional().isIn(['active', 'inactive', 'maintenance'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, address, propertyType, bedrooms, bathrooms, 
      squareFeet, purchasePrice, purchaseDate, status = 'active'
    } = req.body;

    const result = await pool.query(
      `INSERT INTO properties (
        name, address, property_type, bedrooms, bathrooms, 
        square_feet, purchase_price, purchase_date, status, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [name, address, propertyType, bedrooms, bathrooms, 
       squareFeet, purchasePrice, purchaseDate, status, req.user.id]
    );

    res.status(201).json({
      message: 'Property created successfully',
      property: result.rows[0]
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// Update property (owners only)
router.put('/:id', requireOwner, [
  body('name').optional().notEmpty().trim(),
  body('address').optional().notEmpty().trim(),
  body('propertyType').optional().notEmpty().trim(),
  body('bedrooms').optional().isInt({ min: 0 }),
  body('bathrooms').optional().isInt({ min: 0 }),
  body('squareFeet').optional().isFloat({ min: 0 }),
  body('purchasePrice').optional().isFloat({ min: 0 }),
  body('purchaseDate').optional().isISO8601(),
  body('status').optional().isIn(['active', 'inactive', 'maintenance'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Check if property belongs to owner
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Build dynamic update query
    const setFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      name: 'name',
      address: 'address',
      propertyType: 'property_type',
      bedrooms: 'bedrooms',
      bathrooms: 'bathrooms',
      squareFeet: 'square_feet',
      purchasePrice: 'purchase_price',
      purchaseDate: 'purchase_date',
      status: 'status'
    };

    Object.keys(updateFields).forEach(key => {
      if (fieldMappings[key] && updateFields[key] !== undefined) {
        setFields.push(`${fieldMappings[key]} = $${paramCount}`);
        values.push(updateFields[key]);
        paramCount++;
      }
    });

    if (setFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE properties 
      SET ${setFields.join(', ')}
      WHERE id = $${paramCount} AND owner_id = $${paramCount + 1}
      RETURNING *
    `;
    values.push(req.user.id);

    const result = await pool.query(query, values);

    res.json({
      message: 'Property updated successfully',
      property: result.rows[0]
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// Delete property (owners only)
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if property has active leases
    const leaseCheck = await pool.query(
      'SELECT id FROM leases WHERE property_id = $1 AND status = $2',
      [id, 'active']
    );

    if (leaseCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete property with active leases' 
      });
    }

    // Check if property belongs to owner
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    await pool.query(
      'DELETE FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// Get property statistics (owners only)
router.get('/:id/stats', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if property belongs to owner
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get property statistics
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT l.id) as total_leases,
        COUNT(DISTINCT CASE WHEN l.status = 'active' THEN l.id END) as active_leases,
        COUNT(DISTINCT t.id) as total_tenants,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_rent_collected,
        COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END), 0) as pending_rent,
        COALESCE(SUM(e.amount), 0) as total_expenses
      FROM properties prop
      LEFT JOIN leases l ON prop.id = l.property_id
      LEFT JOIN tenants t ON l.tenant_id = t.id
      LEFT JOIN payments p ON l.id = p.lease_id
      LEFT JOIN expenses e ON prop.id = e.property_id
      WHERE prop.id = $1
    `;

    const statsResult = await pool.query(statsQuery, [id]);
    const stats = statsResult.rows[0];

    // Calculate ROI
    const propertyQuery = await pool.query(
      'SELECT purchase_price FROM properties WHERE id = $1',
      [id]
    );
    
    const purchasePrice = propertyQuery.rows[0]?.purchase_price || 0;
    const roi = purchasePrice > 0 ? ((stats.total_rent_collected - stats.total_expenses) / purchasePrice) * 100 : 0;

    res.json({
      stats: {
        ...stats,
        roi: Math.round(roi * 100) / 100,
        netIncome: stats.total_rent_collected - stats.total_expenses
      }
    });
  } catch (error) {
    console.error('Get property stats error:', error);
    res.status(500).json({ error: 'Failed to get property statistics' });
  }
});

module.exports = router;