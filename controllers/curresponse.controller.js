const pool = require('../config/database');
const mapsService = require('../services/maps.service');
const whatsappService = require('../services/whatsapp.service');
const websocketService = require('../services/websocket.service');
const { generateOrderNumber } = require('../utils/helpers');
const { ORDER_STATUS } = require('../config/constants');

class CurresponseController {
  // ==========================================
  // CREATE CURRESPONSE VIP ORDER
  // ==========================================
  async createVIPOrder(req, res, next) {
    try {
      const {
        orderType,           // 'immediate' or 'planned'
        hospitalId,
        hospitalAddress,
        scheduledPickupTime, // For planned orders
        packageDescription,
        notes
      } = req.body;

      const customerId = req.customer.id;

      console.log('🏥 Creating CURresponse VIP order:', {
        orderType,
        hospitalId,
        scheduledPickupTime
      });

      // Get customer details
      const customerResult = await pool.query(
        'SELECT * FROM customers WHERE id = $1 AND is_vip = true',
        [customerId]
      );

      if (customerResult.rows.length === 0) {
        return res.status(403).json({ error: 'גישה נדחתה - לקוח VIP בלבד' });
      }

      const customer = customerResult.rows[0];
      const pricing = customer.custom_pricing;
      const deliveryAddress = customer.default_delivery_address; // אופנהיימר 4, רחובות

      let distanceKm, totalPrice, finalPickupAddress;
      let intermediateStopLat, intermediateStopLng, distanceLeg1, distanceLeg2;

      if (orderType === 'planned') {
        // ==========================================
        // PLANNED ORDER: Office → Hospital → Rehovot
        // ==========================================
        
        const officeAddress = pricing.planned.intermediateStop.address; // עץ האפרסק 10, יהוד מונוסון
        
        // Leg 1: Office → Hospital
        const leg1Coords = await mapsService.geocodeAddress(officeAddress);
        const hospitalCoords = await mapsService.geocodeAddress(hospitalAddress);
        distanceLeg1 = await mapsService.calculateDistanceByCoords(
          leg1Coords.lat, leg1Coords.lng,
          hospitalCoords.lat, hospitalCoords.lng
        );
        
        // Leg 2: Hospital → Delivery
        const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);
        distanceLeg2 = await mapsService.calculateDistanceByCoords(
          hospitalCoords.lat, hospitalCoords.lng,
          deliveryCoords.lat, deliveryCoords.lng
        );
        
        distanceKm = distanceLeg1 + distanceLeg2;
        
        // Calculate price (waiting fee added later by admin)
        const basePrice = pricing.planned.basePrice;
        const pricePerKm = pricing.planned.pricePerKm;
        const priceBeforeVat = basePrice + (distanceKm * pricePerKm);
        const vat = priceBeforeVat * pricing.planned.vatRate;
        totalPrice = Math.ceil(priceBeforeVat + vat);
        
        finalPickupAddress = officeAddress; // Start from office
        intermediateStopLat = hospitalCoords.lat;
        intermediateStopLng = hospitalCoords.lng;
        
        console.log('✅ Planned order pricing:', {
          leg1: `${distanceLeg1} km (Office → Hospital)`,
          leg2: `${distanceLeg2} km (Hospital → Delivery)`,
          total: `${distanceKm} km`,
          price: `₪${totalPrice} (before waiting fee)`
        });
        
      } else {
        // ==========================================
        // IMMEDIATE ORDER: Hospital → Rehovot
        // ==========================================
        
        const hospitalCoords = await mapsService.geocodeAddress(hospitalAddress);
        const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);
        
        distanceKm = await mapsService.calculateDistanceByCoords(
          hospitalCoords.lat, hospitalCoords.lng,
          deliveryCoords.lat, deliveryCoords.lng
        );
        
        // Calculate price
        const basePrice = pricing.immediate.basePrice;
        const pricePerKm = pricing.immediate.pricePerKm;
        const priceBeforeVat = basePrice + (distanceKm * pricePerKm);
        const vat = priceBeforeVat * pricing.immediate.vatRate;
        totalPrice = Math.ceil(priceBeforeVat + vat);
        
        finalPickupAddress = hospitalAddress; // Start from hospital
        
        console.log('✅ Immediate order pricing:', {
          distance: `${distanceKm} km`,
          price: `₪${totalPrice}`
        });
      }

