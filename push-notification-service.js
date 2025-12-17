/**
 * M.M.H Delivery - Push Notifications Service
 * שירות התראות Push עבור לקוחות, שליחים ונציגים
 */

const axios = require('axios');

class PushNotificationService {
  constructor(pool, whapiConfig) {
    this.pool = pool;
    this.whapi = whapiConfig;
  }

  /**
   * שליחת התראה ללקוח על סטטוס משלוח
   */
  async notifyCustomer(orderId, notificationType, customMessage = null) {
    try {
      const order = await this.getOrderDetails(orderId);
      if (!order) return false;

      const notification = this.buildCustomerNotification(order, notificationType, customMessage);
      
      // שליחת Push Notification
      await this.sendPushToCustomer(order.sender_phone, notification);
      
      // שליחת WhatsApp אם מוגדר
      if (order.sender_phone) {
        await this.sendWhatsAppMessage(order.sender_phone, notification.message);
      }

      // שמירה בלוג
      await this.logNotification({
        order_id: orderId,
        recipient_type: 'customer',
        recipient_phone: order.sender_phone,
        notification_type: notificationType,
        title: notification.title,
        message: notification.message,
        channel: 'push'
      });

      return true;
    } catch (error) {
      console.error('Error notifying customer:', error);
      return false;
    }
  }

  /**
   * שליחת התראה לשליח
   */
  async notifyCourier(courierId, notificationType, orderData = null) {
    try {
      const courier = await this.getCourierDetails(courierId);
      if (!courier) return false;

      const notification = this.buildCourierNotification(courier, notificationType, orderData);
      
      // שליחת Push
      await this.sendPushToCourier(courierId, notification);
      
      // שליחת WhatsApp
      if (courier.phone) {
        await this.sendWhatsAppMessage(courier.phone, notification.message);
      }

      await this.logNotification({
        order_id: orderData?.id || null,
        recipient_type: 'courier',
        recipient_id: courierId,
        recipient_phone: courier.phone,
        notification_type: notificationType,
        title: notification.title,
        message: notification.message,
        channel: 'push'
      });

      return true;
    } catch (error) {
      console.error('Error notifying courier:', error);
      return false;
    }
  }

  /**
   * בניית תוכן התראה ללקוח
   */
  buildCustomerNotification(order, type, customMessage) {
    const notifications = {
      order_created: {
        title: '✅ הזמנתך התקבלה!',
        message: `הזמנה מס' ${order.order_number} נקלטה במערכת.\nאנחנו מחפשים שליח עבורך...`,
        emoji: '✅',
        priority: 'normal'
      },
      courier_assigned: {
        title: '🚀 שליח בדרך!',
        message: `${order.courier_name || 'שליח'} תפס את המשלוח שלך!\n` +
                `📱 טלפון: ${order.courier_phone || ''}\n` +
                `🏍️ רכב: ${order.vehicle_type || 'אופנוע'}\n` +
                `⭐ דירוג: ${order.courier_rating || '5.0'}\n` +
                `⏰ צפי איסוף: ${this.formatETA(order.estimated_pickup_time)}`,
        emoji: '🚀',
        priority: 'high'
      },
      courier_arrived_pickup: {
        title: '📦 השליח הגיע לאיסוף!',
        message: `${order.courier_name} נמצא אצל השולח\n` +
                `כתובת איסוף: ${order.pickup_address}`,
        emoji: '📦',
        priority: 'high'
      },
      package_picked: {
        title: '🏃 החבילה באיסוף!',
        message: `השליח אסף את החבילה ובדרך אליך\n` +
                `⏰ זמן הגעה משוער: ${this.formatETA(order.estimated_delivery_time)}\n` +
                `📍 עקוב אחר המשלוח במפה`,
        emoji: '🏃',
        priority: 'normal'
      },
      courier_nearby: {
        title: '⏰ השליח מתקרב!',
        message: `${order.courier_name} יגיע בעוד כ-5 דקות\n` +
                `היה זמין לקבלת המשלוח 🚪`,
        emoji: '⏰',
        priority: 'urgent'
      },
      courier_arrived_delivery: {
        title: '🚪 השליח הגיע!',
        message: `${order.courier_name} ממתין במקום המסירה\n` +
                `כתובת: ${order.delivery_address}`,
        emoji: '🚪',
        priority: 'urgent'
      },
      package_delivered: {
        title: '✅ המשלוח נמסר בהצלחה!',
        message: `המשלוח נמסר ל${order.receiver_name}\n` +
                `תודה שבחרת ב-M.M.H Delivery! 🙏\n\n` +
                `נשמח אם תדרג את השירות שקיבלת ⭐`,
        emoji: '✅',
        priority: 'normal'
      },
      delivery_delayed: {
        title: '⚠️ עדכון משלוח',
        message: `השליח מעוכב בתנועה\n` +
                `זמן הגעה חדש: ${this.formatETA(order.estimated_delivery_time)}`,
        emoji: '⚠️',
        priority: 'normal'
      }
    };

    return notifications[type] || {
      title: 'עדכון משלוח',
      message: customMessage || 'יש עדכון במשלוח שלך',
      emoji: '📬',
      priority: 'normal'
    };
  }

