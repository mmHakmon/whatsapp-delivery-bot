/**
 * M.M.H Delivery System Pro v4.0
 * Full featured delivery management with PostgreSQL
 * Enhanced Security Edition
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ==================== SECURITY CONFIG ====================
const SECURITY = {
  BCRYPT_ROUNDS: 12, // חזק יותר מ-10
  JWT_ACCESS_EXPIRY: '15m', // טוקן גישה קצר
  JWT_REFRESH_EXPIRY: '7d', // טוקן רענון ארוך
  MAX_LOGIN_ATTEMPTS: 5, // מקסימום ניסיונות כניסה
  LOCKOUT_TIME: 15 * 60 * 1000, // 15 דקות נעילה
  RATE_LIMIT_WINDOW: 60 * 1000, // חלון של דקה
  RATE_LIMIT_MAX: 100, // מקסימום בקשות בדקה
  RATE_LIMIT_LOGIN: 5, // מקסימום ניסיונות התחברות בדקה
};

// ==================== CONFIG ====================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://mmh-delivery.onrender.com',
  JWT_SECRET: process.env.JWT_SECRET || 'mmh-secret-change-this',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'mmh-refresh-secret-change-this',
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    TOKEN: process.env.WHAPI_TOKEN,
    GROUP_ID: process.env.COURIERS_GROUP_ID,
  },
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  COMMISSION: parseFloat(process.env.COMMISSION_RATE) || 0.25,
  NODE_ENV: process.env.NODE_ENV || 'development',
  // מחירון משלוחים
  PRICING: {
    BASE_PRICE: parseFloat(process.env.BASE_PRICE) || 75,      // מחיר בסיס
    PRICE_PER_KM: parseFloat(process.env.PRICE_PER_KM) || 2.5, // מחיר לק"מ נוסף
    FREE_KM: parseFloat(process.env.FREE_KM) || 1,             // ק"מ ראשון חינם
    MIN_PRICE: parseFloat(process.env.MIN_PRICE) || 75,        // מחיר מינימום
    VAT_RATE: parseFloat(process.env.VAT_RATE) || 0.18,        // מע"מ 18%
  }
};

// ==================== DATABASE ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ==================== RATE LIMITING ====================
const rateLimitStore = new Map();
const loginAttempts = new Map();

const rateLimit = (maxRequests = SECURITY.RATE_LIMIT_MAX, windowMs = SECURITY.RATE_LIMIT_WINDOW) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    record.count++;
    if (record.count > maxRequests) {
      logSecurityEvent('RATE_LIMIT', ip, { path: req.path, count: record.count });
      return res.status(429).json({ error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' });
    }
    next();
  };
};

// ניקוי תקופתי של rate limit store
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) rateLimitStore.delete(key);
  }
  for (const [key, record] of loginAttempts.entries()) {
    if (now > record.lockoutUntil) loginAttempts.delete(key);
  }
}, 60000);

// ==================== SECURITY LOGGING ====================
const securityLogs = [];

const logSecurityEvent = async (event, ip, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ip,
    details
  };
  securityLogs.push(logEntry);
  console.log(`🔒 [SECURITY] ${event}:`, JSON.stringify(details));
  
  // שמירה לדאטאבייס
  try {
    await pool.query(
      "INSERT INTO activity_log (action, ip_address, details) VALUES ($1, $2, $3)",
      [event, ip, JSON.stringify(details)]
    );
  } catch (e) { /* ignore */ }
  
  // שמירת רק 1000 לוגים אחרונים בזיכרון
  if (securityLogs.length > 1000) securityLogs.shift();
};

// ==================== EXPRESS ====================
const app = express();

// Helmet-style security headers
app.use((req, res, next) => {
  // מונע clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // מונע MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' wss: ws: https:;");
  // HSTS - רק ב-production
  if (CONFIG.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// HTTPS redirect בproduction
app.use((req, res, next) => {
  if (CONFIG.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(cors({ 
  origin: CONFIG.NODE_ENV === 'production' ? CONFIG.PUBLIC_URL : '*',
  credentials: true 
}));
app.use(express.json({ limit: '10mb' })); // הגבלת גודל בקשה
app.use(rateLimit()); // Rate limiting גלובלי

// ==================== STATIC LOGO ====================
// הלוגו יכול להיות מקישור חיצוני או מקובץ סטטי
const LOGO_URL = process.env.LOGO_URL || 'https://i.ibb.co/39WjvNZm/favicon.png';

// Route לתמונת הלוגו (אם תרצה להשתמש בקובץ מקומי)
app.get('/logo.png', (req, res) => {
  res.redirect(LOGO_URL);
});

const server = http.createServer(app);

// ==================== AUTH ====================
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    CONFIG.JWT_SECRET,
    { expiresIn: SECURITY.JWT_ACCESS_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    CONFIG.JWT_REFRESH_SECRET,
    { expiresIn: SECURITY.JWT_REFRESH_EXPIRY }
  );
  return { accessToken, refreshToken };
};

const verifyToken = (token) => {
  try { return jwt.verify(token, CONFIG.JWT_SECRET); } 
  catch (e) { return null; }
};

const verifyRefreshToken = (token) => {
  try { return jwt.verify(token, CONFIG.JWT_REFRESH_SECRET); } 
  catch (e) { return null; }
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'נדרשת התחברות' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'טוקן לא תקין או פג תוקף' });
  req.user = decoded;
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'אין הרשאה' });
  next();
};

// בדיקת נעילת חשבון
const checkLoginAttempts = (ip, username) => {
  const key = `${ip}:${username}`;
  const record = loginAttempts.get(key);
  if (!record) return { locked: false };
  
  if (Date.now() < record.lockoutUntil) {
    const remainingMs = record.lockoutUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingMin };
  }
  return { locked: false };
};

const recordFailedLogin = (ip, username) => {
  const key = `${ip}:${username}`;
  const record = loginAttempts.get(key) || { count: 0, lockoutUntil: 0 };
  record.count++;
  
  if (record.count >= SECURITY.MAX_LOGIN_ATTEMPTS) {
    record.lockoutUntil = Date.now() + SECURITY.LOCKOUT_TIME;
    logSecurityEvent('ACCOUNT_LOCKED', ip, { username, attempts: record.count });
  }
  
  loginAttempts.set(key, record);
};

const clearLoginAttempts = (ip, username) => {
  loginAttempts.delete(`${ip}:${username}`);
};

// ==================== 2FA ====================
const generate2FACode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const twoFACodes = new Map(); // userId -> { code, expiresAt }

const send2FACode = async (userId, phone) => {
  const code = generate2FACode();
  twoFACodes.set(userId, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 דקות
  });
  
  // שליחה בווצאפ
  if (CONFIG.WHAPI.TOKEN && phone) {
    const waId = phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net';
    await sendWhatsApp(waId, `🔐 קוד האימות שלך: *${code}*\n\nתוקף: 5 דקות`);
  }
  
  return code;
};

const verify2FACode = (userId, code) => {
  const record = twoFACodes.get(userId);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    twoFACodes.delete(userId);
    return false;
  }
  if (record.code !== code) return false;
  twoFACodes.delete(userId);
  return true;
};

// ==================== WEBSOCKET ====================
const wss = new WebSocket.Server({ server });
const clients = new Map();

const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
};

wss.on('connection', async (ws) => {
  console.log('🔌 Client connected');
  try {
    const orders = await getOrders();
    const stats = await getStats();
    ws.send(JSON.stringify({ type: 'init', data: { orders, stats } }));
  } catch (e) { console.error('Init error:', e); }
  
  ws.on('message', async (msg) => {
    try {
      const { type, token, ...data } = JSON.parse(msg);
      if (type === 'auth') {
        const user = verifyToken(data.token);
        if (user) { clients.set(ws, user); ws.send(JSON.stringify({ type: 'auth_success' })); }
        return;
      }
      const user = clients.get(ws);
      if (type === 'create_order' && user) {
        const order = await createOrder(data.data, user.id);
        broadcast({ type: 'new_order', data: { order } });
      } else if (type === 'publish') {
        await publishOrder(data.orderId);
      } else if (type === 'cancel') {
        await cancelOrder(data.orderId, data.reason, user?.id);
      }
    } catch (e) { console.error('WS Error:', e); }
  });
  
  ws.on('close', () => { clients.delete(ws); console.log('🔌 Disconnected'); });
  const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 30000);
  ws.on('close', () => clearInterval(ping));
});

// ==================== WHATSAPP ====================
const sendWhatsApp = async (to, message) => {
  if (!CONFIG.WHAPI.TOKEN) { console.log('📱 WA:', message.substring(0, 50)); return; }
  try {
    await axios.post(CONFIG.WHAPI.API_URL + '/messages/text', { to, body: message }, 
      { headers: { Authorization: 'Bearer ' + CONFIG.WHAPI.TOKEN } });
  } catch (e) { console.error('WA error:', e.message); }
};

// שליחת הודעה עם תמונה
const sendWhatsAppImage = async (to, imageUrl, caption) => {
  if (!CONFIG.WHAPI.TOKEN) { console.log('📱 WA Image:', caption.substring(0, 50)); return; }
  try {
    // Whapi format - image with caption
    const response = await axios.post(CONFIG.WHAPI.API_URL + '/messages/image', { 
      to: to,
      media: imageUrl,  // URL ישיר, לא אובייקט
      caption: caption
    }, { 
      headers: { 
        'Authorization': 'Bearer ' + CONFIG.WHAPI.TOKEN,
        'Content-Type': 'application/json'
      } 
    });
    console.log('📷 WA Image sent successfully');
  } catch (e) { 
    console.error('WA Image error:', e.response?.data || e.message);
    // אם נכשל, ננסה לשלוח טקסט רגיל
    console.log('📱 Falling back to text message...');
    await sendWhatsApp(to, caption);
  }
};

// ==================== DB HELPERS ====================
const getOrders = async (filters = {}) => {
  let q = `SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph 
           FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id WHERE 1=1`;
  const p = [];
  let i = 1;
  if (filters.status) { q += ` AND o.status = $${i++}`; p.push(filters.status); }
  if (filters.search) { q += ` AND (o.order_number ILIKE $${i} OR o.sender_name ILIKE $${i})`; p.push(`%${filters.search}%`); i++; }
  q += ' ORDER BY o.created_at DESC LIMIT 200';
  const r = await pool.query(q, p);
  return r.rows.map(formatOrder);
};

const getStats = async () => {
  const ordersStats = await pool.query(`
    SELECT COUNT(*) as total,
      COUNT(CASE WHEN status='new' THEN 1 END) as new,
      COUNT(CASE WHEN status='published' THEN 1 END) as published,
      COUNT(CASE WHEN status IN ('taken','picked') THEN 1 END) as active,
      COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
      COALESCE(SUM(CASE WHEN status='delivered' THEN price END),0) as revenue,
      COALESCE(SUM(CASE WHEN status='delivered' THEN commission END),0) as commission,
      COALESCE(SUM(CASE WHEN status='delivered' THEN courier_payout END),0) as total_payout
    FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`);
  
  // קבל סה"כ תשלומים שבוצעו לשליחים ב-30 יום
  const paymentsStats = await pool.query(`
    SELECT COALESCE(SUM(amount),0) as total_paid
    FROM payments WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`);
  
  return {
    ...ordersStats.rows[0],
    total_paid: paymentsStats.rows[0].total_paid,
    net_profit: parseFloat(ordersStats.rows[0].commission) // הרווח נקי = העמלות שלנו
  };
};

const formatOrder = (o) => ({
  id: o.id, orderNumber: o.order_number, senderName: o.sender_name, senderPhone: o.sender_phone,
  pickupAddress: o.pickup_address, receiverName: o.receiver_name, receiverPhone: o.receiver_phone,
  deliveryAddress: o.delivery_address, details: o.details, priority: o.priority,
  price: parseFloat(o.price), commission: parseFloat(o.commission||0), courierPayout: parseFloat(o.courier_payout||0),
  status: o.status, createdAt: o.created_at,
  courier: o.courier_id ? { id: o.courier_id, name: `${o.cfn} ${o.cln}`, phone: o.cph } : null
});

