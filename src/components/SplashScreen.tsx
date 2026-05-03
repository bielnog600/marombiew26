import { useEffect } from 'react';

const APP_SW_PATH = '/app-sw.js';

const isPreviewOrIframe = () => {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  return isInIframe || window.location.hostname.includes('id-preview--');
};

const showUpdateText = (boot: HTMLElement | null) => {
  if (!boot) return;

  let status = boot.querySelector<HTMLElement>('[data-splash-update-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.splashUpdateStatus = 'true';
    status.textContent = 'Atualizando o app...';
    status.style.position = 'absolute';
    status.style.left = '24px';
    status.style.right = '24px';
    status.style.top = 'calc(50% + 118px)';
    status.style.margin = '0';
    status.style.textAlign = 'center';
    status.style.fontFamily = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    status.style.fontSize = '12px';
    status.style.fontWeight = '600';
    status.style.letterSpacing = '0';
    status.style.color = 'hsl(var(--primary, 45 100% 50%))';
    status.style.opacity = '0.92';
    boot.appendChild(status);
  }
};

const checkAndApplyServiceWorkerUpdate = async (boot: HTMLElement | null) => {
  if (!('serviceWorker' in navigator) || !navigator.onLine || isPreviewOrIframe()) return false;

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration || !registration.active?.scriptURL.endsWith(APP_SW_PATH)) return false;

  const activateAndReload = async () => {
    showUpdateText(boot);
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 4000);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
    window.location.reload();
  };

  if (registration.waiting) {
    await activateAndReload();
    return true;
  }

  const updateDetected = new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(() => resolve(false), 3500);

    registration.addEventListener(
      'updatefound',
      () => {
        const worker = registration.installing;
        if (!worker) {
          window.clearTimeout(timeout);
          resolve(false);
          return;
        }

        showUpdateText(boot);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' || worker.state === 'activated') {
            window.clearTimeout(timeout);
            resolve(true);
          }
        });
      },
      { once: true }
    );
  });

  await registration.update().catch(() => undefined);
  const shouldReload = await updateDetected;
  if (!shouldReload) return false;

  await activateAndReload();
  return true;
};

/**
 * SplashScreen does NOT render its own visuals. The splash UI lives in
 * index.html as #boot-splash so it appears instantly (even before React/CSS).
 * This component just controls the fade-out + onFinish handover, so the logo
 * and spinner stay perfectly fixed (no remount/jump) from boot to app ready.
 */
const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const boot = document.getElementById('boot-splash');
    let cancelled = false;

    const finishSplash = () => {
      if (cancelled) return;
      if (boot) {
        boot.classList.add('boot-leaving');
        setTimeout(() => {
          if (cancelled) return;
          boot.remove();
          onFinish();
        }, 340);
      } else {
        onFinish();
      }
    };

    const timer = setTimeout(async () => {
      const updateHandled = await checkAndApplyServiceWorkerUpdate(boot).catch(() => false);
      if (!updateHandled) finishSplash();
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFinish]);

  return null;
};

export default SplashScreen;
