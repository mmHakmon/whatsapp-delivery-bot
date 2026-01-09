const pool = require('../config/database');
const { calculatePricing } = require('../config/pricing');
const { ORDER_STATUS } = require('../config/constants');
const mapsService = require('../services/maps.service');
const whatsappService = require('../services/whatsapp.service');
const websocketService = require('../services/websocket.service');
const { generateOrderNumber } = require('../utils/helpers');

class OrdersController {
  // ==========================================
  // CREATE ORDER (ADMIN/AGENT)
  // ==========================================
  async createOrder(req, res, next) {
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
          price, vat, commission_rate, commission, courier_payout,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        RETURNING *
      `, [
        orderNumber, ORDER_STATUS.NEW, priority,
        senderName, senderPhone, pickupAddress, pickupCoords.lat, pickupCoords.lng, pickupNotes,
        receiverName, receiverPhone, deliveryAddress, deliveryCoords.lat, deliveryCoords.lng, deliveryNotes,
        packageDescription, notes, vehicleType, pricing.distanceKm,
        pricing.totalPrice, pricing.vat, pricing.commissionRate, pricing.commission, pricing.courierPayout,
        req.user.id
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

      // Calculate distance using Google Maps
      const distanceKm = await mapsService.calculateDistance(pickupAddress, deliveryAddress);
      
      // Calculate pricing
      const pricing = calculatePricing(distanceKm, vehicleType);

      // Get coordinates
      const pickupCoords = await mapsService.geocodeAddress(pickupAddress);
      const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);

      // Generate order number
      const orderNumber = generateOrderNumber();

      // Insert order - created_by is NULL for public orders
      const result = await pool.query(`
        INSERT INTO orders (
          order_number, status, priority,
          sender_name, sender_phone, pickup_address, pickup_lat, pickup_lng, pickup_notes,
          receiver_name, receiver_phone, delivery_address, delivery_lat, delivery_lng, delivery_notes,
          package_description, notes, vehicle_type, distance_km,
          price, vat, commission_rate, commission, courier_payout,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NULL)
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
      } catch (whatsappError) {
        console.error('WhatsApp error:', whatsappError);
        // Continue even if WhatsApp fails
      }

      // Notify admins via WebSocket
      try {
        websocketService.notifyNewOrder(order);
      } catch (wsError) {
        console.error('WebSocket error:', wsError);
        // Continue even if WebSocket fails
      }

