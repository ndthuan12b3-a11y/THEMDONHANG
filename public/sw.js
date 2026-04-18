const CACHE_NAME = 'hung-thinh-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
          return fetchResponse;
        }
        const responseToCache = fetchResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return fetchResponse;
      });
    }).catch(() => caches.match('/'))
  );
});

self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const notification = data.notification || {};
    
    // Giao diện (Design) của Thông báo chuyên nghiệp
    const options = {
      body: notification.body,
      icon: notification.icon || '/vite.svg',
      badge: '/vite.svg', // Icon nhỏ đơn sắc trên thanh trạng thái (Android)
      image: notification.image, // Ảnh to đính kèm trong thông báo
      vibrate: [200, 100, 200, 100, 200], // Rung nhịp điệu chú ý
      requireInteraction: true, // Ép thông báo hiển thị cho đến khi người dùng bấm hoặc vuốt (tránh bị trôi mất)
      data: {
        url: notification.data?.url || '/', // Chuyển hướng khi click
        dateOfArrival: Date.now(),
      },
      actions: [
        {
          action: 'open_url',
          title: 'Mở ứng dụng 🚀'
        },
        {
          action: 'close',
          title: 'Đóng ❌'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(notification.title || 'Thông báo mới', options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Xử lý các nút bấm (actions)
  if (event.action === 'close') {
    return; // Không làm gì cả, chỉ đóng
  }

  // Lấy đường dẫn từ data
  const urlToOpen = new URL(event.notification.data.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Nếu có tab/app đang mở thì chuyển focus vào đó
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Nếu chưa mở thì tự động mở web mới
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
