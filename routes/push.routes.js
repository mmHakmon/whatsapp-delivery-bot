const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ==========================================
// VAPID KEYS SETUP
// ==========================================
// Generate VAPID keys once: npx web-push generate-vapid-keys
// Then add to .env file

const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

webpush.setVapidDetails(
  'mailto:' + process.env.SUPPORT_EMAIL || 'support@mmh-delivery.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ==========================================
// GET VAPID PUBLIC KEY
// ==========================================
router.get('/vapid-key', (req, res) => {
  res.json({
    publicKey: vapidKeys.publicKey
  });
});

// ==========================================
// SUBSCRIBE TO PUSH NOTIFICATIONS
// ==========================================
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription, userType, userId } = req.body;

    if (!subscription || !userType || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store subscription in database
    await pool.query(`
      INSERT INTO push_subscriptions (user_type, user_id, endpoint, keys, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (endpoint) 
      DO UPDATE SET 
        user_type = $1,
        user_id = $2,
        keys = $4,
        updated_at = NOW()
    `, [
      userType,
      userId,
      subscription.endpoint,
      JSON.stringify(subscription.keys)
    ]);

    console.log(`✅ Push subscription saved for ${userType} ${userId}`);

    res.json({ 
      success: true,
      message: 'Subscribed to push notifications' 
    });
  } catch (error) {
    console.error('❌ Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// ==========================================
// UNSUBSCRIBE FROM PUSH NOTIFICATIONS
// ==========================================
router.post('/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body;

    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1',
      [endpoint]
    );

    console.log('✅ Push subscription removed');

    res.json({ 
      success: true,
      message: 'Unsubscribed from push notifications' 
    });
  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// ==========================================
// SEND PUSH NOTIFICATION (INTERNAL USE)
// ==========================================
async function sendPushNotification(userType, userId, payload) {
  try {
    // Get user's subscriptions
    const result = await pool.query(
      'SELECT endpoint, keys FROM push_subscriptions WHERE user_type = $1 AND user_id = $2',
      [userType, userId]
    );

    if (result.rows.length === 0) {
      console.log(`⚠️ No push subscriptions found for ${userType} ${userId}`);
      return { sent: 0, failed: 0 };
    }

    const notifications = result.rows.map(async (sub) => {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: JSON.parse(sub.keys)
        };

        await webpush.sendNotification(subscription, JSON.stringify(payload));
        console.log(`✅ Push sent to ${userType} ${userId}`);
        return { success: true };
      } catch (error) {
        console.error(`❌ Push send failed for ${userType} ${userId}:`, error);
        
        // If subscription is invalid, remove it
        if (error.statusCode === 410) {
          await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [sub.endpoint]
          );
          console.log('🗑️ Removed invalid subscription');
        }
        
        return { success: false };
      }
    });

    const results = await Promise.all(notifications);
    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return { sent, failed };
  } catch (error) {
    console.error('❌ Send push notification error:', error);
    return { sent: 0, failed: 1 };
  }
}

// ==========================================
// NOTIFICATION TEMPLATES
// ==========================================

// New order for customer
async function notifyCustomerNewOrder(customerId, order) {
  await sendPushNotification('customer', customerId, {
    title: '✅ הזמנה חדשה נוצרה',
    body: `הזמנה ${order.order_number} נוצרה בהצלחה!`,
    icon: '/assets/logo.png',
    badge: '/assets/badge.png',
    vibrate: [200, 100, 200],
    data: {
      url: `/customer/track.html?order=${order.order_number}`,
      orderNumber: order.order_number
    }
  });
}

// Courier assigned to order (customer)
async function notifyCustomerCourierAssigned(customerId, order, courier) {
  await sendPushNotification('customer', customerId, {
    title: '🏍️ שליח נמצא!',
    body: `${courier.first_name} בדרך לאסוף את החבילה שלך`,
    icon: '/assets/logo.png',
    data: {
      url: `/customer/track.html?order=${order.order_number}`
    }
  });
}

// Package picked up (customer)
async function notifyCustomerPackagePicked(customerId, order) {
  await sendPushNotification('customer', customerId, {
    title: '📦 החבילה נאספה',
    body: `הזמנה ${order.order_number} בדרך למסירה`,
    icon: '/assets/logo.png',
    data: {
      url: `/customer/track.html?order=${order.order_number}`
    }
  });
}

// Package delivered (customer)
async function notifyCustomerDelivered(customerId, order) {
  await sendPushNotification('customer', customerId, {
    title: '✅ נמסר בהצלחה!',
    body: `הזמנה ${order.order_number} נמסרה ליעד`,
    icon: '/assets/logo.png',
    data: {
      url: `/customer/dashboard.html`
    },
    actions: [
      {
        action: 'rate',
        title: 'דרג את השליח'
      }
    ]
  });
}

// New order available (courier)
async function notifyNewOrderAvailable(order) {
  // Broadcast to all active couriers
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_id FROM push_subscriptions 
       WHERE user_type = 'courier'`
    );

    const notifications = result.rows.map(async (row) => {
      await sendPushNotification('courier', row.user_id, {
        title: '🆕 משלוח חדש זמין!',
        body: `${order.distance_km} ק"מ | ₪${order.courier_payout}`,
        icon: '/assets/logo.png',
        requireInteraction: true,
        data: {
          url: `/courier?order=${order.id}`,
          orderId: order.id
        },
        actions: [
          {
            action: 'view',
            title: 'צפה במשלוח'
          },
          {
            action: 'take',
            title: 'תפוס!'
          }
        ]
      });
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error('❌ Broadcast to couriers failed:', error);
  }
}

// Order taken by another courier
async function notifyCourierOrderTaken(courierId, order) {
  await sendPushNotification('courier', courierId, {
    title: '😔 המשלוח נתפס',
    body: `משלוח ${order.order_number} כבר נלקח על ידי שליח אחר`,
    icon: '/assets/logo.png',
    data: {
      url: '/courier'
    }
  });
}

// Payment approved (courier)
async function notifyCourierPaymentApproved(courierId, amount) {
  await sendPushNotification('courier', courierId, {
    title: '💰 תשלום אושר!',
    body: `בקשת משיכה בסך ₪${amount} אושרה`,
    icon: '/assets/logo.png',
    data: {
      url: '/courier?tab=payments'
    }
  });
}

// Export notification functions
module.exports = {
  router,
  sendPushNotification,
  notifyCustomerNewOrder,
  notifyCustomerCourierAssigned,
  notifyCustomerPackagePicked,
  notifyCustomerDelivered,
  notifyNewOrderAvailable,
  notifyCourierOrderTaken,
  notifyCourierPaymentApproved
};
