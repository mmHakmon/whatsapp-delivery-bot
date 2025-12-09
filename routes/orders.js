/**
 * M.M.H Delivery System Pro v4.0
 * Orders Routes
 */

const express = require('express');
const router = express.Router();

const { query, transaction } = require('../config/database');
const { CONFIG } = require('../config');
const { calculateDeliveryPrice } = require('../utils/maps');
const { 
  publishOrder: waPublishOrder,
  notifyOrderTaken,
  notifyGroupOrderTaken,
  notifyOrderPicked,
  notifyOrderDelivered,
  notifyOrderCancelled,
} = require('../utils/whatsapp');
const { requireAuth, requireRole, sanitizeString } = require('../middleware/security');

// WebSocket broadcast function (injected from main server)
let broadcast = () => {};
const setBroadcast = (fn) => { broadcast = fn; };

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Format order from database to API response
 */
const formatOrder = (o) => ({
  id: o.id,
  orderNumber: o.order_number,
  senderName: o.sender_name,
  senderPhone: o.sender_phone,
  pickupAddress: o.pickup_address,
  receiverName: o.receiver_name,
  receiverPhone: o.receiver_phone,
  deliveryAddress: o.delivery_address,
  details: o.details,
  priority: o.priority,
  price: parseFloat(o.price),
  commission: parseFloat(o.commission || 0),
  courierPayout: parseFloat(o.courier_payout || 0),
  status: o.status,
  createdAt: o.created_at,
  courier: o.courier_id ? {
    id: o.courier_id,
    name: `${o.cfn || ''} ${o.cln || ''}`.trim(),
    phone: o.cph
  } : null
});

/**
 * Log order activity
 */