      // Generate order number
      const orderNumber = generateOrderNumber();
      
      // Get coordinates
      const pickupCoords = await mapsService.geocodeAddress(finalPickupAddress);
      const deliveryCoords = await mapsService.geocodeAddress(deliveryAddress);

      // Insert order
      const result = await pool.query(`
        INSERT INTO orders (
          order_number, status, priority,
          sender_name, sender_phone, 
          pickup_address, pickup_lat, pickup_lng, pickup_notes,
          receiver_name, receiver_phone,
          delivery_address, delivery_lat, delivery_lng, delivery_notes,
          package_description, notes,
          vehicle_type, distance_km, price, vat, commission_rate, commission, courier_payout,
          order_type, scheduled_pickup_time,
          intermediate_stop_address, intermediate_stop_lat, intermediate_stop_lng,
          total_distance_leg1, total_distance_leg2,
          created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
        ) RETURNING *
      `, [
        orderNumber,
        ORDER_STATUS.NEW,
        orderType === 'immediate' ? 'urgent' : 'express',
        customer.name,
        customer.phone,
        finalPickupAddress,
        pickupCoords.lat,
        pickupCoords.lng,
        orderType === 'planned' ? 'איסוף תיק קירור ממשרד M.M.H' : null,
        'קיוריספונס - מעבדה',
        customer.phone,
        deliveryAddress,
        deliveryCoords.lat,
        deliveryCoords.lng,
        'מבחנות רפואיות - דורש קירור',
        packageDescription || 'מבחנות רפואיות מבית חולים',
        notes,
        'motorcycle', // Default vehicle
        distanceKm,
        totalPrice,
        totalPrice * pricing[orderType].vatRate / (1 + pricing[orderType].vatRate),
        25, // 25% commission
        Math.floor(totalPrice * 0.25),
        totalPrice - Math.floor(totalPrice * 0.25),
        orderType,
        scheduledPickupTime || null,
        orderType === 'planned' ? hospitalAddress : null,
        intermediateStopLat,
        intermediateStopLng,
        distanceLeg1 || null,
        distanceLeg2 || null,
        customerId
      ]);

      const order = result.rows[0];

      console.log('✅ VIP order created:', order.order_number);

      // Send WhatsApp to customer (Malka)
      const whatsappMessage = this.buildCustomerWhatsAppMessage(order, orderType, hospitalAddress);
      await whatsappService.sendMessage(customer.phone, whatsappMessage);

      // Notify admin
      websocketService.broadcastToAdmins({
        type: 'vip_order_created',
        order,
        customer: customer.company_name
      });

