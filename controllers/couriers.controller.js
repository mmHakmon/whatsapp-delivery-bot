const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const { COURIER_STATUS } = require('../config/constants');

class CouriersController {
  // Register new courierasync registerCourier(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      idNumber,
      phone,
      email,
      address,
      age,
      gender,
      workArea,
      vehicleType,
      vehiclePlate
    } = req.body;

    // Check if courier already exists
    const existingCourier = await pool.query(
      'SELECT id FROM couriers WHERE id_number = $1 OR phone = $2',
      [idNumber, phone]
    );

    if (existingCourier.rows.length > 0) {
      return res.status(409).json({ error: 'שליח כבר קיים במערכת' });
    }

    // Insert new courier
    const result = await pool.query(`
      INSERT INTO couriers (
        first_name, last_name, id_number, phone, email, address,
        age, gender, work_area, vehicle_type, vehicle_plate, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      firstName, lastName, idNumber, phone, email, address,
      age, gender, workArea, vehicleType, vehiclePlate, 'inactive'
    ]);

    const courier = result.rows[0];

    res.status(201).json({
      courier: {
        id: courier.id,
        firstName: courier.first_name,
        lastName: courier.last_name,
        phone: courier.phone
      },
      message: 'בקשתך נשלחה בהצלחה! נחזור אליך בהקדם'
    });
  } catch (error) {
    next(error);
  }
}

  // Get all couriers (admin)
  async getCouriers(req, res, next) {
    try {
      const { status, limit = 100, offset = 0 } = req.query;

      let query = 'SELECT * FROM couriers';
      const params = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ couriers: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Get courier by ID
  async getCourierById(req, res, next) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'שליח לא נמצא' });
      }

      res.json({ courier: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // Get courier profile (self)
  async getMyProfile(req, res, next) {
    try {
      const courierId = req.courier.id;

      const result = await pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [courierId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'פרופיל לא נמצא' });
      }

      res.json({ courier: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }

  // Update courier profile
  async updateProfile(req, res, next) {
    try {
      const courierId = req.courier.id;
      const {
        email,
        address,
        vehicleType,
        vehiclePlate
      } = req.body;

      const result = await pool.query(`
        UPDATE couriers 
        SET email = COALESCE($1, email),
            address = COALESCE($2, address),
            vehicle_type = COALESCE($3, vehicle_type),
            vehicle_plate = COALESCE($4, vehicle_plate),
            updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `, [email, address, vehicleType, vehiclePlate, courierId]);

      res.json({ 
        courier: result.rows[0],
        message: 'הפרופיל עודכן בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get courier orders
  async getMyCourierOrders(req, res, next) {
    try {
      const courierId = req.courier.id;
      const { status, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM orders WHERE courier_id = $1';
      const params = [courierId];

      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ orders: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Get available orders for courier
  async getAvailableOrders(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT * FROM orders 
        WHERE status = 'published'
        ORDER BY created_at DESC
        LIMIT 20
      `);

      res.json({ orders: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Get courier statistics
  async getMyStatistics(req, res, next) {
    try {
      const courierId = req.courier.id;
      const { days = 30 } = req.query;

      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_deliveries,
          COALESCE(SUM(courier_payout), 0) as total_earned,
          COALESCE(AVG(distance_km), 0) as avg_distance,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as today_deliveries,
          COALESCE(SUM(courier_payout) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day'), 0) as today_earned,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as week_deliveries,
          COALESCE(SUM(courier_payout) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as week_earned,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as month_deliveries,
          COALESCE(SUM(courier_payout) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) as month_earned
        FROM orders
        WHERE courier_id = $1 AND status = 'delivered'
      `, [courierId]);

      // Get current balance
      const courierResult = await pool.query(
        'SELECT balance, rating FROM couriers WHERE id = $1',
        [courierId]
      );

      res.json({ 
        statistics: stats.rows[0],
        balance: parseFloat(courierResult.rows[0].balance),
        rating: parseFloat(courierResult.rows[0].rating)
      });
    } catch (error) {
      next(error);
    }
  }

  // Block/Unblock courier (admin)
  async toggleCourierStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'blocked'].includes(status)) {
        return res.status(400).json({ error: 'סטטוס לא תקין' });
      }

      const result = await pool.query(
        'UPDATE couriers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'שליח לא נמצא' });
      }

      res.json({ 
        courier: result.rows[0],
        message: status === 'active' ? 'השליח הופעל' : 'השליח נחסם'
      });
    } catch (error) {
      next(error);
    }
  }

  // Update courier location
  async updateLocation(req, res, next) {
    try {
      const courierId = req.courier.id;
      const { latitude, longitude, accuracy, heading, speed } = req.body;

      await pool.query(`
        INSERT INTO courier_locations (courier_id, latitude, longitude, accuracy, heading, speed, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (courier_id) 
        DO UPDATE SET 
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          accuracy = EXCLUDED.accuracy,
          heading = EXCLUDED.heading,
          speed = EXCLUDED.speed,
          timestamp = EXCLUDED.timestamp
      `, [courierId, latitude, longitude, accuracy, heading, speed]);

      // Update courier's last location in main table
      await pool.query(`
        UPDATE couriers 
        SET current_lat = $1, 
            current_lng = $2,
            last_location_update = NOW(),
            is_online = true
        WHERE id = $3
      `, [latitude, longitude, courierId]);

      // Broadcast location update via WebSocket
      const websocketService = require('../services/websocket.service');
      websocketService.updateCourierLocation(courierId, {
        latitude,
        longitude,
        accuracy,
        heading,
        speed
      });

      res.json({ message: 'מיקום עודכן' });
    } catch (error) {
      next(error);
    }
  }

  // Get courier earnings breakdown
  async getEarningsBreakdown(req, res, next) {
    try {
      const courierId = req.courier.id;
      const { startDate, endDate } = req.query;

      let query = `
        SELECT 
          DATE(delivered_at) as date,
          COUNT(*) as deliveries,
          SUM(courier_payout) as earned,
          AVG(distance_km) as avg_distance
        FROM orders
        WHERE courier_id = $1 AND status = 'delivered'
      `;
      
      const params = [courierId];

      if (startDate) {
        query += ` AND delivered_at >= $${params.length + 1}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND delivered_at <= $${params.length + 1}`;
        params.push(endDate);
      }

      query += ' GROUP BY DATE(delivered_at) ORDER BY date DESC';

      const result = await pool.query(query, params);

      res.json({ breakdown: result.rows });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CouriersController();