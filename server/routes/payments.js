const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Get all payments with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      tenantId, propertyId, startDate, endDate, status, 
      paymentType, page = 1, limit = 20 
    } = req.query;

    let query;
    let params = [];
    let paramCount = 0;

    if (req.user.role === 'owner') {
      query = `
        SELECT p.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               prop.name as property_name, prop.address as property_address,
               l.start_date, l.end_date
        FROM payments p
        JOIN tenants t ON p.tenant_id = t.id
        JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN leases l ON p.lease_id = l.id
        WHERE prop.owner_id = $1
      `;
      params.push(req.user.id);
      paramCount = 1;
    } else {
      query = `
        SELECT p.*, 
               prop.name as property_name, prop.address as property_address,
               l.start_date, l.end_date
        FROM payments p
        JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN leases l ON p.lease_id = l.id
        WHERE p.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
      `;
      params.push(req.user.id);
      paramCount = 1;
    }

    // Add filters
    if (tenantId) {
      paramCount++;
      query += ` AND p.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (propertyId) {
      paramCount++;
      query += ` AND p.property_id = $${paramCount}`;
      params.push(propertyId);
    }

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

    if (paymentType) {
      paramCount++;
      query += ` AND p.payment_type = $${paramCount}`;
      params.push(paymentType);
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination and ordering
    query += ` ORDER BY p.due_date DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({
      payments: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

// Get single payment by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT p.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               prop.name as property_name, prop.address as property_address,
               l.start_date, l.end_date
        FROM payments p
        JOIN tenants t ON p.tenant_id = t.id
        JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN leases l ON p.lease_id = l.id
        WHERE p.id = $1 AND prop.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT p.*, 
               prop.name as property_name, prop.address as property_address,
               l.start_date, l.end_date
        FROM payments p
        JOIN properties prop ON p.property_id = prop.id
        LEFT JOIN leases l ON p.lease_id = l.id
        WHERE p.id = $1 AND p.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ payment: result.rows[0] });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to get payment' });
  }
});

// Create new payment (owners only)
router.post('/', requireOwner, [
  body('leaseId').optional().isInt({ min: 1 }),
  body('tenantId').isInt({ min: 1 }),
  body('propertyId').isInt({ min: 1 }),
  body('paymentType').isIn(['rent', 'utility', 'deposit', 'late_fee', 'other']),
  body('amount').isFloat({ min: 0 }),
  body('dueDate').isISO8601(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      leaseId, tenantId, propertyId, paymentType, 
      amount, dueDate, description = ''
    } = req.body;

    // Check if property belongs to owner
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, req.user.id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Check if tenant exists
    const tenantCheck = await pool.query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if lease exists and belongs to the property/tenant
    if (leaseId) {
      const leaseCheck = await pool.query(
        'SELECT id FROM leases WHERE id = $1 AND property_id = $2 AND tenant_id = $3',
        [leaseId, propertyId, tenantId]
      );

      if (leaseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lease not found' });
      }
    }

    const result = await pool.query(
      `INSERT INTO payments (
        lease_id, tenant_id, property_id, payment_type, 
        amount, due_date, status, description
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *`,
      [leaseId, tenantId, propertyId, paymentType, amount, dueDate, description]
    );

    res.status(201).json({
      message: 'Payment created successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Update payment (owners can update any, tenants can only mark as paid)
router.put('/:id', [
  body('amount').optional().isFloat({ min: 0 }),
  body('dueDate').optional().isISO8601(),
  body('status').optional().isIn(['pending', 'paid', 'overdue', 'cancelled']),
  body('paidDate').optional().isISO8601(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Check permissions and get payment
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT p.* FROM payments p
        JOIN properties prop ON p.property_id = prop.id
        WHERE p.id = $1 AND prop.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT p.* FROM payments p
        WHERE p.id = $1 AND p.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const paymentCheck = await pool.query(query, params);
    
    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Tenants can only update status to 'paid' and add paid_date
    if (req.user.role === 'tenant') {
      const allowedFields = ['status', 'paidDate'];
      Object.keys(updateFields).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete updateFields[key];
        }
      });

      // Tenants can only mark as paid
      if (updateFields.status && updateFields.status !== 'paid') {
        return res.status(403).json({ error: 'Tenants can only mark payments as paid' });
      }
    }

    // Build dynamic update query
    const setFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      amount: 'amount',
      dueDate: 'due_date',
      status: 'status',
      paidDate: 'paid_date',
      description: 'description'
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

    const updateQuery = `
      UPDATE payments 
      SET ${setFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      message: 'Payment updated successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// Mark payment as paid (tenants can use this)
router.put('/:id/mark-paid', [
  body('paidDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { paidDate } = req.body;

    // Check if payment belongs to tenant
    const paymentCheck = await pool.query(
      `SELECT p.* FROM payments p
       WHERE p.id = $1 AND p.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)`,
      [id, req.user.id]
    );

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentCheck.rows[0];

    if (payment.status === 'paid') {
      return res.status(400).json({ error: 'Payment is already marked as paid' });
    }

    const result = await pool.query(
      `UPDATE payments 
       SET status = 'paid', paid_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [paidDate || new Date().toISOString().split('T')[0], id]
    );

    res.json({
      message: 'Payment marked as paid successfully',
      payment: result.rows[0]
    });
  } catch (error) {
    console.error('Mark payment paid error:', error);
    res.status(500).json({ error: 'Failed to mark payment as paid' });
  }
});

// Delete payment (owners only)
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if payment belongs to owner's property
    const paymentCheck = await pool.query(
      `SELECT p.* FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       WHERE p.id = $1 AND prop.owner_id = $2`,
      [id, req.user.id]
    );

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await pool.query('DELETE FROM payments WHERE id = $1', [id]);

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// Get overdue payments
router.get('/overdue/list', async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    let query;
    let params = [today];

    if (req.user.role === 'owner') {
      query = `
        SELECT p.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               prop.name as property_name
        FROM payments p
        JOIN tenants t ON p.tenant_id = t.id
        JOIN properties prop ON p.property_id = prop.id
        WHERE p.due_date < $1 
        AND p.status = 'pending'
        AND prop.owner_id = $2
        ORDER BY p.due_date ASC
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT p.*, prop.name as property_name
        FROM payments p
        JOIN properties prop ON p.property_id = prop.id
        WHERE p.due_date < $1 
        AND p.status = 'pending'
        AND p.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
        ORDER BY p.due_date ASC
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    res.json({ overduePayments: result.rows });
  } catch (error) {
    console.error('Get overdue payments error:', error);
    res.status(500).json({ error: 'Failed to get overdue payments' });
  }
});

// Get payment statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    let query;
    let params = [];
    let paramCount = 0;

    if (req.user.role === 'owner') {
      query = `
        SELECT 
          COUNT(*) as total_payments,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_payments,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_payments,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_collected,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as total_overdue
        FROM payments p
        JOIN properties prop ON p.property_id = prop.id
        WHERE prop.owner_id = $1
      `;
      params.push(req.user.id);
      paramCount = 1;
    } else {
      query = `
        SELECT 
          COUNT(*) as total_payments,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_payments,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_payments,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_collected,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as total_overdue
        FROM payments p
        WHERE p.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
      `;
      params.push(req.user.id);
      paramCount = 1;
    }

    // Add date filters
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

    if (propertyId) {
      paramCount++;
      query += ` AND p.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    const result = await pool.query(query, params);
    res.json({ stats: result.rows[0] });
  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({ error: 'Failed to get payment statistics' });
  }
});

module.exports = router;