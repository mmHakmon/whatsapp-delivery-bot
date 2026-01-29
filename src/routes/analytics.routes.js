const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');
const moment = require('moment-timezone');

// ניתוח ביצועים כללי
router.get('/performance', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const start = startDate ? moment(startDate).toDate() : moment().subtract(30, 'days').toDate();
    const end = endDate ? moment(endDate).toDate() : new Date();

    const deliveries = await prisma.delivery.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        courier: true
      }
    });

    // קיבוץ לפי תקופה
    const grouped = {};
    
    deliveries.forEach(delivery => {
      let key;
      const date = moment(delivery.createdAt);
      
      if (groupBy === 'day') {
        key = date.format('DD/MM/YYYY');
      } else if (groupBy === 'week') {
        key = `שבוע ${date.week()}`;
      } else if (groupBy === 'month') {
        key = date.format('MM/YYYY');
      }

      if (!grouped[key]) {
        grouped[key] = {
          total: 0,
          completed: 0,
          cancelled: 0,
          revenue: 0,
          avgDeliveryTime: [],
          vehicleTypes: {}
        };
      }

      grouped[key].total++;
      
      if (delivery.status === 'completed') {
        grouped[key].completed++;
        grouped[key].revenue += delivery.finalPrice || 0;

        // זמן משלוח ממוצע
        if (delivery.pickedUpAt && delivery.deliveredAt) {
          const timeMinutes = (delivery.deliveredAt - delivery.pickedUpAt) / 1000 / 60;
          grouped[key].avgDeliveryTime.push(timeMinutes);
        }
      }

      if (delivery.status === 'cancelled') {
        grouped[key].cancelled++;
      }

      // ספירה לפי סוג רכב
      if (!grouped[key].vehicleTypes[delivery.vehicleType]) {
        grouped[key].vehicleTypes[delivery.vehicleType] = 0;
      }
      grouped[key].vehicleTypes[delivery.vehicleType]++;
    });

    // חישוב ממוצעים
    Object.keys(grouped).forEach(key => {
      const data = grouped[key];
      if (data.avgDeliveryTime.length > 0) {
        const sum = data.avgDeliveryTime.reduce((a, b) => a + b, 0);
        data.avgDeliveryTime = Math.round(sum / data.avgDeliveryTime.length);
      } else {
        data.avgDeliveryTime = 0;
      }
      
      data.completionRate = data.total > 0 ? ((data.completed / data.total) * 100).toFixed(1) : 0;
    });

    res.json({
      period: {
        start: moment(start).format('DD/MM/YYYY'),
        end: moment(end).format('DD/MM/YYYY')
      },
      groupBy,
      data: grouped
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ error: 'שגיאה בניתוח ביצועים' });
  }
});

// ניתוח שליחים
router.get('/couriers', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? moment(startDate).toDate() : moment().subtract(30, 'days').toDate();
    const end = endDate ? moment(endDate).toDate() : new Date();

    const couriers = await prisma.courier.findMany({
      where: {
        isActive: true
      },
      include: {
        deliveries: {
          where: {
            createdAt: {
              gte: start,
              lte: end
            }
          }
        },
        performance: {
          where: {
            date: {
              gte: start,
              lte: end
            }
          }
        }
      }
    });

    const analysis = couriers.map(courier => {
      const completed = courier.deliveries.filter(d => d.status === 'completed');
      const cancelled = courier.deliveries.filter(d => d.status === 'cancelled');
      
      // חישוב זמן משלוח ממוצע
      const deliveryTimes = completed
        .filter(d => d.pickedUpAt && d.deliveredAt)
        .map(d => (d.deliveredAt - d.pickedUpAt) / 1000 / 60);
      
      const avgDeliveryTime = deliveryTimes.length > 0
        ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length)
        : 0;

      // רווחים
      const totalEarnings = completed.reduce((sum, d) => sum + (d.courierEarnings || 0), 0);

      return {
        id: courier.id,
        name: courier.name,
        phone: courier.phone,
        vehicleType: courier.vehicleType,
        rating: courier.rating,
        stats: {
          totalDeliveries: courier.deliveries.length,
          completed: completed.length,
          cancelled: cancelled.length,
          completionRate: courier.deliveries.length > 0 
            ? ((completed.length / courier.deliveries.length) * 100).toFixed(1) 
            : 0,
          avgDeliveryTime,
          totalEarnings: Math.round(totalEarnings)
        }
      };
    });

    // מיון לפי ביצועים
    analysis.sort((a, b) => b.stats.completed - a.stats.completed);

    res.json({
      period: {
        start: moment(start).format('DD/MM/YYYY'),
        end: moment(end).format('DD/MM/YYYY')
      },
      couriers: analysis
    });
  } catch (error) {
    console.error('Couriers analytics error:', error);
    res.status(500).json({ error: 'שגיאה בניתוח שליחים' });
  }
});

