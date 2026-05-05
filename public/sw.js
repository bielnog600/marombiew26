// Passive kill-switch: unregisters itself without destroying workbox caches
self.addEventListener('install', function(e) { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    self.clients.claim()
      .then(function() { return self.registration.unregister(); })
  );
});
