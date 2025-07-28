const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Get dashboard overview
router.get('/dashboard', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    // Get total properties
    const propertiesResult = await pool.query(
      'SELECT COUNT(*) as total_properties FROM properties WHERE owner_id = $1 AND is_active = true',
      [req.user.id]
    );

    // Get total active tenants
    const tenantsResult = await pool.query(`
      SELECT COUNT(*) as total_tenants FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE p.owner_id = $1 AND t.is_active = true
    `, [req.user.id]);

    // Get current month income
    const currentMonthIncomeResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as current_month_income FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE p.owner_id = $1 AND tr.is_paid = true 
        AND DATE_TRUNC('month', tr.paid_date) = DATE_TRUNC('month', CURRENT_DATE)
        AND tr.transaction_type = 'rent'
    `, [req.user.id]);

    // Get current month expenses
    const currentMonthExpensesResult = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as current_month_expenses FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1 
        AND DATE_TRUNC('month', e.expense_date) = DATE_TRUNC('month', CURRENT_DATE)
    `, [req.user.id]);

    // Get overdue payments
    const overdueResult = await pool.query(`
      SELECT COUNT(*) as overdue_count, COALESCE(SUM(amount), 0) as overdue_amount 
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE p.owner_id = $1 AND tr.is_paid = false AND tr.due_date < CURRENT_DATE
    `, [req.user.id]);

    // Get upcoming lease expirations (next 3 months)
    const upcomingLeasesResult = await pool.query(`
      SELECT COUNT(*) as expiring_leases FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE p.owner_id = $1 AND t.is_active = true
        AND t.lease_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 months'
    `, [req.user.id]);

    // Get monthly income trend (last 12 months)
    const monthlyIncomeResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', tr.paid_date) as month,
        SUM(tr.amount) as income
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE p.owner_id = $1 AND tr.is_paid = true AND tr.transaction_type = 'rent'
        AND tr.paid_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
      GROUP BY DATE_TRUNC('month', tr.paid_date)
      ORDER BY month
    `, [req.user.id]);

    // Get recent transactions
    const recentTransactionsResult = await pool.query(`
      SELECT tr.*, u.first_name, u.last_name, p.name as property_name
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON tr.property_id = p.id
      WHERE p.owner_id = $1
      ORDER BY tr.created_at DESC
      LIMIT 5
    `, [req.user.id]);

    res.json({
      summary: {
        totalProperties: parseInt(propertiesResult.rows[0].total_properties),
        totalTenants: parseInt(tenantsResult.rows[0].total_tenants),
        currentMonthIncome: parseFloat(currentMonthIncomeResult.rows[0].current_month_income),
        currentMonthExpenses: parseFloat(currentMonthExpensesResult.rows[0].current_month_expenses),
        netIncome: parseFloat(currentMonthIncomeResult.rows[0].current_month_income) - parseFloat(currentMonthExpensesResult.rows[0].current_month_expenses),
        overdueCount: parseInt(overdueResult.rows[0].overdue_count),
        overdueAmount: parseFloat(overdueResult.rows[0].overdue_amount),
        expiringLeases: parseInt(upcomingLeasesResult.rows[0].expiring_leases)
      },
      monthlyIncome: monthlyIncomeResult.rows,
      recentTransactions: recentTransactionsResult.rows
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'Server error fetching dashboard data' });
  }
});

// Get income/expense report
router.get('/income-expense', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { property_id, start_date, end_date, period = 'monthly' } = req.query;

    let baseCondition = '';
    const params = [req.user.id];

    if (property_id) {
      baseCondition += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }

    const dateConditions = [];
    if (start_date) {
      dateConditions.push(`>= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      dateConditions.push(`<= $${params.length + 1}`);
      params.push(end_date);
    }

    const dateTrunc = period === 'yearly' ? 'year' : 'month';

    // Get income data
    let incomeQuery = `
      SELECT 
        DATE_TRUNC('${dateTrunc}', tr.paid_date) as period,
        tr.transaction_type,
        SUM(tr.amount) as total_amount,
        COUNT(*) as transaction_count
      FROM transactions tr
      JOIN tenants t ON tr.tenant_id = t.id
      JOIN properties p ON tr.property_id = p.id
      WHERE p.owner_id = $1 AND tr.is_paid = true ${baseCondition}
    `;

    if (dateConditions.length > 0) {
      incomeQuery += ` AND tr.paid_date ${dateConditions.join(' AND tr.paid_date ')}`;
    }

    incomeQuery += ` GROUP BY DATE_TRUNC('${dateTrunc}', tr.paid_date), tr.transaction_type ORDER BY period`;

    // Get expense data
    let expenseQuery = `
      SELECT 
        DATE_TRUNC('${dateTrunc}', e.expense_date) as period,
        e.category,
        SUM(e.amount) as total_amount,
        COUNT(*) as expense_count
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE p.owner_id = $1 ${baseCondition}
    `;

    if (dateConditions.length > 0) {
      expenseQuery += ` AND e.expense_date ${dateConditions.join(' AND e.expense_date ')}`;
    }

    expenseQuery += ` GROUP BY DATE_TRUNC('${dateTrunc}', e.expense_date), e.category ORDER BY period`;

    const [incomeResult, expenseResult] = await Promise.all([
      pool.query(incomeQuery, params),
      pool.query(expenseQuery, params)
    ]);

    // Calculate net income by period
    const netIncomeMap = new Map();
    
    incomeResult.rows.forEach(row => {
      const periodKey = row.period?.toISOString();
      if (!netIncomeMap.has(periodKey)) {
        netIncomeMap.set(periodKey, { period: row.period, income: 0, expenses: 0 });
      }
      netIncomeMap.get(periodKey).income += parseFloat(row.total_amount);
    });

    expenseResult.rows.forEach(row => {
      const periodKey = row.period?.toISOString();
      if (!netIncomeMap.has(periodKey)) {
        netIncomeMap.set(periodKey, { period: row.period, income: 0, expenses: 0 });
      }
      netIncomeMap.get(periodKey).expenses += parseFloat(row.total_amount);
    });

    const netIncome = Array.from(netIncomeMap.values()).map(item => ({
      period: item.period,
      income: item.income,
      expenses: item.expenses,
      netIncome: item.income - item.expenses
    })).sort((a, b) => new Date(a.period) - new Date(b.period));

    res.json({
      period,
      income: incomeResult.rows,
      expenses: expenseResult.rows,
      netIncome
    });
  } catch (error) {
    console.error('Get income-expense report error:', error);
    res.status(500).json({ message: 'Server error generating income-expense report' });
  }
});

