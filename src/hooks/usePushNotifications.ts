import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const ONESIGNAL_APP_ID = "59537140-b7f1-435a-b57d-c8380b0d3276";

type PushStatus = "idle" | "initializing" | "ready" | "enabled" | "blocked" | "unsupported" | "preview" | "error";

interface OneSignalSdk {
  Debug?: {
    setLogLevel: (level: "trace" | "debug" | "info" | "warn" | "error") => void;
  };
  init: (options: {
    appId: string;
    language?: string;
    allowLocalhostAsSecureOrigin?: boolean;
    serviceWorkerPath?: string;
    serviceWorkerParam?: { scope: string };
    notifyButton?: { enable: boolean };
    autoResubscribe?: boolean;
    autoRegister?: boolean;
    promptOptions?: { slidedown?: { prompts?: unknown[] } };
  }) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  Notifications: {
    permission: boolean;
    addEventListener?: (event: "permissionChange", callback: () => void | Promise<void>) => void;
    removeEventListener?: (event: "permissionChange", callback: () => void | Promise<void>) => void;
  };
  Slidedown: {
    promptPush: (options?: { force?: boolean }) => Promise<void>;
  };
  User: {
    PushSubscription: {
      id?: string;
      optedIn?: boolean;
      optIn: () => Promise<void>;
      addEventListener: (event: "change", callback: () => void | Promise<void>) => void;
      removeEventListener?: (event: "change", callback: () => void | Promise<void>) => void;
    };
  };
}

declare global {
  interface Window {
    OneSignal?: OneSignalSdk;
    OneSignalDeferred?: Array<(OneSignal: OneSignalSdk) => void | Promise<void>>;
  }
}

const isPreviewHost = () =>
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const isPushSupported = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

const isIOSDevice = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isStandalonePWA = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const getNotificationPermission = (): NotificationPermission => Notification.permission;

const hasPushPermission = (OneSignal: OneSignalSdk) =>
  OneSignal.Notifications.permission === true || Notification.permission === "granted";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let oneSignalPromise: Promise<OneSignalSdk> | null = null;
let oneSignalInstance: OneSignalSdk | null = null;

const ensureOneSignalScript = (onError: () => void) => {
  if (document.getElementById("onesignal-sdk")) return;

  const script = document.createElement("script");
  script.id = "onesignal-sdk";
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.async = true;
  script.onerror = onError;
  document.head.appendChild(script);
};

const getOneSignal = () => {
  if (oneSignalInstance) return Promise.resolve(oneSignalInstance);

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  if (!oneSignalPromise) {
    oneSignalPromise = new Promise((resolve, reject) => {
      window.OneSignalDeferred!.push(async (OneSignal: OneSignalSdk) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            language: "pt-BR",
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/onesignal/" },
            notifyButton: { enable: false },
            autoResubscribe: true,
            autoRegister: false,
            promptOptions: {
              slidedown: {
                prompts: [
                  {
                    type: "push",
                    autoPrompt: false,
                    text: {
                      actionMessage: "Permita notificações para receber avisos importantes do seu personal.",
                      acceptButton: "Permitir",
                      cancelButton: "Agora não",
                    },
                  },
                ],
              },
              autoPrompt: false,
              native: { enabled: false, autoPrompt: false },
            } as any,
          });
          OneSignal.Debug?.setLogLevel("trace");
          console.log("[Push] OneSignal init OK");
          oneSignalInstance = OneSignal;
          resolve(OneSignal);
        } catch (err) {
          oneSignalPromise = null;
          reject(err);
        }
      });
      ensureOneSignalScript(() => {
        oneSignalPromise = null;
        reject(new Error("OneSignal SDK failed to load"));
      });
    });
  }

  return oneSignalPromise;
};

const saveSubscription = async (OneSignal: OneSignalSdk, userId: string) => {
  const playerId = OneSignal.User.PushSubscription.id;
  console.log("[Push] registerSubscription playerId:", playerId);
  if (!playerId) return false;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      player_id: playerId,
      platform: isIOSDevice() ? "ios-pwa" : "web",
      user_agent: navigator.userAgent,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,player_id" }
  );

  if (error) {
    console.warn("[Push] upsert error:", error);
    return false;
  }

  console.log("[Push] subscription saved ✅");
  return true;
};

const activatePushSubscription = async (OneSignal: OneSignalSdk) => {
  if (Notification.permission !== "denied" && OneSignal.User.PushSubscription.optedIn !== true) {
    await OneSignal.User.PushSubscription.optIn();
  }
};

const waitForPlayerId = async (OneSignal: OneSignalSdk) => {
  for (let i = 0; i < 30; i++) {
    const playerId = OneSignal.User.PushSubscription.id;
    const optedIn = OneSignal.User.PushSubscription.optedIn;
    console.log(`[Push] waitForPlayerId attempt ${i}: playerId=${playerId}, optedIn=${optedIn}, permission=${Notification.permission}`);
    if (hasPushPermission(OneSignal) && playerId && optedIn !== false) return playerId;

    if (hasPushPermission(OneSignal) && i === 5 && optedIn !== true) {
      await activatePushSubscription(OneSignal).catch((err) => console.warn("[Push] optIn retry failed:", err));
    }

    await delay(500);
  }

  console.warn("[Push] waitForPlayerId timeout after 30 attempts");
  return undefined;
};

