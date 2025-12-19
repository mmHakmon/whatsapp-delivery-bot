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
  // ==========================================
  // ADVANCED STATISTICS & ANALYTICS
  // ==========================================

  async getAdvancedStatistics(req, res, next) {
    try {
      const courierId = req.user.id;

      // 1. הכנסות לפי יום (7 ימים אחרונים)
      const dailyEarnings = await pool.query(`
        SELECT 
          DATE(completed_at) as date,
          COUNT(*) as deliveries,
          COALESCE(SUM(courier_payout), 0) as earnings
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(completed_at)
        ORDER BY date ASC
      `, [courierId]);

      // 2. משלוחים לפי שעה (היום)
      const hourlyDeliveries = await pool.query(`
        SELECT 
          EXTRACT(HOUR FROM completed_at) as hour,
          COUNT(*) as deliveries
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND DATE(completed_at) = CURRENT_DATE
        GROUP BY EXTRACT(HOUR FROM completed_at)
        ORDER BY hour ASC
      `, [courierId]);

      // 3. סטטיסטיקות כלליות
      const generalStats = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE DATE(completed_at) = CURRENT_DATE) as today_deliveries,
          COUNT(*) FILTER (WHERE completed_at >= date_trunc('week', CURRENT_DATE)) as week_deliveries,
          COUNT(*) FILTER (WHERE completed_at >= date_trunc('month', CURRENT_DATE)) as month_deliveries,
          COUNT(*) as total_deliveries,
          COALESCE(SUM(courier_payout) FILTER (WHERE DATE(completed_at) = CURRENT_DATE), 0) as today_earnings,
          COALESCE(SUM(courier_payout) FILTER (WHERE completed_at >= date_trunc('week', CURRENT_DATE)), 0) as week_earnings,
          COALESCE(SUM(courier_payout) FILTER (WHERE completed_at >= date_trunc('month', CURRENT_DATE)), 0) as month_earnings,
          COALESCE(AVG(courier_payout), 0) as avg_earning_per_delivery,
          COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))/60), 0) as avg_delivery_time_minutes
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
      `, [courierId]);

      // 4. יתרה ותשלומים ממתינים
      const balance = await pool.query(`
        SELECT 
          COALESCE(pending_payout, 0) as pending_payout,
          COALESCE(total_earnings, 0) as total_earnings
        FROM couriers
        WHERE id = $1
      `, [courierId]);

      // 5. אחוז השלמה
      const completionRate = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'delivered') as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) as total_accepted
        FROM orders
        WHERE courier_id = $1 
        AND status IN ('delivered', 'cancelled')
      `, [courierId]);

      const stats = generalStats.rows[0];
      const balanceData = balance.rows[0];
      const completion = completionRate.rows[0];
      
      const completionPercentage = completion.total_accepted > 0 
        ? ((completion.completed / completion.total_accepted) * 100).toFixed(1)
        : 100;

      res.json({
        dailyEarnings: dailyEarnings.rows,
        hourlyDeliveries: hourlyDeliveries.rows,
        statistics: {
          today_deliveries: parseInt(stats.today_deliveries),
          week_deliveries: parseInt(stats.week_deliveries),
          month_deliveries: parseInt(stats.month_deliveries),
          total_deliveries: parseInt(stats.total_deliveries),
          today_earnings: parseFloat(stats.today_earnings),
          week_earnings: parseFloat(stats.week_earnings),
          month_earnings: parseFloat(stats.month_earnings),
          avg_earning_per_delivery: parseFloat(stats.avg_earning_per_delivery),
          avg_delivery_time_minutes: parseFloat(stats.avg_delivery_time_minutes),
          completion_percentage: parseFloat(completionPercentage),
          cancelled_count: parseInt(completion.cancelled)
        },
        balance: {
          pending_payout: parseFloat(balanceData.pending_payout),
          total_earnings: parseFloat(balanceData.total_earnings)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // GOALS & TARGETS
  // ==========================================

  async getGoals(req, res, next) {
    try {
      const courierId = req.user.id;

      // יעדים קבועים (אפשר לשמור בטבלה או להגדיר כאן)
      const DAILY_GOAL = 15;
      const WEEKLY_GOAL = 80;
      const MONTHLY_GOAL = 300;
      const DAILY_EARNINGS_GOAL = 800;
      const WEEKLY_EARNINGS_GOAL = 4500;

      // משלוחים היום
      const todayProgress = await pool.query(`
        SELECT 
          COUNT(*) as completed,
          COALESCE(SUM(courier_payout), 0) as earnings
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND DATE(completed_at) = CURRENT_DATE
      `, [courierId]);

      // משלוחים השבוע
      const weekProgress = await pool.query(`
        SELECT 
          COUNT(*) as completed,
          COALESCE(SUM(courier_payout), 0) as earnings
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('week', CURRENT_DATE)
      `, [courierId]);

      // משלוחים החודש
      const monthProgress = await pool.query(`
        SELECT 
          COUNT(*) as completed
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('month', CURRENT_DATE)
      `, [courierId]);

      const today = todayProgress.rows[0];
      const week = weekProgress.rows[0];
      const month = monthProgress.rows[0];

      res.json({
        daily: {
          deliveries: {
            current: parseInt(today.completed),
            goal: DAILY_GOAL,
            percentage: Math.min((parseInt(today.completed) / DAILY_GOAL) * 100, 100).toFixed(0)
          },
          earnings: {
            current: parseFloat(today.earnings),
            goal: DAILY_EARNINGS_GOAL,
            percentage: Math.min((parseFloat(today.earnings) / DAILY_EARNINGS_GOAL) * 100, 100).toFixed(0)
          }
        },
        weekly: {
          deliveries: {
            current: parseInt(week.completed),
            goal: WEEKLY_GOAL,
            percentage: Math.min((parseInt(week.completed) / WEEKLY_GOAL) * 100, 100).toFixed(0)
          },
          earnings: {
            current: parseFloat(week.earnings),
            goal: WEEKLY_EARNINGS_GOAL,
            percentage: Math.min((parseFloat(week.earnings) / WEEKLY_EARNINGS_GOAL) * 100, 100).toFixed(0)
          }
        },
        monthly: {
          deliveries: {
            current: parseInt(month.completed),
            goal: MONTHLY_GOAL,
            percentage: Math.min((parseInt(month.completed) / MONTHLY_GOAL) * 100, 100).toFixed(0)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // RANKING & LEADERBOARD
  // ==========================================

  async getRanking(req, res, next) {
    try {
      const courierId = req.user.id;

      // דירוג לפי משלוחים החודש
      const ranking = await pool.query(`
        WITH courier_stats AS (
          SELECT 
            c.id,
            c.first_name,
            c.last_name,
            COUNT(o.id) as month_deliveries,
            COALESCE(c.rating, 0) as rating
          FROM couriers c
          LEFT JOIN orders o ON o.courier_id = c.id 
            AND o.status = 'delivered'
            AND o.completed_at >= date_trunc('month', CURRENT_DATE)
          WHERE c.status = 'active'
          GROUP BY c.id, c.first_name, c.last_name, c.rating
        ),
        ranked_couriers AS (
          SELECT 
            *,
            ROW_NUMBER() OVER (ORDER BY month_deliveries DESC, rating DESC) as rank
          FROM courier_stats
        )
        SELECT 
          rc.*,
          (SELECT COUNT(*) FROM ranked_couriers) as total_couriers
        FROM ranked_couriers rc
        WHERE rc.id = $1
      `, [courierId]);

      if (ranking.rows.length === 0) {
        return res.json({
          rank: null,
          totalCouriers: 0,
          monthDeliveries: 0,
          rating: 0
        });
      }

      const myRank = ranking.rows[0];

      // Top 5 שליחים
      const topCouriers = await pool.query(`
        SELECT 
          c.id,
          c.first_name,
          c.last_name,
          COUNT(o.id) as month_deliveries,
          COALESCE(c.rating, 0) as rating,
          ROW_NUMBER() OVER (ORDER BY COUNT(o.id) DESC, c.rating DESC) as rank
        FROM couriers c
        LEFT JOIN orders o ON o.courier_id = c.id 
          AND o.status = 'delivered'
          AND o.completed_at >= date_trunc('month', CURRENT_DATE)
        WHERE c.status = 'active'
        GROUP BY c.id, c.first_name, c.last_name, c.rating
        ORDER BY month_deliveries DESC, rating DESC
        LIMIT 5
      `);

      res.json({
        myRank: {
          rank: parseInt(myRank.rank),
          totalCouriers: parseInt(myRank.total_couriers),
          monthDeliveries: parseInt(myRank.month_deliveries),
          rating: parseFloat(myRank.rating),
          firstName: myRank.first_name,
          lastName: myRank.last_name
        },
        topCouriers: topCouriers.rows.map(c => ({
          rank: parseInt(c.rank),
          name: `${c.first_name} ${c.last_name}`,
          monthDeliveries: parseInt(c.month_deliveries),
          rating: parseFloat(c.rating),
          isMe: c.id === courierId
        }))
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // EARNINGS PROJECTION
  // ==========================================

  async getEarningsProjection(req, res, next) {
    try {
      const courierId = req.user.id;

      // הכנסות עד עכשיו החודש
      const monthEarnings = await pool.query(`
        SELECT 
          COALESCE(SUM(courier_payout), 0) as total,
          COUNT(*) as deliveries
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('month', CURRENT_DATE)
      `, [courierId]);

      const current = monthEarnings.rows[0];
      const currentTotal = parseFloat(current.total);
      const currentDeliveries = parseInt(current.deliveries);

      // כמה ימים עברו בחודש
      const daysInMonth = await pool.query(`
        SELECT 
          EXTRACT(DAY FROM date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day') as days_in_month,
          EXTRACT(DAY FROM CURRENT_DATE) as current_day
      `);

      const daysData = daysInMonth.rows[0];
      const totalDays = parseInt(daysData.days_in_month);
      const currentDay = parseInt(daysData.current_day);
      const remainingDays = totalDays - currentDay;

      // חישוב קצב יומי
      const dailyRate = currentDay > 0 ? currentTotal / currentDay : 0;
      
      // חישוב צפי לסוף החודש
      const projection = currentTotal + (dailyRate * remainingDays);

      // יום הכי טוב
      const bestDay = await pool.query(`
        SELECT 
          DATE(completed_at) as date,
          COALESCE(SUM(courier_payout), 0) as earnings,
          COUNT(*) as deliveries
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('month', CURRENT_DATE)
        GROUP BY DATE(completed_at)
        ORDER BY earnings DESC
        LIMIT 1
      `, [courierId]);

      const best = bestDay.rows[0] || { earnings: 0, deliveries: 0, date: null };

      res.json({
        currentMonth: {
          total: currentTotal,
          deliveries: currentDeliveries,
          daysElapsed: currentDay,
          daysRemaining: remainingDays
        },
        projection: {
          dailyRate: parseFloat(dailyRate.toFixed(2)),
          projectedTotal: parseFloat(projection.toFixed(2)),
          projectedDeliveries: Math.round((currentDeliveries / currentDay) * totalDays)
        },
        bestDay: {
          date: best.date,
          earnings: parseFloat(best.earnings || 0),
          deliveries: parseInt(best.deliveries || 0)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // PERFORMANCE METRICS
  // ==========================================

  async getPerformanceMetrics(req, res, next) {
    try {
      const courierId = req.user.id;

      // זמנים וביצועים
      const performance = await pool.query(`
        SELECT 
          COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))/60), 0) as avg_time,
          COALESCE(MIN(EXTRACT(EPOCH FROM (completed_at - accepted_at))/60), 0) as fastest_time,
          COALESCE(MAX(EXTRACT(EPOCH FROM (completed_at - accepted_at))/60), 0) as slowest_time,
          COUNT(*) as total_delivered
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('month', CURRENT_DATE)
      `, [courierId]);

      // פיצול לפי שעות
      const timeDistribution = await pool.query(`
        SELECT 
          CASE 
            WHEN EXTRACT(HOUR FROM completed_at) BETWEEN 6 AND 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM completed_at) BETWEEN 12 AND 15 THEN 'noon'
            WHEN EXTRACT(HOUR FROM completed_at) BETWEEN 16 AND 21 THEN 'evening'
            ELSE 'night'
          END as period,
          COUNT(*) as deliveries,
          COALESCE(SUM(courier_payout), 0) as earnings
        FROM orders
        WHERE courier_id = $1 
        AND status = 'delivered'
        AND completed_at >= date_trunc('month', CURRENT_DATE)
        GROUP BY period
      `, [courierId]);

      const perf = performance.rows[0];
      const total = parseInt(perf.total_delivered);

      const distribution = {
        morning: { deliveries: 0, earnings: 0, percentage: 0 },
        noon: { deliveries: 0, earnings: 0, percentage: 0 },
        evening: { deliveries: 0, earnings: 0, percentage: 0 },
        night: { deliveries: 0, earnings: 0, percentage: 0 }
      };

      timeDistribution.rows.forEach(row => {
        const deliveries = parseInt(row.deliveries);
        distribution[row.period] = {
          deliveries,
          earnings: parseFloat(row.earnings),
          percentage: total > 0 ? ((deliveries / total) * 100).toFixed(0) : 0
        };
      });

      res.json({
        timing: {
          avgTime: parseFloat(perf.avg_time).toFixed(1),
          fastestTime: parseFloat(perf.fastest_time).toFixed(1),
          slowestTime: parseFloat(perf.slowest_time).toFixed(1)
        },
        distribution
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CouriersController();
