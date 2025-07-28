const express = require('express');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Get monthly report
router.get('/monthly', requireOwner, async (req, res) => {
  try {
    const { year, month, propertyId } = req.query;
    
    const startDate = moment(`${year}-${month}-01`).format('YYYY-MM-DD');
    const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');

    let query = `
      SELECT 
        -- Income
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_income,
        COUNT(CASE WHEN p.status = 'paid' THEN 1 END) as paid_payments,
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN p.status = 'overdue' THEN 1 END) as overdue_payments,
        
        -- Expenses
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COUNT(e.id) as total_expense_count,
        
        -- Net Income
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income,
        
        -- Property details
        COUNT(DISTINCT prop.id) as total_properties,
        COUNT(DISTINCT t.id) as total_tenants
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id 
        AND p.due_date >= $1 AND p.due_date <= $2
      LEFT JOIN expenses e ON prop.id = e.property_id 
        AND e.expense_date >= $1 AND e.expense_date <= $2
      LEFT JOIN leases l ON prop.id = l.property_id AND l.status = 'active'
      LEFT JOIN tenants t ON l.tenant_id = t.id
      WHERE prop.owner_id = $3
    `;
    
    const params = [startDate, endDate, req.user.id];
    let paramCount = 3;

    if (propertyId) {
      paramCount++;
      query += ` AND prop.id = $${paramCount}`;
      params.push(propertyId);
    }

    const result = await pool.query(query, params);
    const summary = result.rows[0];

    // Get income breakdown by payment type
    const incomeBreakdownQuery = `
      SELECT 
        payment_type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments p
      JOIN properties prop ON p.property_id = prop.id
      WHERE prop.owner_id = $1 
        AND p.due_date >= $2 
        AND p.due_date <= $3
        AND p.status = 'paid'
      GROUP BY payment_type
      ORDER BY total_amount DESC
    `;
    
    const incomeBreakdown = await pool.query(incomeBreakdownQuery, [req.user.id, startDate, endDate]);

    // Get expense breakdown by category
    const expenseBreakdownQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses e
      JOIN properties prop ON e.property_id = prop.id
      WHERE prop.owner_id = $1 
        AND e.expense_date >= $2 
        AND e.expense_date <= $3
      GROUP BY category
      ORDER BY total_amount DESC
    `;
    
    const expenseBreakdown = await pool.query(expenseBreakdownQuery, [req.user.id, startDate, endDate]);

    res.json({
      period: { startDate, endDate, year, month },
      summary,
      incomeBreakdown: incomeBreakdown.rows,
      expenseBreakdown: expenseBreakdown.rows
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({ error: 'Failed to get monthly report' });
  }
});

// Get yearly report
router.get('/yearly', requireOwner, async (req, res) => {
  try {
    const { year, propertyId } = req.query;
    
    const startDate = moment(`${year}-01-01`).format('YYYY-MM-DD');
    const endDate = moment(`${year}-12-31`).format('YYYY-MM-DD');

    let query = `
      SELECT 
        -- Income
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_income,
        COUNT(CASE WHEN p.status = 'paid' THEN 1 END) as paid_payments,
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN p.status = 'overdue' THEN 1 END) as overdue_payments,
        
        -- Expenses
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COUNT(e.id) as total_expense_count,
        
        -- Net Income
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income,
        
        -- Property details
        COUNT(DISTINCT prop.id) as total_properties,
        COUNT(DISTINCT t.id) as total_tenants
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id 
        AND p.due_date >= $1 AND p.due_date <= $2
      LEFT JOIN expenses e ON prop.id = e.property_id 
        AND e.expense_date >= $1 AND e.expense_date <= $2
      LEFT JOIN leases l ON prop.id = l.property_id AND l.status = 'active'
      LEFT JOIN tenants t ON l.tenant_id = t.id
      WHERE prop.owner_id = $3
    `;
    
    const params = [startDate, endDate, req.user.id];
    let paramCount = 3;

    if (propertyId) {
      paramCount++;
      query += ` AND prop.id = $${paramCount}`;
      params.push(propertyId);
    }

    const result = await pool.query(query, params);
    const summary = result.rows[0];

    // Get monthly breakdown
    const monthlyBreakdownQuery = `
      SELECT 
        EXTRACT(MONTH FROM p.due_date) as month,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as income,
        COALESCE(SUM(e.amount), 0) as expenses,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id 
        AND p.due_date >= $1 AND p.due_date <= $2
      LEFT JOIN expenses e ON prop.id = e.property_id 
        AND e.expense_date >= $1 AND e.expense_date <= $2
      WHERE prop.owner_id = $3
      GROUP BY EXTRACT(MONTH FROM p.due_date)
      ORDER BY month
    `;
    
    const monthlyBreakdown = await pool.query(monthlyBreakdownQuery, [startDate, endDate, req.user.id]);

    // Get income breakdown by payment type
    const incomeBreakdownQuery = `
      SELECT 
        payment_type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments p
      JOIN properties prop ON p.property_id = prop.id
      WHERE prop.owner_id = $1 
        AND p.due_date >= $2 
        AND p.due_date <= $3
        AND p.status = 'paid'
      GROUP BY payment_type
      ORDER BY total_amount DESC
    `;
    
    const incomeBreakdown = await pool.query(incomeBreakdownQuery, [req.user.id, startDate, endDate]);

    // Get expense breakdown by category
    const expenseBreakdownQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses e
      JOIN properties prop ON e.property_id = prop.id
      WHERE prop.owner_id = $1 
        AND e.expense_date >= $2 
        AND e.expense_date <= $3
      GROUP BY category
      ORDER BY total_amount DESC
    `;
    
    const expenseBreakdown = await pool.query(expenseBreakdownQuery, [req.user.id, startDate, endDate]);

    res.json({
      period: { startDate, endDate, year },
      summary,
      monthlyBreakdown: monthlyBreakdown.rows,
      incomeBreakdown: incomeBreakdown.rows,
      expenseBreakdown: expenseBreakdown.rows
    });
  } catch (error) {
    console.error('Get yearly report error:', error);
    res.status(500).json({ error: 'Failed to get yearly report' });
  }
});

