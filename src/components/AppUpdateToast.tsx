import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { appUpdates } from '@/lib/appUpdate/updateController';

const TOAST_ID = 'app-update-available';

/** Aviso persistente de versão nova; some enquanto uma tela protegida estiver aberta. */
const AppUpdateToast = () => {
  const location = useLocation();
  const snapshot = useSyncExternalStore(
    appUpdates.subscribe,
    () => {
      const s = appUpdates.getState();
      return `${s.available}|${s.held}`;
    },
  );
  const [available, held] = snapshot.split('|').map(v => v === 'true');

  useEffect(() => {
    if (available && !held) {
      toast('Nova versão disponível', {
        id: TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
        action: { label: 'Atualizar', onClick: () => { appUpdates.apply('user'); } },
      });
    } else {
      toast.dismiss(TOAST_ID);
    }
  }, [available, held, location.pathname]);

  return null;
};

export default AppUpdateToast;
