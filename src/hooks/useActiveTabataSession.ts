import { useCallback, useEffect, useState } from 'react';
import { discardActiveTabata, findActiveTabata } from '@/lib/tabataSessionApi';
import { readLocalTabataSnapshot, resumeStatus, type TabataSnapshot } from '@/lib/tabataResume';

/** TABATA em andamento do aluno (aparelho + banco), atualizado ao voltar para o app. */
export function useActiveTabataSession(studentId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<TabataSnapshot | null>(() => {
    const local = studentId ? readLocalTabataSnapshot(studentId) : null;
    return local && resumeStatus(local, Date.now()).kind !== 'expired' ? local : null;
  });

  const refresh = useCallback(async () => {
    if (!studentId) { setSnapshot(null); return; }
    try { setSnapshot(await findActiveTabata(studentId)); } catch { /* mantém o que tinha */ }
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
    if (cur) await discardActiveTabata(cur);
  }, [snapshot]);

  return { snapshot, refresh, discard };
}