  /**
   * בניית תוכן התראה לשליח
   */
  buildCourierNotification(courier, type, orderData) {
    const notifications = {
      new_order_published: {
        title: '🚀 משלוח חדש!',
        message: `משלוח חדש פורסם בקבוצה!\n` +
                `📍 ${orderData?.pickup_address || ''} ← ${orderData?.delivery_address || ''}\n` +
                `💰 ₪${orderData?.courier_payout || 0}\n` +
                `📏 ${orderData?.distance || ''} ק"מ`,
        priority: 'high'
      },
      order_reminder: {
        title: '⏰ תזכורת משלוח',
        message: `יש לך משלוח פעיל (#${orderData?.order_number})\n` +
                `סטטוס: ${this.getStatusHebrew(orderData?.status)}\n` +
                `אנא עדכן את הסטטוס`,
        priority: 'normal'
      },
      nearby_order: {
        title: '📍 משלוח קרוב אליך!',
        message: `משלוח חדש במרחק ${orderData?.distance} ק"מ ממך\n` +
                `💰 ₪${orderData?.courier_payout || 0}\n` +
                `לחץ כאן לקבלת פרטים`,
        priority: 'high'
      },
      payment_received: {
        title: '💰 תשלום התקבל!',
        message: `קיבלת תשלום: ₪${orderData?.amount || 0}\n` +
                `יתרה נוכחית: ₪${courier.balance || 0}`,
        priority: 'normal'
      },
      daily_summary: {
        title: '📊 סיכום יומי',
        message: `משלוחים היום: ${orderData?.count || 0}\n` +
                `סה"כ הרווחת: ₪${orderData?.earned || 0}\n` +
                `דירוג ממוצע: ${orderData?.rating || '5.0'} ⭐`,
        priority: 'low'
      }
    };

    return notifications[type] || {
      title: 'עדכון',
      message: 'יש עדכון חדש עבורך',
      priority: 'normal'
    };
  }

  /**
   * שליחת Push notification ללקוח
   */
  async sendPushToCustomer(phone, notification) {
    try {
      // מציאת מנויי Push של הלקוח
      const result = await this.pool.query(
        `SELECT subscription_data FROM push_subscriptions 
         WHERE user_type = 'customer' AND phone = $1 AND active = true`,
        [phone]
      );

      if (result.rows.length === 0) return false;

      // כאן תוסיף אינטגרציה עם שירות Push אמיתי (FCM, OneSignal, וכו')
      // לדוגמה:
      // await this.sendFCMNotification(result.rows[0].subscription_data, notification);
      
      console.log(`📱 Push sent to customer ${phone}:`, notification.title);
      return true;
    } catch (error) {
      console.error('Error sending push to customer:', error);
      return false;
    }
  }

