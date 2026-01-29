const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const reportService = require('../services/report.service');
const moment = require('moment-timezone');

// דוח יומי
router.get('/daily', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    const reportRoutes = require('./routes/report.routes');

    const report = await reportService.generateDailyReport(reportDate);

    res.json(report);
  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת דוח יומי' });
  }
});

// דוח שבועי
router.get('/weekly', authMiddleware, async (req, res) => {
  try {
    const { startDate } = req.query;

    const report = await reportService.generateWeeklyReport(startDate);

    res.json(report);
  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת דוח שבועי' });
  }
});

// ייצוא לאקסל
router.get('/export/excel', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    app.use('/api/reports', reportRoutes);
    
    const prisma = require('../config/database');
    
    const where = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    
    if (status) {
      where.status = status;
    }

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        courier: true,
        createdBy: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const buffer = await reportService.exportToExcel(deliveries);

    const filename = `deliveries_${moment().format('DD-MM-YYYY_HH-mm')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Export excel error:', error);
    res.status(500).json({ error: 'שגיאה בייצוא לאקסל' });
  }
});

module.exports = router;
