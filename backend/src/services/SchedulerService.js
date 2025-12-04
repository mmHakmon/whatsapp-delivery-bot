const { pool } = require('../config/database');
const WhatsAppService = require('./WhatsAppService');
const PaymentService = require('./PaymentService');
const logger = require('../utils/logger');

class SchedulerService {
  // Auto-cancel deliveries that haven't been taken
  async autoCancelExpiredDeliveries() {
    try {
      // Get auto-cancel setting (default 30 minutes)
      const settingResult = await pool.query(
        "SELECT value FROM system_settings WHERE key = 'auto_cancel_minutes'"
      );
      const cancelMinutes = parseInt(settingResult.rows[0]?.value) || 30;

      const expiredResult = await pool.query(
        `SELECT * FROM deliveries 
         WHERE status = 'published' 
         AND published_at < NOW() - INTERVAL '${cancelMinutes} minutes'`
      );

      for (const delivery of expiredResult.rows) {
        await pool.query(
          `UPDATE deliveries SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [delivery.id]
        );

        await pool.query(
          `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, notes)
           VALUES ($1, 'cancelled', 'system', 'בוטל אוטומטית - לא נלקח')`,
          [delivery.id]
        );

        // Notify in group
        if (delivery.whatsapp_group_id) {
          await WhatsAppService.sendTextMessage(
            delivery.whatsapp_group_id,
            `⏰ משלוח #${delivery.delivery_number} בוטל - לא נלקח בזמן`
          );
        }

        logger.info(`Auto-cancelled delivery ${delivery.delivery_number}`);
      }

      return { cancelled: expiredResult.rows.length };
    } catch (error) {
      logger.error('Auto-cancel error:', error);
      throw error;
    }
  }

  // Send daily summary to all active couriers
  async sendDailySummaryToAllCouriers() {
    try {
      const today = new Date();
      return await PaymentService.generateDailySummaries(today);
    } catch (error) {
      logger.error('Daily summary error:', error);
      throw error;
    }
  }

  // Generate daily statistics
  async generateDailyStats() {
    try {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const statsQuery = `
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(*) FILTER (WHERE status = 'delivered') as completed_deliveries,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_deliveries,
          COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0) as total_revenue,
          COALESCE(SUM(courier_payment) FILTER (WHERE status = 'delivered'), 0) as total_courier_payments,
          COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60) 
            FILTER (WHERE status = 'delivered' AND delivered_at IS NOT NULL AND assigned_at IS NOT NULL), 0) as average_delivery_time,
          COALESCE(AVG(customer_rating) FILTER (WHERE customer_rating IS NOT NULL), 0) as average_rating
        FROM deliveries
        WHERE created_at >= $1 AND created_at <= $2
      `;

      const statsResult = await pool.query(statsQuery, [startOfDay, endOfDay]);
      const stats = statsResult.rows[0];

      // Count active couriers
      const couriersResult = await pool.query(
        `SELECT COUNT(DISTINCT courier_id) as active_couriers
         FROM deliveries
         WHERE assigned_at >= $1 AND assigned_at <= $2`,
        [startOfDay, endOfDay]
      );

      // Count new couriers
      const newCouriersResult = await pool.query(
        `SELECT COUNT(*) as new_couriers
         FROM couriers
         WHERE joined_at >= $1 AND joined_at <= $2`,
        [startOfDay, endOfDay]
      );

      // Insert or update daily stats
      await pool.query(
        `INSERT INTO daily_stats (
          date, total_deliveries, completed_deliveries, cancelled_deliveries,
          total_revenue, total_courier_payments, average_delivery_time, average_rating,
          active_couriers, new_couriers
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (date) DO UPDATE SET
          total_deliveries = EXCLUDED.total_deliveries,
          completed_deliveries = EXCLUDED.completed_deliveries,
          cancelled_deliveries = EXCLUDED.cancelled_deliveries,
          total_revenue = EXCLUDED.total_revenue,
          total_courier_payments = EXCLUDED.total_courier_payments,
          average_delivery_time = EXCLUDED.average_delivery_time,
          average_rating = EXCLUDED.average_rating,
          active_couriers = EXCLUDED.active_couriers,
          new_couriers = EXCLUDED.new_couriers`,
        [
          today.toISOString().split('T')[0],
          stats.total_deliveries,
          stats.completed_deliveries,
          stats.cancelled_deliveries,
          stats.total_revenue,
          stats.total_courier_payments,
          stats.average_delivery_time,
          stats.average_rating,
          couriersResult.rows[0].active_couriers,
          newCouriersResult.rows[0].new_couriers
        ]
      );

      logger.info('Daily stats generated successfully');
      return stats;
    } catch (error) {
      logger.error('Generate daily stats error:', error);
      throw error;
    }
  }

  // Send reminder for pending deliveries
  async sendPendingDeliveryReminders() {
    try {
      // Get deliveries published more than 10 minutes ago
      const pendingResult = await pool.query(
        `SELECT * FROM deliveries 
         WHERE status = 'published' 
         AND published_at < NOW() - INTERVAL '10 minutes'
         AND published_at > NOW() - INTERVAL '25 minutes'`
      );

      for (const delivery of pendingResult.rows) {
        if (delivery.whatsapp_group_id) {
          await WhatsAppService.sendTextMessage(
            delivery.whatsapp_group_id,
            `⏳ משלוח #${delivery.delivery_number} עדיין מחכה!\n💰 ₪${delivery.courier_payment}\n📍 ${delivery.pickup_city} ← ${delivery.dropoff_city}`
          );
        }
      }

      return { reminders_sent: pendingResult.rows.length };
    } catch (error) {
      logger.error('Send reminders error:', error);
      throw error;
    }
  }

  // Check and alert for stuck deliveries
  async checkStuckDeliveries() {
    try {
      // Deliveries assigned more than 2 hours ago but not picked up
      const stuckResult = await pool.query(
        `SELECT d.*, c.name as courier_name, c.phone as courier_phone
         FROM deliveries d
         JOIN couriers c ON d.courier_id = c.id
         WHERE d.status = 'assigned' 
         AND d.assigned_at < NOW() - INTERVAL '2 hours'`
      );

      for (const delivery of stuckResult.rows) {
        // Notify admin (could send to admin group or specific number)
        logger.warn(`Stuck delivery: #${delivery.delivery_number} assigned to ${delivery.courier_name}`);
        
        // Remind courier
        await WhatsAppService.sendTextMessage(
          delivery.courier_phone,
          `⚠️ תזכורת: משלוח #${delivery.delivery_number} ממתין לאיסוף!\nאם יש בעיה, אנא דווח.`
        );
      }

      return { stuck_count: stuckResult.rows.length };
    } catch (error) {
      logger.error('Check stuck deliveries error:', error);
      throw error;
    }
  }
}

module.exports = new SchedulerService();
