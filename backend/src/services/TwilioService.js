// TwilioService.js - WhatsApp messaging via Twilio
const twilio = require('twilio');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

class TwilioService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
  }

  // Send a simple text message
  async sendMessage(to, message) {
    try {
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber
      });

      logger.info(`Message sent to ${to}: ${result.sid}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send message to ${to}:`, error.message);
      throw error;
    }
  }

  // Send message with quick reply buttons (Twilio style)
  async sendMessageWithButtons(to, message, buttons) {
    try {
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      // Twilio Sandbox doesn't support interactive buttons directly
      // We'll simulate with numbered options
      let buttonText = '\n\n';
      buttons.forEach((btn, index) => {
        buttonText += `${index + 1}. ${btn.title}\n`;
      });
      
      const fullMessage = message + buttonText + '\nהשב עם המספר המתאים';

      const result = await this.client.messages.create({
        body: fullMessage,
        from: this.fromNumber,
        to: toNumber
      });

      logger.info(`Message with buttons sent to ${to}: ${result.sid}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send message with buttons to ${to}:`, error.message);
      throw error;
    }
  }

  // Publish delivery to courier group (send to all active couriers)
  async publishDeliveryToCouriers(delivery) {
    try {
      // Get all active couriers
      const couriersResult = await pool.query(
        "SELECT phone FROM couriers WHERE status = 'active'"
      );

      const message = this.formatDeliveryMessage(delivery);
      
      const buttons = [
        { id: 'take_delivery', title: '✅ אני לוקח' }
      ];

      // Send to all couriers
      const sendPromises = couriersResult.rows.map(courier => 
        this.sendMessageWithButtons(courier.phone, message, buttons)
          .catch(err => logger.error(`Failed to send to ${courier.phone}:`, err.message))
      );

      await Promise.all(sendPromises);
      
      logger.info(`Delivery ${delivery.delivery_number} published to ${couriersResult.rows.length} couriers`);
      return { sent: couriersResult.rows.length };
    } catch (error) {
      logger.error('Failed to publish delivery:', error.message);
      throw error;
    }
  }

  // Send full delivery details to assigned courier
  async sendDeliveryDetails(courier, delivery) {
    try {
      const message = `✅ *המשלוח שלך!* #${delivery.delivery_number}

📞 *איסוף:*
${delivery.pickup_name}: ${delivery.pickup_phone}
📍 ${delivery.pickup_address}, ${delivery.pickup_city}
${delivery.pickup_notes ? `📝 ${delivery.pickup_notes}` : ''}

📞 *מסירה:*
${delivery.dropoff_name}: ${delivery.dropoff_phone}
📍 ${delivery.dropoff_address}, ${delivery.dropoff_city}
${delivery.dropoff_notes ? `📝 ${delivery.dropoff_notes}` : ''}

📦 ${delivery.package_description || 'חבילה רגילה'}
💵 גבייה: ₪${delivery.cash_on_delivery || 0}
💰 תשלום לך: ₪${delivery.courier_payment}

---
השב:
1. נאספה ✅
2. נמסרה 🏁
3. בעיה ❌`;

      await this.sendMessage(courier.phone, message);
      logger.info(`Delivery details sent to courier ${courier.name}`);
    } catch (error) {
      logger.error('Failed to send delivery details:', error.message);
      throw error;
    }
  }

  // Format delivery message for publishing
  formatDeliveryMessage(delivery) {
    return `🚚 *משלוח חדש!* #${delivery.delivery_number}

📍 *איסוף:* ${delivery.pickup_city}
${delivery.pickup_address}

📍 *יעד:* ${delivery.dropoff_city}
${delivery.dropoff_address}

📦 ${delivery.package_description || 'חבילה רגילה'}
💰 תשלום: ₪${delivery.courier_payment}
${delivery.priority === 'urgent' ? '🔴 דחוף!' : ''}`;
  }

  // Handle incoming message from courier
  async handleIncomingMessage(from, body, messageSid) {
    try {
      const phone = from.replace('whatsapp:', '');
      const normalizedBody = body.trim().toLowerCase();

      // Find courier by phone
      const courierResult = await pool.query(
        'SELECT * FROM couriers WHERE phone = $1 OR phone = $2',
        [phone, phone.replace('+972', '0')]
      );

      if (courierResult.rows.length === 0) {
        await this.sendMessage(from, 'מספר לא מזוהה במערכת. פנה למנהל.');
        return;
      }

      const courier = courierResult.rows[0];

      // Update last active
      await pool.query(
        'UPDATE couriers SET last_active = NOW() WHERE id = $1',
        [courier.id]
      );

      // Check if it's a number response (for buttons)
      if (normalizedBody === '1' || normalizedBody === 'אני לוקח' || normalizedBody === '✅') {
        await this.handleTakeDelivery(courier, from);
      } else if (normalizedBody === '1' || normalizedBody === 'נאספה') {
        await this.handleStatusUpdate(courier, 'picked_up', from);
      } else if (normalizedBody === '2' || normalizedBody === 'נמסרה') {
        await this.handleStatusUpdate(courier, 'delivered', from);
      } else if (normalizedBody === '3' || normalizedBody === 'בעיה') {
        await this.handleProblem(courier, from);
      } else {
        // General message - maybe looking for help
        await this.sendMessage(from, `שלום ${courier.name}! 👋

כדי לקחת משלוח - השב "1" על הודעת משלוח חדש
כדי לעדכן נאספה - השב "1"
כדי לעדכן נמסרה - השב "2"
לדווח על בעיה - השב "3"`);
      }

      // Log the message
      await pool.query(
        `INSERT INTO whatsapp_messages (message_id, sender_phone, message_type, content, direction)
         VALUES ($1, $2, 'text', $3, 'inbound')`,
        [messageSid, phone, body]
      );

    } catch (error) {
      logger.error('Error handling incoming message:', error.message);
    }
  }

  // Handle courier taking a delivery
  async handleTakeDelivery(courier, replyTo) {
    try {
      // Find the latest published delivery that's not taken
      const deliveryResult = await pool.query(
        `SELECT * FROM deliveries 
         WHERE status = 'published' 
         ORDER BY published_at DESC 
         LIMIT 1
         FOR UPDATE SKIP LOCKED`
      );

      if (deliveryResult.rows.length === 0) {
        await this.sendMessage(replyTo, 'אין משלוחים זמינים כרגע 😕');
        return;
      }

      const delivery = deliveryResult.rows[0];

      // Assign to courier
      await pool.query(
        `UPDATE deliveries 
         SET courier_id = $1, status = 'assigned', assigned_at = NOW() 
         WHERE id = $2`,
        [courier.id, delivery.id]
      );

      // Log status change
      await pool.query(
        `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
         VALUES ($1, 'assigned', 'courier', $2)`,
        [delivery.id, courier.id]
      );

      // Send confirmation with full details
      await this.sendDeliveryDetails(courier, delivery);

      logger.info(`Delivery ${delivery.delivery_number} assigned to ${courier.name}`);
    } catch (error) {
      logger.error('Error handling take delivery:', error.message);
      await this.sendMessage(replyTo, 'שגיאה בלקיחת המשלוח. נסה שוב.');
    }
  }

  // Handle status updates
  async handleStatusUpdate(courier, newStatus, replyTo) {
    try {
      // Find courier's current delivery
      const deliveryResult = await pool.query(
        `SELECT * FROM deliveries 
         WHERE courier_id = $1 AND status IN ('assigned', 'picked_up')
         ORDER BY assigned_at DESC LIMIT 1`,
        [courier.id]
      );

      if (deliveryResult.rows.length === 0) {
        await this.sendMessage(replyTo, 'אין לך משלוח פעיל כרגע');
        return;
      }

      const delivery = deliveryResult.rows[0];
      const updateField = newStatus === 'picked_up' ? 'picked_up_at' : 'delivered_at';

      await pool.query(
        `UPDATE deliveries SET status = $1, ${updateField} = NOW() WHERE id = $2`,
        [newStatus, delivery.id]
      );

      await pool.query(
        `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
         VALUES ($1, $2, 'courier', $3)`,
        [delivery.id, newStatus, courier.id]
      );

      if (newStatus === 'picked_up') {
        await this.sendMessage(replyTo, `✅ משלוח #${delivery.delivery_number} סומן כנאסף!

כשתגיע ליעד, השב "2" לסמן כנמסר.`);
      } else {
        // Update courier stats
        await pool.query(
          'UPDATE couriers SET total_deliveries = total_deliveries + 1 WHERE id = $1',
          [courier.id]
        );

        await this.sendMessage(replyTo, `🎉 מעולה! משלוח #${delivery.delivery_number} הושלם!

תודה ${courier.name}! 💪`);
      }

      logger.info(`Delivery ${delivery.delivery_number} status updated to ${newStatus}`);
    } catch (error) {
      logger.error('Error updating status:', error.message);
      await this.sendMessage(replyTo, 'שגיאה בעדכון הסטטוס. נסה שוב.');
    }
  }

  // Handle problem report
  async handleProblem(courier, replyTo) {
    await this.sendMessage(replyTo, `😕 מצטער לשמוע שיש בעיה.

אנא תאר את הבעיה בהודעה הבאה ומנהל יחזור אליך בהקדם.

או התקשר למשרד: 03-1234567`);
  }
}

module.exports = new TwilioService();
