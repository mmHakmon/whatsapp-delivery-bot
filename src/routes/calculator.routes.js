const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const calculatorService = require('../services/calculator.service');

// מחשבון מחירים
router.post('/price', authMiddleware, async (req, res) => {
  try {
    const result = await calculatorService.quickCalculate(req, res);
    res.json(result);
  } catch (error) {
    console.error('Calculator error:', error);
    res.status(500).json({ error: 'שגיאה בחישוב מחיר', details: error.message });
  }
});

module.exports = router;
