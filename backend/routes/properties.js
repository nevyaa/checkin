const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateRequest, propertySchema } = require('../middleware/validation');

const router = express.Router();

// Get all properties for the authenticated owner
router.get('/', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, 
        COUNT(t.id) as tenant_count,
        COALESCE(SUM(t.monthly_rent), 0) as total_monthly_rent
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id AND t.is_active = true
      WHERE p.owner_id = $1 AND p.is_active = true
    `;
    
    const params = [req.user.id];
    
    if (search) {
      query += ` AND (p.name ILIKE $${params.length + 1} OR p.address ILIKE $${params.length + 1} OR p.city ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM properties WHERE owner_id = $1 AND is_active = true';
    const countParams = [req.user.id];
    
    if (search) {
      countQuery += ` AND (name ILIKE $2 OR address ILIKE $2 OR city ILIKE $2)`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      properties: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ message: 'Server error fetching properties' });
  }
});

// Get single property by ID
router.get('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT p.*, 
        COUNT(t.id) as tenant_count,
        COALESCE(SUM(t.monthly_rent), 0) as total_monthly_rent
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id AND t.is_active = true
      WHERE p.id = $1 AND p.owner_id = $2 AND p.is_active = true
      GROUP BY p.id
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json({ property: result.rows[0] });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ message: 'Server error fetching property' });
  }
});

// Create new property
router.post('/', authenticateToken, requireRole('owner'), validateRequest(propertySchema), async (req, res) => {
  try {
    const {
      name, address, city, state, zip_code, property_type,
      bedrooms, bathrooms, square_feet, purchase_price, purchase_date, description
    } = req.body;

    const result = await pool.query(`
      INSERT INTO properties (
        owner_id, name, address, city, state, zip_code, property_type,
        bedrooms, bathrooms, square_feet, purchase_price, purchase_date, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      req.user.id, name, address, city, state, zip_code, property_type,
      bedrooms, bathrooms, square_feet, purchase_price, purchase_date, description
    ]);

    res.status(201).json({
      message: 'Property created successfully',
      property: result.rows[0]
    });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ message: 'Server error creating property' });
  }
});

// Update property
router.put('/:id', authenticateToken, requireRole('owner'), validateRequest(propertySchema), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, address, city, state, zip_code, property_type,
      bedrooms, bathrooms, square_feet, purchase_price, purchase_date, description
    } = req.body;

    // Check if property belongs to the owner
    const checkResult = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const result = await pool.query(`
      UPDATE properties SET
        name = $1, address = $2, city = $3, state = $4, zip_code = $5,
        property_type = $6, bedrooms = $7, bathrooms = $8, square_feet = $9,
        purchase_price = $10, purchase_date = $11, description = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND owner_id = $14
      RETURNING *
    `, [
      name, address, city, state, zip_code, property_type,
      bedrooms, bathrooms, square_feet, purchase_price, purchase_date, description,
      id, req.user.id
    ]);

    res.json({
      message: 'Property updated successfully',
      property: result.rows[0]
    });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ message: 'Server error updating property' });
  }
});

// Toggle property active status
router.patch('/:id/toggle-status', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if property belongs to the owner
    const checkResult = await pool.query(
      'SELECT id, is_active FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const currentStatus = checkResult.rows[0].is_active;
    
    const result = await pool.query(`
      UPDATE properties SET
        is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND owner_id = $3
      RETURNING *
    `, [!currentStatus, id, req.user.id]);

    res.json({
      message: `Property ${currentStatus ? 'deactivated' : 'activated'} successfully`,
      property: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle property status error:', error);
    res.status(500).json({ message: 'Server error updating property status' });
  }
});

// Delete property (soft delete)
router.delete('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if property belongs to the owner
    const checkResult = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Check if property has active tenants
    const tenantsResult = await pool.query(
      'SELECT COUNT(*) FROM tenants WHERE property_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(tenantsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete property with active tenants. Please deactivate all tenants first.' 
      });
    }

    // Soft delete the property
    await pool.query(
      'UPDATE properties SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );

    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ message: 'Server error deleting property' });
  }
});

// Get property dashboard data
router.get('/:id/dashboard', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify property ownership
    const propertyResult = await pool.query(
      'SELECT id, name FROM properties WHERE id = $1 AND owner_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Get tenants
    const tenantsResult = await pool.query(`
      SELECT t.*, u.first_name, u.last_name, u.email, u.phone
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      WHERE t.property_id = $1 AND t.is_active = true
      ORDER BY t.lease_start_date DESC
    `, [id]);

    // Get recent transactions
    const transactionsResult = await pool.query(`
      SELECT tr.*, u.first_name, u.last_name
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      WHERE tr.property_id = $1
      ORDER BY tr.created_at DESC
      LIMIT 10
    `, [id]);

    // Get monthly income
    const incomeResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', due_date) as month,
        SUM(amount) as total_income
      FROM transactions
      WHERE property_id = $1 AND is_paid = true AND transaction_type = 'rent'
        AND due_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
      GROUP BY DATE_TRUNC('month', due_date)
      ORDER BY month
    `, [id]);

    // Get expenses for the property
    const expensesResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', expense_date) as month,
        SUM(amount) as total_expenses
      FROM expenses
      WHERE property_id = $1
        AND expense_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
      GROUP BY DATE_TRUNC('month', expense_date)
      ORDER BY month
    `, [id]);

    res.json({
      property: propertyResult.rows[0],
      tenants: tenantsResult.rows,
      recentTransactions: transactionsResult.rows,
      monthlyIncome: incomeResult.rows,
      monthlyExpenses: expensesResult.rows
    });
  } catch (error) {
    console.error('Get property dashboard error:', error);
    res.status(500).json({ message: 'Server error fetching property dashboard' });
  }
});

module.exports = router;