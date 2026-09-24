const CACHE_NAME = 'bodegadk-shell-v2';
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/dist/index.js',
    '/manifest.webmanifest',
    '/images/brand/bodegadk-tab-icon.png',
    '/images/pwa/icon-192.png',
    '/images/pwa/icon-512.png',
    '/images/pwa/maskable-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
    if (url.pathname === '/app-config.js') return;

    if (url.pathname.startsWith('/dist/') || url.pathname === '/styles.css' || url.pathname === '/manifest.webmanifest') {
        event.respondWith(networkFirst(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, '/index.html'));
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            });
        })
    );
});

self.addEventListener('push', (event) => {
    const fallback = {
        title: 'BodegaDK',
        body: 'There is a new update waiting for you.',
        url: '/?view=home',
    };
    const data = readPushPayload(event.data, fallback);
    const options = {
        body: data.body || fallback.body,
        icon: data.icon || '/images/pwa/icon-192.png',
        badge: data.badge || '/images/pwa/icon-192.png',
        tag: data.tag || 'bodegadk',
        data: {
            url: data.url || fallback.url,
        },
    };

    event.waitUntil(self.registration.showNotification(data.title || fallback.title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || '/?view=home', self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if ('focus' in client && client.url === targetUrl) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
            return undefined;
        })
    );
});

function readPushPayload(data, fallback) {
    if (!data) return fallback;
    try {
        return data.json();
    } catch {
        return {
            ...fallback,
            body: data.text(),
        };
    }
}

function networkFirst(request, fallbackKey) {
    return fetch(request)
        .then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(fallbackKey || request, copy));
            }
            return response;
        })
        .catch(() => caches.match(fallbackKey || request));
}
