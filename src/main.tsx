import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
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

// Trava orientação retrato no app nativo e tenta aplicar a API web quando disponível.
const forcePortraitOrientation = () => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!isMobile) return;

  const lockPortrait = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.lock({ orientation: "portrait" });
        return;
      }
    } catch {}

    try {
      await screen.orientation?.lock?.("portrait");
    } catch {}
  };

  void lockPortrait();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void lockPortrait();
  });
  window.addEventListener("focus", () => void lockPortrait());
};

forcePortraitOrientation();
 
createRoot(document.getElementById("root")!).render(<App />);
