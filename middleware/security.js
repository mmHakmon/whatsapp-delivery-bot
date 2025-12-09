/**
 * M.M.H Delivery System Pro v4.0
 * Security Middleware
 * 
 * Includes:
 * - Rate limiting
 * - Security headers
 * - Authentication
 * - Login attempt tracking
 * - Security logging
 */

const jwt = require('jsonwebtoken');
const { CONFIG, SECURITY } = require('../config');
const { query } = require('../config/database');

// ══════════════════════════════════════════════════════════════
// RATE LIMITING
// ══════════════════════════════════════════════════════════════

const rateLimitStore = new Map();
const loginAttempts = new Map();

// Cleanup old records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) rateLimitStore.delete(key);
  }
  for (const [key, record] of loginAttempts.entries()) {
    if (now > record.lockoutUntil) loginAttempts.delete(key);
  }
}, 60000);

/**
 * Rate limiting middleware
 */
const rateLimit = (maxRequests = SECURITY.RATE_LIMIT_MAX, windowMs = SECURITY.RATE_LIMIT_WINDOW) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    record.count++;
    if (record.count > maxRequests) {
      logSecurityEvent('RATE_LIMIT', ip, { path: req.path, count: record.count });
      return res.status(429).json({ 
        success: false, 
        error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' 
      });
    }
    next();
  };
};

// ══════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ══════════════════════════════════════════════════════════════

/**
 * Add security headers to all responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' wss: ws: https:; " +
    "font-src 'self' https://fonts.gstatic.com;"
  );
  
  // HSTS - only in production
  if (CONFIG.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

/**
 * HTTPS redirect in production
 */
const httpsRedirect = (req, res, next) => {
  if (CONFIG.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};

// ══════════════════════════════════════════════════════════════
// AUTHENTICATION
// ══════════════════════════════════════════════════════════════

/**
 * Generate access and refresh tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    CONFIG.JWT_SECRET,
    { expiresIn: SECURITY.JWT_ACCESS_EXPIRY }
  );
  
  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    CONFIG.JWT_REFRESH_SECRET,
    { expiresIn: SECURITY.JWT_REFRESH_EXPIRY }
  );
  
  return { accessToken, refreshToken };
};

/**
 * Verify access token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET);
  } catch (e) {
    return null;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, CONFIG.JWT_REFRESH_SECRET);
  } catch (e) {
    return null;
  }
};

/**
 * Require authentication middleware
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'נדרשת התחברות' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'טוקן לא תקין או פג תוקף' });
  }
  
  req.user = decoded;
  next();
};

/**
 * Require specific roles
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'אין הרשאה' });
  }
  next();
};

// ══════════════════════════════════════════════════════════════
// LOGIN ATTEMPT TRACKING
// ══════════════════════════════════════════════════════════════

/**
 * Check if account is locked
 */
const checkLoginAttempts = (ip, username) => {
  const key = `${ip}:${username}`;
  const record = loginAttempts.get(key);
  
  if (!record) return { locked: false };
  
  if (Date.now() < record.lockoutUntil) {
    const remainingMs = record.lockoutUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { locked: true, remainingMin };
  }
  
  return { locked: false };
};

/**
 * Record failed login attempt
 */
const recordFailedLogin = (ip, username) => {
  const key = `${ip}:${username}`;
  const record = loginAttempts.get(key) || { count: 0, lockoutUntil: 0 };
  record.count++;
  
  if (record.count >= SECURITY.MAX_LOGIN_ATTEMPTS) {
    record.lockoutUntil = Date.now() + SECURITY.LOCKOUT_TIME;
    logSecurityEvent('ACCOUNT_LOCKED', ip, { username, attempts: record.count });
  }
  
  loginAttempts.set(key, record);
};

/**
 * Clear login attempts on successful login
 */
const clearLoginAttempts = (ip, username) => {
  loginAttempts.delete(`${ip}:${username}`);
};

// ══════════════════════════════════════════════════════════════
// SECURITY LOGGING
// ══════════════════════════════════════════════════════════════

const securityLogs = [];

/**
 * Log security event
 */
const logSecurityEvent = async (event, ip, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ip,
    details,
  };
  
  securityLogs.push(logEntry);
  console.log(`🔒 [SECURITY] ${event}:`, JSON.stringify(details));
  
  // Save to database
  try {
    await query(
      "INSERT INTO activity_log (action, ip_address, details) VALUES ($1, $2, $3)",
      [event, ip, JSON.stringify(details)]
    );
  } catch (e) {
    // Ignore database errors for logging
  }
  
  // Keep only last 1000 logs in memory
  if (securityLogs.length > 1000) securityLogs.shift();
};

/**
 * Get recent security logs
 */
const getSecurityLogs = () => securityLogs.slice(-50);

// ══════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Validate Israeli phone number
 */
const validatePhone = (phone) => {
  if (!phone) return false;
  const cleaned = phone.replace(/[-\s]/g, '');
  // Israeli mobile: 05X-XXXXXXX or landline: 0X-XXXXXXX
  return /^0[2-9]\d{7,8}$/.test(cleaned) || /^972[2-9]\d{7,8}$/.test(cleaned);
};

/**
 * Validate email
 */
const validateEmail = (email) => {
  if (!email) return true; // Email is optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validate Israeli ID number
 */
const validateIdNumber = (id) => {
  if (!id || id.length !== 9) return false;
  
  // Luhn-like algorithm for Israeli ID
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
};

/**
 * Sanitize string input
 */
const sanitizeString = (str, maxLength = 255) => {
  if (!str) return '';
  return String(str)
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, ''); // Basic XSS prevention
};

module.exports = {
  // Rate limiting
  rateLimit,
  
  // Security headers
  securityHeaders,
  httpsRedirect,
  
  // Authentication
  generateTokens,
  verifyToken,
  verifyRefreshToken,
  requireAuth,
  requireRole,
  
  // Login tracking
  checkLoginAttempts,
  recordFailedLogin,
  clearLoginAttempts,
  
  // Logging
  logSecurityEvent,
  getSecurityLogs,
  
  // Validation
  validatePhone,
  validateEmail,
  validateIdNumber,
  sanitizeString,
};
