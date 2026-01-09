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
      message += `📲 *אחרי שאספת את החבילה:*\n`;
      message += `${this.publicUrl}/courier?action=pickup&order=${order.id}`;
      
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
      message += `📲 *אחרי שמסרת את החבילה:*\n`;
      message += `${this.publicUrl}/courier?action=deliver&order=${order.id}`;
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
    const message = `✅ *החבילה נמסרה בהצלחה!*\n\n` +
      `📦 הזמנה: *${order.order_number}*\n\n` +
      `תודה שבחרת ב-M.M.H Delivery! 🙏\n` +
      `נשמח אם תדרג את השליח שלנו ⭐`;

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
