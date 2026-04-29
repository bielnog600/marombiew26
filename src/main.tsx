import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const APP_SW_PATH = "/app-sw.js";

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

void cleanupServiceWorkers();

// Lock screen orientation to portrait (best-effort; works in installed PWA on Android)
const lockOrientation = () => {
  try {
    const orientation = (screen as any).orientation;
    if (orientation && typeof orientation.lock === "function") {
      orientation.lock("portrait").catch(() => {});
    }
  } catch {}
};
lockOrientation();

createRoot(document.getElementById("root")!).render(<App />);
