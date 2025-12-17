/**
 * M.M.H Delivery System - Phase 1 & 2 Routes
 * הוסף את הקוד הזה ל-server.js שלך
 * 
 * הוסף בסוף הקובץ, לפני app.listen()
 */

// ==================== IMPORTS (הוסף בראש הקובץ) ====================
const PushNotificationService = require('./push-notification-service');

// ==================== INITIALIZE SERVICES (הוסף אחרי הגדרת pool) ====================
const pushService = new PushNotificationService(pool, CONFIG.WHAPI);

// ==================== COURIER DASHBOARD ROUTES ====================

/**
 * Courier Authentication
 * POST /api/courier/auth
 */
app.post('/api/courier/auth', rateLimit(20), async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'נדרש מספר טלפון' });
    }
    
    const result = await pool.query(
      'SELECT * FROM couriers WHERE phone = $1',
      [phone]
    );
    
    if (result.rows.length > 0) {
      res.json({ success: true, courier: result.rows[0] });
    } else {
      res.json({ success: false, message: 'שליח לא נמצא במערכת' });
    }
  } catch (error) {
    console.error('Courier auth error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Courier Profile with Stats
 * GET /api/courier/profile?phone=0501234567
 */
app.get('/api/courier/profile', async (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'נדרש מספר טלפון' });
    }
    
    const courier = await pool.query(
      `SELECT c.*, 
              COUNT(CASE WHEN o.status = 'delivered' AND DATE(o.delivered_at) = CURRENT_DATE THEN 1 END) as today_deliveries,
              COALESCE(SUM(CASE WHEN o.status = 'delivered' AND DATE(o.delivered_at) = CURRENT_DATE THEN o.courier_payout END), 0) as today_earnings
       FROM couriers c
       LEFT JOIN orders o ON o.courier_id = c.id
       WHERE c.phone = $1
       GROUP BY c.id`,
      [phone]
    );
    
    if (courier.rows.length > 0) {
      res.json({ success: true, courier: courier.rows[0] });
    } else {
      res.json({ success: false, message: 'שליח לא נמצא' });
    }
  } catch (error) {
    console.error('Get courier profile error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Available Orders (Published, No Courier)
 * GET /api/orders/available
 */
app.get('/api/orders/available', async (req, res) => {
  try {
    const orders = await pool.query(
      `SELECT o.*, 
              u.name as created_by_name,
              CASE 
                WHEN o.pickup_lat IS NOT NULL AND o.pickup_lng IS NOT NULL 
                THEN CONCAT(ROUND(CAST(o.pickup_lat AS numeric), 6), ',', ROUND(CAST(o.pickup_lng AS numeric), 6))
              END as pickup_coords
       FROM orders o
       LEFT JOIN users u ON o.created_by = u.id
       WHERE o.status = 'published' AND o.courier_id IS NULL
       ORDER BY 
         CASE o.priority 
           WHEN 'urgent' THEN 1
           WHEN 'express' THEN 2
           ELSE 3
         END,
         o.created_at ASC
       LIMIT 50`
    );
    
    res.json({ success: true, orders: orders.rows });
  } catch (error) {
    console.error('Get available orders error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Courier's Active Orders
 * GET /api/courier/orders/active?courierId=123
 */
app.get('/api/courier/orders/active', async (req, res) => {
  try {
    const { courierId } = req.query;
    
    if (!courierId) {
      return res.status(400).json({ success: false, message: 'נדרש ID שליח' });
    }
    
    const orders = await pool.query(
      `SELECT * FROM orders 
       WHERE courier_id = $1 AND status IN ('taken', 'picked')
       ORDER BY 
         CASE 
           WHEN status = 'picked' THEN 1
           WHEN status = 'taken' THEN 2
         END,
         created_at DESC`,
      [courierId]
    );
    
    res.json({ success: true, orders: orders.rows });
  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Courier's Order History
 * GET /api/courier/orders/history?courierId=123&limit=20
 */
app.get('/api/courier/orders/history', async (req, res) => {
  try {
    const { courierId, limit = 20 } = req.query;
    
    if (!courierId) {
      return res.status(400).json({ success: false, message: 'נדרש ID שליח' });
    }
    
    const orders = await pool.query(
      `SELECT * FROM orders 
       WHERE courier_id = $1 AND status IN ('delivered', 'cancelled')
       ORDER BY delivered_at DESC, cancelled_at DESC
       LIMIT $2`,
      [courierId, limit]
    );
    
    res.json({ success: true, orders: orders.rows });
  } catch (error) {
    console.error('Get order history error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Courier Takes Order
 * POST /api/orders/:id/take
 * Body: { courierId: 123 }
 */
app.post('/api/orders/:id/take', rateLimit(20), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { courierId } = req.body;
    
    if (!courierId) {
      return res.status(400).json({ success: false, message: 'נדרש ID שליח' });
    }
    
    await client.query('BEGIN');
    
    // Check if order is available
    const order = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND status = $2 AND courier_id IS NULL FOR UPDATE',
      [id, 'published']
    );
    
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: false, message: 'המשלוח כבר נתפס או לא זמין' });
    }
    
    // Update order
    await client.query(
      `UPDATE orders SET 
        courier_id = $1, 
        status = 'taken',
        taken_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [courierId, id]
    );
    
    // Log activity
    await client.query(
      `INSERT INTO activity_log (action, details) 
       VALUES ('COURIER_TOOK_ORDER', $1)`,
      [JSON.stringify({ orderId: id, courierId })]
    );
    
    await client.query('COMMIT');
    
    // Send notification to customer (async, don't wait)
    pushService.notifyCustomer(id, 'courier_assigned').catch(err => 
      console.error('Push notification error:', err)
    );
    
    // Broadcast to WebSocket clients
    broadcastToClients({ type: 'order_update', orderId: id, status: 'taken' });
    
    res.json({ success: true, message: 'המשלוח נתפס בהצלחה' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Take order error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  } finally {
    client.release();
  }
});

/**
 * Update Order Status (Courier)
 * POST /api/orders/:id/status
 * Body: { status: 'picked', courierId: 123 }
 */
app.post('/api/orders/:id/status', rateLimit(20), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, courierId } = req.body;
    
    if (!status || !courierId) {
      return res.status(400).json({ success: false, message: 'נדרשים סטטוס ו-ID שליח' });
    }
    
    // Validate courier owns this order
    const order = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND courier_id = $2',
      [id, courierId]
    );
    
    if (order.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'אין הרשאה לעדכן משלוח זה' });
    }
    
    // Update status with timestamp
    const statusField = status === 'picked' ? 'picked_at' : 
                        status === 'delivered' ? 'delivered_at' : null;
    
    let query;
    if (statusField) {
      query = `UPDATE orders SET status = $1, ${statusField} = CURRENT_TIMESTAMP WHERE id = $2`;
    } else {
      query = 'UPDATE orders SET status = $1 WHERE id = $2';
    }
    
    await pool.query(query, [status, id]);
    
    // Send customer notifications based on status
    const notificationTypes = {
      'picked': 'package_picked',
      'arrived_delivery': 'courier_arrived_delivery',
      'delivered': 'package_delivered'
    };
    
    if (notificationTypes[status]) {
      pushService.notifyCustomer(id, notificationTypes[status]).catch(err =>
        console.error('Push notification error:', err)
      );
    }
    
    // Broadcast update
    broadcastToClients({ type: 'order_update', orderId: id, status });
    
    res.json({ success: true, message: 'הסטטוס עודכן בהצלחה' });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Update Courier Online Status
 * POST /api/courier/online
 * Body: { courierId: 123, online: true }
 */
app.post('/api/courier/online', rateLimit(20), async (req, res) => {
  try {
    const { courierId, online } = req.body;
    
    if (!courierId || online === undefined) {
      return res.status(400).json({ success: false, message: 'נדרשים ID ו-online status' });
    }
    
    await pool.query(
      'UPDATE couriers SET is_online = $1 WHERE id = $2',
      [online, courierId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update online status error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Update Courier Location (Real-time tracking)
 * POST /api/courier/location
 * Body: { courierId: 123, latitude: 32.0853, longitude: 34.7818 }
 */
app.post('/api/courier/location', rateLimit(100), async (req, res) => {
  try {
    const { courierId, latitude, longitude, accuracy, heading, speed } = req.body;
    
    if (!courierId || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'נדרשים ID ומיקום' });
    }
    
    // Upsert location
    await pool.query(
      `INSERT INTO courier_locations 
       (courier_id, latitude, longitude, accuracy, heading, speed, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (courier_id) 
       DO UPDATE SET 
         latitude = $2, 
         longitude = $3, 
         accuracy = $4,
         heading = $5,
         speed = $6,
         timestamp = CURRENT_TIMESTAMP`,
      [courierId, latitude, longitude, accuracy, heading, speed]
    );
    
    // Update courier table
    await pool.query(
      `UPDATE couriers SET 
        current_lat = $1, 
        current_lng = $2, 
        last_location_update = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [latitude, longitude, courierId]
    );
    
    // Broadcast to tracking customers
    broadcastToClients({
      type: 'courier_location',
      courierId,
      location: { latitude, longitude, heading, speed }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Courier Location
 * GET /api/courier/location/:id
 */
app.get('/api/courier/location/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM courier_locations WHERE courier_id = $1',
      [id]
    );
    
    if (result.rows.length > 0) {
      res.json({ success: true, location: result.rows[0] });
    } else {
      res.json({ success: false, message: 'מיקום לא זמין' });
    }
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

// ==================== CUSTOMER DASHBOARD ROUTES ====================

/**
 * Get Customer Orders
 * GET /api/customer/orders?phone=0501234567
 */
app.get('/api/customer/orders', async (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ success: false, message: 'נדרש מספר טלפון' });
    }
    
    const orders = await pool.query(
      `SELECT o.*,
              c.first_name || ' ' || c.last_name as courier_name,
              c.phone as courier_phone,
              c.vehicle_type,
              c.rating as courier_rating,
              c.profile_photo_url
       FROM orders o
       LEFT JOIN couriers c ON o.courier_id = c.id
       WHERE o.sender_phone = $1
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [phone]
    );
    
    res.json({ success: true, orders: orders.rows });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Get Specific Order Details
 * GET /api/orders/:id
 */
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await pool.query(
      `SELECT o.*,
              c.first_name || ' ' || c.last_name as courier_name,
              c.phone as courier_phone,
              c.vehicle_type,
              c.rating as courier_rating,
              c.profile_photo_url,
              c.current_lat,
              c.current_lng
       FROM orders o
       LEFT JOIN couriers c ON o.courier_id = c.id
       WHERE o.id = $1`,
      [id]
    );
    
    if (order.rows.length > 0) {
      res.json({ success: true, order: order.rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'הזמנה לא נמצאה' });
    }
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

/**
 * Submit Order Rating
 * POST /api/orders/:id/rate
 * Body: { rating: 5, comment: 'שירות מעולה', speed_rating: 5, courtesy_rating: 5 }
 */
app.post('/api/orders/:id/rate', rateLimit(10), async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, speed_rating, courtesy_rating, professionalism_rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'דירוג לא תקין' });
    }
    
    // Get order details
    const order = await pool.query(
      'SELECT courier_id, sender_phone FROM orders WHERE id = $1',
      [id]
    );
    
    if (order.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'הזמנה לא נמצאה' });
    }
    
    const { courier_id, sender_phone } = order.rows[0];
    
    // Insert rating
    await pool.query(
      `INSERT INTO order_ratings 
       (order_id, courier_id, customer_phone, rating, speed_rating, courtesy_rating, professionalism_rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_id) DO UPDATE SET
         rating = $4,
         speed_rating = $5,
         courtesy_rating = $6,
         professionalism_rating = $7,
         comment = $8`,
      [id, courier_id, sender_phone, rating, speed_rating, courtesy_rating, professionalism_rating, comment]
    );
    
    // Update courier average rating
    const avgRating = await pool.query(
      `SELECT AVG(rating) as avg_rating 
       FROM order_ratings 
       WHERE courier_id = $1`,
      [courier_id]
    );
    
    if (avgRating.rows.length > 0) {
      await pool.query(
        'UPDATE couriers SET rating = $1 WHERE id = $2',
        [avgRating.rows[0].avg_rating, courier_id]
      );
    }
    
    res.json({ success: true, message: 'תודה על הדירוג!' });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ success: false, message: 'שגיאת שרת' });
  }
});

// ==================== HTML ROUTES ====================

/**
 * Courier Dashboard
 */
app.get('/courier/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/courier-dashboard.html');
});

/**
 * Courier Login
 */
app.get('/courier/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>כניסת שליח - M.M.H Delivery</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .bg-dark-900 { background-color: #0f172a; }
        .bg-dark-800 { background-color: #1e293b; }
        .bg-dark-700 { background-color: #334155; }
      </style>
    </head>
    <body class="bg-dark-900 text-white min-h-screen flex items-center justify-center p-4">
      <div class="bg-dark-800 p-8 rounded-2xl w-full max-w-md shadow-2xl">
        <div class="text-center mb-8">
          <div class="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">
            🏍️
          </div>
          <h1 class="text-2xl font-bold mb-2">כניסת שליח</h1>
          <p class="text-gray-400 text-sm">M.M.H Delivery</p>
        </div>
        <div id="error" class="hidden bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm"></div>
        <input 
          type="tel" 
          id="phone" 
          placeholder="מספר טלפון (050-1234567)" 
          class="w-full bg-dark-700 border border-gray-600 px-4 py-3 rounded-lg mb-4 text-white focus:outline-none focus:border-emerald-500"
          onkeypress="if(event.key==='Enter') login()"
        >
        <button 
          onclick="login()" 
          id="loginBtn"
          class="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 py-3 rounded-lg font-bold transition-all shadow-lg"
        >
          כניסה
        </button>
        <div class="mt-6 text-center text-sm text-gray-400">
          <p>אין לך חשבון?</p>
          <a href="/courier/register" class="text-emerald-400 hover:text-emerald-300">הרשם כשליח</a>
        </div>
      </div>
      <script>
        async function login() {
          const phone = document.getElementById('phone').value.trim();
          const btn = document.getElementById('loginBtn');
          const error = document.getElementById('error');
          
          error.classList.add('hidden');
          
          if (!phone) {
            error.textContent = 'נא להזין מספר טלפון';
            error.classList.remove('hidden');
            return;
          }
          
          btn.disabled = true;
          btn.textContent = 'מתחבר...';
          
          try {
            const response = await fetch('/api/courier/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone })
            });
            
            const data = await response.json();
            
            if (data.success) {
              localStorage.setItem('courier_phone', phone);
              window.location.href = '/courier/dashboard';
            } else {
              error.textContent = data.message || 'שליח לא נמצא במערכת';
              error.classList.remove('hidden');
              btn.disabled = false;
              btn.textContent = 'כניסה';
            }
          } catch (err) {
            error.textContent = 'שגיאה בחיבור לשרת';
            error.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'כניסה';
          }
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Customer Dashboard
 */
app.get('/customer/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/customer-dashboard.html');
});

/**
 * Public Order Tracking (share link)
 * GET /track/:orderNumber
 */
app.get('/track/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params;
  res.redirect(`/customer/dashboard?track=${orderNumber}`);
});

// ==================== WEBSOCKET BROADCAST HELPER ====================

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcastToClients(message) {
  if (!wss || !wss.clients) return;
  
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error('WebSocket send error:', error);
      }
    }
  });
}

// ==================== ENHANCED ORDER PUBLISHING ====================

/**
 * עדכן את הפונקציה הקיימת שמפרסמת הזמנה
 * הוסף את השורות הבאות אחרי הפרסום ב-WhatsApp
 */
/*
// After WhatsApp publish success:
try {
  // Send push notification to all available couriers
  await pushService.broadcastNewOrder({
    id: order.id,
    order_number: order.order_number,
    pickup_address: order.pickup_address,
    delivery_address: order.delivery_address,
    courier_payout: order.courier_payout,
    distance: order.distance
  });
  
  console.log('📢 Broadcast notification sent to couriers');
} catch (error) {
  console.error('Error broadcasting to couriers:', error);
}
*/

console.log('✅ Phase 1 & 2 routes loaded successfully');
