const axios = require('axios');
const logger = require('../utils/logger');
const { pool } = require('../config/database');

class WhatsAppService {
  constructor() {
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
  }

  // Get headers for API calls
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Send a text message
  async sendTextMessage(to, text) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: { body: text }
        },
        { headers: this.getHeaders() }
      );
      
      await this.logMessage(response.data.messages[0].id, to, 'text', text, 'outbound');
      return response.data;
    } catch (error) {
      logger.error('Failed to send text message:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send interactive message with buttons (for delivery in group)
  async sendDeliveryToGroup(groupId, delivery) {
    try {
      const message = this.formatDeliveryMessage(delivery);
      
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: groupId,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: {
              type: 'text',
              text: `🚚 משלוח חדש #${delivery.delivery_number}`
            },
            body: {
              text: message
            },
            footer: {
              text: '⚡ ראשון שלוחץ - מקבל!'
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: `take_${delivery.id}`,
                    title: '✋ אני לוקח!'
                  }
                }
              ]
            }
          }
        },
        { headers: this.getHeaders() }
      );

      // Save message ID for tracking
      const messageId = response.data.messages[0].id;
      await pool.query(
        'UPDATE deliveries SET whatsapp_message_id = $1, whatsapp_group_id = $2, published_at = NOW() WHERE id = $3',
        [messageId, groupId, delivery.id]
      );

      await this.logMessage(messageId, groupId, 'interactive', message, 'outbound', delivery.id);
      
      logger.info(`Delivery ${delivery.delivery_number} published to group`);
      return response.data;
    } catch (error) {
      logger.error('Failed to send delivery to group:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send full delivery details to courier (private message)
  async sendDeliveryDetailsToCourier(courierPhone, delivery) {
    try {
      const detailsMessage = this.formatFullDeliveryDetails(delivery);
      
      // Send details message
      await this.sendTextMessage(courierPhone, detailsMessage);
      
      // Send interactive buttons for status updates
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: courierPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: 'עדכן סטטוס משלוח:'
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: `collected_${delivery.id}`,
                    title: '📦 נאסף'
                  }
                },
                {
                  type: 'reply',
                  reply: {
                    id: `delivered_${delivery.id}`,
                    title: '✅ נמסר'
                  }
                },
                {
                  type: 'reply',
                  reply: {
                    id: `problem_${delivery.id}`,
                    title: '❌ בעיה'
                  }
                }
              ]
            }
          }
        },
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to send details to courier:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send daily summary to courier
  async sendDailySummary(courierPhone, summary) {
    const message = `📊 *סיכום יומי - ${summary.date}*

✅ משלוחים שהושלמו: ${summary.completed}
❌ משלוחים שבוטלו: ${summary.cancelled}
⏱️ ממוצע זמן משלוח: ${summary.avgTime} דקות

💰 *הרווחת היום:* ₪${summary.dailyEarnings.toFixed(2)}
📈 סה"כ החודש: ₪${summary.monthlyTotal.toFixed(2)}

🏆 דירוג ממוצע: ${summary.rating}/5

תודה על העבודה המעולה! 🙏`;

    return this.sendTextMessage(courierPhone, message);
  }

  // Update message in group when delivery is taken
  async updateDeliveryTaken(messageId, delivery, courierName) {
    // WhatsApp doesn't support editing messages, so we send a new message
    const updateMessage = `✅ משלוח #${delivery.delivery_number} נלקח על ידי ${courierName}`;
    
    return this.sendTextMessage(delivery.whatsapp_group_id, updateMessage);
  }

  // Format delivery message for group
  formatDeliveryMessage(delivery) {
    let message = `📍 *איסוף:* ${delivery.pickup_city}\n`;
    message += `${delivery.pickup_address}\n\n`;
    message += `📍 *יעד:* ${delivery.dropoff_city}\n`;
    message += `${delivery.dropoff_address}\n\n`;
    
    if (delivery.package_description) {
      message += `📦 ${delivery.package_description}\n`;
    }
    
    message += `💰 תשלום: ₪${delivery.courier_payment}\n`;
    
    if (delivery.priority === 'urgent') {
      message += `\n🔴 *דחוף!*`;
    } else if (delivery.priority === 'high') {
      message += `\n🟡 *עדיפות גבוהה*`;
    }
    
    if (delivery.cash_on_delivery > 0) {
      message += `\n💵 גבייה: ₪${delivery.cash_on_delivery}`;
    }
    
    return message;
  }

  // Format full delivery details for courier
  formatFullDeliveryDetails(delivery) {
    let message = `✅ *המשלוח שלך!* #${delivery.delivery_number}\n\n`;
    
    message += `📞 *איסוף:*\n`;
    message += `${delivery.pickup_name}: ${delivery.pickup_phone}\n`;
    message += `📍 ${delivery.pickup_address}, ${delivery.pickup_city}\n`;
    if (delivery.pickup_notes) {
      message += `📝 ${delivery.pickup_notes}\n`;
    }
    message += `\n`;
    
    message += `📞 *מסירה:*\n`;
    message += `${delivery.dropoff_name}: ${delivery.dropoff_phone}\n`;
    message += `📍 ${delivery.dropoff_address}, ${delivery.dropoff_city}\n`;
    if (delivery.dropoff_notes) {
      message += `📝 ${delivery.dropoff_notes}\n`;
    }
    message += `\n`;
    
    if (delivery.package_description) {
      message += `📦 *חבילה:* ${delivery.package_description}\n`;
    }
    
    if (delivery.is_fragile) {
      message += `⚠️ *שבריר - טיפול זהיר!*\n`;
    }
    
    if (delivery.requires_signature) {
      message += `✍️ *נדרשת חתימה*\n`;
    }
    
    message += `\n💵 *גבייה מהלקוח:* ₪${delivery.cash_on_delivery || 0}\n`;
    message += `💰 *תשלום לך:* ₪${delivery.courier_payment}\n`;
    
    return message;
  }

  // Handle incoming webhook
  async handleWebhook(body) {
    try {
      if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
        return { success: true, action: 'no_messages' };
      }

      const message = body.entry[0].changes[0].value.messages[0];
      const senderPhone = message.from;
      const senderName = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || 'Unknown';

      logger.info(`Received message from ${senderPhone} (${senderName})`);

      // Handle button responses
      if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
        return this.handleButtonResponse(message, senderPhone, senderName);
      }

      // Handle regular text messages
      if (message.type === 'text') {
        return this.handleTextMessage(message, senderPhone, senderName);
      }

      return { success: true, action: 'unhandled_type' };
    } catch (error) {
      logger.error('Webhook handling error:', error);
      throw error;
    }
  }

  // Handle button responses
  async handleButtonResponse(message, senderPhone, senderName) {
    const buttonId = message.interactive.button_reply.id;
    const [action, deliveryId] = buttonId.split('_');

    logger.info(`Button response: ${action} for delivery ${deliveryId} from ${senderPhone}`);

    // Get courier by phone
    const courierResult = await pool.query(
      'SELECT * FROM couriers WHERE phone = $1 AND status = $2',
      [senderPhone, 'active']
    );

    if (courierResult.rows.length === 0) {
      await this.sendTextMessage(senderPhone, '❌ אינך רשום כשליח במערכת. אנא פנה למנהל.');
      return { success: false, reason: 'courier_not_found' };
    }

    const courier = courierResult.rows[0];

    switch (action) {
      case 'take':
        return this.handleTakeDelivery(deliveryId, courier, senderName);
      case 'collected':
        return this.handleDeliveryCollected(deliveryId, courier);
      case 'delivered':
        return this.handleDeliveryDelivered(deliveryId, courier);
      case 'problem':
        return this.handleDeliveryProblem(deliveryId, courier);
      default:
        logger.warn(`Unknown button action: ${action}`);
        return { success: false, reason: 'unknown_action' };
    }
  }

  // Handle "take delivery" button
  async handleTakeDelivery(deliveryId, courier, courierName) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if delivery is still available (with row lock)
      const deliveryResult = await client.query(
        'SELECT * FROM deliveries WHERE id = $1 AND status = $2 FOR UPDATE',
        [deliveryId, 'published']
      );

      if (deliveryResult.rows.length === 0) {
        await client.query('ROLLBACK');
        await this.sendTextMessage(courier.phone, '❌ המשלוח כבר נלקח על ידי שליח אחר');
        return { success: false, reason: 'delivery_already_taken' };
      }

      const delivery = deliveryResult.rows[0];

      // Assign delivery to courier
      await client.query(
        `UPDATE deliveries 
         SET status = 'assigned', 
             courier_id = $1, 
             assigned_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [courier.id, deliveryId]
      );

      // Log the button response
      await client.query(
        `INSERT INTO button_responses (message_id, delivery_id, courier_id, button_id, was_first)
         VALUES ($1, $2, $3, $4, true)`,
        [delivery.whatsapp_message_id, deliveryId, courier.id, `take_${deliveryId}`]
      );

      // Log status change
      await client.query(
        `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
         VALUES ($1, 'assigned', 'courier', $2)`,
        [deliveryId, courier.id]
      );

      await client.query('COMMIT');

      // Send full details to courier
      await this.sendDeliveryDetailsToCourier(courier.phone, {
        ...delivery,
        status: 'assigned'
      });

      // Update group message
      await this.updateDeliveryTaken(delivery.whatsapp_message_id, delivery, courierName);

      logger.info(`Delivery ${delivery.delivery_number} assigned to ${courierName}`);

      return { success: true, action: 'delivery_assigned', deliveryId, courierId: courier.id };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error handling take delivery:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Handle "collected" button
  async handleDeliveryCollected(deliveryId, courier) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET status = 'picked_up', 
           picked_up_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND courier_id = $2 AND status = 'assigned'
       RETURNING *`,
      [deliveryId, courier.id]
    );

    if (result.rows.length === 0) {
      await this.sendTextMessage(courier.phone, '❌ לא ניתן לעדכן סטטוס - בדוק שהמשלוח מוקצה אליך');
      return { success: false, reason: 'update_failed' };
    }

    await pool.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
       VALUES ($1, 'picked_up', 'courier', $2)`,
      [deliveryId, courier.id]
    );

    await this.sendTextMessage(courier.phone, '✅ סטטוס עודכן - החבילה נאספה. בדרך ליעד!');

    return { success: true, action: 'status_updated', status: 'picked_up' };
  }

  // Handle "delivered" button
  async handleDeliveryDelivered(deliveryId, courier) {
    const result = await pool.query(
      `UPDATE deliveries 
       SET status = 'delivered', 
           delivered_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND courier_id = $2 AND status IN ('assigned', 'picked_up', 'in_transit')
       RETURNING *`,
      [deliveryId, courier.id]
    );

    if (result.rows.length === 0) {
      await this.sendTextMessage(courier.phone, '❌ לא ניתן לעדכן סטטוס');
      return { success: false, reason: 'update_failed' };
    }

    const delivery = result.rows[0];

    // Update courier stats
    await pool.query(
      'UPDATE couriers SET total_deliveries = total_deliveries + 1, last_active = NOW() WHERE id = $1',
      [courier.id]
    );

    await pool.query(
      `INSERT INTO delivery_status_history (delivery_id, status, changed_by_type, changed_by_id)
       VALUES ($1, 'delivered', 'courier', $2)`,
      [deliveryId, courier.id]
    );

    await this.sendTextMessage(
      courier.phone, 
      `🎉 מעולה! משלוח #${delivery.delivery_number} הושלם!\n💰 ₪${delivery.courier_payment} נוספו לחשבון`
    );

    return { success: true, action: 'delivery_completed', deliveryId };
  }

  // Handle "problem" button
  async handleDeliveryProblem(deliveryId, courier) {
    await this.sendTextMessage(
      courier.phone,
      `נתקלת בבעיה? אנא תאר בהודעה מה קורה.\n\nאפשרויות:\n1️⃣ לקוח לא עונה\n2️⃣ כתובת שגויה\n3️⃣ חבילה פגומה\n4️⃣ אחר\n\nנציג יחזור אליך בהקדם.`
    );

    return { success: true, action: 'problem_reported' };
  }

  // Handle text messages
  async handleTextMessage(message, senderPhone, senderName) {
    const text = message.text.body;

    // Log the message
    await this.logMessage(message.id, senderPhone, 'text', text, 'inbound');

    // Auto-reply for common messages
    if (text.includes('שלום') || text.includes('היי')) {
      await this.sendTextMessage(
        senderPhone,
        `שלום ${senderName}! 👋\n\nאני בוט המשלוחים. המשלוחים הזמינים מופיעים בקבוצת השליחים.\nלחץ על "אני לוקח" כדי לקבל משלוח.`
      );
    }

    return { success: true, action: 'text_message_handled' };
  }

  // Log messages to database
  async logMessage(messageId, recipient, type, content, direction, deliveryId = null) {
    try {
      await pool.query(
        `INSERT INTO whatsapp_messages (message_id, group_id, sender_phone, message_type, content, direction, delivery_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [messageId, null, recipient, type, content, direction, deliveryId]
      );
    } catch (error) {
      logger.error('Failed to log message:', error);
    }
  }
}

module.exports = new WhatsAppService();
