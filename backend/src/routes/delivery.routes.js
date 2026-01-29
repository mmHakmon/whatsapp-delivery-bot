const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');
const pricingService = require('../services/pricing.service');
const whatsappService = require('../services/whatsapp.service');
const aiService = require('../services/ai.service');

// יצירת משלוח חדש
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      vehicleType,
      packageType,
      pickupAddress,
      deliveryAddress,
      customerFromPhone,
      customerFromName,
      customerToPhone,
      customerToName,
      notes,
      priority
    } = req.body;

    // חישוב מרחק ומחיר
    const { distanceKm, durationMinutes } = await pricingService.calculateDistance(
      pickupAddress,
      deliveryAddress
    );

    const isNightDelivery = pricingService.isNightTime();
    const pricing = pricingService.calculatePrice(vehicleType, distanceKm, isNightDelivery);

    // חיזוי זמן AI
    const aiPrediction = await aiService.predictDeliveryTime(
      pickupAddress.split(',')[0], // City
      deliveryAddress.split(',')[0],
      distanceKm
    );

    // יצירת משלוח
    const delivery = await prisma.delivery.create({
      data: {
        vehicleType,
        packageType,
        pickupAddress,
        deliveryAddress,
        distance: distanceKm,
        basePrice: pricing.basePrice,
        pricePerKm: pricing.pricePerKm,
        totalPrice: pricing.totalPrice,
        vatAmount: pricing.vatAmount,
        finalPrice: pricing.finalPrice,
        courierEarnings: pricing.courierEarnings,
        companyEarnings: pricing.companyEarnings,
        nightSurcharge: pricing.nightSurcharge,
        isNightDelivery,
        customerFromPhone,
        customerFromName,
        customerToPhone,
        customerToName,
        notes,
        priority: priority || 0,
        estimatedPickupTime: durationMinutes,
        estimatedDeliveryTime: aiPrediction.predictedMinutes,
        createdById: req.user.id,
        status: 'pending'
      }
    });

    // הודעה ללקוח שמחפשים שליח
    await whatsappService.notifyCustomerSearching(delivery);

    // פרסום לקבוצת שליחים
    await whatsappService.publishDeliveryToGroup(delivery);

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('new-delivery', delivery);

    res.json({
      success: true,
      delivery,
      pricing,
      aiPrediction
    });
  } catch (error) {
    console.error('Create delivery error:', error);
    res.status(500).json({ error: 'שגיאה ביצירת משלוח', details: error.message });
  }
});

// קבלת כל המשלוחים
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, date, courierId } = req.query;

    const where = {};
    
    if (status) where.status = status;
    if (courierId) where.courierId = parseInt(courierId);
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        courier: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ deliveries });
  } catch (error) {
    console.error('Get deliveries error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת משלוחים' });
  }
});

// קבלת משלוח ספציפי
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        courier: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        chats: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                role: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    res.json({ delivery });
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת משלוח' });
  }
});

// תפיסת משלוח על ידי שליח
router.post('/:id/claim', async (req, res) => {
  try {
    const { courierId } = req.body;
    const deliveryId = parseInt(req.params.id);

    // בדיקה אם השליח בבלאקליסט
    const blacklist = await prisma.courierBlacklist.findFirst({
      where: {
        courierId,
        isActive: true,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } }
        ]
      }
    });

    if (blacklist) {
      return res.status(403).json({ error: 'השליח חסום כרגע מלקחת משלוחים' });
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    if (delivery.status !== 'published') {
      return res.status(400).json({ error: 'המשלוח כבר נתפס' });
    }

    const courier = await prisma.courier.findUnique({
      where: { id: courierId }
    });

    if (!courier || !courier.isActive) {
      return res.status(400).json({ error: 'שליח לא פעיל' });
    }

    // עדכון משלוח
    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'claimed',
        courierId,
        claimedAt: new Date()
      },
      include: {
        courier: true
      }
    });

    // הודעה ללקוח
    await whatsappService.notifyCustomerCourierAssigned(updatedDelivery, courier);

    // הודעה לשליח עם פרטי איסוף
    await whatsappService.notifyPickupDetails(updatedDelivery, courier);

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('delivery-claimed', updatedDelivery);

    res.json({
      success: true,
      delivery: updatedDelivery
    });
  } catch (error) {
    console.error('Claim delivery error:', error);
    res.status(500).json({ error: 'שגיאה בתפיסת משלוח' });
  }
});

