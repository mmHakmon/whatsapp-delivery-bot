// ==========================================
// M.M.H DELIVERY - PUSH NOTIFICATIONS CLIENT
// ==========================================

class PushNotificationManager {
  constructor() {
    this.vapidPublicKey = null; // Will be fetched from server
    this.subscription = null;
    this.userType = null; // 'customer' or 'courier'
    this.userId = null;
  }

  // Initialize push notifications
  async init(userType, userId) {
    this.userType = userType;
    this.userId = userId;

    console.log('🔔 Initializing push notifications for:', userType, userId);

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers not supported');
      return false;
    }

    // Check if push notifications are supported
    if (!('PushManager' in window)) {
      console.warn('⚠️ Push notifications not supported');
      return false;
    }

    try {
      // Register service worker
      const registration = await this.registerServiceWorker();
      
      // Get VAPID public key from server
      await this.fetchVapidKey();
      
      // Request notification permission
      const permission = await this.requestPermission();
      
      if (permission === 'granted') {
        // Subscribe to push notifications
        await this.subscribeToPush(registration);
        return true;
      } else {
        console.log('❌ Notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('❌ Push notification initialization failed:', error);
      return false;
    }
  }

  // Register service worker
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registered:', registration);
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      
      return registration;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      throw error;
    }
  }

  // Fetch VAPID public key from server
  async fetchVapidKey() {
    try {
      const response = await fetch('/api/push/vapid-key');
      const data = await response.json();
      this.vapidPublicKey = data.publicKey;
      console.log('✅ VAPID key fetched');
    } catch (error) {
      console.error('❌ Failed to fetch VAPID key:', error);
      throw error;
    }
  }

  // Request notification permission
  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      console.log('🔔 Notification permission:', permission);
      return permission;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      throw error;
    }
  }

  // Subscribe to push notifications
  async subscribeToPush(registration) {
    try {
      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        console.log('✅ Already subscribed to push');
        this.subscription = subscription;
      } else {
        // Create new subscription
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
        });
        
        console.log('✅ New push subscription created');
        this.subscription = subscription;
      }

      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      
      return subscription;
    } catch (error) {
      console.error('❌ Push subscription failed:', error);
      throw error;
    }
  }

  // Send subscription to server
  async sendSubscriptionToServer(subscription) {
    try {
      const token = localStorage.getItem(`${this.userType}Token`);
      
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userType: this.userType,
          userId: this.userId
        })
      });

      if (response.ok) {
        console.log('✅ Subscription sent to server');
      } else {
        console.error('❌ Failed to send subscription to server');
      }
    } catch (error) {
      console.error('❌ Error sending subscription:', error);
    }
  }

  // Unsubscribe from push notifications
  async unsubscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from server
        const token = localStorage.getItem(`${this.userType}Token`);
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint
          })
        });
        
        console.log('✅ Unsubscribed from push notifications');
        return true;
      }
    } catch (error) {
      console.error('❌ Unsubscribe failed:', error);
      return false;
    }
  }

  // Show prompt to enable notifications
  showEnablePrompt() {
    // Check if already have permission
    if (Notification.permission === 'granted') {
      return;
    }

    // Check if already denied
    if (Notification.permission === 'denied') {
      this.showPermissionDeniedMessage();
      return;
    }

    // Show custom prompt
    const promptHtml = `
      <div id="notificationPrompt" class="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
        <div class="bg-slate-800 rounded-2xl p-6 border border-emerald-500 shadow-2xl">
          <div class="flex items-start gap-4">
            <div class="text-4xl">🔔</div>
            <div class="flex-1">
              <h3 class="text-lg font-bold mb-2">קבל עדכונים בזמן אמת!</h3>
              <p class="text-sm text-slate-300 mb-4">
                אפשר התראות כדי לקבל עדכונים על משלוחים, שליחים חדשים ועוד.
              </p>
              <div class="flex gap-2">
                <button onclick="pushManager.acceptPrompt()" 
                        class="flex-1 bg-emerald-500 hover:bg-emerald-600 font-bold py-2 rounded-lg">
                  אפשר התראות
                </button>
                <button onclick="pushManager.dismissPrompt()" 
                        class="flex-1 bg-slate-700 hover:bg-slate-600 font-bold py-2 rounded-lg">
                  אולי מאוחר יותר
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', promptHtml);
  }

  // Accept prompt and request permission
  async acceptPrompt() {
    this.dismissPrompt();
    const userType = localStorage.getItem('customerToken') ? 'customer' : 'courier';
    const userData = JSON.parse(localStorage.getItem(`${userType}Data`) || '{}');
    await this.init(userType, userData.id);
  }

  // Dismiss prompt
  dismissPrompt() {
    const prompt = document.getElementById('notificationPrompt');
    if (prompt) {
      prompt.remove();
    }
  }

  // Show message when permission is denied
  showPermissionDeniedMessage() {
    console.log('⚠️ Notifications blocked. User needs to enable in browser settings.');
    // Optional: Show instructions to enable
  }

  // Utility: Convert VAPID key
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Test notification
  async testNotification() {
    if (Notification.permission === 'granted') {
      new Notification('M.M.H Delivery - בדיקה', {
        body: 'ההתראות עובדות! 🎉',
        icon: '/assets/logo.png',
        badge: '/assets/badge.png',
        vibrate: [200, 100, 200]
      });
    }
  }
}

// Create global instance
window.pushManager = new PushNotificationManager();

// Auto-initialize on page load (if user is logged in)
window.addEventListener('load', () => {
  // Small delay to not overwhelm on first load
  setTimeout(() => {
    const customerToken = localStorage.getItem('customerToken');
    const courierToken = localStorage.getItem('courierToken');
    
    if (customerToken || courierToken) {
      // Check if permission already granted
      if (Notification.permission === 'granted') {
        const userType = customerToken ? 'customer' : 'courier';
        const userData = JSON.parse(localStorage.getItem(`${userType}Data`) || '{}');
        window.pushManager.init(userType, userData.id);
      } else if (Notification.permission === 'default') {
        // Show prompt after 5 seconds
        setTimeout(() => {
          window.pushManager.showEnablePrompt();
        }, 5000);
      }
    }
  }, 2000);
});

console.log('✅ Push Notification Manager loaded');
