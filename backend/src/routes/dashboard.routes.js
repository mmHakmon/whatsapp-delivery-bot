const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');
const moment = require('moment-timezone');

// דאשבורד ראשי - סטטיסטיקות בזמן אמת
router.get('/realtime', authMiddleware, async (req, res) => {
  try {
    const today = moment().startOf('day').toDate();
    const now = new Date();

    // משלוחים היום
    const todayDeliveries = await prisma.delivery.findMany({
      where: {
        createdAt: { gte: today }
      }
    });

    // שליחים פעילים
    const activeCouriers = await prisma.courier.findMany({
      where: {
        isActive: true,
        isAvailable: true
      }
    });

    // משלוחים פעילים
    const activeDeliveries = await prisma.delivery.findMany({
      where: {
        status: {
          in: ['published', 'claimed', 'picked_up', 'in_transit']
        }
      },
      include: {
        courier: true
      }
    });

    // התראות פתוחות
    const openAlerts = await prisma.alert.count({
      where: {
        isResolved: false
      }
    });

    // חישוב סטטיסטיקות
    const stats = {
      today: {
        total: todayDeliveries.length,
        completed: todayDeliveries.filter(d => d.status === 'completed').length,
        active: activeDeliveries.length,
        cancelled: todayDeliveries.filter(d => d.status === 'cancelled').length,
        revenue: todayDeliveries.reduce((sum, d) => sum + (d.finalPrice || 0), 0),
        companyEarnings: todayDeliveries.reduce((sum, d) => sum + (d.companyEarnings || 0), 0)
      },
      couriers: {
        total: await prisma.courier.count({ where: { isActive: true } }),
        available: activeCouriers.length,
        busy: await prisma.courier.count({
          where: {
            isActive: true,
            deliveries: {
              some: {
                status: {
                  in: ['claimed', 'picked_up', 'in_transit']
                }
              }
            }
          }
        })
      },
      alerts: openAlerts
    };

    res.json({
      stats,
      activeDeliveries,
      activeCouriers
    });
  } catch (error) {
    console.error('Realtime dashboard error:', error);
    res.status(500).json({ error: 'שגיאה בטעינת דאשבורד' });
  }
});

// שליחים פעילים במפה
router.get('/active-couriers', authMiddleware, async (req, res) => {
  try {
    const couriers = await prisma.courier.findMany({
      where: {
        isActive: true,
        currentLat: { not: null },
        currentLng: { not: null }
      },
      include: {
        deliveries: {
          where: {
            status: {
              in: ['claimed', 'picked_up', 'in_transit']
            }
          },
          take: 1
        }
      }
    });

    res.json({ couriers });
  } catch (error) {
    console.error('Active couriers error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת שליחים פעילים' });
  }
});

// משלוחים פעילים במפה
router.get('/active-deliveries', authMiddleware, async (req, res) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      where: {
        status: {
          in: ['published', 'claimed', 'picked_up', 'in_transit']
        }
      },
      include: {
        courier: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ deliveries });
  } catch (error) {
    console.error('Active deliveries error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת משלוחים פעילים' });
  }
});

// סטטיסטיקות שבועיות
router.get('/weekly-stats', authMiddleware, async (req, res) => {
  try {
    const startOfWeek = moment().startOf('week').toDate();
    const endOfWeek = moment().endOf('week').toDate();

    const deliveries = await prisma.delivery.findMany({
      where: {
        createdAt: {
          gte: startOfWeek,
          lte: endOfWeek
        }
      }
    });

    // קיבוץ לפי יום
    const dailyStats = {};
    for (let i = 0; i < 7; i++) {
      const date = moment().startOf('week').add(i, 'days');
      const dayKey = date.format('DD/MM');
      
      const dayDeliveries = deliveries.filter(d => 
        moment(d.createdAt).format('DD/MM') === dayKey
      );

      dailyStats[dayKey] = {
        total: dayDeliveries.length,
        completed: dayDeliveries.filter(d => d.status === 'completed').length,
        revenue: dayDeliveries.reduce((sum, d) => sum + (d.finalPrice || 0), 0)
      };
    }

    res.json({ dailyStats });
  } catch (error) {
    console.error('Weekly stats error:', error);
    res.status(500).json({ error: 'שגיאה בסטטיסטיקות שבועיות' });
  }
});

// top שליחים
router.get('/top-couriers', authMiddleware, async (req, res) => {
  try {
    const { period = '7' } = req.query; // ימים
    const startDate = moment().subtract(parseInt(period), 'days').toDate();

    const couriers = await prisma.courier.findMany({
      where: {
        isActive: true
      },
      include: {
        deliveries: {
          where: {
            createdAt: { gte: startDate },
            status: 'completed'
          }
        }
      }
    });

    const topCouriers = couriers
      .map(courier => ({
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        vehicleType: courier.vehicleType,
        completedDeliveries: courier.deliveries.length,
        totalEarnings: courier.deliveries.reduce((sum, d) => sum + (d.courierEarnings || 0), 0),
        rating: courier.rating
      }))
      .sort((a, b) => b.completedDeliveries - a.completedDeliveries)
      .slice(0, 10);

    res.json({ topCouriers });
  } catch (error) {
    console.error('Top couriers error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת שליחים מובילים' });
  }
});

module.exports = router;
