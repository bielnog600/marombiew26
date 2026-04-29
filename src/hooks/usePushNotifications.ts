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

    // Bloqueia em iframe/preview do Lovable
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const isPreviewHost =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");
    if (isInIframe || isPreviewHost) return;

    initRef.current = true;
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerPath: "/OneSignalSDKWorker.js",
          notifyButton: { enable: false },
        });

        // Vincula external_id ao Supabase user.id
        await OneSignal.login(user.id);

        // Pede permissão se ainda não foi decidida
        const permission = OneSignal.Notifications.permission;
        if (!permission) {
          // delay para não atropelar splash
          setTimeout(() => {
            OneSignal.Slidedown.promptPush({ force: false }).catch(() => {});
          }, 4000);
        }

        const registerSubscription = async () => {
          const playerId = OneSignal.User.PushSubscription.id;
          if (!playerId) return;
          await supabase.from("push_subscriptions").upsert(
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
        };

        // Registra agora se já tem id, e em mudanças
        await registerSubscription();
        OneSignal.User.PushSubscription.addEventListener("change", registerSubscription);
      } catch (err) {
        console.warn("OneSignal init failed:", err);
      }
    });
  }, [user]);
};