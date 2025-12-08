/**
 * M.M.H Delivery System Pro v3.0
 * Full featured delivery management with PostgreSQL
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ==================== CONFIG ====================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  PUBLIC_URL: process.env.PUBLIC_URL || 'https://mmh-delivery.onrender.com',
  JWT_SECRET: process.env.JWT_SECRET || 'mmh-secret-change-this',
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    TOKEN: process.env.WHAPI_TOKEN,
    GROUP_ID: process.env.COURIERS_GROUP_ID,
  },
  COMMISSION: parseFloat(process.env.COMMISSION_RATE) || 0.25,
};

// ==================== DATABASE ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ==================== EXPRESS ====================
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const server = http.createServer(app);

// ==================== AUTH ====================
const verifyToken = (token) => {
  try { return jwt.verify(token, CONFIG.JWT_SECRET); } 
  catch (e) { return null; }
};

const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'נדרשת התחברות' });
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'טוקן לא תקין' });
  req.user = decoded;
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'אין הרשאה' });
  next();
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
  let msg = `${emoji} *משלוח חדש - ${o.order_number}*\n\n📍 *איסוף:* ${o.pickup_address}\n🏠 *יעד:* ${o.delivery_address}\n`;
  if (o.details) msg += `📝 *פרטים:* ${o.details}\n`;
  msg += `\n💰 *תשלום:* ₪${o.courier_payout}\n\n👇 *לתפיסה:*\n${url}`;
  if (CONFIG.WHAPI.GROUP_ID) await sendWhatsApp(CONFIG.WHAPI.GROUP_ID, msg);
  broadcast({ type: 'order_updated', data: { order: formatOrder(o) } });
  console.log('📤 Published:', o.order_number);
};

const takeOrder = async (orderNum, cd) => {
  const or = await pool.query("SELECT * FROM orders WHERE order_number=$1 AND status='published'",[orderNum]);
  const o = or.rows[0]; if (!o) return { success: false, error: 'המשלוח כבר נתפס' };
  
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
  msg += `📥 *פרטי המקבל:*\n👤 שם: ${o.receiver_name}\n📞 טלפון: ${o.receiver_phone}\n\n`;
  msg += `🏠 *כתובת מסירה:*\n${o.delivery_address}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (o.details) msg += `📝 *פרטים:*\n${o.details}\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *תשלום אחרי עמלה:* ₪${o.courier_payout}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n📦 *אספת? לחץ כאן:*\n${pickupUrl}\n\nבהצלחה! 🚀`;
  
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
    msg += `━━━━━━━━━━━━━━━━━━━━\n📬 *מסרת? לחץ כאן:*\n${url}`;
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
  const r = await pool.query("UPDATE orders SET status='cancelled',cancelled_at=NOW(),cancel_reason=$1 WHERE id=$2 RETURNING *",[reason,id]);
  const o = r.rows[0]; if (!o) return;
  
  if (o.courier_id) {
    const cr = await pool.query("SELECT * FROM couriers WHERE id=$1",[o.courier_id]);
    if (cr.rows[0]?.whatsapp_id) await sendWhatsApp(cr.rows[0].whatsapp_id, `❌ *המשלוח ${o.order_number} בוטל*`);
  }
  if (CONFIG.WHAPI.GROUP_ID && ['published','taken','picked'].includes(o.status)) 
    await sendWhatsApp(CONFIG.WHAPI.GROUP_ID, `❌ המשלוח ${o.order_number} בוטל`);
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(o) } });
  console.log('❌ Cancelled:', o.order_number);
};

// ==================== API ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query("SELECT * FROM users WHERE username=$1 AND active=true",[username]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) 
      return res.json({ success: false, error: 'שם משתמש או סיסמה שגויים' });
    
    await pool.query("UPDATE users SET last_login=NOW() WHERE id=$1",[user.id]);
    const token = jwt.sign({ id:user.id, username:user.username, role:user.role, name:user.name }, CONFIG.JWT_SECRET, { expiresIn:'7d' });
    res.json({ success:true, token, user:{ id:user.id, username:user.username, name:user.name, role:user.role } });
  } catch (e) { console.error('Login error:',e); res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ success:true, user:req.user }));

app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("SELECT id,username,name,role,phone,email,active,created_at FROM users ORDER BY created_at DESC");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'שגיאת שרת' }); }
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, name, role, phone, email } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query("INSERT INTO users (username,password,name,role,phone,email) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,username,name,role",
      [username,hash,name,role||'agent',phone,email]);
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
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// שינוי סיסמה למשתמש (אדמין בלבד)
app.put('/api/users/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.json({ success:false, error:'סיסמה חייבת להכיל לפחות 4 תווים' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query("UPDATE users SET password=$1 WHERE id=$2",[hash,req.params.id]);
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
    if (!newPassword || newPassword.length < 4) return res.json({ success:false, error:'סיסמה חייבת להכיל לפחות 4 תווים' });
    const hash = await bcrypt.hash(newPassword, 10);
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
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, error:'שגיאת שרת' }); }
});

// ==================== PUBLIC ROUTES ====================
app.get('/take/:orderNumber', async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM orders WHERE order_number=$1",[req.params.orderNumber]);
    const o = r.rows[0];
    if (!o) return res.send(statusHTML('❌','הזמנה לא נמצאה','','#ef4444'));
    if (o.status !== 'published') return res.send(statusHTML('🏍️','המשלוח נתפס!','מישהו הספיק לפניך','#f59e0b'));
    res.send(takeOrderHTML(o));
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

// מחיקת הזמנות שהושלמו בלבד
app.delete('/api/admin/orders/delivered', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM orders WHERE status='delivered' RETURNING id");
    res.json({ success: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ success: false, error: 'שגיאת שרת' }); }
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

// מחיקת כל התשלומים
app.delete('/api/admin/payments/all', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM payments RETURNING id");
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

// ==================== DASHBOARD ====================
app.get('/', (req, res) => {
  const wsUrl = CONFIG.PUBLIC_URL.replace('https://','wss://').replace('http://','ws://');
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>M.M.H Delivery</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>*{font-family:system-ui,-apple-system,sans-serif}</style>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
<div id="app"></div>
<script>
const API='',WS_URL='${wsUrl}';
let token=localStorage.getItem('token'),user=JSON.parse(localStorage.getItem('user')||'null'),orders=[],stats={},couriers=[],users=[],ws=null,connected=false,currentTab='orders',filter='all',search='';

async function login(){
  const u=document.getElementById('username').value,p=document.getElementById('password').value;
  try{
    const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(d.success){token=d.token;user=d.user;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));connectWS();render();}
    else{document.getElementById('loginError').textContent=d.error;document.getElementById('loginError').classList.remove('hidden');}
  }catch(e){document.getElementById('loginError').textContent='שגיאת תקשורת';document.getElementById('loginError').classList.remove('hidden');}
}

function logout(){token=null;user=null;localStorage.removeItem('token');localStorage.removeItem('user');if(ws)ws.close();render();}

function connectWS(){
  if(!token)return;ws=new WebSocket(WS_URL);
  ws.onopen=()=>{connected=true;ws.send(JSON.stringify({type:'auth',token}));render();};
  ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.type==='init'){orders=m.data.orders||[];stats=m.data.stats||{};render();}else if(m.type==='new_order'){if(!orders.find(o=>o.id===m.data.order.id)){orders.unshift(m.data.order);showToast('🆕 '+m.data.order.orderNumber);}render();}else if(m.type==='order_updated'){orders=orders.map(o=>o.id===m.data.order.id?m.data.order:o);render();}else if(m.type==='order_deleted'){orders=orders.filter(o=>o.id!==m.data.orderId);render();}else if(m.type==='stats_updated'){stats=m.data;render();}else if(m.type==='refresh'){location.reload();}};
  ws.onclose=()=>{connected=false;render();setTimeout(connectWS,3000);};
}

async function api(ep,method='GET',body=null){const opts={method,headers:{'Content-Type':'application/json'}};if(token)opts.headers.Authorization='Bearer '+token;if(body)opts.body=JSON.stringify(body);return(await fetch(API+ep,opts)).json();}
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

function showToast(m){const t=document.createElement('div');t.className='fixed top-4 left-1/2 -translate-x-1/2 bg-slate-700 text-white px-6 py-3 rounded-xl shadow-lg z-50';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);}
function closeModal(){document.getElementById('modal').innerHTML='';}
function setTab(t){currentTab=t;if(t==='couriers')loadCouriers();if(t==='users')loadUsers();render();}
function setFilter(f){filter=f;render();}
function fmt(n){return'₪'+(n||0).toLocaleString();}
function fmtDate(d){return d?new Date(d).toLocaleString('he-IL'):'-';}
function statusText(s){return{new:'חדש',published:'פורסם',taken:'נתפס',picked:'נאסף',delivered:'נמסר',cancelled:'בוטל'}[s]||s;}
function statusColor(s){const c={new:'slate',published:'amber',taken:'blue',picked:'purple',delivered:'emerald',cancelled:'red'}[s]||'slate';return 'bg-'+c+'-500/20 text-'+c+'-400 border-'+c+'-500/50';}

function render(){if(!token||!user)renderLogin();else renderDashboard();}

function renderLogin(){
  document.getElementById('app').innerHTML=\`<div class="min-h-screen flex items-center justify-center p-4"><div class="bg-slate-800/80 backdrop-blur rounded-2xl p-8 w-full max-w-md border border-slate-700"><div class="text-center mb-8"><div class="text-5xl mb-4">🚚</div><h1 class="text-2xl font-bold text-emerald-400">M.M.H Delivery</h1><p class="text-slate-400 mt-2">מערכת ניהול משלוחים</p></div><div id="loginError" class="hidden bg-red-500/20 border border-red-500 text-red-400 rounded-lg p-3 mb-4 text-center"></div><div class="space-y-4"><input type="text" id="username" placeholder="שם משתמש" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"><input type="password" id="password" placeholder="סיסמה" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none" onkeypress="if(event.key==='Enter')login()"><button onclick="login()" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-xl font-bold">התחבר</button></div></div></div>\`;
}

function renderDashboard(){
  const fo=orders.filter(o=>{if(filter==='active')return['new','published','taken','picked'].includes(o.status);if(filter==='delivered')return o.status==='delivered';if(filter==='cancelled')return o.status==='cancelled';return true;}).filter(o=>{if(!search)return true;const s=search.toLowerCase();return o.orderNumber?.toLowerCase().includes(s)||o.senderName?.toLowerCase().includes(s)||o.receiverName?.toLowerCase().includes(s)||o.pickupAddress?.toLowerCase().includes(s)||o.deliveryAddress?.toLowerCase().includes(s);});
  
  document.getElementById('app').innerHTML=\`
<header class="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
  <div class="max-w-7xl mx-auto px-4 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3"><div class="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center text-xl">🚚</div><div><h1 class="text-lg font-bold text-white">M.M.H Delivery</h1><p class="text-xs text-slate-500">v3.0</p></div></div>
      <div class="flex items-center gap-3"><div class="px-3 py-1 rounded-full text-sm \${connected?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}">\${connected?'🟢 מחובר':'🔴 מתחבר...'}</div><span class="text-sm text-slate-300">\${user.name}</span><button onclick="logout()" class="p-2 hover:bg-slate-700 rounded-lg text-slate-400">🚪</button></div>
    </div>
    <div class="flex gap-1 mt-3 overflow-x-auto pb-1">
      <button onclick="setTab('orders')" class="px-4 py-2 rounded-lg text-sm font-medium \${currentTab==='orders'?'bg-slate-700 text-white':'text-slate-400 hover:bg-slate-800'}">📦 הזמנות</button>
      <button onclick="setTab('couriers')" class="px-4 py-2 rounded-lg text-sm font-medium \${currentTab==='couriers'?'bg-slate-700 text-white':'text-slate-400 hover:bg-slate-800'}">🏍️ שליחים</button>
      <button onclick="setTab('stats')" class="px-4 py-2 rounded-lg text-sm font-medium \${currentTab==='stats'?'bg-slate-700 text-white':'text-slate-400 hover:bg-slate-800'}">📊 סטטיסטיקות</button>
      \${user.role==='admin'?'<button onclick="setTab(\\'users\\')" class="px-4 py-2 rounded-lg text-sm font-medium '+(currentTab==='users'?'bg-slate-700 text-white':'text-slate-400 hover:bg-slate-800')+'">👥 משתמשים</button>':''}
      \${user.role==='admin'?'<button onclick="setTab(\\'admin\\')" class="px-4 py-2 rounded-lg text-sm font-medium '+(currentTab==='admin'?'bg-red-700 text-white':'text-red-400 hover:bg-slate-800')+'">⚙️ כלים</button>':''}
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
  <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"><div class="text-2xl font-bold">\${stats.total||0}</div><div class="text-sm text-slate-400">סה״כ</div></div>
  <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"><div class="text-2xl font-bold text-amber-400">\${(parseInt(stats.new)||0)+(parseInt(stats.published)||0)}</div><div class="text-sm text-slate-400">ממתינים</div></div>
  <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"><div class="text-2xl font-bold text-purple-400">\${stats.active||0}</div><div class="text-sm text-slate-400">פעילים</div></div>
  <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"><div class="text-2xl font-bold text-emerald-400">\${stats.delivered||0}</div><div class="text-sm text-slate-400">נמסרו</div></div>
  <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"><div class="text-2xl font-bold text-emerald-400">\${fmt(stats.revenue)}</div><div class="text-sm text-slate-400">הכנסות</div></div>
</div>
<div class="flex flex-wrap items-center justify-between gap-3 mb-6">
  <div class="flex gap-2 overflow-x-auto">
    <button onclick="setFilter('all')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='all'?'bg-slate-700 text-white':'bg-slate-800/50 text-slate-400'}">הכל</button>
    <button onclick="setFilter('active')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='active'?'bg-slate-700 text-white':'bg-slate-800/50 text-slate-400'}">פעילים</button>
    <button onclick="setFilter('delivered')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='delivered'?'bg-slate-700 text-white':'bg-slate-800/50 text-slate-400'}">נמסרו</button>
    <button onclick="setFilter('cancelled')" class="px-3 py-1.5 rounded-lg text-sm \${filter==='cancelled'?'bg-slate-700 text-white':'bg-slate-800/50 text-slate-400'}">בוטלו</button>
  </div>
  <div class="flex gap-2">
    <input type="text" placeholder="🔍 חיפוש..." value="\${search}" onchange="search=this.value;render()" class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white w-40">
    <button onclick="showNewOrderModal()" class="bg-gradient-to-r from-emerald-500 to-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium">➕ הזמנה</button>
  </div>
</div>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  \${fo.map(o=>\`
    <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
      <div class="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <div class="flex items-center gap-2"><span class="font-bold font-mono">\${o.orderNumber}</span><span class="px-2 py-0.5 rounded-full text-xs border \${statusColor(o.status)}">\${statusText(o.status)}</span></div>
        <span class="text-xs text-slate-500">\${fmtDate(o.createdAt)}</span>
      </div>
      <div class="p-3 space-y-2 text-sm">
        <div class="flex gap-2"><span class="text-slate-500">👤</span><span>\${o.senderName} - \${o.senderPhone}</span></div>
        <div class="flex gap-2"><span class="text-slate-500">📍</span><span class="text-slate-300">\${o.pickupAddress}</span></div>
        <div class="flex gap-2"><span class="text-slate-500">🏠</span><span class="text-slate-300">\${o.deliveryAddress}</span></div>
        <div class="flex justify-between pt-2 border-t border-slate-700/50">
          <div><span class="text-slate-500">מחיר:</span> <span class="font-bold">\${fmt(o.price)}</span></div>
          <div><span class="text-slate-500">לשליח:</span> <span class="font-bold text-emerald-400">\${fmt(o.courierPayout)}</span></div>
        </div>
        \${o.courier?\`<div class="bg-slate-700/50 rounded-lg p-2 text-xs"><span class="text-slate-500">שליח:</span> \${o.courier.name} - \${o.courier.phone}</div>\`:''}
        \${o.status==='new'?\`<div class="flex gap-2 pt-2"><button onclick="publishOrder(\${o.id})" class="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-2 rounded-lg text-sm font-medium">📤 פרסם</button><button onclick="editOrder(\${o.id})" class="px-3 bg-blue-500/20 text-blue-400 rounded-lg">✏️</button><button onclick="cancelOrder(\${o.id})" class="px-3 bg-red-500/20 text-red-400 rounded-lg">✕</button></div>\`:''}
        \${o.status==='published'?\`<div class="flex gap-2 pt-2"><button onclick="editOrder(\${o.id})" class="flex-1 bg-blue-500/20 text-blue-400 py-2 rounded-lg text-sm">✏️ ערוך</button><button onclick="cancelOrder(\${o.id})" class="flex-1 bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">❌ בטל</button></div>\`:''}
        \${o.status==='taken'||o.status==='picked'?\`<button onclick="cancelOrder(\${o.id})" class="w-full bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">❌ בטל</button>\`:''}
        \${o.status==='cancelled'&&user.role==='admin'?\`<button onclick="deleteOrder(\${o.id})" class="w-full bg-red-500/20 text-red-400 py-2 rounded-lg text-sm">🗑️ מחק</button>\`:''}
      </div>
    </div>\`).join('')}
</div>
\${fo.length===0?'<div class="text-center py-12 text-slate-400">אין הזמנות להצגה</div>':''}\`;
}

function renderCouriers(){
  return \`
<div class="mb-6 flex justify-between items-center"><h2 class="text-xl font-bold">🏍️ שליחים (\${couriers.length})</h2></div>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
  \${couriers.map(c=>\`
    <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3"><div class="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">🏍️</div><div><div class="font-bold">\${c.first_name} \${c.last_name}</div><div class="text-sm text-slate-400">\${c.phone}</div></div></div>
        <span class="px-2 py-1 rounded text-xs \${c.status==='active'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}">\${c.status==='active'?'פעיל':'לא פעיל'}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center text-sm">
        <div class="bg-slate-700/50 rounded-lg p-2"><div class="font-bold">\${c.total_deliveries||0}</div><div class="text-xs text-slate-400">משלוחים</div></div>
        <div class="bg-slate-700/50 rounded-lg p-2"><div class="font-bold text-emerald-400">\${fmt(c.total_earned)}</div><div class="text-xs text-slate-400">סה״כ</div></div>
        <div class="bg-slate-700/50 rounded-lg p-2"><div class="font-bold text-amber-400">\${fmt(c.balance)}</div><div class="text-xs text-slate-400">יתרה</div></div>
      </div>
      \${parseFloat(c.balance)>0?\`<button onclick="showPaymentModal(\${c.id},'\${c.first_name} \${c.last_name}',\${c.balance})" class="w-full mt-3 bg-emerald-500/20 text-emerald-400 py-2 rounded-lg text-sm">💳 שלם</button>\`:''}
    </div>\`).join('')}
</div>\`;
}

function renderStats(){
  return \`
<h2 class="text-xl font-bold mb-6">📊 סטטיסטיקות (30 יום)</h2>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-4xl font-bold">\${stats.total||0}</div><div class="text-slate-400 mt-2">סה״כ הזמנות</div></div>
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-4xl font-bold text-emerald-400">\${stats.delivered||0}</div><div class="text-slate-400 mt-2">נמסרו</div></div>
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-4xl font-bold text-emerald-400">\${fmt(stats.revenue)}</div><div class="text-slate-400 mt-2">הכנסות ברוטו</div></div>
</div>
<h3 class="text-lg font-bold mb-4">💰 ניתוח רווחיות</h3>
<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-3xl font-bold text-amber-400">\${fmt(stats.total_payout)}</div><div class="text-slate-400 mt-2">לתשלום לשליחים</div></div>
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-3xl font-bold text-blue-400">\${fmt(stats.total_paid)}</div><div class="text-slate-400 mt-2">שולם לשליחים</div></div>
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 text-center"><div class="text-3xl font-bold text-purple-400">\${fmt(parseFloat(stats.total_payout||0)-parseFloat(stats.total_paid||0))}</div><div class="text-slate-400 mt-2">יתרה לתשלום</div></div>
  <div class="bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-xl border border-emerald-500/50 p-6 text-center"><div class="text-3xl font-bold text-emerald-400">\${fmt(stats.commission)}</div><div class="text-emerald-300 mt-2 font-medium">💎 רווח נקי (25%)</div></div>
</div>\`;
}

function renderUsers(){
  return \`
<div class="mb-6 flex justify-between items-center"><h2 class="text-xl font-bold">👥 משתמשים (\${users.length})</h2><button onclick="showNewUserModal()" class="bg-gradient-to-r from-emerald-500 to-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">➕ משתמש</button></div>
<div class="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
  <table class="w-full text-sm">
    <thead class="bg-slate-700/50"><tr><th class="text-right p-3">שם</th><th class="text-right p-3">משתמש</th><th class="text-right p-3">תפקיד</th><th class="text-right p-3">טלפון</th><th class="text-right p-3">סטטוס</th><th class="text-right p-3">פעולות</th></tr></thead>
    <tbody>\${users.map(u=>\`<tr class="border-t border-slate-700/50"><td class="p-3">\${u.name}</td><td class="p-3 text-slate-400">\${u.username}</td><td class="p-3"><span class="px-2 py-1 rounded text-xs \${u.role==='admin'?'bg-purple-500/20 text-purple-400':'bg-blue-500/20 text-blue-400'}">\${u.role==='admin'?'מנהל':u.role==='manager'?'מנהל משמרת':'נציג'}</span></td><td class="p-3 text-slate-400">\${u.phone||'-'}</td><td class="p-3"><span class="px-2 py-1 rounded text-xs \${u.active?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}">\${u.active?'פעיל':'לא פעיל'}</span></td><td class="p-3"><div class="flex gap-1"><button onclick="showEditUserModal(\${u.id})" class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">✏️</button><button onclick="showChangePasswordModal(\${u.id},'\${u.name}')" class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">🔑</button>\${u.id!==user.id?'<button onclick="deleteUser('+u.id+')" class="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">🗑️</button>':''}</div></td></tr>\`).join('')}</tbody>
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
  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6">
    <h3 class="font-bold text-lg mb-4">📦 ניהול הזמנות</h3>
    <div class="space-y-3">
      <button onclick="adminDeleteDelivered()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק הזמנות שנמסרו</button>
      <button onclick="adminDeleteCancelled()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק הזמנות מבוטלות</button>
      <button onclick="adminDeleteAllOrders()" class="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-3 rounded-lg text-sm hover:bg-red-500/30">💣 מחק את כל ההזמנות</button>
    </div>
  </div>

  <div class="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6">
    <h3 class="font-bold text-lg mb-4">🏍️ ניהול שליחים</h3>
    <div class="space-y-3">
      <button onclick="adminDeleteAllPayments()" class="w-full bg-amber-500/20 text-amber-400 border border-amber-500/50 py-3 rounded-lg text-sm hover:bg-amber-500/30">🗑️ מחק היסטוריית תשלומים</button>
      <button onclick="adminDeleteAllCouriers()" class="w-full bg-red-500/20 text-red-400 border border-red-500/50 py-3 rounded-lg text-sm hover:bg-red-500/30">💣 מחק את כל השליחים</button>
    </div>
  </div>

  <div class="bg-slate-800/60 rounded-xl border border-red-500/50 p-6 md:col-span-2">
    <h3 class="font-bold text-lg mb-4 text-red-400">🔴 איפוס מלא</h3>
    <p class="text-sm text-slate-400 mb-4">מוחק את כל ההזמנות, השליחים, התשלומים והלוגים. המשתמשים נשארים.</p>
    <button onclick="adminFullReset()" class="w-full bg-red-600 text-white py-3 rounded-lg text-sm font-bold hover:bg-red-700">⚠️ אפס את כל המערכת</button>
  </div>
</div>\`;
}

async function adminDeleteDelivered(){if(!confirm('למחוק את כל ההזמנות שנמסרו?'))return;const r=await api('/api/admin/orders/delivered','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteCancelled(){if(!confirm('למחוק את כל ההזמנות המבוטלות?'))return;const r=await api('/api/admin/orders/cancelled','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteAllOrders(){if(!confirm('למחוק את כל ההזמנות? פעולה זו בלתי הפיכה!'))return;if(!confirm('אתה בטוח? זה ימחק הכל!'))return;const r=await api('/api/admin/orders/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' הזמנות');location.reload();}else alert(r.error);}
async function adminDeleteAllCouriers(){if(!confirm('למחוק את כל השליחים?'))return;const r=await api('/api/admin/couriers/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' שליחים');loadCouriers();}else alert(r.error);}
async function adminDeleteAllPayments(){if(!confirm('למחוק את כל היסטוריית התשלומים?'))return;const r=await api('/api/admin/payments/all','DELETE');if(r.success){showToast('נמחקו '+r.deleted+' תשלומים');}else alert(r.error);}
async function adminFullReset(){if(!confirm('לאפס את כל המערכת? פעולה זו בלתי הפיכה!'))return;if(!confirm('אתה בטוח לחלוטין?'))return;if(prompt('הקלד "אפס" לאישור')!=='אפס')return;const r=await api('/api/admin/reset','DELETE');if(r.success){showToast('המערכת אופסה');location.reload();}else alert(r.error);}

function showNewOrderModal(){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">הזמנה חדשה</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><div class="grid grid-cols-2 gap-3"><input type="text" id="senderName" placeholder="שם שולח" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="senderPhone" placeholder="טלפון שולח" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"></div><input type="text" id="pickupAddress" placeholder="כתובת איסוף" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><div class="grid grid-cols-2 gap-3"><input type="text" id="receiverName" placeholder="שם מקבל" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="receiverPhone" placeholder="טלפון מקבל" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"></div><input type="text" id="deliveryAddress" placeholder="כתובת מסירה" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><textarea id="details" placeholder="פרטים נוספים" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm h-16 resize-none"></textarea><div class="grid grid-cols-2 gap-3"><input type="number" id="price" placeholder="מחיר ₪" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><select id="priority" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="normal">רגיל</option><option value="express">אקספרס</option><option value="urgent">דחוף</option></select></div><button onclick="submitOrder()" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-lg font-bold">צור הזמנה</button></div></div></div>\`;
}

function submitOrder(){createOrder({senderName:document.getElementById('senderName').value,senderPhone:document.getElementById('senderPhone').value,pickupAddress:document.getElementById('pickupAddress').value,receiverName:document.getElementById('receiverName').value,receiverPhone:document.getElementById('receiverPhone').value,deliveryAddress:document.getElementById('deliveryAddress').value,details:document.getElementById('details').value,price:parseInt(document.getElementById('price').value)||0,priority:document.getElementById('priority').value});}

function showNewUserModal(){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">משתמש חדש</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><input type="text" id="newUserName" placeholder="שם מלא" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="text" id="newUsername" placeholder="שם משתמש" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="password" id="newPassword" placeholder="סיסמה" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="newUserPhone" placeholder="טלפון" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><select id="newUserRole" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="agent">נציג</option><option value="manager">מנהל משמרת</option><option value="admin">מנהל</option></select><button onclick="submitUser()" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-lg font-bold">צור משתמש</button></div></div></div>\`;
}

function submitUser(){createUser({name:document.getElementById('newUserName').value,username:document.getElementById('newUsername').value,password:document.getElementById('newPassword').value,phone:document.getElementById('newUserPhone').value,role:document.getElementById('newUserRole').value});}

function showPaymentModal(id,name,balance){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">💳 תשלום</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-4"><div class="text-center"><div class="text-lg">\${name}</div><div class="text-2xl font-bold text-amber-400 mt-2">יתרה: \${fmt(balance)}</div></div><input type="number" id="paymentAmount" placeholder="סכום" value="\${balance}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><select id="paymentMethod" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="cash">מזומן</option><option value="transfer">העברה</option><option value="bit">ביט</option></select><input type="text" id="paymentNotes" placeholder="הערות" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><button onclick="submitPayment(\${id})" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-lg font-bold">אשר תשלום</button></div></div></div>\`;
}

function submitPayment(id){createPayment({courier_id:id,amount:parseFloat(document.getElementById('paymentAmount').value)||0,method:document.getElementById('paymentMethod').value,notes:document.getElementById('paymentNotes').value});}

function showEditOrderModal(o){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">✏️ עריכת הזמנה \${o.orderNumber}</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><div class="grid grid-cols-2 gap-3"><input type="text" id="editSenderName" placeholder="שם שולח" value="\${o.senderName||''}" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="editSenderPhone" placeholder="טלפון שולח" value="\${o.senderPhone||''}" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"></div><input type="text" id="editPickupAddress" placeholder="כתובת איסוף" value="\${o.pickupAddress||''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><div class="grid grid-cols-2 gap-3"><input type="text" id="editReceiverName" placeholder="שם מקבל" value="\${o.receiverName||''}" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="editReceiverPhone" placeholder="טלפון מקבל" value="\${o.receiverPhone||''}" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"></div><input type="text" id="editDeliveryAddress" placeholder="כתובת מסירה" value="\${o.deliveryAddress||''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><textarea id="editDetails" placeholder="פרטים נוספים" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm h-16 resize-none">\${o.details||''}</textarea><div class="grid grid-cols-2 gap-3"><input type="number" id="editPrice" placeholder="מחיר ₪" value="\${o.price||0}" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><select id="editPriority" class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="normal" \${o.priority==='normal'?'selected':''}>רגיל</option><option value="express" \${o.priority==='express'?'selected':''}>אקספרס</option><option value="urgent" \${o.priority==='urgent'?'selected':''}>דחוף</option></select></div><button onclick="submitEditOrder(\${o.id})" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-lg font-bold">💾 שמור שינויים</button></div></div></div>\`;
}

function submitEditOrder(id){updateOrder(id,{senderName:document.getElementById('editSenderName').value,senderPhone:document.getElementById('editSenderPhone').value,pickupAddress:document.getElementById('editPickupAddress').value,receiverName:document.getElementById('editReceiverName').value,receiverPhone:document.getElementById('editReceiverPhone').value,deliveryAddress:document.getElementById('editDeliveryAddress').value,details:document.getElementById('editDetails').value,price:parseInt(document.getElementById('editPrice').value)||0,priority:document.getElementById('editPriority').value});}

function showEditUserModal(id){
  const u=users.find(x=>x.id===id);if(!u)return;
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">✏️ עריכת משתמש</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><input type="text" id="editUserName" placeholder="שם מלא" value="\${u.name}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="tel" id="editUserPhone" placeholder="טלפון" value="\${u.phone||''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="email" id="editUserEmail" placeholder="אימייל" value="\${u.email||''}" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><select id="editUserRole" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="agent" \${u.role==='agent'?'selected':''}>נציג</option><option value="manager" \${u.role==='manager'?'selected':''}>מנהל משמרת</option><option value="admin" \${u.role==='admin'?'selected':''}>מנהל</option></select><select id="editUserActive" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><option value="true" \${u.active?'selected':''}>פעיל</option><option value="false" \${!u.active?'selected':''}>לא פעיל</option></select><button onclick="submitEditUser(\${u.id})" class="w-full bg-gradient-to-r from-emerald-500 to-blue-500 text-white py-3 rounded-lg font-bold">💾 שמור</button></div></div></div>\`;
}

function submitEditUser(id){updateUser(id,{name:document.getElementById('editUserName').value,phone:document.getElementById('editUserPhone').value,email:document.getElementById('editUserEmail').value,role:document.getElementById('editUserRole').value,active:document.getElementById('editUserActive').value==='true'});}

function showChangePasswordModal(id,name){
  document.getElementById('modal').innerHTML=\`<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick="if(event.target===this)closeModal()"><div class="bg-slate-800 rounded-2xl w-full max-w-md"><div class="p-4 border-b border-slate-700 flex justify-between items-center"><h2 class="text-lg font-bold">🔑 שינוי סיסמה</h2><button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button></div><div class="p-4 space-y-3"><div class="text-center mb-4"><div class="text-slate-400">עבור: <span class="text-white">\${name}</span></div></div><input type="password" id="newUserPassword" placeholder="סיסמה חדשה" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><input type="password" id="confirmUserPassword" placeholder="אישור סיסמה" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"><button onclick="submitChangePassword(\${id})" class="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 rounded-lg font-bold">🔑 שנה סיסמה</button></div></div></div>\`;
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
  console.log('║     🚚  M.M.H Delivery System Pro v3.0  🚚                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Server: http://localhost:' + CONFIG.PORT + '                             ║');
  console.log('║  Public: ' + CONFIG.PUBLIC_URL.padEnd(43) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});
