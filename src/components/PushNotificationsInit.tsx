 import { useState, useEffect } from "react";
 import { usePushNotifications } from "@/hooks/usePushNotifications";
 import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
 import { BellRing, Loader2, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

const PushNotificationsInit = () => {
  const { user, role, loading } = useAuth();
  const { status, enableNotifications, isIOS, isStandalone } = usePushNotifications();
   const [dismissed, setDismissed] = useState(false);
 
   useEffect(() => {
     const isDismissed = localStorage.getItem("push-notifications-banner-dismissed");
     if (isDismissed === "true") {
       setDismissed(true);
     }
   }, []);
 
   const handleDismiss = () => {
     setDismissed(true);
     localStorage.setItem("push-notifications-banner-dismissed", "true");
   };

   if (loading || !user || status === "enabled" || status === "preview" || dismissed) {
    return null;
  }

  // If the browser already granted permission, don't show the banner — registration happens in background
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    return null;
  }

  const isBusy = status === "initializing";
  const isBlocked = status === "blocked";
  const isUnsupported = status === "unsupported";
  const needsInstall = isIOS && !isStandalone;
  const canAskPermission = !isBlocked && !isUnsupported && !needsInstall;

  const handleEnable = async () => {
    const enabled = await enableNotifications();
    if (enabled) toast.success("Notificações ativadas!");
    else if (Notification.permission === "denied") toast.error("Permissão bloqueada nas configurações do iPhone.");
    else toast.error("Aguarde alguns segundos e tente novamente. Se persistir, reabra o app.");
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[60] animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {isBlocked ? <ShieldAlert className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isBlocked
              ? "Notificações bloqueadas"
              : needsInstall
                ? "Abra pelo app instalado"
                : isUnsupported
                  ? "Notificações indisponíveis"
                  : "Ativar notificações"}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {isBlocked
              ? "Ative em Ajustes do iPhone para receber avisos fora do app."
              : needsInstall
                ? "No iPhone, notificações só liberam abrindo pelo ícone da tela de início."
                : isUnsupported
                  ? "Atualize para iOS 16.4+ e use o app instalado pela tela de início."
                  : "Toque aqui para permitir avisos no iPhone."}
          </p>
        </div>
         <div className="flex items-center gap-1 shrink-0">
           {canAskPermission && (
             <Button size="sm" onClick={handleEnable} disabled={isBusy} className="font-semibold h-8 px-3">
               {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Permitir"}
             </Button>
           )}
           <Button
             variant="ghost"
             size="icon"
             className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
             onClick={handleDismiss}
           >
             <X className="h-4 w-4" />
           </Button>
         </div>
      </div>
    </div>
  );
};

export default PushNotificationsInit;