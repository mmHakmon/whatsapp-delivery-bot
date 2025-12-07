/**
 * M.M.H Delivery System - Backend Server
 * Optimized for Render.com deployment
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');

// ==================== CONFIGURATION ====================
const CONFIG = {
  // Render uses dynamic PORT
  PORT: process.env.PORT || 3001,
  // Set this in Render Environment Variables
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://your-app-name.onrender.com',
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    // Set these in Render Environment Variables!
    TOKEN: process.env.WHAPI_TOKEN || 'YOUR_TOKEN_HERE',
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
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Headers for various tunnels/proxies
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

const server = http.createServer(app);

// ==================== WEBSOCKET SERVER ====================
const wss = new WebSocket.Server({ server });

const broadcast = (message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss.on('connection', (ws) => {
  console.log('🔌 Client connected');
  
  ws.send(JSON.stringify({
    type: 'orders_init',
    data: { orders: db.orders }
  }));
  
  ws.on('message', async (message) => {
    try {
      const { type, orderId, data } = JSON.parse(message);
      
      switch (type) {
        case 'create_order':
          await handleCreateOrder(data);
          break;
        case 'publish':
          await handlePublishOrder(orderId);
          break;
        case 'picked':
          await handleOrderPicked(orderId);
          break;
        case 'delivered':
          await handleOrderDelivered(orderId);
          break;
        case 'cancel':
          await handleCancelOrder(orderId);
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 Client disconnected');
  });

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(pingInterval);
  });
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
  
  broadcast({
    type: 'new_order',
    data: { order: order }
  });
  
  console.log('📦 New order created: ' + orderId);
  return order;
};

const handlePublishOrder = async (orderId) => {
  const order = db.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;
  
  order.status = 'published';
  
  const priorityEmoji = { normal: '📦', express: '⚡', urgent: '🚨' };
  const priorityText = order.priority === 'urgent' ? 'דחוף!' : order.priority === 'express' ? 'אקספרס' : 'רגיל';
  
  const takeUrl = CONFIG.PUBLIC_URL + '/take/' + order.id;
  
  let message = priorityEmoji[order.priority] + ' *משלוח חדש - ' + order.id + '*\n\n';
  message += '📍 *איסוף:* ' + order.pickupAddress + '\n';
  message += '🏠 *יעד:* ' + order.deliveryAddress + '\n';
  if (order.details) {
    message += '📝 *פרטים:* ' + order.details + '\n';
  }
  message += '\n💰 *תשלום לשליח:* ₪' + order.courierPayout + '\n';
  message += '⏰ ' + priorityText + '\n\n';
  message += '👇 *לתפיסת המשלוח לחץ כאן:*\n' + takeUrl;

  try {
    await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, message);
    
    broadcast({
      type: 'order_published',
      data: { orderId: orderId }
    });
    
    console.log('📤 Order ' + orderId + ' published to couriers group');
  } catch (error) {
    console.error('Failed to publish order ' + orderId + ':', error.message);
  }
};

const handleOrderPicked = async (orderId) => {
  const order = db.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;
  
  order.status = 'picked';
  order.pickedAt = new Date();
  
  if (order.courier && order.courier.whatsappId) {
    let message = '📦 *המשלוח ' + order.id + ' נאסף!*\n\n';
    message += '🏠 *כתובת מסירה:*\n' + order.deliveryAddress + '\n\n';
    message += '👤 *מקבל:* ' + order.receiverName + '\n';
    message += '📞 *טלפון:* ' + order.receiverPhone + '\n\n';
    message += '🔗 *ניווט:*\nhttps://waze.com/ul?q=' + encodeURIComponent(order.deliveryAddress);
    
    try {
      await sendWhatsAppMessage(order.courier.whatsappId, message);
    } catch (error) {
      console.error('Failed to send pickup confirmation:', error.message);
    }
  }
  
  broadcast({ type: 'order_picked', data: { orderId: orderId } });
  console.log('📦 Order ' + orderId + ' picked up');
};

const handleOrderDelivered = async (orderId) => {
  const order = db.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;
  
  order.status = 'delivered';
  order.deliveredAt = new Date();
  
  if (order.courier && order.courier.whatsappId) {
    let message = '✅ *המשלוח ' + order.id + ' סומן כנמסר!*\n\n';
    message += '💰 רווח: ₪' + order.courierPayout + '\n\nתודה רבה! 🙏';
    
    try {
      await sendWhatsAppMessage(order.courier.whatsappId, message);
    } catch (error) {
      console.error('Failed to send delivery confirmation:', error.message);
    }
  }
  
  broadcast({ type: 'order_delivered', data: { orderId: orderId } });
  console.log('✅ Order ' + orderId + ' delivered');
};

const handleCancelOrder = async (orderId) => {
  const order = db.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;
  
  const previousStatus = order.status;
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  
  if (order.courier && order.courier.whatsappId) {
    try {
      await sendWhatsAppMessage(
        order.courier.whatsappId,
        '❌ *המשלוח ' + order.id + ' בוטל*\n\nהמשלוח שתפסת בוטל על ידי המנהל.\nמתנצלים על אי הנוחות.'
      );
    } catch (error) {
      console.error('Failed to notify courier about cancellation:', error.message);
    }
  }
  
  if (previousStatus === 'published' || previousStatus === 'taken' || previousStatus === 'picked') {
    try {
      await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '❌ *המשלוח ' + order.id + ' בוטל*');
    } catch (error) {
      console.error('Failed to notify group about cancellation:', error.message);
    }
  }
  
  broadcast({ type: 'order_cancelled', data: { orderId: orderId } });
  console.log('❌ Order ' + orderId + ' cancelled');
};

// ==================== TAKE ORDER PAGE ====================
app.get('/take/:orderId', (req, res) => {
  const order = db.orders.find(function(o) { return o.id === req.params.orderId; });
  
  if (!order) {
    return res.send('<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>הזמנה לא נמצאה</title><style>*{font-family:Segoe UI,Tahoma,sans-serif;margin:0;padding:0;box-sizing:border-box}body{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#1e293b;border-radius:20px;padding:40px;text-align:center;border:1px solid #334155}h1{color:#ef4444;margin-bottom:10px}p{color:#94a3b8}</style></head><body><div class="card"><h1>❌ הזמנה לא נמצאה</h1><p>ההזמנה אינה קיימת או שהלינק שגוי</p></div></body></html>');
  }
  
  if (order.status !== 'published') {
    return res.send('<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>המשלוח נתפס</title><style>*{font-family:Segoe UI,Tahoma,sans-serif;margin:0;padding:0;box-sizing:border-box}body{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#1e293b;border-radius:20px;padding:40px;text-align:center;border:1px solid #334155;max-width:400px}h1{color:#f59e0b;margin-bottom:10px;font-size:24px}p{color:#94a3b8}.emoji{font-size:50px;margin-bottom:20px}</style></head><body><div class="card"><div class="emoji">🏍️</div><h1>המשלוח כבר נתפס!</h1><p>מישהו הספיק לפניך. בפעם הבאה תהיה מהיר יותר! 😉</p></div></body></html>');
  }
  
  res.send('<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>תפיסת משלוח ' + order.id + '</title><style>*{font-family:Segoe UI,Tahoma,sans-serif;margin:0;padding:0;box-sizing:border-box}body{background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);min-height:100vh;padding:20px}.container{max-width:500px;margin:0 auto}.header{text-align:center;margin-bottom:30px}.logo{font-size:40px;margin-bottom:10px}h1{color:#10b981;font-size:24px;margin-bottom:5px}.order-id{color:#60a5fa;font-size:18px}.card{background:#1e293b;border-radius:20px;padding:25px;border:1px solid #334155;margin-bottom:20px}.info-row{display:flex;align-items:flex-start;gap:12px;margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #334155}.info-row:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}.info-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}.info-icon.pickup{background:#f59e0b20}.info-icon.delivery{background:#10b98120}.info-icon.money{background:#60a5fa20}.info-content{flex:1}.info-label{color:#64748b;font-size:12px;margin-bottom:3px}.info-value{color:#fff;font-size:15px}.payout{color:#10b981!important;font-size:22px!important;font-weight:bold}.form-title{color:#fff;font-size:18px;margin-bottom:20px;text-align:center}.form-group{margin-bottom:15px}label{display:block;color:#94a3b8;font-size:14px;margin-bottom:6px}input{width:100%;padding:14px 16px;background:#0f172a;border:2px solid #334155;border-radius:12px;color:#fff;font-size:16px;transition:border-color .2s}input:focus{outline:none;border-color:#10b981}input::placeholder{color:#475569}.btn{width:100%;padding:16px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);border:none;border-radius:12px;color:#fff;font-size:18px;font-weight:bold;cursor:pointer;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(16,185,129,.3)}.btn:disabled{background:#475569;cursor:not-allowed;transform:none;box-shadow:none}.success{display:none;text-align:center;padding:40px 20px}.success.show{display:block}.success-icon{font-size:60px;margin-bottom:20px}.success h2{color:#10b981;margin-bottom:10px}.success p{color:#94a3b8;margin-bottom:20px}.whatsapp-note{background:#10b98120;border-radius:10px;padding:15px;color:#10b981;font-size:14px}.form-container.hidden{display:none}.error{background:#ef444420;border:1px solid #ef4444;border-radius:10px;padding:15px;color:#ef4444;margin-bottom:15px;display:none}.error.show{display:block}</style></head><body><div class="container"><div class="header"><div class="logo">🚚</div><h1>M.M.H משלוחים</h1><div class="order-id">משלוח ' + order.id + '</div></div><div class="card"><div class="info-row"><div class="info-icon pickup">📍</div><div class="info-content"><div class="info-label">כתובת איסוף</div><div class="info-value">' + order.pickupAddress + '</div></div></div><div class="info-row"><div class="info-icon delivery">🏠</div><div class="info-content"><div class="info-label">כתובת מסירה</div><div class="info-value">' + order.deliveryAddress + '</div></div></div><div class="info-row"><div class="info-icon money">💰</div><div class="info-content"><div class="info-label">תשלום לשליח</div><div class="info-value payout">₪' + order.courierPayout + '</div></div></div></div><div class="card form-container" id="formContainer"><div class="form-title">📝 מלא את הפרטים לתפיסת המשלוח</div><div class="error" id="errorMsg"></div><form id="takeForm"><div class="form-group"><label>שם פרטי</label><input type="text" id="firstName" placeholder="הכנס שם פרטי" required></div><div class="form-group"><label>שם משפחה</label><input type="text" id="lastName" placeholder="הכנס שם משפחה" required></div><div class="form-group"><label>תעודת זהות</label><input type="text" id="idNumber" placeholder="הכנס ת.ז" pattern="[0-9]{9}" maxlength="9" required></div><div class="form-group"><label>טלפון</label><input type="tel" id="phone" placeholder="05X-XXXXXXX" required></div><button type="submit" class="btn" id="submitBtn">✋ תפוס את המשלוח!</button></form></div><div class="card success" id="successMsg"><div class="success-icon">🎉</div><h2>תפסת את המשלוח!</h2><p>הפרטים המלאים נשלחו אליך בוואטסאפ</p><div class="whatsapp-note">📱 בדוק את ההודעות בוואטסאפ לקבלת פרטי הלקוח וניווט</div></div></div><script>var form=document.getElementById("takeForm");var formContainer=document.getElementById("formContainer");var successMsg=document.getElementById("successMsg");var errorMsg=document.getElementById("errorMsg");var submitBtn=document.getElementById("submitBtn");form.addEventListener("submit",async function(e){e.preventDefault();submitBtn.disabled=true;submitBtn.textContent="שולח...";errorMsg.classList.remove("show");var data={firstName:document.getElementById("firstName").value.trim(),lastName:document.getElementById("lastName").value.trim(),idNumber:document.getElementById("idNumber").value.trim(),phone:document.getElementById("phone").value.trim()};try{var response=await fetch("/api/take/' + order.id + '",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});var result=await response.json();if(result.success){formContainer.classList.add("hidden");successMsg.classList.add("show")}else{errorMsg.textContent=result.error||"שגיאה בתפיסת המשלוח";errorMsg.classList.add("show");submitBtn.disabled=false;submitBtn.textContent="✋ תפוס את המשלוח!"}}catch(error){errorMsg.textContent="שגיאת תקשורת. נסה שוב.";errorMsg.classList.add("show");submitBtn.disabled=false;submitBtn.textContent="✋ תפוס את המשלוח!"}});</script></body></html>');
});

// API לתפיסת משלוח
app.post('/api/take/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const idNumber = req.body.idNumber;
  const phone = req.body.phone;
  
  const order = db.orders.find(function(o) { return o.id === orderId; });
  
  if (!order) {
    return res.json({ success: false, error: 'הזמנה לא נמצאה' });
  }
  
  if (order.status !== 'published') {
    return res.json({ success: false, error: 'המשלוח כבר נתפס!' });
  }
  
  // Update order
  order.status = 'taken';
  order.takenAt = new Date();
  order.courier = {
    firstName: firstName,
    lastName: lastName,
    idNumber: idNumber,
    phone: phone,
    name: firstName + ' ' + lastName,
    whatsappId: phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net'
  };
  
  // Send details to courier
  var fullDetails = '✅ *תפסת את המשלוח ' + order.id + '!*\n\n';
  fullDetails += '📤 *פרטי השולח:*\n';
  fullDetails += 'שם: ' + order.senderName + '\n';
  fullDetails += 'טלפון: ' + order.senderPhone + '\n\n';
  fullDetails += '📍 *כתובת איסוף:*\n' + order.pickupAddress + '\n\n';
  fullDetails += '📥 *פרטי המקבל:*\n';
  fullDetails += 'שם: ' + order.receiverName + '\n';
  fullDetails += 'טלפון: ' + order.receiverPhone + '\n\n';
  fullDetails += '🏠 *כתובת מסירה:*\n' + order.deliveryAddress + '\n\n';
  if (order.details) {
    fullDetails += '📝 *פרטים:*\n' + order.details + '\n\n';
  }
  fullDetails += '💰 *תשלום:* ₪' + order.courierPayout + '\n\n';
  fullDetails += '🔗 *ניווט לאיסוף:*\nhttps://waze.com/ul?q=' + encodeURIComponent(order.pickupAddress) + '\n\n';
  fullDetails += 'בהצלחה! 🚀';

  try {
    await sendWhatsAppMessage(order.courier.whatsappId, fullDetails);
  } catch (error) {
    console.error('Failed to send details to courier:', error.message);
  }
  
  // Notify group
  try {
    await sendWhatsAppMessage(
      CONFIG.WHAPI.COURIERS_GROUP_ID,
      '✅ המשלוח ' + order.id + ' נתפס על ידי ' + firstName + ' ' + lastName
    );
  } catch (error) {
    console.error('Failed to notify group:', error.message);
  }
  
  // Broadcast to dashboard
  broadcast({
    type: 'order_taken',
    data: { orderId: orderId, courier: order.courier }
  });
  
  console.log('🏍️ Order ' + orderId + ' taken by ' + firstName + ' ' + lastName);
  
  res.json({ success: true });
});

// ==================== WEBHOOK ====================
app.post('/webhook/whapi', async (req, res) => {
  try {
    const messages = req.body.messages;
    
    if (!messages || !messages.length) {
      return res.sendStatus(200);
    }
    
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.from_me) continue;
      
      var senderPhone = message.chat_id;
      var senderName = message.from_name || senderPhone;
      
      if (message.type === 'text' && message.text && message.text.body) {
        var text = message.text.body.toLowerCase();
        
        // Courier updates: picked
        if (text.indexOf('נאסף') !== -1 || text.indexOf('picked') !== -1) {
          var activeOrder = db.orders.find(function(o) {
            return o.status === 'taken' && o.courier && o.courier.whatsappId === senderPhone;
          });
          if (activeOrder) {
            await handleOrderPicked(activeOrder.id);
          }
        }
        
        // Courier updates: delivered
        if (text.indexOf('נמסר') !== -1 || text.indexOf('delivered') !== -1) {
          var pickedOrder = db.orders.find(function(o) {
            return o.status === 'picked' && o.courier && o.courier.whatsappId === senderPhone;
          });
          if (pickedOrder) {
            await handleOrderDelivered(pickedOrder.id);
          }
        }
      }
      
      broadcast({
        type: 'whatsapp_message',
        data: { text: senderName + ': ' + (message.text && message.text.body ? message.text.body : '[הודעה]') }
      });
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// ==================== API ====================
app.get('/api/orders', function(req, res) { res.json(db.orders); });
app.get('/health', function(req, res) { res.json({ status: 'ok', orders: db.orders.length, uptime: process.uptime() }); });

// Root route - important for Render health checks
app.get('/', function(req, res) { 
  res.json({ 
    name: 'M.M.H Delivery System',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      orders: '/api/orders',
      webhook: '/webhook/whapi',
      websocket: 'wss://your-app.onrender.com'
    }
  }); 
});

// ==================== START ====================
server.listen(CONFIG.PORT, '0.0.0.0', function() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║     🚚  M.M.H Delivery System - Backend Server  🚚          ║');
  console.log('║                                                              ║');
  console.log('║     Server running on port ' + CONFIG.PORT + '                              ║');
  console.log('║     WebSocket ready for real-time updates                    ║');
  console.log('║                                                              ║');
  console.log('║     Public URL: ' + CONFIG.PUBLIC_URL);
  console.log('║     Webhook: ' + CONFIG.PUBLIC_URL + '/webhook/whapi');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
});
