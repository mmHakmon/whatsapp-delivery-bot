// ==========================================
// M.M.H DELIVERY - ALL-IN-ONE PUSH SYSTEM
// הכל בקובץ אחד - תמיד עובד!
// ==========================================

console.log('🔔 Loading all-in-one push system...');

// ==========================================
// PART 1: PUSH MANAGER
// ==========================================

class PushNotificationManager {
  constructor() {
    this.vapidPublicKey = null;
    this.subscription = null;
    this.userType = null;
    this.userId = null;
  }

  async init(userType, userId) {
    this.userType = userType;
    this.userId = userId;
    console.log('🔔 Initializing push for:', userType, userId);

    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers not supported');
      return false;
    }

    if (!('PushManager' in window)) {
      console.warn('⚠️ Push not supported');
      return false;
    }

    try {
      const registration = await this.registerServiceWorker();
      await this.fetchVapidKey();
      const permission = await this.requestPermission();
      
      if (permission === 'granted') {
        await this.subscribeToPush(registration);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Push init failed:', error);
      return false;
    }
  }

  async registerServiceWorker() {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registered');
    await navigator.serviceWorker.ready;
    return registration;
  }

  async fetchVapidKey() {
    const response = await fetch('/api/push/vapid-key');
    const data = await response.json();
    this.vapidPublicKey = data.publicKey;
    console.log('✅ VAPID key fetched');
  }

  async requestPermission() {
    const permission = await Notification.requestPermission();
    console.log('🔔 Permission:', permission);
    return permission;
  }

  async subscribeToPush(registration) {
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });
      console.log('✅ New subscription created');
    } else {
      console.log('✅ Already subscribed');
    }

    this.subscription = subscription;
    await this.sendSubscriptionToServer(subscription);
    return subscription;
  }

  async sendSubscriptionToServer(subscription) {
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
      console.error('❌ Failed to send subscription');
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Create global instance
window.pushManager = new PushNotificationManager();
console.log('✅ Push Manager created');

// ==========================================
// PART 2: FLOATING BUTTON
// ==========================================

function isLoggedIn() {
  return !!(localStorage.getItem('customerToken') || localStorage.getItem('courierToken'));
}

function createPushButton() {
  console.log('🔔 Creating push button...');
  console.log('🔔 Logged in?', isLoggedIn());
  console.log('🔔 Notification support?', 'Notification' in window);
  
  if (!('Notification' in window)) {
    console.warn('⚠️ Notifications not supported - button hidden');
    return;
  }

  const permission = Notification.permission;
  let buttonColor = '#f59e0b';
  let buttonText = 'אפשר התראות';
  let buttonIcon = '🔔';
  
  if (permission === 'granted') {
    buttonColor = '#10b981';
    buttonText = 'התראות פעילות';
    buttonIcon = '✅';
  } else if (permission === 'denied') {
    buttonColor = '#ef4444';
    buttonText = 'התראות חסומות';
    buttonIcon = '🔕';
  }

  const btn = document.createElement('button');
  btn.id = 'pushBtn';
  btn.style.cssText = `
    position: fixed;
    top: 80px;
    left: 20px;
    z-index: 9999;
    background: ${buttonColor};
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 25px;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: 'Heebo', sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  btn.innerHTML = `<span style="font-size: 18px;">${buttonIcon}</span><span>${buttonText}</span>`;
  
  document.body.appendChild(btn);
  console.log('✅ Button added to page');

  btn.onclick = async function() {
    console.log('🔔 Button clicked! Permission:', Notification.permission);
    
    if (!isLoggedIn()) {
      alert('⚠️ התחבר קודם!');
      window.location.href = '/customer/login.html';
      return;
    }

    if (Notification.permission === 'denied') {
      alert('❌ ההרשאה חסומה.\n\nהגדרות → Safari/Chrome → התראות → אפשר');
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification('M.M.H Delivery', {
        body: 'ההתראות פעילות! ✅',
        icon: '/assets/logo.png'
      });
      return;
    }

    // Request permission
    btn.innerHTML = '<span>⏳ מבקש הרשאה...</span>';
    
    try {
      const perm = await Notification.requestPermission();
      console.log('Permission result:', perm);
      
      if (perm === 'granted') {
        btn.style.background = '#10b981';
        btn.innerHTML = '<span style="font-size: 18px;">✅</span><span>מפעיל...</span>';
        
        const userType = localStorage.getItem('customerToken') ? 'customer' : 'courier';
        const userData = JSON.parse(localStorage.getItem(`${userType}Data`) || '{"id":1}');
        
        console.log('Initializing for user:', userType, userData.id);
        const result = await window.pushManager.init(userType, userData.id);
        
        if (result) {
          btn.innerHTML = '<span style="font-size: 18px;">✅</span><span>התראות פעילות</span>';
          
          new Notification('M.M.H Delivery', {
            body: 'התראות הופעלו בהצלחה! 🎉',
            icon: '/assets/logo.png'
          });
        } else {
          btn.innerHTML = '<span style="font-size: 18px;">❌</span><span>נכשל</span>';
          alert('❌ לא הצלחנו להפעיל התראות');
        }
      } else {
        btn.innerHTML = '<span style="font-size: 18px;">🔔</span><span>אפשר התראות</span>';
      }
    } catch (error) {
      console.error('Error:', error);
      btn.innerHTML = '<span style="font-size: 18px;">❌</span><span>שגיאה</span>';
      alert('שגיאה: ' + error.message);
    }
  };
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createPushButton);
} else {
  createPushButton();
}

console.log('✅ All-in-one push system loaded');
