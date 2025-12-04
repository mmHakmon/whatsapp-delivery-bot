const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { auth } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('אנא הזן אימייל וסיסמה', 400);
    }

    const result = await pool.query(
      'SELECT * FROM admins WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new AppError('פרטי התחברות שגויים', 401);
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      throw new AppError('חשבון לא פעיל', 401);
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      throw new AppError('פרטי התחברות שגויים', 401);
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(`Admin logged in: ${admin.email}`);

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json({
    success: true,
    admin: req.admin
  });
});

// Change password
router.put('/change-password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('אנא הזן סיסמה נוכחית וחדשה', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('הסיסמה החדשה חייבת להכיל לפחות 6 תווים', 400);
    }

    const result = await pool.query(
      'SELECT password_hash FROM admins WHERE id = $1',
      [req.admin.id]
    );

    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!isMatch) {
      throw new AppError('סיסמה נוכחית שגויה', 401);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.admin.id]
    );

    logger.info(`Password changed for admin: ${req.admin.email}`);

    res.json({
      success: true,
      message: 'הסיסמה שונתה בהצלחה'
    });
  } catch (error) {
    next(error);
  }
});

// Register new admin (super admin only)
router.post('/register', auth, async (req, res, next) => {
  try {
    if (req.admin.role !== 'super_admin') {
      throw new AppError('אין הרשאה ליצירת משתמשים', 403);
    }

    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      throw new AppError('נא למלא את כל השדות הנדרשים', 400);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO admins (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role`,
      [name, email, hashedPassword, phone, role || 'admin']
    );

    logger.info(`New admin created: ${email} by ${req.admin.email}`);

    res.status(201).json({
      success: true,
      admin: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Setup first admin (only works if no admins exist)
router.get('/setup', async (req, res, next) => {
  try {
    // Check if any admin exists
    const existingAdmin = await pool.query('SELECT COUNT(*) FROM admins');
    
    if (parseInt(existingAdmin.rows[0].count) > 0) {
      return res.json({
        success: false,
        message: 'משתמש מנהל כבר קיים. השתמש בדף ההתחברות.'
      });
    }

    // Create default admin
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const result = await pool.query(
      `INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      ['מנהל ראשי', 'admin@delivery.com', hashedPassword, 'super_admin']
    );

    logger.info('First admin created via setup');

    res.json({
      success: true,
      message: 'משתמש מנהל נוצר בהצלחה!',
      credentials: {
        email: 'admin@delivery.com',
        password: 'admin123'
      },
      note: 'שנה את הסיסמה מיד לאחר ההתחברות!'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
