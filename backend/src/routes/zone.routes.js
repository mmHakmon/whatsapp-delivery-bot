const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware, adminOnly } = require('../middleware/auth.middleware');

// קבלת כל הזונות
router.get('/', authMiddleware, async (req, res) => {
  try {
    const zones = await prisma.pricingZone.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({ zones });
  } catch (error) {
    console.error('Get zones error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת זונות' });
  }
});

// קבלת זונה ספציפית
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const zone = await prisma.pricingZone.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!zone) {
      return res.status(404).json({ error: 'זונה לא נמצאה' });
    }

    res.json({ zone });
  } catch (error) {
    console.error('Get zone error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת זונה' });
  }
});

// יצירת זונה חדשה
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const {
      name,
      polygon,
      motorcycleBase,
      motorcyclePerKm,
      carBase,
      carPerKm,
      vanBase,
      vanPerKm,
      truckBase,
      truckPerKm,
      nightSurcharge
    } = req.body;

    const zone = await prisma.pricingZone.create({
      data: {
        name,
        polygon,
        motorcycleBase: parseFloat(motorcycleBase),
        motorcyclePerKm: parseFloat(motorcyclePerKm),
        carBase: parseFloat(carBase),
        carPerKm: parseFloat(carPerKm),
        vanBase: parseFloat(vanBase),
        vanPerKm: parseFloat(vanPerKm),
        truckBase: parseFloat(truckBase),
        truckPerKm: parseFloat(truckPerKm),
        nightSurcharge: nightSurcharge ? parseFloat(nightSurcharge) : 1.5
      }
    });

    res.json({
      success: true,
      zone
    });
  } catch (error) {
    console.error('Create zone error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת זונה' });
  }
});

// עדכון זונה
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const {
      name,
      polygon,
      motorcycleBase,
      motorcyclePerKm,
      carBase,
      carPerKm,
      vanBase,
      vanPerKm,
      truckBase,
      truckPerKm,
      nightSurcharge,
      isActive
    } = req.body;

    const zone = await prisma.pricingZone.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        polygon,
        motorcycleBase: motorcycleBase ? parseFloat(motorcycleBase) : undefined,
        motorcyclePerKm: motorcyclePerKm ? parseFloat(motorcyclePerKm) : undefined,
        carBase: carBase ? parseFloat(carBase) : undefined,
        carPerKm: carPerKm ? parseFloat(carPerKm) : undefined,
        vanBase: vanBase ? parseFloat(vanBase) : undefined,
        vanPerKm: vanPerKm ? parseFloat(vanPerKm) : undefined,
        truckBase: truckBase ? parseFloat(truckBase) : undefined,
        truckPerKm: truckPerKm ? parseFloat(truckPerKm) : undefined,
        nightSurcharge: nightSurcharge ? parseFloat(nightSurcharge) : undefined,
        isActive
      }
    });

    res.json({
      success: true,
      zone
    });
  } catch (error) {
    console.error('Update zone error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון זונה' });
  }
});

// מחיקת זונה
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await prisma.pricingZone.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: 'זונה נמחקה בהצלחה'
    });
  } catch (error) {
    console.error('Delete zone error:', error);
    res.status(500).json({ error: 'שגיאה במחיקת זונה' });
  }
});

// בדיקה איזו זונה מכילה כתובת
router.post('/check-address', authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const zones = await prisma.pricingZone.findMany({
      where: { isActive: true }
    });

    // בדיקה האם הנקודה בתוך אחד מהפוליגונים
    const pointInZone = zones.find(zone => {
      const polygon = zone.polygon;
      return isPointInPolygon({ lat, lng }, polygon);
    });

    if (pointInZone) {
      res.json({
        inZone: true,
        zone: pointInZone
      });
    } else {
      res.json({
        inZone: false,
        zone: null
      });
    }
  } catch (error) {
    console.error('Check address error:', error);
    res.status(500).json({ error: 'שגיאה בבדיקת כתובת' });
  }
});

// פונקציה לבדיקה אם נקודה בתוך פוליגון (Ray Casting Algorithm)
function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.lat;
  const y = point.lng;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }

  return inside;
}

module.exports = router;
