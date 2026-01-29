const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'נדרש אימות' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'משתמש לא קיים או לא פעיל' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'אימות נכשל' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'נדרשות הרשאות מנהל' });
  }
  next();
};

module.exports = { authMiddleware, adminOnly };
