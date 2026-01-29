const whapi = require('../config/whapi');
const prisma = require('../config/database');

const COURIERS_GROUP_ID = process.env.COURIERS_GROUP_ID;
const LOGO_URL = process.env.LOGO_URL;
const WHATSAPP_IMAGE_URL = process.env.WHATSAPP_IMAGE_URL;

const whatsappService = {
  // פרסום משלוח לקבוצת שליחים
  async publishDeliveryToGroup(delivery) {
    try {
      const message = `
🚨 *משלוח חדש זמין!* 🚨

📦 *מספר הזמנה:* ${delivery.orderNumber}
🚗 *סוג רכב:* ${this.getVehicleTypeHebrew(delivery.vehicleType)}

📍 *כתובת איסוף:*
${delivery.pickupAddress}
${delivery.pickupCity ? `🏙️ ${delivery.pickupCity}` : ''}

📍 *כתובת מסירה:*
${delivery.deliveryAddress}
${delivery.deliveryCity ? `🏙️ ${delivery.deliveryCity}` : ''}

${delivery.distance ? `📏 *מרחק:* ${delivery.distance} ק"מ` : ''}
💰 *תשלום לשליח:* ₪${delivery.courierEarnings}

${delivery.isNightDelivery ? '🌙 *משלוח לילה*' : ''}
${delivery.priority > 0 ? '⚡ *דחוף!*' : ''}

לתפיסת המשלוח, לחצו על הכפתור למטה 👇
      `.trim();

      // שליחה עם כפתור תפיסה
      await whapi.sendButtons(COURIERS_GROUP_ID, message, [
        { id: `claim_${delivery.id}`, title: '✋ תפוס משלוח' }
      ]);

      // עדכון סטטוס למפורסם
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { 
          status: 'published',
          publishedAt: new Date()
        }
      });

      console.log(`✅ Delivery ${delivery.orderNumber} published to group`);
      return true;
    } catch (error) {
      console.error('Error publishing delivery:', error);
      throw error;
    }
  },

  // הודעה ללקוח - מחפשים שליח
  async notifyCustomerSearching(delivery) {
    if (!delivery.customerFromPhone) return;

    const message = `
שלום ${delivery.customerFromName || 'לקוח יקר'} 👋

המשלוח שלך נרשם במערכת!

📦 *מספר משלוח:* ${delivery.orderNumber}
🔍 *אנחנו מחפשים לך שליח זמין...*

נעדכן אותך ברגע ששליח יתפוס את המשלוח 🚀

_צוות M.M.H Delivery_
    `.trim();

    try {
      await whapi.sendMessage(delivery.customerFromPhone, message);
    } catch (error) {
      console.error('Error notifying customer:', error);
    }
  },

  // הודעה ללקוח - שליח נתפס
  async notifyCustomerCourierAssigned(delivery, courier) {
    if (!delivery.customerFromPhone) return;

    const message = `
שלום ${delivery.customerFromName || 'לקוח יקר'} 👋

✅ *שליח נתפס למשלוח שלך!*

👤 *שם השליח:* ${courier.name}
📞 *טלפון:* ${courier.phone}
🚗 *רכב:* ${this.getVehicleTypeHebrew(courier.vehicleType)}

השליח כבר בדרך לאיסוף החבילה שלך 📦

_צוות M.M.H Delivery_
    `.trim();

    try {
      await whapi.sendMessage(delivery.customerFromPhone, message);
    } catch (error) {
      console.error('Error notifying customer:', error);
    }
  },

  // הודעה לשליח - משלוח נתפס בהצלחה
  async notifyPickupDetails(delivery, courier) {
    const message = `
היי ${courier.name}! 👋

✅ *המשלוח נתפס בהצלחה!*

📦 *מספר הזמנה:* ${delivery.orderNumber}

📍 *פרטי איסוף:*
${delivery.pickupAddress}
${delivery.customerFromName ? `👤 שם: ${delivery.customerFromName}` : ''}
${delivery.customerFromPhone ? `📞 טלפון: ${delivery.customerFromPhone}` : ''}

${delivery.notes ? `📝 *הערות:* ${delivery.notes}` : ''}

💰 *תשלום:* ₪${delivery.courierEarnings}

🗺️ *ניווט:*
    `.trim();

    const navigationUrl = `https://waze.com/ul?q=${encodeURIComponent(delivery.pickupAddress)}`;

    try {
      await whapi.sendButtons(courier.phone, message, [
        { id: `navigate_${delivery.id}`, title: '🗺️ נווט ב-Waze' },
        { id: `picked_${delivery.id}`, title: '✅ אספתי את החבילה' }
      ]);

      // שליחת קישור ניווט נפרד
      await whapi.sendMessage(courier.phone, navigationUrl);
    } catch (error) {
      console.error('Error sending pickup details:', error);
    }
  },

  // הודעה ללקוח - החבילה נאספה
  async notifyCustomerPickedUp(delivery, courier) {
    if (!delivery.customerToPhone) return;

    const message = `
שלום ${delivery.customerToName || 'לקוח יקר'} 👋

📦 *החבילה שלך נאספה!*

השליח ${courier.name} כבר בדרך אליך 🚗💨

📍 *כתובת מסירה:*
${delivery.deliveryAddress}

⏱️ *זמן הגעה משוער:* ${delivery.estimatedDeliveryTime || '---'} דקות

_צוות M.M.H Delivery_
    `.trim();

    try {
      await whapi.sendMessage(delivery.customerToPhone, message);
    } catch (error) {
      console.error('Error notifying customer pickup:', error);
    }
  },

  // הודעה לשליח - פרטי מסירה
  async notifyDeliveryDetails(delivery, courier) {
    const message = `
מעולה ${courier.name}! 📦

עכשיו תמסור את החבילה:

📍 *כתובת מסירה:*
${delivery.deliveryAddress}
${delivery.customerToName ? `👤 שם: ${delivery.customerToName}` : ''}
${delivery.customerToPhone ? `📞 טלפון: ${delivery.customerToPhone}` : ''}

${delivery.notes ? `📝 *הערות:* ${delivery.notes}` : ''}

🗺️ *ניווט למסירה:*
    `.trim();

    const navigationUrl = `https://waze.com/ul?q=${encodeURIComponent(delivery.deliveryAddress)}`;

    try {
      await whapi.sendButtons(courier.phone, message, [
        { id: `navigate_delivery_${delivery.id}`, title: '🗺️ נווט ב-Waze' },
        { id: `delivered_${delivery.id}`, title: '✅ מסרתי את החבילה' }
      ]);

      await whapi.sendMessage(courier.phone, navigationUrl);
    } catch (error) {
      console.error('Error sending delivery details:', error);
    }
  },

  // הודעה לשליח - משלוח הושלם
  async notifyDeliveryCompleted(delivery, courier) {
    const message = `
🎉 *כל הכבוד ${courier.name}!*

המשלוח הושלם בהצלחה! 

📦 *מספר הזמנה:* ${delivery.orderNumber}
💰 *הרווחת:* ₪${delivery.courierEarnings}

תודה על העבודה המצוינת! 🙏

_צוות M.M.H Delivery_
    `.trim();

    try {
      await whapi.sendMessage(courier.phone, message);
    } catch (error) {
      console.error('Error notifying delivery completed:', error);
    }
  },

  // הודעה ללקוח - המשלוח הושלם
  async notifyCustomerDelivered(delivery) {
    if (!delivery.customerToPhone) return;

    const message = `
${delivery.customerToName || 'לקוח יקר'}, החבילה נמסרה! 🎉

📦 *מספר משלוח:* ${delivery.orderNumber}
✅ *סטטוס:* נמסר בהצלחה

תודה שבחרת ב-M.M.H Delivery! 

⭐ נשמח לחוות דעתך:
https://g.page/r/YOUR_GOOGLE_REVIEW_LINK

_צוות M.M.H Delivery_
    `.trim();

    try {
      await whapi.sendMessage(delivery.customerToPhone, message);
    } catch (error) {
      console.error('Error notifying customer delivered:', error);
    }
  },

  // תרגום סוג רכב לעברית
  getVehicleTypeHebrew(vehicleType) {
    const types = {
      'motorcycle': '🏍️ אופנוע',
      'car': '🚗 רכב',
      'van': '🚐 טנדר',
      'truck': '🚚 משאית'
    };
    return types[vehicleType] || vehicleType;
  }
};

module.exports = whatsappService;
