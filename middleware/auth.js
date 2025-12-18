const jwt = require('jsonwebtoken');

// Authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Require admin role
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Authenticate courier
function authenticateCourier(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, courier) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    if (courier.type !== 'courier') {
      return res.status(403).json({ error: 'Courier access required' });
    }
    req.courier = courier;
    next();
  });
}

module.exports = {
  authenticateToken,
  requireAdmin,
  authenticateCourier
};