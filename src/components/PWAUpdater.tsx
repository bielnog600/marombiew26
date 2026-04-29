import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

/**
 * Listens for new service worker versions and reloads the app automatically
 * so the user always gets the latest deploy without needing to close/reopen.
 *
 * Also polls every 60s to detect updates while the app stays open.
 */
const PWAUpdater = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      // Check immediately on registration
      registration.update().catch(() => {});

      // Poll for updates every 30 seconds while the app is open
      const interval = setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 1000);

      // Check for updates when app regains focus (critical for iOS PWA reopens)
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      window.addEventListener('pageshow', onVisible);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
        window.removeEventListener('pageshow', onVisible);
      };
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast.info('Nova versão disponível. Atualizando...', { duration: 1200 });
      // Activate the new SW and force a hard reload immediately
      const t = setTimeout(async () => {
        try {
          // Clear all caches before reloading to guarantee fresh assets
          if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
        } catch {}
        await updateServiceWorker(true);
        // Belt-and-suspenders: force reload after activating SW
        window.location.reload();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
};

export default PWAUpdater;
