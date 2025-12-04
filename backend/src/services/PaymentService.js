const { pool, withTransaction } = require('../config/database');
const WhatsAppService = require('./WhatsAppService');
const logger = require('../utils/logger');

class PaymentService {
  // Calculate courier earnings for a period
  async calculateCourierEarnings(courierId, periodStart, periodEnd) {
    const deliveriesQuery = `
      SELECT 
        d.id,
        d.delivery_number,
        d.courier_payment,
        d.express_fee,
        d.actual_distance,
        d.delivered_at,
        CASE WHEN d.express_fee > 0 THEN d.courier_payment * 0.1 ELSE 0 END as bonus
      FROM deliveries d
      WHERE d.courier_id = $1 
        AND d.status = 'delivered'
        AND d.delivered_at >= $2 
        AND d.delivered_at < $3
      ORDER BY d.delivered_at
    `;

    const result = await pool.query(deliveriesQuery, [courierId, periodStart, periodEnd]);
    const deliveries = result.rows;

    const summary = {
      deliveries: deliveries,
      totalDeliveries: deliveries.length,
      totalDistance: deliveries.reduce((sum, d) => sum + (parseFloat(d.actual_distance) || 0), 0),
      baseEarnings: deliveries.reduce((sum, d) => sum + parseFloat(d.courier_payment), 0),
      bonusEarnings: deliveries.reduce((sum, d) => sum + parseFloat(d.bonus || 0), 0),
      tips: 0, // Tips can be added manually
      deductions: 0,
      totalAmount: 0
    };

    summary.totalAmount = summary.baseEarnings + summary.bonusEarnings + summary.tips - summary.deductions;

    return summary;
  }

  // Create payment record for courier
  async createPaymentRecord(courierId, periodStart, periodEnd, adminId) {
    const earnings = await this.calculateCourierEarnings(courierId, periodStart, periodEnd);

    if (earnings.totalDeliveries === 0) {
      throw new Error('No deliveries found for this period');
    }

    return await withTransaction(async (client) => {
      // Create payment record
      const paymentResult = await client.query(
        `INSERT INTO courier_payments (
          courier_id, period_start, period_end,
          total_deliveries, total_distance,
          base_earnings, bonus_earnings, tips, deductions, total_amount,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        RETURNING *`,
        [
          courierId, periodStart, periodEnd,
          earnings.totalDeliveries, earnings.totalDistance,
          earnings.baseEarnings, earnings.bonusEarnings, earnings.tips, earnings.deductions,
          earnings.totalAmount
        ]
      );

      const payment = paymentResult.rows[0];

      // Link individual deliveries to payment
      for (const delivery of earnings.deliveries) {
        await client.query(
          `INSERT INTO payment_delivery_items (payment_id, delivery_id, amount, bonus)
           VALUES ($1, $2, $3, $4)`,
          [payment.id, delivery.id, delivery.courier_payment, delivery.bonus || 0]
        );
      }

      logger.info(`Payment record created for courier ${courierId}: ₪${earnings.totalAmount}`);
      return payment;
    });
  }

  // Get payment by ID
  async getPaymentById(paymentId) {
    const paymentResult = await pool.query(
      `SELECT cp.*, c.name as courier_name, c.phone as courier_phone, c.bank_account
       FROM courier_payments cp
       JOIN couriers c ON cp.courier_id = c.id
       WHERE cp.id = $1`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return null;
    }

    const payment = paymentResult.rows[0];

    // Get delivery items
    const itemsResult = await pool.query(
      `SELECT pdi.*, d.delivery_number, d.pickup_city, d.dropoff_city, d.delivered_at
       FROM payment_delivery_items pdi
       JOIN deliveries d ON pdi.delivery_id = d.id
       WHERE pdi.payment_id = $1
       ORDER BY d.delivered_at`,
      [paymentId]
    );

    payment.items = itemsResult.rows;
    return payment;
  }

  // Get all payments with filters
  async getPayments(filters = {}) {
    let query = `
      SELECT cp.*, c.name as courier_name, c.phone as courier_phone
      FROM courier_payments cp
      JOIN couriers c ON cp.courier_id = c.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (filters.courier_id) {
      query += ` AND cp.courier_id = $${paramIndex}`;
      values.push(filters.courier_id);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND cp.status = $${paramIndex}`;
      values.push(filters.status);
      paramIndex++;
    }

