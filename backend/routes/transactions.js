const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole, requireOwnerOrTenant } = require('../middleware/auth');
const { validateRequest, transactionSchema } = require('../middleware/validation');
const moment = require('moment');

const router = express.Router();

// Get all transactions with filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      tenant_id, 
      property_id, 
      transaction_type, 
      is_paid, 
      start_date, 
      end_date,
      search = ''
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = `
      SELECT tr.*, t.monthly_rent, 
             u.first_name as tenant_first_name, u.last_name as tenant_last_name,
             p.name as property_name, p.address
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON tr.property_id = p.id
    `;
    
    const conditions = [];
    const params = [];
    
    // Role-based filtering
    if (req.user.role === 'owner') {
      conditions.push(`p.owner_id = $${params.length + 1}`);
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      conditions.push(`t.user_id = $${params.length + 1}`);
      params.push(req.user.id);
    }
    
    // Additional filters
    if (tenant_id) {
      conditions.push(`tr.tenant_id = $${params.length + 1}`);
      params.push(tenant_id);
    }
    
    if (property_id) {
      conditions.push(`tr.property_id = $${params.length + 1}`);
      params.push(property_id);
    }
    
    if (transaction_type) {
      conditions.push(`tr.transaction_type = $${params.length + 1}`);
      params.push(transaction_type);
    }
    
    if (is_paid !== undefined) {
      conditions.push(`tr.is_paid = $${params.length + 1}`);
      params.push(is_paid === 'true');
    }
    
    if (start_date) {
      conditions.push(`tr.due_date >= $${params.length + 1}`);
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push(`tr.due_date <= $${params.length + 1}`);
      params.push(end_date);
    }
    
    if (search) {
      conditions.push(`(u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1} OR p.name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY tr.due_date DESC, tr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      JOIN users u ON t.user_id = u.id
    `;
    
    const countConditions = [];
    const countParams = [];
    
    // Apply same conditions for count
    if (req.user.role === 'owner') {
      countConditions.push(`p.owner_id = $${countParams.length + 1}`);
      countParams.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      countConditions.push(`t.user_id = $${countParams.length + 1}`);
      countParams.push(req.user.id);
    }
    
    if (tenant_id) {
      countConditions.push(`tr.tenant_id = $${countParams.length + 1}`);
      countParams.push(tenant_id);
    }
    
    if (property_id) {
      countConditions.push(`tr.property_id = $${countParams.length + 1}`);
      countParams.push(property_id);
    }
    
    if (transaction_type) {
      countConditions.push(`tr.transaction_type = $${countParams.length + 1}`);
      countParams.push(transaction_type);
    }
    
    if (is_paid !== undefined) {
      countConditions.push(`tr.is_paid = $${countParams.length + 1}`);
      countParams.push(is_paid === 'true');
    }
    
    if (start_date) {
      countConditions.push(`tr.due_date >= $${countParams.length + 1}`);
      countParams.push(start_date);
    }
    
    if (end_date) {
      countConditions.push(`tr.due_date <= $${countParams.length + 1}`);
      countParams.push(end_date);
    }
    
    if (search) {
      countConditions.push(`(u.first_name ILIKE $${countParams.length + 1} OR u.last_name ILIKE $${countParams.length + 1} OR p.name ILIKE $${countParams.length + 1})`);
      countParams.push(`%${search}%`);
    }
    
    if (countConditions.length > 0) {
      countQuery += ' WHERE ' + countConditions.join(' AND ');
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      transactions: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error fetching transactions' });
  }
});

// Get single transaction by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT tr.*, t.monthly_rent, 
             u.first_name as tenant_first_name, u.last_name as tenant_last_name, u.email as tenant_email,
             p.name as property_name, p.address
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.id = $1
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
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ transaction: result.rows[0] });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ message: 'Server error fetching transaction' });
  }
});

// Create new transaction
router.post('/', authenticateToken, requireRole('owner'), validateRequest(transactionSchema), async (req, res) => {
  try {
    const { tenant_id, transaction_type, amount, due_date, description } = req.body;

    // Verify tenant belongs to owner's property
    const tenantResult = await pool.query(`
      SELECT t.id, t.property_id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [tenant_id, req.user.id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const property_id = tenantResult.rows[0].property_id;

    const result = await pool.query(`
      INSERT INTO transactions (tenant_id, property_id, transaction_type, amount, due_date, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenant_id, property_id, transaction_type, amount, due_date, description]);

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ message: 'Server error creating transaction' });
  }
});

// Update transaction
router.put('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, due_date, description, payment_method } = req.body;

    // Verify transaction belongs to owner's property
    const checkResult = await pool.query(`
      SELECT tr.id FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const result = await pool.query(`
      UPDATE transactions SET
        amount = $1, due_date = $2, description = $3, payment_method = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [amount, due_date, description, payment_method, id]);

    res.json({
      message: 'Transaction updated successfully',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ message: 'Server error updating transaction' });
  }
});

