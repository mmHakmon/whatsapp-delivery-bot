const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.token = process.env.WHAPI_TOKEN;
    this.groupId = process.env.COURIERS_GROUP_ID;
    this.baseUrl = 'https://gate.whapi.cloud';
    this.publicUrl = process.env.PUBLIC_URL || 'https://mmh-delivery.onrender.com';
  }

  // Format phone number
  formatPhone(phone) {
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '972' + formatted.substring(1);
    }
    return `${formatted}@s.whatsapp.net`;
  }

  // Send text message
  async sendMessage(phone, message) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages/text`,
        {
          to: this.formatPhone(phone),
          body: message
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ WhatsApp sent to:', phone);
      return response.data;
    } catch (error) {
      console.error('❌ WhatsApp error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send message with image
  async sendImageMessage(phone, message, imageUrl) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages/image`,
        {
          to: this.formatPhone(phone),
          caption: message,
          media: { url: imageUrl }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ WhatsApp image sent to:', phone);
      return response.data;
    } catch (error) {
      console.error('❌ WhatsApp image error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send to couriers group
  async sendToGroup(message, imageUrl = null) {
    try {
      const payload = {
        to: this.groupId,
        body: message
      };

      if (imageUrl) {
        payload.media = { url: imageUrl };
      }

      const response = await axios.post(
        `${this.baseUrl}/messages/text`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Group message sent');
      return response.data;
    } catch (error) {
      console.error('❌ Group message error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Send order details to courier WITH ACTION LINKS!
  async sendOrderToCourier(phone, order, stage = 'pickup') {
    let message = '';
    
    if (stage === 'pickup') {
      message = `🎉 *משלוח נתפס בהצלחה!*\n\n`;
      message += `📦 מספר הזמנה: *${order.order_number}*\n`;
      message += `💰 תשלום לך: *₪${order.courier_payout}*\n\n`;
      message += `📤 *פרטי איסוף:*\n`;
      message += `👤 ${order.sender_name}\n`;
      message += `📞 ${order.sender_phone}\n`;
      message += `📍 ${order.pickup_address}\n`;
      if (order.pickup_notes) {
        message += `📝 ${order.pickup_notes}\n`;
      }
      message += `\n🗺️ [פתח ב-Waze](https://waze.com/ul?q=${encodeURIComponent(order.pickup_address)})\n\n`;
      
      // הוסף קישור לאישור איסוף!
message += `─────────────────────\n`;
message += `✅ *אחרי שאספת - לחץ כאן:*\n`;
message += `${this.publicUrl}/confirm.html?action=pickup&order=${order.id}\n\n`;
message += `💡 אישור מהיר בלי להיכנס לאפליקציה!`;
      
    } else {
      message = `✅ *חבילה נאספה!*\n\n`;
      message += `📥 *פרטי מסירה:*\n`;
      message += `👤 ${order.receiver_name}\n`;
      message += `📞 ${order.receiver_phone}\n`;
      message += `📍 ${order.delivery_address}\n`;
      if (order.delivery_notes) {
        message += `📝 ${order.delivery_notes}\n`;
      }
      message += `\n🗺️ [פתח ב-Waze](https://waze.com/ul?q=${encodeURIComponent(order.delivery_address)})\n\n`;
      
      // הוסף קישור לאישור מסירה!
message += `─────────────────────\n`;
message += `✅ *אחרי שמסרת - לחץ כאן:*\n`;
message += `${this.publicUrl}/confirm.html?action=deliver&order=${order.id}\n\n`;
message += `💡 אישור מהיר בלי להיכנס לאפליקציה!`;
    }

    return this.sendMessage(phone, message);
  }

  // Send order confirmation to customer
  async sendOrderConfirmation(phone, order) {
    const message = `✅ *הזמנתך התקבלה בהצלחה!*\n\n` +
      `📦 מספר הזמנה: *${order.order_number}*\n` +
      `💰 מחיר: *₪${order.price}*\n` +
      `📍 מ: ${order.pickup_address}\n` +
      `📍 ל: ${order.delivery_address}\n\n` +
      `נעדכן אותך כשימצא שליח! 🚚`;

    return this.sendMessage(phone, message);
  }

  // Notify customer that courier is assigned
  async notifyCourierAssigned(phone, order, courier) {
    const message = `🚚 *שליח נמצא!*\n\n` +
      `📦 הזמנה: *${order.order_number}*\n` +
      `🏍️ שליח: ${courier.first_name} ${courier.last_name}\n` +
      `📞 טלפון: ${courier.phone}\n` +
      `🚗 רכב: ${this.getVehicleEmoji(courier.vehicle_type)}\n\n` +
      `השליח בדרך לאיסוף את החבילה! ⏱️`;

    return this.sendMessage(phone, message);
  }

  // Notify customer package picked up
  async notifyPackagePicked(phone, order) {
    const message = `📦 *החבילה נאספה!*\n\n` +
      `📦 הזמנה: *${order.order_number}*\n` +
      `השליח בדרך למסירה! 🚀`;

    return this.sendMessage(phone, message);
  }

  // Notify customer package delivered
async notifyDelivered(phone, order) {
  const ratingUrl = `${this.publicUrl}/rate.html?order=${order.id}`;
  
  const message = `✅ *החבילה נמסרה בהצלחה!*\n\n` +
    `📦 הזמנה: *${order.order_number}*\n\n` +
    `תודה שבחרת ב-M.M.H Delivery! 🙏\n\n` +
    `─────────────────────\n` +
    `⭐ *דרג את השליח שלנו:*\n` +
    `${ratingUrl}\n\n` +
    `💡 פחות מ-30 שניות - עוזר לנו להשתפר!`;
    // ⬆️ עכשיו יש קישור ישיר לדירוג!

  return this.sendMessage(phone, message);
}

  // Publish order to couriers group
  async publishOrderToGroup(order) {
    const vehicleEmoji = this.getVehicleEmoji(order.vehicle_type);
    
    const message = `🆕 *משלוח חדש זמין!*\n\n` +
      `📦 מספר: *${order.order_number}*\n` +
      `${vehicleEmoji} סוג רכב: ${this.getVehicleNameHebrew(order.vehicle_type)}\n` +
      `💰 תשלום: *₪${order.courier_payout}*\n` +
      `📍 מרחק: ${order.distance_km} ק"מ\n\n` +
      `📍 מ: ${order.pickup_address}\n` +
      `📍 ל: ${order.delivery_address}\n\n` +
      `⚡ תפוס עכשיו! ⚡\n` +
      `🔗 ${this.publicUrl}/take/${order.id}\n\n` +
      `או היכנס לאפליקציה: ${this.publicUrl}/courier`;

    return this.sendToGroup(message, process.env.WHATSAPP_IMAGE_URL);
  }

  // Announce order was taken
  async announceOrderTaken(order, courier) {
    const message = `✅ *משלוח נתפס!*\n\n` +
      `📦 ${order.order_number}\n` +
      `🏍️ השליח *${courier.first_name} ${courier.last_name}* תפס את המשלוח!\n` +
      `💰 ₪${order.courier_payout}`;

    return this.sendToGroup(message);
  }

  // ==========================================
  // VIP CUSTOMER NOTIFICATIONS (CURresponse)
  // ==========================================
  
  /**
   * Send VIP order updates to CURresponse customer (Malka)
   * @param {string} phone - Customer phone number
   * @param {object} order - Order object
   * @param {string} updateType - Type of update (created, published, taken, picked, delivered, waiting_fee_updated)
   */
  async sendVIPOrderUpdate(phone, order, updateType) {
    let message = '';
    
    switch (updateType) {
      case 'created':
        message = `✅ *הזמנה נוצרה בהצלחה!*\n\n`;
        message += `📦 מספר הזמנה: *${order.order_number}*\n`;
        message += `${order.order_type === 'planned' ? '📅 הזמנה מתוכננת' : '⚡ הזמנה מיידית'}\n\n`;
        message += `🏥 איסוף: ${order.pickup_address}\n`;
        if (order.intermediate_stop_address) {
          message += `🔄 עצירת ביניים: ${order.intermediate_stop_address}\n`;
        }
        message += `📍 מסירה: ${order.delivery_address}\n\n`;
        if (order.scheduled_pickup_time) {
          message += `⏰ שעת איסוף: ${new Date(order.scheduled_pickup_time).toLocaleString('he-IL')}\n\n`;
        }
        message += `תקבלי עדכונים בכל שלב!`;
        break;
        
      case 'published':
        message = `📢 *ההזמנה פורסמה לשליחים*\n\n`;
        message += `📦 ${order.order_number}\n`;
        message += `מחכים לשליח שיתפוס את המשלוח...`;
        break;
        
      case 'taken':
        message = `🚗 *שליח תפס את המשלוח!*\n\n`;
        message += `📦 ${order.order_number}\n`;
        message += `🏍️ שליח: ${order.courier_name}\n`;
        message += `📞 טלפון: ${order.courier_phone}\n\n`;
        message += order.order_type === 'planned' 
          ? `השליח בדרך למשרד M.M.H לאיסוף תיק הקירור`
          : `השליח בדרך לבית החולים`;
        break;
        
      case 'picked':
        message = `📦 *החבילה נאספה!*\n\n`;
        message += `📦 ${order.order_number}\n`;
        message += `השליח בדרך למסירה ברחובות 🚀`;
        break;
        
      case 'delivered':
        message = `✅ *המשלוח הושלם בהצלחה!*\n\n`;
        message += `📦 ${order.order_number}\n`;
        message += `המבחנות נמסרו לאופנהיימר 4, רחובות\n\n`;
        message += `תודה שבחרת ב-M.M.H Delivery! 🙏`;
        break;
        
      case 'waiting_fee_updated':
        message = `💰 *עדכון מחיר סופי*\n\n`;
        message += `📦 ${order.order_number}\n`;
        message += `⏱️ זמן המתנה: ${order.waiting_time_minutes} דקות\n`;
        message += `➕ תוספת המתנה: ₪${order.waiting_fee}\n\n`;
        message += `💵 מחיר סופי: *₪${order.price}*`;
        break;
    }
    
    return this.sendMessage(phone, message);
  }

  /**
   * Send order update to admin about VIP order
   * @param {object} order - Order object
   * @param {string} event - Event type (created, waiting)
   */
  async notifyAdminVIPOrder(order, event) {
    // Get admin phone from environment or use default
    const adminPhone = process.env.ADMIN_PHONE || '0545025254';
    
    let message = `🏥 *עדכון הזמנה VIP - קיוריספונס*\n\n`;
    message += `📦 ${order.order_number}\n`;
    
    switch (event) {
      case 'created':
        message += `✅ הזמנה חדשה נוצרה!\n`;
        message += `${order.order_type === 'planned' ? '📅 מתוכנן' : '⚡ מיידי'}\n`;
        message += `🏥 ${order.pickup_address}`;
        break;
        
      case 'waiting':
        message += `⏱️ השליח מדווח על המתנה בבית החולים\n`;
        message += `יש לעדכן זמן המתנה במערכת`;
        break;
    }
    
    return this.sendMessage(adminPhone, message);
  }

  // Helper functions
  getVehicleEmoji(type) {
    const emojis = {
      motorcycle: '🏍️',
      car: '🚗',
      van: '🚐',
      truck: '🚚'
    };
    return emojis[type] || '🚗';
  }

  getVehicleNameHebrew(type) {
    const names = {
      motorcycle: 'אופנוע',
      car: 'רכב פרטי',
      van: 'מסחרית',
      truck: 'משאית'
    };
    return names[type] || 'רכב';
  }
}

module.exports = new WhatsAppService();

