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

    const timer = setTimeout(finishSplash, 650);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFinish]);

  return null;
};

export default SplashScreen;