// Get ROI analysis
router.get('/roi-analysis', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { property_id } = req.query;

    let query = `
      SELECT 
        p.id,
        p.name,
        p.address,
        p.purchase_price,
        p.purchase_date,
        COALESCE(SUM(CASE WHEN tr.is_paid = true AND tr.transaction_type = 'rent' THEN tr.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN tr.is_paid = true AND tr.transaction_type = 'rent' THEN tr.amount ELSE 0 END), 0) - COALESCE(SUM(e.amount), 0) as net_income,
        COUNT(DISTINCT t.id) as tenant_count
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      LEFT JOIN transactions tr ON t.id = tr.tenant_id
      LEFT JOIN expenses e ON p.id = e.property_id
      WHERE p.owner_id = $1 AND p.is_active = true
    `;

    const params = [req.user.id];

    if (property_id) {
      query += ` AND p.id = $${params.length + 1}`;
      params.push(property_id);
    }

    query += ` GROUP BY p.id, p.name, p.address, p.purchase_price, p.purchase_date ORDER BY p.name`;

    const result = await pool.query(query, params);

    const roiAnalysis = result.rows.map(property => {
      const purchasePrice = parseFloat(property.purchase_price) || 0;
      const totalIncome = parseFloat(property.total_income) || 0;
      const totalExpenses = parseFloat(property.total_expenses) || 0;
      const netIncome = totalIncome - totalExpenses;
      
      // Calculate ownership period
      const purchaseDate = property.purchase_date ? moment(property.purchase_date) : moment();
      const ownershipYears = moment().diff(purchaseDate, 'years', true);
      
      // Calculate annualized returns
      const annualizedIncome = ownershipYears > 0 ? totalIncome / ownershipYears : totalIncome;
      const annualizedExpenses = ownershipYears > 0 ? totalExpenses / ownershipYears : totalExpenses;
      const annualizedNetIncome = annualizedIncome - annualizedExpenses;
      
      // Calculate ROI
      const roi = purchasePrice > 0 ? (netIncome / purchasePrice) * 100 : 0;
      const annualizedROI = purchasePrice > 0 ? (annualizedNetIncome / purchasePrice) * 100 : 0;
      
      // Calculate cash flow
      const monthlyCashFlow = annualizedNetIncome / 12;

      return {
        ...property,
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_income: netIncome,
        ownership_years: ownershipYears,
        annualized_income: annualizedIncome,
        annualized_expenses: annualizedExpenses,
        annualized_net_income: annualizedNetIncome,
        roi_percentage: roi,
        annualized_roi_percentage: annualizedROI,
        monthly_cash_flow: monthlyCashFlow
      };
    });

    res.json({ properties: roiAnalysis });
  } catch (error) {
    console.error('Get ROI analysis error:', error);
    res.status(500).json({ message: 'Server error generating ROI analysis' });
  }
});

