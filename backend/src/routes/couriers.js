const express = require('express');
const { pool } = require('../config/database');
const DeliveryService = require('../services/DeliveryService');
const { auth } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const Joi = require('joi');

const router = express.Router();

// Validation schema
const courierSchema = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().required(),
  email: Joi.string().email().allow('', null),
  id_number: Joi.string().allow('', null),
  vehicle_type: Joi.string().valid('motorcycle', 'car', 'bicycle', 'scooter', 'on_foot'),
  vehicle_number: Joi.string().allow('', null),
  bank_account: Joi.object({
    bank_name: Joi.string(),
    branch: Joi.string(),
    account_number: Joi.string(),
    owner_name: Joi.string()
  }).allow(null),
  base_rate: Joi.number().min(0),
  bonus_rate: Joi.number().min(0),
  notes: Joi.string().allow('', null)
});

// Get all couriers
router.get('/', auth, async (req, res, next) => {
  try {
    let query = `
      SELECT c.*, 
             COUNT(d.id) FILTER (WHERE d.status = 'delivered') as completed_deliveries,
             COALESCE(AVG(d.customer_rating), 0) as avg_rating
      FROM couriers c
      LEFT JOIN deliveries d ON c.id = d.courier_id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (req.query.status) {
      query += ` AND c.status = $${paramIndex}`;
      values.push(req.query.status);
      paramIndex++;
    }

    if (req.query.search) {
      query += ` AND (c.name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex})`;
      values.push(`%${req.query.search}%`);
      paramIndex++;
    }

    query += ` GROUP BY c.id ORDER BY c.name`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      count: result.rows.length,
      couriers: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get single courier with stats
router.get('/:id', auth, async (req, res, next) => {
  try {
    const courierResult = await pool.query(
      `SELECT * FROM couriers WHERE id = $1`,
      [req.params.id]
    );

    if (courierResult.rows.length === 0) {
      throw new AppError('שליח לא נמצא', 404);
    }

    const courier = courierResult.rows[0];

    // Get this month's stats
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthEnd = new Date();

    const stats = await DeliveryService.getCourierEarnings(courier.id, monthStart, monthEnd);

    // Get recent deliveries
    const recentDeliveries = await DeliveryService.getCourierDeliveryHistory(courier.id, 10);

    res.json({
      success: true,
      courier: {
        ...courier,
        monthly_stats: stats,
        recent_deliveries: recentDeliveries
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new courier
router.post('/', auth, async (req, res, next) => {
  try {
    const { error } = courierSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const result = await pool.query(
      `INSERT INTO couriers (name, phone, email, id_number, vehicle_type, vehicle_number, bank_account, base_rate, bonus_rate, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.body.name,
        req.body.phone,
        req.body.email,
        req.body.id_number,
        req.body.vehicle_type,
        req.body.vehicle_number,
        JSON.stringify(req.body.bank_account),
        req.body.base_rate || 15,
        req.body.bonus_rate || 5,
        req.body.notes
      ]
    );

    res.status(201).json({
      success: true,
      courier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update courier
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { error } = courierSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const result = await pool.query(
      `UPDATE couriers 
       SET name = $1, phone = $2, email = $3, id_number = $4, 
           vehicle_type = $5, vehicle_number = $6, bank_account = $7,
           base_rate = $8, bonus_rate = $9, notes = $10, updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        req.body.name,
        req.body.phone,
        req.body.email,
        req.body.id_number,
        req.body.vehicle_type,
        req.body.vehicle_number,
        JSON.stringify(req.body.bank_account),
        req.body.base_rate,
        req.body.bonus_rate,
        req.body.notes,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      throw new AppError('שליח לא נמצא', 404);
    }

    res.json({
      success: true,
      courier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update courier status
router.patch('/:id/status', auth, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      throw new AppError('סטטוס לא תקין', 400);
    }

    const result = await pool.query(
      `UPDATE couriers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('שליח לא נמצא', 404);
    }

    res.json({
      success: true,
      courier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Get courier earnings
router.get('/:id/earnings', auth, async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from ? new Date(req.query.date_from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = req.query.date_to ? new Date(req.query.date_to) : new Date();

    const earnings = await DeliveryService.getCourierEarnings(req.params.id, dateFrom, dateTo);

    res.json({
      success: true,
      period: { from: dateFrom, to: dateTo },
      earnings
    });
  } catch (error) {
    next(error);
  }
});

// Get courier delivery history
router.get('/:id/deliveries', auth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const deliveries = await DeliveryService.getCourierDeliveryHistory(req.params.id, limit);

    res.json({
      success: true,
      count: deliveries.length,
      deliveries
    });
  } catch (error) {
    next(error);
  }
});

// Leaderboard
router.get('/stats/leaderboard', auth, async (req, res, next) => {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const result = await pool.query(
      `SELECT c.id, c.name, c.phone,
              COUNT(d.id) as deliveries_count,
              COALESCE(SUM(d.courier_payment), 0) as total_earnings,
              COALESCE(AVG(d.customer_rating), 0) as avg_rating
       FROM couriers c
       LEFT JOIN deliveries d ON c.id = d.courier_id 
         AND d.status = 'delivered' 
         AND d.delivered_at >= $1
       WHERE c.status = 'active'
       GROUP BY c.id
       ORDER BY deliveries_count DESC
       LIMIT 10`,
      [monthStart]
    );

    res.json({
      success: true,
      leaderboard: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
