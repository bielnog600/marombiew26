import React, { useEffect, useState } from 'react';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
import { Button } from '@/components/ui/button';
import { Dumbbell, Play, Check, Trash2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

function formatDuration(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;
}

const AdminTrainerSessionBanner: React.FC = () => {
  const { active, isOpen, open, cancel } = useAdminTrainerSession();
  const isMobile = useIsMobile();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  if (!active || isOpen) return null;

  const startedMs = new Date(active.startedAtReal).getTime();
  const seconds = Math.max(0, Math.floor((now - startedMs) / 1000));
  const names = active.students.map((s) => s.nome).join(' + ');

  const bottomOffset = isMobile ? 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' : '1rem';

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-1rem)] max-w-md"
      style={{ bottom: bottomOffset }}
    >
      <div className="rounded-xl border border-primary/40 bg-card/95 backdrop-blur-md shadow-2xl px-3 py-2.5 flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0">
          <Dumbbell className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold leading-none mb-0.5">
            Treino em andamento
          </p>
          <p className="text-sm font-semibold truncate leading-tight">{names || 'Aluno'}</p>
          <p className="text-xs font-mono text-primary font-bold tabular-nums">{formatDuration(seconds)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => open()}>
            <Play className="h-3.5 w-3.5 mr-1" /> Retomar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar sessão?</AlertDialogTitle>
                <AlertDialogDescription>
                  A sessão será marcada como abandonada e não contará como treino concluído. As séries já
                  salvas serão mantidas no histórico.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await cancel();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancelar sessão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default AdminTrainerSessionBanner;