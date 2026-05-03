// Passive kill-switch: clears caches and unregisters itself without reloading pages
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  await self.clients.claim();
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  await self.registration.unregister();
})()));
