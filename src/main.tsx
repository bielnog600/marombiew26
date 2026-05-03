import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const APP_SW_PATH = "/app-sw.js";
const APP_VERSION = __APP_VERSION__;

declare const __APP_VERSION__: string;

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

const showBootUpdateStatus = () => {
  document.documentElement.dataset.pwaUpdating = "true";

  const boot = document.getElementById("boot-splash");
  if (!boot) return;

  let status = boot.querySelector<HTMLElement>("[data-splash-update-status]");
  if (!status) {
    status = document.createElement("p");
    status.dataset.splashUpdateStatus = "true";
    status.textContent = "Atualizando o app...";
    status.style.position = "absolute";
    status.style.left = "24px";
    status.style.right = "24px";
    status.style.top = "calc(50% + 118px)";
    status.style.margin = "0";
    status.style.textAlign = "center";
    status.style.fontFamily = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    status.style.fontSize = "12px";
    status.style.fontWeight = "600";
    status.style.letterSpacing = "0";
    status.style.color = "hsl(var(--primary, 45 100% 50%))";
    status.style.opacity = "0.92";
    boot.appendChild(status);
  }
};

const clearAppCaches = async () => {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
};

const checkHtmlVersionUpdate = async () => {
  if (isPreviewHost || isInIframe || !navigator.onLine) return;

  try {
    const response = await fetch(`/?app-version-check=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    const html = await response.text();
    const remoteVersion = html.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i)?.[1];

    if (remoteVersion && remoteVersion !== APP_VERSION) {
      showBootUpdateStatus();
      await clearAppCaches().catch(() => undefined);
      window.location.replace(`/?updated=${remoteVersion}`);
    }
  } catch {
    return;
  }
};

const startPwaAutoUpdate = () => {
  if (!("serviceWorker" in navigator) || isPreviewHost || isInIframe) return;

  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
  let applyingUpdate = false;

  const applyUpdate = async () => {
    if (applyingUpdate) return;
    applyingUpdate = true;
    showBootUpdateStatus();
    await clearAppCaches().catch(() => undefined);
    await updateServiceWorker?.(true);
    window.location.reload();
  };

  updateServiceWorker = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = async () => {
        if (!navigator.onLine || applyingUpdate) return;
        if (registration.waiting) {
          await applyUpdate().catch(() => window.location.reload());
          return;
        }
        await registration.update().catch(() => undefined);
        if (registration.waiting) await applyUpdate().catch(() => window.location.reload());
      };

      void checkForUpdate();
      const interval = window.setInterval(checkForUpdate, 30 * 1000);
      const onVisible = () => {
        if (document.visibilityState === "visible") void checkForUpdate();
      };

      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
      window.addEventListener("pageshow", onVisible);

      window.addEventListener("beforeunload", () => {
        window.clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
        window.removeEventListener("pageshow", onVisible);
      }, { once: true });
    },
    onNeedRefresh() {
      void applyUpdate().catch(() => window.location.reload());
    },
  });
};

void cleanupServiceWorkers().then(startPwaAutoUpdate);
void checkHtmlVersionUpdate();

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
