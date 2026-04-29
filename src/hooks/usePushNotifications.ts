import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const ONESIGNAL_APP_ID = "59537140-b7f1-435a-b57d-c8380b0d3276";

declare global {
  interface Window {
    OneSignal?: any;
    OneSignalDeferred?: any[];
  }
}

/**
 * Inicializa OneSignal e registra o player_id do usuário logado no banco.
 * Não roda em iframe/preview (causa conflito com SW de preview).
 */
export const usePushNotifications = () => {
  const { user } = useAuth();
  const initRef = useRef(false);

  useEffect(() => {
    if (!user || initRef.current) return;

    // Bloqueia apenas em preview do Lovable (não em PWA standalone do iOS)
    const isPreviewHost =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");
    if (isPreviewHost) {
      console.log("[Push] Skipped: preview host");
      return;
    }

    initRef.current = true;
    console.log("[Push] Initializing OneSignal for user:", user.id);
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          notifyButton: { enable: false },
        });
        console.log("[Push] OneSignal init OK");

        // Vincula external_id ao Supabase user.id
        await OneSignal.login(user.id);
        console.log("[Push] OneSignal login OK");

        // Pede permissão se ainda não foi decidida
        const permission = OneSignal.Notifications.permission;
        console.log("[Push] Current permission:", permission);
        if (!permission) {
          setTimeout(() => {
            console.log("[Push] Prompting for push permission");
            OneSignal.Slidedown.promptPush({ force: true }).catch((e: any) =>
              console.warn("[Push] prompt failed:", e)
            );
          }, 4000);
        }

        const registerSubscription = async () => {
          const playerId = OneSignal.User.PushSubscription.id;
          console.log("[Push] registerSubscription playerId:", playerId);
          if (!playerId) return;
          const { error } = await supabase.from("push_subscriptions").upsert(
            {
              user_id: user.id,
              player_id: playerId,
              platform: "web",
              user_agent: navigator.userAgent,
              active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,player_id" }
          );
          if (error) console.warn("[Push] upsert error:", error);
          else console.log("[Push] subscription saved ✅");
        };

        // Registra agora se já tem id, e em mudanças
        await registerSubscription();
        OneSignal.User.PushSubscription.addEventListener("change", registerSubscription);
      } catch (err) {
        console.warn("[Push] OneSignal init failed:", err);
      }
    });
  }, [user]);
};