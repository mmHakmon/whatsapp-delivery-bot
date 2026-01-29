const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');

// קבלת כל ההודעות של משלוח
router.get('/:deliveryId', authMiddleware, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);

    const messages = await prisma.chat.findMany({
      where: { deliveryId },
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
    });

    res.json({ messages });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({ error: 'שגיאה בשליפת הודעות' });
  }
});

// שליחת הודעה חדשה
router.post('/:deliveryId/send', authMiddleware, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);
    const { message } = req.body;

    const chatMessage = await prisma.chat.create({
      data: {
        deliveryId,
        senderId: req.user.id,
        senderType: req.user.role,
        message
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    // שידור בזמן אמת
    const io = req.app.get('io');
    io.to(`delivery-${deliveryId}`).emit('new-message', chatMessage);

    res.json({
      success: true,
      message: chatMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'שגיאה בשליחת הודעה' });
  }
});

// סימון הודעות כנקראו
router.put('/:deliveryId/read', authMiddleware, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);

    await prisma.chat.updateMany({
      where: {
        deliveryId,
        senderId: { not: req.user.id },
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הודעות' });
  }
});

// ספירת הודעות לא נקראות
router.get('/:deliveryId/unread-count', authMiddleware, async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.deliveryId);

    const count = await prisma.chat.count({
      where: {
        deliveryId,
        senderId: { not: req.user.id },
        isRead: false
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'שגיאה בספירת הודעות' });
  }
});

module.exports = router;
