// Does no caching. It only exists so the browser offers "Install Home Base".
// Every request goes straight to the network, so it can never show stale data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => event.respondWith(fetch(event.request)));
