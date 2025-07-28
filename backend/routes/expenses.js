const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateRequest, expenseSchema } = require('../middleware/validation');

const router = express.Router();

// Get all expenses
router.get('/', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      property_id, 
      category, 
      start_date, 
      end_date,
      search = ''
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = `
      SELECT e.*, p.name as property_name, p.address
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
    `;
    
    const params = [req.user.id];
    
    if (property_id) {
      query += ` AND e.property_id = $${params.length + 1}`;
      params.push(property_id);
    }
    
    if (category) {
      query += ` AND e.category = $${params.length + 1}`;
      params.push(category);
    }
    
    if (start_date) {
      query += ` AND e.expense_date >= $${params.length + 1}`;
      params.push(start_date);
    }
    
    if (end_date) {
      query += ` AND e.expense_date <= $${params.length + 1}`;
      params.push(end_date);
    }
    
    if (search) {
      query += ` AND (e.description ILIKE $${params.length + 1} OR e.vendor ILIKE $${params.length + 1} OR p.name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY e.expense_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
    `;
    const countParams = [req.user.id];
    
    if (property_id) {
      countQuery += ` AND e.property_id = $2`;
      countParams.push(property_id);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      expenses: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Server error fetching expenses' });
  }
});

// Get single expense by ID
router.get('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT e.*, p.name as property_name, p.address
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE e.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ expense: result.rows[0] });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ message: 'Server error fetching expense' });
  }
});

// Create new expense
router.post('/', authenticateToken, requireRole('owner'), validateRequest(expenseSchema), async (req, res) => {
  try {
    const { property_id, category, description, amount, expense_date, vendor, is_recurring } = req.body;

    // Verify property ownership
    const propertyResult = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
      [property_id, req.user.id]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const result = await pool.query(`
      INSERT INTO expenses (property_id, category, description, amount, expense_date, vendor, is_recurring)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [property_id, category, description, amount, expense_date, vendor, is_recurring]);

    res.status(201).json({
      message: 'Expense created successfully',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: 'Server error creating expense' });
  }
});

// Update expense
router.put('/:id', authenticateToken, requireRole('owner'), validateRequest(expenseSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { property_id, category, description, amount, expense_date, vendor, is_recurring } = req.body;

    // Verify expense belongs to owner's property
    const checkResult = await pool.query(`
      SELECT e.id FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE e.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const result = await pool.query(`
      UPDATE expenses SET
        property_id = $1, category = $2, description = $3, amount = $4,
        expense_date = $5, vendor = $6, is_recurring = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [property_id, category, description, amount, expense_date, vendor, is_recurring, id]);

    res.json({
      message: 'Expense updated successfully',
      expense: result.rows[0]
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ message: 'Server error updating expense' });
  }
});

// Delete expense
router.delete('/:id', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify expense belongs to owner's property
    const checkResult = await pool.query(`
      SELECT e.id FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE e.id = $1 AND p.owner_id = $2
    `, [id, req.user.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    await pool.query('DELETE FROM expenses WHERE id = $1', [id]);

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Server error deleting expense' });
  }
});

// Get expense categories
router.get('/categories/list', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category 
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1
      ORDER BY category
    `, [req.user.id]);

    const defaultCategories = [
      'Repairs & Maintenance',
      'Property Management',
      'Insurance',
      'Property Taxes',
      'Utilities',
      'Landscaping',
      'Legal & Professional',
      'Marketing & Advertising',
      'Office Expenses',
      'Travel',
      'Other'
    ];

    const existingCategories = result.rows.map(row => row.category);
    const allCategories = [...new Set([...defaultCategories, ...existingCategories])].sort();

    res.json({ categories: allCategories });
  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({ message: 'Server error fetching expense categories' });
  }
});

// Get expense summary
router.get('/summary/stats', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { property_id, year = new Date().getFullYear() } = req.query;

    let baseCondition = 'p.owner_id = $1';
    const params = [req.user.id];

    if (property_id) {
      baseCondition += ` AND e.property_id = $${params.length + 1}`;
      params.push(property_id);
    }

    // Get monthly breakdown
    const monthlyStatsResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', e.expense_date) as month,
        e.category,
        COUNT(*) as expense_count,
        SUM(e.amount) as total_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE ${baseCondition} AND EXTRACT(YEAR FROM e.expense_date) = $${params.length + 1}
      GROUP BY DATE_TRUNC('month', e.expense_date), e.category
      ORDER BY month, e.category
    `, [...params, year]);

    // Get category summary
    const categoryStatsResult = await pool.query(`
      SELECT 
        e.category,
        COUNT(*) as expense_count,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount,
        MIN(e.amount) as min_amount,
        MAX(e.amount) as max_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE ${baseCondition} AND EXTRACT(YEAR FROM e.expense_date) = $${params.length + 1}
      GROUP BY e.category
      ORDER BY total_amount DESC
    `, [...params, year]);

    // Get yearly total
    const yearlyTotalResult = await pool.query(`
      SELECT 
        COUNT(*) as total_expenses,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE ${baseCondition} AND EXTRACT(YEAR FROM e.expense_date) = $${params.length + 1}
    `, [...params, year]);

    res.json({
      year: parseInt(year),
      monthlyStats: monthlyStatsResult.rows,
      categoryStats: categoryStatsResult.rows,
      yearlyTotal: yearlyTotalResult.rows[0]
    });
  } catch (error) {
    console.error('Get expense summary error:', error);
    res.status(500).json({ message: 'Server error fetching expense summary' });
  }
});

module.exports = router;