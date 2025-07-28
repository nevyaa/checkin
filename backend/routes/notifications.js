const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Get all notifications for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, is_read } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT n.*, 
             CASE WHEN n.tenant_id IS NOT NULL THEN
               (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM tenants t 
                JOIN users u ON t.user_id = u.id WHERE t.id = n.tenant_id)
             END as tenant_name
      FROM notifications n
      WHERE n.user_id = $1
    `;
    
    const params = [req.user.id];
    
    if (is_read !== undefined) {
      query += ` AND n.is_read = $${params.length + 1}`;
      params.push(is_read === 'true');
    }
    
    query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
    const countParams = [req.user.id];
    
    if (is_read !== undefined) {
      countQuery += ' AND is_read = $2';
      countParams.push(is_read === 'true');
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      notifications: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// Mark notification as read
router.patch('/:id/mark-read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE notifications 
      SET is_read = true 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      message: 'Notification marked as read',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error marking notification as read' });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    await pool.query(`
      UPDATE notifications 
      SET is_read = true 
      WHERE user_id = $1 AND is_read = false
    `, [req.user.id]);

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ message: 'Server error marking all notifications as read' });
  }
});

// Send rent due notification
router.post('/send-rent-due', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { tenant_id, due_date, amount } = req.body;

    if (!tenant_id || !due_date || !amount) {
      return res.status(400).json({ message: 'Tenant ID, due date, and amount are required' });
    }

    // Verify tenant belongs to owner
    const tenantResult = await pool.query(`
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [tenant_id, req.user.id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const emailResult = await emailService.sendRentDueNotification(tenant_id, due_date, amount);

    if (emailResult.success) {
      res.json({ 
        message: 'Rent due notification sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({ 
        message: 'Failed to send rent due notification',
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('Send rent due notification error:', error);
    res.status(500).json({ message: 'Server error sending rent due notification' });
  }
});

// Send utility due notification
router.post('/send-utility-due', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { tenant_id, utility_details } = req.body;

    if (!tenant_id || !utility_details || !Array.isArray(utility_details)) {
      return res.status(400).json({ message: 'Tenant ID and utility details array are required' });
    }

    // Verify tenant belongs to owner
    const tenantResult = await pool.query(`
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [tenant_id, req.user.id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const emailResult = await emailService.sendUtilityDueNotification(tenant_id, utility_details);

    if (emailResult.success) {
      res.json({ 
        message: 'Utility due notification sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({ 
        message: 'Failed to send utility due notification',
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('Send utility due notification error:', error);
    res.status(500).json({ message: 'Server error sending utility due notification' });
  }
});

// Send lease expiry reminder
router.post('/send-lease-expiry', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Verify tenant belongs to owner
    const tenantResult = await pool.query(`
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [tenant_id, req.user.id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const emailResult = await emailService.sendLeaseExpiryReminder(tenant_id);

    if (emailResult.success) {
      res.json({ 
        message: 'Lease expiry reminder sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({ 
        message: 'Failed to send lease expiry reminder',
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('Send lease expiry reminder error:', error);
    res.status(500).json({ message: 'Server error sending lease expiry reminder' });
  }
});

// Send welcome email to new tenant
router.post('/send-welcome', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Verify tenant belongs to owner
    const tenantResult = await pool.query(`
      SELECT t.id FROM tenants t
      JOIN properties p ON t.property_id = p.id
      WHERE t.id = $1 AND p.owner_id = $2
    `, [tenant_id, req.user.id]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const emailResult = await emailService.sendWelcomeEmail(tenant_id);

    if (emailResult.success) {
      res.json({ 
        message: 'Welcome email sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({ 
        message: 'Failed to send welcome email',
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('Send welcome email error:', error);
    res.status(500).json({ message: 'Server error sending welcome email' });
  }
});

// Get notification summary/counts
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read_count,
        COUNT(CASE WHEN notification_type = 'rent_due' THEN 1 END) as rent_due_count,
        COUNT(CASE WHEN notification_type = 'utility_due' THEN 1 END) as utility_due_count,
        COUNT(CASE WHEN notification_type = 'lease_expiry' THEN 1 END) as lease_expiry_count
      FROM notifications
      WHERE user_id = $1
    `, [req.user.id]);

    res.json({ summary: result.rows[0] });
  } catch (error) {
    console.error('Get notification summary error:', error);
    res.status(500).json({ message: 'Server error fetching notification summary' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM notifications 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error deleting notification' });
  }
});

module.exports = router;