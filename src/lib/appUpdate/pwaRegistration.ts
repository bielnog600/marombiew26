import { Workbox } from 'workbox-window';
import { appUpdates, appRunningVersion, UPDATE_CHECK_INTERVAL_MS } from './updateController';

const isInIframe = () => {
  try { return window.self !== window.top; } catch { return true; }
};

export const isLovablePreviewHost = (hostname = window.location.hostname): boolean => {
  const host = hostname.toLowerCase();
  const firstLabel = host.split('.')[0] ?? '';
  const lovableHosted = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  return (
    (lovableHosted && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(firstLabel)) ||
    (lovableHosted && /^project--.+-dev$/.test(firstLabel)) ||
    host === 'lovableproject.com' || host.endsWith('.lovableproject.com') ||
    host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com') ||
    host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')
  );
};

const isAppSw = (reg: ServiceWorkerRegistration) => {
  const scripts = [reg.active, reg.waiting, reg.installing].filter(Boolean).map(sw => sw!.scriptURL);
  return scripts.some(url => new URL(url).pathname === '/sw.js');
};

export const unregisterAppServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter(isAppSw).map(reg => reg.unregister()));
};

/** Único ponto de registro do app-shell; workers de push ficam intactos. */
export const startPwaUpdates = () => {
  if (!('serviceWorker' in navigator)) return;
  const refused = !import.meta.env.PROD || isInIframe() || isLovablePreviewHost() ||
    new URLSearchParams(window.location.search).get('sw') === 'off';
  if (refused) {
    void unregisterAppServiceWorkers();
    return;
  }

  const wb = new Workbox('/sw.js', { scope: '/', type: 'classic' });
  let swRegistration: ServiceWorkerRegistration | undefined;
  const waitingId = () => `${swRegistration?.waiting?.scriptURL ?? '/sw.js'}|${appRunningVersion ?? 'unknown'}`;

  navigator.serviceWorker.addEventListener('controllerchange', () => appUpdates.onControllerChange());
  const onNeedRefresh = () => appUpdates.markAvailable(() => wb.messageSkipWaiting(), waitingId());
  wb.addEventListener('waiting', onNeedRefresh);
  wb.addEventListener('installed', event => {
    if (typeof event.isUpdate === 'undefined' && event.isExternal) onNeedRefresh();
  });

  wb.register({ immediate: true }).then(registration => {
    if (!registration) return;
    swRegistration = registration;
    const checkForUpdate = () => {
      if (!navigator.onLine) return;
      registration.update().catch(() => undefined);
    };
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') window.setTimeout(checkForUpdate, 1000);
    });
  }).catch(() => undefined);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') appUpdates.onHidden();
  });
};