// ==================== ORDER FUNCTIONS ====================
const createOrder = async (data, userId) => {
  const cnt = await pool.query("SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)),100)+1 as n FROM orders");
  const orderNum = 'MMH-' + cnt.rows[0].n;
  const comm = Math.round(data.price * CONFIG.COMMISSION);
  const payout = data.price - comm;
  
  const r = await pool.query(`
    INSERT INTO orders (order_number,sender_name,sender_phone,pickup_address,receiver_name,receiver_phone,
      delivery_address,details,priority,price,commission_rate,commission,courier_payout,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [orderNum,data.senderName,data.senderPhone,data.pickupAddress,data.receiverName,data.receiverPhone,
     data.deliveryAddress,data.details||'',data.priority||'normal',data.price,CONFIG.COMMISSION*100,comm,payout,userId]);
  console.log('📦 Created:', orderNum);
  return formatOrder(r.rows[0]);
};

const publishOrder = async (id) => {
  const r = await pool.query("UPDATE orders SET status='published',published_at=NOW() WHERE id=$1 RETURNING *",[id]);
  const o = r.rows[0]; if (!o) return;
  const url = CONFIG.PUBLIC_URL + '/take/' + o.order_number;
  const emoji = {normal:'📦',express:'⚡',urgent:'🚨'}[o.priority]||'📦';
  
  let msg = `${emoji} *משלוח חדש - ${o.order_number}*\n\n`;
  msg += `📍 *איסוף:* ${o.pickup_address}\n`;
  msg += `🏠 *יעד:* ${o.delivery_address}\n`;
  if (o.details) msg += `📝 *פרטים:* ${o.details}\n`;
  msg += `\n💰 *תשלום סופי לאחר קיזוז עמלה:* ₪${o.courier_payout}\n\n`;
  msg += `👇 *לתפיסה:*\n${url}`;
  
  if (CONFIG.WHAPI.GROUP_ID) {
    // תמונה לוואטסאפ - התמונה החדשה שלך!
    const whatsappImageUrl = process.env.WHATSAPP_IMAGE_URL || 'https://i.ibb.co/Rk3qyrvq/pages2.jpg';
    await sendWhatsAppImage(CONFIG.WHAPI.GROUP_ID, whatsappImageUrl, msg);
  }
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(o) } });
  console.log('📤 Published:', o.order_number);
};

const takeOrder = async (orderNum, cd) => {
  const or = await pool.query("SELECT * FROM orders WHERE order_number=$1 AND status='published'",[orderNum]);
  const o = or.rows[0]; if (!o) return { success: false, error: 'המשלוח כבר נתפס !' };
  
  let cr = await pool.query("SELECT * FROM couriers WHERE id_number=$1",[cd.idNumber]);
  if (!cr.rows[0]) {
    const waId = cd.phone.replace(/^0/,'972').replace(/-/g,'')+'@s.whatsapp.net';
    cr = await pool.query("INSERT INTO couriers (first_name,last_name,id_number,phone,whatsapp_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [cd.firstName,cd.lastName,cd.idNumber,cd.phone,waId]);
  }
  const cid = cr.rows[0].id, waId = cr.rows[0].whatsapp_id;
  
  await pool.query("UPDATE orders SET status='taken',taken_at=NOW(),courier_id=$1 WHERE id=$2",[cid,o.id]);
  
  const pickupUrl = CONFIG.PUBLIC_URL + '/status/' + o.order_number + '/pickup';
  let msg = `✅ *תפסת את המשלוח ${o.order_number}!*\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📤 *פרטי השולח:*\n👤 שם: ${o.sender_name}\n📞 טלפון: ${o.sender_phone}\n\n`;
  msg += `📍 *כתובת איסוף:*\n${o.pickup_address}\n\n`;
  msg += `🔗 *ניווט:*\nhttps://waze.com/ul?q=${encodeURIComponent(o.pickup_address)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (o.details) msg += `📝 *פרטים:*\n${o.details}\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *תשלום אחרי עמלה:* ₪${o.courier_payout}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n📦 *אספת? תסמן – ואני אתן לך את פרטי המסירה:*\n${pickupUrl}\n\nסעו בזהירות הכי חשוב ! ! 🚀`;
  
  await sendWhatsApp(waId, msg);
  if (CONFIG.WHAPI.GROUP_ID) await sendWhatsApp(CONFIG.WHAPI.GROUP_ID, `✅ המשלוח ${o.order_number} נתפס על ידי ${cd.firstName} ${cd.lastName}`);
  
  const upd = await pool.query(`SELECT o.*,c.first_name as cfn,c.last_name as cln,c.phone as cph FROM orders o 
    LEFT JOIN couriers c ON o.courier_id=c.id WHERE o.id=$1`,[o.id]);
  broadcast({ type: 'order_updated', data: { order: formatOrder(upd.rows[0]) } });
  console.log('🏍️ Taken:', o.order_number);
  return { success: true };
};

const pickupOrder = async (orderNum) => {
  const r = await pool.query("UPDATE orders SET status='picked',picked_at=NOW() WHERE order_number=$1 AND status='taken' RETURNING *",[orderNum]);
  const o = r.rows[0]; if (!o) return { success: false };
  
  const cr = await pool.query("SELECT * FROM couriers WHERE id=$1",[o.courier_id]);
  if (cr.rows[0]?.whatsapp_id) {
    const url = CONFIG.PUBLIC_URL + '/status/' + o.order_number + '/deliver';
    let msg = `📦 *אישור איסוף - ${o.order_number}*\n\n✅ המשלוח סומן כנאסף!\n\n`;
    msg += `🏠 *כתובת מסירה:*\n${o.delivery_address}\n\n`;
    msg += `👤 *מקבל:* ${o.receiver_name}\n📞 *טלפון:* ${o.receiver_phone}\n\n`;
    msg += `🔗 *ניווט:*\nhttps://waze.com/ul?q=${encodeURIComponent(o.delivery_address)}\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n📬 *סיימת מסירה? תפנק בלחיצה — והכסף בדרך אליך.:*\n${url}`;
    await sendWhatsApp(cr.rows[0].whatsapp_id, msg);
  }
  
  const upd = await pool.query(`SELECT o.*,c.first_name as cfn,c.last_name as cln,c.phone as cph FROM orders o 
    LEFT JOIN couriers c ON o.courier_id=c.id WHERE o.id=$1`,[o.id]);
  broadcast({ type: 'order_updated', data: { order: formatOrder(upd.rows[0]) } });
  return { success: true };
};

const deliverOrder = async (orderNum) => {
  const r = await pool.query("UPDATE orders SET status='delivered',delivered_at=NOW() WHERE order_number=$1 AND status='picked' RETURNING *",[orderNum]);
  const o = r.rows[0]; if (!o) return { success: false };
  
  await pool.query("UPDATE couriers SET total_deliveries=total_deliveries+1,total_earned=total_earned+$1,balance=balance+$1 WHERE id=$2",
    [o.courier_payout,o.courier_id]);
  
  const cr = await pool.query("SELECT * FROM couriers WHERE id=$1",[o.courier_id]);
  if (cr.rows[0]?.whatsapp_id) {
    await sendWhatsApp(cr.rows[0].whatsapp_id, `✅ *המשלוח ${o.order_number} נמסר!*\n\n━━━━━━━━━━━━━━━━━━━━\n💰 *רווח:* ₪${o.courier_payout}\n━━━━━━━━━━━━━━━━━━━━\n\nתודה! 🙏`);
  }
  // הסרנו את ההודעה לקבוצה - רק השליח מקבל אישור בפרטי
  
  const upd = await pool.query(`SELECT o.*,c.first_name as cfn,c.last_name as cln,c.phone as cph FROM orders o 
    LEFT JOIN couriers c ON o.courier_id=c.id WHERE o.id=$1`,[o.id]);
  broadcast({ type: 'order_updated', data: { order: formatOrder(upd.rows[0]) } });
  broadcast({ type: 'stats_updated', data: await getStats() });
  console.log('✅ Delivered:', o.order_number);
  return { success: true };
};

const cancelOrder = async (id, reason, userId) => {
  // קודם נשמור את הסטטוס הישן לפני העדכון
  const check = await pool.query("SELECT status, order_number FROM orders WHERE id=$1", [id]);
  const oldStatus = check.rows[0]?.status;
  const orderNum = check.rows[0]?.order_number;
  
  const r = await pool.query("UPDATE orders SET status='cancelled',cancelled_at=NOW(),cancel_reason=$1 WHERE id=$2 RETURNING *",[reason,id]);
  const o = r.rows[0]; if (!o) return;
  
  // שלח הודעה לשליח אם היה מוקצה
  if (o.courier_id) {
    const cr = await pool.query("SELECT * FROM couriers WHERE id=$1",[o.courier_id]);
    if (cr.rows[0]?.whatsapp_id) await sendWhatsApp(cr.rows[0].whatsapp_id, `❌ *המשלוח ${o.order_number} בוטל*\n\n${reason ? 'סיבה: ' + reason : ''}`);
  }
  
  // שלח הודעה לקבוצה אם המשלוח היה מפורסם/נתפס/נאסף
  if (CONFIG.WHAPI.GROUP_ID && ['published','taken','picked'].includes(oldStatus)) {
    await sendWhatsApp(CONFIG.WHAPI.GROUP_ID, `❌ *המשלוח ${o.order_number} בוטל*${reason ? '\nסיבה: ' + reason : ''}`);
  }
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(o) } });
  console.log('❌ Cancelled:', o.order_number, '(was:', oldStatus, ')');
};

// ==================== COURIER IDENTIFICATION SYSTEM ====================
/**
 * זיהוי שליח לפי WhatsApp ID
 */
const getCourierByWhatsAppId = async (whatsappId) => {
  try {
    const r = await pool.query("SELECT * FROM couriers WHERE whatsapp_id = $1", [whatsappId]);
    return r.rows[0] || null;
  } catch (e) {
    console.error('Error getting courier by WhatsApp ID:', e);
    return null;
  }
};

/**
 * זיהוי שליח לפי מספר טלפון - עם וריאנטים
 */
const getCourierByPhone = async (phone) => {
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneVariants = [
      phone,
      cleanPhone,
      cleanPhone.replace(/^0/, '972'),
      cleanPhone.replace(/^972/, '0'),
      '0' + cleanPhone.replace(/^972/, ''),
      '972' + cleanPhone.replace(/^0/, '')
    ];
    
    const r = await pool.query("SELECT * FROM couriers WHERE phone = ANY($1) OR REPLACE(phone, '-', '') = ANY($1)", [phoneVariants]);
    return r.rows[0] || null;
  } catch (e) {
    console.error('Error getting courier by phone:', e);
    return null;
  }
};

/**
 * רישום שליח חדש עם כל הפרטים
 */
const registerCourier = async (data) => {
  try {
    const { firstName, lastName, idNumber, phone, email, vehicleType, whatsappId } = data;
    
    // בדיקה שהשליח לא קיים
    const existing = await pool.query(
      "SELECT id FROM couriers WHERE id_number = $1 OR phone = $2 OR REPLACE(phone, '-', '') = $3",
      [idNumber, phone, phone.replace(/[^0-9]/g, '')]
    );
    
    if (existing.rows.length > 0) {
      return { 
        success: false, 
        error: 'שליח עם פרטים אלו כבר קיים במערכת',
        existingId: existing.rows[0].id 
      };
    }
    
    // יצירת WhatsApp ID אם לא סופק
    const waId = whatsappId || phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net';
    
    const r = await pool.query(`
      INSERT INTO couriers (first_name, last_name, id_number, phone, whatsapp_id, email, vehicle_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active') 
      RETURNING *
    `, [firstName, lastName, idNumber, phone, waId, email || null, vehicleType || 'motorcycle']);
    
    console.log(`✅ שליח חדש נרשם: ${firstName} ${lastName} (${phone})`);
    
    // שלח הודעת ברוכים הבאים
    await sendWhatsApp(waId, 
      `🎉 ברוך הבא ל-M.M.H Delivery!\n\n` +
      `היי ${firstName}! 👋\n\n` +
      `הרישום שלך הושלם בהצלחה.\n` +
      `מעכשיו תוכל לתפוס משלוחים בלחיצה אחת!\n\n` +
      `בהצלחה! 🚀`
    );
    
    return { success: true, courier: r.rows[0] };
  } catch (e) {
    console.error('Error registering courier:', e);
    return { success: false, error: 'שגיאת שרת' };
  }
};

// ==================== API ROUTES ====================

// Login עם Rate Limiting חזק + נעילת חשבון + 2FA
app.post('/api/auth/login', rateLimit(SECURITY.RATE_LIMIT_LOGIN, SECURITY.RATE_LIMIT_WINDOW), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  try {
    const { username, password, twoFactorCode } = req.body;
    
    // בדיקת נעילת חשבון
    const lockStatus = checkLoginAttempts(ip, username);
    if (lockStatus.locked) {
      logSecurityEvent('LOGIN_BLOCKED', ip, { username, reason: 'account_locked' });
      return res.json({ success: false, error: `החשבון נעול. נסה שוב בעוד ${lockStatus.remainingMin} דקות` });
    }
    
    const r = await pool.query("SELECT * FROM users WHERE username=$1 AND active=true",[username]);
    const user = r.rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordFailedLogin(ip, username);
      logSecurityEvent('LOGIN_FAILED', ip, { username, reason: 'invalid_credentials' });
      return res.json({ success: false, error: 'שם משתמש או סיסמה שגויים' });
    }
    
    // אם זה אדמין ויש לו 2FA מופעל
    if (user.role === 'admin' && user.two_factor_enabled) {
      if (!twoFactorCode) {
        // שלח קוד 2FA
        await send2FACode(user.id, user.phone);
        logSecurityEvent('2FA_SENT', ip, { username });
        return res.json({ success: false, requires2FA: true, message: 'קוד אימות נשלח לטלפון שלך' });
      }
      
      // אמת קוד 2FA
      if (!verify2FACode(user.id, twoFactorCode)) {
        logSecurityEvent('2FA_FAILED', ip, { username });
        return res.json({ success: false, error: 'קוד אימות שגוי או פג תוקף' });
      }
    }
    
    // התחברות מוצלחת
    clearLoginAttempts(ip, username);
    await pool.query("UPDATE users SET last_login=NOW() WHERE id=$1",[user.id]);
    
    const tokens = generateTokens(user);
    
    // שמור refresh token בדאטאבייס
    await pool.query(
      "UPDATE users SET refresh_token=$1 WHERE id=$2",
      [tokens.refreshToken, user.id]
    );
    
    logSecurityEvent('LOGIN_SUCCESS', ip, { username, role: user.role });
    
    res.json({ 
      success: true, 
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    });
  } catch (e) { 
    console.error('Login error:', e);
    logSecurityEvent('LOGIN_ERROR', ip, { error: e.message });
    res.status(500).json({ success: false, error: 'שגיאת שרת' }); 
  }
});

// Refresh Token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'נדרש refresh token' });
    
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) return res.status(401).json({ error: 'refresh token לא תקין' });
    
    // וודא שהטוקן תואם לזה שבדאטאבייס
    const r = await pool.query("SELECT * FROM users WHERE id=$1 AND refresh_token=$2 AND active=true", 
      [decoded.id, refreshToken]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'refresh token לא תקין' });
    
    const tokens = generateTokens(user);
    
    // עדכן refresh token
    await pool.query("UPDATE users SET refresh_token=$1 WHERE id=$2", [tokens.refreshToken, user.id]);
    
    res.json({ 
      success: true, 
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// Logout - ביטול refresh token
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE users SET refresh_token=NULL WHERE id=$1", [req.user.id]);
    logSecurityEvent('LOGOUT', req.ip, { username: req.user.username });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// הפעלת/ביטול 2FA
app.post('/api/auth/toggle-2fa', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("SELECT two_factor_enabled, phone FROM users WHERE id=$1", [req.user.id]);
    const user = r.rows[0];
    
    if (!user.phone) {
      return res.json({ success: false, error: 'נדרש מספר טלפון להפעלת 2FA' });
    }
    
    const newStatus = !user.two_factor_enabled;
    await pool.query("UPDATE users SET two_factor_enabled=$1 WHERE id=$2", [newStatus, req.user.id]);
    
    logSecurityEvent(newStatus ? '2FA_ENABLED' : '2FA_DISABLED', req.ip, { username: req.user.username });
    res.json({ success: true, enabled: newStatus });
  } catch (e) {
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// לוג אבטחה (לאדמין)
app.get('/api/admin/security-logs', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM activity_log WHERE action LIKE 'LOGIN%' OR action LIKE '2FA%' OR action LIKE 'RATE%' OR action LIKE 'ACCOUNT%' ORDER BY created_at DESC LIMIT 100"
    );
    res.json({ logs: r.rows, memoryLogs: securityLogs.slice(-50) });
  } catch (e) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ success:true, user:req.user }));

app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("SELECT id,username,name,role,phone,email,active,two_factor_enabled,created_at FROM users ORDER BY created_at DESC");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, name, role, phone, email } = req.body;
    const hash = await bcrypt.hash(password, SECURITY.BCRYPT_ROUNDS);
    const r = await pool.query("INSERT INTO users (username,password,name,role,phone,email) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,username,name,role",
      [username,hash,name,role||'agent',phone,email]);
    logSecurityEvent('USER_CREATED', req.ip, { createdBy: req.user.username, newUser: username });
    res.json({ success:true, user:r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.json({ success:false, error:'שם משתמש קיים' });
    res.status(500).json({ success:false, error:'שגיאת שרת' });
  }
});

