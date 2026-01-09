const pool = require('../config/database');
const { calculatePricing } = require('../config/pricing');
const { ORDER_STATUS } = require('../config/constants');
const mapsService = require('../services/maps.service');
const whatsappService = require('../services/whatsapp.service');
const websocketService = require('../services/websocket.service');
const { generateOrderNumber } = require('../utils/helpers');

class OrdersController {
  // ==========================================
  // CREATE ORDER (ADMIN/AGENT) - ✅ FIXED!
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
        priority = 'normal'
      } = req.body;

      console.log('📦 Creating order:', {
        senderName,
        senderPhone,
        pickupAddress,
        hasPickupCoords: !!(pickupLat && pickupLng),
        deliveryAddress,
        hasDeliveryCoords: !!(deliveryLat && deliveryLng),
        vehicleType
      });

      let distanceKm;
      let finalPickupLat = pickupLat;
      let finalPickupLng = pickupLng;
      let finalDeliveryLat = deliveryLat;
      let finalDeliveryLng = deliveryLng;

      // ✅ If frontend sent coordinates, use them directly!
      if (pickupLat && pickupLng && deliveryLat && deliveryLng) {
        console.log('✅ Using coordinates from frontend');
        
        // Calculate distance using Haversine formula
        const R = 6371; // Earth radius in km
        const dLat = (deliveryLat - pickupLat) * Math.PI / 180;
        const dLon = (deliveryLng - pickupLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(pickupLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distanceKm = R * c;
        
        console.log('✅ Calculated distance:', distanceKm, 'km');
      } else {
        // ❌ Fallback: geocode addresses (requires Google Maps API)
        console.log('⚠️ No coordinates provided, geocoding addresses...');
        
        try {
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

      // Calculate pricing
      const pricing = calculatePricing(distanceKm, vehicleType);

      // Generate order number
      const orderNumber = generateOrderNumber();

      console.log('💰 Pricing:', pricing);

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
  // CREATE ORDER PUBLIC (לקוחות - ללא אימות!)
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

      // Calculate distance
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

      query += ' ORDER BY o.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ orders: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Get order by ID
  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        SELECT o.*, 
               c.first_name as courier_first_name, 
               c.last_name as courier_last_name,
               c.phone as courier_phone,
               c.vehicle_type as courier_vehicle_type,
               c.rating as courier_rating,
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

  // Get order by number
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
  // PUBLISH ORDER
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

      await pool.query(
        'UPDATE orders SET status = $1, published_at = NOW() WHERE id = $2',
        [ORDER_STATUS.PUBLISHED, id]
      );

      await whatsappService.publishOrderToGroup(order);

      websocketService.broadcast({ type: 'order_published', order });

      res.json({ message: 'ההזמנה פורסמה בהצלחה' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CANCEL ORDER - ✅ FIXED!
  // ==========================================
  async cancelOrder(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { cancelReason, reason } = req.body;
      
      const finalReason = cancelReason || reason || 'ביטול ללא סיבה';
      
      await client.query('BEGIN');
      
      const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
      
      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }
      
      const order = orderResult.rows[0];
      
      if (order.status === 'delivered') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'לא ניתן לבטל הזמנה שכבר נמסרה' });
      }
      
      if (order.status === 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'ההזמנה כבר בוטלה' });
      }
      
      await client.query(
        `UPDATE orders SET status = 'cancelled', cancel_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [finalReason, id]
      );
      
      if (order.courier_id && order.courier_payout) {
        await client.query('UPDATE couriers SET balance = balance - $1 WHERE id = $2', 
          [order.courier_payout, order.courier_id]);
      }
      
      await client.query('COMMIT');
      
      if (order.courier_id) {
        const courierResult = await pool.query('SELECT phone FROM couriers WHERE id = $1', [order.courier_id]);
        if (courierResult.rows.length > 0) {
          await whatsappService.sendMessage(courierResult.rows[0].phone, 
            `❌ *משלוח בוטל*\n\nמספר הזמנה: ${order.order_number}\nסיבה: ${finalReason}`);
        }
      }
      
      websocketService.broadcast({ type: 'order_cancelled', order });
      
      res.json({ 
        message: 'ההזמנה בוטלה בהצלחה', 
        order: { id, status: 'cancelled', cancel_reason: finalReason } 
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Cancel order error:', error);
      next(error);
    } finally {
      client.release();
    }
  }

  // ==========================================
  // TAKE ORDER
  // ==========================================
  async takeOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const courierId = req.courier.id;

      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PUBLISHED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'ההזמנה לא זמינה' });
      }

      await client.query(
        'UPDATE orders SET status = $1, courier_id = $2, taken_at = NOW() WHERE id = $3',
        [ORDER_STATUS.TAKEN, courierId, id]
      );

      await client.query(
        'UPDATE couriers SET balance = balance + $1, total_deliveries = total_deliveries + 1 WHERE id = $2',
        [order.courier_payout, courierId]
      );

      await client.query('COMMIT');

      const courierResult = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
      const courier = courierResult.rows[0];

      await whatsappService.sendOrderToCourier(courier.phone, order, 'pickup');
      await whatsappService.announceOrderTaken(order, courier);

      websocketService.broadcast({ type: 'order_taken', order });

      res.json({ message: 'ההזמנה נתפסה בהצלחה', order });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // Quick take (from WhatsApp link)
  async quickTakeOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { orderId } = req.params;
      const { courierId } = req.body;

      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );

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

      await client.query(
        'UPDATE couriers SET balance = balance + $1, total_deliveries = total_deliveries + 1 WHERE id = $2',
        [order.courier_payout, courierId]
      );

      await client.query('COMMIT');

      const courierResult = await pool.query('SELECT * FROM couriers WHERE id = $1', [courierId]);
      const courier = courierResult.rows[0];

      await whatsappService.sendOrderToCourier(courier.phone, order, 'pickup');
      await whatsappService.announceOrderTaken(order, courier);

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

      if (order.status !== ORDER_STATUS.PICKED) {
        return res.status(400).json({ error: 'לא ניתן למסור הזמנה זו' });
      }

      await pool.query(
        'UPDATE orders SET status = $1, delivered_at = NOW() WHERE id = $2',
        [ORDER_STATUS.DELIVERED, id]
      );

      await whatsappService.notifyDelivered(order.sender_phone, order);

      websocketService.broadcast({ type: 'order_delivered', order });

      res.json({ message: 'המשלוח הושלם בהצלחה!' });
    } catch (error) {
      next(error);
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

      if (order.courier_id && order.status !== ORDER_STATUS.CANCELLED) {
        await client.query(
          'UPDATE couriers SET balance = balance - $1 WHERE id = $2',
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
  // CALCULATE PRICING ENDPOINT
  // ==========================================
  async calculatePricingEndpoint(req, res, next) {
    try {
      const { pickupAddress, deliveryAddress, vehicleType } = req.body;

      const distanceKm = await mapsService.calculateDistance(pickupAddress, deliveryAddress);
      const pricing = calculatePricing(distanceKm, vehicleType);

      res.json(pricing);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrdersController();
