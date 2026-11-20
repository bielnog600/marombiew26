import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isRelevantPlanChange } from '@/lib/livePlanUpdate';

/**
 * Avisa a tela do aluno quando o coach salva um plano do tipo pedido (ai_plans,
 * só do próprio aluno). Também confere de novo ao reconectar o tempo real e ao
 * voltar para o app, porque um evento perdido com o celular bloqueado não volta.
 */
export function useStudentPlanRealtime(
  studentId: string | null | undefined,
  tipo: 'treino' | 'dieta' | 'cardio',
  onChange: () => void,
  enabled = true,
) {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!studentId || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscribedOnce = false;
    const fire = () => {
      if (timer) clearTimeout(timer);
      // Junta os vários eventos de um mesmo salvamento numa só releitura.
      timer = setTimeout(() => callback.current(), 700);
    };
    const channel = supabase
      .channel(`plan-${tipo}-${studentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_plans', filter: `student_id=eq.${studentId}` }, (payload) => {
        if (isRelevantPlanChange(payload as any, tipo)) fire();
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) fire();
        subscribedOnce = true;
      });
    const onVisible = () => { if (document.visibilityState === 'visible') fire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [studentId, tipo, enabled]);
}
