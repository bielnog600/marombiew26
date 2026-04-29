import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const ONESIGNAL_APP_ID = "59537140-b7f1-435a-b57d-c8380b0d3276";

type PushStatus = "idle" | "initializing" | "ready" | "enabled" | "blocked" | "unsupported" | "preview" | "error";

interface OneSignalSdk {
  init: (options: {
    appId: string;
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
    requestPermission: () => Promise<boolean | void>;
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

let oneSignalPromise: Promise<OneSignalSdk> | null = null;

const getOneSignal = () => {
  window.OneSignalDeferred = window.OneSignalDeferred || [];

  if (!oneSignalPromise) {
    oneSignalPromise = new Promise((resolve, reject) => {
      window.OneSignalDeferred!.push(async (OneSignal: OneSignalSdk) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/onesignal/" },
            notifyButton: { enable: false },
            autoResubscribe: false,
            autoRegister: false,
            promptOptions: { slidedown: { prompts: [] }, autoPrompt: false } as any,
          });
          console.log("[Push] OneSignal init OK");
          resolve(OneSignal);
        } catch (err) {
          oneSignalPromise = null;
          reject(err);
        }
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

const resolveStatus = (OneSignal: OneSignalSdk): PushStatus => {
  if (Notification.permission === "denied") return "blocked";
  const hasPermission = OneSignal.Notifications.permission === true;
  const hasPlayerId = Boolean(OneSignal.User.PushSubscription.id);
  const optedIn = OneSignal.User.PushSubscription.optedIn !== false;
  return hasPermission && hasPlayerId && optedIn ? "enabled" : "ready";
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

    let mounted = true;
    let cleanup = () => {};

    const boot = async () => {
      try {
        setStatus("initializing");
        console.log("[Push] Initializing OneSignal for user:", user.id);
        const OneSignal = await getOneSignal();

        await OneSignal.login(user.id);
        console.log("[Push] OneSignal login OK");

        const refresh = async () => {
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

    try {
      setStatus("initializing");
      const OneSignal = await getOneSignal();
      await OneSignal.login(user.id);

      if (!OneSignal.Notifications.permission) {
        await OneSignal.Notifications.requestPermission();
      }

      if (OneSignal.User.PushSubscription.optedIn === false) {
        await OneSignal.User.PushSubscription.optIn();
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
      await saveSubscription(OneSignal, user.id);
      const nextStatus = resolveStatus(OneSignal);
      setStatus(nextStatus);
      return nextStatus === "enabled";
    } catch (err) {
      console.warn("[Push] enable failed:", err);
      setStatus(Notification.permission === "denied" ? "blocked" : "error");
      return false;
    }
  }, [user]);

  return { status, enableNotifications, isIOS, isStandalone };
};