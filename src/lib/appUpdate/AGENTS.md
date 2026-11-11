# App update rules

- Lazy screens use `lazyWithRetry` (one reload per sessionStorage window) so a missing chunk after a deploy recovers without reload loops.
- PWA uses prompt mode without skipWaiting; `appUpdates` applies a waiting SW only on hidden/boot/tap and never while `useHoldAppUpdate` holds, so deploys never reload mid-workout.
