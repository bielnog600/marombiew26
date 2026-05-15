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

 // Forçar orientação retrato em dispositivos móveis (Safari iOS e Chrome Mobile)
 const forcePortraitOrientation = () => {
   const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
   if (!isMobile) return;
 
   const setOrientation = () => {
     try {
       // Tenta usar a API moderna se disponível (maioria dos navegadores mobile)
       if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
         screen.orientation.lock('portrait').catch(() => {});
       }
     } catch (e) {}
   };
 
   setOrientation();
   window.addEventListener('orientationchange', setOrientation);
   window.addEventListener('resize', setOrientation);
 };
 
 forcePortraitOrientation();
 
createRoot(document.getElementById("root")!).render(<App />);
