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
      // Poll for updates every 60 seconds while the app is open
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 1000);
      }
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
