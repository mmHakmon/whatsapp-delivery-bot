/**
 * M.M.H Delivery System Pro v4.0
 * Admin Routes
 */

const express = require('express');
const router = express.Router();

const { query, transaction } = require('../config/database');
const { requireAuth, requireRole, logSecurityEvent, getSecurityLogs } = require('../middleware/security');

// WebSocket broadcast function (injected from main server)
let broadcast = () => {};
const setBroadcast = (fn) => { broadcast = fn; };

// ══════════════════════════════════════════════════════════════
// ADMIN STATS
// ══════════════════════════════════════════════════════════════

router.get('/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const orders = await query("SELECT status, COUNT(*) as count FROM orders GROUP BY status");
    const couriers = await query("SELECT COUNT(*) as total FROM couriers");
    const payments = await query("SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as sum FROM payments");
    
    res.json({
      orders: orders.rows,
      couriers: parseInt(couriers.rows[0].total),
      payments: {
        count: parseInt(payments.rows[0].total),
        sum: parseFloat(payments.rows[0].sum)
      }
    });
    
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// SECURITY LOGS
// ══════════════════════════════════════════════════════════════

router.get('/security-logs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM activity_log 
      WHERE action LIKE 'LOGIN%' OR action LIKE '2FA%' OR action LIKE 'RATE%' OR action LIKE 'ACCOUNT%'
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    
    res.json({
      logs: result.rows,
      memoryLogs: getSecurityLogs()
    });
    
  } catch (error) {
    console.error('Security logs error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ══════════════════════════════════════════════════════════════

router.get('/activity-log', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { limit = 100, action, userId, from, to } = req.query;
    
    let sql = `
      SELECT a.*, u.name as user_name 
      FROM activity_log a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    
    if (action) {
      sql += ` AND a.action = $${i++}`;
      params.push(action);
    }
    if (userId) {
      sql += ` AND a.user_id = $${i++}`;
      params.push(userId);
    }
    if (from) {
      sql += ` AND a.created_at >= $${i++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND a.created_at <= $${i++}`;
      params.push(to);
    }
    
    sql += ` ORDER BY a.created_at DESC LIMIT $${i}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Activity log error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE DELIVERED ORDERS
// ══════════════════════════════════════════════════════════════

router.delete('/orders/delivered', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await transaction(async (client) => {
      // Update courier stats before deleting
      await client.query(`
        UPDATE couriers c SET 
          total_deliveries = total_deliveries - COALESCE((
            SELECT COUNT(*) FROM orders WHERE courier_id = c.id AND status = 'delivered'
          ), 0),
          total_earned = total_earned - COALESCE((
            SELECT SUM(courier_payout) FROM orders WHERE courier_id = c.id AND status = 'delivered'
          ), 0),
          balance = balance - COALESCE((
            SELECT SUM(courier_payout) FROM orders WHERE courier_id = c.id AND status = 'delivered'
          ), 0)
      `);
      
      // Delete delivered orders
      const result = await client.query("DELETE FROM orders WHERE status='delivered' RETURNING id");
      return result.rowCount;
    });
    
    const result = await query("SELECT COUNT(*) as deleted FROM orders WHERE status='delivered'");
    
    broadcast({ type: 'refresh' });
    
    logSecurityEvent('ADMIN_DELETE_DELIVERED', req.ip, { user: req.user.username });
    
    res.json({ success: true, deleted: 0 }); // Already deleted
    
  } catch (error) {
    console.error('Delete delivered error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE CANCELLED ORDERS
// ══════════════════════════════════════════════════════════════

router.delete('/orders/cancelled', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query("DELETE FROM orders WHERE status='cancelled' RETURNING id");
    
    logSecurityEvent('ADMIN_DELETE_CANCELLED', req.ip, { 
      user: req.user.username, 
      count: result.rowCount 
    });
    
    res.json({ success: true, deleted: result.rowCount });
    
  } catch (error) {
    console.error('Delete cancelled error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE ALL ORDERS
// ══════════════════════════════════════════════════════════════

router.delete('/orders/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query("DELETE FROM orders RETURNING id");
    await query("UPDATE couriers SET total_deliveries=0, total_earned=0, balance=0");
    
    broadcast({ type: 'refresh' });
    
    logSecurityEvent('ADMIN_DELETE_ALL_ORDERS', req.ip, { 
      user: req.user.username, 
      count: result.rowCount 
    });
    
    res.json({ success: true, deleted: result.rowCount });
    
  } catch (error) {
    console.error('Delete all orders error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE ALL COURIERS
// ══════════════════════════════════════════════════════════════

router.delete('/couriers/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await query("UPDATE orders SET courier_id=NULL");
    const result = await query("DELETE FROM couriers RETURNING id");
    
    logSecurityEvent('ADMIN_DELETE_ALL_COURIERS', req.ip, { 
      user: req.user.username, 
      count: result.rowCount 
    });
    
    res.json({ success: true, deleted: result.rowCount });
    
  } catch (error) {
    console.error('Delete all couriers error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// RESET COURIER STATS
// ══════════════════════════════════════════════════════════════

router.post('/couriers/reset-stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await query("UPDATE couriers SET total_deliveries=0, total_earned=0, balance=0");
    
    logSecurityEvent('ADMIN_RESET_COURIER_STATS', req.ip, { user: req.user.username });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Reset courier stats error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE ALL PAYMENTS
// ══════════════════════════════════════════════════════════════

router.delete('/payments/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query("DELETE FROM payments RETURNING id");
    
    // Recalculate courier balances
    await query(`
      UPDATE couriers c SET balance = COALESCE((
        SELECT SUM(courier_payout) FROM orders 
        WHERE courier_id = c.id AND status = 'delivered'
      ), 0)
    `);
    
    logSecurityEvent('ADMIN_DELETE_ALL_PAYMENTS', req.ip, { 
      user: req.user.username, 
      count: result.rowCount 
    });
    
    res.json({ success: true, deleted: result.rowCount });
    
  } catch (error) {
    console.error('Delete all payments error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// FULL RESET
// ══════════════════════════════════════════════════════════════

router.delete('/reset', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await query("DELETE FROM payments");
    await query("DELETE FROM orders");
    await query("DELETE FROM couriers");
    await query("DELETE FROM activity_log WHERE action NOT LIKE 'LOGIN%'");
    
    broadcast({ type: 'refresh' });
    
    logSecurityEvent('ADMIN_FULL_RESET', req.ip, { user: req.user.username });
    
    res.json({ success: true, message: 'המערכת אופסה' });
    
  } catch (error) {
    console.error('Full reset error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

module.exports = router;
module.exports.setBroadcast = setBroadcast;
