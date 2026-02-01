const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { ORDER_STATUS } = require('../config/constants');

class AdminController {
  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  // Create new user
  async createUser(req, res, next) {
    try {
      const { username, password, name, role = 'agent' } = req.body;

      if (!username || !password || !name) {
        return res.status(400).json({ error: 'חסרים שדות חובה' });
      }

      // Check if username exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'שם המשתמש כבר קיים' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Insert user
      const result = await pool.query(`
        INSERT INTO users (username, password, name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, name, role, created_at
      `, [username, hashedPassword, name, role]);

      res.status(201).json({ 
        user: result.rows[0],
        message: 'משתמש נוצר בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all users
  async getUsers(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT id, username, name, role, active, last_login, created_at 
        FROM users 
        ORDER BY created_at DESC
      `);

      res.json({ users: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Update user
  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const { name, role, active } = req.body;

      const result = await pool.query(`
        UPDATE users 
        SET name = COALESCE($1, name),
            role = COALESCE($2, role),
            active = COALESCE($3, active),
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, username, name, role, active
      `, [name, role, active, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'משתמש לא נמצא' });
      }

      res.json({ 
        user: result.rows[0],
        message: 'משתמש עודכן בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // ✅ FIXED: Change password - admin can change any user's password without current password
  async changePassword(req, res, next) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      // Only admin can change other users' passwords
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'אין הרשאה' });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'סיסמה חדשה חייבת להיות לפחות 6 תווים' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update password
      await pool.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, id]
      );

      res.json({ message: 'סיסמה שונתה בהצלחה' });
    } catch (error) {
      next(error);
    }
  }

  // Delete user
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;

      // Prevent deleting self
      if (req.user.id === parseInt(id)) {
        return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
      }

      const result = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'משתמש לא נמצא' });
      }

      res.json({ message: 'משתמש נמחק' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DASHBOARD STATISTICS
  // ==========================================

  async getDashboardStats(req, res, next) {
    try {
      const stats = await pool.query(`
        SELECT 
          -- Orders
          (SELECT COUNT(*) FROM orders) as total_orders,
          (SELECT COUNT(*) FROM orders WHERE status = 'new') as new_orders,
          (SELECT COUNT(*) FROM orders WHERE status = 'published') as published_orders,
          (SELECT COUNT(*) FROM orders WHERE status IN ('taken', 'picked')) as active_orders,
          (SELECT COUNT(*) FROM orders WHERE status = 'delivered') as delivered_orders,
          (SELECT COUNT(*) FROM orders WHERE status = 'cancelled') as cancelled_orders,
          (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '24 hours') as today_orders,
          (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '7 days') as week_orders,
          (SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '30 days') as month_orders,
          
          -- Couriers
          (SELECT COUNT(*) FROM couriers) as total_couriers,
          (SELECT COUNT(*) FROM couriers WHERE status = 'active') as active_couriers,
          (SELECT COUNT(*) FROM couriers WHERE is_online = true) as online_couriers,
          (SELECT COUNT(*) FROM couriers WHERE status = 'blocked') as blocked_couriers,
          
          -- Financials
          (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'delivered') as total_revenue,
          (SELECT COALESCE(SUM(commission), 0) FROM orders WHERE status = 'delivered') as total_commission,
          (SELECT COALESCE(SUM(courier_payout), 0) FROM orders WHERE status = 'delivered') as total_paid_couriers,
          (SELECT COALESCE(SUM(balance), 0) FROM couriers) as pending_payouts,
          (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'delivered' AND delivered_at >= NOW() - INTERVAL '24 hours') as today_revenue,
          (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'delivered' AND delivered_at >= NOW() - INTERVAL '7 days') as week_revenue,
          (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'delivered' AND delivered_at >= NOW() - INTERVAL '30 days') as month_revenue,
          
          -- Pending actions
          (SELECT COUNT(*) FROM payout_requests WHERE status = 'pending') as pending_payout_requests,
          (SELECT COUNT(*) FROM orders WHERE status = 'new') as pending_orders,
          
          -- Averages
          (SELECT COALESCE(AVG(distance_km), 0) FROM orders WHERE status = 'delivered') as avg_distance,
          (SELECT COALESCE(AVG(price), 0) FROM orders WHERE status = 'delivered') as avg_order_value,
          (SELECT COALESCE(AVG(rating), 5.0) FROM couriers) as avg_courier_rating
      `);

      res.json({ statistics: stats.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // REPORTS & EXPORTS
  // ==========================================

  // Export orders
  async exportOrders(req, res, next) {
    try {
      const { startDate, endDate, status } = req.query;

      let query = `
        SELECT 
          o.*,
          c.first_name || ' ' || c.last_name as courier_name,
          c.phone as courier_phone,
          u.name as created_by_name
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        LEFT JOIN users u ON o.created_by = u.id
        WHERE 1=1
      `;
      
      const params = [];

      if (startDate) {
        query += ` AND o.created_at >= $${params.length + 1}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND o.created_at <= $${params.length + 1}`;
        params.push(endDate);
      }

      if (status) {
        query += ` AND o.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ' ORDER BY o.created_at DESC';

      const result = await pool.query(query, params);

      res.json({ 
        orders: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      next(error);
    }
  }

  // Export couriers
  async exportCouriers(req, res, next) {
    try {
      const { status } = req.query;

      let query = `
        SELECT 
          c.*,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.courier_payout), 0) as total_earned
        FROM couriers c
        LEFT JOIN orders o ON c.id = o.courier_id AND o.status = 'delivered'
      `;

      const params = [];

      if (status) {
        query += ' WHERE c.status = $1';
        params.push(status);
      }

      query += ' GROUP BY c.id ORDER BY c.created_at DESC';

      const result = await pool.query(query, params);

      res.json({ 
        couriers: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      next(error);
    }
  }

  // Export payments
  async exportPayments(req, res, next) {
    try {
      const { startDate, endDate, courierId } = req.query;

      let query = `
        SELECT 
          p.*,
          c.first_name || ' ' || c.last_name as courier_name,
          c.phone as courier_phone
        FROM payments p
        JOIN couriers c ON p.courier_id = c.id
        WHERE 1=1
      `;

      const params = [];

      if (startDate) {
        query += ` AND p.created_at >= $${params.length + 1}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND p.created_at <= $${params.length + 1}`;
        params.push(endDate);
      }

      if (courierId) {
        query += ` AND p.courier_id = $${params.length + 1}`;
        params.push(courierId);
      }

      query += ' ORDER BY p.created_at DESC';

      const result = await pool.query(query, params);

      res.json({ 
        payments: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // REVENUE BY PERIOD
  // ==========================================

  async getRevenueByPeriod(req, res, next) {
    try {
      const { period = 'day', startDate, endDate } = req.query;

      let timeFormat;
      switch (period) {
        case 'hour':
          timeFormat = 'YYYY-MM-DD HH24:00';
          break;
        case 'day':
          timeFormat = 'YYYY-MM-DD';
          break;
        case 'week':
          timeFormat = 'IYYY-IW';
          break;
        case 'month':
          timeFormat = 'YYYY-MM';
          break;
        default:
          timeFormat = 'YYYY-MM-DD';
      }

      let query = `
        SELECT 
          TO_CHAR(delivered_at, '${timeFormat}') as period,
          COUNT(*) as orders,
          COALESCE(SUM(price), 0) as revenue,
          COALESCE(SUM(commission), 0) as commission,
          COALESCE(SUM(courier_payout), 0) as courier_payout
        FROM orders
        WHERE status = 'delivered'
      `;

      const params = [];

      if (startDate) {
        query += ` AND delivered_at >= $${params.length + 1}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND delivered_at <= $${params.length + 1}`;
        params.push(endDate);
      }

      query += ` GROUP BY period ORDER BY period DESC LIMIT 30`;

      const result = await pool.query(query, params);

      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // TOP COURIERS
  // ==========================================

  async getTopCouriers(req, res, next) {
    try {
      const { limit = 10, period = 'all' } = req.query;

      let dateFilter = '';
      if (period === 'today') {
        dateFilter = "AND o.delivered_at >= CURRENT_DATE";
      } else if (period === 'week') {
        dateFilter = "AND o.delivered_at >= date_trunc('week', CURRENT_DATE)";
      } else if (period === 'month') {
        dateFilter = "AND o.delivered_at >= date_trunc('month', CURRENT_DATE)";
      }

      const result = await pool.query(`
        SELECT 
          c.id,
          c.first_name || ' ' || c.last_name as name,
          c.phone,
          c.vehicle_type,
          c.rating,
          COUNT(o.id) as deliveries,
          COALESCE(SUM(o.courier_payout), 0) as earned
        FROM couriers c
        LEFT JOIN orders o ON c.id = o.courier_id AND o.status = 'delivered' ${dateFilter}
        WHERE c.status = 'active'
        GROUP BY c.id
        ORDER BY deliveries DESC, earned DESC
        LIMIT $1
      `, [limit]);

      res.json({ couriers: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // ORDERS BY STATUS
  // ==========================================

  async getOrdersByStatus(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          COALESCE(SUM(price), 0) as total_value
        FROM orders
        GROUP BY status
        ORDER BY 
          CASE status
            WHEN 'new' THEN 1
            WHEN 'published' THEN 2
            WHEN 'taken' THEN 3
            WHEN 'picked' THEN 4
            WHEN 'delivered' THEN 5
            WHEN 'cancelled' THEN 6
          END
      `);

      res.json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // ACTIVITY LOG
  // ==========================================

  async logActivity(req, res, next) {
    try {
      const { action, description, details } = req.body;

      await pool.query(`
        INSERT INTO activity_log (user_id, action, description, details, ip_address)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        req.user.id,
        action,
        description,
        JSON.stringify(details || {}),
        req.ip
      ]);

      res.json({ message: 'Activity logged' });
    } catch (error) {
      next(error);
    }
  }

  async getActivityLog(req, res, next) {
    try {
      const { limit = 50, offset = 0, userId, action } = req.query;

      let query = `
        SELECT 
          a.*,
          u.name as user_name,
          u.username
        FROM activity_log a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
      `;

      const params = [];

      if (userId) {
        query += ` AND a.user_id = $${params.length + 1}`;
        params.push(userId);
      }

      if (action) {
        query += ` AND a.action = $${params.length + 1}`;
        params.push(action);
      }

      query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ logs: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // SETTINGS
  // ==========================================

  async getSettings(req, res, next) {
    try {
      const result = await pool.query('SELECT * FROM settings');
      
      const settings = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });

      res.json({ settings });
    } catch (error) {
      next(error);
    }
  }

  async updateSetting(req, res, next) {
    try {
      const { key, value } = req.body;

      await pool.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = NOW()
      `, [key, value]);

      res.json({ message: 'Setting updated' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // MAINTENANCE & CLEANUP
  // ==========================================

  async cleanupOldData(req, res, next) {
    try {
      const { days = 90 } = req.body;

      // Delete old cancelled orders
      const ordersResult = await pool.query(`
        DELETE FROM orders 
        WHERE status = 'cancelled' 
        AND cancelled_at < NOW() - INTERVAL '${parseInt(days)} days'
        RETURNING id
      `);

      // Delete old activity logs
      const logsResult = await pool.query(`
        DELETE FROM activity_log 
        WHERE created_at < NOW() - INTERVAL '${parseInt(days)} days'
        RETURNING id
      `);

      res.json({ 
        message: 'Cleanup completed',
        deleted: {
          orders: ordersResult.rowCount,
          logs: logsResult.rowCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getDatabaseStats(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM orders) as total_orders,
          (SELECT COUNT(*) FROM couriers) as total_couriers,
          (SELECT COUNT(*) FROM customers) as total_customers,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM payout_requests) as total_payout_requests,
          (SELECT COUNT(*) FROM payments) as total_payments,
          (SELECT COUNT(*) FROM activity_log) as total_logs
      `);

      res.json({ stats: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // SETTINGS PANEL FUNCTIONS
  // ==========================================

async resetStatistics(req, res, next) {
  try {
    const { period } = req.body;
    
    await pool.query('BEGIN');
    
    if (period === 'all') {
      // מחק הכל
      await pool.query('DELETE FROM orders');
      await pool.query('DELETE FROM payments');
      await pool.query(`
        UPDATE couriers 
        SET total_earned = 0, 
            balance = 0,
            rating = 5.0,
            total_deliveries = 0
      `);
      
      await pool.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'כל הסטטיסטיקות אופסו בהצלחה'
      });
    } else {
      // מחק לפי תקופה
      let dateCondition = '';
      let periodText = '';
      
      if (period === 'today') {
        dateCondition = "AND DATE(created_at) = CURRENT_DATE";
        periodText = 'היום';
      } else if (period === 'week') {
        dateCondition = "AND created_at >= DATE_TRUNC('week', CURRENT_DATE)";
        periodText = 'השבוע';
      } else if (period === 'month') {
        dateCondition = "AND created_at >= DATE_TRUNC('month', CURRENT_DATE)";
        periodText = 'החודש';
      } else if (period === 'year') {
        dateCondition = "AND created_at >= DATE_TRUNC('year', CURRENT_DATE)";
        periodText = 'השנה';
      }
      
      // Delete orders for the period
      const ordersResult = await pool.query(`
        DELETE FROM orders 
        WHERE 1=1 ${dateCondition}
        RETURNING id
      `);

      await pool.query('COMMIT');

      res.json({ 
        success: true, 
        message: `סטטיסטיקות ${periodText} אופסו - ${ordersResult.rowCount} הזמנות נמחקו`,
        deleted: ordersResult.rowCount
      });
    }
  } catch (error) {
    await pool.query('ROLLBACK');
    next(error);
  }
}

  async deleteOldOrders(req, res, next) {
    try {
      const { months = 6 } = req.body;
      
      const result = await pool.query(`
        DELETE FROM orders 
        WHERE status IN ('delivered', 'cancelled') 
        AND created_at < NOW() - INTERVAL '${parseInt(months)} months'
        RETURNING id
      `);

      res.json({ 
        success: true, 
        message: `${result.rowCount} הזמנות ישנות נמחקו`,
        deleted: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async archiveDelivered(req, res, next) {
    try {
      const { days = 30 } = req.body;
      
      const result = await pool.query(`
        UPDATE orders 
        SET notes = CONCAT(COALESCE(notes, ''), ' [ARCHIVED]')
        WHERE status = 'delivered' 
        AND delivered_at < NOW() - INTERVAL '${parseInt(days)} days'
        AND notes NOT LIKE '%[ARCHIVED]%'
        RETURNING id
      `);

      res.json({ 
        success: true, 
        message: `${result.rowCount} הזמנות הועברו לארכיון`,
        archived: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteOrder(req, res, next) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM orders WHERE id = $1 RETURNING id, order_number',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      res.json({ 
        success: true, 
        message: 'הזמנה נמחקה בהצלחה',
        order: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // PAYMENTS & COURIERS MANAGEMENT
  // ==========================================

  async resetPayments(req, res, next) {
    try {
      const result = await pool.query('DELETE FROM payments RETURNING id');
      
      res.json({ 
        success: true, 
        message: `${result.rowCount} תשלומים נמחקו בהצלחה`,
        deleted: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async resetCourierEarnings(req, res, next) {
    try {
      const result = await pool.query(`
        UPDATE couriers 
        SET total_earned = 0, 
            balance = 0
        RETURNING id
      `);
      
      res.json({ 
        success: true, 
        message: `רווחים אופסו עבור ${result.rowCount} שליחים`,
        updated: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async resetCourierRatings(req, res, next) {
    try {
      const result = await pool.query(`
        UPDATE couriers 
        SET rating = 5.0, 
            total_deliveries = 0
        RETURNING id
      `);
      
      res.json({ 
        success: true, 
        message: `דירוגים אופסו עבור ${result.rowCount} שליחים`,
        updated: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async resetAllCouriers(req, res, next) {
    try {
      const result = await pool.query('DELETE FROM couriers RETURNING id');
      
      res.json({ 
        success: true, 
        message: `${result.rowCount} שליחים נמחקו בהצלחה`,
        deleted: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }

  async payoutPayments(req, res, next) {
    try {
      const { courierId } = req.body;
      
      let query = `
        UPDATE payments 
        SET status = 'paid', 
            paid_at = NOW()
        WHERE status = 'pending'
      `;
      const params = [];
      
      if (courierId) {
        query += ' AND courier_id = $1';
        params.push(courierId);
      }
      
      query += ' RETURNING id, courier_id, amount';
      
      const result = await pool.query(query, params);
      
      // Update courier balance (deduct)
      if (result.rows.length > 0) {
        const courierIds = [...new Set(result.rows.map(r => r.courier_id))];
        
        for (const cId of courierIds) {
          const totalPaid = result.rows
            .filter(r => r.courier_id === cId)
            .reduce((sum, r) => sum + parseFloat(r.amount), 0);
          
          await pool.query(`
            UPDATE couriers 
            SET balance = GREATEST(balance - $1, 0)
            WHERE id = $2
          `, [totalPaid, cId]);
        }
      }
      
      res.json({ 
        success: true, 
        message: `${result.rowCount} תשלומים בוצעו בהצלחה`,
        paidCount: result.rowCount
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
