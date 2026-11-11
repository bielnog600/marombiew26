import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

import { appUpdates, UPDATE_CHECK_INTERVAL_MS } from "./lib/appUpdate/updateController";
import { reloadOnceForChunkError } from "./lib/appUpdate/chunkReload";

// Parte do app (chunk) que não existe mais após um deploy: recarrega uma vez.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForChunkError()) event.preventDefault();
});

// Guard: unregister service workers only in Lovable preview/iframe contexts.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

const isPreviewHost = (() => {
  const host = window.location.hostname.toLowerCase();
  const firstLabel = host.split(".")[0] ?? "";
  const lovableHosted = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  return (
    host.includes("id-preview--") ||
    (lovableHosted && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(firstLabel)) ||
    (lovableHosted && /^project--.+-dev$/.test(firstLabel)) ||
    host === "lovableproject.com" || host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")
  );
})();

const cleanupServiceWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (reg) => {
      if (isPreviewHost || isInIframe) {
        await reg.unregister();
      }
    })
  );
};

/**
 * Atualização do app instalado sem recarregar no meio do uso nem em loop:
 * - procura versão nova a cada 5 min e ao voltar para o app;
 * - a versão nova fica esperando e só é aplicada ao ir para segundo plano ou no
 *   toque em "Atualizar" (ver updateController, com trava persistente);
 * - recarrega só quando o service worker novo assume (controllerchange);
 * - nenhum cache é apagado aqui: o service worker novo limpa os antigos.
 */
declare const __APP_VERSION__: string | undefined;

const startPwaUpdates = () => {
  if (!("serviceWorker" in navigator) || isPreviewHost || isInIframe) return;

  const runningVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  let swRegistration: ServiceWorkerRegistration | undefined;
  const waitingId = () => `${swRegistration?.waiting?.scriptURL ?? "/sw.js"}|${runningVersion}`;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    appUpdates.onControllerChange();
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      appUpdates.markAvailable(() => updateSW(true), waitingId());
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;

      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        registration.update().catch(() => undefined);
      };

      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") window.setTimeout(checkForUpdate, 1000);
      });
    },
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") appUpdates.onHidden();
  });
};

void cleanupServiceWorkers().then(startPwaUpdates);

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
