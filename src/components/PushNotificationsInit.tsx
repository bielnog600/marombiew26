import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BellRing, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const PushNotificationsInit = () => {
  const { role } = useAuth();
  const { status, enableNotifications, isIOS, isStandalone } = usePushNotifications();

  if (role !== "aluno" || status === "enabled" || status === "preview" || status === "unsupported") {
    return null;
  }

  const isBusy = status === "initializing";
  const isBlocked = status === "blocked";
  const needsInstall = isIOS && !isStandalone;

  const handleEnable = async () => {
    const enabled = await enableNotifications();
    if (enabled) toast.success("Notificações ativadas!");
    else if (Notification.permission === "denied") toast.error("Permissão bloqueada nas configurações do iPhone.");
    else toast.error("Não foi possível ativar agora. Tente tocar novamente.");
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-40 animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {isBlocked ? <ShieldAlert className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isBlocked ? "Notificações bloqueadas" : needsInstall ? "Instale para receber avisos" : "Ativar notificações"}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {isBlocked
              ? "Ative em Ajustes do iPhone para receber avisos fora do app."
              : needsInstall
                ? "Abra pela tela de início para liberar os avisos."
                : "Toque aqui para permitir avisos no iPhone."}
          </p>
        </div>
        {!isBlocked && !needsInstall && (
          <Button size="sm" onClick={handleEnable} disabled={isBusy} className="shrink-0 font-semibold">
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Permitir"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PushNotificationsInit;