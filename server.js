/**
 * M.M.H Delivery System - Backend Server
 * Version 3.0 - With SQLite Database & Enhanced Features
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');

// ==================== CONFIGURATION ====================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://mmh-delivery.onrender.com',
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    TOKEN: process.env.WHAPI_TOKEN || 'a52q50FVgRAJNQaP4y165EoHx6fDixXw',
    COURIERS_GROUP_ID: process.env.COURIERS_GROUP_ID || '120363404988099203@g.us',
  },/
  COMMISSION_RATE: parseFloat(process.env.COMMISSION_RATE) || 0.25,
};

// ==================== DATABASE SETUP ====================
const db = new Database(path.join(__dirname, 'mmh_delivery.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    sender_name TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    pickup_address TEXT NOT NULL,
    receiver_name TEXT NOT NULL,
    receiver_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    details TEXT,
    price INTEGER NOT NULL,
    commission INTEGER NOT NULL,
    courier_payout INTEGER NOT NULL,
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'new',
    courier_name TEXT,
    courier_phone TEXT,
    courier_whatsapp_id TEXT,
    created_at TEXT NOT NULL,
    published_at TEXT,
    taken_at TEXT,
    picked_at TEXT,
    delivered_at TEXT,
    cancelled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS couriers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp_id TEXT UNIQUE,
    total_deliveries INTEGER DEFAULT 0,
    total_earnings INTEGER DEFAULT 0,
    rating REAL DEFAULT 5.0,
    created_at TEXT NOT NULL,
    last_active_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_couriers_whatsapp ON couriers(whatsapp_id);
`);

// Initialize order counter
const lastOrder = db.prepare('SELECT id FROM orders ORDER BY created_at DESC LIMIT 1').get();
let orderCounter = lastOrder ? parseInt(lastOrder.id.replace('MMH-', '')) : 100;

// ==================== DATABASE FUNCTIONS ====================
const dbFunctions = {
  // Orders
  getAllOrders: db.prepare(`
    SELECT * FROM orders ORDER BY created_at DESC
  `),
  
  getOrderById: db.prepare(`
    SELECT * FROM orders WHERE id = ?
  `),
  
  createOrder: db.prepare(`
    INSERT INTO orders (id, sender_name, sender_phone, pickup_address, receiver_name, receiver_phone, delivery_address, details, price, commission, courier_payout, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
  `),
  
  updateOrderStatus: db.prepare(`
    UPDATE orders SET status = ? WHERE id = ?
  `),
  
  updateOrderCourier: db.prepare(`
    UPDATE orders SET courier_name = ?, courier_phone = ?, courier_whatsapp_id = ?, status = 'taken', taken_at = ? WHERE id = ?
  `),
  
  updateOrderPublished: db.prepare(`
    UPDATE orders SET status = 'published', published_at = ? WHERE id = ?
  `),
  
  updateOrderPicked: db.prepare(`
    UPDATE orders SET status = 'picked', picked_at = ? WHERE id = ?
  `),
  
  updateOrderDelivered: db.prepare(`
    UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?
  `),
  
  updateOrderCancelled: db.prepare(`
    UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?
  `),

  // Couriers
  getAllCouriers: db.prepare(`
    SELECT * FROM couriers ORDER BY total_deliveries DESC
  `),
  
  getCourierByWhatsApp: db.prepare(`
    SELECT * FROM couriers WHERE whatsapp_id = ?
  `),
  
  upsertCourier: db.prepare(`
    INSERT INTO couriers (id, name, phone, whatsapp_id, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(whatsapp_id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      last_active_at = excluded.last_active_at
  `),
  
  updateCourierStats: db.prepare(`
    UPDATE couriers SET total_deliveries = total_deliveries + 1, total_earnings = total_earnings + ?, last_active_at = ? WHERE whatsapp_id = ?
  `),

  // Stats
  getStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_count,
      SUM(CASE WHEN status IN ('taken', 'picked') THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
      SUM(CASE WHEN status = 'delivered' THEN price ELSE 0 END) as total_revenue,
      SUM(CASE WHEN status = 'delivered' THEN commission ELSE 0 END) as total_commission
    FROM orders
  `),
};

// Helper to convert DB row to order object
function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    senderName: row.sender_name,
    senderPhone: row.sender_phone,
    pickupAddress: row.pickup_address,
    receiverName: row.receiver_name,
    receiverPhone: row.receiver_phone,
    deliveryAddress: row.delivery_address,
    details: row.details,
    price: row.price,
    commission: row.commission,
    courierPayout: row.courier_payout,
    priority: row.priority,
    status: row.status,
    courier: row.courier_name ? {
      name: row.courier_name,
      phone: row.courier_phone,
      whatsappId: row.courier_whatsapp_id
    } : null,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    takenAt: row.taken_at,
    pickedAt: row.picked_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at
  };
}

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
  
  // Send all orders on connect
  const orders = dbFunctions.getAllOrders.all().map(rowToOrder);
  ws.send(JSON.stringify({ type: 'orders_init', data: { orders } }));
  
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
  
  // Keep alive
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
  const orderId = 'MMH-' + (++orderCounter);
  const commission = Math.round(data.price * CONFIG.COMMISSION_RATE);
  const now = new Date().toISOString();
  
  dbFunctions.createOrder.run(
    orderId,
    data.senderName,
    data.senderPhone,
    data.pickupAddress,
    data.receiverName,
    data.receiverPhone,
    data.deliveryAddress,
    data.details || '',
    data.price,
    commission,
    data.price - commission,
    data.priority || 'normal',
    now
  );
  
  const order = rowToOrder(dbFunctions.getOrderById.get(orderId));
  broadcast({ type: 'new_order', data: { order } });
  console.log('📦 New order created: ' + orderId);
  return order;
};

const handlePublishOrder = async (orderId) => {
  const row = dbFunctions.getOrderById.get(orderId);
  if (!row) return;
  
  const now = new Date().toISOString();
  dbFunctions.updateOrderPublished.run(now, orderId);
  
  const order = rowToOrder(row);
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
    broadcast({ type: 'order_published', data: { orderId } });
    console.log('📤 Order ' + orderId + ' published');
  } catch (error) {
    console.error('Failed to publish:', error.message);
  }
};

const handleOrderPicked = async (orderId) => {
  const row = dbFunctions.getOrderById.get(orderId);
  if (!row) return;
  
  const now = new Date().toISOString();
  dbFunctions.updateOrderPicked.run(now, orderId);
  
  const order = rowToOrder(row);
  
  if (order.courier?.whatsappId) {
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
  
  broadcast({ type: 'order_picked', data: { orderId } });
  console.log('📦 Order ' + orderId + ' picked up');
};

const handleOrderDelivered = async (orderId) => {
  const row = dbFunctions.getOrderById.get(orderId);
  if (!row) return;
  
  const now = new Date().toISOString();
  dbFunctions.updateOrderDelivered.run(now, orderId);
  
  const order = rowToOrder(row);
  
  // Update courier stats
  if (order.courier?.whatsappId) {
    dbFunctions.updateCourierStats.run(order.courierPayout, now, order.courier.whatsappId);
    
    let message = '✅ *המשלוח ' + order.id + ' נמסר בהצלחה!*\n\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '💰 *רווח מהמשלוח:* ₪' + order.courierPayout + '\n';
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';
    message += 'תודה רבה על העבודה! 🙏\n';
    message += 'מחכים למשלוח הבא 🚀';
    
    try { await sendWhatsAppMessage(order.courier.whatsappId, message); } 
    catch (error) { console.error('Failed to send delivery confirmation:', error.message); }
  }
  
  try { 
    await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '✅ המשלוח ' + order.id + ' נמסר בהצלחה!'); 
  } catch (error) { console.error('Failed to notify group:', error.message); }
  
  broadcast({ type: 'order_delivered', data: { orderId } });
  console.log('✅ Order ' + orderId + ' delivered');
};

const handleCancelOrder = async (orderId) => {
  const row = dbFunctions.getOrderById.get(orderId);
  if (!row) return;
  
  const previousStatus = row.status;
  const now = new Date().toISOString();
  dbFunctions.updateOrderCancelled.run(now, orderId);
  
  const order = rowToOrder(row);
  
  if (order.courier?.whatsappId) {
    try { 
      await sendWhatsAppMessage(order.courier.whatsappId, '❌ *המשלוח ' + order.id + ' בוטל*\n\nהמשלוח שתפסת בוטל על ידי המנהל.\nמתנצלים על אי הנוחות.'); 
    } catch (error) { console.error('Failed to notify courier:', error.message); }
  }
  
  if (['published', 'taken', 'picked'].includes(previousStatus)) {
    try { 
      await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '❌ *המשלוח ' + order.id + ' בוטל*'); 
    } catch (error) { console.error('Failed to notify group:', error.message); }
  }
  
  broadcast({ type: 'order_cancelled', data: { orderId } });
  console.log('❌ Order ' + orderId + ' cancelled');
};

// ==================== TAKE ORDER PAGE ====================
app.get('/take/:orderId', (req, res) => {
  const row = dbFunctions.getOrderById.get(req.params.orderId);
  
  if (!row) {
    return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת במערכת', '#ef4444'));
  }
  
  if (row.status !== 'published') {
    const statusMessages = {
      'new': 'ההזמנה עדיין לא פורסמה',
      'taken': 'המשלוח כבר נתפס על ידי שליח אחר',
      'picked': 'המשלוח כבר נאסף',
      'delivered': 'המשלוח כבר נמסר',
      'cancelled': 'המשלוח בוטל'
    };
    return res.send(statusPage('ℹ️', 'לא ניתן לתפוס', statusMessages[row.status] || 'המשלוח אינו זמין', '#f59e0b'));
  }
  
  const order = rowToOrder(row);
  
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>תפוס משלוח - ${order.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: white; }
    .card { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 24px; padding: 30px; max-width: 400px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
    .header { text-align: center; margin-bottom: 25px; }
    .emoji { font-size: 50px; margin-bottom: 15px; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 5px; }
    .order-id { color: #10b981; font-family: monospace; font-size: 18px; }
    .info-box { background: rgba(0,0,0,0.2); border-radius: 16px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255,255,255,0.05); }
    .info-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .info-row:last-child { border-bottom: none; }
    .info-icon { font-size: 20px; }
    .info-label { font-size: 12px; color: #94a3b8; }
    .info-value { font-size: 14px; color: white; margin-top: 2px; }
    .price-box { display: flex; justify-content: space-between; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px; padding: 20px; margin: 20px 0; }
    .price-label { font-size: 14px; opacity: 0.9; }
    .price-value { font-size: 28px; font-weight: 800; }
    .form-group { margin-bottom: 15px; }
    label { display: block; font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
    input { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; font-size: 16px; color: white; }
    input:focus { outline: none; border-color: #10b981; }
    input::placeholder { color: #64748b; }
    .btn { width: 100%; padding: 16px; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(16,185,129,0.3); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .success { text-align: center; padding: 40px 20px; }
    .success h2 { color: #10b981; margin: 15px 0; }
    .success p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card" id="takeForm">
    <div class="header">
      <div class="emoji">🚀</div>
      <h1>תפוס משלוח</h1>
      <div class="order-id">${order.id}</div>
    </div>
    
    <div class="info-box">
      <div class="info-row">
        <span class="info-icon">📍</span>
        <div><div class="info-label">כתובת איסוף</div><div class="info-value">${order.pickupAddress}</div></div>
      </div>
      <div class="info-row">
        <span class="info-icon">🏠</span>
        <div><div class="info-label">כתובת מסירה</div><div class="info-value">${order.deliveryAddress}</div></div>
      </div>
      ${order.details ? `<div class="info-row"><span class="info-icon">📝</span><div><div class="info-label">פרטים</div><div class="info-value">${order.details}</div></div></div>` : ''}
    </div>
    
    <div class="price-box">
      <div><div class="price-label">תשלום לשליח</div><div class="price-value">₪${order.courierPayout}</div></div>
    </div>
    
    <form onsubmit="takeOrder(event)">
      <div class="form-group">
        <label>שם מלא</label>
        <input type="text" id="name" placeholder="הכנס שם מלא" required>
      </div>
      <div class="form-group">
        <label>מספר טלפון</label>
        <input type="tel" id="phone" placeholder="05X-XXXXXXX" required>
      </div>
      <button type="submit" class="btn btn-primary" id="submitBtn">✅ תפוס את המשלוח</button>
    </form>
  </div>
  
  <script>
    async function takeOrder(e) {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'שולח...';
      
      try {
        const res = await fetch('/api/take/${order.id}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('name').value,
            phone: document.getElementById('phone').value
          })
        });
        
        const data = await res.json();
        
        if (data.success) {
          document.getElementById('takeForm').innerHTML = \`
            <div class="success">
              <div class="emoji">🎉</div>
              <h2>תפסת את המשלוח!</h2>
              <p>פרטי המשלוח נשלחו אליך בוואטסאפ</p>
              <div class="info-box" style="margin-top: 20px; text-align: right;">
                <div class="info-row">
                  <span class="info-icon">📍</span>
                  <div><div class="info-label">כתובת איסוף</div><div class="info-value">${order.pickupAddress}</div></div>
                </div>
                <div class="info-row">
                  <span class="info-icon">📞</span>
                  <div><div class="info-label">טלפון השולח</div><div class="info-value">${order.senderPhone}</div></div>
                </div>
              </div>
              <a href="https://waze.com/ul?q=${encodeURIComponent(order.pickupAddress)}" class="btn btn-primary" style="display: block; margin-top: 20px; text-decoration: none;">🗺️ נווט לאיסוף</a>
            </div>
          \`;
        } else {
          alert(data.error || 'שגיאה בתפיסת המשלוח');
          btn.disabled = false;
          btn.textContent = '✅ תפוס את המשלוח';
        }
      } catch (err) {
        alert('שגיאת תקשורת');
        btn.disabled = false;
        btn.textContent = '✅ תפוס את המשלוח';
      }
    }
  </script>
</body>
</html>`);
});

// API: Take order
app.post('/api/take/:orderId', async (req, res) => {
  const { name, phone } = req.body;
  const orderId = req.params.orderId;
  
  const row = dbFunctions.getOrderById.get(orderId);
  if (!row) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  if (row.status !== 'published') return res.status(400).json({ error: 'המשלוח כבר נתפס' });
  
  const nameParts = name.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const whatsappId = phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net';
  const now = new Date().toISOString();
  
  // Update order with courier
  dbFunctions.updateOrderCourier.run(name.trim(), phone, whatsappId, now, orderId);
  
  // Upsert courier
  const courierId = 'C-' + Date.now();
  dbFunctions.upsertCourier.run(courierId, name.trim(), phone, whatsappId, now, now);
  
  const order = rowToOrder(dbFunctions.getOrderById.get(orderId));
  
  // Send details to courier
  const pickupUrl = CONFIG.PUBLIC_URL + '/status/' + order.id + '/pickup';
  
  let fullDetails = '✅ *תפסת את המשלוח ' + order.id + '!*\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n';
  fullDetails += '📤 *פרטי השולח:*\n';
  fullDetails += '👤 שם: ' + order.senderName + '\n';
  fullDetails += '📞 טלפון: ' + order.senderPhone + '\n\n';
  fullDetails += '📍 *כתובת איסוף:*\n' + order.pickupAddress + '\n\n';
  fullDetails += '🔗 *ניווט לאיסוף:*\nhttps://waze.com/ul?q=' + encodeURIComponent(order.pickupAddress) + '\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n';
  fullDetails += '📥 *פרטי המקבל:*\n';
  fullDetails += '👤 שם: ' + order.receiverName + '\n';
  fullDetails += '📞 טלפון: ' + order.receiverPhone + '\n\n';
  fullDetails += '🏠 *כתובת מסירה:*\n' + order.deliveryAddress + '\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n';
  if (order.details) fullDetails += '📝 *פרטים:*\n' + order.details + '\n━━━━━━━━━━━━━━━━━━━━\n';
  fullDetails += '💰 *תשלום אחרי עמלה:* ₪' + order.courierPayout + '\n';
  fullDetails += '━━━━━━━━━━━━━━━━━━━━\n\n';
  fullDetails += '📦 *אספת? לחץ כאן:*\n' + pickupUrl + '\n\n';
  fullDetails += 'בהצלחה! 🚀';

  try { await sendWhatsAppMessage(whatsappId, fullDetails); } 
  catch (error) { console.error('Failed to send details:', error.message); }
  
  try { await sendWhatsAppMessage(CONFIG.WHAPI.COURIERS_GROUP_ID, '✅ המשלוח ' + order.id + ' נתפס על ידי ' + name.trim()); } 
  catch (error) { console.error('Failed to notify group:', error.message); }
  
  broadcast({ type: 'order_taken', data: { orderId, courier: order.courier } });
  console.log('🏍️ Order ' + orderId + ' taken by ' + name.trim());
  res.json({ success: true });
});

// ==================== STATUS UPDATE PAGES ====================
function statusPage(emoji, title, subtitle, color, content = '') {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: white; }
    .card { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 24px; padding: 40px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
    .emoji { font-size: 60px; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 800; color: ${color}; margin-bottom: 10px; }
    p { color: #94a3b8; font-size: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    ${content}
  </div>
</body>
</html>`;
}

app.get('/status/:orderId/pickup', (req, res) => {
  const row = dbFunctions.getOrderById.get(req.params.orderId);
  
  if (!row) return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת', '#ef4444'));
  if (row.status !== 'taken') return res.send(statusPage('ℹ️', 'לא ניתן לעדכן', 'המשלוח כבר עודכן או בוטל', '#f59e0b'));
  
  res.send(statusPage('📦', 'אישור איסוף', `האם אספת את המשלוח ${row.id}?`, '#10b981', `
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button onclick="confirmPickup()" style="flex:1;padding:15px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:12px;color:white;font-size:16px;font-weight:bold;cursor:pointer;">✅ כן, אספתי</button>
      <button onclick="window.close()" style="flex:1;padding:15px;background:#334155;border:none;border-radius:12px;color:white;font-size:16px;cursor:pointer;">❌ לא עדיין</button>
    </div>
    <script>
      async function confirmPickup() {
        try {
          const res = await fetch('/api/status/${row.id}/pickup', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            document.body.innerHTML = '<div style="text-align:center;padding:50px;"><div style="font-size:60px;margin-bottom:20px;">✅</div><h1 style="color:#10b981;margin-bottom:10px;">נרשם בהצלחה!</h1><p style="color:#94a3b8;">המשלוח סומן כנאסף</p></div>';
          } else { alert(data.error || 'שגיאה'); }
        } catch (e) { alert('שגיאת תקשורת'); }
      }
    </script>
  `));
});

app.post('/api/status/:orderId/pickup', async (req, res) => {
  const row = dbFunctions.getOrderById.get(req.params.orderId);
  if (!row) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  if (row.status !== 'taken') return res.status(400).json({ error: 'לא ניתן לעדכן' });
  
  await handleOrderPicked(req.params.orderId);
  res.json({ success: true });
});

app.get('/status/:orderId/deliver', (req, res) => {
  const row = dbFunctions.getOrderById.get(req.params.orderId);
  
  if (!row) return res.send(statusPage('❌', 'הזמנה לא נמצאה', 'ההזמנה אינה קיימת', '#ef4444'));
  if (row.status !== 'picked') {
    if (row.status === 'taken') return res.send(statusPage('ℹ️', 'צריך לאסוף קודם', 'סמן כנאסף לפני מסירה', '#f59e0b'));
    return res.send(statusPage('ℹ️', 'לא ניתן לעדכן', 'המשלוח כבר נמסר או בוטל', '#f59e0b'));
  }
  
  const order = rowToOrder(row);
  
  res.send(statusPage('📬', 'אישור מסירה', `האם מסרת את המשלוח ${order.id}?`, '#10b981', `
    <div style="margin:20px 0;padding:15px;background:#1e293b;border-radius:12px;border:1px solid #334155;text-align:right;">
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
            document.body.innerHTML = '<div style="text-align:center;padding:50px;"><div style="font-size:60px;margin-bottom:20px;">🎉</div><h1 style="color:#10b981;margin-bottom:10px;">המשלוח נמסר!</h1><p style="color:#94a3b8;margin-bottom:20px;">תודה רבה</p><div style="background:#10b98120;padding:20px;border-radius:12px;"><div style="color:#10b981;font-size:14px;">הרווחת</div><div style="color:#10b981;font-size:32px;font-weight:bold;">₪${order.courierPayout}</div></div></div>';
          } else { alert(data.error || 'שגיאה'); }
        } catch (e) { alert('שגיאת תקשורת'); }
      }
    </script>
  `));
});

app.post('/api/status/:orderId/deliver', async (req, res) => {
  const row = dbFunctions.getOrderById.get(req.params.orderId);
  if (!row) return res.status(404).json({ error: 'הזמנה לא נמצאה' });
  if (row.status !== 'picked') return res.status(400).json({ error: 'לא ניתן לעדכן' });
  
  await handleOrderDelivered(req.params.orderId);
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
          const rows = dbFunctions.getAllOrders.all();
          const activeOrder = rows.find(r => r.status === 'taken' && r.courier_whatsapp_id === senderPhone);
          if (activeOrder) await handleOrderPicked(activeOrder.id);
        }
        
        if (text.includes('נמסר') || text.includes('delivered') || text.includes('מסרתי')) {
          const rows = dbFunctions.getAllOrders.all();
          const pickedOrder = rows.find(r => r.status === 'picked' && r.courier_whatsapp_id === senderPhone);
          if (pickedOrder) await handleOrderDelivered(pickedOrder.id);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) { console.error('Webhook error:', error); res.sendStatus(500); }
});

// ==================== API ENDPOINTS ====================
app.get('/api/orders', (req, res) => {
  const orders = dbFunctions.getAllOrders.all().map(rowToOrder);
  res.json(orders);
});

app.get('/api/couriers', (req, res) => {
  const couriers = dbFunctions.getAllCouriers.all();
  res.json(couriers);
});

app.get('/api/stats', (req, res) => {
  const stats = dbFunctions.getStats.get();
  res.json(stats);
});

app.get('/health', (req, res) => {
  const stats = dbFunctions.getStats.get();
  res.json({ 
    status: 'ok', 
    orders: stats.total, 
    delivered: stats.delivered_count,
    uptime: process.uptime() 
  });
});

// ==================== REDIRECT TO FRONTEND ====================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M.M.H Delivery System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; color: white; }
    .card { text-align: center; padding: 40px; }
    .logo { font-size: 80px; margin-bottom: 20px; }
    h1 { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
    p { color: #94a3b8; margin-bottom: 30px; }
    .status { display: inline-flex; align-items: center; gap: 8px; background: #10b98120; color: #10b981; padding: 10px 20px; border-radius: 100px; font-weight: 600; }
    .dot { width: 10px; height: 10px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🚚</div>
    <h1>M.M.H Delivery System</h1>
    <p>מערכת ניהול משלוחים מקצועית</p>
    <div class="status"><span class="dot"></span> השרת פעיל</div>
  </div>
</body>
</html>`);
});

// ==================== START SERVER ====================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🚚  M.M.H Delivery System v3.0  🚚                       ║');
  console.log('║     Server running on port ' + CONFIG.PORT + '                              ║');
  console.log('║     Database: SQLite (mmh_delivery.db)                       ║');
  console.log('║     Public URL: ' + CONFIG.PUBLIC_URL);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  db.close();
  process.exit(0);
});