// עדכון משתמש
app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, role, phone, email, active } = req.body;
    await pool.query("UPDATE users SET name=$1,role=$2,phone=$3,email=$4,active=$5 WHERE id=$6",
      [name,role,phone,email,active,req.params.id]);
    logSecurityEvent('USER_UPDATED', req.ip, { updatedBy: req.user.username, userId: req.params.id });
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// שינוי סיסמה למשתמש (אדמין בלבד)
app.put('/api/users/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.json({ success:false, error:'סיסמה חייבת להכיל לפחות 6 תווים' });
    const hash = await bcrypt.hash(password, SECURITY.BCRYPT_ROUNDS);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2",[hash,req.params.id]);
    logSecurityEvent('PASSWORD_CHANGED', req.ip, { changedBy: req.user.username, userId: req.params.id });
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// שינוי סיסמה עצמית
app.put('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const r = await pool.query("SELECT password FROM users WHERE id=$1",[req.user.id]);
    if (!r.rows[0] || !(await bcrypt.compare(oldPassword, r.rows[0].password)))
      return res.json({ success:false, error:'סיסמה נוכחית שגויה' });
    if (!newPassword || newPassword.length < 6) return res.json({ success:false, error:'סיסמה חייבת להכיל לפחות 6 תווים' });
    const hash = await bcrypt.hash(newPassword, SECURITY.BCRYPT_ROUNDS);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2",[hash,req.user.id]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// מחיקת משתמש
app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // לא ניתן למחוק את עצמך
    if (parseInt(req.params.id) === req.user.id) return res.json({ success:false, error:'לא ניתן למחוק את עצמך' });
    await pool.query("DELETE FROM users WHERE id=$1",[req.params.id]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.get('/api/couriers', requireAuth, async (req, res) => {
  try { const r = await pool.query("SELECT * FROM couriers ORDER BY created_at DESC"); res.json(r.rows); }
  catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/couriers/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM couriers WHERE id=$1",[req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error:'לא נמצא' });
    const orders = await pool.query("SELECT * FROM orders WHERE courier_id=$1 ORDER BY created_at DESC LIMIT 50",[req.params.id]);
    res.json({ ...r.rows[0], orders:orders.rows });
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.put('/api/couriers/:id', requireAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    await pool.query("UPDATE couriers SET status=$1,notes=$2,updated_at=NOW() WHERE id=$3",[status,notes,req.params.id]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// ==================== COURIER REGISTRATION & IDENTIFICATION API ====================

/**
 * דף רישום שליח - GET
 */
app.get('/courier/register/:whatsappId?', async (req, res) => {
  try {
    const whatsappId = req.params.whatsappId;
    
    // אם יש WhatsApp ID, נבדוק אם השליח קיים
    if (whatsappId) {
      const courier = await getCourierByWhatsAppId(whatsappId);
      if (courier) {
        return res.redirect(`/courier/${courier.phone}`);
      }
    }
    
    res.send(courierRegistrationHTML(whatsappId));
  } catch (e) {
    console.error('Registration page error:', e);
    res.status(500).send('שגיאה');
  }
});

/**
 * רישום שליח - POST
 */
app.post('/api/courier/register', async (req, res) => {
  try {
    const result = await registerCourier(req.body);
    res.json(result);
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

/**
 * זיהוי שליח - GET
 */
app.get('/api/courier/identify/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    let courier = await getCourierByWhatsAppId(identifier);
    if (!courier) {
      courier = await getCourierByPhone(identifier);
    }
    
    if (courier) {
      res.json({ 
        success: true, 
        found: true,
        courier: {
          id: courier.id,
          name: `${courier.first_name} ${courier.last_name}`,
          phone: courier.phone,
          vehicleType: courier.vehicle_type,
          registered: true
        }
      });
    } else {
      res.json({ success: true, found: false, message: 'שליח לא נמצא במערכת' });
    }
  } catch (e) {
    console.error('Identify error:', e);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

/**
 * סטטיסטיקות שליח מפורטות
 */
app.get('/api/courier/stats/:phone', async (req, res) => {
  try {
    const courier = await getCourierByPhone(req.params.phone);
    if (!courier) {
      return res.status(404).json({ error: 'שליח לא נמצא' });
    }
    
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN courier_payout END), 0) as total_earned
      FROM orders WHERE courier_id = $1
    `, [courier.id]);
    
    const today = await pool.query(`
      SELECT COUNT(*) as today_count, COALESCE(SUM(courier_payout), 0) as today_earned
      FROM orders WHERE courier_id = $1 AND status = 'delivered' AND DATE(delivered_at) = CURRENT_DATE
    `, [courier.id]);
    
    const week = await pool.query(`
      SELECT COUNT(*) as week_count, COALESCE(SUM(courier_payout), 0) as week_earned
      FROM orders WHERE courier_id = $1 AND status = 'delivered' AND delivered_at >= CURRENT_DATE - INTERVAL '7 days'
    `, [courier.id]);
    
    res.json({
      courier: {
        name: `${courier.first_name} ${courier.last_name}`,
        phone: courier.phone,
        vehicleType: courier.vehicle_type,
        rating: courier.rating,
        balance: courier.balance
      },
      stats: stats.rows[0],
      today: today.rows[0],
      week: week.rows[0]
    });
  } catch (e) {
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

/**
 * מיגרציה להוספת עמודות חדשות לשליחים
 */
app.post('/api/admin/migrate-couriers', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS email VARCHAR(100)`);
    await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(30) DEFAULT 'motorcycle'`);
    console.log('✅ Migration completed: email, vehicle_type columns added');
    res.json({ success: true, message: 'עדכון בוצע בהצלחה' });
  } catch (e) {
    console.error('Migration error:', e);
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try { res.json(await getOrders(req.query)); } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/orders/stats', requireAuth, async (req, res) => {
  try { res.json(await getStats()); } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const order = await createOrder(req.body, req.user.id);
    broadcast({ type:'new_order', data:{ order } });
    res.json({ success:true, order });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.post('/api/orders/:id/publish', requireAuth, async (req, res) => {
  try { await publishOrder(req.params.id); res.json({ success:true }); }
  catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
  try { await cancelOrder(req.params.id, req.body.reason, req.user.id); res.json({ success:true }); }
  catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// עריכת הזמנה (רק אם סטטוס new או published)
app.put('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const { senderName, senderPhone, pickupAddress, receiverName, receiverPhone, deliveryAddress, details, price, priority } = req.body;
    const check = await pool.query("SELECT status FROM orders WHERE id=$1",[req.params.id]);
    if (!check.rows[0]) return res.json({ success:false, error:'הזמנה לא נמצאה' });
    if (!['new','published'].includes(check.rows[0].status)) 
      return res.json({ success:false, error:'לא ניתן לערוך הזמנה שכבר נתפסה' });
    
    const comm = Math.round(price * CONFIG.COMMISSION);
    const payout = price - comm;
    
    await pool.query(`UPDATE orders SET sender_name=$1,sender_phone=$2,pickup_address=$3,
      receiver_name=$4,receiver_phone=$5,delivery_address=$6,details=$7,price=$8,priority=$9,
      commission=$10,courier_payout=$11 WHERE id=$12`,
      [senderName,senderPhone,pickupAddress,receiverName,receiverPhone,deliveryAddress,details,price,priority,comm,payout,req.params.id]);
    
    const upd = await pool.query(`SELECT o.*,c.first_name as cfn,c.last_name as cln,c.phone as cph FROM orders o 
      LEFT JOIN couriers c ON o.courier_id=c.id WHERE o.id=$1`,[req.params.id]);
    broadcast({ type: 'order_updated', data: { order: formatOrder(upd.rows[0]) } });
    res.json({ success:true });
  } catch (e) { console.error(e); res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// מחיקת הזמנה (רק אם new או cancelled - אדמין בלבד)
app.delete('/api/orders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const check = await pool.query("SELECT status FROM orders WHERE id=$1",[req.params.id]);
    if (!check.rows[0]) return res.json({ success:false, error:'הזמנה לא נמצאה' });
    if (!['new','cancelled'].includes(check.rows[0].status)) 
      return res.json({ success:false, error:'ניתן למחוק רק הזמנות חדשות או מבוטלות' });
    
    await pool.query("DELETE FROM orders WHERE id=$1",[req.params.id]);
    broadcast({ type: 'order_deleted', data: { orderId: parseInt(req.params.id) } });
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.get('/api/payments', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const r = await pool.query("SELECT p.*,c.first_name,c.last_name FROM payments p JOIN couriers c ON p.courier_id=c.id ORDER BY p.created_at DESC LIMIT 100");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.post('/api/payments', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { courier_id, amount, method, notes } = req.body;
    await pool.query("INSERT INTO payments (courier_id,amount,method,notes,created_by) VALUES ($1,$2,$3,$4,$5)",[courier_id,amount,method,notes,req.user.id]);
    await pool.query("UPDATE couriers SET balance=balance-$1 WHERE id=$2",[amount,courier_id]);
    await logActivity(req.user.id, 'PAYMENT', `תשלום ₪${amount} לשליח #${courier_id}`, { courier_id, amount, method });
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// ==================== ACTIVITY LOG ====================
const logActivity = async (userId, action, description, details = {}) => {
  try {
    await pool.query(
      "INSERT INTO activity_log (user_id, action, description, details) VALUES ($1,$2,$3,$4)",
      [userId, action, description, JSON.stringify(details)]
    );
  } catch (e) { console.error('Log error:', e); }
};

app.get('/api/activity-log', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { limit = 100, action, userId, from, to } = req.query;
    let q = `SELECT a.*, u.name as user_name FROM activity_log a 
             LEFT JOIN users u ON a.user_id = u.id WHERE 1=1`;
    const p = [];
    let i = 1;
    if (action) { q += ` AND a.action = $${i++}`; p.push(action); }
    if (userId) { q += ` AND a.user_id = $${i++}`; p.push(userId); }
    if (from) { q += ` AND a.created_at >= $${i++}`; p.push(from); }
    if (to) { q += ` AND a.created_at <= $${i++}`; p.push(to); }
    q += ` ORDER BY a.created_at DESC LIMIT $${i}`;
    p.push(parseInt(limit));
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// ==================== REPORTS ====================
app.get('/api/reports/daily', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END),0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END),0) as profit
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at) ORDER BY date DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/reports/weekly', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT DATE_TRUNC('week', created_at) as week,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END),0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END),0) as profit
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at) ORDER BY week DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/reports/couriers', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, 
        COUNT(CASE WHEN o.status='delivered' AND o.delivered_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as monthly_deliveries,
        COALESCE(SUM(CASE WHEN o.status='delivered' AND o.delivered_at >= CURRENT_DATE - INTERVAL '30 days' THEN o.courier_payout END),0) as monthly_earned
      FROM couriers c
      LEFT JOIN orders o ON c.id = o.courier_id
      GROUP BY c.id ORDER BY monthly_deliveries DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/reports/hourly', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// ==================== EXPORT ====================
app.get('/api/export/orders', requireAuth, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    let q = `SELECT o.*, c.first_name as courier_first, c.last_name as courier_last, c.phone as courier_phone
             FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id WHERE 1=1`;
    const p = [];
    let i = 1;
    if (from) { q += ` AND o.created_at >= $${i++}`; p.push(from); }
    if (to) { q += ` AND o.created_at <= $${i++}`; p.push(to + ' 23:59:59'); }
    if (status && status !== 'all') { q += ` AND o.status = $${i++}`; p.push(status); }
    q += ' ORDER BY o.created_at DESC';
    const r = await pool.query(q, p);
    
    const BOM = '\uFEFF';
    let csv = BOM + 'מספר הזמנה,תאריך,שולח,טלפון שולח,כתובת איסוף,מקבל,טלפון מקבל,כתובת מסירה,מחיר,עמלה,לשליח,סטטוס,שליח\n';
    r.rows.forEach(o => {
      const status = {new:'חדש',published:'מפורסם',taken:'נתפס',picked:'נאסף',delivered:'נמסר',cancelled:'בוטל'}[o.status]||o.status;
      const courier = o.courier_first ? `${o.courier_first} ${o.courier_last}` : '';
      csv += `"${o.order_number}","${new Date(o.created_at).toLocaleString('he-IL')}","${o.sender_name||''}","${o.sender_phone||''}","${o.pickup_address||''}","${o.receiver_name||''}","${o.receiver_phone||''}","${o.delivery_address||''}",${o.price},${o.commission},${o.courier_payout},"${status}","${courier}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/export/couriers', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, 
        COUNT(CASE WHEN o.status='delivered' THEN 1 END) as total_deliveries,
        COALESCE(SUM(CASE WHEN o.status='delivered' THEN o.courier_payout END),0) as total_earned
      FROM couriers c LEFT JOIN orders o ON c.id = o.courier_id
      GROUP BY c.id ORDER BY total_deliveries DESC
    `);
    
    const BOM = '\uFEFF';
    let csv = BOM + 'שם פרטי,שם משפחה,ת.ז,טלפון,סטטוס,משלוחים,סה"כ הרוויח,יתרה\n';
    r.rows.forEach(c => {
      csv += `"${c.first_name}","${c.last_name}","${c.id_number}","${c.phone}","${c.status==='active'?'פעיל':'לא פעיל'}",${c.total_deliveries},${c.total_earned},${c.balance}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=couriers-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.get('/api/export/payments', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT p.*, c.first_name, c.last_name, u.name as paid_by
      FROM payments p 
      JOIN couriers c ON p.courier_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `);
    
    const BOM = '\uFEFF';
    let csv = BOM + 'תאריך,שליח,סכום,אמצעי תשלום,הערות,שולם ע"י\n';
    r.rows.forEach(p => {
      const method = {cash:'מזומן',transfer:'העברה',bit:'ביט'}[p.method]||p.method;
      csv += `"${new Date(p.created_at).toLocaleString('he-IL')}","${p.first_name} ${p.last_name}",${p.amount},"${method}","${p.notes||''}","${p.paid_by||''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=payments-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// ==================== ADVANCED SEARCH ====================
app.get('/api/orders/search', requireAuth, async (req, res) => {
  try {
    const { q, status, courier, from, to, minPrice, maxPrice, area } = req.query;
    let query = `SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph 
                 FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id WHERE 1=1`;
    const p = [];
    let i = 1;
    
    if (q) {
      query += ` AND (o.order_number ILIKE $${i} OR o.sender_name ILIKE $${i} OR o.receiver_name ILIKE $${i} OR o.pickup_address ILIKE $${i} OR o.delivery_address ILIKE $${i})`;
      p.push(`%${q}%`); i++;
    }
    if (status && status !== 'all') { query += ` AND o.status = $${i++}`; p.push(status); }
    if (courier) { query += ` AND o.courier_id = $${i++}`; p.push(courier); }
    if (from) { query += ` AND o.created_at >= $${i++}`; p.push(from); }
    if (to) { query += ` AND o.created_at <= $${i++}`; p.push(to + ' 23:59:59'); }
    if (minPrice) { query += ` AND o.price >= $${i++}`; p.push(minPrice); }
    if (maxPrice) { query += ` AND o.price <= $${i++}`; p.push(maxPrice); }
    if (area) { query += ` AND (o.pickup_address ILIKE $${i} OR o.delivery_address ILIKE $${i})`; p.push(`%${area}%`); i++; }
    
    query += ' ORDER BY o.created_at DESC LIMIT 500';
    const r = await pool.query(query, p);
    res.json(r.rows.map(formatOrder));
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// ==================== COURIER HISTORY ====================
app.get('/api/couriers/:id/history', requireAuth, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    let q = `SELECT o.* FROM orders o WHERE o.courier_id = $1`;
    const p = [req.params.id];
    let i = 2;
    if (from) { q += ` AND o.created_at >= $${i++}`; p.push(from); }
    if (to) { q += ` AND o.created_at <= $${i++}`; p.push(to + ' 23:59:59'); }
    if (status && status !== 'all') { q += ` AND o.status = $${i++}`; p.push(status); }
    q += ' ORDER BY o.created_at DESC';
    const r = await pool.query(q, p);
    
    // סטטיסטיקות
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status='delivered' THEN courier_payout END),0) as total_earned
      FROM orders WHERE courier_id = $1
    `, [req.params.id]);
    
    res.json({ orders: r.rows.map(formatOrder), stats: stats.rows[0] });
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// ==================== ZONES & PRICING ====================
app.get('/api/zones', requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM zones ORDER BY name");
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.post('/api/zones', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, basePrice, pricePerKm, areas } = req.body;
    const r = await pool.query(
      "INSERT INTO zones (name, base_price, price_per_km, areas) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, basePrice, pricePerKm, JSON.stringify(areas || [])]
    );
    await logActivity(req.user.id, 'ZONE_CREATED', `אזור חדש: ${name}`);
    res.json({ success: true, zone: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

app.put('/api/zones/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, basePrice, pricePerKm, areas, active } = req.body;
    await pool.query(
      "UPDATE zones SET name=$1, base_price=$2, price_per_km=$3, areas=$4, active=$5 WHERE id=$6",
      [name, basePrice, pricePerKm, JSON.stringify(areas || []), active, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

app.delete('/api/zones/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM zones WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// ==================== GOOGLE MAPS DISTANCE ====================
const calculateDistance = async (origin, destination) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&language=he&key=${CONFIG.GOOGLE_API_KEY}`;
    const response = await axios.get(url);
    
    if (response.data.status === 'OK' && response.data.rows[0]?.elements[0]?.status === 'OK') {
      const element = response.data.rows[0].elements[0];
      return {
        distanceKm: element.distance.value / 1000, // מטרים לק"מ
        distanceText: element.distance.text,
        durationMin: Math.round(element.duration.value / 60), // שניות לדקות
        durationText: element.duration.text,
        originAddress: response.data.origin_addresses[0],
        destinationAddress: response.data.destination_addresses[0]
      };
    }
    return null;
  } catch (e) {
    console.error('Google Maps error:', e.message);
    return null;
  }
};

// חישוב מחיר לפי מרחק (כולל מע"מ)
const calculatePriceByDistance = (distanceKm) => {
  const { BASE_PRICE, PRICE_PER_KM, FREE_KM, MIN_PRICE, VAT_RATE } = CONFIG.PRICING;
  
  // ק"מ לחיוב (אחרי הק"מ הראשון החינמי)
  const chargeableKm = Math.max(0, distanceKm - FREE_KM);
  
  // חישוב מחיר לפני מע"מ: בסיס + (ק"מ נוספים × מחיר לק"מ)
  let priceBeforeVat = BASE_PRICE + (chargeableKm * PRICE_PER_KM);
  
  // מינימום לפני מע"מ
  priceBeforeVat = Math.max(priceBeforeVat, MIN_PRICE);
  
  // חישוב מע"מ
  const vat = priceBeforeVat * VAT_RATE;
  
  // מחיר סופי כולל מע"מ - עיגול למעלה לשקל שלם
  const priceWithVat = Math.ceil(priceBeforeVat + vat);
  
  return {
    priceBeforeVat: Math.round(priceBeforeVat),
    vat: Math.round(vat),
    price: priceWithVat
  };
};

// חישוב מחיר אוטומטי
app.post('/api/calculate-price', requireAuth, async (req, res) => {
  try {
    const { pickupAddress, deliveryAddress } = req.body;
    
    if (!pickupAddress || !deliveryAddress) {
      return res.json({ 
        success: false, 
        error: 'נדרשות כתובות איסוף ומסירה',
        price: CONFIG.PRICING.BASE_PRICE,
        commission: Math.round(CONFIG.PRICING.BASE_PRICE * CONFIG.COMMISSION),
        payout: CONFIG.PRICING.BASE_PRICE - Math.round(CONFIG.PRICING.BASE_PRICE * CONFIG.COMMISSION)
      });
    }
    
    // חישוב מרחק עם Google Maps
    const distance = await calculateDistance(pickupAddress, deliveryAddress);
    
    if (!distance) {
      // אם Google נכשל, נחזיר מחיר בסיס + מע"מ
      const priceBeforeVat = CONFIG.PRICING.BASE_PRICE;
      const vat = Math.round(priceBeforeVat * CONFIG.PRICING.VAT_RATE);
      const price = priceBeforeVat + vat;
      return res.json({ 
        success: true,
        price,
        priceBeforeVat,
        vat,
        commission: Math.round(price * CONFIG.COMMISSION),
        payout: price - Math.round(price * CONFIG.COMMISSION),
        distance: null,
        note: 'לא ניתן לחשב מרחק - מחיר בסיס'
      });
    }
    
    // חישוב מחיר לפי מרחק (כולל מע"מ)
    const priceData = calculatePriceByDistance(distance.distanceKm);
    const commission = Math.round(priceData.price * CONFIG.COMMISSION);
    const payout = priceData.price - commission;
    
    res.json({ 
      success: true,
      price: priceData.price,
      priceBeforeVat: priceData.priceBeforeVat,
      vat: priceData.vat,
      vatRate: CONFIG.PRICING.VAT_RATE * 100,
      commission,
      payout,
      distance: {
        km: Math.round(distance.distanceKm * 10) / 10,
        text: distance.distanceText,
        duration: distance.durationText,
        durationMin: distance.durationMin
      },
      calculation: {
        basePrice: CONFIG.PRICING.BASE_PRICE,
        pricePerKm: CONFIG.PRICING.PRICE_PER_KM,
        freeKm: CONFIG.PRICING.FREE_KM,
        chargeableKm: Math.max(0, distance.distanceKm - CONFIG.PRICING.FREE_KM).toFixed(1),
        vatRate: CONFIG.PRICING.VAT_RATE * 100 + '%'
      }
    });
  } catch (e) { 
    console.error('Calculate price error:', e);
    const priceBeforeVat = CONFIG.PRICING.BASE_PRICE;
    const vat = Math.round(priceBeforeVat * CONFIG.PRICING.VAT_RATE);
    const price = priceBeforeVat + vat;
    res.json({ 
      success: false,
      price,
      priceBeforeVat,
      vat,
      commission: Math.round(price * CONFIG.COMMISSION),
      payout: price - Math.round(price * CONFIG.COMMISSION),
      error: 'שגיאה בחישוב'
    }); 
  }
});

// API לקבלת פרטי מרחק בלבד
app.post('/api/distance', requireAuth, async (req, res) => {
  try {
    const { origin, destination } = req.body;
    const distance = await calculateDistance(origin, destination);
    
    if (distance) {
      res.json({ success: true, ...distance });
    } else {
      res.json({ success: false, error: 'לא ניתן לחשב מרחק' });
    }
  } catch (e) {
    res.json({ success: false, error: 'שגיאה' });
  }
});

// ==================== BLACKLIST ====================
app.get('/api/blacklist', requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM blacklist ORDER BY created_at DESC");
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.post('/api/blacklist', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { type, value, reason } = req.body;
    const r = await pool.query(
      "INSERT INTO blacklist (type, value, reason, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [type, value, reason, req.user.id]
    );
    await logActivity(req.user.id, 'BLACKLIST_ADD', `נוסף לרשימה שחורה: ${type} - ${value}`);
    res.json({ success: true, item: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

app.delete('/api/blacklist/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM blacklist WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// בדיקת רשימה שחורה
const checkBlacklist = async (phone, name) => {
  try {
    const r = await pool.query(
      "SELECT * FROM blacklist WHERE (type='phone' AND value=$1) OR (type='name' AND $2 ILIKE '%' || value || '%')",
      [phone, name]
    );
    return r.rows.length > 0 ? r.rows[0] : null;
  } catch (e) { return null; }
};

// ==================== ORDER NOTES ====================
app.get('/api/orders/:id/notes', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT n.*, u.name as user_name FROM order_notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.order_id = $1 ORDER BY n.created_at DESC",
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.post('/api/orders/:id/notes', requireAuth, async (req, res) => {
  try {
    const { note } = req.body;
    const r = await pool.query(
      "INSERT INTO order_notes (order_id, user_id, note) VALUES ($1,$2,$3) RETURNING *",
      [req.params.id, req.user.id, note]
    );
    res.json({ success: true, note: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// ==================== MESSAGE TEMPLATES ====================
app.get('/api/templates', requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM message_templates ORDER BY name");
    res.json(r.rows);
  } catch (e) { res.json([]); }
});

app.post('/api/templates', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { name, content, type } = req.body;
    const r = await pool.query(
      "INSERT INTO message_templates (name, content, type, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, content, type || 'general', req.user.id]
    );
    res.json({ success: true, template: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

app.put('/api/templates/:id', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { name, content, type } = req.body;
    await pool.query("UPDATE message_templates SET name=$1, content=$2, type=$3 WHERE id=$4", [name, content, type, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

app.delete('/api/templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM message_templates WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// ==================== AUTO MESSAGES ====================
const sendCustomerNotification = async (order, type) => {
  if (!CONFIG.WHAPI.TOKEN || !order.sender_phone) return;
  
  const templates = {
    taken: `🏍️ שלום ${order.sender_name}!\n\nהמשלוח שלך (${order.order_number}) נתפס על ידי שליח ובקרוב ייאסף.\n\nתודה שבחרתם ב-M.M.H Delivery!`,
    picked: `📦 המשלוח ${order.order_number} נאסף ובדרך ליעד!\n\nשליח: ${order.courier?.name || 'בדרך'}`,
    delivered: `✅ המשלוח ${order.order_number} נמסר בהצלחה!\n\nתודה שבחרתם ב-M.M.H Delivery! 🙏`
  };
  
  const msg = templates[type];
  if (msg) {
    const waId = order.sender_phone.replace(/^0/,'972').replace(/-/g,'')+'@s.whatsapp.net';
    await sendWhatsApp(waId, msg);
  }
};

// ==================== COURIER RATINGS ====================
app.post('/api/couriers/:id/rating', requireAuth, async (req, res) => {
  try {
    const { rating, comment, orderId } = req.body;
    await pool.query(
      "INSERT INTO courier_ratings (courier_id, order_id, rating, comment, created_by) VALUES ($1,$2,$3,$4,$5)",
      [req.params.id, orderId, rating, comment, req.user.id]
    );
    
    // עדכון ממוצע
    const avg = await pool.query("SELECT AVG(rating) as avg FROM courier_ratings WHERE courier_id=$1", [req.params.id]);
    await pool.query("UPDATE couriers SET rating=$1 WHERE id=$2", [avg.rows[0].avg, req.params.id]);
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// ==================== REMINDERS ====================
const checkStaleOrders = async () => {
  try {
    // משלוחים שמפורסמים יותר משעה ולא נתפסו
    const stale = await pool.query(`
      SELECT * FROM orders 
      WHERE status = 'published' 
      AND published_at < NOW() - INTERVAL '1 hour'
    `);
    
    for (const order of stale.rows) {
      console.log(`⚠️ משלוח ${order.order_number} מפורסם יותר משעה!`);
      // אפשר לשלוח התראה למנהל
    }
  } catch (e) { console.error('Stale check error:', e); }
};

// בדיקה כל 30 דקות
setInterval(checkStaleOrders, 30 * 60 * 1000);

// ==================== DAILY REPORT ====================
const generateDailyReport = async () => {
  try {
    const today = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END),0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END),0) as profit
      FROM orders WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    const s = today.rows[0];
    const report = `📊 *דוח יומי - ${new Date().toLocaleDateString('he-IL')}*\n\n` +
      `📦 סה"כ הזמנות: ${s.total}\n` +
      `✅ נמסרו: ${s.delivered}\n` +
      `❌ בוטלו: ${s.cancelled}\n` +
      `💰 הכנסות: ₪${s.revenue}\n` +
      `📈 רווח נקי: ₪${s.profit}\n\n` +
      `יום טוב! 🚀`;
    
    return report;
  } catch (e) { return null; }
};

app.get('/api/reports/daily-summary', requireAuth, async (req, res) => {
  try {
    const report = await generateDailyReport();
    res.json({ report });
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

// שליחת דוח יומי לוואטסאפ
app.post('/api/reports/send-daily', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const report = await generateDailyReport();
    if (report && CONFIG.WHAPI.GROUP_ID) {
      await sendWhatsApp(CONFIG.WHAPI.GROUP_ID, report);
    }
    res.json({ success: true, report });
  } catch (e) { res.status(500).json({ success: false, error:'שגיאת שרת' }); }
});

// ==================== COURIER APP ====================
app.get('/courier/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const courier = await pool.query("SELECT * FROM couriers WHERE phone=$1 OR phone=$2", 
      [phone, '0' + phone.replace(/^972/, '')]);
    
    if (!courier.rows[0]) {
      return res.send(courierNotFoundPage());
    }
    
    const c = courier.rows[0];
    const orders = await pool.query(`
      SELECT * FROM orders WHERE courier_id=$1 AND status IN ('taken','picked') ORDER BY created_at DESC
    `, [c.id]);
    
    const stats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status='delivered' AND delivered_at >= CURRENT_DATE THEN 1 END) as today,
        COUNT(CASE WHEN status='delivered' AND delivered_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week,
        COUNT(CASE WHEN status='delivered' AND delivered_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month
      FROM orders WHERE courier_id=$1
    `, [c.id]);
    
    res.send(courierAppPage(c, orders.rows, stats.rows[0]));
  } catch (e) { res.status(500).send('שגיאה'); }
});

function courierNotFoundPage() {
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>לא נמצא</title></head><body style="font-family:system-ui;background:#0f172a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center"><div><h1>🔍</h1><p>שליח לא נמצא במערכת</p></div></body></html>`;
}

function courierAppPage(c, orders, stats) {
  const vehicleText = c.vehicle_type === 'motorcycle' ? '🏍️ אופנוע' : c.vehicle_type === 'car' ? '🚗 רכב' : c.vehicle_type === 'commercial' ? '🚚 מסחרי' : '🏍️ אופנוע';
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M.M.H - ${c.first_name}</title>
<style>*{font-family:system-ui;margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;color:#fff;min-height:100vh;padding:20px;padding-bottom:80px}
.header{text-align:center;padding:20px 0;border-bottom:1px solid #334155;margin-bottom:20px}
.vehicle-badge{display:inline-block;padding:4px 12px;background:#334155;border-radius:20px;font-size:12px;margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.stat{background:#1e293b;padding:15px;border-radius:12px;text-align:center}
.stat-value{font-size:24px;font-weight:bold;color:#10b981}
.stat-label{font-size:12px;color:#94a3b8}
.balance{background:linear-gradient(135deg,#f59e0b,#d97706);padding:20px;border-radius:12px;text-align:center;margin-bottom:20px}
.balance-value{font-size:32px;font-weight:bold}
.orders{display:flex;flex-direction:column;gap:15px}
.order{background:#1e293b;border-radius:12px;padding:15px;border:1px solid #334155}
.order-header{display:flex;justify-content:space-between;margin-bottom:10px}
.order-num{font-weight:bold;color:#10b981}
.order-status{padding:4px 8px;border-radius:20px;font-size:12px}
.status-taken{background:#3b82f620;color:#3b82f6}
.status-picked{background:#8b5cf620;color:#8b5cf6}
.order-addr{color:#94a3b8;font-size:14px;margin:8px 0}
.order-payout{font-size:20px;font-weight:bold;color:#10b981}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:10px;text-decoration:none;text-align:center}
.btn-pickup{background:#3b82f6;color:#fff}
.btn-deliver{background:#10b981;color:#fff}
.btn-nav{background:#334155;color:#fff}
.empty{text-align:center;padding:40px;color:#64748b}
.empty-icon{font-size:50px;margin-bottom:15px}
.refresh-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 10px 30px rgba(102,126,234,0.3);cursor:pointer;border:none;color:white}</style></head>
<body>
<div class="header">
  <h1>🏍️ ${c.first_name} ${c.last_name}</h1>
  <p style="color:#64748b">${c.phone}</p>
  <div class="vehicle-badge">${vehicleText}</div>
</div>
<div class="stats">
  <div class="stat"><div class="stat-value">${stats.today||0}</div><div class="stat-label">היום</div></div>
  <div class="stat"><div class="stat-value">${stats.week||0}</div><div class="stat-label">השבוע</div></div>
  <div class="stat"><div class="stat-value">${stats.month||0}</div><div class="stat-label">החודש</div></div>
</div>
<div class="balance"><div style="font-size:14px">יתרה לתשלום</div><div class="balance-value">₪${c.balance||0}</div></div>
<h3 style="margin-bottom:15px">📦 משלוחים פעילים (${orders.length})</h3>
<div class="orders">
${orders.length ? orders.map(o => `
  <div class="order">
    <div class="order-header">
      <span class="order-num">${o.order_number}</span>
      <span class="order-status status-${o.status}">${o.status==='taken'?'נתפס':'נאסף'}</span>
    </div>
    <div class="order-addr">📍 ${o.status==='taken'?o.pickup_address:o.delivery_address}</div>
    <div class="order-addr">👤 ${o.status==='taken'?o.sender_name+' - '+o.sender_phone:o.receiver_name+' - '+o.receiver_phone}</div>
    <div class="order-payout">💰 ₪${o.courier_payout}</div>
    <a href="https://waze.com/ul?q=${encodeURIComponent(o.status==='taken'?o.pickup_address:o.delivery_address)}" class="btn btn-nav">🗺️ ניווט</a>
    ${o.status==='taken'?`<a href="/status/${o.order_number}/pickup" class="btn btn-pickup">📦 אספתי</a>`:`<a href="/status/${o.order_number}/deliver" class="btn btn-deliver">✅ מסרתי</a>`}
  </div>
`).join('') : '<div class="empty"><div class="empty-icon">🎯</div><h3>אין משלוחים פעילים</h3><p style="margin-top:10px;font-size:14px">המשלוחים החדשים יופיעו כאן</p></div>'}
</div>
<button class="refresh-btn" onclick="location.reload()">🔄</button>
<script>setInterval(()=>location.reload(),30000);</script>
</body></html>`;
}

// ==================== PUBLIC ROUTES ====================
app.get('/take/:orderNumber/:whatsappId?', async (req, res) => {
  try {
    const { orderNumber, whatsappId } = req.params;
    const r = await pool.query("SELECT * FROM orders WHERE order_number=$1",[orderNumber]);
    const o = r.rows[0];
    if (!o) return res.send(statusHTML('❌','הזמנה לא נמצאה','','#ef4444'));
    if (o.status !== 'published') return res.send(statusHTML('🏍️','המשלוח נתפס!','מישהו הספיק לפניך, פעם הבאה תהיה מהיר יותר!','#f59e0b'));
    
    // בדוק אם השליח רשום
    let courier = null;
    if (whatsappId) {
      courier = await getCourierByWhatsAppId(whatsappId);
    }
    
    // אם השליח רשום - הצג טופס מקוצר
    if (courier) {
      res.send(takeOrderEnhancedHTML(o, courier, whatsappId));
    } else {
      res.send(takeOrderHTML(o));
    }
  } catch (e) { res.status(500).send(statusHTML('❌','שגיאה','','#ef4444')); }
});

app.post('/api/take/:orderNumber', async (req, res) => {
  try { res.json(await takeOrder(req.params.orderNumber, req.body)); }
  catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.get('/status/:orderNumber/pickup', async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM orders WHERE order_number=$1",[req.params.orderNumber]);
    const o = r.rows[0];
    if (!o) return res.send(statusHTML('❌','לא נמצא','','#ef4444'));
    if (o.status !== 'taken') return res.send(statusHTML('ℹ️','לא ניתן לעדכן','','#f59e0b'));
    res.send(statusUpdateHTML(o,'pickup'));
  } catch (e) { res.status(500).send(statusHTML('❌','שגיאה','','#ef4444')); }
});

app.post('/api/status/:orderNumber/pickup', async (req, res) => {
  try { res.json(await pickupOrder(req.params.orderNumber)); }
  catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.get('/status/:orderNumber/deliver', async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM orders WHERE order_number=$1",[req.params.orderNumber]);
    const o = r.rows[0];
    if (!o) return res.send(statusHTML('❌','לא נמצא','','#ef4444'));
    if (o.status !== 'picked') return res.send(statusHTML('ℹ️','לא ניתן לעדכן','','#f59e0b'));
    res.send(statusUpdateHTML(o,'deliver'));
  } catch (e) { res.status(500).send(statusHTML('❌','שגיאה','','#ef4444')); }
});

app.post('/api/status/:orderNumber/deliver', async (req, res) => {
  try { res.json(await deliverOrder(req.params.orderNumber)); }
  catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// ==================== WEBHOOK ====================
app.post('/webhook/whapi', async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!messages?.length) return res.sendStatus(200);
    for (const m of messages) {
      if (m.from_me) continue;
      const cr = await pool.query("SELECT * FROM couriers WHERE whatsapp_id=$1",[m.chat_id]);
      if (!cr.rows[0]) continue;
      const text = m.text?.body?.toLowerCase() || '';
      if (text.includes('אספתי') || text.includes('נאסף')) {
        const o = await pool.query("SELECT order_number FROM orders WHERE courier_id=$1 AND status='taken' ORDER BY taken_at DESC LIMIT 1",[cr.rows[0].id]);
        if (o.rows[0]) await pickupOrder(o.rows[0].order_number);
      }
      if (text.includes('מסרתי') || text.includes('נמסר')) {
        const o = await pool.query("SELECT order_number FROM orders WHERE courier_id=$1 AND status='picked' ORDER BY picked_at DESC LIMIT 1",[cr.rows[0].id]);
        if (o.rows[0]) await deliverOrder(o.rows[0].order_number);
      }
    }
    res.sendStatus(200);
  } catch (e) { console.error('Webhook error:',e); res.sendStatus(500); }
});

app.get('/health', (req, res) => res.json({ status:'ok', uptime:process.uptime() }));

// ==================== ADMIN TOOLS ====================
// מחיקת כל ההזמנות (טסטים)
app.delete('/api/admin/orders/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM orders RETURNING id");
    await pool.query("UPDATE couriers SET total_deliveries=0, total_earned=0, balance=0");
    broadcast({ type: 'refresh' });
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// מחיקת הזמנות שהושלמו בלבד + עדכון סטטיסטיקות שליחים
app.delete('/api/admin/orders/delivered', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // שמור את הסכומים לפני מחיקה כדי לעדכן שליחים
    await pool.query(`
      UPDATE couriers c SET 
        total_deliveries = total_deliveries - COALESCE((
          SELECT COUNT(*) FROM orders WHERE courier_id = c.id AND status = 'delivered'
        ), 0),
        total_earned = total_earned - COALESCE((
          SELECT SUM(courier_payout) FROM orders WHERE courier_id = c.id AND status = 'delivered'
        ), 0),
        balance = balance - COALESCE((
          SELECT SUM(courier_payout) FROM orders WHERE courier_id = c.id AND status = 'delivered'
        ), 0)
    `);
    const r = await pool.query("DELETE FROM orders WHERE status='delivered' RETURNING id");
    broadcast({ type: 'refresh' });
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// מחיקת הזמנות מבוטלות בלבד
app.delete('/api/admin/orders/cancelled', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM orders WHERE status='cancelled' RETURNING id");
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// מחיקת כל השליחים (טסטים)
app.delete('/api/admin/couriers/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("UPDATE orders SET courier_id=NULL");
    const r = await pool.query("DELETE FROM couriers RETURNING id");
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// איפוס סטטיסטיקות שליחים (בלי למחוק אותם)
app.post('/api/admin/couriers/reset-stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("UPDATE couriers SET total_deliveries=0, total_earned=0, balance=0");
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// מחיקת כל התשלומים + איפוס יתרות
app.delete('/api/admin/payments/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM payments RETURNING id");
    // איפוס יתרות שליחים - מחשב מחדש לפי הזמנות שנמסרו
    await pool.query(`
      UPDATE couriers c SET balance = COALESCE((
        SELECT SUM(courier_payout) FROM orders 
        WHERE courier_id = c.id AND status = 'delivered'
      ), 0)
    `);
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// איפוס מלא - הכל חוץ ממשתמשים
app.delete('/api/admin/reset', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM payments");
    await pool.query("DELETE FROM orders");
    await pool.query("DELETE FROM couriers");
    await pool.query("DELETE FROM activity_log");
    broadcast({ type: 'refresh' });
    res.json({ success: true, message: 'המערכת אופסה' });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
});

// סטטיסטיקות אדמין
app.get('/api/admin/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const orders = await pool.query("SELECT status, COUNT(*) as count FROM orders GROUP BY status");
    const couriers = await pool.query("SELECT COUNT(*) as total FROM couriers");
    const payments = await pool.query("SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as sum FROM payments");
    res.json({
      orders: orders.rows,
      couriers: parseInt(couriers.rows[0].total),
      payments: { count: parseInt(payments.rows[0].total), sum: parseFloat(payments.rows[0].sum) }
    });
  } catch (e) { res.status(500).json({ error: 'שגיאת שרת' }); }
});

// ==================== HTML TEMPLATES ====================
function statusHTML(emoji, title, subtitle, color) {
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{font-family:system-ui;margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#1e293b;border-radius:20px;padding:40px;text-align:center;border:1px solid #334155;max-width:400px}.emoji{font-size:60px;margin-bottom:20px}h1{color:${color};margin-bottom:10px}p{color:#94a3b8}</style></head><body><div class="card"><div class="emoji">${emoji}</div><h1>${title}</h1><p>${subtitle}</p></div></body></html>`;
}

function takeOrderHTML(o) {
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>תפיסת משלוח</title><style>*{font-family:system-ui;margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;min-height:100vh;padding:20px}.container{max-width:500px;margin:0 auto}.header{text-align:center;margin-bottom:20px}.logo{font-size:40px}.title{color:#10b981;font-size:24px;margin:10px 0 5px}.order-id{color:#60a5fa}.card{background:#1e293b;border-radius:16px;padding:20px;border:1px solid #334155;margin-bottom:16px}.row{display:flex;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #334155}.row:last-child{border:none;margin:0;padding:0}.icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center}.icon.p{background:#f59e0b20}.icon.d{background:#10b98120}.icon.m{background:#60a5fa20}.content{flex:1}.label{color:#64748b;font-size:12px}.value{color:#fff;font-size:14px}.payout{color:#10b981!important;font-size:20px!important;font-weight:bold}.input{width:100%;padding:12px;background:#0f172a;border:1px solid #334155;border-radius:10px;color:#fff;font-size:16px;margin-bottom:12px}.input:focus{outline:none;border-color:#10b981}.btn{width:100%;padding:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:#fff;font-size:16px;font-weight:bold;cursor:pointer}.btn:disabled{background:#475569}.success{display:none;text-align:center;padding:30px}.success.show{display:block}.hidden{display:none}.error{background:#ef444420;border:1px solid #ef4444;border-radius:8px;padding:12px;color:#ef4444;margin-bottom:12px;display:none}.error.show{display:block}</style></head><body><div class="container"><div class="header"><div class="logo">🚚</div><div class="title">M.M.H משלוחים</div><div class="order-id">משלוח ${o.order_number}</div></div><div class="card"><div class="row"><div class="icon p">📍</div><div class="content"><div class="label">כתובת איסוף</div><div class="value">${o.pickup_address}</div></div></div><div class="row"><div class="icon d">🏠</div><div class="content"><div class="label">כתובת מסירה</div><div class="value">${o.delivery_address}</div></div></div><div class="row"><div class="icon m">💰</div><div class="content"><div class="label">תשלום לשליח</div><div class="value payout">₪${o.courier_payout}</div></div></div></div><div class="card" id="form"><div class="error" id="err"></div><input class="input" id="fn" placeholder="שם פרטי"><input class="input" id="ln" placeholder="שם משפחה"><input class="input" id="id" placeholder="ת.ז" maxlength="9"><input class="input" id="ph" placeholder="טלפון"><button class="btn" id="btn" onclick="submit()">✋ תפוס את המשלוח!</button></div><div class="card success" id="ok"><div style="font-size:50px;margin-bottom:15px">🎉</div><h2 style="color:#10b981">תפסת את המשלוח!</h2><p style="color:#94a3b8">הפרטים נשלחו בוואטסאפ</p></div></div><script>async function submit(){const b=document.getElementById('btn');b.disabled=true;b.textContent='שולח...';document.getElementById('err').classList.remove('show');const d={firstName:document.getElementById('fn').value.trim(),lastName:document.getElementById('ln').value.trim(),idNumber:document.getElementById('id').value.trim(),phone:document.getElementById('ph').value.trim()};if(!d.firstName||!d.lastName||!d.idNumber||!d.phone){document.getElementById('err').textContent='נא למלא הכל';document.getElementById('err').classList.add('show');b.disabled=false;b.textContent='✋ תפוס את המשלוח!';return}try{const r=await fetch('/api/take/${o.order_number}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(j.success){document.getElementById('form').classList.add('hidden');document.getElementById('ok').classList.add('show')}else{document.getElementById('err').textContent=j.error;document.getElementById('err').classList.add('show');b.disabled=false;b.textContent='✋ תפוס את המשלוח!'}}catch(e){document.getElementById('err').textContent='שגיאה';document.getElementById('err').classList.add('show');b.disabled=false;b.textContent='✋ תפוס את המשלוח!'}}</script></body></html>`;
}

function statusUpdateHTML(o, action) {
  const isPickup = action === 'pickup';
  const title = isPickup ? 'אישור איסוף' : 'אישור מסירה';
  const q = isPickup ? 'האם אספת?' : 'האם מסרת?';
  const btn = isPickup ? '✅ כן, אספתי' : '✅ כן, מסרתי';
  const api = `/api/status/${o.order_number}/${action}`;
  const success = isPickup ? 'סומן כנאסף!' : 'נמסר בהצלחה!';
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{font-family:system-ui;margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#1e293b;border-radius:20px;padding:30px;text-align:center;border:1px solid #334155;max-width:400px;width:100%}.emoji{font-size:50px;margin-bottom:15px}h1{color:#10b981;margin-bottom:10px}p{color:#94a3b8;margin-bottom:20px}.info{background:#0f172a;border-radius:10px;padding:12px;margin-bottom:20px;text-align:right}.buttons{display:flex;gap:10px}.btn{flex:1;padding:14px;border:none;border-radius:10px;font-size:16px;font-weight:bold;cursor:pointer}.btn-yes{background:linear-gradient(135deg,#10b981,#059669);color:#fff}.btn-no{background:#334155;color:#94a3b8}.payout{background:#10b98120;border-radius:10px;padding:15px;margin-top:20px}.payout-value{color:#10b981;font-size:28px;font-weight:bold}</style></head><body><div class="card" id="main"><div class="emoji">${isPickup?'📦':'📬'}</div><h1>${title}</h1><p>${q}</p>${!isPickup?`<div class="info"><div style="color:#64748b;font-size:12px">נמסר ל:</div><div style="color:#fff">${o.receiver_name}</div><div style="color:#94a3b8;font-size:13px">${o.delivery_address}</div></div>`:''}<div class="buttons"><button class="btn btn-yes" onclick="confirm()">${btn}</button><button class="btn btn-no" onclick="window.close()">❌ לא עדיין</button></div>${!isPickup?`<div class="payout"><div style="color:#10b981;font-size:14px">💰 רווח</div><div class="payout-value">₪${o.courier_payout}</div></div>`:''}</div><script>async function confirm(){try{const r=await fetch('${api}',{method:'POST'});const d=await r.json();if(d.success){document.getElementById('main').innerHTML='<div class="emoji">✅</div><h1>${success}</h1><p>תודה!</p>${!isPickup?`<div class="payout"><div style="color:#10b981;font-size:14px">הרווחת</div><div class="payout-value">₪${o.courier_payout}</div></div>`:''}';}else{alert(d.error||'שגיאה');}}catch(e){alert('שגיאת תקשורת');}}</script></body></html>`;
}

// ==================== COURIER REGISTRATION HTML ====================
function courierRegistrationHTML(whatsappId = '') {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>רישום שליח - M.M.H</title>
  <style>
    * { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; }
    .card { background: white; border-radius: 20px; padding: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 50px; margin-bottom: 10px; }
    h1 { color: #667eea; font-size: 24px; margin-bottom: 5px; }
    .subtitle { color: #666; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; color: #333; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
    input, select { width: 100%; padding: 14px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 16px; transition: all 0.3s; }
    input:focus, select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-size: 18px; font-weight: bold; cursor: pointer; transition: transform 0.2s; }
    .btn:hover { transform: translateY(-2px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .error { background: #fee; border: 2px solid #fcc; color: #c33; padding: 12px; border-radius: 10px; margin-bottom: 20px; display: none; text-align: center; }
    .error.show { display: block; }
    .success { background: #efe; border: 2px solid #cfc; color: #3a3; padding: 20px; border-radius: 10px; text-align: center; display: none; }
    .success.show { display: block; }
    .success .emoji { font-size: 60px; margin-bottom: 15px; }
    .vehicle-option { display: flex; align-items: center; gap: 10px; padding: 12px; border: 2px solid #e0e0e0; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-bottom: 8px; }
    .vehicle-option:hover { border-color: #667eea; background: #f5f7ff; }
    .vehicle-option input[type="radio"] { width: auto; }
    .vehicle-icon { font-size: 24px; }
    .info-box { background: #f0f4ff; border: 2px solid #667eea; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
    .info-box p { color: #667eea; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">🚀</div>
        <h1>הצטרפות לצוות השליחים</h1>
        <p class="subtitle">M.M.H Delivery</p>
      </div>
      
      <div class="info-box">
        <p><strong>👋 היי!</strong><br>מלא את הפרטים פעם אחת ותוכל לתפוס משלוחים בלחיצה אחת בפעמים הבאות</p>
      </div>
      
      <div id="form">
        <div class="error" id="error"></div>
        
        <div class="row">
          <div class="form-group">
            <label>שם פרטי *</label>
            <input type="text" id="firstName" placeholder="שם פרטי" required>
          </div>
          <div class="form-group">
            <label>שם משפחה *</label>
            <input type="text" id="lastName" placeholder="שם משפחה" required>
          </div>
        </div>
        
        <div class="form-group">
          <label>ת.ז / ע.מ *</label>
          <input type="text" id="idNumber" placeholder="9 ספרות" maxlength="9" required>
        </div>
        
        <div class="form-group">
          <label>טלפון *</label>
          <input type="tel" id="phone" placeholder="05X-XXXXXXX" required>
        </div>
        
        <div class="form-group">
          <label>אימייל</label>
          <input type="email" id="email" placeholder="example@mail.com">
        </div>
        
        <div class="form-group">
          <label>סוג רכב *</label>
          <label class="vehicle-option">
            <input type="radio" name="vehicle" value="motorcycle" checked>
            <span class="vehicle-icon">🏍️</span>
            <span>אופנוע</span>
          </label>
          <label class="vehicle-option">
            <input type="radio" name="vehicle" value="car">
            <span class="vehicle-icon">🚗</span>
            <span>רכב פרטי</span>
          </label>
          <label class="vehicle-option">
            <input type="radio" name="vehicle" value="commercial">
            <span class="vehicle-icon">🚚</span>
            <span>רכב מסחרי</span>
          </label>
        </div>
        
        <button class="btn" id="submitBtn" onclick="register()">✅ הרשם עכשיו</button>
      </div>
      
      <div class="success" id="success">
        <div class="emoji">🎉</div>
        <h2 style="color: #667eea; margin-bottom: 10px;">נרשמת בהצלחה!</h2>
        <p style="color: #666;">מעכשיו תוכל לתפוס משלוחים בלחיצה אחת</p>
      </div>
    </div>
  </div>
  
  <script>
    const whatsappId = '${whatsappId}';
    
    async function register() {
      const btn = document.getElementById('submitBtn');
      const error = document.getElementById('error');
      
      const data = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        idNumber: document.getElementById('idNumber').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim(),
        vehicleType: document.querySelector('input[name="vehicle"]:checked').value,
        whatsappId: whatsappId
      };
      
      if (!data.firstName || !data.lastName || !data.idNumber || !data.phone) {
        error.textContent = '❌ נא למלא את כל השדות המסומנים ב-*';
        error.classList.add('show');
        return;
      }
      
      if (data.idNumber.length !== 9) {
        error.textContent = '❌ ת.ז חייב להכיל 9 ספרות';
        error.classList.add('show');
        return;
      }
      
      btn.disabled = true;
      btn.textContent = '⏳ שולח...';
      error.classList.remove('show');
      
      try {
        const response = await fetch('/api/courier/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          document.getElementById('form').style.display = 'none';
          document.getElementById('success').classList.add('show');
          setTimeout(() => { window.location.href = '/courier/' + data.phone; }, 2000);
        } else {
          error.textContent = '❌ ' + result.error;
          error.classList.add('show');
          btn.disabled = false;
          btn.textContent = '✅ הרשם עכשיו';
        }
      } catch (e) {
        error.textContent = '❌ שגיאת תקשורת';
        error.classList.add('show');
        btn.disabled = false;
        btn.textContent = '✅ הרשם עכשיו';
      }
    }
    
    document.querySelectorAll('input').forEach(input => {
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') register(); });
    });
  </script>
</body>
</html>`;
}

// ==================== ENHANCED TAKE ORDER HTML (FOR REGISTERED COURIERS) ====================
function takeOrderEnhancedHTML(order, courier, whatsappId) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>תפיסת משלוח - M.M.H</title>
  <style>
    * { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; }
    .card { background: white; border-radius: 20px; padding: 25px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); margin-bottom: 15px; }
    .header { text-align: center; margin-bottom: 20px; }
    .order-id { font-size: 24px; font-weight: bold; color: #11998e; margin-bottom: 5px; }
    .payout { font-size: 36px; font-weight: bold; color: #11998e; margin: 20px 0; }
    .info { display: flex; gap: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px; margin-bottom: 12px; }
    .icon { font-size: 24px; }
    .content { flex: 1; }
    .label { font-size: 12px; color: #666; }
    .value { font-size: 15px; color: #333; font-weight: 500; }
    .welcome { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 15px; text-align: center; margin-bottom: 20px; }
    .welcome h2 { margin-bottom: 5px; }
    .btn { width: 100%; padding: 18px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border: none; border-radius: 15px; font-size: 20px; font-weight: bold; cursor: pointer; transition: transform 0.2s; }
    .btn:hover { transform: scale(1.02); }
    .btn:disabled { opacity: 0.6; cursor: wait; }
    .success { display: none; text-align: center; padding: 40px; }
    .success.show { display: block; }
    .success .emoji { font-size: 80px; margin-bottom: 20px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="welcome">
      <h2>👋 היי ${courier.first_name}!</h2>
      <p>זיהינו אותך אוטומטית</p>
    </div>
    
    <div class="card" id="orderCard">
      <div class="header">
        <div class="order-id">📦 ${order.order_number}</div>
        <div class="payout">💰 ₪${order.courier_payout}</div>
      </div>
      
      <div class="info">
        <div class="icon">📍</div>
        <div class="content">
          <div class="label">איסוף מ:</div>
          <div class="value">${order.pickup_address}</div>
        </div>
      </div>
      
      <div class="info">
        <div class="icon">🏠</div>
        <div class="content">
          <div class="label">מסירה ל:</div>
          <div class="value">${order.delivery_address}</div>
        </div>
      </div>
      
      ${order.details ? `
      <div class="info">
        <div class="icon">📝</div>
        <div class="content">
          <div class="label">פרטים:</div>
          <div class="value">${order.details}</div>
        </div>
      </div>` : ''}
      
      <button class="btn" id="takeBtn" onclick="quickTake()">✋ תפוס משלוח</button>
    </div>
    
    <div class="card success" id="success">
      <div class="emoji">🎉</div>
      <h2 style="color: #11998e; margin-bottom: 10px;">תפסת את המשלוח!</h2>
      <p style="color: #666; margin-bottom: 20px;">הפרטים נשלחו אליך בוואטסאפ</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 12px;">
        <div style="font-size: 14px; color: #666; margin-bottom: 5px;">הרווחת</div>
        <div style="font-size: 32px; font-weight: bold; color: #11998e;">₪${order.courier_payout}</div>
      </div>
    </div>
  </div>
  
  <script>
    async function quickTake() {
      const btn = document.getElementById('takeBtn');
      btn.disabled = true;
      btn.textContent = '⏳ תופס...';
      
      try {
        const response = await fetch('/api/take/${order.order_number}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: '${courier.first_name}',
            lastName: '${courier.last_name}',
            idNumber: '${courier.id_number}',
            phone: '${courier.phone}'
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          document.getElementById('orderCard').classList.add('hidden');
          document.getElementById('success').classList.add('show');
        } else {
          alert(result.error || 'שגיאה');
          btn.disabled = false;
          btn.textContent = '✋ תפוס משלוח';
        }
      } catch (e) {
        alert('שגיאת תקשורת');
        btn.disabled = false;
        btn.textContent = '✋ תפוס משלוח';
      }
    }
  </script>
</body>
</html>`;
}

// ==================== DASHBOARD ====================
app.get('/', (req, res) => {
  const wsUrl = CONFIG.PUBLIC_URL.replace('https://','wss://').replace('http://','ws://');
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M.M.H Delivery</title>
  <link rel="icon" type="image/png" href="${process.env.LOGO_URL || '/logo.png'}">
  <link rel="apple-touch-icon" href="${process.env.LOGO_URL || '/logo.png'}">
  <meta name="theme-color" content="#0a0f1a">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            mmh: {
              50: '#e6f7fa',
              100: '#cceff5',
              200: '#99dfeb',
              300: '#66cfe1',
              400: '#33bfd7',
              500: '#00afcd',
              600: '#008ca4',
              700: '#00697b',
              800: '#004652',
              900: '#002329',
            },
            dark: {
              900: '#0a0f1a',
              800: '#0f1525',
              700: '#151c2c',
              600: '#1a2236',
              500: '#242d3d',
            }
          }
        }
      }
    }
  </script>
  <style>
    *{font-family:system-ui,-apple-system,sans-serif}
    .logo-img{height:50px;width:auto;}
    .logo-img-login{height:100px;width:auto;}
    .gradient-mmh{background:linear-gradient(135deg,#00afcd,#0077b6)}
    .text-mmh{color:#00afcd}
    .bg-mmh{background-color:#00afcd}
    .border-mmh{border-color:#00afcd}
  </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 text-white">
<div id="app"></div>
<script>
const API='',WS_URL='${wsUrl}',LOGO_URL='${process.env.LOGO_URL || '/logo.png'}';
let token=localStorage.getItem('token'),refreshToken=localStorage.getItem('refreshToken'),user=JSON.parse(localStorage.getItem('user')||'null'),orders=[],stats={},couriers=[],users=[],ws=null,connected=false,currentTab='orders',filter='all',search='',pending2FA=null;

// רענון אוטומטי של טוקן
async function refreshAccessToken(){
  if(!refreshToken)return false;
  try{
    const r=await fetch(API+'/api/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})});
    const d=await r.json();
    if(d.success){token=d.token;refreshToken=d.refreshToken;localStorage.setItem('token',token);localStorage.setItem('refreshToken',refreshToken);return true;}
  }catch(e){}
  return false;
}

// בדיקת תוקף טוקן וחידוש אוטומטי
setInterval(async()=>{if(token&&refreshToken)await refreshAccessToken();},10*60*1000); // כל 10 דקות

async function login(){
  const u=document.getElementById('username').value,p=document.getElementById('password').value;
  const twoFactorCode=document.getElementById('twoFactorCode')?.value;
  try{
    const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p,twoFactorCode})});
    const d=await r.json();
    if(d.success){
      token=d.token;refreshToken=d.refreshToken;user=d.user;
      localStorage.setItem('token',token);localStorage.setItem('refreshToken',refreshToken);localStorage.setItem('user',JSON.stringify(user));
      pending2FA=null;connectWS();render();
    }else if(d.requires2FA){
      pending2FA={username:u,password:p};
      document.getElementById('loginError').textContent=d.message;
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('loginError').classList.remove('bg-red-500/20','border-red-500','text-red-400');
      document.getElementById('loginError').classList.add('bg-blue-500/20','border-blue-500','text-blue-400');
      document.getElementById('twoFactorSection').classList.remove('hidden');
    }else{
      document.getElementById('loginError').textContent=d.error;
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('loginError').classList.add('bg-red-500/20','border-red-500','text-red-400');
    }
  }catch(e){document.getElementById('loginError').textContent='שגיאת תקשורת';document.getElementById('loginError').classList.remove('hidden');}
}

function logout(){
  api('/api/auth/logout','POST');
  token=null;refreshToken=null;user=null;
  localStorage.removeItem('token');localStorage.removeItem('refreshToken');localStorage.removeItem('user');
  if(ws)ws.close();render();
}

function connectWS(){
  if(!token)return;ws=new WebSocket(WS_URL);
  ws.onopen=()=>{connected=true;ws.send(JSON.stringify({type:'auth',token}));render();};
  ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.type==='init'){orders=m.data.orders||[];stats=m.data.stats||{};render();}else if(m.type==='new_order'){if(!orders.find(o=>o.id===m.data.order.id)){orders.unshift(m.data.order);showToast('🆕 '+m.data.order.orderNumber);}render();}else if(m.type==='order_updated'){orders=orders.map(o=>o.id===m.data.order.id?m.data.order:o);render();}else if(m.type==='order_deleted'){orders=orders.filter(o=>o.id!==m.data.orderId);render();}else if(m.type==='stats_updated'){stats=m.data;render();}else if(m.type==='refresh'){location.reload();}};
  ws.onclose=()=>{connected=false;render();setTimeout(connectWS,3000);};
}

async function api(ep,method='GET',body=null){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(token)opts.headers.Authorization='Bearer '+token;
  if(body)opts.body=JSON.stringify(body);
  let r=await fetch(API+ep,opts);
  // אם הטוקן פג, נסה לרענן
  if(r.status===401&&refreshToken){
    const refreshed=await refreshAccessToken();
    if(refreshed){opts.headers.Authorization='Bearer '+token;r=await fetch(API+ep,opts);}
  }
  return r.json();
}
async function loadCouriers(){couriers=await api('/api/couriers');render();}
async function loadUsers(){if(user?.role==='admin'){users=await api('/api/users');render();}}

async function createOrder(d){const r=await api('/api/orders','POST',d);if(r.success){closeModal();showToast('✅ נוצר');}}
async function publishOrder(id){await api('/api/orders/'+id+'/publish','POST');showToast('📤 פורסם');}
async function cancelOrder(id){if(!confirm('לבטל?'))return;await api('/api/orders/'+id+'/cancel','POST',{reason:'ביטול'});showToast('❌ בוטל');}
async function deleteOrder(id){if(!confirm('למחוק לצמיתות?'))return;const r=await api('/api/orders/'+id,'DELETE');if(r.success)showToast('🗑️ נמחק');else alert(r.error);}
async function editOrder(id){const o=orders.find(x=>x.id===id);if(!o)return;showEditOrderModal(o);}
async function updateOrder(id,d){const r=await api('/api/orders/'+id,'PUT',d);if(r.success){closeModal();showToast('✅ עודכן');}else alert(r.error);}
async function createUser(d){const r=await api('/api/users','POST',d);if(r.success){closeModal();showToast('✅ נוצר');loadUsers();}else alert(r.error);}
async function updateUser(id,d){const r=await api('/api/users/'+id,'PUT',d);if(r.success){closeModal();showToast('✅ עודכן');loadUsers();}else alert(r.error);}
async function changeUserPassword(id,pwd){const r=await api('/api/users/'+id+'/password','PUT',{password:pwd});if(r.success){closeModal();showToast('✅ סיסמה עודכנה');}else alert(r.error);}
async function deleteUser(id){if(!confirm('למחוק משתמש?'))return;const r=await api('/api/users/'+id,'DELETE');if(r.success){showToast('🗑️ נמחק');loadUsers();}else alert(r.error);}
async function createPayment(d){const r=await api('/api/payments','POST',d);if(r.success){closeModal();showToast('✅ תשלום נרשם');loadCouriers();}}

function showToast(m){const t=document.createElement('div');t.className='fixed top-4 left-1/2 -translate-x-1/2 bg-dark-600 text-white px-6 py-3 rounded-xl shadow-lg z-50';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}
function closeModal(){document.getElementById('modal').innerHTML='';}
function setTab(t){currentTab=t;if(t==='couriers')loadCouriers();if(t==='users')loadUsers();render();}
function setFilter(f){filter=f;render();}
function fmt(n){return'₪'+(n||0).toLocaleString();}
function fmtDate(d){return d?new Date(d).toLocaleString('he-IL'):'-';}
function statusText(s){return{new:'חדש',published:'פורסם',taken:'נתפס',picked:'נאסף',delivered:'נמסר',cancelled:'בוטל'}[s]||s;}
function statusColor(s){const c={new:'slate',published:'amber',taken:'blue',picked:'purple',delivered:'emerald',cancelled:'red'}[s]||'slate';return 'bg-'+c+'-500/20 text-'+c+'-400 border-'+c+'-500/50';}

function render(){if(!token||!user)renderLogin();else renderDashboard();}

function renderLogin(){
  document.getElementById('app').innerHTML=\`<div class="min-h-screen flex items-center justify-center p-4"><div class="bg-dark-700/90 backdrop-blur rounded-2xl p-8 w-full max-w-md border border-dark-500 shadow-2xl"><div class="text-center mb-8"><img src="\${LOGO_URL}" alt="M.M.H" class="h-24 w-auto mx-auto mb-6" onerror="this.style.display='none';"><h1 class="text-3xl font-bold text-mmh">M.M.H Delivery</h1><p class="text-gray-400 mt-2">מערכת ניהול משלוחים</p><p class="text-xs text-gray-500 mt-1">🔒 גרסה מאובטחת v5.0</p></div><div id="loginError" class="hidden bg-red-500/20 border border-red-500 text-red-400 rounded-lg p-3 mb-4 text-center"></div><div class="space-y-4"><input type="text" id="username" placeholder="שם משתמש" class="w-full bg-dark-900 border border-dark-500 rounded-xl px-4 py-3 text-white focus:border-mmh-500 focus:outline-none focus:ring-1 focus:ring-mmh-500 transition"><input type="password" id="password" placeholder="סיסמה" class="w-full bg-dark-900 border border-dark-500 rounded-xl px-4 py-3 text-white focus:border-mmh-500 focus:outline-none focus:ring-1 focus:ring-mmh-500 transition" onkeypress="if(event.key==='Enter')login()"><div id="twoFactorSection" class="hidden"><input type="text" id="twoFactorCode" placeholder="קוד אימות (6 ספרות)" maxlength="6" class="w-full bg-dark-900 border border-amber-500 rounded-xl px-4 py-3 text-white text-center text-xl tracking-widest focus:border-amber-400 focus:outline-none" onkeypress="if(event.key==='Enter')login()"></div><button onclick="login()" class="w-full gradient-mmh text-white py-3 rounded-xl font-bold hover:opacity-90 transition shadow-lg">התחבר</button></div></div></div>\`;
}

function renderDashboard(){
  const fo=orders.filter(o=>{if(filter==='active')return['new','published','taken','picked'].includes(o.status);if(filter==='delivered')return o.status==='delivered';if(filter==='cancelled')return o.status==='cancelled';return true;}).filter(o=>{if(!search)return true;const s=search.toLowerCase();return o.orderNumber?.toLowerCase().includes(s)||o.senderName?.toLowerCase().includes(s)||o.receiverName?.toLowerCase().includes(s)||o.pickupAddress?.toLowerCase().includes(s)||o.deliveryAddress?.toLowerCase().includes(s);});
  
  document.getElementById('app').innerHTML=\`
<header class="border-b border-dark-500 bg-dark-800/90 backdrop-blur sticky top-0 z-40">
  <div class="max-w-7xl mx-auto px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3"><img src="\${LOGO_URL}" alt="M.M.H" class="h-12 w-auto" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%2300afcd%22 width=%2240%22 height=%2240%22 rx=%228%22/><text x=%2220%22 y=%2228%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2216%22>🚚</text></svg>';"><div><h1 class="text-lg font-bold text-white">M.M.H Delivery</h1><p class="text-xs text-mmh">🔒 v5.0</p></div></div>
      <div class="flex items-center gap-3"><div class="px-3 py-1 rounded-full text-sm \${connected?'bg-mmh-500/20 text-mmh-400':'bg-red-500/20 text-red-400'}">\${connected?'🟢 מחובר':'🔴 מתחבר...'}</div><span class="text-sm text-gray-300">\${user.name}</span><button onclick="logout()" class="p-2 hover:bg-dark-600 rounded-lg text-gray-400 transition">🚪</button></div>
    </div>
    <div class="flex gap-1 mt-3 overflow-x-auto pb-1">
      <button onclick="setTab('orders')" class="px-4 py-2 rounded-lg text-sm font-medium transition \${currentTab==='orders'?'bg-mmh-500 text-white':'text-gray-400 hover:bg-dark-600'}">📦 הזמנות</button>
      <button onclick="setTab('couriers')" class="px-4 py-2 rounded-lg text-sm font-medium transition \${currentTab==='couriers'?'bg-mmh-500 text-white':'text-gray-400 hover:bg-dark-600'}">🏍️ שליחים</button>
      <button onclick="setTab('stats')" class="px-4 py-2 rounded-lg text-sm font-medium transition \${currentTab==='stats'?'bg-mmh-500 text-white':'text-gray-400 hover:bg-dark-600'}">📊 סטטיסטיקות</button>
      \${user.role==='admin'?'<button onclick="setTab(\\'users\\')" class="px-4 py-2 rounded-lg text-sm font-medium transition '+(currentTab==='users'?'bg-mmh-500 text-white':'text-gray-400 hover:bg-dark-600')+'">👥 משתמשים</button>':''}
      \${user.role==='admin'?'<button onclick="setTab(\\'admin\\')" class="px-4 py-2 rounded-lg text-sm font-medium transition '+(currentTab==='admin'?'bg-red-600 text-white':'text-red-400 hover:bg-dark-600')+'">⚙️ כלים</button>':''}
    </div>
  </div>
</header>
<main class="max-w-7xl mx-auto px-4 py-6">
  \${currentTab==='orders'?renderOrders(fo):''}
  \${currentTab==='couriers'?renderCouriers():''}
  \${currentTab==='stats'?renderStats():''}
  \${currentTab==='users'?renderUsers():''}
  \${currentTab==='admin'?renderAdmin():''}
</main>
<div id="modal"></div>\`;
}

function renderOrders(fo){
  return \`
<div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
  <div class="bg-dark-700/50 rounded-xl p-4 border border-dark-500/50"><div class="text-2xl font-bold">\${stats.total||0}</div><div class="text-sm text-gray-400">סה״כ</div></div>
  <div class="bg-dark-700/50 rounded-xl p-4 border border-dark-500/50"><div class="text-2xl font-bold text-amber-400">\${(parseInt(stats.new)||0)+(parseInt(stats.published)||0)}</div><div class="text-sm text-gray-400">ממתינים</div></div>
  <div class="bg-dark-700/50 rounded-xl p-4 border border-dark-500/50"><div class="text-2xl font-bold text-purple-400">\${stats.active||0}</div><div class="text-sm text-gray-400">פעילים</div></div>
  <div class="bg-dark-700/50 rounded-xl p-4 border border-dark-500/50"><div class="text-2xl font-bold text-mmh-400">\${stats.delivered||0}</div><div class="text-sm text-gray-400">נמסרו</div></div>
  <div class="bg-dark-700/50 rounded-xl p-4 border border-dark-500/50"><div class="text-2xl font-bold text-mmh-400">\${fmt(stats.revenue)}</div><div class="text-sm text-gray-400">הכנסות</div></div>
</div>
<div class="flex flex-wrap items-center justify-between gap-3 mb-6">
  <div class="flex gap-2 overflow-x-auto">
    <button onclick="setFilter('all')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='all'?'bg-dark-600 text-white':'bg-dark-700/50 text-gray-400'}">הכל</button>
    <button onclick="setFilter('active')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='active'?'bg-dark-600 text-white':'bg-dark-700/50 text-gray-400'}">פעילים</button>
    <button onclick="setFilter('delivered')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='delivered'?'bg-dark-600 text-white':'bg-dark-700/50 text-gray-400'}">נמסרו</button>
    <button onclick="setFilter('cancelled')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='cancelled'?'bg-dark-600 text-white':'bg-dark-700/50 text-gray-400'}">בוטלו</button>
  </div>
  <div class="flex gap-2">
    <input type="text" placeholder="🔍 חיפוש..." value="\${search}" onchange="search=this.value;render()" class="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm text-white w-40">
    <button onclick="showNewOrderModal()" class="bg-gradient-to-r from-mmh-500 to-mmh-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium">➕ הזמנה</button>
  </div>
</div>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  \${fo.map(o=>\`
    <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 overflow-hidden">
      <div class="p-3 border-b border-dark-500/50 flex items-center justify-between">
        <div class="flex items-center gap-2"><span class="font-bold font-mono">\${o.orderNumber}</span><span class="px-2 py-0.5 rounded-full text-xs border \${statusColor(o.status)}">\${statusText(o.status)}</span></div>
        <span class="text-xs text-slate-500">\${fmtDate(o.createdAt)}</span>
      </div>
      <div class="p-3 space-y-2 text-sm">
        <div class="flex gap-2"><span class="text-slate-500">👤</span><span>\${o.senderName} - \${o.senderPhone}</span></div>
        <div class="flex gap-2"><span class="text-slate-500">📍</span><span class="text-gray-300">\${o.pickupAddress}</span></div>
        <div class="flex gap-2"><span class="text-slate-500">🏠</span><span class="text-gray-300">\${o.deliveryAddress}</span></div>
        <div class="flex justify-between pt-2 border-t border-dark-500/50">
          <div><span class="text-slate-500">מחיר:</span> <span class="font-bold">\${fmt(o.price)}</span></div>
          <div><span class="text-slate-500">לשליח:</span> <span class="font-bold text-mmh-400">\${fmt(o.courierPayout)}</span></div>
        </div>
        \${o.courier?\`<div class="bg-dark-600/50 rounded-lg p-2 text-xs"><span class="text-slate-500">שליח:</span> \${o.courier.name} - \${o.courier.phone}</div>\`:''}
        \${o.status==='new'?\`<div class="flex gap-2 pt-2"><button onclick="publishOrder(\${o.id})" class="flex-1 bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-2 rounded-lg text-sm font-medium">📤 פרסם</button><button onclick="editOrder(\${o.id})" class="px-3 bg-blue-500/20 text-blue-400 rounded-lg">✏️</button><button onclick="cancelOrder(\${o.id})" class="px-3 bg-red-500/20 text-red-400 rounded-lg">✕</button></div>\`:''}
        \${o.status==='published'?\`<div class="flex gap-2 pt-2"><button onclick="editOrder(\${o.id})" class="flex-1 bg-blue-500/20 text-blue-400 py-2 rounded-lg text-sm">✏️ ערוך</button><button onclick="cancelOrder(\${o.id})" class="flex-1 bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">❌ בטל</button></div>\`:''}
        \${o.status==='taken'||o.status==='picked'?\`<button onclick="cancelOrder(\${o.id})" class="w-full bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">❌ בטל</button>\`:''}
        \${o.status==='cancelled'&&user.role==='admin'?\`<button onclick="deleteOrder(\${o.id})" class="w-full bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">🗑️ מחק</button>\`:''}
      </div>
    </div>\`).join('')}
</div>
\${fo.length===0?'<div class="text-center py-12 text-gray-400">אין הזמנות להצגה</div>':''}\`;
}

function renderCouriers(){
  return \`
<div class="mb-6 flex justify-between items-center"><h2 class="text-xl font-bold">🏍️ שליחים (\${couriers.length})</h2></div>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  \${couriers.map(c=>\`
    <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 bg-dark-600 rounded-full flex items-center justify-center">🏍️</div><div><div class="font-bold">\${c.first_name} \${c.last_name}</div><div class="text-sm text-gray-400">\${c.phone}</div></div></div>
        <span class="px-2 py-1 rounded text-xs \${c.status==='active'?'bg-mmh-500/20 text-mmh-400':'bg-red-500/20 text-red-400'}">\${c.status==='active'?'פעיל':'לא פעיל'}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center text-sm">
        <div class="bg-dark-600/50 rounded-lg p-2"><div class="font-bold">\${c.total_deliveries||0}</div><div class="text-xs text-gray-400">משלוחים</div></div>
        <div class="bg-dark-600/50 rounded-lg p-2"><div class="font-bold text-mmh-400">\${fmt(c.total_earned)}</div><div class="text-xs text-gray-400">סה״כ</div></div>
        <div class="bg-dark-600/50 rounded-lg p-2"><div class="font-bold text-amber-400">\${fmt(c.balance)}</div><div class="text-xs text-gray-400">יתרה</div></div>
      </div>
      \${parseFloat(c.balance)>0?\`<button onclick="showPaymentModal(\${c.id},'\${c.first_name} \${c.last_name}',\${c.balance})" class="w-full mt-3 bg-mmh-500/20 text-mmh-400 py-2 rounded-lg text-sm">💳 שלם</button>\`:''}
    </div>\`).join('')}
</div>\`;
}

function renderStats(){
  return \`
<h2 class="text-xl font-bold mb-6">📊 סטטיסטיקות (30 יום)</h2>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-4xl font-bold">\${stats.total||0}</div><div class="text-gray-400 mt-2">סה״כ הזמנות</div></div>
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-4xl font-bold text-mmh-400">\${stats.delivered||0}</div><div class="text-gray-400 mt-2">נמסרו</div></div>
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-4xl font-bold text-mmh-400">\${fmt(stats.revenue)}</div><div class="text-gray-400 mt-2">הכנסות ברוטו</div></div>
</div>
<h3 class="text-lg font-bold mb-4">💰 ניתוח רווחיות</h3>
<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-3xl font-bold text-amber-400">\${fmt(stats.total_payout)}</div><div class="text-gray-400 mt-2">לתשלום לשליחים</div></div>
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-3xl font-bold text-blue-400">\${fmt(stats.total_paid)}</div><div class="text-gray-400 mt-2">שולם לשליחים</div></div>
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6 text-center"><div class="text-3xl font-bold text-purple-400">\${fmt(parseFloat(stats.total_payout||0)-parseFloat(stats.total_paid||0))}</div><div class="text-gray-400 mt-2">יתרה לתשלום</div></div>
  <div class="bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-xl border border-emerald-500/50 p-6 text-center"><div class="text-3xl font-bold text-mmh-400">\${fmt(stats.commission)}</div><div class="text-emerald-300 mt-2 font-medium">💎 רווח נקי (25%)</div></div>
</div>\`;
}

function renderUsers(){
  return \`
<div class="mb-6 flex justify-between items-center"><h2 class="text-xl font-bold">👥 משתמשים (\${users.length})</h2><button onclick="showNewUserModal()" class="bg-gradient-to-r from-mmh-500 to-mmh-600 text-white px-4 py-2 rounded-lg text-sm font-medium">➕ משתמש</button></div>
<div class="bg-dark-700/60 rounded-xl border border-dark-500/50 overflow-hidden">
  <table class="w-full text-sm">
    <thead class="bg-dark-600/50"><tr><th class="text-right p-3">שם</th><th class="text-right p-3">משתמש</th><th class="text-right p-3">תפקיד</th><th class="text-right p-3">טלפון</th><th class="text-right p-3">סטטוס</th><th class="text-right p-3">פעולות</th></tr></thead>
    <tbody>\${users.map(u=>\`<tr class="border-t border-dark-500/50"><td class="p-3">\${u.name}</td><td class="p-3 text-gray-400">\${u.username}</td><td class="p-3"><span class="px-2 py-1 rounded text-xs \${u.role==='admin'?'bg-purple-500/20 text-purple-400':'bg-blue-500/20 text-blue-400'}">\${u.role==='admin'?'מנהל':u.role==='manager'?'מנהל משמרת':'נציג'}</span></td><td class="p-3 text-gray-400">\${u.phone||'-'}</td><td class="p-3"><span class="px-2 py-1 rounded text-xs \${u.active?'bg-mmh-500/20 text-mmh-400':'bg-red-500/20 text-red-400'}">\${u.active?'פעיל':'לא פעיל'}</span></td><td class="p-3"><div class="flex gap-1"><button onclick="showEditUserModal(\${u.id})" class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">✏️</button><button onclick="showChangePasswordModal(\${u.id},'\${u.name}')" class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">🔑</button>\${u.id!==user.id?'<button onclick="deleteUser('+u.id+')" class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">🗑️</button>':''}</div></td></tr>\`).join('')}</tbody>
  </table>
</div>\`;
}

function renderAdmin(){
  return \`
<h2 class="text-xl font-bold mb-6">⚙️ כלי אדמין</h2>
<div class="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6">
  <div class="flex items-center gap-2 text-red-400 mb-2"><span class="text-xl">⚠️</span><span class="font-bold">אזור מסוכן!</span></div>
  <p class="text-sm text-red-300">הפעולות כאן הן בלתי הפיכות. השתמש בזהירות.</p>
</div>

<div class="grid md:grid-cols-2 gap-6">
  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6">
    <h3 class="font-bold text-lg mb-4">📦 ניהול הזמנות</h3>
    <div class="space-y-3">
      <button onclick="adminDeleteDelivered()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק הזמנות שנמסרו</button>
      <button onclick="adminDeleteCancelled()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק הזמנות מבוטלות</button>
      <button onclick="adminDeleteAllOrders()" class="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-3 rounded-lg text-sm hover:bg-red-500/30">💣 מחק את כל ההזמנות</button>
    </div>
  </div>

  <div class="bg-dark-700/60 rounded-xl border border-dark-500/50 p-6">
    <h3 class="font-bold text-lg mb-4">🏍️ ניהול שליחים</h3>
    <div class="space-y-3">
      <button onclick="adminResetCourierStats()" class="w-full bg-blue-500/20 text-blue-400 border border-blue-500/50 py-3 rounded-lg text-sm hover:bg-blue-500/30">🔄 אפס סטטיסטיקות שליחים</button>
      <button onclick="adminDeleteAllPayments()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק היסטוריית תשלומים</button>
      <button onclick="adminDeleteAllCouriers()" class="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-3 rounded-lg text-sm hover:bg-red-500/30">💣 מחק את כל השליחים</button>
    </div>
  </div>

  <div class="bg-dark-700/60 rounded-xl border border-red-500/50 p-6 md:col-span-2">
    <h3 class="font-bold text-lg mb-4 text-red-400">🔴 איפוס מלא</h3>
    <p class="text-sm text-gray-400 mb-4">מוחק את כל ההזמנות, השליחים, התשלומים והלוגים. המשתמשים נשארים.</p>
    <button onclick="adminFullReset()" class="w-full bg-red-600 text-white py-3 rounded-lg text-sm font-bold hover:bg-red-700">⚠️ אפס את כל המערכת</button>
  </div>
</div>\`;
}

async function adminDeleteDelivered(){if(!confirm('למחוק את כל ההזמנות שנמסרו?'))return;const r=await api('/api/admin/orders/delivered','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteCancelled(){if(!confirm('למחוק את כל ההזמנות המבוטלות?'))return;const r=await api('/api/admin/orders/cancelled','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteAllOrders(){if(!confirm('למחוק את כל ההזמנות? פעולה זו בלתי הפיכה!'))return;if(!confirm('אתה בטוח? זה ימחק הכל!'))return;const r=await api('/api/admin/orders/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteAllCouriers(){if(!confirm('למחוק את כל השליחים?'))return;const r=await api('/api/admin/couriers/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' שליחים');loadCouriers();}else alert(r.error);}
async function adminResetCourierStats(){if(!confirm('לאפס סטטיסטיקות של כל השליחים? (משלוחים, רווחים, יתרות)'))return;const r=await api('/api/admin/couriers/reset-stats','POST');if(r.success){showToast('סטטיסטיקות אופסו');loadCouriers();}else alert(r.error);}
async function adminDeleteAllPayments(){if(!confirm('למחוק את כל היסטוריית התשלומים?'))return;const r=await api('/api/admin/payments/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' תשלומים');loadCouriers();}else alert(r.error);}
async function adminFullReset(){if(!confirm('לאפס את כל המערכת? פעולה זו בלתי הפיכה!'))return;if(!confirm('אתה בטוח לחלוטין?'))return;if(prompt('הקלד "אפס" לאישור')!=='אפס')return;const r=await api('/api/admin/reset','DELETE');if(r.success){showToast('המערכת אופסה');location.reload();}else alert(r.error);}

function showNewOrderModal(){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">📦 הזמנה חדשה</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <input type="text" id="senderName" placeholder="שם שולח" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <input type="tel" id="senderPhone" placeholder="טלפון שולח" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    </div>
    <input type="text" id="pickupAddress" placeholder="📍 כתובת איסוף" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    <div class="grid grid-cols-2 gap-3">
      <input type="text" id="receiverName" placeholder="שם מקבל" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <input type="tel" id="receiverPhone" placeholder="טלפון מקבל" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    </div>
    <input type="text" id="deliveryAddress" placeholder="🏠 כתובת מסירה" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    <textarea id="details" placeholder="פרטים נוספים" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm h-16 resize-none"></textarea>
    
    <div id="priceCalcResult" class="hidden bg-dark-600/50 rounded-lg p-3 text-sm">
      <div class="flex justify-between items-center">
        <span class="text-gray-400">מרחק:</span>
        <span id="calcDistance" class="text-white font-medium">-</span>
      </div>
      <div class="flex justify-between items-center mt-1">
        <span class="text-gray-400">זמן משוער:</span>
        <span id="calcDuration" class="text-white font-medium">-</span>
      </div>
      <div class="flex justify-between items-center mt-1 pt-1 border-t border-dark-500">
        <span class="text-gray-400">לפני מע"מ:</span>
        <span id="calcPriceBeforeVat" class="text-white">-</span>
      </div>
      <div class="flex justify-between items-center mt-1">
        <span class="text-gray-400">מע"מ (18%):</span>
        <span id="calcVat" class="text-white">-</span>
      </div>
      <div class="flex justify-between items-center mt-1 pt-1 border-t border-dark-500">
        <span class="text-gray-400 font-bold">סה"כ כולל מע"מ:</span>
        <span id="calcPrice" class="text-mmh-400 font-bold text-lg">-</span>
      </div>
    </div>
    
    <div class="grid grid-cols-3 gap-3">
      <input type="number" id="price" placeholder="מחיר ₪" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <select id="priority" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
        <option value="normal">רגיל</option>
        <option value="express">אקספרס</option>
        <option value="urgent">דחוף</option>
      </select>
      <button type="button" onclick="calculatePriceForOrder()" class="bg-amber-500/20 text-amber-400 rounded-lg px-3 py-2 text-sm font-medium hover:bg-amber-500/30">🧮 חשב</button>
    </div>
    
    <button onclick="submitOrder()" class="w-full bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-3 rounded-lg font-bold">✅ צור הזמנה</button>
  </div></div></div>\`;
}

async function calculatePriceForOrder(){
  const pickup = document.getElementById('pickupAddress').value;
  const delivery = document.getElementById('deliveryAddress').value;
  
  if(!pickup || !delivery){
    showToast('⚠️ יש להזין כתובות איסוף ומסירה','warning');
    return;
  }
  
  const btn = event.target;
  btn.innerHTML = '⏳ מחשב...';
  btn.disabled = true;
  
  try {
    const r = await api('/api/calculate-price', 'POST', { pickupAddress: pickup, deliveryAddress: delivery });
    
    if(r.success && r.distance){
      document.getElementById('priceCalcResult').classList.remove('hidden');
      document.getElementById('calcDistance').textContent = r.distance.text;
      document.getElementById('calcDuration').textContent = r.distance.duration;
      document.getElementById('calcPriceBeforeVat').textContent = '₪' + r.priceBeforeVat;
      document.getElementById('calcVat').textContent = '₪' + r.vat;
      document.getElementById('calcPrice').textContent = '₪' + r.price;
      document.getElementById('price').value = r.price;
      showToast('✅ מחיר כולל מע"מ: ₪' + r.price);
    } else {
      document.getElementById('price').value = r.price || 89;
      showToast('⚠️ ' + (r.note || 'מחיר בסיס הוגדר'));
    }
  } catch(e){
    showToast('❌ שגיאה בחישוב','error');
  } finally {
    btn.innerHTML = '🧮 חשב';
    btn.disabled = false;
  }
}

function submitOrder(){createOrder({senderName:document.getElementById('senderName').value,senderPhone:document.getElementById('senderPhone').value,pickupAddress:document.getElementById('pickupAddress').value,receiverName:document.getElementById('receiverName').value,receiverPhone:document.getElementById('receiverPhone').value,deliveryAddress:document.getElementById('deliveryAddress').value,details:document.getElementById('details').value,price:parseInt(document.getElementById('price').value)||0,priority:document.getElementById('priority').value});}

function showNewUserModal(){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">משתמש חדש</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><input type="text" id="newUserName" placeholder="שם מלא" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="text" id="newUsername" placeholder="שם משתמש" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="password" id="newPassword" placeholder="סיסמה" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="newUserPhone" placeholder="טלפון" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><select id="newUserRole" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><option value="agent">נציג</option><option value="manager">מנהל משמרת</option><option value="admin">מנהל</option></select><button onclick="submitUser()" class="w-full bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-3 rounded-lg font-bold">צור משתמש</button></div></div></div>\`;
}

function submitUser(){createUser({name:document.getElementById('newUserName').value,username:document.getElementById('newUsername').value,password:document.getElementById('newPassword').value,phone:document.getElementById('newUserPhone').value,role:document.getElementById('newUserRole').value});}

function showPaymentModal(id,name,balance){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">💳 תשלום</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-4"><div class="text-center"><div class="text-lg">\${name}</div><div class="text-2xl font-bold text-amber-400 mt-2">יתרה: \${fmt(balance)}</div></div><input type="number" id="paymentAmount" placeholder="סכום" value="\${balance}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><select id="paymentMethod" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><option value="cash">מזומן</option><option value="transfer">העברה</option><option value="bit">ביט</option></select><input type="text" id="paymentNotes" placeholder="הערות" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><button onclick="submitPayment(\${id})" class="w-full bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-3 rounded-lg font-bold">אשר תשלום</button></div></div></div>\`;
}

function submitPayment(id){createPayment({courier_id:id,amount:parseFloat(document.getElementById('paymentAmount').value)||0,method:document.getElementById('paymentMethod').value,notes:document.getElementById('paymentNotes').value});}

function showEditOrderModal(o){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">✏️ עריכת הזמנה \${o.orderNumber}</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <input type="text" id="editSenderName" placeholder="שם שולח" value="\${o.senderName||''}" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <input type="tel" id="editSenderPhone" placeholder="טלפון שולח" value="\${o.senderPhone||''}" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    </div>
    <input type="text" id="editPickupAddress" placeholder="📍 כתובת איסוף" value="\${o.pickupAddress||''}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    <div class="grid grid-cols-2 gap-3">
      <input type="text" id="editReceiverName" placeholder="שם מקבל" value="\${o.receiverName||''}" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <input type="tel" id="editReceiverPhone" placeholder="טלפון מקבל" value="\${o.receiverPhone||''}" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    </div>
    <input type="text" id="editDeliveryAddress" placeholder="🏠 כתובת מסירה" value="\${o.deliveryAddress||''}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
    <textarea id="editDetails" placeholder="פרטים נוספים" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm h-16 resize-none">\${o.details||''}</textarea>
    
    <div id="editPriceCalcResult" class="hidden bg-dark-600/50 rounded-lg p-3 text-sm">
      <div class="flex justify-between"><span class="text-gray-400">מרחק:</span><span id="editCalcDistance" class="text-white font-medium">-</span></div>
      <div class="flex justify-between mt-1"><span class="text-gray-400">זמן:</span><span id="editCalcDuration" class="text-white font-medium">-</span></div>
      <div class="flex justify-between mt-1"><span class="text-gray-400">מחיר מחושב:</span><span id="editCalcPrice" class="text-mmh-400 font-bold">-</span></div>
    </div>
    
    <div class="grid grid-cols-3 gap-3">
      <input type="number" id="editPrice" placeholder="מחיר ₪" value="\${o.price||0}" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
      <select id="editPriority" class="bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm">
        <option value="normal" \${o.priority==='normal'?'selected':''}>רגיל</option>
        <option value="express" \${o.priority==='express'?'selected':''}>אקספרס</option>
        <option value="urgent" \${o.priority==='urgent'?'selected':''}>דחוף</option>
      </select>
      <button type="button" onclick="calculatePriceForEdit()" class="bg-amber-500/20 text-amber-400 rounded-lg px-3 py-2 text-sm font-medium hover:bg-amber-500/30">🧮 חשב</button>
    </div>
    
    <button onclick="submitEditOrder(\${o.id})" class="w-full bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-3 rounded-lg font-bold">💾 שמור שינויים</button>
  </div></div></div>\`;
}

async function calculatePriceForEdit(){
  const pickup = document.getElementById('editPickupAddress').value;
  const delivery = document.getElementById('editDeliveryAddress').value;
  
  if(!pickup || !delivery){
    showToast('⚠️ יש להזין כתובות','warning');
    return;
  }
  
  const btn = event.target;
  btn.innerHTML = '⏳';
  btn.disabled = true;
  
  try {
    const r = await api('/api/calculate-price', 'POST', { pickupAddress: pickup, deliveryAddress: delivery });
    
    if(r.success && r.distance){
      document.getElementById('editPriceCalcResult').classList.remove('hidden');
      document.getElementById('editCalcDistance').textContent = r.distance.text;
      document.getElementById('editCalcDuration').textContent = r.distance.duration;
      document.getElementById('editCalcPrice').textContent = '₪' + r.price;
      document.getElementById('editPrice').value = r.price;
      showToast('✅ מחיר חושב: ₪' + r.price);
    } else {
      document.getElementById('editPrice').value = r.price || 75;
      showToast('⚠️ מחיר בסיס הוגדר');
    }
  } catch(e){
    showToast('❌ שגיאה','error');
  } finally {
    btn.innerHTML = '🧮 חשב';
    btn.disabled = false;
  }
}

function submitEditOrder(id){updateOrder(id,{senderName:document.getElementById('editSenderName').value,senderPhone:document.getElementById('editSenderPhone').value,pickupAddress:document.getElementById('editPickupAddress').value,receiverName:document.getElementById('editReceiverName').value,receiverPhone:document.getElementById('editReceiverPhone').value,deliveryAddress:document.getElementById('editDeliveryAddress').value,details:document.getElementById('editDetails').value,price:parseInt(document.getElementById('editPrice').value)||0,priority:document.getElementById('editPriority').value});}

function showEditUserModal(id){
  const u=users.find(x=>x.id===id);if(!u)return;
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">✏️ עריכת משתמש</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><input type="text" id="editUserName" placeholder="שם מלא" value="\${u.name}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="editUserPhone" placeholder="טלפון" value="\${u.phone||''}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="email" id="editUserEmail" placeholder="אימייל" value="\${u.email||''}" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><select id="editUserRole" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><option value="agent" \${u.role==='agent'?'selected':''}>נציג</option><option value="manager" \${u.role==='manager'?'selected':''}>מנהל משמרת</option><option value="admin" \${u.role==='admin'?'selected':''}>מנהל</option></select><select id="editUserActive" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><option value="true" \${u.active?'selected':''}>פעיל</option><option value="false" \${!u.active?'selected':''}>לא פעיל</option></select><button onclick="submitEditUser(\${u.id})" class="w-full bg-gradient-to-r from-mmh-500 to-mmh-600 text-white py-3 rounded-lg font-bold">💾 שמור</button></div></div></div>\`;
}

function submitEditUser(id){updateUser(id,{name:document.getElementById('editUserName').value,phone:document.getElementById('editUserPhone').value,email:document.getElementById('editUserEmail').value,role:document.getElementById('editUserRole').value,active:document.getElementById('editUserActive').value==='true'});}

function showChangePasswordModal(id,name){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-dark-700 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-dark-500 flex justify-between items-center"><h2 class="text-lg font-bold">🔑 שינוי סיסמה</h2><button onclick="closeModal()" class="text-gray-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><div class="text-center mb-4"><div class="text-gray-400">עבור: <span class="text-white">\${name}</span></div></div><input type="password" id="newUserPassword" placeholder="סיסמה חדשה" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><input type="password" id="confirmUserPassword" placeholder="אישור סיסמה" class="w-full bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-white text-sm"><button onclick="submitChangePassword(\${id})" class="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 rounded-lg font-bold">🔑 שנה סיסמה</button></div></div></div>\`;
}

function submitChangePassword(id){const p1=document.getElementById('newUserPassword').value,p2=document.getElementById('confirmUserPassword').value;if(p1!==p2){alert('הסיסמאות לא תואמות');return;}changeUserPassword(id,p1);}

if(token)connectWS();
render();
</script>
</body>
</html>`);
});

// ==================== START ====================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🚚  M.M.H Delivery System Pro v4.0  🚚                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Server: http://localhost:' + CONFIG.PORT + '                             ║');
  console.log('║  Public: ' + CONFIG.PUBLIC_URL.padEnd(43) + '║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  🆕 New Features:                                            ║');
  console.log('║  • Courier Registration: /courier/register                   ║');
  console.log('║  • Auto-Identify Couriers on Take Order                      ║');
  console.log('║  • Quick Take for Registered Couriers                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

// Auto-migrate on startup
(async () => {
  try {
    await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS email VARCHAR(100)`);
    await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(30) DEFAULT 'motorcycle'`);
    console.log('✅ Auto-migration completed');
  } catch (e) {
    console.log('⚠️ Migration skipped:', e.message);
  }
})();
