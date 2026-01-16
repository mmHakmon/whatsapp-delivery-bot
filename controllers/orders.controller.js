const pool = require('../config/database');
const { calculatePricing } = require('../config/pricing');
const { ORDER_STATUS } = require('../config/constants');
const mapsService = require('../services/maps.service');
const whatsappService = require('../services/whatsapp.service');
const websocketService = require('../services/websocket.service');
const { generateOrderNumber } = require('../utils/helpers');

class OrdersController {
  // ==========================================
  // CREATE ORDER (ADMIN/AGENT) - ✅ WITH ROAD DISTANCE!
  // ==========================================
  async createOrder(req, res, next) {
    try {
      const {
        senderName,
        senderPhone,
        pickupAddress,
        pickupLat,
        pickupLng,
        pickupNotes,
        receiverName,
        receiverPhone,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        deliveryNotes,
        packageDescription,
        notes,
        vehicleType = 'motorcycle',
        priority = 'normal',
        manualPrice  // ✅ Manual price override
      } = req.body;

      console.log('📦 Creating order:', {
        senderName,
        senderPhone,
        pickupAddress,
        hasPickupCoords: !!(pickupLat && pickupLng),
        deliveryAddress,
        hasDeliveryCoords: !!(deliveryLat && deliveryLng),
        vehicleType,
        manualPrice: manualPrice || 'auto'
      });

      let distanceKm;
      let finalPickupLat = pickupLat;
      let finalPickupLng = pickupLng;
      let finalDeliveryLat = deliveryLat;
      let finalDeliveryLng = deliveryLng;

      // ✅ CRITICAL FIX: Use ROAD distance instead of air distance!
      if (pickupLat && pickupLng && deliveryLat && deliveryLng) {
        console.log('✅ Coordinates provided - calculating ROAD distance via Google Maps...');
        
        try {
          // ✅ Use Google Maps Distance Matrix API for ROAD distance
          distanceKm = await mapsService.calculateDistanceByCoords(
            pickupLat,
            pickupLng,
            deliveryLat,
            deliveryLng
          );
          
          console.log('✅ ROAD distance calculated:', distanceKm, 'km');
        } catch (error) {
          console.error('⚠️ Google Maps failed, falling back to air distance:', error.message);
          
          // ⚠️ Fallback ONLY if Google fails: Haversine (air distance)
          const R = 6371; // Earth radius in km
          const dLat = (deliveryLat - pickupLat) * Math.PI / 180;
          const dLon = (deliveryLng - pickupLng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(pickupLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          distanceKm = R * c;
          
          console.log('⚠️ Using AIR distance (fallback):', distanceKm, 'km');
        }
      } else {
        // No coordinates - geocode addresses first
        console.log('⚠️ No coordinates provided, geocoding addresses...');
        
        try {
          // This already uses Google Distance Matrix (road distance)
          distanceKm = await mapsService.calculateDistance(pickupAddress, deliveryAddress);
          
          const pickupCoords = await mapsService.geocodeAddress(pickupAddress);
          const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);
          
          finalPickupLat = pickupCoords.lat;
          finalPickupLng = pickupCoords.lng;
          finalDeliveryLat = deliveryCoords.lat;
          finalDeliveryLng = deliveryCoords.lng;
        } catch (error) {
          console.error('❌ Geocoding failed:', error);
          return res.status(400).json({ 
            error: 'לא ניתן לחשב מרחק. אנא בחר כתובות מהרשימה המוצעת.' 
          });
        }
      }

      // ✅ Calculate pricing (or use manual price)
      let pricing;
      if (manualPrice && manualPrice > 0) {
        // Manual price provided
        console.log('💰 Using manual price:', manualPrice);
        const commissionRate = parseFloat(process.env.COMMISSION_RATE || 0.25);
        const vatRate = parseFloat(process.env.VAT_RATE || 0.18);
        
        const priceBeforeVat = manualPrice / (1 + vatRate);
        const vat = manualPrice - priceBeforeVat;
        const commission = Math.floor(manualPrice * commissionRate);
        const courierPayout = manualPrice - commission;
        
        pricing = {
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          vehicleType,
          basePrice: 0,
          pricePerKm: 0,
          billableKm: parseFloat(distanceKm.toFixed(2)),
          priceBeforeVat: parseFloat(priceBeforeVat.toFixed(2)),
          vat: parseFloat(vat.toFixed(2)),
          totalPrice: Math.ceil(manualPrice),
          commissionRate: commissionRate * 100,
          commission,
          courierPayout
        };
      } else {
        // Auto calculate pricing
        pricing = calculatePricing(distanceKm, vehicleType);
      }

      // Generate order number
      const orderNumber = generateOrderNumber();

      console.log('💰 Final Pricing:', pricing);

      // Insert order
      const result = await pool.query(`
        INSERT INTO orders (
          order_number, status, priority,
          sender_name, sender_phone, pickup_address, pickup_lat, pickup_lng, pickup_notes,
          receiver_name, receiver_phone, delivery_address, delivery_lat, delivery_lng, delivery_notes,
          package_description, notes, vehicle_type, distance_km,
          price, vat, commission_rate, commission, courier_payout,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        RETURNING *
      `, [
        orderNumber, ORDER_STATUS.NEW, priority,
        senderName, senderPhone, pickupAddress, finalPickupLat, finalPickupLng, pickupNotes,
        receiverName, receiverPhone, deliveryAddress, finalDeliveryLat, finalDeliveryLng, deliveryNotes,
        packageDescription, notes, vehicleType, pricing.distanceKm,
        pricing.totalPrice, pricing.vat, pricing.commissionRate, pricing.commission, pricing.courierPayout,
        req.user.id
      ]);

      const order = result.rows[0];

      console.log('✅ Order created:', order.order_number);

      // Send WhatsApp to customer
      try {
        await whatsappService.sendOrderConfirmation(senderPhone, order);
      } catch (error) {
        console.error('WhatsApp error:', error);
      }

      // Notify admins via WebSocket
      websocketService.notifyNewOrder(order);

      res.status(201).json({ 
        order, 
        pricing,
        message: 'הזמנה נוצרה בהצלחה' 
      });
    } catch (error) {
      console.error('❌ Create order error:', error);
      next(error);
    }
  }

  // ==========================================
  // CREATE ORDER PUBLIC (CUSTOMERS)
  // ==========================================
  async createOrderPublic(req, res, next) {
    try {
      const {
        senderName,
        senderPhone,
        pickupAddress,
        pickupNotes,
        receiverName,
        receiverPhone,
        deliveryAddress,
        deliveryNotes,
        packageDescription,
        notes,
        vehicleType = 'motorcycle',
        priority = 'normal'
      } = req.body;

      // Calculate ROAD distance
      const distanceKm = await mapsService.calculateDistance(pickupAddress, deliveryAddress);
      
      // Calculate pricing
      const pricing = calculatePricing(distanceKm, vehicleType);

      // Get coordinates
      const pickupCoords = await mapsService.geocodeAddress(pickupAddress);
      const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);

      // Generate order number
      const orderNumber = generateOrderNumber();

      // Insert order
      const result = await pool.query(`
        INSERT INTO orders (
          order_number, status, priority,
          sender_name, sender_phone, pickup_address, pickup_lat, pickup_lng, pickup_notes,
          receiver_name, receiver_phone, delivery_address, delivery_lat, delivery_lng, delivery_notes,
          package_description, notes, vehicle_type, distance_km,
          price, vat, commission_rate, commission, courier_payout
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        RETURNING *
      `, [
        orderNumber, ORDER_STATUS.NEW, priority,
        senderName, senderPhone, pickupAddress, pickupCoords.lat, pickupCoords.lng, pickupNotes,
        receiverName, receiverPhone, deliveryAddress, deliveryCoords.lat, deliveryCoords.lng, deliveryNotes,
        packageDescription, notes, vehicleType, pricing.distanceKm,
        pricing.totalPrice, pricing.vat, pricing.commissionRate, pricing.commission, pricing.courierPayout
      ]);

      const order = result.rows[0];

      // Send WhatsApp
      try {
        await whatsappService.sendOrderConfirmation(senderPhone, order);
      } catch (error) {
        console.error('WhatsApp error:', error);
      }

      websocketService.notifyNewOrder(order);

      res.status(201).json({ 
        order, 
        pricing,
        message: 'הזמנה נוצרה בהצלחה' 
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CALCULATE PRICING ENDPOINT
  // ==========================================
  async calculatePricingEndpoint(req, res, next) {
    try {
      const { pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType } = req.body;

      if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) {
        return res.status(400).json({ error: 'חסרים נתוני מיקום' });
      }

      if (!vehicleType) {
        return res.status(400).json({ error: 'חסר סוג רכב' });
      }

      // ✅ Calculate ROAD distance via Google Maps
      let distanceKm;
      try {
        distanceKm = await mapsService.calculateDistanceByCoords(
          pickupLat,
          pickupLng,
          deliveryLat,
          deliveryLng
        );
        console.log('✅ Price calculation - ROAD distance:', distanceKm, 'km');
      } catch (error) {
        console.error('⚠️ Google Maps failed, using air distance');
        // Fallback to Haversine
        const R = 6371;
        const dLat = (deliveryLat - pickupLat) * Math.PI / 180;
        const dLon = (deliveryLng - pickupLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(pickupLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distanceKm = R * c;
      }

      // Calculate pricing
      const pricing = calculatePricing(distanceKm, vehicleType);

      console.log('✅ Price calculated:', pricing);

      res.json(pricing);
    } catch (error) {
      console.error('❌ Calculate pricing error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET ORDERS
  // ==========================================
  async getOrders(req, res, next) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT o.*, 
               c.first_name as courier_first_name, 
               c.last_name as courier_last_name,
               c.phone as courier_phone,
               c.vehicle_type as courier_vehicle_type,
               u.name as created_by_name
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        LEFT JOIN users u ON o.created_by = u.id
      `;

      const params = [];

      if (status) {
        query += ' WHERE o.status = $1';
        params.push(status);
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ orders: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // GET ORDER BY ID
  // ==========================================
  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        SELECT o.*, 
               c.first_name as courier_first_name, 
               c.last_name as courier_last_name,
               c.phone as courier_phone,
               c.vehicle_type as courier_vehicle_type,
               u.name as created_by_name
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      res.json({ order: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // GET ORDER BY NUMBER (PUBLIC)
  // ==========================================
  async getOrderByNumber(req, res, next) {
    try {
      const { orderNumber } = req.params;

      const result = await pool.query(`
        SELECT o.*, 
               c.first_name as courier_first_name, 
               c.last_name as courier_last_name,
               c.phone as courier_phone
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        WHERE o.order_number = $1
      `, [orderNumber]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      res.json({ order: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // PUBLISH ORDER TO WHATSAPP
  // ==========================================
  async publishOrder(req, res, next) {
    try {
      const { id } = req.params;

      const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.NEW) {
        return res.status(400).json({ error: 'ההזמנה כבר פורסמה' });
      }

      // Update status to published
      await pool.query(
        'UPDATE orders SET status = $1, published_at = NOW() WHERE id = $2',
        [ORDER_STATUS.PUBLISHED, id]
      );

      // Send to WhatsApp group
      await whatsappService.publishOrderToGroup(order);

      // Notify via WebSocket
      websocketService.broadcast({ type: 'order_published', order });

      res.json({ message: 'ההזמנה פורסמה בהצלחה' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CANCEL ORDER
  // ==========================================
  async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const result = await pool.query(
        'UPDATE orders SET status = $1, cancelled_at = NOW(), cancellation_reason = $2 WHERE id = $3 RETURNING *',
        [ORDER_STATUS.CANCELLED, reason, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      websocketService.broadcast({ type: 'order_cancelled', order: result.rows[0] });

      res.json({ message: 'ההזמנה בוטלה' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // TAKE ORDER (COURIER)
  // ==========================================
  async takeOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const courierId = req.courier.id;

      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PUBLISHED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'לא ניתן לתפוס הזמנה זו' });
      }

      await client.query(
        'UPDATE orders SET status = $1, courier_id = $2, taken_at = NOW() WHERE id = $3',
        [ORDER_STATUS.TAKEN, courierId, id]
      );

      await client.query('COMMIT');

      const courierResult = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
      const courier = courierResult.rows[0];

await whatsappService.sendOrderToCourier(courier.phone, order, 'pickup');
await whatsappService.announceOrderTaken(order, courier);
await whatsappService.notifyCourierAssigned(order.sender_phone, order, courier); // ✅ הוסף
websocketService.broadcast({ type: 'order_taken', order });

      res.json({ message: 'תפסת את המשלוח!' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // ==========================================
  // QUICK TAKE ORDER (FROM WHATSAPP LINK)
  // ==========================================
  async quickTakeOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { orderId } = req.params;
      const { courierId } = req.body;

      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PUBLISHED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'ההזמנה כבר נתפסה' });
      }

      await client.query(
        'UPDATE orders SET status = $1, courier_id = $2, taken_at = NOW() WHERE id = $3',
        [ORDER_STATUS.TAKEN, courierId, orderId]
      );

      await client.query('COMMIT');

      const courierResult = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
      const courier = courierResult.rows[0];

await whatsappService.sendOrderToCourier(courier.phone, order, 'pickup');
await whatsappService.announceOrderTaken(order, courier);
await whatsappService.notifyCourierAssigned(order.sender_phone, order, courier); // ✅ הוסף
websocketService.broadcast({ type: 'order_taken', order });

      res.json({ message: 'תפסת את המשלוח!' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // ==========================================
  // PICKUP ORDER
  // ==========================================
  async pickupOrder(req, res, next) {
    try {
      const { id } = req.params;
      const courierId = req.courier.id;

      const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.courier_id !== courierId) {
        return res.status(403).json({ error: 'אין לך הרשאה' });
      }

      if (order.status !== ORDER_STATUS.TAKEN) {
        return res.status(400).json({ error: 'לא ניתן לאסוף הזמנה זו' });
      }

      await pool.query(
        'UPDATE orders SET status = $1, picked_at = NOW() WHERE id = $2',
        [ORDER_STATUS.PICKED, id]
      );

      await whatsappService.notifyPackagePicked(order.sender_phone, order);
      await whatsappService.sendOrderToCourier(req.courier.phone, order, 'delivery');

      websocketService.broadcast({ type: 'order_picked', order });

      res.json({ message: 'החבילה נאספה' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // DELIVER ORDER
  // ==========================================
  async deliverOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const courierId = req.courier.id;

      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.courier_id !== courierId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'אין לך הרשאה' });
      }

      if (order.status !== ORDER_STATUS.PICKED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'לא ניתן למסור הזמנה זו' });
      }

      // Update order to delivered
      await client.query(
        'UPDATE orders SET status = $1, delivered_at = NOW() WHERE id = $2',
        [ORDER_STATUS.DELIVERED, id]
      );

      // ✅ Update courier stats (total_deliveries & total_earned) + Add to balance
      await client.query(`
        UPDATE couriers 
        SET total_deliveries = total_deliveries + 1,
            total_earned = total_earned + $1,
            balance = balance + $1
        WHERE id = $2
      `, [order.courier_payout, courierId]);

      await client.query('COMMIT');

// Get updated courier balance + phone
const courierResult = await pool.query('SELECT balance, phone FROM couriers WHERE id = $1', [courierId]);

// Send notifications
await whatsappService.notifyDelivered(order.sender_phone, order);

// ✅ הוסף הודעה לשליח:
await whatsappService.sendMessage(
  courierResult.rows[0].phone,
  `🎉 *המשלוח הושלם בהצלחה!*\n\n` +
  `📦 הזמנה: ${order.order_number}\n` +
  `💰 הרווחת: *₪${order.courier_payout}*\n` +
  `💳 יתרה עדכנית: *₪${courierResult.rows[0].balance}*\n\n` +
  `המשך להרוויח! 🚀`
);

websocketService.broadcast({ type: 'order_delivered', order });

      res.json({ 
        message: '✅ המשלוח הושלם! הכסף נוסף ליתרה שלך',
        balance: courierResult.rows[0].balance,
        earned: order.courier_payout
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // ==========================================
  // DELETE ORDER
  // ==========================================
  async deleteOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      // If order was delivered, deduct from courier balance
      if (order.courier_id && order.status === ORDER_STATUS.DELIVERED) {
        await client.query(
          'UPDATE couriers SET balance = balance - $1, total_earned = total_earned - $1 WHERE id = $2',
          [order.courier_payout, order.courier_id]
        );
      }

      await client.query('DELETE FROM orders WHERE id = $1', [id]);

      await client.query('COMMIT');

      res.json({ message: 'ההזמנה נמחקה בהצלחה' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // ==========================================
  // STATISTICS
  // ==========================================
  async getStatistics(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'new') as new_orders,
          COUNT(*) FILTER (WHERE status = 'published') as published_orders,
          COUNT(*) FILTER (WHERE status = 'taken') as taken_orders,
          COUNT(*) FILTER (WHERE status = 'picked') as picked_orders,
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
          COALESCE(SUM(price) FILTER (WHERE status = 'delivered'), 0) as total_revenue,
          COALESCE(SUM(commission) FILTER (WHERE status = 'delivered'), 0) as total_commission,
          COALESCE(AVG(distance_km) FILTER (WHERE status = 'delivered'), 0) as avg_distance
        FROM orders
      `);

      res.json({ statistics: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

// ==========================================
  // ✅ NEW: CHECK RATING STATUS
  // ==========================================
  async checkRatingStatus(req, res, next) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT id FROM order_ratings WHERE order_id = $1',
        [id]
      );

      res.json({
        hasRating: result.rows.length > 0
      });
    } catch (error) {
      console.error('Check rating status error:', error);
      next(error);
    }
  }

  // ==========================================
  // ✅ NEW: RATE ORDER (PUBLIC - NO AUTH!)
  // ==========================================
  async rateOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id } = req.params;
      const {
        rating,
        speedRating,
        courtesyRating,
        professionalismRating,
        comment
      } = req.body;
      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'דירוג לא תקין' });
      }
      // Get order details
      const orderResult = await client.query(
        `SELECT o.*, c.id as courier_id
         FROM orders o
         LEFT JOIN couriers c ON o.courier_id = c.id
         WHERE o.id = $1 AND o.status = 'delivered'`,
        [id]
      );
      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה או לא הושלמה' });
      }
      const order = orderResult.rows[0];
      // Check if already rated
      const existingRating = await client.query(
        'SELECT id FROM order_ratings WHERE order_id = $1',
        [id]
      );
      if (existingRating.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'הזמנה זו כבר דורגה' });
      }
      // Insert rating
      await client.query(
        `INSERT INTO order_ratings (
          order_id, courier_id, customer_phone, rating,
          speed_rating, courtesy_rating, professionalism_rating, comment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          order.courier_id,
          order.sender_phone,
          rating,
          speedRating,
          courtesyRating,
          professionalismRating,
          comment
        ]
      );
      // Update courier's average rating
      if (order.courier_id) {
        const ratingsResult = await client.query(
          'SELECT AVG(rating) as avg_rating FROM order_ratings WHERE courier_id = $1',
          [order.courier_id]
        );
        const newAvgRating = parseFloat(ratingsResult.rows[0].avg_rating).toFixed(2);
        await client.query(
          'UPDATE couriers SET rating = $1 WHERE id = $2',
          [newAvgRating, order.courier_id]
        );
        console.log(`✅ Updated courier ${order.courier_id} rating to ${newAvgRating}`);
      }
      await client.query('COMMIT');
      res.json({
        message: 'הדירוג נשמר בהצלחה!',
        success: true
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Rate order error:', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new OrdersController();
