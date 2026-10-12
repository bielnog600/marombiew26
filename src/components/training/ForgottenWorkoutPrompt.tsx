import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useActiveWorkoutSession } from '@/hooks/useActiveWorkoutSession';
import { cancelWorkoutSession, finishWorkoutSessionWithRecorded } from '@/lib/workoutSessionResolution';
import ForgottenWorkoutDialog from './ForgottenWorkoutDialog';

/** Ao abrir o app: treino parado há mais de 6 h → finalizar ou cancelar. */
const ForgottenWorkoutPrompt = () => {
  const location = useLocation();
  const { forgotten, clear } = useActiveWorkoutSession();
  const [busy, setBusy] = useState(false);
  // A tela de execução trata o mesmo caso por conta própria.
  if (location.pathname.startsWith('/treino-execucao')) return null;

  const handle = async (choice: 'finish' | 'cancel') => {
    if (!forgotten) return;
    setBusy(true);
    if (choice === 'finish') await finishWorkoutSessionWithRecorded(forgotten.id);
    else await cancelWorkoutSession(forgotten.id);
    clear();
    setBusy(false);
    toast.success(choice === 'finish' ? 'Treino finalizado com o que foi registrado.' : 'Treino cancelado.');
  };

  return (
    <ForgottenWorkoutDialog
      session={forgotten}
      busy={busy}
      onFinish={() => handle('finish')}
      onCancel={() => handle('cancel')}
    />
  );
};

export default ForgottenWorkoutPrompt;