// ניתוח אזורים
router.get('/zones', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? moment(startDate).toDate() : moment().subtract(30, 'days').toDate();
    const end = endDate ? moment(endDate).toDate() : new Date();

    const deliveries = await prisma.delivery.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      }
    });

    // קיבוץ לפי אזור
    const zones = {};

    deliveries.forEach(delivery => {
      const pickupZone = delivery.pickupCity || delivery.pickupZone || 'לא ידוע';
      const deliveryZone = delivery.deliveryCity || delivery.deliveryZone || 'לא ידוע';

      // אזור איסוף
      if (!zones[pickupZone]) {
        zones[pickupZone] = {
          pickups: 0,
          deliveries: 0,
          totalRevenue: 0,
          avgDistance: [],
          avgDeliveryTime: []
        };
      }
      zones[pickupZone].pickups++;

      // אזור מסירה
      if (!zones[deliveryZone]) {
        zones[deliveryZone] = {
          pickups: 0,
          deliveries: 0,
          totalRevenue: 0,
          avgDistance: [],
          avgDeliveryTime: []
        };
      }
      zones[deliveryZone].deliveries++;
      zones[deliveryZone].totalRevenue += delivery.finalPrice || 0;

      if (delivery.distance) {
        zones[deliveryZone].avgDistance.push(delivery.distance);
      }

      if (delivery.pickedUpAt && delivery.deliveredAt) {
        const timeMinutes = (delivery.deliveredAt - delivery.pickedUpAt) / 1000 / 60;
        zones[deliveryZone].avgDeliveryTime.push(timeMinutes);
      }
    });

    // חישוב ממוצעים
    Object.keys(zones).forEach(zone => {
      const data = zones[zone];
      
      if (data.avgDistance.length > 0) {
        const sum = data.avgDistance.reduce((a, b) => a + b, 0);
        data.avgDistance = (sum / data.avgDistance.length).toFixed(1);
      } else {
        data.avgDistance = 0;
      }

      if (data.avgDeliveryTime.length > 0) {
        const sum = data.avgDeliveryTime.reduce((a, b) => a + b, 0);
        data.avgDeliveryTime = Math.round(sum / data.avgDeliveryTime.length);
      } else {
        data.avgDeliveryTime = 0;
      }

      data.totalRevenue = Math.round(data.totalRevenue);
    });

    // המרה למערך וסידור
    const zonesArray = Object.keys(zones).map(name => ({
      name,
      ...zones[name]
    }));

    zonesArray.sort((a, b) => (b.pickups + b.deliveries) - (a.pickups + a.deliveries));

    res.json({
      period: {
        start: moment(start).format('DD/MM/YYYY'),
        end: moment(end).format('DD/MM/YYYY')
      },
      zones: zonesArray
    });
  } catch (error) {
    console.error('Zones analytics error:', error);
    res.status(500).json({ error: 'שגיאה בניתוח אזורים' });
  }
});

