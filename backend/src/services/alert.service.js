const prisma = require('../config/database');
const whapi = require('../config/whapi');

const alertService = {
  // בדיקת משלוחים שלא נתפסו תוך 10 דקות
  async checkUnclaimedDeliveries() {
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      const unclaimedDeliveries = await prisma.delivery.findMany({
        where: {
          status: 'published',
          publishedAt: {
            lte: tenMinutesAgo
          }
        }
      });

      for (const delivery of unclaimedDeliveries) {
        // יצירת התראה
        await prisma.alert.create({
          data: {
            alertType: 'delivery_not_claimed',
            deliveryId: delivery.id,
            message: `משלוח ${delivery.orderNumber} לא נתפס תוך 10 דקות`
          }
        });

        console.log(`⚠️ Alert: Delivery ${delivery.orderNumber} not claimed`);
      }
    } catch (error) {
      console.error('Error checking unclaimed deliveries:', error);
    }
  },

  // בדיקת שליחים תקועים (לא מתקדמים)
  async checkStuckCouriers() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      const stuckDeliveries = await prisma.delivery.findMany({
        where: {
          status: {
            in: ['claimed', 'picked_up']
          },
          claimedAt: {
            lte: thirtyMinutesAgo
          }
        },
        include: {
          courier: true
        }
      });

      for (const delivery of stuckDeliveries) {
        // בדיקה אם כבר יש התראה פתוחה
        const existingAlert = await prisma.alert.findFirst({
          where: {
            deliveryId: delivery.id,
            alertType: 'courier_stuck',
            isResolved: false
          }
        });

        if (!existingAlert) {
          await prisma.alert.create({
            data: {
              alertType: 'courier_stuck',
              deliveryId: delivery.id,
              courierId: delivery.courierId,
              message: `שליח ${delivery.courier.name} תקוע במשלוח ${delivery.orderNumber} מעל 30 דקות`
            }
          });

          console.log(`⚠️ Alert: Courier ${delivery.courier.name} stuck on delivery ${delivery.orderNumber}`);
        }
      }
    } catch (error) {
      console.error('Error checking stuck couriers:', error);
    }
  },

  // בדיקת שליחים עם ביטולים חוזרים
  async checkCourierCancellations(courierId) {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const cancelledCount = await prisma.delivery.count({
        where: {
          courierId,
          status: 'cancelled',
          updatedAt: {
            gte: last24Hours
          }
        }
      });

      // אם יש 3 ביטולים או יותר ב-24 שעות האחרונות
      if (cancelledCount >= 3) {
        const courier = await prisma.courier.findUnique({
          where: { id: courierId }
        });

        // בדיקה אם כבר בבלאקליסט
        const existingBlacklist = await prisma.courierBlacklist.findFirst({
          where: {
            courierId,
            isActive: true
          }
        });

        if (!existingBlacklist) {
          // הוספה לבלאקליסט ל-24 שעות
          await prisma.courierBlacklist.create({
            data: {
              courierId,
              reason: `${cancelledCount} ביטולים ב-24 שעות האחרונות`,
              endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
              createdById: 1 // System
            }
          });

          // שליחת התראה למנהלים
          await prisma.alert.create({
            data: {
              alertType: 'courier_cancelled_multiple',
              courierId,
              message: `שליח ${courier.name} בוטל ${cancelledCount} משלוחים ב-24 שעות והועבר לבלאקליסט`
            }
          });

          console.log(`⚠️ Courier ${courier.name} blacklisted for multiple cancellations`);
        }
      }
    } catch (error) {
      console.error('Error checking courier cancellations:', error);
    }
  },

  // קבלת כל ההתראות הפעילות
  async getActiveAlerts() {
    return await prisma.alert.findMany({
      where: {
        isResolved: false
      },
      include: {
        delivery: true,
        courier: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  },

  // סימון התראה כנקראה
  async markAsRead(alertId) {
    return await prisma.alert.update({
      where: { id: alertId },
      data: { isRead: true }
    });
  },

  // פתרון התראה
  async resolveAlert(alertId) {
    return await prisma.alert.update({
      where: { id: alertId },
      data: { 
        isResolved: true,
        resolvedAt: new Date()
      }
    });
  }
};

module.exports = alertService;
