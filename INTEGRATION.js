/**
 * M.M.H Delivery - Quick Integration Guide
 * קובץ עזר לשילוב מהיר של הדשבורדים החדשים
 */

// ==================== הוספה ל-server.js ====================

// 1. הוסף בתחילת הקובץ (אחרי ה-imports):
const express = require('express');
const path = require('path');

// 2. הוסף אחרי app initialization:
// Static routes for new dashboards
app.use('/courier', express.static(path.join(__dirname, 'public/courier')));
app.use('/customer', express.static(path.join(__dirname, 'public/customer')));
app.use('/manager', express.static(path.join(__dirname, 'public/manager')));

// ==================== API ENDPOINTS ====================
// העתק והוסף את כל ה-endpoints האלה בסוף server.js, לפני app.listen()

// 1. COURIER DASHBOARD API
app.get('/api/courier/:phone/dashboard', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const courierResult = await pool.query(
      'SELECT * FROM couriers WHERE phone = $1',
      [phone]
    );
    
    if (courierResult.rows.length === 0) {
      return res.status(404).json({ error: 'שליח לא נמצא' });
    }
    
    const courier = courierResult.rows[0];
    
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        EXTRACT(EPOCH FROM (delivered_at - picked_at)) / 60 as delivery_time_minutes
      FROM orders o
      WHERE courier_id = $1
      ORDER BY created_at DESC
    `, [courier.id]);
    
    const orders = ordersResult.rows;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Calculate statistics
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const todayCompleted = todayOrders.filter(o => o.status === 'delivered');
    const todayEarned = todayCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo);
    const weekCompleted = weekOrders.filter(o => o.status === 'delivered');
    const weekEarned = weekCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    const totalCompleted = orders.filter(o => o.status === 'delivered');
    const totalEarned = totalCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    // Daily earnings for chart
    const dailyEarnings = [];
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayOrders = orders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= dayStart && orderDate < dayEnd && o.status === 'delivered';
      });
      
      dailyEarnings.push({
        day: days[day.getDay()],
        amount: dayOrders.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0),
        count: dayOrders.length
      });
    }
    
    res.json({
      courier: {
        id: courier.id,
        first_name: courier.first_name,
        last_name: courier.last_name,
        phone: courier.phone,
        rating: courier.rating,
        total_deliveries: courier.total_deliveries,
        created_at: courier.created_at,
      },
      stats: {
        today: { total: todayOrders.length, completed: todayCompleted.length, earned: todayEarned },
        week: { total: weekOrders.length, completed: weekCompleted.length, earned: weekEarned },
        total: { completed: totalCompleted.length, earned: totalEarned },
        weekTrend: 0,
        dailyEarnings
      },
      orders: orders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        pickup_address: o.pickup_address,
        delivery_address: o.delivery_address,
        receiver_phone: o.receiver_phone,
        courier_payout: o.courier_payout,
        created_at: o.created_at,
        picked_at: o.picked_at,
        delivered_at: o.delivered_at
      }))
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// 2. CUSTOMER TRACKING API
app.get('/api/customer/:phone/orders', async (req, res) => {
  try {
    const { phone } = req.params;
    
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        c.first_name as courier_first_name,
        c.last_name as courier_last_name,
        c.phone as courier_phone,
        c.rating as courier_rating
      FROM orders o
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE o.sender_phone = $1 OR o.receiver_phone = $1
      ORDER BY o.created_at DESC
    `, [phone]);
    
    const orders = ordersResult.rows;
    const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const completedOrders = orders.filter(o => o.status === 'delivered');
    const totalSpent = completedOrders.reduce((sum, o) => sum + parseFloat(o.price || 0), 0);
    
    res.json({
      stats: {
        total: orders.length,
        active: activeOrders.length,
        completed: completedOrders.length,
        totalSpent
      },
      orders: orders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        sender_name: o.sender_name,
        sender_phone: o.sender_phone,
        receiver_name: o.receiver_name,
        receiver_phone: o.receiver_phone,
        pickup_address: o.pickup_address,
        delivery_address: o.delivery_address,
        price: o.price,
        payment_status: o.payment_status,
        created_at: o.created_at,
        published_at: o.published_at,
        taken_at: o.taken_at,
        picked_at: o.picked_at,
        delivered_at: o.delivered_at,
        courier: o.courier_id ? {
          name: `${o.courier_first_name} ${o.courier_last_name}`,
          phone: o.courier_phone,
          rating: o.courier_rating
        } : null
      }))
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// 3. MANAGER ANALYTICS API (דורש authentication)
app.get('/api/manager/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    const ordersResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled')) as active_orders,
        SUM(price) FILTER (WHERE status = 'delivered') as total_revenue,
        SUM(commission) FILTER (WHERE status = 'delivered') as total_commission,
        SUM(courier_payout) FILTER (WHERE status = 'delivered') as total_payouts,
        AVG(EXTRACT(EPOCH FROM (delivered_at - picked_at)) / 60) FILTER (WHERE status = 'delivered') as avg_delivery_time
      FROM orders
      WHERE created_at >= $1
    `, [daysAgo]);
    
    const stats = ordersResult.rows[0];
    
    const topCouriersResult = await pool.query(`
      SELECT 
        c.id,
        c.first_name,
        c.last_name,
        c.phone,
        c.rating,
        COUNT(o.id) FILTER (WHERE o.status = 'delivered') as deliveries,
        SUM(o.courier_payout) FILTER (WHERE o.status = 'delivered') as earned
      FROM couriers c
      LEFT JOIN orders o ON c.id = o.courier_id AND o.created_at >= $1
      GROUP BY c.id
      ORDER BY deliveries DESC
      LIMIT 10
    `, [daysAgo]);
    
    const dailyOrdersResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        SUM(price) FILTER (WHERE status = 'delivered') as revenue
      FROM orders
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [daysAgo]);
    
    const hourlyDistResult = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM orders
      WHERE created_at >= $1 AND status = 'delivered'
      GROUP BY hour
      ORDER BY hour
    `, [daysAgo]);
    
    res.json({
      overview: {
        completedOrders: parseInt(stats.completed_orders || 0),
        cancelledOrders: parseInt(stats.cancelled_orders || 0),
        activeOrders: parseInt(stats.active_orders || 0),
        totalRevenue: parseFloat(stats.total_revenue || 0),
        totalCommission: parseFloat(stats.total_commission || 0),
        totalPayouts: parseFloat(stats.total_payouts || 0),
        avgDeliveryTime: parseFloat(stats.avg_delivery_time || 0).toFixed(1)
      },
      topCouriers: topCouriersResult.rows.map(c => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        phone: c.phone,
        rating: c.rating,
        deliveries: parseInt(c.deliveries || 0),
        earned: parseFloat(c.earned || 0)
      })),
      dailyOrders: dailyOrdersResult.rows,
      hourlyDistribution: hourlyDistResult.rows
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// ==================== WHATSAPP INTEGRATION ====================
// הוסף את הפונקציות האלה לשליחת לינקים ללקוחות ושליחים

