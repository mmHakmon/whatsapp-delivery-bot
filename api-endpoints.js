/**
 * M.M.H Delivery - Enhanced API Endpoints
 * Dashboard endpoints for couriers, customers, and managers
 */

// Add these endpoints to your server.js file

// ==================== COURIER DASHBOARD API ====================

/**
 * GET /api/courier/:phone/dashboard
 * Get comprehensive courier dashboard data
 */
app.get('/api/courier/:phone/dashboard', async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Get courier info
    const courierResult = await pool.query(
      'SELECT * FROM couriers WHERE phone = $1',
      [phone]
    );
    
    if (courierResult.rows.length === 0) {
      return res.status(404).json({ error: 'שליח לא נמצא' });
    }
    
    const courier = courierResult.rows[0];
    
    // Get all orders for this courier
    const ordersResult = await pool.query(`
      SELECT 
        o.*,
        EXTRACT(EPOCH FROM (delivered_at - picked_at)) / 60 as delivery_time_minutes
      FROM orders o
      WHERE courier_id = $1
      ORDER BY created_at DESC
    `, [courier.id]);
    
    const orders = ordersResult.rows;
    
    // Calculate statistics
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Today's stats
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const todayCompleted = todayOrders.filter(o => o.status === 'delivered');
    const todayEarned = todayCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    // Week's stats
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo);
    const weekCompleted = weekOrders.filter(o => o.status === 'delivered');
    const weekEarned = weekCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    // Month's stats
    const monthOrders = orders.filter(o => new Date(o.created_at) >= monthAgo);
    const monthCompleted = monthOrders.filter(o => o.status === 'delivered');
    const monthEarned = monthCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    // Total stats
    const totalCompleted = orders.filter(o => o.status === 'delivered');
    const totalEarned = totalCompleted.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    
    // Previous week for trend calculation
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const prevWeekOrders = orders.filter(o => {
      const date = new Date(o.created_at);
      return date >= twoWeeksAgo && date < weekAgo && o.status === 'delivered';
    });
    const prevWeekEarned = prevWeekOrders.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
    const weekTrend = prevWeekEarned > 0 ? ((weekEarned - prevWeekEarned) / prevWeekEarned * 100).toFixed(1) : 0;
    
    // Daily earnings for last 7 days
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
      
      const dayEarned = dayOrders.reduce((sum, o) => sum + parseFloat(o.courier_payout || 0), 0);
      
      dailyEarnings.push({
        day: days[day.getDay()],
        amount: dayEarned,
        count: dayOrders.length
      });
    }
    
    // Average delivery time
    const deliveredOrders = orders.filter(o => o.status === 'delivered' && o.delivery_time_minutes);
    const avgDeliveryTime = deliveredOrders.length > 0
      ? (deliveredOrders.reduce((sum, o) => sum + parseFloat(o.delivery_time_minutes), 0) / deliveredOrders.length).toFixed(1)
      : 0;
    
    // Response
    res.json({
      courier: {
        id: courier.id,
        first_name: courier.first_name,
        last_name: courier.last_name,
        phone: courier.phone,
        email: courier.email,
        vehicle_type: courier.vehicle_type,
        rating: courier.rating,
        total_deliveries: courier.total_deliveries,
        total_earned: courier.total_earned,
        balance: courier.balance,
        created_at: courier.created_at,
      },
      stats: {
        today: {
          total: todayOrders.length,
          completed: todayCompleted.length,
          earned: todayEarned
        },
        week: {
          total: weekOrders.length,
          completed: weekCompleted.length,
          earned: weekEarned
        },
        month: {
          total: monthOrders.length,
          completed: monthCompleted.length,
          earned: monthEarned
        },
        total: {
          completed: totalCompleted.length,
          earned: totalEarned
        },
        weekTrend: parseFloat(weekTrend),
        avgDeliveryTime: parseFloat(avgDeliveryTime),
        dailyEarnings
      },
      orders: orders.map(o => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        pickup_address: o.pickup_address,
        delivery_address: o.delivery_address,
        receiver_phone: o.receiver_phone,
        receiver_name: o.receiver_name,
        price: o.price,
        courier_payout: o.courier_payout,
        created_at: o.created_at,
        taken_at: o.taken_at,
        picked_at: o.picked_at,
        delivered_at: o.delivered_at,
        delivery_time_minutes: o.delivery_time_minutes
      }))
    });
    
  } catch (error) {
    console.error('Error fetching courier dashboard:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// ==================== CUSTOMER TRACKING API ====================

/**
 * GET /api/customer/:phone/orders
 * Get customer's order history and active orders
 */
app.get('/api/customer/:phone/orders', async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Get orders where customer is sender or receiver
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
    
    // Calculate statistics
    const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const completedOrders = orders.filter(o => o.status === 'delivered');
    const totalSpent = completedOrders.reduce((sum, o) => sum + parseFloat(o.price || 0), 0);
    
    // Response
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
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// ==================== MANAGER ANALYTICS API ====================

/**
 * GET /api/manager/analytics
 * Get comprehensive system analytics for managers
 */
app.get('/api/manager/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    // Orders statistics
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
    
    // Top couriers
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
    
    // Daily orders for chart
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
    
    // Hourly distribution
    const hourlyDistResult = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM orders
      WHERE created_at >= $1 AND status = 'delivered'
      GROUP BY hour
      ORDER BY hour
    `);
    
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
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// ==================== COURIER PERFORMANCE API ====================

/**
 * GET /api/courier/:id/performance
 * Get detailed courier performance metrics
 */
app.get('/api/courier/:id/performance', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query;
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    // Performance metrics
    const metricsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'delivered') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        SUM(courier_payout) FILTER (WHERE status = 'delivered') as earned,
        AVG(EXTRACT(EPOCH FROM (delivered_at - taken_at)) / 60) FILTER (WHERE status = 'delivered') as avg_total_time,
        AVG(EXTRACT(EPOCH FROM (picked_at - taken_at)) / 60) FILTER (WHERE status = 'delivered') as avg_pickup_time,
        AVG(EXTRACT(EPOCH FROM (delivered_at - picked_at)) / 60) FILTER (WHERE status = 'delivered') as avg_delivery_time
      FROM orders
      WHERE courier_id = $1 AND created_at >= $2
    `, [id, daysAgo]);
    
    const metrics = metricsResult.rows[0];
    
    // Ratings
    const ratingsResult = await pool.query(`
      SELECT 
        rating,
        comment,
        created_at
      FROM courier_ratings
      WHERE courier_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);
    
    res.json({
      metrics: {
        completed: parseInt(metrics.completed || 0),
        cancelled: parseInt(metrics.cancelled || 0),
        earned: parseFloat(metrics.earned || 0),
        avgTotalTime: parseFloat(metrics.avg_total_time || 0).toFixed(1),
        avgPickupTime: parseFloat(metrics.avg_pickup_time || 0).toFixed(1),
        avgDeliveryTime: parseFloat(metrics.avg_delivery_time || 0).toFixed(1),
        completionRate: metrics.completed > 0 
          ? ((parseInt(metrics.completed) / (parseInt(metrics.completed) + parseInt(metrics.cancelled || 0))) * 100).toFixed(1)
          : 0
      },
      ratings: ratingsResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching courier performance:', error);
    res.status(500).json({ error: 'שגיאה בטעינת נתונים' });
  }
});

// ==================== EXPORT HELPERS ====================

/**
 * GET /api/export/orders
 * Export orders to CSV
 */
app.get('/api/export/orders', authenticateToken, async (req, res) => {
  try {
    const { from, to, status } = req.query;
    
    let query = `
      SELECT 
        o.order_number,
        o.created_at,
        o.status,
        o.sender_name,
        o.sender_phone,
        o.receiver_name,
        o.receiver_phone,
        o.pickup_address,
        o.delivery_address,
        o.price,
        o.commission,
        o.courier_payout,
        o.payment_method,
        o.payment_status,
        c.first_name || ' ' || c.last_name as courier_name
      FROM orders o
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE 1=1
    `;
    
    const params = [];
    if (from) {
      params.push(from);
      query += ` AND o.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      query += ` AND o.created_at <= $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }
    
    query += ' ORDER BY o.created_at DESC';
    
    const result = await pool.query(query, params);
    
    // Convert to CSV
    const headers = ['מספר הזמנה', 'תאריך', 'סטטוס', 'שם שולח', 'טלפון שולח', 'שם מקבל', 'טלפון מקבל', 'כתובת איסוף', 'כתובת מסירה', 'מחיר', 'עמלה', 'תשלום לשליח', 'אמצעי תשלום', 'סטטוס תשלום', 'שליח'];
    const csv = [headers.join(',')];
    
    result.rows.forEach(row => {
      csv.push([
        row.order_number,
        new Date(row.created_at).toLocaleString('he-IL'),
        row.status,
        row.sender_name,
        row.sender_phone,
        row.receiver_name,
        row.receiver_phone,
        `"${row.pickup_address}"`,
        `"${row.delivery_address}"`,
        row.price,
        row.commission,
        row.courier_payout,
        row.payment_method,
        row.payment_status,
        row.courier_name || ''
      ].join(','));
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.csv`);
    res.send('\ufeff' + csv.join('\n')); // UTF-8 BOM for Hebrew support
    
  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({ error: 'שגיאה בייצוא נתונים' });
  }
});
