/**
 * API Endpoints to ADD to server.js
 * הוסף את ה-endpoints האלה ל-server.js שלך
 * 
 * מיקום: לפני app.listen() בסוף הקובץ
 */

// ==================== COURIER API ENDPOINTS ====================

/**
 * Get Courier by Phone Number
 * מקבל את פרטי השליח לפי מספר טלפון
 * 
 * Usage: GET /api/couriers/phone/0501234567
 */
app.get('/api/couriers/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    console.log('🔍 Looking for courier with phone:', phone);
    
    const result = await pool.query(
      'SELECT * FROM couriers WHERE phone = $1',
      [phone]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Courier not found');
      return res.status(404).json({ 
        success: false, 
        message: 'שליח לא נמצא במערכת' 
      });
    }
    
    const courier = result.rows[0];
    console.log('✅ Courier found:', courier.first_name, courier.last_name);
    
    res.json({ 
      success: true, 
      courier: courier 
    });
    
  } catch (error) {
    console.error('❌ Error getting courier by phone:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאת שרת פנימית' 
    });
  }
});

/**
 * Get All Orders for Courier
 * מקבל את כל ההזמנות הרלוונטיות לשליח:
 * - הזמנות זמינות (published) - לכולם
 * - הזמנות של השליח הספציפי (taken, picked, delivered, cancelled)
 * 
 * Usage: GET /api/couriers/123/orders
 */
app.get('/api/couriers/:id/orders', async (req, res) => {
  try {
    const courierId = parseInt(req.params.id);
    
    if (isNaN(courierId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'מזהה שליח לא תקין' 
      });
    }
    
    console.log('📦 Getting orders for courier:', courierId);
    
    // שאילתה שמחזירה:
    // 1. כל ההזמנות הזמינות (published) - לכל השליחים
    // 2. כל ההזמנות של השליח הספציפי בכל הסטטוסים
    const result = await pool.query(`
      SELECT 
        o.*,
        c.first_name || ' ' || c.last_name as courier_name,
        c.phone as courier_phone,
        c.vehicle_type,
        c.rating as courier_rating
      FROM orders o
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE 
        o.status = 'published'  -- הזמנות זמינות לכולם
        OR (
          o.courier_id = $1  -- או הזמנות של השליח הספציפי
          AND o.status IN ('taken', 'picked', 'delivered', 'cancelled')
        )
      ORDER BY 
        CASE 
          WHEN o.status = 'published' THEN 1  -- הזמנות זמינות ראשון
          WHEN o.status IN ('taken', 'picked') THEN 2  -- הזמנות פעילות שני
          ELSE 3  -- היסטוריה שלישי
        END,
        o.created_at DESC
    `, [courierId]);
    
    console.log(`✅ Found ${result.rows.length} orders`);
    
    res.json({ 
      success: true, 
      orders: result.rows 
    });
    
  } catch (error) {
    console.error('❌ Error getting courier orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאת שרת פנימית' 
    });
  }
});

/**
 * Update Courier Online Status (אופציונלי - אם רוצים מעקב online/offline)
 * 
 * Usage: POST /api/courier/online
 * Body: { courierId: 123, online: true }
 */
app.post('/api/courier/online', async (req, res) => {
  try {
    const { courierId, online } = req.body;
    
    if (!courierId) {
      return res.status(400).json({ 
        success: false, 
        message: 'חסר מזהה שליח' 
      });
    }
    
    // עדכון סטטוס online (צריך להוסיף עמודה is_online לטבלת couriers)
    await pool.query(
      'UPDATE couriers SET is_online = $1, last_seen = NOW() WHERE id = $2',
      [online, courierId]
    );
    
    console.log(`✅ Courier ${courierId} is now ${online ? 'online' : 'offline'}`);
    
    res.json({ 
      success: true, 
      message: `סטטוס עודכן ל-${online ? 'מחובר' : 'לא מחובר'}` 
    });
    
  } catch (error) {
    console.error('❌ Error updating online status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בעדכון סטטוס' 
    });
  }
});

/**
 * Update Courier Location (אופציונלי - למעקב GPS)
 * 
 * Usage: POST /api/courier/location
 * Body: { courierId: 123, latitude: 32.0853, longitude: 34.7818 }
 */
app.post('/api/courier/location', async (req, res) => {
  try {
    const { courierId, latitude, longitude } = req.body;
    
    if (!courierId || !latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: 'חסרים פרמטרים' 
      });
    }
    
    // עדכון מיקום (צריך להוסיף עמודות current_lat, current_lng לטבלת couriers)
    await pool.query(
      'UPDATE couriers SET current_lat = $1, current_lng = $2, location_updated_at = NOW() WHERE id = $3',
      [latitude, longitude, courierId]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Error updating location:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בעדכון מיקום' 
    });
  }
});

// ==================== ADDITIONAL HELPER ENDPOINTS ====================

