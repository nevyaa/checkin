const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const moment = require('moment');

const router = express.Router();

// Configure email transporter
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Get all notifications
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    
    let query;
    let params = [];
    let paramCount = 0;

    if (req.user.role === 'owner') {
      query = `
        SELECT n.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               t.email as tenant_email
        FROM notifications n
        LEFT JOIN tenants t ON n.tenant_id = t.id
        WHERE n.user_id = $1
      `;
      params.push(req.user.id);
      paramCount = 1;
    } else {
      query = `
        SELECT n.*
        FROM notifications n
        WHERE n.user_id = $1
      `;
      params.push(req.user.id);
      paramCount = 1;
    }

    if (isRead !== undefined) {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      params.push(isRead === 'true');
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination and ordering
    query += ` ORDER BY n.sent_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({
      notifications: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Get unread notifications count
router.get('/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      message: 'Notification marked as read',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Send rent reminder email (owners only)
router.post('/send-rent-reminder', requireOwner, [
  body('tenantId').isInt({ min: 1 }),
  body('paymentId').isInt({ min: 1 }),
  body('message').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId, paymentId, message = '' } = req.body;

    // Get payment and tenant details
    const paymentQuery = `
      SELECT p.*, t.first_name, t.last_name, t.email, prop.name as property_name
      FROM payments p
      JOIN tenants t ON p.tenant_id = t.id
      JOIN properties prop ON p.property_id = prop.id
      WHERE p.id = $1 AND prop.owner_id = $2
    `;
    
    const paymentResult = await pool.query(paymentQuery, [paymentId, req.user.id]);
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.tenant_id !== parseInt(tenantId)) {
      return res.status(400).json({ error: 'Payment does not belong to specified tenant' });
    }

    // Create email content
    const emailSubject = `Rent Reminder - ${payment.property_name}`;
    const emailBody = `
      Dear ${payment.first_name} ${payment.last_name},

      This is a friendly reminder that your rent payment of $${payment.amount} for ${payment.property_name} is due on ${moment(payment.due_date).format('MMMM Do, YYYY')}.

      Payment Details:
      - Amount Due: $${payment.amount}
      - Due Date: ${moment(payment.due_date).format('MMMM Do, YYYY')}
      - Property: ${payment.property_name}
      - Payment Type: ${payment.payment_type}

      ${message ? `\nAdditional Message: ${message}\n` : ''}

      Please ensure your payment is made on time to avoid any late fees.

      Thank you for your prompt attention to this matter.

      Best regards,
      Property Management Team
    `;

    // Send email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: payment.email,
          subject: emailSubject,
          text: emailBody
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue with notification creation even if email fails
      }
    }

    // Create notification record
    const notificationResult = await pool.query(
      `INSERT INTO notifications (
        user_id, tenant_id, type, title, message
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        req.user.id, tenantId, 'rent_reminder', 
        emailSubject, emailBody
      ]
    );

    res.json({
      message: 'Rent reminder sent successfully',
      notification: notificationResult.rows[0]
    });
  } catch (error) {
    console.error('Send rent reminder error:', error);
    res.status(500).json({ error: 'Failed to send rent reminder' });
  }
});

// Send utility payment reminder (owners only)
router.post('/send-utility-reminder', requireOwner, [
  body('tenantId').isInt({ min: 1 }),
  body('paymentId').isInt({ min: 1 }),
  body('message').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId, paymentId, message = '' } = req.body;

    // Get payment and tenant details
    const paymentQuery = `
      SELECT p.*, t.first_name, t.last_name, t.email, prop.name as property_name
      FROM payments p
      JOIN tenants t ON p.tenant_id = t.id
      JOIN properties prop ON p.property_id = prop.id
      WHERE p.id = $1 AND prop.owner_id = $2
    `;
    
    const paymentResult = await pool.query(paymentQuery, [paymentId, req.user.id]);
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    if (payment.tenant_id !== parseInt(tenantId)) {
      return res.status(400).json({ error: 'Payment does not belong to specified tenant' });
    }

    // Create email content
    const emailSubject = `Utility Payment Reminder - ${payment.property_name}`;
    const emailBody = `
      Dear ${payment.first_name} ${payment.last_name},

      This is a reminder that your utility payment of $${payment.amount} for ${payment.property_name} is due on ${moment(payment.due_date).format('MMMM Do, YYYY')}.

      Payment Details:
      - Amount Due: $${payment.amount}
      - Due Date: ${moment(payment.due_date).format('MMMM Do, YYYY')}
      - Property: ${payment.property_name}
      - Payment Type: ${payment.payment_type}

      ${message ? `\nAdditional Message: ${message}\n` : ''}

      Please ensure your payment is made on time to avoid any service interruptions.

      Thank you for your prompt attention to this matter.

      Best regards,
      Property Management Team
    `;

    // Send email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: payment.email,
          subject: emailSubject,
          text: emailBody
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue with notification creation even if email fails
      }
    }

    // Create notification record
    const notificationResult = await pool.query(
      `INSERT INTO notifications (
        user_id, tenant_id, type, title, message
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        req.user.id, tenantId, 'utility_reminder', 
        emailSubject, emailBody
      ]
    );

    res.json({
      message: 'Utility payment reminder sent successfully',
      notification: notificationResult.rows[0]
    });
  } catch (error) {
    console.error('Send utility reminder error:', error);
    res.status(500).json({ error: 'Failed to send utility reminder' });
  }
});

// Send custom notification (owners only)
router.post('/send-custom', requireOwner, [
  body('tenantId').isInt({ min: 1 }),
  body('title').notEmpty().trim(),
  body('message').notEmpty().trim(),
  body('type').optional().isIn(['general', 'maintenance', 'announcement', 'other'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tenantId, title, message, type = 'general' } = req.body;

    // Get tenant details
    const tenantQuery = `
      SELECT t.*, prop.name as property_name
      FROM tenants t
      JOIN leases l ON t.id = l.tenant_id
      JOIN properties prop ON l.property_id = prop.id
      WHERE t.id = $1 AND prop.owner_id = $2 AND l.status = 'active'
    `;
    
    const tenantResult = await pool.query(tenantQuery, [tenantId, req.user.id]);
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found or not associated with your properties' });
    }

    const tenant = tenantResult.rows[0];

    // Send email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: tenant.email,
          subject: title,
          text: message
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue with notification creation even if email fails
      }
    }

    // Create notification record
    const notificationResult = await pool.query(
      `INSERT INTO notifications (
        user_id, tenant_id, type, title, message
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [req.user.id, tenantId, type, title, message]
    );

    res.json({
      message: 'Custom notification sent successfully',
      notification: notificationResult.rows[0]
    });
  } catch (error) {
    console.error('Send custom notification error:', error);
    res.status(500).json({ error: 'Failed to send custom notification' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification statistics
router.get('/stats', requireOwner, async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_notifications,
        COUNT(CASE WHEN type = 'rent_reminder' THEN 1 END) as rent_reminders,
        COUNT(CASE WHEN type = 'utility_reminder' THEN 1 END) as utility_reminders,
        COUNT(CASE WHEN type = 'general' THEN 1 END) as general_notifications
      FROM notifications 
      WHERE user_id = $1
    `;
    
    const statsResult = await pool.query(statsQuery, [req.user.id]);

    res.json({ stats: statsResult.rows[0] });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Failed to get notification statistics' });
  }
});

module.exports = router;