/**
 * M.M.H Delivery System Pro v4.0
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const { query } = require('../config/database');
const { SECURITY } = require('../config');
const { send2FACode } = require('../utils/whatsapp');
const {
  rateLimit,
  generateTokens,
  verifyRefreshToken,
  requireAuth,
  requireRole,
  checkLoginAttempts,
  recordFailedLogin,
  clearLoginAttempts,
  logSecurityEvent,
} = require('../middleware/security');

// 2FA codes storage
const twoFACodes = new Map();

// Generate 2FA code
const generate2FACode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Send and store 2FA code
const sendAndStore2FACode = async (userId, phone) => {
  const code = generate2FACode();
  twoFACodes.set(userId, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  await send2FACode(phone, code);
  return code;
};

// Verify 2FA code
const verify2FACode = (userId, code) => {
  const record = twoFACodes.get(userId);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    twoFACodes.delete(userId);
    return false;
  }
  if (record.code !== code) return false;
  twoFACodes.delete(userId);
  return true;
};

// ══════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════

router.post('/login', rateLimit(SECURITY.RATE_LIMIT_LOGIN), async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  try {
    const { username, password, twoFactorCode } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.json({ success: false, error: 'נדרש שם משתמש וסיסמה' });
    }
    
    // Check if account is locked
    const lockStatus = checkLoginAttempts(ip, username);
    if (lockStatus.locked) {
      logSecurityEvent('LOGIN_BLOCKED', ip, { username, reason: 'account_locked' });
      return res.json({ 
        success: false, 
        error: `החשבון נעול. נסה שוב בעוד ${lockStatus.remainingMin} דקות` 
      });
    }
    
    // Find user
    const result = await query(
      "SELECT * FROM users WHERE username=$1 AND active=true",
      [username]
    );
    const user = result.rows[0];
    
    // Validate credentials
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordFailedLogin(ip, username);
      logSecurityEvent('LOGIN_FAILED', ip, { username, reason: 'invalid_credentials' });
      return res.json({ success: false, error: 'שם משתמש או סיסמה שגויים' });
    }
    
    // Check 2FA for admin users
    if (user.role === 'admin' && user.two_factor_enabled) {
      if (!twoFactorCode) {
        // Send 2FA code
        await sendAndStore2FACode(user.id, user.phone);
        logSecurityEvent('2FA_SENT', ip, { username });
        return res.json({ 
          success: false, 
          requires2FA: true, 
          message: 'קוד אימות נשלח לטלפון שלך' 
        });
      }
      
      // Verify 2FA code
      if (!verify2FACode(user.id, twoFactorCode)) {
        logSecurityEvent('2FA_FAILED', ip, { username });
        return res.json({ success: false, error: 'קוד אימות שגוי או פג תוקף' });
      }
    }
    
    // Successful login
    clearLoginAttempts(ip, username);
    await query("UPDATE users SET last_login=NOW() WHERE id=$1", [user.id]);
    
    const tokens = generateTokens(user);
    
    // Store refresh token
    await query("UPDATE users SET refresh_token=$1 WHERE id=$2", [tokens.refreshToken, user.id]);
    
    logSecurityEvent('LOGIN_SUCCESS', ip, { username, role: user.role });
    
    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { 
        id: user.id, 
        username: user.username, 
        name: user.name, 
        role: user.role 
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    logSecurityEvent('LOGIN_ERROR', ip, { error: error.message });
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// REFRESH TOKEN
// ══════════════════════════════════════════════════════════════

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'נדרש refresh token' });
    }
    
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'refresh token לא תקין' });
    }
    
    // Verify token matches database
    const result = await query(
      "SELECT * FROM users WHERE id=$1 AND refresh_token=$2 AND active=true",
      [decoded.id, refreshToken]
    );
    const user = result.rows[0];
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'refresh token לא תקין' });
    }
    
    const tokens = generateTokens(user);
    
    // Update refresh token
    await query("UPDATE users SET refresh_token=$1 WHERE id=$2", [tokens.refreshToken, user.id]);
    
    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
    
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await query("UPDATE users SET refresh_token=NULL WHERE id=$1", [req.user.id]);
    logSecurityEvent('LOGOUT', req.ip, { username: req.user.username });
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// CURRENT USER
// ══════════════════════════════════════════════════════════════

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ══════════════════════════════════════════════════════════════
// CHANGE PASSWORD (SELF)
// ══════════════════════════════════════════════════════════════

router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return res.json({ success: false, error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
    }
    
    // Verify old password
    const result = await query("SELECT password FROM users WHERE id=$1", [req.user.id]);
    if (!result.rows[0] || !(await bcrypt.compare(oldPassword, result.rows[0].password))) {
      return res.json({ success: false, error: 'סיסמה נוכחית שגויה' });
    }
    
    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, SECURITY.BCRYPT_ROUNDS);
    await query("UPDATE users SET password=$1 WHERE id=$2", [hashedPassword, req.user.id]);
    
    logSecurityEvent('PASSWORD_CHANGED_SELF', req.ip, { username: req.user.username });
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

// ══════════════════════════════════════════════════════════════
// 2FA MANAGEMENT
// ══════════════════════════════════════════════════════════════

router.post('/toggle-2fa', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      "SELECT two_factor_enabled, phone FROM users WHERE id=$1",
      [req.user.id]
    );
    const user = result.rows[0];
    
    if (!user.phone) {
      return res.json({ success: false, error: 'נדרש מספר טלפון להפעלת 2FA' });
    }
    
    const newStatus = !user.two_factor_enabled;
    await query("UPDATE users SET two_factor_enabled=$1 WHERE id=$2", [newStatus, req.user.id]);
    
    logSecurityEvent(newStatus ? '2FA_ENABLED' : '2FA_DISABLED', req.ip, { 
      username: req.user.username 
    });
    
    res.json({ success: true, enabled: newStatus });
    
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ success: false, error: 'שגיאת שרת' });
  }
});

module.exports = router;
