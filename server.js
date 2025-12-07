/**
 * M.M.H Delivery System - Backend + Frontend Server
 * Version 2.0 - With Interactive Status Updates
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');

// ==================== CONFIGURATION ====================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://mmh-delivery.onrender.com',
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    TOKEN: process.env.WHAPI_TOKEN || 'a52q50FVgRAJNQaP4y165EoHx6fDixXw',
    COURIERS_GROUP_ID: process.env.COURIERS_GROUP_ID || '120363404988099203@g.us',
  },
  COMMISSION_RATE: parseFloat(process.env.COMMISSION_RATE) || 0.25,
};

// ==================== DATABASE ====================
const db = {
  orders: [],
  orderCounter: 100,
};

// ==================== EXPRESS APP ====================
const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use((req, res, next) => { res.setHeader('ngrok-skip-browser-warning', 'true'); next(); });

const server = http.createServer(app);

// ==================== WEBSOCKET SERVER ====================
const wss = new WebSocket.Server({ server });

const broadcast = (message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
};

wss.on('connection', (ws) => {
  console.log('🔌 Client connected');
  ws.send(JSON.stringify({ type: 'orders_init', data: { orders: db.orders } }));
  
  ws.on('message', async (message) => {
    try {
      const { type, orderId, data } = JSON.parse(message);
      switch (type) {
        case 'create_order': await handleCreateOrder(data); break;
        case 'publish': await handlePublishOrder(orderId); break;
        case 'picked': await handleOrderPicked(orderId); break;
        case 'delivered': await handleOrderDelivered(orderId); break;
        case 'cancel': await handleCancelOrder(orderId); break;
      }
    } catch (error) { console.error('WebSocket message error:', error); }
  });
  
  ws.on('close', () => console.log('🔌 Client disconnected'));
  const pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 30000);
  ws.on('close', () => clearInterval(pingInterval));
});

// ==================== WHAPI FUNCTIONS ====================
const sendWhatsAppMessage = async (chatId, text) => {
  try {
    const response = await axios.post(
      CONFIG.WHAPI.API_URL + '/messages/text',
      { to: chatId, body: text },
      { headers: { Authorization: 'Bearer ' + CONFIG.WHAPI.TOKEN } }
    );
    return response.data;
  } catch (error) {
    console.error('WhatsApp send error:', error.response?.data || error.message);
    throw error;
  }
};

// ==================== ORDER HANDLERS ====================
const handleCreateOrder = async (data) => {
  const orderId = 'MMH-' + (++db.orderCounter);
  const commission = Math.round(data.price * CONFIG.COMMISSION_RATE);
  
  const order = {
    id: orderId,
    senderName: data.senderName,
    senderPhone: data.senderPhone,
    pickupAddress: data.pickupAddress,
    receiverName: data.receiverName,
    receiverPhone: data.receiverPhone,
    deliveryAddress: data.deliveryAddress,
    details: data.details || '',
    price: data.price,
    commission: commission,
    courierPayout: data.price - commission,
    priority: data.priority || 'normal',
    status: 'new',
    createdAt: new Date(),
    courier: null,
  };
  
  db.orders.unshift(order);
  broadcast({ type: 'new_order', data: { order: order } });
  console.log('📦 New order created: ' + orderId);
  return order;
};

const handlePublishOrder = async (orderId) => {
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return;
  
  order.status = 'published';
  const priorityEmoji = { normal: '📦', express: '⚡', urgent: '🚨' };
  const priorityText = order.priority === 'urgent' ? 'דחוף!' : order.priority === 'express' ? 'אקספרס' : 'רגיל';
  const takeUrl = CONFIG.PUBLIC_URL + '/take/' + order.id;
  
  let message = priorityEmoji[order.priority] + ' *משלוח חדש - ' + order.id + '*\n\n';
  message += '📍 *איסוף:* ' + order.pickupAddress + '\n';
  message += '🏠 *יעד:* ' + order.deliveryAddress + '\n';
  if (order.details) message += '📝 *פרטים:* ' + order.details + '\n';
  message += '\n💰 *תשלום לשליח:* ₪' + order.courierPayout + '\n';
  message += '⏰ ' + priorityText + '\n\n';
  message += '👇 *לתפיסת המשלוח לחץ כאן:*\n' + takeUrl;

  try {
    await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, message);
    broadcast({ type: 'order_published', data: { orderId: orderId } });
    console.log('📤 Order ' + orderId + ' published to couriers group');
  } catch (error) {
    console.error('Failed to publish order ' + orderId + ':', error.message);
  }
};

const handleOrderPicked = async (orderId, fromCourier = false) => {
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return;
  
  order.status = 'picked';
  order.pickedAt = new Date();
  
  // שלח הודעה לשליח עם לינק לסימון מסירה
  if (order.courier && order.courier.whatsappId) {
    const deliverUrl = CONFIG.PUBLIC_URL + '/status/' + order.id + '/deliver';
    
    let message = '📦 *אישור איסוף - ' + order.id + '*\n\n';
    message += '✅ המשלוח סומן כנאסף!\n\n';
    message += '🏠 *כתובת מסירה:*\n' + order.deliveryAddress + '\n\n';
    message += '👤 *מקבל:* ' + order.receiverName + '\n';
    message += '📞 *טלפון:* ' + order.receiverPhone + '\n\n';
    message += '🔗 *ניווט למסירה:*\nhttps://waze.com/ul?q=' + encodeURIComponent(order.deliveryAddress) + '\n\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '📬 *מסרת? לחץ כאן:*\n' + deliverUrl;
    
    try { await sendWhatsAppMessage(order.courier.whatsappId, message); } 
    catch (error) { console.error('Failed to send pickup confirmation:', error.message); }
  }
  
  broadcast({ type: 'order_picked', data: { orderId: orderId } });
  console.log('📦 Order ' + orderId + ' picked up');
};

const handleOrderDelivered = async (orderId, fromCourier = false) => {
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return;
  
  order.status = 'delivered';
  order.deliveredAt = new Date();
  
  if (order.courier && order.courier.whatsappId) {
    let message = '✅ *המשלוח ' + order.id + ' נמסר בהצלחה!*\n\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '💰 *רווח מהמשלוח:* ₪' + order.courierPayout + '\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';
    message += 'תודה רבה על העבודה! 🙏\n';
    message += 'מחכים למשלוח הבא 🚀';
    
    try { await sendWhatsAppMessage(order.courier.whatsappId, message); } 
    catch (error) { console.error('Failed to send delivery confirmation:', error.message); }
  }
  
  // הודעה לקבוצה
  try { 
    await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '✅ המשלוח ' + order.id + ' נמסר בהצלחה!'); 
  } catch (error) { console.error('Failed to notify group:', error.message); }
  
  broadcast({ type: 'order_delivered', data: { orderId: orderId } });
  console.log('✅ Order ' + orderId + ' delivered');
};

const handleCancelOrder = async (orderId) => {
  const order = db.orders.find(o => o.id === orderId);
  if (!order) return;
  
  const previousStatus = order.status;
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  
  if (order.courier && order.courier.whatsappId) {
    try { await sendWhatsAppMessage(order.courier.whatsappId, '❌ *המשלוח ' + order.id + ' בוטל*\n\nהמשלוח שתפסת בוטל על ידי המנהל.\nמתנצלים על אי הנוחות.'); } 
    catch (error) { console.error('Failed to notify courier about cancellation:', error.message); }
  }
  
  if (['published', 'taken', 'picked'].includes(previousStatus)) {
    try { await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '❌ *המשלוח ' + order.id + ' בוטל*'); } 
    catch (error) { console.error('Failed to notify group about cancellation:', error.message); }
  }
  
  broadcast({ type: 'order_cancelled', data: { orderId: orderId } });
  console.log('❌ Order ' + orderId + ' cancelled');
};

// ==================== STATUS UPDATE PAGES ====================
// דף עדכון סטטוס - איסוף
app.get('/status/:orderId/pickup', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  
  if (!order) {
    return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת במערכת', '#ef4444'));
  }
  
  if (order.status !== 'taken') {
    return res.send(statusPage('ℹ️', 'לא ניתן לעדכן', 'המשלוח כבר עודכן או בוטל', '#f59e0b'));
  }
  
  res.send(statusPage('📦', 'אישור איסוף', `האם אספת את המשלוח ${order.id}?`, '#10b981', `
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button onclick="confirmPickup()" style="flex:1;padding:15px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:12px;color:white;font-size:16px;font-weight:bold;cursor:pointer;">✅ כן, אספתי</button>
      <button onclick="window.close()" style="flex:1;padding:15px;background:#334155;border:none;border-radius:12px;color:white;font-size:16px;cursor:pointer;">❌ לא עדיין</button>
    </div>
    <script>
      async function confirmPickup() {
        try {
          const res = await fetch('/api/status/${order.id}/pickup', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            document.body.innerHTML = '<div style="text-align:center;padding:50px;"><div style="font-size:60px;margin-bottom:20px;">✅</div><h1 style="color:#10b981;margin-bottom:10px;">נרשם בהצלחה!</h1><p style="color:#94a3b8;">המשלוח סומן כנאסף</p></div>';
          } else {
            alert(data.error || 'שגיאה');
          }
        } catch (e) { alert('שגיאת תקשורת'); }
      }
    </script>
  `));
});

// דף עדכון סטטוס - מסירה
app.get('/status/:orderId/deliver', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  
  if (!order) {
    return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת במערכת', '#ef4444'));
  }
  
  if (order.status !== 'picked') {
    if (order.status === 'taken') {
      return res.send(statusPage('ℹ️', 'צריך לאסוף קודם', 'סמן את המשלוח כנאסף לפני סימון מסירה', '#f59e0b'));
    }
    return res.send(statusPage('ℹ️', 'לא ניתן לעדכן', 'המשלוח כבר נמסר או בוטל', '#f59e0b'));
  }
  
  res.send(statusPage('📬', 'אישור מסירה', `האם מסרת את המשלוח ${order.id}?`, '#10b981', `
    <div style="margin:20px 0;padding:15px;background:#1e293b;border-radius:12px;border:1px solid #334155;">
      <div style="color:#64748b;font-size:12px;margin-bottom:5px;">נמסר ל:</div>
      <div style="color:white;font-size:16px;">${order.receiverName}</div>
      <div style="color:#94a3b8;font-size:14px;">${order.deliveryAddress}</div>
    </div>
    <div style="display:flex;gap:10px;">
      <button onclick="confirmDelivery()" style="flex:1;padding:15px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:12px;color:white;font-size:16px;font-weight:bold;cursor:pointer;">✅ כן, מסרתי</button>
      <button onclick="window.close()" style="flex:1;padding:15px;background:#334155;border:none;border-radius:12px;color:white;font-size:16px;cursor:pointer;">❌ לא עדיין</button>
    </div>
    <div style="margin-top:20px;padding:15px;background:#10b98120;border-radius:12px;text-align:center;">
      <div style="color:#10b981;font-size:14px;">💰 רווח מהמשלוח</div>
      <div style="color:#10b981;font-size:28px;font-weight:bold;">₪${order.courierPayout}</div>
    </div>
    <script>
      async function confirmDelivery() {
        try {
          const res = await fetch('/api/status/${order.id}/deliver', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            document.body.innerHTML = '<div style="text-align:center;padding:50px;"><div style="font-size:60px;margin-bottom:20px;">🎉</div><h1 style="color:#10b981;margin-bottom:10px;">המשלוח נמסר!</h1><p style="color:#94a3b8;margin-bottom:20px;">תודה רבה על העבודה</p><div style="background:#10b98120;padding:20px;border-radius:12px;"><div style="color:#10b981;font-size:14px;">הרווחת</div><div style="color:#10b981;font-size:32px;font-weight:bold;">₪${order.courierPayout}</div></div></div>';
          } else {
            alert(data.error || 'שגיאה');
          }
        } catch (e) { alert('שגיאת תקשורת'); }
      }
    </script>
  `));
});

// פונקציה ליצירת דף סטטוס
function statusPage(emoji, title, subtitle, color, content = '') {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>*{font-family:Segoe UI,Tahoma,sans-serif;margin:0;padding:0;box-sizing:border-box}body{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#1e293b;border-radius:20px;padding:30px;text-align:center;border:1px solid #334155;max-width:400px;width:100%}.emoji{font-size:50px;margin-bottom:15px}h1{color:${color};margin-bottom:10px;font-size:22px}p{color:#94a3b8;font-size:14px}</style></head><body><div class="card"><div class="emoji">${emoji}</div><h1>${title}</h1><p>${subtitle}</p>${content}</div></body></html>`;
}

// API לעדכון סטטוס
app.post('/api/status/:orderId/pickup', async (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.json({ success: false, error: 'הזמנה לא נמצאה' });
  if (order.status !== 'taken') return res.json({ success: false, error: 'לא ניתן לעדכן סטטוס' });
  
  await handleOrderPicked(order.id, true);
  res.json({ success: true });
});

app.post('/api/status/:orderId/deliver', async (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.json({ success: false, error: 'הזמנה לא נמצאה' });
  if (order.status !== 'picked') return res.json({ success: false, error: 'לא ניתן לעדכן סטטוס' });
  
  await handleOrderDelivered(order.id, true);
  res.json({ success: true });
});

// ==================== TAKE ORDER PAGE ====================
app.get('/take/:orderId', (req, res) => {
  const order = db.orders.find(o => o.id === req.params.orderId);
  
  if (!order) {
    return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת או שהלינק שגוי', '#ef4444'));
  }
  
  if (order.status !== 'published') {
    return res.send(statusPage('🏍️', 'המשלוח נתפס!', 'מישהו הספיק לפניך. בפעם הבאה תהיה מהיר יותר! 😉', '#f59e0b'));
  }
  
  res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>תפיסת משלוח ${order.id}</title><style>*{font-family:Segoe UI,Tahoma,sans-serif;margin:0;padding:0;box-sizing:border-box}body{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);min-height:100vh;padding:20px}.container{max-width:500px;margin:0 auto}.header{text-align:center;margin-bottom:30px}.logo{font-size:40px;margin-bottom:10px}h1{color:#10b981;font-size:24px;margin-bottom:5px}.order-id{color:#60a5fa;font-size:18px}.card{background:#1e293b;border-radius:20px;padding:25px;border:1px solid #334155;margin-bottom:20px}.info-row{display:flex;align-items:flex-start;gap:12px;margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #334155}.info-row:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}.info-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}.info-icon.pickup{background:#f59e0b20}.info-icon.delivery{background:#10b98120}.info-icon.money{background:#60a5fa20}.info-content{flex:1}.info-label{color:#64748b;font-size:12px;margin-bottom:3px}.info-value{color:#fff;font-size:15px}.payout{color:#10b981!important;font-size:22px!important;font-weight:bold}.form-title{color:#fff;font-size:18px;margin-bottom:20px;text-align:center}.form-group{margin-bottom:15px}label{display:block;color:#94a3b8;font-size:14px;margin-bottom:6px}input{width:100%;padding:14px 16px;background:#0f172a;border:2px solid #334155;border-radius:12px;color:#fff;font-size:16px}input:focus{outline:none;border-color:#10b981}.btn{width:100%;padding:16px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);border:none;border-radius:12px;color:#fff;font-size:18px;font-weight:bold;cursor:pointer}.btn:disabled{background:#475569;cursor:not-allowed}.success{display:none;text-align:center;padding:40px 20px}.success.show{display:block}.success-icon{font-size:60px;margin-bottom:20px}.success h2{color:#10b981;margin-bottom:10px}.success p{color:#94a3b8}.form-container.hidden{display:none}.error{background:#ef444420;border:1px solid #ef4444;border-radius:10px;padding:15px;color:#ef4444;margin-bottom:15px;display:none}.error.show{display:block}</style></head><body><div class="container"><div class="header"><div class="logo">🚚</div><h1>M.M.H משלוחים</h1><div class="order-id">משלוח ${order.id}</div></div><div class="card"><div class="info-row"><div class="info-icon pickup">📍</div><div class="info-content"><div class="info-label">כתובת איסוף</div><div class="info-value">${order.pickupAddress}</div></div></div><div class="info-row"><div class="info-icon delivery">🏠</div><div class="info-content"><div class="info-label">כתובת מסירה</div><div class="info-value">${order.deliveryAddress}</div></div></div><div class="info-row"><div class="info-icon money">💰</div><div class="info-content"><div class="info-label">תשלום לשליח</div><div class="info-value payout">₪${order.courierPayout}</div></div></div></div><div class="card form-container" id="formContainer"><div class="form-title">📝 מלא את הפרטים לתפיסת המשלוח</div><div class="error" id="errorMsg"></div><form id="takeForm"><div class="form-group"><label>שם פרטי</label><input type="text" id="firstName" placeholder="הכנס שם פרטי" required></div><div class="form-group"><label>שם משפחה</label><input type="text" id="lastName" placeholder="הכנס שם משפחה" required></div><div class="form-group"><label>תעודת זהות</label><input type="text" id="idNumber" placeholder="הכנס ת.ז" pattern="[0-9]{9}" maxlength="9" required></div><div class="form-group"><label>טלפון</label><input type="tel" id="phone" placeholder="05X-XXXXXXX" required></div><button type="submit" class="btn" id="submitBtn">✋ תפוס את המשלוח!</button></form></div><div class="card success" id="successMsg"><div class="success-icon">🎉</div><h2>תפסת את המשלוח!</h2><p>הפרטים המלאים נשלחו אליך בוואטסאפ</p></div></div><script>document.getElementById("takeForm").addEventListener("submit",async function(e){e.preventDefault();var btn=document.getElementById("submitBtn");btn.disabled=true;btn.textContent="שולח...";document.getElementById("errorMsg").classList.remove("show");var data={firstName:document.getElementById("firstName").value.trim(),lastName:document.getElementById("lastName").value.trim(),idNumber:document.getElementById("idNumber").value.trim(),phone:document.getElementById("phone").value.trim()};try{var res=await fetch("/api/take/${order.id}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});var result=await res.json();if(result.success){document.getElementById("formContainer").classList.add("hidden");document.getElementById("successMsg").classList.add("show")}else{document.getElementById("errorMsg").textContent=result.error;document.getElementById("errorMsg").classList.add("show");btn.disabled=false;btn.textContent="✋ תפוס את המשלוח!"}}catch(err){document.getElementById("errorMsg").textContent="שגיאת תקשורת";document.getElementById("errorMsg").classList.add("show");btn.disabled=false;btn.textContent="✋ תפוס את המשלוח!"}});</script></body></html>`);
});

// API לתפיסת משלוח - משודרג עם לינקים לעדכון סטטוס
app.post('/api/take/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  const { firstName, lastName, idNumber, phone } = req.body;
  const order = db.orders.find(o => o.id === orderId);
  
  if (!order) return res.json({ success: false, error: 'הזמנה לא נמצאה' });
  if (order.status !== 'published') return res.json({ success: false, error: 'המשלוח כבר נתפס!' });
  
  order.status = 'taken';
  order.takenAt = new Date();
  order.courier = {
    firstName, lastName, idNumber, phone,
    name: firstName + ' ' + lastName,
    whatsappId: phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net'
  };
  
  // לינקים לעדכון סטטוס
  const pickupUrl = CONFIG.PUBLIC_URL + '/status/' + order.id + '/pickup';
  
  let fullDetails = '✅ *תפסת את המשלוח ' + order.id + '!*\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n';
  fullDetails += '📤 *פרטי השולח:*\n';
  fullDetails += '👤 שם: ' + order.senderName + '\n';
  fullDetails += '📞 טלפון: ' + order.senderPhone + '\n\n';
  fullDetails += '📍 *כתובת איסוף:*\n' + order.pickupAddress + '\n\n';
  fullDetails += '🔗 *ניווט לאיסוף:*\nhttps://waze.com/ul?q=' + encodeURIComponent(order.pickupAddress) + '\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n';
  if (order.details) fullDetails += '📝 *פרטים:*\n' + order.details + '\n━━━━━━━━━━━━━━━━━━━━\n';
  fullDetails += '💰 *תשלום אחרי עמלה:* ₪' + order.courierPayout + '\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n\n';
  fullDetails += '📦 *אספת? לחץ כאן:*\n' + pickupUrl + '\n\n';
  fullDetails += 'בהצלחה! 🚀';

  try { await sendWhatsAppMessage(order.courier.whatsappId, fullDetails); } 
  catch (error) { console.error('Failed to send details to courier:', error.message); }
  
  try { await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '✅ המשלוח ' + order.id + ' נתפס על ידי ' + firstName + ' ' + lastName); } 
  catch (error) { console.error('Failed to notify group:', error.message); }
  
  broadcast({ type: 'order_taken', data: { orderId: orderId, courier: order.courier } });
  console.log('🏍️ Order ' + orderId + ' taken by ' + firstName + ' ' + lastName);
  res.json({ success: true });
});

// ==================== WEBHOOK ====================
app.post('/webhook/whapi', async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!messages || !messages.length) return res.sendStatus(200);
    
    for (const message of messages) {
      if (message.from_me) continue;
      const senderPhone = message.chat_id;
      
      if (message.type === 'text' && message.text?.body) {
        const text = message.text.body.toLowerCase();
        
        if (text.includes('נאסף') || text.includes('picked') || text.includes('אספתי')) {
          const activeOrder = db.orders.find(o => o.status === 'taken' && o.courier?.whatsappId === senderPhone);
          if (activeOrder) await handleOrderPicked(activeOrder.id, true);
        }
        
        if (text.includes('נמסר') || text.includes('delivered') || text.includes('מסרתי')) {
          const pickedOrder = db.orders.find(o => o.status === 'picked' && o.courier?.whatsappId === senderPhone);
          if (pickedOrder) await handleOrderDelivered(pickedOrder.id, true);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) { console.error('Webhook error:', error); res.sendStatus(500); }
});

// ==================== API ====================
app.get('/api/orders', (req, res) => res.json(db.orders));
app.get('/health', (req, res) => res.json({ status: 'ok', orders: db.orders.length, uptime: process.uptime() }));

// ==================== FRONTEND DASHBOARD ====================
app.get('/', (req, res) => {
  const wsUrl = CONFIG.PUBLIC_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M.M.H Delivery System</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
  <div id="app"></div>
  
  <script>
    const WS_URL = '${wsUrl}';
    let ws = null;
    let orders = [];
    let connected = false;
    
    function connectWebSocket() {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { connected = true; render(); showToast('מחובר לשרת', 'success'); };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'orders_init') orders = msg.data.orders || [];
        else if (msg.type === 'new_order') { orders.unshift(msg.data.order); showToast('הזמנה חדשה: ' + msg.data.order.id, 'info'); }
        else if (msg.type === 'order_published') orders = orders.map(o => o.id === msg.data.orderId ? {...o, status: 'published'} : o);
        else if (msg.type === 'order_taken') { orders = orders.map(o => o.id === msg.data.orderId ? {...o, status: 'taken', courier: msg.data.courier} : o); showToast('נתפס: ' + msg.data.orderId, 'success'); }
        else if (msg.type === 'order_picked') { orders = orders.map(o => o.id === msg.data.orderId ? {...o, status: 'picked'} : o); showToast('נאסף: ' + msg.data.orderId, 'info'); }
        else if (msg.type === 'order_delivered') { orders = orders.map(o => o.id === msg.data.orderId ? {...o, status: 'delivered'} : o); showToast('נמסר: ' + msg.data.orderId, 'success'); }
        else if (msg.type === 'order_cancelled') { orders = orders.map(o => o.id === msg.data.orderId ? {...o, status: 'cancelled'} : o); showToast('בוטל: ' + msg.data.orderId, 'error'); }
        render();
      };
      ws.onclose = () => { connected = false; render(); setTimeout(connectWebSocket, 3000); };
    }
    
    function send(type, data = {}) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data })); }
    
    function showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl z-50 text-white font-medium ' + 
        (type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500');
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
    
    function getStatusText(s) { return { new: 'חדש', published: 'פורסם', taken: 'נתפס', picked: 'נאסף', delivered: 'נמסר', cancelled: 'בוטל' }[s] || s; }
    function getStatusColor(s) {
      const c = { new: 'slate', published: 'amber', taken: 'blue', picked: 'purple', delivered: 'emerald', cancelled: 'red' }[s] || 'slate';
      return 'bg-' + c + '-500/20 text-' + c + '-400 border-' + c + '-500/50';
    }
    function formatCurrency(n) { return '₪' + (n || 0).toLocaleString(); }
    
    function render() {
      const stats = {
        total: orders.length,
        new: orders.filter(o => o.status === 'new').length,
        published: orders.filter(o => o.status === 'published').length,
        active: orders.filter(o => ['taken', 'picked'].includes(o.status)).length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        revenue: orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.price || 0), 0)
      };
      
      document.getElementById('app').innerHTML = \`
        <header class="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-10">
          <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center text-xl">🚚</div>
              <div>
                <h1 class="text-xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">M.M.H Delivery</h1>
                <p class="text-xs text-slate-500">מערכת ניהול משלוחים</p>
              </div>
            </div>
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm \${connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
              \${connected ? '🟢 מחובר' : '🔴 מתחבר...'}
            </div>
          </div>
        </header>
        
        <main class="max-w-7xl mx-auto px-4 py-6">
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div class="text-2xl font-bold">\${stats.total}</div>
              <div class="text-sm text-slate-400">סה״כ</div>
            </div>
            <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div class="text-2xl font-bold text-amber-400">\${stats.new + stats.published}</div>
              <div class="text-sm text-slate-400">ממתינים</div>
            </div>
            <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div class="text-2xl font-bold text-purple-400">\${stats.active}</div>
              <div class="text-sm text-slate-400">פעילים</div>
            </div>
            <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div class="text-2xl font-bold text-emerald-400">\${stats.delivered}</div>
              <div class="text-sm text-slate-400">נמסרו</div>
            </div>
            <div class="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
              <div class="text-2xl font-bold text-emerald-400">\${formatCurrency(stats.revenue)}</div>
              <div class="text-sm text-slate-400">הכנסות</div>
            </div>
          </div>
          
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold">📦 הזמנות (\${orders.length})</h2>
            <button onclick="showNewOrderForm()" class="bg-gradient-to-r from-emerald-500 to-blue-500 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2">➕ הזמנה חדשה</button>
          </div>
          
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            \${orders.map(order => \`
              <div class="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
                <div class="p-4 border-b border-slate-700/50 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="text-lg font-bold font-mono">\${order.id}</span>
                    <span class="px-3 py-1 rounded-full text-xs font-medium border \${getStatusColor(order.status)}">\${getStatusText(order.status)}</span>
                  </div>
                </div>
                <div class="p-4 space-y-3">
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-blue-500/20 rounded-lg">👤</div>
                    <div><div class="text-white font-medium">\${order.senderName}</div><div class="text-sm text-slate-400">\${order.senderPhone}</div></div>
                  </div>
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-amber-500/20 rounded-lg">📍</div>
                    <div><div class="text-xs text-slate-500">איסוף</div><div class="text-sm text-slate-300">\${order.pickupAddress}</div></div>
                  </div>
                  <div class="flex items-start gap-3">
                    <div class="p-2 bg-emerald-500/20 rounded-lg">🏠</div>
                    <div><div class="text-xs text-slate-500">מסירה</div><div class="text-sm text-slate-300">\${order.deliveryAddress}</div></div>
                  </div>
                  <div class="flex justify-between pt-2 border-t border-slate-700/50">
                    <div><div class="text-xs text-slate-500">מחיר</div><div class="text-lg font-bold">\${formatCurrency(order.price)}</div></div>
                    <div class="text-left"><div class="text-xs text-slate-500">לשליח</div><div class="text-lg font-bold text-emerald-400">\${formatCurrency(order.courierPayout)}</div></div>
                  </div>
                  \${order.courier ? \`<div class="bg-slate-700/50 rounded-xl p-3"><div class="text-xs text-slate-500">שליח</div><div class="text-white font-medium">\${order.courier.name}</div><div class="text-sm text-slate-400">\${order.courier.phone}</div></div>\` : ''}
                  \${order.status === 'new' ? \`
                    <div class="flex gap-2 pt-2">
                      <button onclick="publishOrder('\${order.id}')" class="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-2 rounded-xl font-medium">📤 פרסם</button>
                      <button onclick="cancelOrder('\${order.id}')" class="px-4 bg-red-500/20 text-red-400 rounded-xl">✕</button>
                    </div>
                  \` : ''}
                  \${order.status === 'published' ? \`
                    <button onclick="cancelOrder('\${order.id}')" class="w-full bg-red-500/20 text-red-400 py-2 rounded-xl font-medium">❌ בטל משלוח</button>
                  \` : ''}
                  \${order.status === 'taken' ? \`
                    <button onclick="cancelOrder('\${order.id}')" class="w-full bg-red-500/20 text-red-400 py-2 rounded-xl font-medium">❌ בטל משלוח</button>
                  \` : ''}
                </div>
              </div>
            \`).join('')}
          </div>
          
          \${orders.length === 0 ? '<div class="text-center py-12"><div class="text-6xl mb-4">📦</div><h3 class="text-lg font-medium mb-2">אין הזמנות</h3><p class="text-slate-400">לחץ "הזמנה חדשה" להתחיל</p></div>' : ''}
        </main>
        <div id="modal"></div>
      \`;
    }
    
    function publishOrder(id) { send('publish', { orderId: id }); showToast('מפרסם...', 'info'); }
    function cancelOrder(id) { if (confirm('האם לבטל את המשלוח?')) { send('cancel', { orderId: id }); } }
    
    function showNewOrderForm() {
      document.getElementById('modal').innerHTML = \`
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div class="bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div class="p-5 border-b border-slate-700 flex items-center justify-between">
              <h2 class="text-xl font-bold">הזמנה חדשה</h2>
              <button onclick="closeModal()" class="p-2 hover:bg-slate-700 rounded-lg text-slate-400">✕</button>
            </div>
            <form onsubmit="submitOrder(event)" class="p-5 space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-sm text-slate-400 mb-1">שם שולח</label><input type="text" id="senderName" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
                <div><label class="block text-sm text-slate-400 mb-1">טלפון שולח</label><input type="tel" id="senderPhone" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
              </div>
              <div><label class="block text-sm text-slate-400 mb-1">כתובת איסוף</label><input type="text" id="pickupAddress" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
              <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-sm text-slate-400 mb-1">שם מקבל</label><input type="text" id="receiverName" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
                <div><label class="block text-sm text-slate-400 mb-1">טלפון מקבל</label><input type="tel" id="receiverPhone" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
              </div>
              <div><label class="block text-sm text-slate-400 mb-1">כתובת מסירה</label><input type="text" id="deliveryAddress" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
              <div><label class="block text-sm text-slate-400 mb-1">פרטים נוספים</label><textarea id="details" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none h-20 resize-none"></textarea></div>
              <div class="grid grid-cols-2 gap-4">
                <div><label class="block text-sm text-slate-400 mb-1">מחיר (₪)</label><input type="number" id="price" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none" required></div>
                <div><label class="block text-sm text-slate-400 mb-1">עדיפות</label><select id="priority" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"><option value="normal">רגיל</option><option value="express">אקספרס</option><option value="urgent">דחוף</option></select></div>
              </div>
              <button type="submit" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-xl font-bold">צור הזמנה</button>
            </form>
          </div>
        </div>
      \`;
    }
    
    function closeModal() { document.getElementById('modal').innerHTML = ''; }
    
    function submitOrder(e) {
      e.preventDefault();
      send('create_order', { data: {
        senderName: document.getElementById('senderName').value,
        senderPhone: document.getElementById('senderPhone').value,
        pickupAddress: document.getElementById('pickupAddress').value,
        receiverName: document.getElementById('receiverName').value,
        receiverPhone: document.getElementById('receiverPhone').value,
        deliveryAddress: document.getElementById('deliveryAddress').value,
        details: document.getElementById('details').value,
        price: parseInt(document.getElementById('price').value) || 0,
        priority: document.getElementById('priority').value
      }});
      closeModal();
      showToast('יוצר הזמנה...', 'info');
    }
    
    connectWebSocket();
    render();
  </script>
</body>
</html>`);
});

// ==================== START ====================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('\\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🚚  M.M.H Delivery System v2.0  🚚                       ║');
  console.log('║     Server running on port ' + CONFIG.PORT + '                              ║');
  console.log('║     Public URL: ' + CONFIG.PUBLIC_URL);
  console.log('╚══════════════════════════════════════════════════════════════╝\\n');
});
