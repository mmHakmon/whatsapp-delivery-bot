const express = require('express');
const { pool } = require('../config/database');
const { auth } = require('../middlewares/auth');
const DeliveryService = require('../services/DeliveryService');
const PaymentService = require('../services/PaymentService');

const router = express.Router();

// Get dashboard overview
router.get('/overview', auth, async (req, res, next) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthEnd = new Date();

    // Today's stats
    const todayStats = await DeliveryService.getDeliveryStats(startOfDay, endOfDay);

    // Monthly stats
    const monthlyStats = await DeliveryService.getDeliveryStats(monthStart, monthEnd);

    // Active deliveries count
    const activeResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'published') as published,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status IN ('picked_up', 'in_transit')) as in_transit
      FROM deliveries
      WHERE status NOT IN ('delivered', 'cancelled')
    `);

    // Active couriers
    const couriersResult = await pool.query(`
      SELECT 
        COUNT(*) as total_couriers,
        COUNT(*) FILTER (WHERE status = 'active') as active_couriers,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '24 hours') as online_today
      FROM couriers
    `);

    // Pending payments
    const paymentsResult = await pool.query(`
      SELECT 
        COUNT(*) as pending_payments,
        COALESCE(SUM(total_amount), 0) as pending_amount
      FROM courier_payments
      WHERE status IN ('pending', 'approved')
    `);

    res.json({
      success: true,
      overview: {
        today: {
          ...todayStats,
          active: activeResult.rows[0]
        },
        month: monthlyStats,
        couriers: couriersResult.rows[0],
        payments: paymentsResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get real-time active deliveries
router.get('/active-deliveries', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
             c.name as courier_name, 
             c.phone as courier_phone
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      WHERE d.status IN ('pending', 'published', 'assigned', 'picked_up', 'in_transit')
      ORDER BY 
        CASE d.priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'normal' THEN 3 
          ELSE 4 
        END,
        d.created_at DESC
    `);

    res.json({
      success: true,
      deliveries: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get chart data for deliveries over time
router.get('/charts/deliveries', auth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0) as revenue
      FROM deliveries
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get hourly distribution
router.get('/charts/hourly', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as total_deliveries,
        AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) 
          FILTER (WHERE status = 'delivered') as avg_delivery_time
      FROM deliveries
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get top performing couriers
router.get('/top-couriers', auth, async (req, res, next) => {
  try {
    const period = req.query.period || 'month'; // day, week, month
    let interval;
    
    switch (period) {
      case 'day':
        interval = '1 day';
        break;
      case 'week':
        interval = '7 days';
        break;
      default:
        interval = '30 days';
    }

    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.phone,
        COUNT(d.id) as deliveries_count,
        COALESCE(SUM(d.courier_payment), 0) as total_earnings,
        COALESCE(AVG(d.customer_rating), 0) as avg_rating,
        COALESCE(AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.assigned_at)) / 60), 0) as avg_delivery_time
      FROM couriers c
      LEFT JOIN deliveries d ON c.id = d.courier_id 
        AND d.status = 'delivered' 
        AND d.delivered_at >= NOW() - INTERVAL '${interval}'
      WHERE c.status = 'active'
      GROUP BY c.id
      HAVING COUNT(d.id) > 0
      ORDER BY deliveries_count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      couriers: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get city/zone statistics
router.get('/zones', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        pickup_city,
        dropoff_city,
        COUNT(*) as deliveries_count,
        COALESCE(AVG(total_price), 0) as avg_price,
        COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) 
          FILTER (WHERE status = 'delivered'), 0) as avg_delivery_time
      FROM deliveries
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY pickup_city, dropoff_city
      ORDER BY deliveries_count DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      zones: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get historical daily stats
router.get('/history', auth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await pool.query(`
      SELECT * FROM daily_stats
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get recent activity feed
router.get('/activity', auth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const result = await pool.query(`
      SELECT 
        dsh.id,
        dsh.status,
        dsh.changed_by_type,
        dsh.notes,
        dsh.created_at,
        d.delivery_number,
        d.pickup_city,
        d.dropoff_city,
        c.name as courier_name
      FROM delivery_status_history dsh
      JOIN deliveries d ON dsh.delivery_id = d.id
      LEFT JOIN couriers c ON d.courier_id = c.id
      ORDER BY dsh.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      activities: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
