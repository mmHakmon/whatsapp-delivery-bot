const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { AppError } = require('./errorHandler');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('לא סופק טוקן אימות', 401);
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin from database
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM admins WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('משתמש לא נמצא', 401);
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      throw new AppError('חשבון לא פעיל', 401);
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('טוקן לא תקין או פג תוקף', 401));
    }
    next(error);
  }
};

// Check for super admin role
const superAdmin = (req, res, next) => {
  if (req.admin.role !== 'super_admin') {
    return next(new AppError('נדרשות הרשאות מנהל על', 403));
  }
  next();
};

module.exports = { auth, superAdmin };