  /**
   * שליחת Push notification לשליח
   */
  async sendPushToCourier(courierId, notification) {
    try {
      const result = await this.pool.query(
        `SELECT subscription_data FROM push_subscriptions 
         WHERE user_type = 'courier' AND user_id = $1 AND active = true`,
        [courierId]
      );

      if (result.rows.length === 0) return false;

      console.log(`📱 Push sent to courier ${courierId}:`, notification.title);
      return true;
    } catch (error) {
      console.error('Error sending push to courier:', error);
      return false;
    }
  }

  /**
   * שליחת הודעת WhatsApp
   */
  async sendWhatsAppMessage(phone, message) {
    if (!this.whapi.TOKEN || !phone) return false;

    try {
      // ניקוי מספר טלפון
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.startsWith('972') ? cleanPhone : '972' + cleanPhone.substring(1);

      const response = await axios.post(
        `${this.whapi.API_URL}/messages/text`,
        {
          to: formattedPhone + '@s.whatsapp.net',
          body: message
        },
        {
          headers: {
            'Authorization': `Bearer ${this.whapi.TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`📲 WhatsApp sent to ${phone}`);
      return true;
    } catch (error) {
      console.error('Error sending WhatsApp:', error.message);
      return false;
    }
  }

  /**
   * שמירת התראה בלוג
   */
  async logNotification(data) {
    try {
      await this.pool.query(
        `INSERT INTO notifications_log 
         (order_id, recipient_type, recipient_id, recipient_phone, notification_type, title, message, channel, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          data.order_id,
          data.recipient_type,
          data.recipient_id || null,
          data.recipient_phone,
          data.notification_type,
          data.title,
          data.message,
          data.channel || 'push',
          'sent'
        ]
      );
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * קבלת פרטי הזמנה
   */
  async getOrderDetails(orderId) {
    try {
      const result = await this.pool.query(
        `SELECT o.*, 
                c.first_name || ' ' || c.last_name as courier_name,
                c.phone as courier_phone,
                c.vehicle_type,
                c.rating as courier_rating
         FROM orders o
         LEFT JOIN couriers c ON o.courier_id = c.id
         WHERE o.id = $1`,
        [orderId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting order details:', error);
      return null;
    }
  }

  /**
   * קבלת פרטי שליח
   */
  async getCourierDetails(courierId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [courierId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting courier details:', error);
      return null;
    }
  }

  /**
   * פורמט זמן הגעה משוער
   */
  formatETA(timestamp) {
    if (!timestamp) return 'בקרוב';
    
    const eta = new Date(timestamp);
    const now = new Date();
    const diff = Math.round((eta - now) / 60000); // דקות
    
    if (diff < 0) return 'בקרוב';
    if (diff < 60) return `${diff} דקות`;
    
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours} שעות ו-${mins} דקות`;
  }

  /**
   * תרגום סטטוס לעברית
   */
  getStatusHebrew(status) {
    const statuses = {
      'new': 'חדש',
      'published': 'פורסם',
      'taken': 'נתפס',
      'picked': 'נאסף',
      'delivered': 'נמסר',
      'cancelled': 'בוטל'
    };
    return statuses[status] || status;
  }

  /**
   * שליחת התראה על משלוח חדש לכל השליחים הפעילים
   */
  async broadcastNewOrder(orderData) {
    try {
      // מציאת שליחים פעילים וקרובים
      const couriers = await this.pool.query(
        `SELECT id, phone, notification_preferences 
         FROM couriers 
         WHERE status = 'active' AND is_online = true`
      );

      const promises = couriers.rows.map(courier => 
        this.notifyCourier(courier.id, 'new_order_published', orderData)
      );

      await Promise.all(promises);
      console.log(`📢 Broadcast new order to ${couriers.rows.length} couriers`);
    } catch (error) {
      console.error('Error broadcasting order:', error);
    }
  }
}

module.exports = PushNotificationService;
