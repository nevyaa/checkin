const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

// Get all tenants (owners see all, tenants see only themselves)
router.get('/', async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user.role === 'owner') {
      query = `
        SELECT t.*, 
               COUNT(DISTINCT l.id) as active_leases,
               COUNT(DISTINCT p.id) as total_properties,
               COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) as total_paid,
               COALESCE(SUM(CASE WHEN pay.status = 'pending' THEN pay.amount ELSE 0 END), 0) as pending_amount
        FROM tenants t
        LEFT JOIN leases l ON t.id = l.tenant_id AND l.status = 'active'
        LEFT JOIN properties p ON l.property_id = p.id
        LEFT JOIN payments pay ON l.id = pay.lease_id
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `;
    } else {
      // Tenant view - show only their own information
      query = `
        SELECT t.*, 
               l.start_date, l.end_date, l.monthly_rent,
               p.name as property_name, p.address as property_address
        FROM tenants t
        LEFT JOIN leases l ON t.id = l.tenant_id AND l.status = 'active'
        LEFT JOIN properties p ON l.property_id = p.id
        WHERE t.user_id = $1
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json({ tenants: result.rows });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ error: 'Failed to get tenants' });
  }
});

// Get single tenant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT t.*, 
               COUNT(DISTINCT l.id) as active_leases,
               COUNT(DISTINCT p.id) as total_properties,
               COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) as total_paid,
               COALESCE(SUM(CASE WHEN pay.status = 'pending' THEN pay.amount ELSE 0 END), 0) as pending_amount
        FROM tenants t
        LEFT JOIN leases l ON t.id = l.tenant_id AND l.status = 'active'
        LEFT JOIN properties p ON l.property_id = p.id
        LEFT JOIN payments pay ON l.id = pay.lease_id
        WHERE t.id = $1
        GROUP BY t.id
      `;
    } else {
      // Tenant can only view their own information
      query = `
        SELECT t.*, 
               l.start_date, l.end_date, l.monthly_rent,
               p.name as property_name, p.address as property_address
        FROM tenants t
        LEFT JOIN leases l ON t.id = l.tenant_id AND l.status = 'active'
        LEFT JOIN properties p ON l.property_id = p.id
        WHERE t.id = $1 AND t.user_id = $2
      `;
      params = [id, req.user.id];
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant: result.rows[0] });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

// Create new tenant (owners only)
router.post('/', requireOwner, [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone(),
  body('emergencyContact').optional().trim(),
  body('emergencyPhone').optional().isMobilePhone(),
  body('status').optional().isIn(['active', 'inactive', 'evicted'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName, lastName, email, phone, 
      emergencyContact, emergencyPhone, status = 'active'
    } = req.body;

    // Check if tenant email already exists
    const existingTenant = await pool.query(
      'SELECT id FROM tenants WHERE email = $1',
      [email]
    );

    if (existingTenant.rows.length > 0) {
      return res.status(400).json({ error: 'Tenant with this email already exists' });
    }

    const result = await pool.query(
      `INSERT INTO tenants (
        first_name, last_name, email, phone, 
        emergency_contact, emergency_phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [firstName, lastName, email, phone, emergencyContact, emergencyPhone, status]
    );

    res.status(201).json({
      message: 'Tenant created successfully',
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// Update tenant (owners can update any tenant, tenants can update their own info)
router.put('/:id', [
  body('firstName').optional().notEmpty().trim(),
  body('lastName').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().isMobilePhone(),
  body('emergencyContact').optional().trim(),
  body('emergencyPhone').optional().isMobilePhone(),
  body('status').optional().isIn(['active', 'inactive', 'evicted'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Check permissions
    if (req.user.role === 'tenant') {
      const tenantCheck = await pool.query(
        'SELECT id FROM tenants WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (tenantCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Tenants can only update certain fields
      const allowedFields = ['firstName', 'lastName', 'phone', 'emergencyContact', 'emergencyPhone'];
      Object.keys(updateFields).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete updateFields[key];
        }
      });
    }

    // Build dynamic update query
    const setFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      emergencyContact: 'emergency_contact',
      emergencyPhone: 'emergency_phone',
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

    let query;
    if (req.user.role === 'owner') {
      query = `
        UPDATE tenants 
        SET ${setFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;
    } else {
      query = `
        UPDATE tenants 
        SET ${setFields.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *
      `;
      values.push(req.user.id);
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({
      message: 'Tenant updated successfully',
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Delete tenant (owners only)
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if tenant has active leases
    const leaseCheck = await pool.query(
      'SELECT id FROM leases WHERE tenant_id = $1 AND status = $2',
      [id, 'active']
    );

    if (leaseCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete tenant with active leases' 
      });
    }

    await pool.query('DELETE FROM tenants WHERE id = $1', [id]);

    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// Get tenant's lease history
router.get('/:id/leases', async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (req.user.role === 'tenant') {
      const tenantCheck = await pool.query(
        'SELECT id FROM tenants WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (tenantCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await pool.query(
      `SELECT l.*, p.name as property_name, p.address as property_address
       FROM leases l
       JOIN properties p ON l.property_id = p.id
       WHERE l.tenant_id = $1
       ORDER BY l.created_at DESC`,
      [id]
    );

    res.json({ leases: result.rows });
  } catch (error) {
    console.error('Get tenant leases error:', error);
    res.status(500).json({ error: 'Failed to get tenant leases' });
  }
});

// Get tenant's payment history
router.get('/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status } = req.query;

    // Check permissions
    if (req.user.role === 'tenant') {
      const tenantCheck = await pool.query(
        'SELECT id FROM tenants WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (tenantCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    let query = `
      SELECT p.*, l.start_date, l.end_date, prop.name as property_name
      FROM payments p
      JOIN leases l ON p.lease_id = l.id
      JOIN properties prop ON l.property_id = prop.id
      WHERE p.tenant_id = $1
    `;
    const params = [id];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND p.due_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND p.due_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY p.due_date DESC';

    const result = await pool.query(query, params);
    res.json({ payments: result.rows });
  } catch (error) {
    console.error('Get tenant payments error:', error);
    res.status(500).json({ error: 'Failed to get tenant payments' });
  }
});

module.exports = router;