const { pool, withTransaction } = require('../config/database');
const WhatsAppService = require('./WhatsAppService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class DeliveryService {
  // Generate unique delivery number
  generateDeliveryNumber() {
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `DL${dateStr}${random}`;
  }

  // Create new delivery
  async createDelivery(data, adminId) {
    const deliveryNumber = this.generateDeliveryNumber();
    
    const query = `
      INSERT INTO deliveries (
        delivery_number,
        pickup_name, pickup_phone, pickup_address, pickup_city, pickup_notes,
        pickup_time_from, pickup_time_to,
        dropoff_name, dropoff_phone, dropoff_address, dropoff_city, dropoff_notes,
        dropoff_time_from, dropoff_time_to,
        package_description, package_size, package_weight,
        is_fragile, requires_signature, cash_on_delivery,
        base_price, express_fee, distance_fee, total_price, courier_payment,
        priority, created_by, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 'pending'
      ) RETURNING *
    `;

    const values = [
      deliveryNumber,
      data.pickup_name, data.pickup_phone, data.pickup_address, data.pickup_city, data.pickup_notes,
      data.pickup_time_from, data.pickup_time_to,
      data.dropoff_name, data.dropoff_phone, data.dropoff_address, data.dropoff_city, data.dropoff_notes,
      data.dropoff_time_from, data.dropoff_time_to,
      data.package_description, data.package_size || 'medium', data.package_weight,
      data.is_fragile || false, data.requires_signature || false, data.cash_on_delivery || 0,
      data.base_price, data.express_fee || 0, data.distance_fee || 0,
      data.total_price, data.courier_payment,
      data.priority || 'normal', adminId
    ];

    const result = await pool.query(query, values);
    const delivery = result.rows[0];

    // Log status
    await pool.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
       VALUES ($1, 'pending', 'admin', $2)`,
      [delivery.id, adminId]
    );

    logger.info(`Delivery ${deliveryNumber} created by admin ${adminId}`);
    return delivery;
  }

  // Publish delivery to WhatsApp group
  async publishDelivery(deliveryId, groupId = null) {
    const result = await pool.query(
      'SELECT * FROM deliveries WHERE id = $1',
      [deliveryId]
    );

    if (result.rows.length === 0) {
      throw new Error('Delivery not found');
    }

    const delivery = result.rows[0];

    if (delivery.status !== 'pending') {
      throw new Error('Delivery is not in pending status');
    }

    const targetGroupId = groupId || process.env.WHATSAPP_COURIERS_GROUP_ID;

    // Send to WhatsApp group
    await WhatsAppService.sendDeliveryToGroup(targetGroupId, delivery);

    // Update status
    await pool.query(
      `UPDATE deliveries SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [deliveryId]
    );

    await pool.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, notes)
       VALUES ($1, 'published', 'system', 'פורסם בקבוצת שליחים')`,
      [deliveryId]
    );

    logger.info(`Delivery ${delivery.delivery_number} published to group`);
    return { success: true, deliveryNumber: delivery.delivery_number };
  }

  // Get delivery by ID
  async getDeliveryById(deliveryId) {
    const result = await pool.query(
      `SELECT d.*, 
              c.name as courier_name, c.phone as courier_phone,
              a.name as created_by_name
       FROM deliveries d
       LEFT JOIN couriers c ON d.courier_id = c.id
       LEFT JOIN admins a ON d.created_by = a.id
       WHERE d.id = $1`,
      [deliveryId]
    );
    return result.rows[0];
  }

  // Get deliveries with filters
  async getDeliveries(filters = {}) {
    let query = `
      SELECT d.*, 
             c.name as courier_name, c.phone as courier_phone,
             a.name as created_by_name
      FROM deliveries d
      LEFT JOIN couriers c ON d.courier_id = c.id
      LEFT JOIN admins a ON d.created_by = a.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (filters.status) {
      query += ` AND d.status = $${paramIndex}`;
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.courier_id) {
      query += ` AND d.courier_id = $${paramIndex}`;
      values.push(filters.courier_id);
      paramIndex++;
    }

    if (filters.date_from) {
      query += ` AND d.created_at >= $${paramIndex}`;
      values.push(filters.date_from);
      paramIndex++;
    }

    if (filters.date_to) {
      query += ` AND d.created_at <= $${paramIndex}`;
      values.push(filters.date_to);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (d.delivery_number ILIKE $${paramIndex} OR d.pickup_city ILIKE $${paramIndex} OR d.dropoff_city ILIKE $${paramIndex})`;
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY d.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      values.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      values.push(filters.offset);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Update delivery
  async updateDelivery(deliveryId, data, adminId) {
    const allowedFields = [
      'pickup_name', 'pickup_phone', 'pickup_address', 'pickup_city', 'pickup_notes',
      'dropoff_name', 'dropoff_phone', 'dropoff_address', 'dropoff_city', 'dropoff_notes',
      'package_description', 'package_size', 'package_weight',
      'is_fragile', 'requires_signature', 'cash_on_delivery',
      'base_price', 'express_fee', 'distance_fee', 'total_price', 'courier_payment',
      'priority'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(data[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('updated_at = NOW()');
    values.push(deliveryId);

    const query = `
      UPDATE deliveries 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Cancel delivery
  async cancelDelivery(deliveryId, adminId, reason) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('delivered', 'cancelled')
       RETURNING *`,
      [deliveryId]
    );

    if (result.rows.length === 0) {
      throw new Error('Cannot cancel delivery');
    }

    const delivery = result.rows[0];

    await pool.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id, notes)
       VALUES ($1, 'cancelled', 'admin', $2, $3)`,
      [deliveryId, adminId, reason]
    );

    // Notify courier if assigned
    if (delivery.courier_id) {
      const courierResult = await pool.query('SELECT phone FROM couriers WHERE id = $1', [delivery.courier_id]);
      if (courierResult.rows.length > 0) {
        await WhatsAppService.sendTextMessage(
          courierResult.rows[0].phone,
          `❌ משלוח #${delivery.delivery_number} בוטל.\nסיבה: ${reason || 'לא צוינה'}`
        );
      }
    }

    return delivery;
  }

  // Get delivery statistics
  async getDeliveryStats(dateFrom, dateTo) {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status IN ('pending', 'published')) as pending,
        COUNT(*) FILTER (WHERE status IN ('assigned', 'picked_up', 'in_transit')) as in_progress,
        COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0) as total_revenue,
        COALESCE(SUM(courier_payment) FILTER (WHERE status = 'delivered'), 0) as total_courier_payments,
        COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) FILTER (WHERE status = 'delivered'), 0) as avg_delivery_time
      FROM deliveries
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const result = await pool.query(query, [dateFrom, dateTo]);
    return result.rows[0];
  }

  // Get courier earnings
  async getCourierEarnings(courierId, dateFrom, dateTo) {
    const query = `
      SELECT 
        COUNT(*) as total_deliveries,
        COALESCE(SUM(courier_payment), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN express_fee > 0 THEN courier_payment * 0.1 ELSE 0 END), 0) as bonus_earnings,
        COALESCE(SUM(actual_distance), 0) as total_distance
      FROM deliveries
      WHERE courier_id = $1 
        AND status = 'delivered'
        AND delivered_at >= $2 
        AND delivered_at <= $3
    `;

    const result = await pool.query(query, [courierId, dateFrom, dateTo]);
    return result.rows[0];
  }

  // Get delivery history for a courier
  async getCourierDeliveryHistory(courierId, limit = 50) {
    const query = `
      SELECT id, delivery_number, pickup_city, dropoff_city, 
             courier_payment, status, assigned_at, delivered_at
      FROM deliveries
      WHERE courier_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [courierId, limit]);
    return result.rows;
  }
}

module.exports = new DeliveryService();
