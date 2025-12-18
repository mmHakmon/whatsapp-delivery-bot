const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class CustomersController {
  // ==========================================
  // AUTHENTICATION
  // ==========================================
  
  async register(req, res, next) {
    try {
      const { 
        name, 
        phone, 
        password,
        email,
        businessName,
        businessType,
        address 
      } = req.body;

      // Validate required fields
      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'שם, טלפון וסיסמה נדרשים' });
      }

      // Check if customer already exists
      const existingCustomer = await pool.query(
        'SELECT * FROM customers WHERE phone = $1',
        [phone]
      );

      if (existingCustomer.rows.length > 0) {
        return res.status(400).json({ error: 'מספר טלפון זה כבר רשום' });
      }

      // Check email if provided
      if (email) {
        const existingEmail = await pool.query(
          'SELECT * FROM customers WHERE email = $1',
          [email]
        );
        if (existingEmail.rows.length > 0) {
          return res.status(400).json({ error: 'אימייל זה כבר רשום' });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create customer
      const result = await pool.query(
        `INSERT INTO customers (
          name, phone, password, email, business_name, business_type, 
          address, registered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
        RETURNING id, name, phone, email, business_name, business_type, 
                  address, registered_at, is_vip`,
        [name, phone, hashedPassword, email, businessName, businessType, address]
      );

      const customer = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { id: customer.id, phone: customer.phone, type: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        message: 'נרשמת בהצלחה!',
        token,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          businessName: customer.business_name,
          businessType: customer.business_type,
          isVip: customer.is_vip
        }
      });
    } catch (error) {
      console.error('Customer registration error:', error);
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { phone, password } = req.body;

      if (!phone || !password) {
        return res.status(400).json({ error: 'טלפון וסיסמה נדרשים' });
      }

      // Get customer
      const result = await pool.query(
        'SELECT * FROM customers WHERE phone = $1',
        [phone]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'טלפון או סיסמה שגויים' });
      }

      const customer = result.rows[0];

      // Check password
      const validPassword = await bcrypt.compare(password, customer.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'טלפון או סיסמה שגויים' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: customer.id, phone: customer.phone, type: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        message: 'התחברת בהצלחה!',
        token,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          businessName: customer.business_name,
          businessType: customer.business_type,
          address: customer.address,
          isVip: customer.is_vip,
          avatarUrl: customer.avatar_url
        }
      });
    } catch (error) {
      console.error('Customer login error:', error);
      next(error);
    }
  }

  // ==========================================
  // PROFILE MANAGEMENT
  // ==========================================

  async getProfile(req, res, next) {
    try {
      const customerId = req.customer.id;

      const result = await pool.query(
        `SELECT 
          id, name, phone, email, business_name, business_type, address,
          preferred_payment_method, discount_percentage, is_vip, avatar_url,
          whatsapp_notifications, sms_notifications, email_notifications,
          registered_at, last_order_at, notes
        FROM customers WHERE id = $1`,
        [customerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'לקוח לא נמצא' });
      }

      res.json({ customer: result.rows[0] });
    } catch (error) {
      console.error('Get profile error:', error);
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const customerId = req.customer.id;
      const {
        name,
        email,
        businessName,
        businessType,
        address,
        preferredPaymentMethod,
        avatarUrl
      } = req.body;

      const result = await pool.query(
        `UPDATE customers SET
          name = COALESCE($1, name),
          email = COALESCE($2, email),
          business_name = COALESCE($3, business_name),
          business_type = COALESCE($4, business_type),
          address = COALESCE($5, address),
          preferred_payment_method = COALESCE($6, preferred_payment_method),
          avatar_url = COALESCE($7, avatar_url)
        WHERE id = $8
        RETURNING id, name, phone, email, business_name, business_type, 
                  address, preferred_payment_method, avatar_url, is_vip`,
        [name, email, businessName, businessType, address, preferredPaymentMethod, avatarUrl, customerId]
      );

      res.json({
        message: 'פרופיל עודכן בהצלחה!',
        customer: result.rows[0]
      });
    } catch (error) {
      console.error('Update profile error:', error);
      next(error);
    }
  }

  async updateNotificationSettings(req, res, next) {
    try {
      const customerId = req.customer.id;
      const { whatsapp, sms, email } = req.body;

      await pool.query(
        `UPDATE customers SET
          whatsapp_notifications = COALESCE($1, whatsapp_notifications),
          sms_notifications = COALESCE($2, sms_notifications),
          email_notifications = COALESCE($3, email_notifications)
        WHERE id = $4`,
        [whatsapp, sms, email, customerId]
      );

      res.json({ message: 'הגדרות התראות עודכנו!' });
    } catch (error) {
      console.error('Update notifications error:', error);
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const customerId = req.customer.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'סיסמה נוכחית וחדשה נדרשות' });
      }

      // Get current password
      const result = await pool.query(
        'SELECT password FROM customers WHERE id = $1',
        [customerId]
      );

      const customer = result.rows[0];
      const validPassword = await bcrypt.compare(currentPassword, customer.password);

      if (!validPassword) {
        return res.status(401).json({ error: 'סיסמה נוכחית שגויה' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await pool.query(
        'UPDATE customers SET password = $1 WHERE id = $2',
        [hashedPassword, customerId]
      );

      res.json({ message: 'סיסמה שונתה בהצלחה!' });
    } catch (error) {
      console.error('Change password error:', error);
      next(error);
    }
  }

  // ==========================================
  // STATISTICS & HISTORY
  // ==========================================

  async getStatistics(req, res, next) {
    try {
      const customerId = req.customer.id;

      // Get overall statistics
      const statsResult = await pool.query(
        `SELECT 
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'new') as pending_orders,
          COUNT(*) FILTER (WHERE status IN ('published', 'taken', 'picked')) as active_orders,
          COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
          COALESCE(SUM(price) FILTER (WHERE status = 'delivered'), 0) as total_spent,
          COALESCE(AVG(price) FILTER (WHERE status = 'delivered'), 0) as avg_order_value,
          MIN(created_at) as first_order_date,
          MAX(created_at) as last_order_date
        FROM orders
        WHERE sender_phone = (SELECT phone FROM customers WHERE id = $1)
           OR receiver_phone = (SELECT phone FROM customers WHERE id = $1)`,
        [customerId]
      );

      // Get monthly statistics (last 6 months)
      const monthlyResult = await pool.query(
        `SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as orders,
          COALESCE(SUM(price), 0) as total
        FROM orders
        WHERE (sender_phone = (SELECT phone FROM customers WHERE id = $1)
           OR receiver_phone = (SELECT phone FROM customers WHERE id = $1))
          AND created_at >= NOW() - INTERVAL '6 months'
          AND status = 'delivered'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month DESC`,
        [customerId]
      );

      // Get favorite routes
      const routesResult = await pool.query(
        `SELECT 
          pickup_address,
          delivery_address,
          COUNT(*) as count
        FROM orders
        WHERE sender_phone = (SELECT phone FROM customers WHERE id = $1)
          AND status = 'delivered'
        GROUP BY pickup_address, delivery_address
        ORDER BY count DESC
        LIMIT 5`,
        [customerId]
      );

      res.json({
        statistics: statsResult.rows[0],
        monthly: monthlyResult.rows,
        favoriteRoutes: routesResult.rows
      });
    } catch (error) {
      console.error('Get statistics error:', error);
      next(error);
    }
  }

  async getOrderHistory(req, res, next) {
    try {
      const customerId = req.customer.id;
      const { status, limit = 20, offset = 0 } = req.query;

      let query = `
        SELECT 
          o.*,
          c.first_name as courier_first_name,
          c.last_name as courier_last_name,
          c.phone as courier_phone
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        WHERE o.sender_phone = (SELECT phone FROM customers WHERE id = $1)
           OR o.receiver_phone = (SELECT phone FROM customers WHERE id = $1)
      `;

      const params = [customerId];

      if (status) {
        query += ` AND o.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ orders: result.rows });
    } catch (error) {
      console.error('Get order history error:', error);
      next(error);
    }
  }

  // ==========================================
  // SUPPORT
  // ==========================================

  async getSupport(req, res, next) {
    try {
      const supportInfo = {
        whatsapp: {
          number: process.env.SUPPORT_WHATSAPP || '972545025254',
          url: `https://wa.me/${process.env.SUPPORT_WHATSAPP?.replace('+', '') || '972545025254'}`
        },
        phone: {
          number: process.env.SUPPORT_PHONE || '054-502-5254',
          url: `tel:${process.env.SUPPORT_PHONE || '0545025254'}`
        },
        email: process.env.SUPPORT_EMAIL || 'support@mmh-delivery.com',
        hours: 'א׳-ה׳: 8:00-18:00, ו׳: 8:00-14:00'
      };

      res.json({ support: supportInfo });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CustomersController();
