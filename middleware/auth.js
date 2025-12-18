const jwt = require('jsonwebtoken');

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'נדרש אימות' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'גישה נדחתה - נדרשות הרשאות מנהל' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
};

// ==========================================
// COURIER AUTHENTICATION
// ==========================================

const authenticateCourier = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'נדרש אימות' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.id) {
      return res.status(403).json({ error: 'גישה נדחתה' });
    }

    req.courier = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
};

// ==========================================
// CUSTOMER AUTHENTICATION
// ==========================================

const authenticateCustomer = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'נדרש אימות' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'customer') {
      return res.status(403).json({ error: 'גישה נדחתה' });
    }

    req.customer = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
};

// ==========================================
// GENERAL TOKEN AUTHENTICATION
// ==========================================

const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'נדרש אימות' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'טוקן לא תקין' });
  }
};

// ==========================================
// ADMIN ROLE CHECK
// ==========================================

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'נדרשות הרשאות מנהל' });
  }
  next();
};

module.exports = {
  authenticateAdmin,
  authenticateCourier,
  authenticateCustomer,
  authenticateToken,
  requireAdmin
};
