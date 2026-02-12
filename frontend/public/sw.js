const CACHE_NAME = 'shiftjet-v2';
const urlsToCache = [
  '/',
  '/index.html'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Keep Service Worker alive - periodic sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'keepalive') {
    console.log('Periodic sync - keeping SW alive');
  }
});

// Push notification event - BACKGROUND NOTIFICATIONS
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let data = {
    title: '🔔 YENİ SİPARİŞ!',
    body: 'Yeni bir sipariş atandı',
    tag: 'new-order',
    orderNumber: '',
    restaurantName: ''
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('Push data parse error:', e);
    }
  }
  
  const options = {
    body: data.body || `${data.restaurantName} - ${data.orderNumber}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'new-order',
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500, 200, 500],
    actions: [
      { action: 'open', title: 'Aç' },
      { action: 'dismiss', title: 'Kapat' }
    ],
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('/courier') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/courier');
        }
      })
  );
});

// Message event - for communication with main app
self.addEventListener('message', event => {
  console.log('SW received message:', event.data);
  
  if (event.data && event.data.type === 'NEW_ORDER') {
    const data = event.data.payload;
    
    // Sadece bildirim göster - ses ana uygulamadan çalacak
    self.registration.showNotification('🔔 YENİ SİPARİŞ!', {
      body: `${data.restaurantName}\n${data.orderNumber}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `order-${data.orderId}`,
      requireInteraction: true,
      silent: true,
      data: data
    });
  }
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Chrome extensions
  if (event.request.method !== 'GET' || event.request.url.includes('chrome-extension')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});
