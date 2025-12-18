const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

class AuthController {
  // Admin/Manager login
  async login(req, res, next) {
    try {
      const { username, password } = req.body;

      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1 AND active = true',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      // Update last login and refresh token
      await pool.query(
        'UPDATE users SET last_login = NOW(), refresh_token = $1 WHERE id = $2',
        [refreshToken, user.id]
      );

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh token
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
      }

      jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
        if (err) {
          return res.status(403).json({ error: 'Invalid refresh token' });
        }

        const result = await pool.query(
          'SELECT * FROM users WHERE id = $1 AND refresh_token = $2',
          [decoded.id, refreshToken]
        );

        if (result.rows.length === 0) {
          return res.status(403).json({ error: 'Invalid refresh token' });
        }

        const user = result.rows[0];
        const accessToken = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        res.json({ accessToken });
      });
    } catch (error) {
      next(error);
    }
  }

  // Courier login (phone only)
  async courierLogin(req, res, next) {
    try {
      const { phone } = req.body;

      const result = await pool.query(
        'SELECT * FROM couriers WHERE phone = $1 AND status = $2',
        [phone, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'שליח לא נמצא במערכת',
          needsRegistration: true 
        });
      }

      const courier = result.rows[0];
      const token = jwt.sign(
        { id: courier.id, phone: courier.phone, type: 'courier' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        token,
        courier: {
          id: courier.id,
          firstName: courier.first_name,
          lastName: courier.last_name,
          phone: courier.phone,
          vehicleType: courier.vehicle_type,
          balance: parseFloat(courier.balance),
          rating: parseFloat(courier.rating),
          totalDeliveries: courier.total_deliveries
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout
  async logout(req, res, next) {
    try {
      await pool.query(
        'UPDATE users SET refresh_token = NULL WHERE id = $1',
        [req.user.id]
      );

      res.json({ message: 'התנתקת בהצלחה' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();