/**
 * M.M.H Delivery System Pro v4.0
 * Users Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { query } = require('../config/database');
const { SECURITY } = require('../config');
const { 
  requireAuth, 
  requireRole, 
  logSecurityEvent,
  sanitizeString,
  validatePhone,
  validateEmail,
} = require('../middleware/security');

// ══════════════════════════════════════════════════════════════
// GET ALL USERS
// ══════════════════════════════════════════════════════════════

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT id, username, name, role, phone, email, active, two_factor_enabled, created_at, last_login
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CREATE USER
// ══════════════════════════════════════════════════════════════

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, name, role, phone, email } = req.body;
    
    // Validate required fields
    if (!username || !password || !name) {
      return res.json({ success: false, error: 'נא למלא שם משתמש, סיסמה ושם מלא' });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.json({ success: false, error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
    }
    
    // Validate phone if provided
    if (phone && !validatePhone(phone)) {
      return res.json({ success: false, error: 'מספר טלפון לא תקין' });
    }
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.json({ success: false, error: 'כתובת אימייל לא תקינה' });
    }
    
    // Validate role
    const validRoles = ['agent', 'manager', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.json({ success: false, error: 'תפקיד לא תקין' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, SECURITY.BCRYPT_ROUNDS);
    
    // Create user
    const result = await query(`
      INSERT INTO users (username, password, name, role, phone, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, name, role
    `, [
      sanitizeString(username, 50),
      hashedPassword,
      sanitizeString(name, 100),
      role || 'agent',
      sanitizeString(phone, 20),
      sanitizeString(email, 100)
    ]);
    
    logSecurityEvent('USER_CREATED', req.ip, {
      createdBy: req.user.username,
      newUser: username
    });
    
    res.json({ success: true, user: result.rows[0] });
    
  } catch (error) {
    if (error.code === '23505') {
      return res.json({ success: false, error: 'שם משתמש קיים' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// UPDATE USER
// ══════════════════════════════════════════════════════════════

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, role, phone, email, active } = req.body;
    
    // Validate phone if provided
    if (phone && !validatePhone(phone)) {
      return res.json({ success: false, error: 'מספר טלפון לא תקין' });
    }
    
    // Validate email if provided
    if (email && !validateEmail(email)) {
      return res.json({ success: false, error: 'כתובת אימייל לא תקינה' });
    }
    
    await query(`
      UPDATE users 
      SET name=$1, role=$2, phone=$3, email=$4, active=$5
      WHERE id=$6
    `, [
      sanitizeString(name, 100),
      role,
      sanitizeString(phone, 20),
      sanitizeString(email, 100),
      active,
      req.params.id
    ]);
    
    logSecurityEvent('USER_UPDATED', req.ip, {
      updatedBy: req.user.username,
      userId: req.params.id
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CHANGE USER PASSWORD (Admin)
// ══════════════════════════════════════════════════════════════

router.put('/:id/password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.json({ success: false, error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
    }
    
    const hashedPassword = await bcrypt.hash(password, SECURITY.BCRYPT_ROUNDS);
    
    await query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, req.params.id]);
    
    logSecurityEvent('PASSWORD_CHANGED', req.ip, {
      changedBy: req.user.username,
      userId: req.params.id
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE USER
// ══════════════════════════════════════════════════════════════

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.json({ success: false, error: 'לא ניתן למחוק את עצמך' });
    }
    
    await query("DELETE FROM users WHERE id=$1", [req.params.id]);
    
    logSecurityEvent('USER_DELETED', req.ip, {
      deletedBy: req.user.username,
      userId: req.params.id
    });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

module.exports = router;