/**
 * Get Order by ID (with full details)
 * מחזיר הזמנה ספציפית עם כל הפרטים
 * 
 * Usage: GET /api/orders/123
 */
// הendpoint הזה כבר אמור להיות קיים ב-server.js שלך
// אם לא, הנה הקוד:

/*
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        o.*,
        c.first_name || ' ' || c.last_name as courier_name,
        c.phone as courier_phone,
        c.vehicle_type,
        c.rating as courier_rating,
        c.profile_photo_url,
        c.current_lat,
        c.current_lng
      FROM orders o
      LEFT JOIN couriers c ON o.courier_id = c.id
      WHERE o.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'הזמנה לא נמצאה' 
      });
    }
    
    res.json({ 
      success: true, 
      order: result.rows[0] 
    });
    
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאת שרת' 
    });
  }
});
*/

/**
 * Take Order (שליח תופס הזמנה)
 * 
 * Usage: POST /api/orders/123/take
 * Body: { courierId: 456 }
 */
// הendpoint הזה גם כבר אמור להיות קיים
// אם לא, הנה הקוד:

/*
app.post('/api/orders/:id/take', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { courierId } = req.body;
    
    // בדיקה שההזמנה זמינה
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'הזמנה לא נמצאה' 
      });
    }
    
    const order = orderCheck.rows[0];
    
    if (order.status !== 'published') {
      return res.status(400).json({ 
        success: false, 
        message: 'ההזמנה כבר נתפסה' 
      });
    }
    
    // תפיסת ההזמנה
    await pool.query(
      `UPDATE orders 
       SET courier_id = $1, status = 'taken', taken_at = NOW() 
       WHERE id = $2`,
      [courierId, orderId]
    );
    
    // שליחת התראה ללקוח (אופציונלי)
    // await pushService.notifyCustomer(orderId, 'courier_assigned');
    
    res.json({ 
      success: true, 
      message: 'המשלוח נתפס בהצלחה!' 
    });
    
  } catch (error) {
    console.error('Error taking order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בתפיסת המשלוח' 
    });
  }
});
*/

/**
 * Update Order Status
 * 
 * Usage: POST /api/orders/123/status
 * Body: { status: 'picked', courierId: 456 }
 */
// גם הendpoint הזה אמור להיות קיים
// אם לא, הנה הקוד:

/*
app.post('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, courierId } = req.body;
    
    const validStatuses = ['taken', 'picked', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'סטטוס לא חוקי' 
      });
    }
    
    // בדיקה שהשליח הנכון מעדכן
    const orderCheck = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND courier_id = $2',
      [orderId, courierId]
    );
    
    if (orderCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'אין הרשאה לעדכן הזמנה זו' 
      });
    }
    
    // עדכון סטטוס
    const updateField = status === 'picked' ? 'picked_at' : 
                       status === 'delivered' ? 'delivered_at' : 
                       status === 'cancelled' ? 'cancelled_at' : null;
    
    let query = 'UPDATE orders SET status = $1';
    const params = [status];
    
    if (updateField) {
      query += `, ${updateField} = NOW()`;
    }
    
    query += ' WHERE id = $2';
    params.push(orderId);
    
    await pool.query(query, params);
    
    // שליחת התראה ללקוח
    // await pushService.notifyCustomer(orderId, `package_${status}`);
    
    res.json({ 
      success: true, 
      message: 'הסטטוס עודכן בהצלחה' 
    });
    
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בעדכון סטטוס' 
    });
  }
});
*/

// ==================== DATABASE SCHEMA ADDITIONS ====================

/**
 * אם רוצים תמיכה מלאה בפיצ'רים של online status ו-GPS tracking,
 * צריך להוסיף עמודות לטבלת couriers:
 * 
 * ALTER TABLE couriers ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
 * ALTER TABLE couriers ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP;
 * ALTER TABLE couriers ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10,8);
 * ALTER TABLE couriers ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11,8);
 * ALTER TABLE couriers ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP;
 * 
 * הרץ את הפקודות האלה ב-psql או דרך migration script
 */

// ==================== TESTING ====================

/**
 * בדיקה מהטרמינל:
 * 
 * # בדיקת קבלת שליח לפי טלפון
 * curl http://localhost:3001/api/couriers/phone/0501234567
 * 
 * # בדיקת קבלת הזמנות של שליח
 * curl http://localhost:3001/api/couriers/1/orders
 * 
 * # בדיקת עדכון סטטוס online
 * curl -X POST http://localhost:3001/api/courier/online \
 *   -H "Content-Type: application/json" \
 *   -d '{"courierId": 1, "online": true}'
 * 
 * # בדיקת עדכון מיקום
 * curl -X POST http://localhost:3001/api/courier/location \
 *   -H "Content-Type: application/json" \
 *   -d '{"courierId": 1, "latitude": 32.0853, "longitude": 34.7818}'
 */

console.log('✅ Courier API endpoints loaded successfully');
