import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchWithCache } from '@/lib/offlineCache';
import { parseCardioPayload, type CardioProtocol } from '@/lib/cardioParser';
import { cardioOptions, type CardioDoneSession } from '@/lib/cardioChooser';
import { loadCardioDoneSessions } from '@/lib/cardioSessionApi';

export interface CardioChoiceData {
  loading: boolean;
  planId: string | null;
  options: CardioProtocol[];
  sessions: CardioDoneSession[];
}

/**
 * Plano de cardio do aluno (mesmo cache da home) + cardios concluídos recentes.
 * `initial` (vindo da home) mostra a tela na hora, antes da leitura.
 */
export function useCardioChoice(userId: string | undefined, initial?: { conteudo?: string | null; planId?: string | null }): CardioChoiceData {
  const initialOptions = cardioOptions(parseCardioPayload(initial?.conteudo ?? null));
  const [state, setState] = useState<CardioChoiceData>({
    loading: true, planId: initial?.planId ?? null, options: initialOptions, sessions: [],
  });

  useEffect(() => {
    if (!userId) return;
    let off = false;
    (async () => {
      const [planRes, doneRes] = await Promise.all([
        fetchWithCache(`plan:cardio:${userId}`, async () =>
          (await supabase.from('ai_plans').select('id, conteudo').eq('student_id', userId).eq('tipo', 'cardio')
            .order('created_at', { ascending: false }).limit(1).maybeSingle()).data),
        fetchWithCache(`cardio:done:${userId}`, () => loadCardioDoneSessions(userId)).catch(() => ({ data: null })),
      ]);
      if (off) return;
      const plan = planRes.data as { id: string; conteudo: string | null } | null;
      setState(prev => ({
        loading: false,
        planId: plan?.id ?? prev.planId,
        options: plan ? cardioOptions(parseCardioPayload(plan.conteudo)) : prev.options,
        sessions: (doneRes.data as CardioDoneSession[] | null) ?? prev.sessions,
      }));
    })().catch(() => { if (!off) setState(prev => ({ ...prev, loading: false })); });
    return () => { off = true; };
  }, [userId]);

  return state;
}
