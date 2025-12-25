// ==========================================
// M.M.H DELIVERY - SERVICE WORKER
// Push Notifications + Offline Support
// ==========================================

const CACHE_NAME = 'mmh-delivery-v2'; // Changed from v1 to v2
const urlsToCache = [
  '/',
  '/customer/order.html',
  '/customer/login.html',
  '/customer/dashboard.html',
  '/courier',
  '/assets/logo.png',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Clone the request
        const fetchRequest = event.request.clone();
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // Clone the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================

// Listen for push events
self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received:', event);

  let notificationData = {
    title: 'M.M.H Delivery',
    body: 'יש לך עדכון חדש!',
    icon: '/assets/logo.png',
    badge: '/assets/badge.png',
    vibrate: [200, 100, 200],
    tag: 'mmh-notification',
    requireInteraction: false,
    data: {
      url: '/'
    }
  };

  // Parse notification data if available
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const promiseChain = self.registration.showNotification(
    notificationData.title,
    {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      vibrate: notificationData.vibrate,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
      actions: notificationData.actions || []
    }
  );

  event.waitUntil(promiseChain);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification clicked:', event);

  event.notification.close();

  // Get the URL to open
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Check if app is already open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if app not open
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('❌ Notification closed:', event);
  // Optional: Track analytics
});

console.log('✅ Service Worker loaded successfully');
