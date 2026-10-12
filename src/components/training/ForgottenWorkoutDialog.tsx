import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { workoutDayLabel, FORGOTTEN_SESSION_HOURS } from '@/lib/activeWorkoutSession';

interface Props {
  session: { id: string; day_name: string | null; started_at: string } | null;
  busy?: boolean;
  onFinish: () => void;
  onCancel: () => void;
}

/** Sessão parada há mais de 6 h: finalizar com o que foi registrado ou cancelar. */
const ForgottenWorkoutDialog = ({ session, busy, onFinish, onCancel }: Props) => (
  <AlertDialog open={!!session}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Treino ficou aberto</AlertDialogTitle>
        <AlertDialogDescription>
          O treino de {workoutDayLabel(session?.day_name, 'short')} está em andamento há mais de {FORGOTTEN_SESSION_HOURS} horas sem
          atividade. Quer finalizar com o que já foi registrado ou cancelar? Ao cancelar, o treino não conta como feito,
          mas as séries registradas ficam no histórico.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy} onClick={onCancel}>Cancelar treino</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={onFinish}>Finalizar com o registrado</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ForgottenWorkoutDialog;
