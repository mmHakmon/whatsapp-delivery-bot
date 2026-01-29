const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');

const router = express.Router();

// הרשמה
router.post('/register', async (req, res) => {
  try {
    const { phone, name, password, role } = req.body;

    // בדיקה אם המשתמש קיים
    const existingUser = await prisma.user.findUnique({
      where: { phone }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'המשתמש כבר קיים' });
    }

    // הצפנת סיסמה
    const hashedPassword = await bcrypt.hash(password, 10);

    // יצירת משתמש
    const user = await prisma.user.create({
      data: {
        phone,
        name,
        password: hashedPassword,
        role: role || 'manager'
      }
    });

    // יצירת טוקן
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משתמש' });
  }
});

// התחברות
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { phone }
    });

    if (!user) {
      return res.status(401).json({ error: 'טלפון או סיסמה שגויים' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'טלפון או סיסמה שגויים' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'המשתמש לא פעיל' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'שגיאה בהתחברות' });
  }
});

// קבלת פרטי משתמש מחובר
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      phone: req.user.phone,
      name: req.user.name,
      role: req.user.role
    }
  });
});

module.exports = router;
