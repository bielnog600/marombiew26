import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { Workbox } from "workbox-window";
import App from "./App.tsx";
import "./index.css";

import { appUpdates, appRunningVersion, UPDATE_CHECK_INTERVAL_MS } from "./lib/appUpdate/updateController";
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
 * - recarrega só quando o service worker novo assume após pedirmos a troca; troca
 *   feita por outro app aberto não recarrega no meio do uso;
 * - Workbox direto (sem virtual:pwa-register) porque o registro do plugin recarrega
 *   sozinho em qualquer troca de controle.
 */
const startPwaUpdates = () => {
  if (!("serviceWorker" in navigator) || isPreviewHost || isInIframe) return;

  const wb = new Workbox("/sw.js", { scope: "/", type: "classic" });
  let swRegistration: ServiceWorkerRegistration | undefined;
  const waitingId = () => `${swRegistration?.waiting?.scriptURL ?? "/sw.js"}|${appRunningVersion ?? "unknown"}`;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    appUpdates.onControllerChange();
  });

  const onNeedRefresh = () => {
    appUpdates.markAvailable(() => wb.messageSkipWaiting(), waitingId());
  };
  wb.addEventListener("waiting", onNeedRefresh);
  wb.addEventListener("installed", (event) => {
    if (typeof event.isUpdate === "undefined" && event.isExternal) onNeedRefresh();
  });

  wb.register({ immediate: true }).then((registration) => {
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
  }).catch(() => undefined);

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
