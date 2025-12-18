const pool = require('../config/database');

class CouriersController {
  // ==========================================
  // REGISTER COURIER
  // ==========================================
  async registerCourier(req, res, next) {
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

      // Validate required fields
      if (!firstName || !lastName || !idNumber || !phone || !vehicleType) {
        return res.status(400).json({ error: 'חסרים שדות חובה' });
      }

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
      console.error('Register courier error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET COURIER PROFILE
  // ==========================================
  async getCourierProfile(req, res, next) {
    try {
      const courierId = req.user.id;

      const result = await pool.query(
        'SELECT * FROM couriers WHERE id = $1',
        [courierId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'שליח לא נמצא' });
      }

      const courier = result.rows[0];

      res.json({
        courier: {
          id: courier.id,
          firstName: courier.first_name,
          lastName: courier.last_name,
          idNumber: courier.id_number,
          phone: courier.phone,
          email: courier.email,
          address: courier.address,
          age: courier.age,
          gender: courier.gender,
          workArea: courier.work_area,
          vehicleType: courier.vehicle_type,
          vehiclePlate: courier.vehicle_plate,
          status: courier.status,
          rating: parseFloat(courier.rating),
          totalDeliveries: courier.total_deliveries,
          totalEarned: parseFloat(courier.total_earned),
          balance: parseFloat(courier.balance)
        }
      });
    } catch (error) {
      console.error('Get courier profile error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET AVAILABLE ORDERS
  // ==========================================
  async getAvailableOrders(req, res, next) {
    try {
      const result = await pool.query(`
        SELECT * FROM orders 
        WHERE status = 'published' 
        ORDER BY created_at DESC
      `);

      res.json({ orders: result.rows });
    } catch (error) {
      console.error('Get available orders error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET MY ORDERS
  // ==========================================
  async getMyOrders(req, res, next) {
    try {
      const courierId = req.user.id;
      const { status, limit = 50 } = req.query;

      let query = 'SELECT * FROM orders WHERE courier_id = $1';
      const params = [courierId];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);

      res.json({ orders: result.rows });
    } catch (error) {
      console.error('Get my orders error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET MY STATISTICS
  // ==========================================
  async getMyStatistics(req, res, next) {
    try {
      const courierId = req.user.id;

      const result = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM orders WHERE courier_id = $1 AND status = 'delivered' AND delivered_at >= CURRENT_DATE) as today_deliveries,
          (SELECT COUNT(*) FROM orders WHERE courier_id = $1 AND status = 'delivered' AND delivered_at >= CURRENT_DATE - INTERVAL '7 days') as week_deliveries,
          (SELECT COUNT(*) FROM orders WHERE courier_id = $1 AND status = 'delivered' AND delivered_at >= CURRENT_DATE - INTERVAL '30 days') as month_deliveries,
          (SELECT balance FROM couriers WHERE id = $1) as balance
      `, [courierId]);

      res.json({ 
        statistics: result.rows[0],
        balance: result.rows[0].balance
      });
    } catch (error) {
      console.error('Get statistics error:', error);
      next(error);
    }
  }

  // ==========================================
  // UPDATE LOCATION (תיקון!)
  // ==========================================
  async updateLocation(req, res, next) {
    try {
      const courierId = req.user.id;
      const { latitude, longitude, accuracy, heading, speed } = req.body;

      // Update courier current location
      await pool.query(`
        UPDATE couriers 
        SET current_lat = $1, current_lng = $2, last_location_update = NOW(), is_online = true
        WHERE id = $3
      `, [latitude, longitude, courierId]);

      // Insert location history (ללא UNIQUE constraint)
      await pool.query(`
        INSERT INTO courier_locations (courier_id, latitude, longitude, accuracy, heading, speed)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [courierId, latitude, longitude, accuracy, heading, speed]);

      res.json({ message: 'מיקום עודכן' });
    } catch (error) {
      console.error('Update location error:', error);
      // Don't fail the request if location update fails
      res.json({ message: 'מיקום עודכן' });
    }
  }

  // ==========================================
  // GET ALL COURIERS (ADMIN)
  // ==========================================
  async getCouriers(req, res, next) {
    try {
      const { status, vehicleType } = req.query;

      let query = 'SELECT * FROM couriers WHERE 1=1';
      const params = [];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (vehicleType) {
        params.push(vehicleType);
        query += ` AND vehicle_type = $${params.length}`;
      }

      query += ' ORDER BY created_at DESC';

      const result = await pool.query(query, params);

      res.json({ couriers: result.rows });
    } catch (error) {
      console.error('Get couriers error:', error);
      next(error);
    }
  }

  // ==========================================
  // GET COURIER BY ID (ADMIN)
  // ==========================================
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
      console.error('Get courier by ID error:', error);
      next(error);
    }
  }

  // ==========================================
  // UPDATE COURIER STATUS (ADMIN)
  // ==========================================
  async updateCourierStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'inactive', 'blocked'].includes(status)) {
        return res.status(400).json({ error: 'סטטוס לא תקין' });
      }

      await pool.query(
        'UPDATE couriers SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, id]
      );

      res.json({ message: 'סטטוס עודכן בהצלחה' });
    } catch (error) {
      console.error('Update courier status error:', error);
      next(error);
    }
  }

  // ==========================================
  // DELETE COURIER (ADMIN)
  // ==========================================
  async deleteCourier(req, res, next) {
    try {
      const { id } = req.params;

      // Check if courier has active orders
      const activeOrders = await pool.query(
        'SELECT id FROM orders WHERE courier_id = $1 AND status IN ($2, $3)',
        [id, 'taken', 'picked']
      );

      if (activeOrders.rows.length > 0) {
        return res.status(400).json({ error: 'לא ניתן למחוק שליח עם משלוחים פעילים' });
      }

      await pool.query('DELETE FROM couriers WHERE id = $1', [id]);

      res.json({ message: 'שליח נמחק בהצלחה' });
    } catch (error) {
      console.error('Delete courier error:', error);
      next(error);
    }
  }
}

module.exports = new CouriersController();
