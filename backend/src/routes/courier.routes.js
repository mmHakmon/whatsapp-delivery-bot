const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware, adminOnly } = require('../middleware/auth.middleware');

// קבלת כל השליחים
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { isActive, vehicleType } = req.query;

    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (vehicleType) where.vehicleType = vehicleType;

    const couriers = await prisma.courier.findMany({
      where,
      include: {
        performance: {
          orderBy: {
            date: 'desc'
          },
          take: 7
        },
        blacklistEntries: {
          where: {
            isActive: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({ couriers });
  } catch (error) {
    console.error('Get couriers error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת שליחים' });
  }
});

// קבלת שליח ספציפי
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const courier = await prisma.courier.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        deliveries: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        },
        performance: {
          orderBy: {
            date: 'desc'
          },
          take: 30
        },
        blacklistEntries: {
          where: {
            isActive: true
          }
        }
      }
    });

    if (!courier) {
      return res.status(404).json({ error: 'שליח לא נמצא' });
    }

    res.json({ courier });
  } catch (error) {
    console.error('Get courier error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת שליח' });
  }
});

// יצירת שליח חדש
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { phone, name, vehicleType } = req.body;

    const existingCourier = await prisma.courier.findUnique({
      where: { phone }
    });

    if (existingCourier) {
      return res.status(400).json({ error: 'שליח עם מספר זה כבר קיים' });
    }

    const courier = await prisma.courier.create({
      data: {
        phone,
        name,
        vehicleType
      }
    });

    res.json({
      success: true,
      courier
    });
  } catch (error) {
    console.error('Create courier error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת שליח' });
  }
});

// עדכון שליח
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, vehicleType, isActive, isAvailable } = req.body;

    const courier = await prisma.courier.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        vehicleType,
        isActive,
        isAvailable
      }
    });

    res.json({
      success: true,
      courier
    });
  } catch (error) {
    console.error('Update courier error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון שליח' });
  }
});

// עדכון מיקום שליח
router.post('/:id/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const courier = await prisma.courier.update({
      where: { id: parseInt(req.params.id) },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: new Date()
      }
    });

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('courier-location', {
      courierId: courier.id,
      lat,
      lng
    });

    res.json({
      success: true,
      courier
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון מיקום' });
  }
});

// שינוי זמינות שליח
router.post('/:id/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;

    const courier = await prisma.courier.update({
      where: { id: parseInt(req.params.id) },
      data: { isAvailable }
    });

    res.json({
      success: true,
      courier
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון זמינות' });
  }
});

// הוספה לבלאקליסט
router.post('/:id/blacklist', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { reason, duration } = req.body; // duration in hours

    let endDate = null;
    if (duration) {
      endDate = new Date(Date.now() + duration * 60 * 60 * 1000);
    }

    const blacklist = await prisma.courierBlacklist.create({
      data: {
        courierId: parseInt(req.params.id),
        reason,
        endDate,
        createdById: req.user.id
      }
    });

    res.json({
      success: true,
      blacklist
    });
  } catch (error) {
    console.error('Blacklist error:', error);
    res.status(500).json({ error: 'שגיאה בהוספה לבלאקליסט' });
  }
});

// הסרה מבלאקליסט
router.delete('/:id/blacklist', authMiddleware, adminOnly, async (req, res) => {
  try {
    await prisma.courierBlacklist.updateMany({
      where: {
        courierId: parseInt(req.params.id),
        isActive: true
      },
      data: {
        isActive: false,
        endDate: new Date()
      }
    });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Remove blacklist error:', error);
    res.status(500).json({ error: 'שגיאה בהסרה מבלאקליסט' });
  }
});

// סטטיסטיקות שליח
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const courierId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

    const where = { courierId };
    
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const performance = await prisma.courierPerformance.findMany({
      where,
      orderBy: {
        date: 'desc'
      }
    });

    const totalStats = performance.reduce((acc, day) => {
      acc.totalDeliveries += day.totalDeliveries;
      acc.completedDeliveries += day.completedDeliveries;
      acc.cancelledDeliveries += day.cancelledDeliveries;
      acc.totalEarnings += day.totalEarnings;
      return acc;
    }, {
      totalDeliveries: 0,
      completedDeliveries: 0,
      cancelledDeliveries: 0,
      totalEarnings: 0
    });

    res.json({
      performance,
      totalStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת סטטיסטיקות' });
  }
});

module.exports = router;
