const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

// Get all expenses with filtering
router.get('/', requireOwner, async (req, res) => {
  try {
    const { 
      propertyId, category, startDate, endDate, 
      page = 1, limit = 20 
    } = req.query;

    let query = `
      SELECT e.*, p.name as property_name, p.address as property_address
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
    `;
    const params = [req.user.id];
    let paramCount = 1;

    // Add filters
    if (propertyId) {
      paramCount++;
      query += ` AND e.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    if (category) {
      paramCount++;
      query += ` AND e.category = $${paramCount}`;
      params.push(category);
    }

    if (startDate) {
      paramCount++;
      query += ` AND e.expense_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND e.expense_date <= $${paramCount}`;
      params.push(endDate);
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination and ordering
    query += ` ORDER BY e.expense_date DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({
      expenses: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to get expenses' });
  }
});

// Get single expense by ID
router.get('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.*, p.name as property_name, p.address as property_address
       FROM expenses e
       JOIN properties p ON e.property_id = p.id
       WHERE e.id = $1 AND p.owner_id = $2`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ expense: result.rows[0] });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Failed to get expense' });
  }
});

// Create new expense
router.post('/', requireOwner, [
  body('propertyId').isInt({ min: 1 }),
  body('category').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('amount').isFloat({ min: 0 }),
  body('expenseDate').isISO8601(),
  body('receiptUrl').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      propertyId, category, description, amount, 
      expenseDate, receiptUrl
    } = req.body;

    // Check if property belongs to owner
    const propertyCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [propertyId, req.user.id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const result = await pool.query(
      `INSERT INTO expenses (
        property_id, category, description, amount, 
        expense_date, receipt_url
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [propertyId, category, description, amount, expenseDate, receiptUrl]
    );

    res.status(201).json({
      message: 'Expense created successfully',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', requireOwner, [
  body('category').optional().notEmpty().trim(),
  body('description').optional().notEmpty().trim(),
  body('amount').optional().isFloat({ min: 0 }),
  body('expenseDate').optional().isISO8601(),
  body('receiptUrl').optional().isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateFields = req.body;

    // Check if expense belongs to owner's property
    const expenseCheck = await pool.query(
      `SELECT e.* FROM expenses e
       JOIN properties p ON e.property_id = p.id
       WHERE e.id = $1 AND p.owner_id = $2`,
      [id, req.user.id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Build dynamic update query
    const setFields = [];
    const values = [];
    let paramCount = 1;

    const fieldMappings = {
      category: 'category',
      description: 'description',
      amount: 'amount',
      expenseDate: 'expense_date',
      receiptUrl: 'receipt_url'
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
      UPDATE expenses 
      SET ${setFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Expense updated successfully',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense belongs to owner's property
    const expenseCheck = await pool.query(
      `SELECT e.* FROM expenses e
       JOIN properties p ON e.property_id = p.id
       WHERE e.id = $1 AND p.owner_id = $2`,
      [id, req.user.id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await pool.query('DELETE FROM expenses WHERE id = $1', [id]);

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Get expense categories
router.get('/categories/list', requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, COUNT(*) as count
       FROM expenses e
       JOIN properties p ON e.property_id = p.id
       WHERE p.owner_id = $1
       GROUP BY category
       ORDER BY count DESC`,
      [req.user.id]
    );

    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({ error: 'Failed to get expense categories' });
  }
});

// Get expense statistics
router.get('/stats/summary', requireOwner, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    let query = `
      SELECT 
        COUNT(*) as total_expenses,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(AVG(amount), 0) as average_amount,
        MIN(expense_date) as first_expense_date,
        MAX(expense_date) as last_expense_date
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
    `;
    const params = [req.user.id];
    let paramCount = 1;

    // Add date filters
    if (startDate) {
      paramCount++;
      query += ` AND e.expense_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND e.expense_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (propertyId) {
      paramCount++;
      query += ` AND e.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    const result = await pool.query(query, params);
    res.json({ stats: result.rows[0] });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({ error: 'Failed to get expense statistics' });
  }
});

// Get expenses by category
router.get('/stats/by-category', requireOwner, async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    let query = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(AVG(amount), 0) as average_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
    `;
    const params = [req.user.id];
    let paramCount = 1;

    // Add date filters
    if (startDate) {
      paramCount++;
      query += ` AND e.expense_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND e.expense_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (propertyId) {
      paramCount++;
      query += ` AND e.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    query += ` GROUP BY category ORDER BY total_amount DESC`;

    const result = await pool.query(query, params);
    res.json({ categoryStats: result.rows });
  } catch (error) {
    console.error('Get expense category stats error:', error);
    res.status(500).json({ error: 'Failed to get expense category statistics' });
  }
});

module.exports = router;