const resolveStatus = (OneSignal: OneSignalSdk): PushStatus => {
  if (Notification.permission === "denied") return "blocked";
  const optedIn = OneSignal.User.PushSubscription.optedIn !== false;
  return hasPushPermission(OneSignal) && optedIn ? "enabled" : "ready";
};

/**
 * Inicializa OneSignal e registra o player_id do usuário logado no banco.
 * Não força o prompt automaticamente no iPhone: a permissão precisa vir de um toque do usuário.
 */
export const usePushNotifications = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("idle");
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsIOS(isIOSDevice());
    setIsStandalone(isStandalonePWA());
  }, []);

  useEffect(() => {
    if (!user) return;

    if (isPreviewHost()) {
      console.log("[Push] Skipped: preview host");
      setStatus("preview");
      return;
    }

    if (isIOSDevice() && !isStandalonePWA()) {
      console.log("[Push] Waiting for iOS standalone PWA");
      setStatus("ready");
      return;
    }

    if (!isPushSupported()) {
      console.log("[Push] Skipped: unsupported browser");
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }

    if (Notification.permission !== "granted") {
      setStatus("initializing");
      let cancelled = false;

      void getOneSignal()
        .then(async (OneSignal) => {
          await OneSignal.login(user.id);
          if (!cancelled) setStatus(resolveStatus(OneSignal));
        })
        .catch((err) => console.warn("[Push] OneSignal preload failed:", err))
        .finally(() => {
          if (!cancelled && getNotificationPermission() === "default") setStatus("ready");
        });

      return () => {
        cancelled = true;
      };
    }

    if (Notification.permission === "granted") {
      // Permission already granted — show "enabled" immediately, register in background
      setStatus("enabled");
    }

    let mounted = true;
    let cleanup = () => {};

    const boot = async () => {
      try {
        console.log("[Push] Initializing OneSignal for user:", user.id);
        const OneSignal = await getOneSignal();

        await OneSignal.login(user.id);
        console.log("[Push] OneSignal login OK");

        const refresh = async () => {
          if (!OneSignal.User.PushSubscription.id && OneSignal.User.PushSubscription.optedIn !== true) {
            await activatePushSubscription(OneSignal).catch((err) => console.warn("[Push] optIn refresh failed:", err));
          }
          await waitForPlayerId(OneSignal);
          await saveSubscription(OneSignal, user.id);
          if (mounted) setStatus(resolveStatus(OneSignal));
        };

        await refresh();
        OneSignal.User.PushSubscription.addEventListener("change", refresh);
        OneSignal.Notifications.addEventListener?.("permissionChange", refresh);
        cleanup = () => {
          OneSignal.User.PushSubscription.removeEventListener?.("change", refresh);
          OneSignal.Notifications.removeEventListener?.("permissionChange", refresh);
        };
      } catch (err) {
        console.warn("[Push] OneSignal init failed:", err);
        if (mounted) setStatus("error");
      }

    };

    void boot();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [user]);

  const enableNotifications = useCallback(async () => {
    if (!user) return false;

    if (!isPushSupported()) {
      setStatus("unsupported");
      return false;
    }

    if (isIOSDevice() && !isStandalonePWA()) {
      setStatus("ready");
      return false;
    }

    if (Notification.permission === "denied") {
      setStatus("blocked");
      return false;
    }

    try {
      setStatus("initializing");

      const OneSignal = await getOneSignal();
      await OneSignal.login(user.id);
      console.log("[Push] calling activatePushSubscription...");
      await activatePushSubscription(OneSignal);
      console.log("[Push] activatePushSubscription done, permission:", Notification.permission, "optedIn:", OneSignal.User.PushSubscription.optedIn);

      if (getNotificationPermission() === "denied") {
        setStatus("blocked");
        return false;
      }

      if (!hasPushPermission(OneSignal)) {
        setStatus("ready");
        return false;
      }

      const playerId = await waitForPlayerId(OneSignal);

      if (!playerId) {
        console.warn("[Push] player_id não disponível após timeout. permission:", Notification.permission, "optedIn:", OneSignal.User.PushSubscription.optedIn);
        // Even without player_id, if permission was granted we should report success
        if (hasPushPermission(OneSignal)) {
          setStatus("enabled");
          return true;
        }
      }

      await saveSubscription(OneSignal, user.id);
      const nextStatus = resolveStatus(OneSignal);
      setStatus(nextStatus);
      return hasPushPermission(OneSignal);
    } catch (err) {
      console.warn("[Push] enable failed:", err);
      setStatus(getNotificationPermission() === "denied" ? "blocked" : "error");
      return false;
    }
  }, [user]);

  return { status, enableNotifications, isIOS, isStandalone };
};