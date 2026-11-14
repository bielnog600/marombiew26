import { useCallback, useEffect, useState } from 'react';
import { discardActiveCardio, findActiveCardio } from '@/lib/cardioSessionApi';
import { readLocalCardioSnapshot, resumeStatus, type CardioSnapshot } from '@/lib/cardioResume';

/** Cardio em andamento do aluno (aparelho + banco), atualizado ao voltar para o app. */
export function useActiveCardioSession(studentId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<CardioSnapshot | null>(() => {
    const local = studentId ? readLocalCardioSnapshot(studentId) : null;
    return local && resumeStatus(local, Date.now()).kind !== 'expired' ? local : null;
  });

  const refresh = useCallback(async () => {
    if (!studentId) { setSnapshot(null); return; }
    try { setSnapshot(await findActiveCardio(studentId)); } catch { /* mantém */ }
  }, [studentId]);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const discard = useCallback(async () => {
    const cur = snapshot;
    setSnapshot(null);
    if (cur) await discardActiveCardio(cur);
  }, [snapshot]);

  return { snapshot, refresh, discard };
}