// ניתוח זמני שיא
router.get('/peak-times', authMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = moment().subtract(parseInt(days), 'days').toDate();

    const deliveries = await prisma.delivery.findMany({
      where: {
        createdAt: { gte: startDate }
      }
    });

    // קיבוץ לפי שעה ויום
    const hourlyData = Array(24).fill(0).map(() => ({ count: 0, revenue: 0 }));
    const weeklyData = Array(7).fill(0).map(() => ({ count: 0, revenue: 0 }));

    const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    deliveries.forEach(delivery => {
      const date = moment(delivery.createdAt);
      const hour = date.hour();
      const day = date.day();

      hourlyData[hour].count++;
      hourlyData[hour].revenue += delivery.finalPrice || 0;

      weeklyData[day].count++;
      weeklyData[day].revenue += delivery.finalPrice || 0;
    });

    // מציאת שעות שיא
    const peakHours = hourlyData
      .map((data, hour) => ({ hour, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // מציאת ימים עמוסים
    const peakDays = weeklyData
      .map((data, day) => ({ day: dayNames[day], ...data }))
      .sort((a, b) => b.count - a.count);

    res.json({
      period: `${days} ימים אחרונים`,
      hourlyData: hourlyData.map((data, hour) => ({
        hour: `${hour}:00`,
        count: data.count,
        revenue: Math.round(data.revenue)
      })),
      weeklyData: weeklyData.map((data, day) => ({
        day: dayNames[day],
        count: data.count,
        revenue: Math.round(data.revenue)
      })),
      peakHours: peakHours.map(h => ({
        hour: `${h.hour}:00-${h.hour + 1}:00`,
        count: h.count,
        revenue: Math.round(h.revenue)
      })),
      peakDays
    });
  } catch (error) {
    console.error('Peak times analytics error:', error);
    res.status(500).json({ error: 'שגיאה בניתוח זמני שיא' });
  }
});

// השוואת ביצועים
router.get('/compare', authMiddleware, async (req, res) => {
  try {
    const { period1Start, period1End, period2Start, period2End } = req.query;

    const getPeriodStats = async (start, end) => {
      const deliveries = await prisma.delivery.findMany({
        where: {
          createdAt: {
            gte: new Date(start),
            lte: new Date(end)
          }
        }
      });

      const completed = deliveries.filter(d => d.status === 'completed');

      return {
        total: deliveries.length,
        completed: completed.length,
        cancelled: deliveries.filter(d => d.status === 'cancelled').length,
        revenue: completed.reduce((sum, d) => sum + (d.finalPrice || 0), 0),
        avgDistance: completed.length > 0
          ? completed.reduce((sum, d) => sum + (d.distance || 0), 0) / completed.length
          : 0
      };
    };

    const period1 = await getPeriodStats(period1Start, period1End);
    const period2 = await getPeriodStats(period2Start, period2End);

    // חישוב שינויים באחוזים
    const changes = {
      total: period1.total > 0 ? (((period2.total - period1.total) / period1.total) * 100).toFixed(1) : 0,
      completed: period1.completed > 0 ? (((period2.completed - period1.completed) / period1.completed) * 100).toFixed(1) : 0,
      revenue: period1.revenue > 0 ? (((period2.revenue - period1.revenue) / period1.revenue) * 100).toFixed(1) : 0
    };

    res.json({
      period1: {
        dates: `${moment(period1Start).format('DD/MM/YYYY')} - ${moment(period1End).format('DD/MM/YYYY')}`,
        stats: {
          ...period1,
          revenue: Math.round(period1.revenue),
          avgDistance: period1.avgDistance.toFixed(1)
        }
      },
      period2: {
        dates: `${moment(period2Start).format('DD/MM/YYYY')} - ${moment(period2End).format('DD/MM/YYYY')}`,
        stats: {
          ...period2,
          revenue: Math.round(period2.revenue),
          avgDistance: period2.avgDistance.toFixed(1)
        }
      },
      changes
    });
  } catch (error) {
    console.error('Compare analytics error:', error);
    res.status(500).json({ error: 'שגיאה בהשוואת תקופות' });
  }
});

module.exports = router;