const logOrderActivity = async (userId, action, description, details = {}) => {
  try {
    await query(
      "INSERT INTO activity_log (user_id, action, description, details) VALUES ($1, $2, $3, $4)",
      [userId, action, description, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('Activity log error:', e);
  }
};

// ══════════════════════════════════════════════════════════════
// GET ORDERS
// ══════════════════════════════════════════════════════════════

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    
    let sql = `
      SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
      FROM orders o
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      sql += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (search) {
      sql += ` AND (o.order_number ILIKE $${paramIndex} OR o.sender_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    sql += ' ORDER BY o.created_at DESC LIMIT 200';
    
    const result = await query(sql, params);
    res.json(result.rows.map(formatOrder));
    
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET STATS
// ══════════════════════════════════════════════════════════════

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const ordersStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='new' THEN 1 END) as new,
        COUNT(CASE WHEN status='published' THEN 1 END) as published,
        COUNT(CASE WHEN status IN ('taken','picked') THEN 1 END) as active,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as commission,
        COALESCE(SUM(CASE WHEN status='delivered' THEN courier_payout END), 0) as total_payout
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    const paymentsStats = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_paid
      FROM payments 
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    res.json({
      ...ordersStats.rows[0],
      total_paid: paymentsStats.rows[0].total_paid,
      net_profit: parseFloat(ordersStats.rows[0].commission)
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CREATE ORDER
// ══════════════════════════════════════════════════════════════

router.post('/', requireAuth, async (req, res) => {
  try {
    const { 
      senderName, senderPhone, pickupAddress,
      receiverName, receiverPhone, deliveryAddress,
      details, priority, price 
    } = req.body;
    
    // Validate required fields
    if (!senderName || !pickupAddress || !receiverName || !deliveryAddress || !price) {
      return res.json({ success: false, error: 'נא למלא את כל השדות הנדרשים' });
    }
    
    // Generate order number
    const countResult = await query(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 100) + 1 as n FROM orders"
    );
    const orderNum = 'MMH-' + countResult.rows[0].n;
    
    // Calculate commission
    const commission = Math.round(price * CONFIG.COMMISSION);
    const payout = price - commission;
    
    // Insert order
    const result = await query(`
      INSERT INTO orders (
        order_number, sender_name, sender_phone, pickup_address,
        receiver_name, receiver_phone, delivery_address,
        details, priority, price, commission_rate, commission, courier_payout, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      orderNum,
      sanitizeString(senderName, 100),
      sanitizeString(senderPhone, 20),
      sanitizeString(pickupAddress, 255),
      sanitizeString(receiverName, 100),
      sanitizeString(receiverPhone, 20),
      sanitizeString(deliveryAddress, 255),
      sanitizeString(details, 500) || '',
      priority || 'normal',
      price,
      CONFIG.COMMISSION * 100,
      commission,
      payout,
      req.user.id
    ]);
    
    const order = formatOrder(result.rows[0]);
    
    // Log activity
    await logOrderActivity(req.user.id, 'ORDER_CREATED', `הזמנה ${orderNum} נוצרה`, { orderNum, price });
    
    // Broadcast to all connected clients
    broadcast({ type: 'new_order', data: { order } });
    
    console.log('📦 Created:', orderNum);
    res.json({ success: true, order });
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUBLISH ORDER
// ══════════════════════════════════════════════════════════════

router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const result = await query(
      "UPDATE orders SET status='published', published_at=NOW() WHERE id=$1 AND status='new' RETURNING *",
      [req.params.id]
    );
    
    const order = result.rows[0];
    if (!order) {
      return res.json({ success: false, error: 'הזמנה לא נמצאה או כבר פורסמה' });
    }
    
    // Send to WhatsApp group
    await waPublishOrder(order);
    
    // Broadcast update
    const fullOrder = await query(`
      SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
      FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE o.id = $1
    `, [order.id]);
    
    broadcast({ type: 'order_updated', data: { order: formatOrder(fullOrder.rows[0]) } });
    
    // Log activity
    await logOrderActivity(req.user.id, 'ORDER_PUBLISHED', `הזמנה ${order.order_number} פורסמה`);
    
    console.log('📤 Published:', order.order_number);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Publish order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// UPDATE ORDER
// ══════════════════════════════════════════════════════════════

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { 
      senderName, senderPhone, pickupAddress,
      receiverName, receiverPhone, deliveryAddress,
      details, price, priority 
    } = req.body;
    
    // Check if order can be edited
    const check = await query("SELECT status FROM orders WHERE id=$1", [req.params.id]);
    if (!check.rows[0]) {
      return res.json({ success: false, error: 'הזמנה לא נמצאה' });
    }
    if (!['new', 'published'].includes(check.rows[0].status)) {
      return res.json({ success: false, error: 'לא ניתן לערוך הזמנה שכבר נתפסה' });
    }
    
    // Recalculate commission
    const commission = Math.round(price * CONFIG.COMMISSION);
    const payout = price - commission;
    
    // Update order
    await query(`
      UPDATE orders SET 
        sender_name=$1, sender_phone=$2, pickup_address=$3,
        receiver_name=$4, receiver_phone=$5, delivery_address=$6,
        details=$7, price=$8, priority=$9, commission=$10, courier_payout=$11
      WHERE id=$12
    `, [
      sanitizeString(senderName, 100),
      sanitizeString(senderPhone, 20),
      sanitizeString(pickupAddress, 255),
      sanitizeString(receiverName, 100),
      sanitizeString(receiverPhone, 20),
      sanitizeString(deliveryAddress, 255),
      sanitizeString(details, 500),
      price,
      priority,
      commission,
      payout,
      req.params.id
    ]);
    
    // Get updated order
    const result = await query(`
      SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
      FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE o.id = $1
    `, [req.params.id]);
    
    broadcast({ type: 'order_updated', data: { order: formatOrder(result.rows[0]) } });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CANCEL ORDER
// ══════════════════════════════════════════════════════════════

router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Get current order state
    const check = await query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
    const oldOrder = check.rows[0];
    
    if (!oldOrder) {
      return res.json({ success: false, error: 'הזמנה לא נמצאה' });
    }
    
    // Update order status
    const result = await query(
      "UPDATE orders SET status='cancelled', cancelled_at=NOW(), cancel_reason=$1 WHERE id=$2 RETURNING *",
      [reason, req.params.id]
    );
    const order = result.rows[0];
    
    // Get courier phone if assigned
    let courierPhone = null;
    if (order.courier_id) {
      const courier = await query("SELECT phone FROM couriers WHERE id=$1", [order.courier_id]);
      courierPhone = courier.rows[0]?.phone;
    }
    
    // Send WhatsApp notifications
    await notifyOrderCancelled(
      { ...order, status: oldOrder.status },
      reason,
      courierPhone
    );
    
    // Broadcast update
    broadcast({ type: 'order_updated', data: { order: formatOrder(order) } });
    
    // Log activity
    await logOrderActivity(req.user.id, 'ORDER_CANCELLED', `הזמנה ${order.order_number} בוטלה`, { reason });
    
    console.log('❌ Cancelled:', order.order_number);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE ORDER (Admin only)
// ══════════════════════════════════════════════════════════════

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const check = await query("SELECT status, order_number FROM orders WHERE id=$1", [req.params.id]);
    if (!check.rows[0]) {
      return res.json({ success: false, error: 'הזמנה לא נמצאה' });
    }
    if (!['new', 'cancelled'].includes(check.rows[0].status)) {
      return res.json({ success: false, error: 'ניתן למחוק רק הזמנות חדשות או מבוטלות' });
    }
    
    await query("DELETE FROM orders WHERE id=$1", [req.params.id]);
    
    broadcast({ type: 'order_deleted', data: { orderId: parseInt(req.params.id) } });
    
    // Log activity
    await logOrderActivity(req.user.id, 'ORDER_DELETED', `הזמנה ${check.rows[0].order_number} נמחקה`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CALCULATE PRICE
// ══════════════════════════════════════════════════════════════

router.post('/calculate-price', requireAuth, async (req, res) => {
  try {
    const { pickupAddress, deliveryAddress } = req.body;
    const result = await calculateDeliveryPrice(pickupAddress, deliveryAddress);
    res.json(result);
  } catch (error) {
    console.error('Calculate price error:', error);
    res.status(500).json({ success: false, error: 'שגיאה בחישוב' });
  }
});

// ══════════════════════════════════════════════════════════════
// ADVANCED SEARCH
// ══════════════════════════════════════════════════════════════

router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q, status, courier, from, to, minPrice, maxPrice, area } = req.query;
    
    let sql = `
      SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
      FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    
    if (q) {
      sql += ` AND (o.order_number ILIKE $${i} OR o.sender_name ILIKE $${i} OR o.receiver_name ILIKE $${i} OR o.pickup_address ILIKE $${i} OR o.delivery_address ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }
    if (status && status !== 'all') {
      sql += ` AND o.status = $${i++}`;
      params.push(status);
    }
    if (courier) {
      sql += ` AND o.courier_id = $${i++}`;
      params.push(courier);
    }
    if (from) {
      sql += ` AND o.created_at >= $${i++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND o.created_at <= $${i++}`;
      params.push(to + ' 23:59:59');
    }
    if (minPrice) {
      sql += ` AND o.price >= $${i++}`;
      params.push(minPrice);
    }
    if (maxPrice) {
      sql += ` AND o.price <= $${i++}`;
      params.push(maxPrice);
    }
    if (area) {
      sql += ` AND (o.pickup_address ILIKE $${i} OR o.delivery_address ILIKE $${i})`;
      params.push(`%${area}%`);
      i++;
    }
    
    sql += ' ORDER BY o.created_at DESC LIMIT 500';
    
    const result = await query(sql, params);
    res.json(result.rows.map(formatOrder));
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUBLIC TAKE ORDER (No auth required)
// ══════════════════════════════════════════════════════════════

const takeOrder = async (orderNumber, courierData) => {
  // Get order
  const orderResult = await query(
    "SELECT * FROM orders WHERE order_number=$1 AND status='published'",
    [orderNumber]
  );
  const order = orderResult.rows[0];
  
  if (!order) {
    return { success: false, error: 'המשלוח כבר נתפס!' };
  }
  
  // Find or create courier
  let courierResult = await query(
    "SELECT * FROM couriers WHERE id_number=$1",
    [courierData.idNumber]
  );
  
  if (!courierResult.rows[0]) {
    const waId = courierData.phone.replace(/^0/, '972').replace(/-/g, '') + '@s.whatsapp.net';
    courierResult = await query(
      "INSERT INTO couriers (first_name, last_name, id_number, phone, whatsapp_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [courierData.firstName, courierData.lastName, courierData.idNumber, courierData.phone, waId]
    );
  }
  
  const courier = courierResult.rows[0];
  
  // Update order
  await query(
    "UPDATE orders SET status='taken', taken_at=NOW(), courier_id=$1 WHERE id=$2",
    [courier.id, order.id]
  );
  
  // Send WhatsApp messages
  await notifyOrderTaken(order, courier.phone);
  await notifyGroupOrderTaken(order, `${courier.first_name} ${courier.last_name}`);
  
  // Broadcast update
  const updatedOrder = await query(`
    SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
    FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
    WHERE o.id = $1
  `, [order.id]);
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(updatedOrder.rows[0]) } });
  
  console.log('🏍️ Taken:', order.order_number);
  return { success: true };
};

// Public endpoint
router.post('/take/:orderNumber', async (req, res) => {
  try {
    const result = await takeOrder(req.params.orderNumber, req.body);
    res.json(result);
  } catch (error) {
    console.error('Take order error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUBLIC STATUS UPDATES
// ══════════════════════════════════════════════════════════════

const pickupOrder = async (orderNumber) => {
  const result = await query(
    "UPDATE orders SET status='picked', picked_at=NOW() WHERE order_number=$1 AND status='taken' RETURNING *",
    [orderNumber]
  );
  const order = result.rows[0];
  
  if (!order) {
    return { success: false, error: 'לא ניתן לעדכן' };
  }
  
  // Get courier and send notification
  const courier = await query("SELECT * FROM couriers WHERE id=$1", [order.courier_id]);
  if (courier.rows[0]?.phone) {
    await notifyOrderPicked(order, courier.rows[0].phone);
  }
  
  // Broadcast update
  const updatedOrder = await query(`
    SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
    FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
    WHERE o.id = $1
  `, [order.id]);
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(updatedOrder.rows[0]) } });
  
  return { success: true };
};

const deliverOrder = async (orderNumber) => {
  const result = await query(
    "UPDATE orders SET status='delivered', delivered_at=NOW() WHERE order_number=$1 AND status='picked' RETURNING *",
    [orderNumber]
  );
  const order = result.rows[0];
  
  if (!order) {
    return { success: false, error: 'לא ניתן לעדכן' };
  }
  
  // Update courier stats
  await query(
    "UPDATE couriers SET total_deliveries=total_deliveries+1, total_earned=total_earned+$1, balance=balance+$1 WHERE id=$2",
    [order.courier_payout, order.courier_id]
  );
  
  // Get courier and send notification
  const courier = await query("SELECT * FROM couriers WHERE id=$1", [order.courier_id]);
  if (courier.rows[0]?.phone) {
    await notifyOrderDelivered(order, courier.rows[0].phone);
  }
  
  // Broadcast updates
  const updatedOrder = await query(`
    SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
    FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
    WHERE o.id = $1
  `, [order.id]);
  
  broadcast({ type: 'order_updated', data: { order: formatOrder(updatedOrder.rows[0]) } });
  
  // Update stats
  const stats = await query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
      COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
      COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as commission
    FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  `);
  broadcast({ type: 'stats_updated', data: stats.rows[0] });
  
  console.log('✅ Delivered:', order.order_number);
  return { success: true };
};

router.post('/pickup/:orderNumber', async (req, res) => {
  try {
    res.json(await pickupOrder(req.params.orderNumber));
  } catch (error) {
    console.error('Pickup error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

router.post('/deliver/:orderNumber', async (req, res) => {
  try {
    res.json(await deliverOrder(req.params.orderNumber));
  } catch (error) {
    console.error('Deliver error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// Export router and functions
module.exports = router;
module.exports.setBroadcast = setBroadcast;
module.exports.formatOrder = formatOrder;
module.exports.takeOrder = takeOrder;
module.exports.pickupOrder = pickupOrder;
module.exports.deliverOrder = deliverOrder;