      res.status(201).json({ 
        order, 
        pricing,
        message: 'הזמנה נוצרה בהצלחה! המנהלים יאשרו אותה בקרוב.'
      });
    } catch (error) {
      console.error('Create public order error:', error);
      next(error);
    }
  }

  // Get all orders
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

  // Get order by order number (public)
  async getOrderByNumber(req, res, next) {
    try {
      const { orderNumber } = req.params;

      const result = await pool.query(`
        SELECT o.*,
               c.first_name as courier_first_name,
               c.last_name as courier_last_name,
               c.phone as courier_phone,
               c.vehicle_type as courier_vehicle_type
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

  // Publish order
  async publishOrder(req, res, next) {
    try {
      const { id } = req.params;

      // Get order
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.NEW) {
        return res.status(400).json({ error: 'ניתן לפרסם רק הזמנות חדשות' });
      }

      // Update status
      const result = await pool.query(
        'UPDATE orders SET status = $1, published_at = NOW() WHERE id = $2 RETURNING *',
        [ORDER_STATUS.PUBLISHED, id]
      );

      const updatedOrder = result.rows[0];

      // Send to WhatsApp group
      await whatsappService.publishOrderToGroup(updatedOrder);

      // Notify couriers via WebSocket
      websocketService.broadcastToCouriers({
        type: 'new_available_order',
        order: updatedOrder
      });

      res.json({ 
        order: updatedOrder,
        message: 'הזמנה פורסמה בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Courier takes order
  async takeOrder(req, res, next) {
    try {
      const { id } = req.params;
      const courierId = req.courier.id;

      // Get order
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PUBLISHED) {
        return res.status(400).json({ error: 'ההזמנה כבר נתפסה' });
      }

      // Update order
      const result = await pool.query(
        'UPDATE orders SET status = $1, courier_id = $2, taken_at = NOW() WHERE id = $3 RETURNING *',
        [ORDER_STATUS.TAKEN, courierId, id]
      );

      const updatedOrder = result.rows[0];

      // Get courier details
      const courierResult = await pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [courierId]
      );
      const courier = courierResult.rows[0];

      // Send WhatsApp to courier with pickup details
      await whatsappService.sendOrderToCourier(courier.phone, updatedOrder, 'pickup');

      // Send WhatsApp to customer
      await whatsappService.notifyCourierAssigned(order.sender_phone, updatedOrder, courier);

      // Announce to group that order was taken
      await whatsappService.announceOrderTaken(updatedOrder, courier);

      // Notify via WebSocket
      websocketService.notifyOrderTaken(updatedOrder);

      res.json({ 
        order: updatedOrder,
        message: 'ההזמנה נתפסה בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Update order status to PICKED
  async pickupOrder(req, res, next) {
    try {
      const { id } = req.params;
      const courierId = req.courier.id;

      // Get order
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND courier_id = $2',
        [id, courierId]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.TAKEN) {
        return res.status(400).json({ error: 'סטטוס הזמנה לא תקין' });
      }

      // Update status
      const result = await pool.query(
        'UPDATE orders SET status = $1, picked_at = NOW() WHERE id = $2 RETURNING *',
        [ORDER_STATUS.PICKED, id]
      );

      const updatedOrder = result.rows[0];

      // Get courier details
      const courierResult = await pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [courierId]
      );
      const courier = courierResult.rows[0];

      // Send WhatsApp to courier with delivery details
      await whatsappService.sendOrderToCourier(courier.phone, updatedOrder, 'delivery');

      // Send WhatsApp to customer
      await whatsappService.notifyPackagePicked(order.sender_phone, updatedOrder);

      // Notify via WebSocket
      websocketService.notifyOrderPicked(updatedOrder);

      res.json({ 
        order: updatedOrder,
        message: 'החבילה נאספה בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Deliver order
  async deliverOrder(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const courierId = req.courier.id;

      // Get order
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND courier_id = $2',
        [id, courierId]
      );

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PICKED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'סטטוס הזמנה לא תקין' });
      }

      // Update order status
      const result = await client.query(
        'UPDATE orders SET status = $1, delivered_at = NOW() WHERE id = $2 RETURNING *',
        [ORDER_STATUS.DELIVERED, id]
      );

      const updatedOrder = result.rows[0];

      // Update courier balance and stats
      await client.query(`
        UPDATE couriers 
        SET balance = balance + $1,
            total_deliveries = total_deliveries + 1,
            total_earned = total_earned + $1
        WHERE id = $2
      `, [order.courier_payout, courierId]);

      await client.query('COMMIT');

      // Send WhatsApp to customer
      await whatsappService.notifyDelivered(order.sender_phone, updatedOrder);

      // Notify via WebSocket
      websocketService.notifyOrderDelivered(updatedOrder);

      res.json({ 
        order: updatedOrder,
        earned: order.courier_payout,
        message: 'החבילה נמסרה בהצלחה! הכסף נוסף ליתרה שלך'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // Cancel order
// Cancel order
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
        await client.query('UPDATE couriers SET balance = balance - $1 WHERE id = $2', [order.courier_payout, order.courier_id]);
      }
      
      await client.query('COMMIT');
      
      if (order.courier_id) {
        const courierResult = await pool.query('SELECT phone FROM couriers WHERE id = $1', [order.courier_id]);
        if (courierResult.rows.length > 0) {
          await whatsappService.sendMessage(courierResult.rows[0].phone, `❌ *משלוח בוטל*\n\nמספר הזמנה: ${order.order_number}\nסיבה: ${finalReason}`);
        }
      }
      
      websocketService.broadcast({ type: 'order_cancelled', order });
      
      res.json({ message: 'ההזמנה בוטלה בהצלחה', order: { id, status: 'cancelled', cancel_reason: finalReason } });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Cancel order error:', error);
      next(error);
    } finally {
      client.release();
    }
  }
      // Notify via WebSocket
      websocketService.broadcast({
        type: 'order_cancelled',
        order
      });

      res.json({ 
        order,
        message: 'ההזמנה בוטלה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get statistics
  async getStatistics(req, res, next) {
    try {
      const { days = 30 } = req.query;

      const stats = await pool.query(`
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
          COALESCE(SUM(courier_payout) FILTER (WHERE status = 'delivered'), 0) as total_paid_to_couriers,
          COALESCE(AVG(distance_km), 0) as avg_distance
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '${days} days'
      `);

      res.json({ statistics: stats.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // CALCULATE PRICING (PUBLIC)
  // ==========================================
  async calculatePricingEndpoint(req, res, next) {
    try {
      const { pickupAddress, deliveryAddress, vehicleType = 'motorcycle' } = req.body;

      if (!pickupAddress || !deliveryAddress) {
        return res.status(400).json({ error: 'כתובות נדרשות' });
      }

      // Calculate distance
      const distanceKm = await mapsService.calculateDistance(pickupAddress, deliveryAddress);
      
      // Calculate pricing
      const pricing = calculatePricing(distanceKm, vehicleType);

      res.json({ pricing });
    } catch (error) {
      console.error('Calculate pricing error:', error);
      next(error);
    }
  }

  // ==========================================
  // QUICK TAKE ORDER (WhatsApp Link)
  // ==========================================
  // ==========================================
  // DELETE ORDER (ADMIN ONLY)
  // ==========================================
  async deleteOrder(req, res, next) {
    try {
      const { id } = req.params;
      const checkResult = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: "הזמנה לא נמצאה" });
      }
      const order = checkResult.rows[0];
      if (order.status === "taken" || order.status === "picked") {
        return res.status(400).json({ error: "לא ניתן למחוק הזמנה פעילה" });
      }
      await pool.query("DELETE FROM orders WHERE id = $1", [id]);
      websocketService.broadcast({ type: "order_deleted", orderId: id });
      res.json({ success: true, message: "ההזמנה נמחקה", orderId: id });
    } catch (error) {
      next(error);
    }
  }

  async quickTakeOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const { courierId } = req.body;

      if (!courierId) {
        return res.status(400).json({ error: 'נדרש מזהה שליח' });
      }

      // Verify courier exists and is active
      const courierResult = await pool.query(
        'SELECT * FROM couriers WHERE id = $1 AND status = $2',
        [courierId, 'active']
      );

      if (courierResult.rows.length === 0) {
        return res.status(403).json({ error: 'שליח לא פעיל' });
      }

      const courier = courierResult.rows[0];

      // Get order
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      if (order.status !== ORDER_STATUS.PUBLISHED) {
        return res.status(400).json({ error: 'ההזמנה כבר נתפסה או לא זמינה' });
      }

      // Update order
      const result = await pool.query(
        'UPDATE orders SET status = $1, courier_id = $2, taken_at = NOW() WHERE id = $3 RETURNING *',
        [ORDER_STATUS.TAKEN, courierId, orderId]
      );

      const updatedOrder = result.rows[0];

      // Send WhatsApp to courier with pickup details
      await whatsappService.sendOrderToCourier(courier.phone, updatedOrder, 'pickup');

      // Send WhatsApp to customer
      await whatsappService.notifyCourierAssigned(order.sender_phone, updatedOrder, courier);

      // Announce to group
      await whatsappService.announceOrderTaken(updatedOrder, courier);

      // Notify via WebSocket
      websocketService.notifyOrderTaken(updatedOrder);

      res.json({ 
        success: true,
        order: updatedOrder,
        message: `✅ ${courier.first_name} ${courier.last_name} תפס את המשלוח!`
      });
    } catch (error) {
      console.error('Quick take order error:', error);
      next(error);
    }
  }
}

module.exports = new OrdersController();