// איסוף משלוח
router.post('/:id/pickup', async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { courierId } = req.body;

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { courier: true }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    if (delivery.courierId !== courierId) {
      return res.status(403).json({ error: 'המשלוח לא משויך לשליח זה' });
    }

    if (delivery.status !== 'claimed') {
      return res.status(400).json({ error: 'סטטוס משלוח לא תקין' });
    }

    // עדכון סטטוס
    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'picked_up',
        pickedUpAt: new Date()
      },
      include: { courier: true }
    });

    // הודעה ללקוח שהחבילה נאספה
    await whatsappService.notifyCustomerPickedUp(updatedDelivery, delivery.courier);

    // הודעה לשליח עם פרטי מסירה
    await whatsappService.notifyDeliveryDetails(updatedDelivery, delivery.courier);

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('delivery-picked-up', updatedDelivery);

    res.json({
      success: true,
      delivery: updatedDelivery
    });
  } catch (error) {
    console.error('Pickup delivery error:', error);
    res.status(500).json({ error: 'שגיאה באיסוף משלוח' });
  }
});

// מסירת משלוח
router.post('/:id/deliver', async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { courierId } = req.body;

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { courier: true }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    if (delivery.courierId !== courierId) {
      return res.status(403).json({ error: 'המשלוח לא משויך לשליח זה' });
    }

    if (delivery.status !== 'picked_up') {
      return res.status(400).json({ error: 'סטטוס משלוח לא תקין' });
    }

    // עדכון סטטוס
    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'completed',
        deliveredAt: new Date(),
        completedAt: new Date()
      },
      include: { courier: true }
    });

    // עדכון סטטיסטיקות שליח
    await prisma.courier.update({
      where: { id: courierId },
      data: {
        totalDeliveries: { increment: 1 },
        completedDeliveries: { increment: 1 },
        totalEarnings: { increment: delivery.courierEarnings }
      }
    });

    // עדכון ביצועים יומיים
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.courierPerformance.upsert({
      where: {
        courierId_date: {
          courierId,
          date: today
        }
      },
      create: {
        courierId,
        date: today,
        totalDeliveries: 1,
        completedDeliveries: 1,
        totalEarnings: delivery.courierEarnings
      },
      update: {
        totalDeliveries: { increment: 1 },
        completedDeliveries: { increment: 1 },
        totalEarnings: { increment: delivery.courierEarnings }
      }
    });

    // שמירת נתוני למידה ל-AI
    await aiService.saveDeliveryLearning(updatedDelivery);

    // הודעות
    await whatsappService.notifyDeliveryCompleted(updatedDelivery, delivery.courier);
    await whatsappService.notifyCustomerDelivered(updatedDelivery);

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('delivery-completed', updatedDelivery);

    res.json({
      success: true,
      delivery: updatedDelivery
    });
  } catch (error) {
    console.error('Deliver error:', error);
    res.status(500).json({ error: 'שגיאה במסירת משלוח' });
  }
});

// ביטול משלוח
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { reason } = req.body;

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { courier: true }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'cancelled',
        notes: delivery.notes ? `${delivery.notes}\n\nביטול: ${reason}` : `ביטול: ${reason}`
      }
    });

    // אם יש שליח משויך - עדכון סטטיסטיקות
    if (delivery.courierId) {
      await prisma.courier.update({
        where: { id: delivery.courierId },
        data: {
          cancelledDeliveries: { increment: 1 }
        }
      });

      // בדיקת ביטולים חוזרים
      const alertService = require('../services/alert.service');
      await alertService.checkCourierCancellations(delivery.courierId);
    }

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.emit('delivery-cancelled', updatedDelivery);

    res.json({
      success: true,
      delivery: updatedDelivery
    });
  } catch (error) {
    console.error('Cancel delivery error:', error);
    res.status(500).json({ error: 'שגיאה בביטול משלוח' });
  }
});

// ניווט אוטומטי
router.get('/:id/navigation', async (req, res) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!delivery) {
      return res.status(404).json({ error: 'משלוח לא נמצא' });
    }

    let address;
    if (delivery.status === 'claimed') {
      address = delivery.pickupAddress;
    } else if (delivery.status === 'picked_up') {
      address = delivery.deliveryAddress;
    } else {
      return res.status(400).json({ error: 'ניווט לא זמין עבור סטטוס זה' });
    }

    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

    res.json({
      address,
      wazeUrl,
      googleMapsUrl
    });
  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({ error: 'שגיאה בניווט' });
  }
});

module.exports = router;