    if (filters.period_start) {
      query += ` AND cp.period_start >= $${paramIndex}`;
      values.push(filters.period_start);
      paramIndex++;
    }

    if (filters.period_end) {
      query += ` AND cp.period_end <= $${paramIndex}`;
      values.push(filters.period_end);
      paramIndex++;
    }

    query += ` ORDER BY cp.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      values.push(filters.limit);
      paramIndex++;
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Approve payment
  async approvePayment(paymentId, adminId) {
    const result = await pool.query(
      `UPDATE courier_payments 
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [adminId, paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error('Payment not found or already processed');
    }

    return result.rows[0];
  }

  // Mark payment as paid
  async markAsPaid(paymentId, adminId, paymentReference) {
    const result = await pool.query(
      `UPDATE courier_payments 
       SET status = 'paid', paid_at = NOW(), payment_reference = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'approved'
       RETURNING *`,
      [paymentReference, paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error('Payment not found or not approved');
    }

    const payment = result.rows[0];

    // Notify courier
    const courierResult = await pool.query('SELECT phone FROM couriers WHERE id = $1', [payment.courier_id]);
    if (courierResult.rows.length > 0) {
      await WhatsAppService.sendTextMessage(
        courierResult.rows[0].phone,
        `💰 תשלום בוצע!\n\nסכום: ₪${payment.total_amount}\nתקופה: ${payment.period_start} - ${payment.period_end}\nאסמכתא: ${paymentReference}`
      );
    }

    return payment;
  }

  // Update payment (add tips/deductions)
  async updatePayment(paymentId, data, adminId) {
    const allowedFields = ['tips', 'deductions', 'notes'];
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

    // Recalculate total
    updates.push(`total_amount = base_earnings + bonus_earnings + COALESCE($${paramIndex}, tips) - COALESCE($${paramIndex + 1}, deductions)`);
    values.push(data.tips, data.deductions);
    paramIndex += 2;

    updates.push('updated_at = NOW()');
    values.push(paymentId);

    const query = `
      UPDATE courier_payments 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND status = 'pending'
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Generate daily summary for all couriers
  async generateDailySummaries(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all couriers with deliveries today
    const couriersResult = await pool.query(
      `SELECT DISTINCT c.id, c.phone, c.name
       FROM couriers c
       JOIN deliveries d ON c.id = d.courier_id
       WHERE d.delivered_at >= $1 AND d.delivered_at <= $2`,
      [startOfDay, endOfDay]
    );

    const summaries = [];

    for (const courier of couriersResult.rows) {
      const earnings = await this.calculateCourierEarnings(courier.id, startOfDay, endOfDay);
      
      // Get monthly total
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthlyResult = await pool.query(
        `SELECT COALESCE(SUM(courier_payment), 0) as monthly_total
         FROM deliveries
         WHERE courier_id = $1 AND status = 'delivered'
         AND delivered_at >= $2 AND delivered_at <= $3`,
        [courier.id, monthStart, endOfDay]
      );

      // Get average rating
      const ratingResult = await pool.query(
        `SELECT COALESCE(AVG(customer_rating), 0) as avg_rating
         FROM deliveries
         WHERE courier_id = $1 AND customer_rating IS NOT NULL
         AND delivered_at >= $2 AND delivered_at <= $3`,
        [courier.id, startOfDay, endOfDay]
      );

      const summary = {
        courierId: courier.id,
        courierPhone: courier.phone,
        courierName: courier.name,
        date: date.toISOString().split('T')[0],
        completed: earnings.totalDeliveries,
        cancelled: 0, // Would need additional query
        avgTime: 0, // Would need additional calculation
        dailyEarnings: earnings.totalAmount,
        monthlyTotal: parseFloat(monthlyResult.rows[0].monthly_total),
        rating: parseFloat(ratingResult.rows[0].avg_rating).toFixed(1)
      };

      summaries.push(summary);

      // Send WhatsApp summary
      await WhatsAppService.sendDailySummary(courier.phone, summary);
    }

    return summaries;
  }

  // Get payment statistics
  async getPaymentStats(dateFrom, dateTo) {
    const query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'paid') as paid,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('pending', 'approved')), 0) as pending_amount
      FROM courier_payments
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const result = await pool.query(query, [dateFrom, dateTo]);
    return result.rows[0];
  }
}

module.exports = new PaymentService();