/**
 * שלח לינק דשבורד לשליח
 */
async function sendCourierDashboardLink(courierPhone) {
  const link = `${CONFIG.PUBLIC_URL}/courier/dashboard.html?phone=${courierPhone}`;
  const message = `
🏍️ ברוך הבא למערכת M.M.H Delivery!

ניתן לצפות בדשבורד האישי שלך כאן:
${link}

בדשבורד תוכל לראות:
✅ משלוחים פעילים
✅ רווחים יומיים ושבועיים
✅ היסטוריית משלוחים
✅ סטטיסטיקות ביצועים
  `.trim();
  
  // שלח דרך WhatsApp API
  return sendWhatsAppMessage(courierPhone, message);
}

/**
 * שלח לינק מעקב ללקוח
 */
async function sendCustomerTrackingLink(customerPhone, orderNumber) {
  const link = `${CONFIG.PUBLIC_URL}/customer/track.html?phone=${customerPhone}`;
  const message = `
📦 ההזמנה שלך #${orderNumber} יצאה לדרך!

ניתן לעקוב אחר המשלוח כאן:
${link}

תוכל לראות:
✅ סטטוס המשלוח בזמן אמת
✅ פרטי השליח
✅ זמן הגעה משוער

תודה שבחרת ב-M.M.H Delivery! 🚀
  `.trim();
  
  return sendWhatsAppMessage(customerPhone, message);
}

// ==================== FILE STRUCTURE ====================
/**
 * מבנה התיקיות:
 * 
 * project/
 * ├── server.js (הוסף את ה-endpoints למעלה)
 * ├── public/
 * │   ├── courier/
 * │   │   └── dashboard.html
 * │   ├── customer/
 * │   │   └── track.html
 * │   └── manager/
 * │       └── analytics.html
 * └── ...
 */

// ==================== QUICK START ====================
/**
 * התקנה מהירה:
 * 
 * 1. העתק את 3 הקבצים HTML לתיקיות המתאימות
 * 2. הוסף את ה-endpoints למעלה ל-server.js
 * 3. הוסף את ה-static routes בתחילת server.js
 * 4. הפעל מחדש את השרת
 * 5. נווט ל:
 *    - http://localhost:3001/courier/dashboard.html?phone=0501234567
 *    - http://localhost:3001/customer/track.html?phone=0501234567
 *    - http://localhost:3001/manager/analytics.html
 */

// ==================== TESTING ====================
/**
 * בדיקות:
 * 
 * 1. בדוק שליח:
 *    curl http://localhost:3001/api/courier/0501234567/dashboard
 * 
 * 2. בדוק לקוח:
 *    curl http://localhost:3001/api/customer/0501234567/orders
 * 
 * 3. בדוק מנהל (עם token):
 *    curl -H "Authorization: Bearer YOUR_TOKEN" \
 *         http://localhost:3001/api/manager/analytics?period=7
 */

// ==================== CUSTOMIZATION ====================
/**
 * התאמה אישית:
 * 
 * 1. שנה צבעים - ערוך את המשתנים בתוך כל HTML file
 * 2. שנה SERVER_URL - בתחילת כל HTML file
 * 3. הוסף שדות - ערוך את ה-API endpoints
 * 4. שנה עיצוב - ערוך את ה-Tailwind classes
 */

// ==================== EXPORT ====================
module.exports = {
  sendCourierDashboardLink,
  sendCustomerTrackingLink
};
