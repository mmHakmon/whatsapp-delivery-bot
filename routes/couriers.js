/**
 * M.M.H Delivery System Pro v4.0
 * Couriers Routes
 */

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { requireAuth, requireRole, sanitizeString } = require('../middleware/security');

// ══════════════════════════════════════════════════════════════
// GET ALL COURIERS
// ══════════════════════════════════════════════════════════════

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query("SELECT * FROM couriers ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) {
    console.error('Get couriers error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET SINGLE COURIER
// ══════════════════════════════════════════════════════════════

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const courier = await query("SELECT * FROM couriers WHERE id=$1", [req.params.id]);
    
    if (!courier.rows[0]) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    
    const orders = await query(
      "SELECT * FROM orders WHERE courier_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.params.id]
    );
    
    res.json({
      ...courier.rows[0],
      orders: orders.rows
    });
    
  } catch (error) {
    console.error('Get courier error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// UPDATE COURIER
// ══════════════════════════════════════════════════════════════

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    await query(
      "UPDATE couriers SET status=$1, notes=$2, updated_at=NOW() WHERE id=$3",
      [status, sanitizeString(notes, 500), req.params.id]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Update courier error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET COURIER HISTORY
// ══════════════════════════════════════════════════════════════

router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    
    let sql = "SELECT * FROM orders WHERE courier_id = $1";
    const params = [req.params.id];
    let i = 2;
    
    if (from) {
      sql += ` AND created_at >= $${i++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND created_at <= $${i++}`;
      params.push(to + ' 23:59:59');
    }
    if (status && status !== 'all') {
      sql += ` AND status = $${i++}`;
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const orders = await query(sql, params);
    
    // Get statistics
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status='delivered' THEN courier_payout END), 0) as total_earned
      FROM orders WHERE courier_id = $1
    `, [req.params.id]);
    
    res.json({
      orders: orders.rows,
      stats: stats.rows[0]
    });
    
  } catch (error) {
    console.error('Get courier history error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// ADD COURIER RATING
// ══════════════════════════════════════════════════════════════

router.post('/:id/rating', requireAuth, async (req, res) => {
  try {
    const { rating, comment, orderId } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.json({ success: false, error: 'דירוג חייב להיות בין 1 ל-5' });
    }
    
    // Insert rating
    await query(`
      INSERT INTO courier_ratings (courier_id, order_id, rating, comment, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.params.id, orderId, rating, sanitizeString(comment, 255), req.user.id]);
    
    // Update average rating
    const avg = await query(
      "SELECT AVG(rating) as avg FROM courier_ratings WHERE courier_id=$1",
      [req.params.id]
    );
    
    await query(
      "UPDATE couriers SET rating=$1 WHERE id=$2",
      [avg.rows[0].avg, req.params.id]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Add rating error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════

router.get('/reports/all', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*, 
        COUNT(CASE WHEN o.status='delivered' AND o.delivered_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as monthly_deliveries,
        COALESCE(SUM(CASE WHEN o.status='delivered' AND o.delivered_at >= CURRENT_DATE - INTERVAL '30 days' THEN o.courier_payout END), 0) as monthly_earned
      FROM couriers c
      LEFT JOIN orders o ON c.id = o.courier_id
      GROUP BY c.id 
      ORDER BY monthly_deliveries DESC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Couriers report error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

module.exports = router;
