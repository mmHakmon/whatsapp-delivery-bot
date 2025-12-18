const pool = require('../config/database');
const { PAYMENT_STATUS } = require('../config/constants');
const whatsappService = require('../services/whatsapp.service');

class PaymentsController {
  // Create payout request (courier)
  async createPayoutRequest(req, res, next) {
    try {
      const courierId = req.courier.id;
      const { amount, paymentMethod, accountInfo } = req.body;

      // Check courier balance
      const courierResult = await pool.query(
        'SELECT balance FROM couriers WHERE id = $1',
        [courierId]
      );

      if (courierResult.rows.length === 0) {
        return res.status(404).json({ error: 'פרופיל לא נמצא' });
      }

      const balance = parseFloat(courierResult.rows[0].balance);

      if (balance < amount) {
        return res.status(400).json({ error: 'יתרה לא מספיקה' });
      }

      const minPayout = parseFloat(process.env.MIN_PAYOUT_AMOUNT || 50);
      if (amount < minPayout) {
        return res.status(400).json({ error: `סכום מינימלי למשיכה: ₪${minPayout}` });
      }

      // Create payout request
      const result = await pool.query(`
        INSERT INTO payout_requests (
          courier_id, amount, payment_method, account_info, status
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [courierId, amount, paymentMethod, JSON.stringify(accountInfo), PAYMENT_STATUS.PENDING]);

      res.status(201).json({
        request: result.rows[0],
        message: 'בקשת משיכה נשלחה בהצלחה'
      });
    } catch (error) {
      next(error);
    }
  }

  // Get my payout requests (courier)
  async getMyPayoutRequests(req, res, next) {
    try {
      const courierId = req.courier.id;

      const result = await pool.query(`
        SELECT pr.*, u.name as processed_by_name
        FROM payout_requests pr
        LEFT JOIN users u ON pr.processed_by = u.id
        WHERE pr.courier_id = $1
        ORDER BY pr.created_at DESC
      `, [courierId]);

      res.json({ requests: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Get all payout requests (admin)
  async getAllPayoutRequests(req, res, next) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT pr.*,
               c.first_name || ' ' || c.last_name as courier_name,
               c.phone as courier_phone,
               u.name as processed_by_name
        FROM payout_requests pr
        JOIN couriers c ON pr.courier_id = c.id
        LEFT JOIN users u ON pr.processed_by = u.id
      `;

      const params = [];
      if (status) {
        query += ' WHERE pr.status = $1';
        params.push(status);
      }

      query += ' ORDER BY pr.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ requests: result.rows });
    } catch (error) {
      next(error);
    }
  }

  // Approve payout request (admin)
  async approvePayoutRequest(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { notes } = req.body;

      // Get payout request
      const requestResult = await client.query(
        'SELECT * FROM payout_requests WHERE id = $1',
        [id]
      );

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'בקשה לא נמצאה' });
      }

      const request = requestResult.rows[0];

      if (request.status !== PAYMENT_STATUS.PENDING) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'הבקשה כבר טופלה' });
      }

      // Check courier balance
      const courierResult = await client.query(
        'SELECT balance, phone FROM couriers WHERE id = $1',
        [request.courier_id]
      );

      const courier = courierResult.rows[0];
      const balance = parseFloat(courier.balance);

      if (balance < request.amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'יתרה לא מספיקה' });
      }

      // Update payout request
      await client.query(`
        UPDATE payout_requests 
        SET status = $1, processed_by = $2, processed_at = NOW(), admin_notes = $3
        WHERE id = $4
      `, [PAYMENT_STATUS.APPROVED, req.user.id, notes, id]);

      await client.query('COMMIT');

      // Send WhatsApp notification
      await whatsappService.sendMessage(
        courier.phone,
        `✅ *בקשת המשיכה אושרה!*\n\nסכום: ₪${request.amount}\nהכסף יועבר בימים הקרובים.`
      );

      res.json({ message: 'בקשה אושרה בהצלחה' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // Complete payout (admin - after actual payment)
  async completePayoutRequest(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Get payout request
      const requestResult = await client.query(
        'SELECT * FROM payout_requests WHERE id = $1',
        [id]
      );

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'בקשה לא נמצאה' });
      }

      const request = requestResult.rows[0];

      if (request.status !== PAYMENT_STATUS.APPROVED) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'הבקשה לא אושרה' });
      }

      // Update payout request
      await client.query(
        'UPDATE payout_requests SET status = $1 WHERE id = $2',
        [PAYMENT_STATUS.COMPLETED, id]
      );

      // Deduct from courier balance
      await client.query(
        'UPDATE couriers SET balance = balance - $1 WHERE id = $2',
        [request.amount, request.courier_id]
      );

      // Record payment
      await client.query(`
        INSERT INTO payments (courier_id, amount, method, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [request.courier_id, request.amount, request.payment_method, 'Payout completed', req.user.id]);

      await client.query('COMMIT');

      // Get courier phone
      const courierResult = await client.query(
        'SELECT phone FROM couriers WHERE id = $1',
        [request.courier_id]
      );

      // Send WhatsApp notification
      await whatsappService.sendMessage(
        courierResult.rows[0].phone,
        `💰 *התשלום הועבר!*\n\nסכום: ₪${request.amount}\nהכסף אמור להגיע בקרוב.`
      );

      res.json({ message: 'התשלום הושלם בהצלחה' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // Reject payout request (admin)
  async rejectPayoutRequest(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Get payout request
      const requestResult = await pool.query(
        'SELECT pr.*, c.phone FROM payout_requests pr JOIN couriers c ON pr.courier_id = c.id WHERE pr.id = $1',
        [id]
      );

      if (requestResult.rows.length === 0) {
        return res.status(404).json({ error: 'בקשה לא נמצאה' });
      }

      const request = requestResult.rows[0];

      if (request.status !== PAYMENT_STATUS.PENDING) {
        return res.status(400).json({ error: 'הבקשה כבר טופלה' });
      }

      // Update request
      await pool.query(`
        UPDATE payout_requests 
        SET status = $1, processed_by = $2, processed_at = NOW(), admin_notes = $3
        WHERE id = $4
      `, [PAYMENT_STATUS.REJECTED, req.user.id, reason, id]);

      // Send WhatsApp notification
      await whatsappService.sendMessage(
        request.phone,
        `❌ *בקשת המשיכה נדחתה*\n\nסכום: ₪${request.amount}\nסיבה: ${reason}`
      );

      res.json({ message: 'בקשה נדחתה' });
    } catch (error) {
      next(error);
    }
  }

  // Manual payment record (admin)
  async recordManualPayment(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { courierId, amount, method, notes } = req.body;

      // Check courier exists
      const courierResult = await client.query(
        'SELECT balance FROM couriers WHERE id = $1',
        [courierId]
      );

      if (courierResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'שליח לא נמצא' });
      }

      const balance = parseFloat(courierResult.rows[0].balance);

      if (balance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'יתרה לא מספיקה' });
      }

      // Record payment
      await client.query(`
        INSERT INTO payments (courier_id, amount, method, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
      `, [courierId, amount, method, notes, req.user.id]);

      // Deduct from balance
      await client.query(
        'UPDATE couriers SET balance = balance - $1 WHERE id = $2',
        [amount, courierId]
      );

      await client.query('COMMIT');

      res.json({ message: 'תשלום נרשם בהצלחה' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  // Get payment history (admin)
  async getPaymentHistory(req, res, next) {
    try {
      const { courierId, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT p.*,
               c.first_name || ' ' || c.last_name as courier_name,
               c.phone as courier_phone,
               u.name as created_by_name
        FROM payments p
        JOIN couriers c ON p.courier_id = c.id
        LEFT JOIN users u ON p.created_by = u.id
      `;

      const params = [];
      if (courierId) {
        query += ' WHERE p.courier_id = $1';
        params.push(courierId);
      }

      query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      res.json({ payments: result.rows });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaymentsController();