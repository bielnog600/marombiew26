import { useEffect } from 'react';

/**
 * SplashScreen does NOT render its own visuals. The splash UI lives in
 * index.html as #boot-splash so it appears instantly (even before React/CSS).
 * This component just controls the fade-out + onFinish handover, so the logo
 * and spinner stay perfectly fixed (no remount/jump) from boot to app ready.
 */
const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const boot = document.getElementById('boot-splash');
    const timer = setTimeout(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration('/').then((reg) => {
          if (reg?.active?.scriptURL.endsWith('/app-sw.js')) reg.update().catch(() => {});
        });
      }
      if (boot) {
        boot.classList.add('boot-leaving');
        setTimeout(() => {
          boot.remove();
          onFinish();
        }, 340);
      } else {
        onFinish();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return null;
};

export default SplashScreen;
