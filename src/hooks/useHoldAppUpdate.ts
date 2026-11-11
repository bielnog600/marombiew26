import { useEffect } from 'react';
import { appUpdates } from '@/lib/appUpdate/updateController';

/** Impede que uma versão nova recarregue o app enquanto esta tela estiver aberta. */
export function useHoldAppUpdate(active = true) {
  useEffect(() => {
    if (!active) return;
    return appUpdates.hold();
  }, [active]);
}
