# App update rules

- Lazy screens use `lazyWithRetry` (one reload per sessionStorage window) so a missing chunk after a deploy recovers without reload loops.
- PWA uses prompt mode; `appUpdates` applies a waiting SW only on hidden (localStorage cooldown, never the same waiting id twice) or tap, never while `useHoldAppUpdate` holds, and reloads once only on controllerchange, so a SW stuck in waiting (two installed PWAs on one origin) cannot loop.
