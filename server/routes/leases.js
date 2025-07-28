const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Get all leases (owners see all, tenants see their own)
router.get('/', async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user.role === 'owner') {
      query = `
        SELECT l.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name, t.email as tenant_email,
               p.name as property_name, p.address as property_address,
               COUNT(pay.id) as total_payments,
               COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) as total_paid
        FROM leases l
        JOIN tenants t ON l.tenant_id = t.id
        JOIN properties p ON l.property_id = p.id
        LEFT JOIN payments pay ON l.id = pay.lease_id
        WHERE p.owner_id = $1
        GROUP BY l.id, t.first_name, t.last_name, t.email, p.name, p.address
        ORDER BY l.created_at DESC
      `;
      params = [req.user.id];
    } else {
      query = `
        SELECT l.*, 
               p.name as property_name, p.address as property_address,
               COUNT(pay.id) as total_payments,
               COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) as total_paid
        FROM leases l
        JOIN properties p ON l.property_id = p.id
        LEFT JOIN payments pay ON l.id = pay.lease_id
        WHERE l.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
        GROUP BY l.id, p.name, p.address
        ORDER BY l.created_at DESC
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json({ leases: result.rows });
  } catch (error) {
    console.error('Get leases error:', error);
    res.status(500).json({ error: 'Failed to get leases' });
  }
});

// Get single lease by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT l.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name, t.email as tenant_email,
               p.name as property_name, p.address as property_address
        FROM leases l
        JOIN tenants t ON l.tenant_id = t.id
        JOIN properties p ON l.property_id = p.id
        WHERE l.id = $1 AND p.owner_id = $2
      `;
      params = [id, req.user.id];
    } else {
      query = `
        SELECT l.*, 
               p.name as property_name, p.address as property_address
        FROM leases l
        JOIN properties p ON l.property_id = p.id
        WHERE l.id = $1 AND l.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params = [id, req.user.id];
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    res.json({ lease: result.rows[0] });
  } catch (error) {
    console.error('Get lease error:', error);
    res.status(500).json({ error: 'Failed to get lease' });
  }
});

// Create new lease (owners only)
router.post('/', requireOwner, [
  body('propertyId').isInt({ min: 1 }),
  body('tenantId').isInt({ min: 1 }),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('monthlyRent').isFloat({ min: 0 }),
  body('securityDeposit').optional().isFloat({ min: 0 }),
  body('lateFee').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      propertyId, tenantId, startDate, endDate, 
      monthlyRent, securityDeposit = 0, lateFee = 0
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

    // Check if property has active lease
    const activeLeaseCheck = await pool.query(
      'SELECT id FROM leases WHERE property_id = $1 AND status = $2',
      [propertyId, 'active']
    );

    if (activeLeaseCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Property already has an active lease' });
    }

    // Validate dates
    const start = moment(startDate);
    const end = moment(endDate);
    
    if (start.isAfter(end)) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    if (start.isBefore(moment(), 'day')) {
      return res.status(400).json({ error: 'Start date cannot be in the past' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create lease
      const leaseResult = await client.query(
        `INSERT INTO leases (
          property_id, tenant_id, start_date, end_date, 
          monthly_rent, security_deposit, late_fee, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
        RETURNING *`,
        [propertyId, tenantId, startDate, endDate, monthlyRent, securityDeposit, lateFee]
      );

      const lease = leaseResult.rows[0];

      // Generate monthly rent payments for the lease term
      const payments = [];
      let currentDate = moment(startDate);
      const endMoment = moment(endDate);

      while (currentDate.isBefore(endMoment) || currentDate.isSame(endMoment, 'month')) {
        const dueDate = currentDate.format('YYYY-MM-DD');
        
        payments.push({
          lease_id: lease.id,
          tenant_id: tenantId,
          property_id: propertyId,
          payment_type: 'rent',
          amount: monthlyRent,
          due_date: dueDate,
          status: 'pending',
          description: `Rent for ${currentDate.format('MMMM YYYY')}`
        });

        currentDate.add(1, 'month');
      }

      // Insert all payments
      for (const payment of payments) {
        await client.query(
          `INSERT INTO payments (
            lease_id, tenant_id, property_id, payment_type, 
            amount, due_date, status, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            payment.lease_id, payment.tenant_id, payment.property_id,
            payment.payment_type, payment.amount, payment.due_date,
            payment.status, payment.description
          ]
        );
      }

      // Add security deposit payment
      if (securityDeposit > 0) {
        await client.query(
          `INSERT INTO payments (
            lease_id, tenant_id, property_id, payment_type, 
            amount, due_date, status, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lease.id, tenantId, propertyId, 'deposit',
            securityDeposit, startDate, 'pending', 'Security Deposit'
          ]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: 'Lease created successfully',
        lease: lease,
        paymentsGenerated: payments.length + (securityDeposit > 0 ? 1 : 0)
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create lease error:', error);
    res.status(500).json({ error: 'Failed to create lease' });
  }
});

// Update lease (owners only)
router.put('/:id', requireOwner, [
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('monthlyRent').optional().isFloat({ min: 0 }),
  body('securityDeposit').optional().isFloat({ min: 0 }),
  body('lateFee').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['active', 'expired', 'terminated'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Check if lease belongs to owner's property
    const leaseCheck = await pool.query(
      `SELECT l.*, p.owner_id 
       FROM leases l
       JOIN properties p ON l.property_id = p.id
       WHERE l.id = $1`,
      [id]
    );

    if (leaseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    if (leaseCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build dynamic update query
    const setFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      startDate: 'start_date',
      endDate: 'end_date',
      monthlyRent: 'monthly_rent',
      securityDeposit: 'security_deposit',
      lateFee: 'late_fee',
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
      UPDATE leases 
      SET ${setFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Lease updated successfully',
      lease: result.rows[0]
    });
  } catch (error) {
    console.error('Update lease error:', error);
    res.status(500).json({ error: 'Failed to update lease' });
  }
});

// Terminate lease (owners only)
router.put('/:id/terminate', requireOwner, [
  body('terminationDate').isISO8601(),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { terminationDate, reason } = req.body;

    // Check if lease belongs to owner's property
    const leaseCheck = await pool.query(
      `SELECT l.*, p.owner_id 
       FROM leases l
       JOIN properties p ON l.property_id = p.id
       WHERE l.id = $1`,
      [id]
    );

    if (leaseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    if (leaseCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update lease status
      await client.query(
        'UPDATE leases SET status = $1, end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['terminated', terminationDate, id]
      );

      // Cancel future payments
      await client.query(
        'UPDATE payments SET status = $1 WHERE lease_id = $2 AND due_date > $3 AND status = $4',
        ['cancelled', id, terminationDate, 'pending']
      );

      await client.query('COMMIT');

      res.json({ message: 'Lease terminated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Terminate lease error:', error);
    res.status(500).json({ error: 'Failed to terminate lease' });
  }
});

// Get lease payments
router.get('/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (req.user.role === 'tenant') {
      const leaseCheck = await pool.query(
        `SELECT l.id FROM leases l
         JOIN tenants t ON l.tenant_id = t.id
         WHERE l.id = $1 AND t.user_id = $2`,
        [id, req.user.id]
      );

      if (leaseCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      const leaseCheck = await pool.query(
        `SELECT l.id FROM leases l
         JOIN properties p ON l.property_id = p.id
         WHERE l.id = $1 AND p.owner_id = $2`,
        [id, req.user.id]
      );

      if (leaseCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Lease not found' });
      }
    }

    const result = await pool.query(
      'SELECT * FROM payments WHERE lease_id = $1 ORDER BY due_date DESC',
      [id]
    );

    res.json({ payments: result.rows });
  } catch (error) {
    console.error('Get lease payments error:', error);
    res.status(500).json({ error: 'Failed to get lease payments' });
  }
});

// Get lease reminders (for 3-month lease expiration)
router.get('/reminders', requireOwner, async (req, res) => {
  try {
    const threeMonthsFromNow = moment().add(3, 'months').format('YYYY-MM-DD');
    
    const result = await pool.query(
      `SELECT l.*, 
              t.first_name, t.last_name, t.email,
              p.name as property_name
       FROM leases l
       JOIN tenants t ON l.tenant_id = t.id
       JOIN properties p ON l.property_id = p.id
       WHERE l.end_date <= $1 
       AND l.status = 'active'
       AND p.owner_id = $2
       ORDER BY l.end_date ASC`,
      [threeMonthsFromNow, req.user.id]
    );

    res.json({ reminders: result.rows });
  } catch (error) {
    console.error('Get lease reminders error:', error);
    res.status(500).json({ error: 'Failed to get lease reminders' });
  }
});

module.exports = router;