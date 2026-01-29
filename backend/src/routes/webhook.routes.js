const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const whatsappService = require('../services/whatsapp.service');

// Webhook לקבלת הודעות מ-Whapi
router.post('/whatsapp', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.status(200).json({ received: true });
    }

    for (const msg of messages) {
      await handleWhatsAppMessage(msg, req.app);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// טיפול בהודעה מווטסאפ
async function handleWhatsAppMessage(message, app) {
  try {
    const { from, body, type } = message;

    // טיפול בכפתורים אינטראקטיביים
    if (type === 'interactive') {
      const buttonId = message.interactive?.button_reply?.id;

      if (buttonId) {
        await handleButtonClick(buttonId, from, app);
      }
    }

    // טיפול בהודעות טקסט רגילות
    if (type === 'text' && body) {
      await handleTextMessage(body, from);
    }
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
  }
}

// טיפול בלחיצה על כפתור
async function handleButtonClick(buttonId, fromPhone, app) {
  try {
    // תפיסת משלוח
    if (buttonId.startsWith('claim_')) {
      const deliveryId = parseInt(buttonId.replace('claim_', ''));
      
      // מציאת השליח
      const courier = await prisma.courier.findUnique({
        where: { phone: fromPhone }
      });

      if (!courier) {
        return;
      }

      // תפיסת המשלוח
      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId }
      });

      if (delivery && delivery.status === 'published') {
        const updatedDelivery = await prisma.delivery.update({
          where: { id: deliveryId },
          data: {
            status: 'claimed',
            courierId: courier.id,
            claimedAt: new Date()
          },
          include: { courier: true }
        });

        // הודעות
        await whatsappService.notifyCustomerCourierAssigned(updatedDelivery, courier);
        await whatsappService.notifyPickupDetails(updatedDelivery, courier);

        // שידור
        const io = app.get('io');
        io.emit('delivery-claimed', updatedDelivery);
      }
    }

    // אישור איסוף
    if (buttonId.startsWith('picked_')) {
      const deliveryId = parseInt(buttonId.replace('picked_', ''));
      
      const courier = await prisma.courier.findUnique({
        where: { phone: fromPhone }
      });

      if (!courier) return;

      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: { courier: true }
      });

      if (delivery && delivery.courierId === courier.id && delivery.status === 'claimed') {
        const updatedDelivery = await prisma.delivery.update({
          where: { id: deliveryId },
          data: {
            status: 'picked_up',
            pickedUpAt: new Date()
          },
          include: { courier: true }
        });

        await whatsappService.notifyCustomerPickedUp(updatedDelivery, courier);
        await whatsappService.notifyDeliveryDetails(updatedDelivery, courier);

        const io = app.get('io');
        io.emit('delivery-picked-up', updatedDelivery);
      }
    }

    // אישור מסירה
    if (buttonId.startsWith('delivered_')) {
      const deliveryId = parseInt(buttonId.replace('delivered_', ''));
      
      const courier = await prisma.courier.findUnique({
        where: { phone: fromPhone }
      });

      if (!courier) return;

      const delivery = await prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: { courier: true }
      });

      if (delivery && delivery.courierId === courier.id && delivery.status === 'picked_up') {
        const updatedDelivery = await prisma.delivery.update({
          where: { id: deliveryId },
          data: {
            status: 'completed',
            deliveredAt: new Date(),
            completedAt: new Date()
          },
          include: { courier: true }
        });

        // עדכון סטטיסטיקות
        await prisma.courier.update({
          where: { id: courier.id },
          data: {
            totalDeliveries: { increment: 1 },
            completedDeliveries: { increment: 1 },
            totalEarnings: { increment: delivery.courierEarnings }
          }
        });

        // שמירת נתוני למידה
        const aiService = require('../services/ai.service');
        await aiService.saveDeliveryLearning(updatedDelivery);

        await whatsappService.notifyDeliveryCompleted(updatedDelivery, courier);
        await whatsappService.notifyCustomerDelivered(updatedDelivery);

        const io = app.get('io');
        io.emit('delivery-completed', updatedDelivery);
      }
    }
  } catch (error) {
    console.error('Error handling button click:', error);
  }
}

// טיפול בהודעת טקסט
async function handleTextMessage(text, fromPhone) {
  try {
    // כאן ניתן להוסיף לוגיקה נוספת לטיפול בהודעות טקסט
    // לדוגמה: פקודות מיוחדות, שאלות נפוצות וכו'
    
    const lowerText = text.toLowerCase().trim();

    if (lowerText === 'זמין' || lowerText === 'available') {
      const courier = await prisma.courier.findUnique({
        where: { phone: fromPhone }
      });

      if (courier) {
        await prisma.courier.update({
          where: { id: courier.id },
          data: { isAvailable: true }
        });

        const whapi = require('../config/whapi');
        await whapi.sendMessage(fromPhone, '✅ סטטוס שונה לזמין');
      }
    }

    if (lowerText === 'לא זמין' || lowerText === 'unavailable') {
      const courier = await prisma.courier.findUnique({
        where: { phone: fromPhone }
      });

      if (courier) {
        await prisma.courier.update({
          where: { id: courier.id },
          data: { isAvailable: false }
        });

        const whapi = require('../config/whapi');
        await whapi.sendMessage(fromPhone, '⏸️ סטטוס שונה ללא זמין');
      }
    }
  } catch (error) {
    console.error('Error handling text message:', error);
  }
}

module.exports = router;
