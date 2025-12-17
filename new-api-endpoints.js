// ==================== NEW ORDER & EARNINGS API ENDPOINTS ====================
// הוסף את זה ב-server.js לפני server.listen()

// Calculate distance using Google Maps API
app.post('/api/calculate-distance', async (req, res) => {
  try {
    const { origin, destination } = req.body;
    
    if (!CONFIG.GOOGLE_API_KEY) {
      return res.json({ 
        success: false, 
        message: 'Google Maps API key לא מוגדר'
      });
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${CONFIG.GOOGLE_API_KEY}&language=he`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    if (data.status !== 'OK' || !data.rows[0].elements[0].distance) {
      return res.json({ 
        success: false, 
        message: 'לא ניתן לחשב מרחק. אנא בדוק את הכתובות.'
      });
    }
    
    const distanceInMeters = data.rows[0].elements[0].distance.value;
    const distanceInKm = (distanceInMeters / 1000).toFixed(1);
    
    res.json({ 
      success: true, 
      distance: parseFloat(distanceInKm),
      duration: data.rows[0].elements[0].duration.text
    });
    
  } catch (error) {
    console.error('Calculate distance error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בחישוב מרחק'
    });
  }
});

// Create new order (customer)
app.post('/api/orders/create', async (req, res) => {
  try {
    const {
      customerPhone,
      pickupAddress,
      pickupContact,
      pickupPhone,
      pickupNotes,
      deliveryAddress,
      deliveryContact,
      deliveryPhone,
      deliveryNotes,
      packageDescription,
      additionalNotes,
      vehicleType,
      distance,
      basePrice,
      totalPrice
    } = req.body;

    // Generate order number
    const orderNumber = 'ORD-' + Date.now().toString().slice(-8);
    
    // Insert order with status 'new' (pending approval)
    const result = await pool.query(
      `INSERT INTO orders (
        order_number,
        sender_phone,
        sender_name,
        pickup_address,
        pickup_phone,
        pickup_notes,
        receiver_name,
        receiver_phone,
        delivery_address,
        delivery_notes,
        package_description,
        notes,
        vehicle_type,
        distance_km,
        price,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING *`,
      [
        orderNumber,
        customerPhone,
        pickupContact,
        pickupAddress,
        pickupPhone,
        pickupNotes || '',
        deliveryContact,
        deliveryPhone,
        deliveryAddress,
        deliveryNotes || '',
        packageDescription,
        additionalNotes || '',
        vehicleType,
        distance,
        totalPrice,
        'new' // Status: pending admin approval
      ]
    );

    const order = result.rows[0];

    // TODO: Send notification to admin/manager
    console.log(`📦 New order pending approval: ${orderNumber}`);

    res.json({ 
      success: true, 
      message: 'ההזמנה נשלחה לאישור',
      order
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה ביצירת הזמנה'
    });
  }
});

// Get courier earnings summary
app.get('/api/couriers/:id/earnings', async (req, res) => {
  try {
    const { id } = req.params;
    
    // This month
    const thisMonthResult = await pool.query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(courier_payout), 0) as total
      FROM orders
      WHERE courier_id = $1 
        AND status = 'delivered'
        AND DATE_TRUNC('month', delivered_at) = DATE_TRUNC('month', CURRENT_DATE)`,
      [id]
    );
    
    // Last month
    const lastMonthResult = await pool.query(
      `SELECT 
        COUNT(*) as count,
        COALESCE(SUM(courier_payout), 0) as total
      FROM orders
      WHERE courier_id = $1 
        AND status = 'delivered'
        AND DATE_TRUNC('month', delivered_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`,
      [id]
    );
    
    // Total earned
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(courier_payout), 0) as total
      FROM orders
      WHERE courier_id = $1 AND status = 'delivered'`,
      [id]
    );

    const thisMonth = parseFloat(thisMonthResult.rows[0].total);
    const lastMonth = parseFloat(lastMonthResult.rows[0].total);
    const thisMonthCount = parseInt(thisMonthResult.rows[0].count);
    const lastMonthCount = parseInt(lastMonthResult.rows[0].count);
    const totalEarned = parseFloat(totalResult.rows[0].total);
    
    const monthChange = lastMonth > 0 
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : 0;
      
    const deliveriesChange = thisMonthCount - lastMonthCount;
    
    const avgPerDelivery = thisMonthCount > 0 
      ? Math.round(thisMonth / thisMonthCount)
      : 0;

    res.json({
      success: true,
      earnings: {
        thisMonth: Math.round(thisMonth),
        deliveriesThisMonth: thisMonthCount,
        monthChange,
        deliveriesChange,
        avgPerDelivery,
        totalEarned: Math.round(totalEarned)
      }
    });

  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בטעינת נתונים'
    });
  }
});

// Get earnings chart data
app.get('/api/couriers/:id/earnings/chart', async (req, res) => {
  try {
    const { id } = req.params;
    const { period } = req.query; // 'week', 'month', 'year'
    
    let interval, format;
    
    switch(period) {
      case 'week':
        interval = '7 days';
        format = 'DD/MM';
        break;
      case 'month':
        interval = '30 days';
        format = 'DD/MM';
        break;
      case 'year':
        interval = '12 months';
        format = 'MM/YYYY';
        break;
      default:
        interval = '7 days';
        format = 'DD/MM';
    }

    const result = await pool.query(
      `SELECT 
        DATE_TRUNC('day', delivered_at) as date,
        COALESCE(SUM(courier_payout), 0) as total
      FROM orders
      WHERE courier_id = $1 
        AND status = 'delivered'
        AND delivered_at >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('day', delivered_at)
      ORDER BY date ASC`,
      [id]
    );

    const labels = result.rows.map(row => {
      const date = new Date(row.date);
      return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    });
    
    const values = result.rows.map(row => Math.round(parseFloat(row.total)));

    res.json({
      success: true,
      labels,
      values
    });

  } catch (error) {
    console.error('Get chart data error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בטעינת נתונים'
    });
  }
});

// Get courier transactions
app.get('/api/couriers/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get completed deliveries (income)
    const deliveries = await pool.query(
      `SELECT 
        id,
        'income' as type,
        'משלוח #' || order_number as description,
        courier_payout as amount,
        delivered_at as created_at
      FROM orders
      WHERE courier_id = $1 AND status = 'delivered'
      ORDER BY delivered_at DESC
      LIMIT 20`,
      [id]
    );
    
    // Get payout requests (expense)
    const payouts = await pool.query(
      `SELECT 
        id,
        'expense' as type,
        'משיכה - ' || payment_method as description,
        amount,
        created_at
      FROM payout_requests
      WHERE courier_id = $1 AND status IN ('approved', 'completed')
      ORDER BY created_at DESC
      LIMIT 20`,
      [id]
    );

    const transactions = [
      ...deliveries.rows,
      ...payouts.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      transactions
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בטעינת פעולות'
    });
  }
});

// Submit payout request
app.post('/api/couriers/:id/payout-request', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, accountInfo } = req.body;
    
    // Verify courier has enough balance
    const courier = await pool.query(
      'SELECT balance FROM couriers WHERE id = $1',
      [id]
    );
    
    if (courier.rows.length === 0) {
      return res.json({ 
        success: false, 
        message: 'שליח לא נמצא'
      });
    }
    
    const balance = parseFloat(courier.rows[0].balance);
    
    if (amount > balance) {
      return res.json({ 
        success: false, 
        message: 'הסכום גבוה מהיתרה הזמינה'
      });
    }
    
    if (amount < 50) {
      return res.json({ 
        success: false, 
        message: 'הסכום המינימלי למשיכה הוא ₪50'
      });
    }

    // Insert payout request
    await pool.query(
      `INSERT INTO payout_requests (
        courier_id,
        amount,
        payment_method,
        account_info,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [id, amount, method, accountInfo]
    );

    // TODO: Send notification to admin
    console.log(`💰 Payout request: Courier ${id}, Amount: ₪${amount}, Method: ${method}`);

    res.json({ 
      success: true, 
      message: 'בקשת התשלום נשלחה בהצלחה'
    });

  } catch (error) {
    console.error('Payout request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשליחת הבקשה'
    });
  }
});

// ==================== DATABASE TABLES NEEDED ====================
/*
צריך ליצור טבלה חדשה: payout_requests

CREATE TABLE IF NOT EXISTS payout_requests (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  account_info TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX idx_payout_courier ON payout_requests(courier_id);
CREATE INDEX idx_payout_status ON payout_requests(status);
*/
