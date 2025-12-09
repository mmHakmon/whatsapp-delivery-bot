/**
 * M.M.H Delivery System Pro v4.0
 * Payments Routes
 */

const express = require('express');
const router = express.Router();

const { query, transaction } = require('../config/database');
const { requireAuth, requireRole, sanitizeString } = require('../middleware/security');

// Log payment activity
const logPaymentActivity = async (userId, action, description, details = {}) => {
  try {
    await query(
      "INSERT INTO activity_log (user_id, action, description, details) VALUES ($1, $2, $3, $4)",
      [userId, action, description, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('Activity log error:', e);
  }
};

// ══════════════════════════════════════════════════════════════
// GET ALL PAYMENTS
// ══════════════════════════════════════════════════════════════

router.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, c.first_name, c.last_name, u.name as paid_by_name
      FROM payments p
      JOIN couriers c ON p.courier_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CREATE PAYMENT
// ══════════════════════════════════════════════════════════════

router.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { courier_id, amount, method, notes } = req.body;
    
    // Validate
    if (!courier_id || !amount || amount <= 0) {
      return res.json({ success: false, error: 'נדרש שליח וסכום תקין' });
    }
    
    // Validate method
    const validMethods = ['cash', 'transfer', 'bit'];
    if (method && !validMethods.includes(method)) {
      return res.json({ success: false, error: 'אמצעי תשלום לא תקין' });
    }
    
    // Create payment and update courier balance
    await transaction(async (client) => {
      // Insert payment
      await client.query(`
        INSERT INTO payments (courier_id, amount, method, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [courier_id, amount, method || 'cash', sanitizeString(notes, 255), req.user.id]);
      
      // Update courier balance
      await client.query(
        "UPDATE couriers SET balance = balance - $1 WHERE id = $2",
        [amount, courier_id]
      );
    });
    
    // Log activity
    await logPaymentActivity(req.user.id, 'PAYMENT', `תשלום ₪${amount} לשליח #${courier_id}`, {
      courier_id,
      amount,
      method
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET PAYMENTS BY COURIER
// ══════════════════════════════════════════════════════════════

router.get('/courier/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, u.name as paid_by_name
      FROM payments p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.courier_id = $1
      ORDER BY p.created_at DESC
    `, [req.params.id]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Get courier payments error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// PAYMENTS SUMMARY
// ══════════════════════════════════════════════════════════════

router.get('/summary', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (from) {
      dateFilter = ' WHERE p.created_at >= $1';
      params.push(from);
      if (to) {
        dateFilter += ' AND p.created_at <= $2';
        params.push(to + ' 23:59:59');
      }
    } else if (to) {
      dateFilter = ' WHERE p.created_at <= $1';
      params.push(to + ' 23:59:59');
    }
    
    const summary = await query(`
      SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(CASE WHEN method='cash' THEN 1 END) as cash_count,
        COALESCE(SUM(CASE WHEN method='cash' THEN amount END), 0) as cash_amount,
        COUNT(CASE WHEN method='transfer' THEN 1 END) as transfer_count,
        COALESCE(SUM(CASE WHEN method='transfer' THEN amount END), 0) as transfer_amount,
        COUNT(CASE WHEN method='bit' THEN 1 END) as bit_count,
        COALESCE(SUM(CASE WHEN method='bit' THEN amount END), 0) as bit_amount
      FROM payments p${dateFilter}
    `, params);
    
    res.json(summary.rows[0]);
    
  } catch (error) {
    console.error('Payments summary error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
