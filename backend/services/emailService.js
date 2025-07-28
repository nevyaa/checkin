const nodemailer = require('nodemailer');
const pool = require('../config/database');
require('dotenv').config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      const mailOptions = {
        from: `"Property Management" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent: ', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      return { success: false, error: error.message };
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  async sendRentDueNotification(tenantId, dueDate, amount) {
    try {
      // Get tenant and property information
      const result = await pool.query(`
        SELECT 
          u.email, u.first_name, u.last_name,
          p.name as property_name, p.address,
          t.monthly_rent,
          owner.first_name as owner_first_name, owner.last_name as owner_last_name,
          owner.email as owner_email
        FROM tenants t
        JOIN users u ON t.user_id = u.id
        JOIN properties p ON t.property_id = p.id
        JOIN users owner ON p.owner_id = owner.id
        WHERE t.id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = result.rows[0];
      const formattedDueDate = new Date(dueDate).toLocaleDateString();
      const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);

      const subject = `Rent Due Notice - ${tenant.property_name}`;
      
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; margin-bottom: 20px;">Rent Due Notice</h2>
              
              <p>Dear ${tenant.first_name} ${tenant.last_name},</p>
              
              <p>This is a friendly reminder that your rent payment is due for the following property:</p>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Property Details</h3>
                <p><strong>Property:</strong> ${tenant.property_name}</p>
                <p><strong>Address:</strong> ${tenant.address}</p>
                <p><strong>Due Date:</strong> ${formattedDueDate}</p>
                <p><strong>Amount Due:</strong> ${formattedAmount}</p>
              </div>
              
              <p>Please ensure payment is made by the due date to avoid any late fees.</p>
              
              <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>Best regards,<br>
                ${tenant.owner_first_name} ${tenant.owner_last_name}<br>
                Property Owner<br>
                ${tenant.owner_email}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const result_email = await this.sendEmail(tenant.email, subject, htmlContent);
      
      // Log notification in database
      if (result_email.success) {
        await pool.query(`
          INSERT INTO notifications (user_id, tenant_id, notification_type, title, message, is_sent, sent_date)
          VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
        `, [
          tenant.user_id, 
          tenantId, 
          'rent_due', 
          subject, 
          `Rent due notice sent for ${formattedAmount} due on ${formattedDueDate}`
        ]);
      }

      return result_email;
    } catch (error) {
      console.error('Send rent due notification error:', error);
      throw error;
    }
  }

  async sendUtilityDueNotification(tenantId, utilityDetails) {
    try {
      const result = await pool.query(`
        SELECT 
          u.email, u.first_name, u.last_name,
          p.name as property_name, p.address,
          owner.first_name as owner_first_name, owner.last_name as owner_last_name,
          owner.email as owner_email
        FROM tenants t
        JOIN users u ON t.user_id = u.id
        JOIN properties p ON t.property_id = p.id
        JOIN users owner ON p.owner_id = owner.id
        WHERE t.id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = result.rows[0];
      const totalAmount = utilityDetails.reduce((sum, utility) => sum + utility.amount, 0);
      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(totalAmount);

      const subject = `Utility Payment Due - ${tenant.property_name}`;
      
      const utilityRows = utilityDetails.map(utility => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${utility.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">
            ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(utility.amount)}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">
            ${new Date(utility.due_date).toLocaleDateString()}
          </td>
        </tr>
      `).join('');

      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; margin-bottom: 20px;">Utility Payment Due</h2>
              
              <p>Dear ${tenant.first_name} ${tenant.last_name},</p>
              
              <p>The following utility payments are due for your property:</p>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Property Details</h3>
                <p><strong>Property:</strong> ${tenant.property_name}</p>
                <p><strong>Address:</strong> ${tenant.address}</p>
              </div>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Utility Breakdown</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #f8f9fa;">
                      <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>
                      <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>
                      <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${utilityRows}
                  </tbody>
                  <tfoot>
                    <tr style="background-color: #f8f9fa; font-weight: bold;">
                      <td style="padding: 10px; border-top: 2px solid #ddd;">Total</td>
                      <td style="padding: 10px; text-align: right; border-top: 2px solid #ddd;">${formattedTotal}</td>
                      <td style="padding: 10px; border-top: 2px solid #ddd;"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              <p>Please ensure payment is made by the respective due dates to avoid any late fees.</p>
              
              <p>If you have any questions about these charges, please contact us immediately.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>Best regards,<br>
                ${tenant.owner_first_name} ${tenant.owner_last_name}<br>
                Property Owner<br>
                ${tenant.owner_email}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const result_email = await this.sendEmail(tenant.email, subject, htmlContent);
      
      // Log notification in database
      if (result_email.success) {
        await pool.query(`
          INSERT INTO notifications (user_id, tenant_id, notification_type, title, message, is_sent, sent_date)
          VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
        `, [
          tenant.user_id, 
          tenantId, 
          'utility_due', 
          subject, 
          `Utility payment notice sent for total ${formattedTotal}`
        ]);
      }

      return result_email;
    } catch (error) {
      console.error('Send utility due notification error:', error);
      throw error;
    }
  }

  async sendLeaseExpiryReminder(tenantId) {
    try {
      const result = await pool.query(`
        SELECT 
          u.email, u.first_name, u.last_name,
          p.name as property_name, p.address,
          t.lease_end_date,
          owner.first_name as owner_first_name, owner.last_name as owner_last_name,
          owner.email as owner_email
        FROM tenants t
        JOIN users u ON t.user_id = u.id
        JOIN properties p ON t.property_id = p.id
        JOIN users owner ON p.owner_id = owner.id
        WHERE t.id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = result.rows[0];
      const expiryDate = new Date(tenant.lease_end_date).toLocaleDateString();
      const daysUntilExpiry = Math.ceil((new Date(tenant.lease_end_date) - new Date()) / (1000 * 60 * 60 * 24));

      const subject = `Lease Expiry Reminder - ${tenant.property_name}`;
      
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107;">
              <h2 style="color: #856404; margin-bottom: 20px;">⚠️ Lease Expiry Reminder</h2>
              
              <p>Dear ${tenant.first_name} ${tenant.last_name},</p>
              
              <p>This is an important reminder that your lease is scheduled to expire soon.</p>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Lease Details</h3>
                <p><strong>Property:</strong> ${tenant.property_name}</p>
                <p><strong>Address:</strong> ${tenant.address}</p>
                <p><strong>Lease Expiry Date:</strong> ${expiryDate}</p>
                <p><strong>Days Remaining:</strong> ${daysUntilExpiry} days</p>
              </div>
              
              <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #17a2b8;">
                <h4 style="margin-top: 0; color: #0c5460;">Next Steps:</h4>
                <ul style="margin-bottom: 0; color: #0c5460;">
                  <li>Please contact us to discuss lease renewal options</li>
                  <li>If you plan to move out, please provide proper notice as per your lease agreement</li>
                  <li>Schedule a move-out inspection if you're not renewing</li>
                </ul>
              </div>
              
              <p>We value you as a tenant and would love to discuss renewal options. Please reach out at your earliest convenience.</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>Best regards,<br>
                ${tenant.owner_first_name} ${tenant.owner_last_name}<br>
                Property Owner<br>
                ${tenant.owner_email}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const result_email = await this.sendEmail(tenant.email, subject, htmlContent);
      
      // Log notification in database
      if (result_email.success) {
        await pool.query(`
          INSERT INTO notifications (user_id, tenant_id, notification_type, title, message, is_sent, sent_date)
          VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
        `, [
          tenant.user_id, 
          tenantId, 
          'lease_expiry', 
          subject, 
          `Lease expiry reminder sent - ${daysUntilExpiry} days remaining`
        ]);
      }

      return result_email;
    } catch (error) {
      console.error('Send lease expiry reminder error:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(tenantId) {
    try {
      const result = await pool.query(`
        SELECT 
          u.email, u.first_name, u.last_name,
          p.name as property_name, p.address,
          t.lease_start_date, t.monthly_rent,
          owner.first_name as owner_first_name, owner.last_name as owner_last_name,
          owner.email as owner_email, owner.phone as owner_phone
        FROM tenants t
        JOIN users u ON t.user_id = u.id
        JOIN properties p ON t.property_id = p.id
        JOIN users owner ON p.owner_id = owner.id
        WHERE t.id = $1
      `, [tenantId]);

      if (result.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = result.rows[0];
      const startDate = new Date(tenant.lease_start_date).toLocaleDateString();

      const subject = `Welcome to ${tenant.property_name}!`;
      
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745;">
              <h2 style="color: #155724; margin-bottom: 20px;">🏠 Welcome to Your New Home!</h2>
              
              <p>Dear ${tenant.first_name} ${tenant.last_name},</p>
              
              <p>Welcome to ${tenant.property_name}! We're excited to have you as our new tenant.</p>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Property Information</h3>
                <p><strong>Property:</strong> ${tenant.property_name}</p>
                <p><strong>Address:</strong> ${tenant.address}</p>
                <p><strong>Lease Start Date:</strong> ${startDate}</p>
                <p><strong>Monthly Rent:</strong> ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tenant.monthly_rent)}</p>
              </div>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Important Reminders</h3>
                <ul>
                  <li>Rent is due on the 1st of each month</li>
                  <li>Please report any maintenance issues promptly</li>
                  <li>Keep your contact information updated</li>
                  <li>Review your lease agreement for all terms and conditions</li>
                </ul>
              </div>
              
              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #007bff;">Contact Information</h3>
                <p><strong>Property Owner:</strong> ${tenant.owner_first_name} ${tenant.owner_last_name}</p>
                <p><strong>Email:</strong> ${tenant.owner_email}</p>
                ${tenant.owner_phone ? `<p><strong>Phone:</strong> ${tenant.owner_phone}</p>` : ''}
              </div>
              
              <p>If you have any questions or need assistance, please don't hesitate to reach out. We're here to help make your tenancy as smooth as possible.</p>
              
              <p>Welcome to your new home!</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p>Best regards,<br>
                ${tenant.owner_first_name} ${tenant.owner_last_name}<br>
                Property Owner<br>
                ${tenant.owner_email}</p>
              </div>
            </div>
          </body>
        </html>
      `;

      return await this.sendEmail(tenant.email, subject, htmlContent);
    } catch (error) {
      console.error('Send welcome email error:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();