// Get ROI report
router.get('/roi', requireOwner, async (req, res) => {
  try {
    const { propertyId, startDate, endDate } = req.query;
    
    let query = `
      SELECT 
        prop.id,
        prop.name,
        prop.purchase_price,
        prop.purchase_date,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income,
        CASE 
          WHEN prop.purchase_price > 0 THEN 
            ((COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0)) / prop.purchase_price) * 100
          ELSE 0 
        END as roi_percentage
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id
      LEFT JOIN expenses e ON prop.id = e.property_id
      WHERE prop.owner_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (propertyId) {
      paramCount++;
      query += ` AND prop.id = $${paramCount}`;
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

    query += ` GROUP BY prop.id, prop.name, prop.purchase_price, prop.purchase_date ORDER BY roi_percentage DESC`;

    const result = await pool.query(query, params);

    // Calculate overall ROI
    const overallStats = result.rows.reduce((acc, property) => {
      acc.totalPurchasePrice += parseFloat(property.purchase_price) || 0;
      acc.totalIncome += parseFloat(property.total_income) || 0;
      acc.totalExpenses += parseFloat(property.total_expenses) || 0;
      acc.totalNetIncome += parseFloat(property.net_income) || 0;
      return acc;
    }, {
      totalPurchasePrice: 0,
      totalIncome: 0,
      totalExpenses: 0,
      totalNetIncome: 0
    });

    const overallROI = overallStats.totalPurchasePrice > 0 
      ? (overallStats.totalNetIncome / overallStats.totalPurchasePrice) * 100 
      : 0;

    res.json({
      properties: result.rows,
      overallStats: {
        ...overallStats,
        overallROI: Math.round(overallROI * 100) / 100
      }
    });
  } catch (error) {
    console.error('Get ROI report error:', error);
    res.status(500).json({ error: 'Failed to get ROI report' });
  }
});

// Get income/expense report
router.get('/income-expense', requireOwner, async (req, res) => {
  try {
    const { propertyId, tenantId, startDate, endDate, groupBy = 'month' } = req.query;
    
    let dateFormat;
    let groupClause;
    
    if (groupBy === 'month') {
      dateFormat = 'YYYY-MM';
      groupClause = 'EXTRACT(YEAR FROM p.due_date) || \'-\' || LPAD(EXTRACT(MONTH FROM p.due_date)::text, 2, \'0\')';
    } else if (groupBy === 'quarter') {
      dateFormat = 'YYYY-Q';
      groupClause = 'EXTRACT(YEAR FROM p.due_date) || \'-\' || \'Q\' || EXTRACT(QUARTER FROM p.due_date)';
    } else {
      dateFormat = 'YYYY';
      groupClause = 'EXTRACT(YEAR FROM p.due_date)';
    }

    let query = `
      SELECT 
        ${groupClause} as period,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as income,
        COALESCE(SUM(e.amount), 0) as expenses,
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id
      LEFT JOIN expenses e ON prop.id = e.property_id
      WHERE prop.owner_id = $1
    `;
    
    const params = [req.user.id];
    let paramCount = 1;

    if (propertyId) {
      paramCount++;
      query += ` AND prop.id = $${paramCount}`;
      params.push(propertyId);
    }

    if (tenantId) {
      paramCount++;
      query += ` AND p.tenant_id = $${paramCount}`;
      params.push(tenantId);
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

    query += ` GROUP BY ${groupClause} ORDER BY period`;

    const result = await pool.query(query, params);

    res.json({
      groupBy,
      data: result.rows
    });
  } catch (error) {
    console.error('Get income/expense report error:', error);
    res.status(500).json({ error: 'Failed to get income/expense report' });
  }
});

// Get dashboard summary
router.get('/dashboard', requireOwner, async (req, res) => {
  try {
    const currentMonth = moment().format('YYYY-MM');
    const currentYear = moment().format('YYYY');
    
    // Current month stats
    const monthStart = moment().startOf('month').format('YYYY-MM-DD');
    const monthEnd = moment().endOf('month').format('YYYY-MM-DD');
    
    const monthStatsQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as month_income,
        COALESCE(SUM(e.amount), 0) as month_expenses,
        COUNT(CASE WHEN p.status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN p.status = 'overdue' THEN 1 END) as overdue_payments
      FROM properties prop
      LEFT JOIN payments p ON prop.id = p.property_id 
        AND p.due_date >= $1 AND p.due_date <= $2
      LEFT JOIN expenses e ON prop.id = e.property_id 
        AND e.expense_date >= $1 AND e.expense_date <= $2
      WHERE prop.owner_id = $3
    `;
    
    const monthStats = await pool.query(monthStatsQuery, [monthStart, monthEnd, req.user.id]);

    // Property count
    const propertyCountQuery = `
      SELECT 
        COUNT(*) as total_properties,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_properties,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_properties
      FROM properties 
      WHERE owner_id = $1
    `;
    
    const propertyCount = await pool.query(propertyCountQuery, [req.user.id]);

    // Tenant count
    const tenantCountQuery = `
      SELECT COUNT(DISTINCT t.id) as total_tenants
      FROM tenants t
      JOIN leases l ON t.id = l.tenant_id
      JOIN properties p ON l.property_id = p.id
      WHERE p.owner_id = $1 AND l.status = 'active'
    `;
    
    const tenantCount = await pool.query(tenantCountQuery, [req.user.id]);

    // Recent activities
    const recentActivitiesQuery = `
      (SELECT 'payment' as type, p.created_at, p.amount, p.status, prop.name as property_name
       FROM payments p
       JOIN properties prop ON p.property_id = prop.id
       WHERE prop.owner_id = $1
       ORDER BY p.created_at DESC
       LIMIT 5)
      UNION ALL
      (SELECT 'expense' as type, e.created_at, e.amount, 'completed' as status, prop.name as property_name
       FROM expenses e
       JOIN properties prop ON e.property_id = prop.id
       WHERE prop.owner_id = $1
       ORDER BY e.created_at DESC
       LIMIT 5)
      ORDER BY created_at DESC
      LIMIT 10
    `;
    
    const recentActivities = await pool.query(recentActivitiesQuery, [req.user.id]);

    res.json({
      currentMonth: monthStats.rows[0],
      properties: propertyCount.rows[0],
      tenants: tenantCount.rows[0],
      recentActivities: recentActivities.rows
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

module.exports = router;