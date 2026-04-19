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

      // Poll for updates every 60 seconds while the app is open
      const interval = setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 1000);

      // Check for updates when app regains focus (e.g. user reopens installed PWA)
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast.info('Nova versão disponível. Atualizando...', { duration: 1500 });
      // Activate the new SW and reload immediately
      const t = setTimeout(() => updateServiceWorker(true), 800);
      return () => clearTimeout(t);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
};

export default PWAUpdater;
