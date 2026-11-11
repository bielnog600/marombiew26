# App update rules

- Lazy screens use `lazyWithRetry` (one reload per sessionStorage window) so a missing chunk after a deploy recovers without reload loops.
- PWA uses prompt mode registered via workbox-window in main.tsx (`injectRegister: null`, no `virtual:pwa-register`, whose own reload fires on any controller change); `appUpdates` offers updates only when app-version.json differs from the running version, applies on hidden (localStorage cooldown, never the same waiting id twice) or tap, reloads once only on a requested controllerchange, and when the SW never takes over unregisters `/sw.js` + app-shell caches and reloads once per 10 min (then hides the notice 24 h), so a stuck waiting SW on iOS cannot loop.