// Mark transaction as paid
router.patch('/:id/mark-paid', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;
    const { paid_date, payment_method } = req.body;

    // Verify transaction belongs to owner's property
    const checkResult = await pool.query(`
      SELECT tr.id FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const result = await pool.query(`
      UPDATE transactions SET
        is_paid = true, 
        paid_date = $1, 
        payment_method = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [paid_date || new Date(), payment_method, id]);

    res.json({
      message: 'Transaction marked as paid',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Mark transaction paid error:', error);
    res.status(500).json({ message: 'Server error marking transaction as paid' });
  }
});

// Mark transaction as unpaid
router.patch('/:id/mark-unpaid', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify transaction belongs to owner's property
    const checkResult = await pool.query(`
      SELECT tr.id FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const result = await pool.query(`
      UPDATE transactions SET
        is_paid = false, 
        paid_date = NULL, 
        payment_method = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    res.json({
      message: 'Transaction marked as unpaid',
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error('Mark transaction unpaid error:', error);
    res.status(500).json({ message: 'Server error marking transaction as unpaid' });
  }
});

// Delete transaction
router.delete('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify transaction belongs to owner's property
    const checkResult = await pool.query(`
      SELECT tr.id FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await pool.query('DELETE FROM transactions WHERE id = $1', [id]);

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ message: 'Server error deleting transaction' });
  }
});

// Get transaction summary/statistics
router.get('/summary/stats', authenticateToken, async (req, res) => {
  try {
    const { property_id, tenant_id, year = new Date().getFullYear() } = req.query;

    let baseCondition = '';
    const params = [];
    
    if (req.user.role === 'owner') {
      baseCondition = 'p.owner_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      baseCondition = 't.user_id = $1';
      params.push(req.user.id);
    }

    if (property_id) {
      baseCondition += ` AND tr.property_id = $${params.length + 1}`;
      params.push(property_id);
    }

    if (tenant_id) {
      baseCondition += ` AND tr.tenant_id = $${params.length + 1}`;
      params.push(tenant_id);
    }

    // Get monthly breakdown
    const monthlyStatsResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', tr.due_date) as month,
        tr.transaction_type,
        COUNT(*) as transaction_count,
        SUM(tr.amount) as total_amount,
        SUM(CASE WHEN tr.is_paid THEN tr.amount ELSE 0 END) as paid_amount,
        SUM(CASE WHEN NOT tr.is_paid THEN tr.amount ELSE 0 END) as unpaid_amount
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE ${baseCondition} AND EXTRACT(YEAR FROM tr.due_date) = $${params.length + 1}
      GROUP BY DATE_TRUNC('month', tr.due_date), tr.transaction_type
      ORDER BY month, tr.transaction_type
    `, [...params, year]);

    // Get overall summary
    const summaryResult = await pool.query(`
      SELECT 
        tr.transaction_type,
        COUNT(*) as total_transactions,
        SUM(tr.amount) as total_amount,
        SUM(CASE WHEN tr.is_paid THEN tr.amount ELSE 0 END) as paid_amount,
        SUM(CASE WHEN NOT tr.is_paid THEN tr.amount ELSE 0 END) as unpaid_amount,
        COUNT(CASE WHEN tr.is_paid THEN 1 END) as paid_count,
        COUNT(CASE WHEN NOT tr.is_paid THEN 1 END) as unpaid_count
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE ${baseCondition} AND EXTRACT(YEAR FROM tr.due_date) = $${params.length + 1}
      GROUP BY tr.transaction_type
    `, [...params, year]);

    res.json({
      year: parseInt(year),
      monthlyStats: monthlyStatsResult.rows,
      summary: summaryResult.rows
    });
  } catch (error) {
    console.error('Get transaction summary error:', error);
    res.status(500).json({ message: 'Server error fetching transaction summary' });
  }
});

// Get overdue transactions
router.get('/overdue/list', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT tr.*, t.monthly_rent, 
             u.first_name as tenant_first_name, u.last_name as tenant_last_name, u.email as tenant_email,
             p.name as property_name, p.address,
             (CURRENT_DATE - tr.due_date) as days_overdue
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON tr.property_id = p.id
      WHERE tr.is_paid = false AND tr.due_date < CURRENT_DATE
    `;
    
    const params = [];
    
    if (req.user.role === 'owner') {
      query += ` AND p.owner_id = $1`;
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      query += ` AND t.user_id = $1`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY tr.due_date ASC`;

    const result = await pool.query(query, params);

    res.json({ overdueTransactions: result.rows });
  } catch (error) {
    console.error('Get overdue transactions error:', error);
    res.status(500).json({ message: 'Server error fetching overdue transactions' });
  }
});

module.exports = router;