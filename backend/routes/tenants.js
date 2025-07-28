const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole, requireOwnerOrTenant } = require('../middleware/auth');
const { validateRequest, tenantSchema } = require('../middleware/validation');
const moment = require('moment');

const router = express.Router();

// Get all tenants for the authenticated owner
router.get('/', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', property_id } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT t.*, u.first_name, u.last_name, u.email, u.phone, p.name as property_name, p.address
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON t.property_id = p.id
      WHERE p.owner_id = $1
    `;
    
    const params = [req.user.id];
    
    if (property_id) {
      query += ` AND t.property_id = $${params.length + 1}`;
      params.push(property_id);
    }
    
    if (search) {
      query += ` AND (u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE p.owner_id = $1
    `;
    const countParams = [req.user.id];
    
    if (property_id) {
      countQuery += ` AND t.property_id = $2`;
      countParams.push(property_id);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      tenants: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ message: 'Server error fetching tenants' });
  }
});

// Get single tenant by ID
router.get('/:id', authenticateToken, requireOwnerOrTenant, async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT t.*, u.first_name, u.last_name, u.email, u.phone, 
             p.name as property_name, p.address, p.city, p.state, p.zip_code
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1
    `;
    
    const params = [id];
    
    if (req.user.role === 'owner') {
      query += ` AND p.owner_id = $2`;
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      query += ` AND t.user_id = $2`;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json({ tenant: result.rows[0] });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ message: 'Server error fetching tenant' });
  }
});

