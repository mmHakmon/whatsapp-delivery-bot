const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const alertService = require('../services/alert.service');

// קבלת כל ההתראות
router.get('/', authMiddleware, async (req, res) => {
  try {
    const alerts = await alertService.getActiveAlerts();
    res.json({ alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת התראות' });
  }
});

// סימון התראה כנקראה
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const alert = await alertService.markAsRead(parseInt(req.params.id));
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Mark alert as read error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון התראה' });
  }
});

// פתרון התראה
router.put('/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const alert = await alertService.resolveAlert(parseInt(req.params.id));
    res.json({ success: true, alert });
  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ error: 'שגיאה בפתרון התראה' });
  }
});

module.exports = router;
