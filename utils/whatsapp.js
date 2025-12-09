/**
 * M.M.H Delivery System Pro v4.0
 * WhatsApp Integration Module
 * 
 * Handles all WhatsApp communication via Whapi.Cloud
 */

const axios = require('axios');
const { CONFIG } = require('../config');

// ══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Format phone number to WhatsApp ID
 */
const formatPhoneToWaId = (phone) => {
  if (!phone) return null;
  
  // Remove spaces and dashes
  let cleaned = phone.replace(/[-\s]/g, '');
  
  // Convert 05X to 9725X
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  
  return cleaned + '@s.whatsapp.net';
};

/**
 * Send text message
 */
const sendWhatsApp = async (to, message) => {
  if (!CONFIG.WHAPI.ENABLED) {
    console.log('📱 [WA Mock]:', message.substring(0, 80) + '...');
    return { success: true, mock: true };
  }
  
  try {
    const response = await axios.post(
      CONFIG.WHAPI.API_URL + '/messages/text',
      { to, body: message },
      { 
        headers: { 
          'Authorization': 'Bearer ' + CONFIG.WHAPI.TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ WhatsApp message sent to:', to.substring(0, 15));
    return { success: true, messageId: response.data?.id };
  } catch (error) {
    console.error('❌ WhatsApp error:', error.response?.data?.message || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send image with caption
 */
const sendWhatsAppImage = async (to, imageUrl, caption) => {
  if (!CONFIG.WHAPI.ENABLED) {
    console.log('📷 [WA Image Mock]:', caption.substring(0, 50) + '...');
    return { success: true, mock: true };
  }
  
  try {
    const response = await axios.post(
      CONFIG.WHAPI.API_URL + '/messages/image',
      { 
        to,
        media: imageUrl,
        caption
      },
      { 
        headers: { 
          'Authorization': 'Bearer ' + CONFIG.WHAPI.TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    console.log('✅ WhatsApp image sent to:', to.substring(0, 15));
    return { success: true, messageId: response.data?.id };
  } catch (error) {
    console.error('❌ WhatsApp image error:', error.response?.data?.message || error.message);
    
    // Fallback to text message
    console.log('📱 Falling back to text message...');
    return sendWhatsApp(to, caption);
  }
};

/**
 * Send message to couriers group
 */
const sendToGroup = async (message) => {
  if (!CONFIG.WHAPI.GROUP_ID) {
    console.log('📢 [Group Mock]:', message.substring(0, 80) + '...');
    return { success: true, mock: true };
  }
  
  return sendWhatsApp(CONFIG.WHAPI.GROUP_ID, message);
};

/**
 * Send image to couriers group
 */
const sendImageToGroup = async (imageUrl, caption) => {
  if (!CONFIG.WHAPI.GROUP_ID) {
    console.log('📢 [Group Image Mock]:', caption.substring(0, 50) + '...');
    return { success: true, mock: true };
  }
  
  return sendWhatsAppImage(CONFIG.WHAPI.GROUP_ID, imageUrl, caption);
};

// ══════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ══════════════════════════════════════════════════════════════

/**
 * Build new order message for group
 */
const buildNewOrderMessage = (order) => {
  const priorityEmoji = {
    normal: '📦',
    express: '⚡',
    urgent: '🚨'
  }[order.priority] || '📦';
  
  let msg = `${priorityEmoji} *משלוח חדש - ${order.order_number}*\n\n`;
  msg += `📍 *איסוף:* ${order.pickup_address}\n`;
  msg += `🏠 *יעד:* ${order.delivery_address}\n`;
  
  if (order.details) {
    msg += `📝 *פרטים:* ${order.details}\n`;
  }
  
  msg += `\n💰 *תשלום לשליח:* ₪${order.courier_payout}\n\n`;
  msg += `👇 *לתפיסה:*\n${CONFIG.PUBLIC_URL}/take/${order.order_number}`;
  
  return msg;
};

/**
 * Build order taken message for courier
 */
const buildOrderTakenMessage = (order) => {
  let msg = `✅ *תפסת את המשלוח ${order.order_number}!*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📤 *פרטי השולח:*\n`;
  msg += `👤 שם: ${order.sender_name}\n`;
  msg += `📞 טלפון: ${order.sender_phone}\n\n`;
  msg += `📍 *כתובת איסוף:*\n${order.pickup_address}\n\n`;
  msg += `🔗 *ניווט:*\nhttps://waze.com/ul?q=${encodeURIComponent(order.pickup_address)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (order.details) {
    msg += `📝 *פרטים:*\n${order.details}\n━━━━━━━━━━━━━━━━━━━━\n`;
  }
  
  msg += `💰 *תשלום אחרי עמלה:* ₪${order.courier_payout}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📦 *אספת? לחץ כאן:*\n${CONFIG.PUBLIC_URL}/status/${order.order_number}/pickup\n\n`;
  msg += `סעו בזהירות! 🚀`;
  
  return msg;
};

/**
 * Build order picked message for courier
 */
const buildOrderPickedMessage = (order) => {
  let msg = `📦 *אישור איסוף - ${order.order_number}*\n\n`;
  msg += `✅ המשלוח סומן כנאסף!\n\n`;
  msg += `🏠 *כתובת מסירה:*\n${order.delivery_address}\n\n`;
  msg += `👤 *מקבל:* ${order.receiver_name}\n`;
  msg += `📞 *טלפון:* ${order.receiver_phone}\n\n`;
  msg += `🔗 *ניווט:*\nhttps://waze.com/ul?q=${encodeURIComponent(order.delivery_address)}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📬 *סיימת מסירה? לחץ כאן:*\n${CONFIG.PUBLIC_URL}/status/${order.order_number}/deliver`;
  
  return msg;
};

/**
 * Build order delivered message for courier
 */
const buildOrderDeliveredMessage = (order) => {
  let msg = `✅ *המשלוח ${order.order_number} נמסר!*\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *רווח:* ₪${order.courier_payout}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `תודה! 🙏`;
  
  return msg;
};

/**
 * Build order cancelled message
 */
const buildOrderCancelledMessage = (order, reason) => {
  let msg = `❌ *המשלוח ${order.order_number} בוטל*`;
  if (reason) {
    msg += `\n\nסיבה: ${reason}`;
  }
  return msg;
};

/**
 * Build 2FA code message
 */
const build2FAMessage = (code) => {
  return `🔐 קוד האימות שלך: *${code}*\n\nתוקף: 5 דקות`;
};

/**
 * Build daily report message
 */
const buildDailyReportMessage = (stats) => {
  const date = new Date().toLocaleDateString('he-IL');
  
  let msg = `📊 *דוח יומי - ${date}*\n\n`;
  msg += `📦 סה"כ הזמנות: ${stats.total}\n`;
  msg += `✅ נמסרו: ${stats.delivered}\n`;
  msg += `❌ בוטלו: ${stats.cancelled}\n`;
  msg += `💰 הכנסות: ₪${stats.revenue}\n`;
  msg += `📈 רווח נקי: ₪${stats.profit}\n\n`;
  msg += `יום טוב! 🚀`;
  
  return msg;
};

// ══════════════════════════════════════════════════════════════
// HIGH-LEVEL FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Publish order to WhatsApp group
 */
const publishOrder = async (order) => {
  const message = buildNewOrderMessage(order);
  const imageUrl = CONFIG.WHATSAPP_IMAGE_URL;
  
  return sendImageToGroup(imageUrl, message);
};

/**
 * Notify courier of order taken
 */
const notifyOrderTaken = async (order, courierPhone) => {
  const waId = formatPhoneToWaId(courierPhone);
  if (!waId) return { success: false, error: 'Invalid phone' };
  
  const message = buildOrderTakenMessage(order);
  return sendWhatsApp(waId, message);
};

/**
 * Notify group that order was taken
 */
const notifyGroupOrderTaken = async (order, courierName) => {
  const message = `✅ המשלוח ${order.order_number} נתפס על ידי ${courierName}`;
  return sendToGroup(message);
};

/**
 * Notify courier of pickup confirmation
 */
const notifyOrderPicked = async (order, courierPhone) => {
  const waId = formatPhoneToWaId(courierPhone);
  if (!waId) return { success: false, error: 'Invalid phone' };
  
  const message = buildOrderPickedMessage(order);
  return sendWhatsApp(waId, message);
};

/**
 * Notify courier of delivery confirmation
 */
const notifyOrderDelivered = async (order, courierPhone) => {
  const waId = formatPhoneToWaId(courierPhone);
  if (!waId) return { success: false, error: 'Invalid phone' };
  
  const message = buildOrderDeliveredMessage(order);
  return sendWhatsApp(waId, message);
};

/**
 * Notify courier/group of cancellation
 */
const notifyOrderCancelled = async (order, reason, courierPhone = null) => {
  const message = buildOrderCancelledMessage(order, reason);
  const results = { group: null, courier: null };
  
  // Notify group if order was published
  if (['published', 'taken', 'picked'].includes(order.status)) {
    results.group = await sendToGroup(message);
  }
  
  // Notify courier if assigned
  if (courierPhone) {
    const waId = formatPhoneToWaId(courierPhone);
    if (waId) {
      results.courier = await sendWhatsApp(waId, message);
    }
  }
  
  return results;
};

/**
 * Send 2FA code
 */
const send2FACode = async (phone, code) => {
  const waId = formatPhoneToWaId(phone);
  if (!waId) return { success: false, error: 'Invalid phone' };
  
  const message = build2FAMessage(code);
  return sendWhatsApp(waId, message);
};

/**
 * Send daily report to group
 */
const sendDailyReport = async (stats) => {
  const message = buildDailyReportMessage(stats);
  return sendToGroup(message);
};

module.exports = {
  // Core functions
  formatPhoneToWaId,
  sendWhatsApp,
  sendWhatsAppImage,
  sendToGroup,
  sendImageToGroup,
  
  // Message builders
  buildNewOrderMessage,
  buildOrderTakenMessage,
  buildOrderPickedMessage,
  buildOrderDeliveredMessage,
  buildOrderCancelledMessage,
  build2FAMessage,
  buildDailyReportMessage,
  
  // High-level functions
  publishOrder,
  notifyOrderTaken,
  notifyGroupOrderTaken,
  notifyOrderPicked,
  notifyOrderDelivered,
  notifyOrderCancelled,
  send2FACode,
  sendDailyReport,
};