// Create new tenant
router.post('/', authenticateToken, requireRole('owner'), validateRequest(tenantSchema), async (req, res) => {
  try {
    const { user_id, property_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, lease_type } = req.body;

    // Verify property ownership
    const propertyResult = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [property_id, req.user.id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    // Verify user exists and is a tenant
    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE id = $1 AND role = $2 AND is_active = true',
      [user_id, 'tenant']
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant user not found' });
    }

    // Check if tenant is already assigned to this property
    const existingTenant = await pool.query(
      'SELECT id FROM tenants WHERE user_id = $1 AND property_id = $2 AND is_active = true',
      [user_id, property_id]
    );

    if (existingTenant.rows.length > 0) {
      return res.status(400).json({ message: 'Tenant is already assigned to this property' });
    }

    const result = await pool.query(`
      INSERT INTO tenants (user_id, property_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, lease_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [user_id, property_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, lease_type]);

    const tenant = result.rows[0];

    // Generate rent schedule
    await generateRentSchedule(tenant.id, lease_start_date, lease_end_date, monthly_rent, lease_type);

    res.status(201).json({
      message: 'Tenant created successfully',
      tenant
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ message: 'Server error creating tenant' });
  }
});

// Update tenant
router.put('/:id', authenticateToken, requireRole('owner'), validateRequest(tenantSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, property_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, lease_type } = req.body;

    // Verify tenant belongs to owner's property
    const checkResult = await pool.query(`
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const result = await pool.query(`
      UPDATE tenants SET
        user_id = $1, property_id = $2, lease_start_date = $3, lease_end_date = $4,
        monthly_rent = $5, security_deposit = $6, lease_type = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [user_id, property_id, lease_start_date, lease_end_date, monthly_rent, security_deposit, lease_type, id]);

    // Regenerate rent schedule if dates or amount changed
    await pool.query('DELETE FROM rent_schedule WHERE tenant_id = $1', [id]);
    await generateRentSchedule(id, lease_start_date, lease_end_date, monthly_rent, lease_type);

    res.json({
      message: 'Tenant updated successfully',
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ message: 'Server error updating tenant' });
  }
});

// Toggle tenant active status
router.patch('/:id/toggle-status', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify tenant belongs to owner's property
    const checkResult = await pool.query(`
      SELECT t.id, t.is_active FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const currentStatus = checkResult.rows[0].is_active;
    
    const result = await pool.query(`
      UPDATE tenants SET
        is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [!currentStatus, id]);

    res.json({
      message: `Tenant ${currentStatus ? 'deactivated' : 'activated'} successfully`,
      tenant: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle tenant status error:', error);
    res.status(500).json({ message: 'Server error updating tenant status' });
  }
});

// Get tenant dashboard (for tenants)
router.get('/:id/dashboard', authenticateToken, requireOwnerOrTenant, async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant info with property details
    let tenantQuery = `
      SELECT t.*, u.first_name, u.last_name, u.email, u.phone,
             p.name as property_name, p.address, p.city, p.state, p.zip_code,
             o.first_name as owner_first_name, o.last_name as owner_last_name, o.email as owner_email
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON t.property_id = p.id
      JOIN users o ON p.owner_id = o.id
      WHERE t.id = $1
    `;
    
    const tenantParams = [id];
    
    if (req.user.role === 'owner') {
      tenantQuery += ` AND p.owner_id = $2`;
      tenantParams.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      tenantQuery += ` AND t.user_id = $2`;
      tenantParams.push(req.user.id);
    }

    const tenantResult = await pool.query(tenantQuery, tenantParams);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenant = tenantResult.rows[0];

    // Get upcoming rent payments
    const upcomingRentResult = await pool.query(`
      SELECT * FROM rent_schedule
      WHERE tenant_id = $1 AND is_paid = false AND due_date >= CURRENT_DATE
      ORDER BY due_date
      LIMIT 3
    `, [id]);

    // Get transaction history
    const transactionsResult = await pool.query(`
      SELECT * FROM transactions
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [id]);

    // Get lease expiry reminder (3 months before)
    const leaseExpiryReminder = moment(tenant.lease_end_date).subtract(3, 'months');
    const showLeaseReminder = moment().isAfter(leaseExpiryReminder);

    res.json({
      tenant,
      upcomingRent: upcomingRentResult.rows,
      recentTransactions: transactionsResult.rows,
      leaseExpiryReminder: showLeaseReminder ? {
        show: true,
        daysUntilExpiry: moment(tenant.lease_end_date).diff(moment(), 'days'),
        expiryDate: tenant.lease_end_date
      } : { show: false }
    });
  } catch (error) {
    console.error('Get tenant dashboard error:', error);
    res.status(500).json({ message: 'Server error fetching tenant dashboard' });
  }
});

// Get rent schedule for tenant
router.get('/:id/rent-schedule', authenticateToken, requireOwnerOrTenant, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify access
    let verifyQuery = 'SELECT t.id FROM tenants t';
    const verifyParams = [id];
    
    if (req.user.role === 'owner') {
      verifyQuery += ' JOIN properties p ON t.property_id = p.id WHERE t.id = $1 AND p.owner_id = $2';
      verifyParams.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      verifyQuery += ' WHERE t.id = $1 AND t.user_id = $2';
      verifyParams.push(req.user.id);
    }

    const verifyResult = await pool.query(verifyQuery, verifyParams);
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const scheduleResult = await pool.query(`
      SELECT * FROM rent_schedule
      WHERE tenant_id = $1
      ORDER BY due_date
    `, [id]);

    res.json({ rentSchedule: scheduleResult.rows });
  } catch (error) {
    console.error('Get rent schedule error:', error);
    res.status(500).json({ message: 'Server error fetching rent schedule' });
  }
});

// Helper function to generate rent schedule
async function generateRentSchedule(tenantId, startDate, endDate, monthlyRent, leaseType) {
  try {
    const start = moment(startDate);
    const end = moment(endDate);
    const scheduleEntries = [];

    if (leaseType === 'monthly') {
      let current = start.clone();
      while (current.isSameOrBefore(end)) {
        scheduleEntries.push([tenantId, current.format('YYYY-MM-DD'), monthlyRent]);
        current.add(1, 'month');
      }
    } else if (leaseType === 'yearly') {
      let current = start.clone();
      const yearlyRent = monthlyRent * 12;
      while (current.isSameOrBefore(end)) {
        scheduleEntries.push([tenantId, current.format('YYYY-MM-DD'), yearlyRent]);
        current.add(1, 'year');
      }
    }

    // Insert all schedule entries
    if (scheduleEntries.length > 0) {
      const values = scheduleEntries.map((_, index) => 
        `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`
      ).join(',');
      
      const query = `INSERT INTO rent_schedule (tenant_id, due_date, amount) VALUES ${values}`;
      const params = scheduleEntries.flat();
      
      await pool.query(query, params);
    }
  } catch (error) {
    console.error('Generate rent schedule error:', error);
    throw error;
  }
}

module.exports = router;