      res.status(201).json({
        order: {
          orderNumber: order.order_number,
          orderType,
          hospital: hospitalAddress,
          delivery: deliveryAddress,
          scheduledTime: scheduledPickupTime,
          distance: `${distanceKm} km`,
          estimatedPrice: customer.hide_pricing ? null : `₪${totalPrice}`,
          status: 'ההזמנה נוצרה בהצלחה'
        },
        message: orderType === 'immediate' 
          ? 'ההזמנה נוצרה! שליח ייצא בקרוב לבית החולים'
          : `ההזמנה נקבעה ל-${new Date(scheduledPickupTime).toLocaleString('he-IL')}`
      });
    } catch (error) {
      console.error('❌ VIP order creation error:', error);
      next(error);
    }
  }

  // ==========================================
  // UPDATE WAITING FEE (ADMIN ONLY)
  // ==========================================
  async updateWaitingFee(req, res, next) {
    try {
      const { orderId } = req.params;
      const { waitingMinutes } = req.body;

      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'נדרשות הרשאות מנהל' });
      }

      // Get order
      const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      const order = orderResult.rows[0];

      // Get customer pricing
      const customerResult = await pool.query(
        'SELECT custom_pricing FROM customers WHERE phone = $1',
        [order.sender_phone]
      );
      const pricing = customerResult.rows[0].custom_pricing;

      // Calculate waiting fee
      let waitingFee = 0;
      if (waitingMinutes > pricing.planned.waitingFee.freeMinutes) {
        const chargeableMinutes = waitingMinutes - pricing.planned.waitingFee.freeMinutes;
        const chargeableHours = Math.ceil(chargeableMinutes / 60);
        waitingFee = chargeableHours * pricing.planned.waitingFee.pricePerHour;
      }

      // Update order with waiting fee
      const newPrice = order.price + waitingFee;
      const newVat = newPrice * 0.18 / 1.18;
      const newCommission = Math.floor(newPrice * 0.25);
      const newCourierPayout = newPrice - newCommission;

      await pool.query(`
        UPDATE orders SET
          waiting_time_minutes = $1,
          waiting_fee = $2,
          price = $3,
          vat = $4,
          commission = $5,
          courier_payout = $6
        WHERE id = $7
      `, [waitingMinutes, waitingFee, newPrice, newVat, newCommission, newCourierPayout, orderId]);

      console.log('💰 Waiting fee updated:', {
        order: order.order_number,
        waitingMinutes,
        waitingFee: `₪${waitingFee}`,
        finalPrice: `₪${newPrice}`
      });

      // Notify customer
      await whatsappService.sendMessage(
        order.sender_phone,
        `🕒 *עדכון מחיר סופי*\n\n` +
        `הזמנה: ${order.order_number}\n` +
        `זמן המתנה: ${waitingMinutes} דקות\n` +
        `תוספת המתנה: ₪${waitingFee}\n` +
        `מחיר סופי: ₪${newPrice}`
      );

      res.json({
        message: 'תוספת המתנה עודכנה בהצלחה',
        waitingFee,
        finalPrice: newPrice
      });
    } catch (error) {
      console.error('❌ Update waiting fee error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET CUSTOMER ORDERS
  // ==========================================
  async getMyOrders(req, res, next) {
    try {
      const customerId = req.customer.id;

      const result = await pool.query(`
        SELECT 
          o.id,
          o.order_number,
          o.status,
          o.order_type,
          o.pickup_address,
          o.delivery_address,
          o.intermediate_stop_address,
          o.distance_km,
          o.scheduled_pickup_time,
          o.created_at,
          o.delivered_at,
          c.first_name || ' ' || c.last_name as courier_name,
          c.phone as courier_phone
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        LEFT JOIN customers cust ON cust.phone = o.sender_phone
        WHERE cust.id = $1
        ORDER BY o.created_at DESC
        LIMIT 50
      `, [customerId]);

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
      const customerId = req.customer.id;
      const { id } = req.params;

      const result = await pool.query(`
        SELECT 
          o.*,
          c.first_name || ' ' || c.last_name as courier_name,
          c.phone as courier_phone,
          c.vehicle_type
        FROM orders o
        LEFT JOIN couriers c ON o.courier_id = c.id
        LEFT JOIN customers cust ON cust.phone = o.sender_phone
        WHERE o.id = $1 AND cust.id = $2
      `, [id, customerId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      res.json({ order: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // HELPER: Build WhatsApp message
  // ==========================================
  buildCustomerWhatsAppMessage(order, orderType, hospital) {
    let message = `✅ *הזמנה חדשה נוצרה!*\n\n`;
    message += `📦 מספר הזמנה: *${order.order_number}*\n`;
    message += `🏥 בית חולים: ${hospital}\n`;
    message += `📍 מסירה: ${order.delivery_address}\n\n`;
    
    if (orderType === 'immediate') {
      message += `⚡ *הזמנה מיידית*\n`;
      message += `שליח ייצא בקרוב לאיסוף מבית החולים\n\n`;
    } else {
      message += `📅 *הזמנה מתוכננת*\n`;
      message += `שעת איסוף: ${new Date(order.scheduled_pickup_time).toLocaleString('he-IL')}\n`;
      message += `המסלול: משרד M.M.H → בית החולים → רחובות\n\n`;
    }
    
    message += `📱 תקבלי עדכונים בכל שלב!\n`;
    message += `🔗 מעקב: ${process.env.PUBLIC_URL}/track/${order.order_number}`;
    
    return message;
  }
}

module.exports = new CurresponseController();
