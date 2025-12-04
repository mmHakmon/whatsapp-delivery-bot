const express = require('express');
const PaymentService = require('../services/PaymentService');
const { auth, superAdmin } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');

const router = express.Router();

// Get all payments
router.get('/', auth, async (req, res, next) => {
  try {
    const filters = {
      courier_id: req.query.courier_id,
      status: req.query.status,
      period_start: req.query.period_start,
      period_end: req.query.period_end,
      limit: parseInt(req.query.limit) || 50
    };

    const payments = await PaymentService.getPayments(filters);

    res.json({
      success: true,
      count: payments.length,
      payments
    });
  } catch (error) {
    next(error);
  }
});

// Get payment statistics
router.get('/stats', auth, async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from || new Date(new Date().setMonth(new Date().getMonth() - 1));
    const dateTo = req.query.date_to || new Date();

    const stats = await PaymentService.getPaymentStats(dateFrom, dateTo);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
});

// Get single payment with details
router.get('/:id', auth, async (req, res, next) => {
  try {
    const payment = await PaymentService.getPaymentById(req.params.id);

    if (!payment) {
      throw new AppError('תשלום לא נמצא', 404);
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
});

// Calculate earnings for a courier (preview)
router.get('/calculate/:courierId', auth, async (req, res, next) => {
  try {
    const periodStart = req.query.period_start || new Date(new Date().setDate(1));
    const periodEnd = req.query.period_end || new Date();

    const earnings = await PaymentService.calculateCourierEarnings(
      req.params.courierId,
      periodStart,
      periodEnd
    );

    res.json({
      success: true,
      period: { start: periodStart, end: periodEnd },
      earnings
    });
  } catch (error) {
    next(error);
  }
});

// Create payment record
router.post('/', auth, async (req, res, next) => {
  try {
    const { courier_id, period_start, period_end } = req.body;

    if (!courier_id || !period_start || !period_end) {
      throw new AppError('נדרש מזהה שליח ותקופת חישוב', 400);
    }

    const payment = await PaymentService.createPaymentRecord(
      courier_id,
      period_start,
      period_end,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
});

// Bulk create payments for all couriers
router.post('/bulk-create', auth, async (req, res, next) => {
  try {
    const { period_start, period_end, courier_ids } = req.body;

    if (!period_start || !period_end) {
      throw new AppError('נדרשת תקופת חישוב', 400);
    }

    const { pool } = require('../config/database');
    
    // Get couriers
    let couriersQuery = 'SELECT id FROM couriers WHERE status = $1';
    const values = ['active'];
    
    if (courier_ids && courier_ids.length > 0) {
      couriersQuery += ` AND id = ANY($2)`;
      values.push(courier_ids);
    }

    const couriersResult = await pool.query(couriersQuery, values);

    const results = [];
    const errors = [];

    for (const courier of couriersResult.rows) {
      try {
        const payment = await PaymentService.createPaymentRecord(
          courier.id,
          period_start,
          period_end,
          req.admin.id
        );
        results.push(payment);
      } catch (err) {
        errors.push({ courier_id: courier.id, error: err.message });
      }
    }

    res.json({
      success: true,
      created: results.length,
      failed: errors.length,
      payments: results,
      errors
    });
  } catch (error) {
    next(error);
  }
});

// Update payment (tips/deductions)
router.put('/:id', auth, async (req, res, next) => {
  try {
    const payment = await PaymentService.updatePayment(
      req.params.id,
      req.body,
      req.admin.id
    );

    if (!payment) {
      throw new AppError('לא ניתן לעדכן תשלום שאושר', 400);
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
});

// Approve payment
router.post('/:id/approve', auth, async (req, res, next) => {
  try {
    const payment = await PaymentService.approvePayment(req.params.id, req.admin.id);

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
});

// Mark as paid
router.post('/:id/mark-paid', auth, async (req, res, next) => {
  try {
    const { payment_reference } = req.body;

    if (!payment_reference) {
      throw new AppError('נדרשת אסמכתא לתשלום', 400);
    }

    const payment = await PaymentService.markAsPaid(
      req.params.id,
      req.admin.id,
      payment_reference
    );

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    next(error);
  }
});

// Bulk approve
router.post('/bulk-approve', auth, async (req, res, next) => {
  try {
    const { payment_ids } = req.body;

    if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
      throw new AppError('נדרש מערך של מזהי תשלומים', 400);
    }

    const results = [];
    const errors = [];

    for (const id of payment_ids) {
      try {
        const payment = await PaymentService.approvePayment(id, req.admin.id);
        results.push(payment);
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    res.json({
      success: true,
      approved: results.length,
      failed: errors.length,
      payments: results,
      errors
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
