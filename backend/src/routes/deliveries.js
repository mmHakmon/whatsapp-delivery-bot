const express = require('express');
const DeliveryService = require('../services/DeliveryService');
const { auth } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const Joi = require('joi');

const router = express.Router();

// Validation schema for delivery
const deliverySchema = Joi.object({
  pickup_name: Joi.string().required(),
  pickup_phone: Joi.string().required(),
  pickup_address: Joi.string().required(),
  pickup_city: Joi.string().required(),
  pickup_notes: Joi.string().allow('', null),
  pickup_time_from: Joi.date().allow(null),
  pickup_time_to: Joi.date().allow(null),
  dropoff_name: Joi.string().required(),
  dropoff_phone: Joi.string().required(),
  dropoff_address: Joi.string().required(),
  dropoff_city: Joi.string().required(),
  dropoff_notes: Joi.string().allow('', null),
  dropoff_time_from: Joi.date().allow(null),
  dropoff_time_to: Joi.date().allow(null),
  package_description: Joi.string().allow('', null),
  package_size: Joi.string().valid('small', 'medium', 'large', 'xlarge'),
  package_weight: Joi.number().allow(null),
  is_fragile: Joi.boolean(),
  requires_signature: Joi.boolean(),
  cash_on_delivery: Joi.number().min(0),
  base_price: Joi.number().required().min(0),
  express_fee: Joi.number().min(0),
  distance_fee: Joi.number().min(0),
  total_price: Joi.number().required().min(0),
  courier_payment: Joi.number().required().min(0),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent')
});

// Get all deliveries
router.get('/', auth, async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      courier_id: req.query.courier_id,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const deliveries = await DeliveryService.getDeliveries(filters);

    res.json({
      success: true,
      count: deliveries.length,
      deliveries
    });
  } catch (error) {
    next(error);
  }
});

// Get delivery statistics
router.get('/stats', auth, async (req, res, next) => {
  try {
    const dateFrom = req.query.date_from || new Date(new Date().setHours(0, 0, 0, 0));
    const dateTo = req.query.date_to || new Date();

    const stats = await DeliveryService.getDeliveryStats(dateFrom, dateTo);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
});

// Get single delivery
router.get('/:id', auth, async (req, res, next) => {
  try {
    const delivery = await DeliveryService.getDeliveryById(req.params.id);

    if (!delivery) {
      throw new AppError('משלוח לא נמצא', 404);
    }

    res.json({
      success: true,
      delivery
    });
  } catch (error) {
    next(error);
  }
});

// Create new delivery
router.post('/', auth, async (req, res, next) => {
  try {
    const { error } = deliverySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const delivery = await DeliveryService.createDelivery(req.body, req.admin.id);

    // Emit real-time update
    req.app.get('io').to('admins').emit('delivery:created', delivery);

    res.status(201).json({
      success: true,
      delivery
    });
  } catch (error) {
    next(error);
  }
});

// Publish delivery to WhatsApp group
router.post('/:id/publish', auth, async (req, res, next) => {
  try {
    const result = await DeliveryService.publishDelivery(req.params.id, req.body.group_id);

    // Emit real-time update
    req.app.get('io').to('admins').emit('delivery:published', { id: req.params.id });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

// Update delivery
router.put('/:id', auth, async (req, res, next) => {
  try {
    const delivery = await DeliveryService.updateDelivery(req.params.id, req.body, req.admin.id);

    if (!delivery) {
      throw new AppError('משלוח לא נמצא או לא ניתן לעדכון', 404);
    }

    req.app.get('io').to('admins').emit('delivery:updated', delivery);

    res.json({
      success: true,
      delivery
    });
  } catch (error) {
    next(error);
  }
});

// Cancel delivery
router.post('/:id/cancel', auth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const delivery = await DeliveryService.cancelDelivery(req.params.id, req.admin.id, reason);

    req.app.get('io').to('admins').emit('delivery:cancelled', { id: req.params.id });

    res.json({
      success: true,
      delivery
    });
  } catch (error) {
    next(error);
  }
});

// Bulk create deliveries
router.post('/bulk', auth, async (req, res, next) => {
  try {
    const { deliveries } = req.body;

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      throw new AppError('נדרש מערך של משלוחים', 400);
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < deliveries.length; i++) {
      try {
        const { error } = deliverySchema.validate(deliveries[i]);
        if (error) {
          errors.push({ index: i, error: error.details[0].message });
          continue;
        }

        const delivery = await DeliveryService.createDelivery(deliveries[i], req.admin.id);
        results.push(delivery);
      } catch (err) {
        errors.push({ index: i, error: err.message });
      }
    }

    res.json({
      success: true,
      created: results.length,
      failed: errors.length,
      deliveries: results,
      errors
    });
  } catch (error) {
    next(error);
  }
});

// Bulk publish deliveries
router.post('/bulk-publish', auth, async (req, res, next) => {
  try {
    const { delivery_ids, group_id } = req.body;

    if (!Array.isArray(delivery_ids) || delivery_ids.length === 0) {
      throw new AppError('נדרש מערך של מזהי משלוחים', 400);
    }

    const results = [];
    const errors = [];

    for (const id of delivery_ids) {
      try {
        const result = await DeliveryService.publishDelivery(id, group_id);
        results.push(result);
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    res.json({
      success: true,
      published: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