// Get vacancy report
router.get('/vacancy', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    const result = await pool.query(`
      WITH property_months AS (
        SELECT 
          p.id as property_id,
          p.name as property_name,
          generate_series(
            DATE_TRUNC('year', $2::date),
            DATE_TRUNC('year', $2::date) + INTERVAL '11 months',
            INTERVAL '1 month'
          ) as month
        FROM properties p
        WHERE p.owner_id = $1 AND p.is_active = true
      ),
      occupancy_data AS (
        SELECT 
          pm.property_id,
          pm.property_name,
          pm.month,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM tenants t 
              WHERE t.property_id = pm.property_id 
                AND t.is_active = true
                AND t.lease_start_date <= pm.month + INTERVAL '1 month' - INTERVAL '1 day'
                AND t.lease_end_date >= pm.month
            ) THEN 1 ELSE 0
          END as is_occupied
        FROM property_months pm
      )
      SELECT 
        property_id,
        property_name,
        COUNT(*) as total_months,
        SUM(is_occupied) as occupied_months,
        COUNT(*) - SUM(is_occupied) as vacant_months,
        ROUND((SUM(is_occupied)::decimal / COUNT(*)) * 100, 2) as occupancy_rate,
        ROUND(((COUNT(*) - SUM(is_occupied))::decimal / COUNT(*)) * 100, 2) as vacancy_rate
      FROM occupancy_data
      GROUP BY property_id, property_name
      ORDER BY property_name
    `, [req.user.id, `${year}-01-01`]);

    res.json({
      year: parseInt(year),
      vacancyReport: result.rows
    });
  } catch (error) {
    console.error('Get vacancy report error:', error);
    res.status(500).json({ message: 'Server error generating vacancy report' });
  }
});

// Get tenant report
router.get('/tenant-analysis', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.id,
        u.first_name,
        u.last_name,
        u.email,
        p.name as property_name,
        t.lease_start_date,
        t.lease_end_date,
        t.monthly_rent,
        EXTRACT(DAYS FROM (t.lease_end_date - t.lease_start_date)) as lease_duration_days,
        EXTRACT(DAYS FROM (CURRENT_DATE - t.lease_start_date)) as days_as_tenant,
        CASE 
          WHEN t.lease_end_date < CURRENT_DATE THEN 'Expired'
          WHEN t.lease_end_date <= CURRENT_DATE + INTERVAL '3 months' THEN 'Expiring Soon'
          ELSE 'Active'
        END as lease_status,
        COALESCE(SUM(CASE WHEN tr.is_paid = true THEN tr.amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN tr.is_paid = false THEN tr.amount ELSE 0 END), 0) as total_outstanding,
        COUNT(CASE WHEN tr.is_paid = false AND tr.due_date < CURRENT_DATE THEN 1 END) as overdue_payments
      FROM tenants t
      JOIN users u ON t.user_id = u.id
      JOIN properties p ON t.property_id = p.id
      LEFT JOIN transactions tr ON t.id = tr.tenant_id
      WHERE p.owner_id = $1
      GROUP BY t.id, u.first_name, u.last_name, u.email, p.name, t.lease_start_date, t.lease_end_date, t.monthly_rent
      ORDER BY t.lease_end_date
    `, [req.user.id]);

    res.json({ tenantAnalysis: result.rows });
  } catch (error) {
    console.error('Get tenant analysis error:', error);
    res.status(500).json({ message: 'Server error generating tenant analysis' });
  }
});

// Get maintenance report
router.get('/maintenance', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { property_id, start_date, end_date } = req.query;

    let baseCondition = 'p.owner_id = $1';
    const params = [req.user.id];

    if (property_id) {
      baseCondition += ` AND e.property_id = $${params.length + 1}`;
      params.push(property_id);
    }

    let dateCondition = '';
    if (start_date) {
      dateCondition += ` AND e.expense_date >= $${params.length + 1}`;
      params.push(start_date);
    }
    if (end_date) {
      dateCondition += ` AND e.expense_date <= $${params.length + 1}`;
      params.push(end_date);
    }

    const result = await pool.query(`
      SELECT 
        e.*,
        p.name as property_name,
        p.address
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE ${baseCondition} 
        AND e.category IN ('Repairs & Maintenance', 'Utilities', 'Landscaping')
        ${dateCondition}
      ORDER BY e.expense_date DESC
    `, params);

    // Get summary by category
    const summaryResult = await pool.query(`
      SELECT 
        e.category,
        COUNT(*) as expense_count,
        SUM(e.amount) as total_amount,
        AVG(e.amount) as avg_amount
      FROM expenses e
      JOIN properties p ON e.property_id = p.id
      WHERE ${baseCondition} 
        AND e.category IN ('Repairs & Maintenance', 'Utilities', 'Landscaping')
        ${dateCondition}
      GROUP BY e.category
      ORDER BY total_amount DESC
    `, params);

    res.json({
      maintenanceExpenses: result.rows,
      summary: summaryResult.rows
    });
  } catch (error) {
    console.error('Get maintenance report error:', error);
    res.status(500).json({ message: 'Server error generating maintenance report' });
  }
});

module.exports = router;