import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Guard: unregister SW in preview/iframe contexts and remove old app workers
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const cleanupServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      const url = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
      const isOldAppWorker = url.endsWith("/sw.js") || url.endsWith("/service-worker.js");
      if (isPreviewHost || isInIframe || isOldAppWorker) {
        await reg.unregister();
      }
    })
  );
};

const startPwaAutoUpdate = () => {
  if (!("serviceWorker" in navigator) || isPreviewHost || isInIframe) return;

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        registration.update().catch(() => undefined);
      };

      const interval = window.setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
      const onVisible = () => {
        if (document.visibilityState === "visible") window.setTimeout(checkForUpdate, 3000);
      };

      document.addEventListener("visibilitychange", onVisible);

      window.addEventListener("beforeunload", () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
      }, { once: true });
    },
  });
};

void cleanupServiceWorkers().then(startPwaAutoUpdate);

// Force portrait behavior as much as the browser allows.
// Native lock works mainly in installed PWAs/Android; CSS class below covers iOS/browser fallback.
const applyPortraitLock = () => {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  const isMobileSized = Math.min(width, height) <= 540 && Math.max(width, height) <= 1024;
  const shouldForcePortrait = isTouchDevice && isMobileSized && width > height;

  document.documentElement.style.setProperty("--app-vw", `${width}px`);
  document.documentElement.style.setProperty("--app-vh", `${height}px`);
  document.documentElement.classList.toggle("force-portrait-landscape", shouldForcePortrait);

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: OrientationLockType) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === "function") {
      void orientation.lock("portrait-primary").catch(() => {
        void orientation.lock("portrait").catch(() => {});
      });
    }
  } catch {
    return;
  }
};

applyPortraitLock();
window.addEventListener("resize", applyPortraitLock, { passive: true });
window.addEventListener("orientationchange", applyPortraitLock, { passive: true });
window.addEventListener("pageshow", applyPortraitLock, { passive: true });
document.addEventListener("visibilitychange", applyPortraitLock, { passive: true });
document.addEventListener("touchstart", applyPortraitLock, { passive: true });
document.addEventListener("pointerdown", applyPortraitLock, { passive: true });
window.visualViewport?.addEventListener("resize", applyPortraitLock, { passive: true });

createRoot(document.getElementById("root")!).render(<App />);
