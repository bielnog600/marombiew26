import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import App from "./App.tsx";
import "./index.css";

import { reloadOnceForChunkError } from "./lib/appUpdate/chunkReload";
import { startPwaUpdates } from "./lib/appUpdate/pwaRegistration";
import { installClientErrorLogging } from "./lib/clientErrorLog";
import { useEffect } from "react";

installClientErrorLogging();

/** Avisa o vigia do index.html que o React montou (senão ele mostra "Atualizar app"). */
const BootMarker = () => {
  useEffect(() => {
    (window as Window & { __mwAppMounted?: boolean }).__mwAppMounted = true;
    document.getElementById("boot-recovery")?.remove();
  }, []);
  return null;
};

// Parte do app (chunk) que não existe mais após um deploy: recarrega uma vez.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForChunkError()) event.preventDefault();
});

startPwaUpdates();

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
 
createRoot(document.getElementById("root")!).render(<><App /><BootMarker /></>);
