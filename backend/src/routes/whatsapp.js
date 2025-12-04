const express = require('express');
const WhatsAppService = require('../services/WhatsAppService');
const { auth } = require('../middlewares/auth');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// WhatsApp webhook - receive messages
router.post('/webhook', async (req, res, next) => {
  try {
    // Acknowledge receipt immediately
    res.sendStatus(200);

    // Process webhook asynchronously
    const result = await WhatsAppService.handleWebhook(req.body);
    logger.info('Webhook processed:', result);
  } catch (error) {
    logger.error('Webhook error:', error);
    // Still send 200 to prevent retry storm
  }
});

// Get WhatsApp groups
router.get('/groups', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM whatsapp_groups WHERE is_active = true ORDER BY name'
    );

    res.json({
      success: true,
      groups: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Add/update WhatsApp group
router.post('/groups', auth, async (req, res, next) => {
  try {
    const { group_id, name, type } = req.body;

    const result = await pool.query(
      `INSERT INTO whatsapp_groups (group_id, name, type)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id) DO UPDATE SET name = $2, type = $3, updated_at = NOW()
       RETURNING *`,
      [group_id, name, type || 'couriers']
    );

    res.json({
      success: true,
      group: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Send test message
router.post('/test-message', auth, async (req, res, next) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      throw new Error('נדרש מספר טלפון והודעה');
    }

    const result = await WhatsAppService.sendTextMessage(phone, message);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    next(error);
  }
});

// Get message history
router.get('/messages', auth, async (req, res, next) => {
  try {
    let query = `
      SELECT wm.*, d.delivery_number
      FROM whatsapp_messages wm
      LEFT JOIN deliveries d ON wm.delivery_id = d.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (req.query.delivery_id) {
      query += ` AND wm.delivery_id = $${paramIndex}`;
      values.push(req.query.delivery_id);
      paramIndex++;
    }

    if (req.query.phone) {
      query += ` AND wm.sender_phone = $${paramIndex}`;
      values.push(req.query.phone);
      paramIndex++;
    }

    if (req.query.direction) {
      query += ` AND wm.direction = $${paramIndex}`;
      values.push(req.query.direction);
      paramIndex++;
    }

    query += ` ORDER BY wm.created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      count: result.rows.length,
      messages: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get message templates
router.get('/templates', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM message_templates WHERE is_active = true ORDER BY name'
    );

    res.json({
      success: true,
      templates: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Update message template
router.put('/templates/:id', auth, async (req, res, next) => {
  try {
    const { name, content, variables } = req.body;

    const result = await pool.query(
      `UPDATE message_templates 
       SET name = COALESCE($1, name), 
           content = COALESCE($2, content), 
           variables = COALESCE($3, variables),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, content, variables, req.params.id]
    );

    if (result.rows.length === 0) {
      throw new Error('תבנית לא נמצאה');
    }

    res.json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Get button response statistics
router.get('/button-stats', auth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        button_id,
        COUNT(*) as total_responses,
        COUNT(*) FILTER (WHERE was_first = true) as successful_takes,
        AVG(EXTRACT(EPOCH FROM (response_time - (
          SELECT published_at FROM deliveries WHERE id = button_responses.delivery_id
        )))) as avg_response_time_seconds
      FROM button_responses
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY button_id
    `);

    res.json({
      success: true,
      stats: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
