import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isSessionForgotten } from '@/lib/activeWorkoutSession';

export interface ActiveWorkoutSession {
  id: string;
  student_id: string;
  day_name: string | null;
  phase: string | null;
  plan_id: string | null;
  started_at: string;
  last_active_at?: string | null;
  session_state: any | null;
}

const LOCAL_KEY = 'mw_active_workout_session';
const CHANGE_EVENT = 'mw-active-workout-session-changed';

const readLocal = (): ActiveWorkoutSession | null => {
  try {
    const cached = localStorage.getItem(LOCAL_KEY);
    return cached ? (JSON.parse(cached) as ActiveWorkoutSession) : null;
  } catch {
    return null;
  }
};

const notify = () => {
  try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* noop */ }
};

/**
 * Sessão de treino em andamento do aluno — de QUALQUER dia do plano.
 * - `session`: em andamento e retomável (mostrada no card "Hoje").
 * - `forgotten`: parada há mais de 6 h sem atividade; a UI pergunta se o
 *   aluno quer finalizar com o que registrou ou cancelar.
 * Nunca descarta o rascunho local da mesma sessão.
 */
export function useActiveWorkoutSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ActiveWorkoutSession | null>(() => {
    const parsed = readLocal();
    if (!parsed) return null;
    return isSessionForgotten(parsed) ? null : parsed;
  });
  const [forgotten, setForgotten] = useState<ActiveWorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSession(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('id, student_id, plan_id, day_name, phase, started_at, created_at, last_active_at, session_state, status')
      .eq('student_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setLoading(false);
      return;
    }

    if (data && data.started_at) {
      // Preserva session_state local da MESMA sessão (edições ainda não persistidas).
      const local = readLocal();
      const cachedState = local && local.id === data.id ? local.session_state : null;
      const active: ActiveWorkoutSession = {
        id: data.id,
        student_id: data.student_id,
        plan_id: data.plan_id,
        day_name: data.day_name,
        phase: data.phase,
        started_at: data.started_at,
        last_active_at: data.last_active_at,
        session_state: cachedState ?? data.session_state,
      };
      if (isSessionForgotten(data as any)) {
        setForgotten(active);
        setSession(null);
      } else {
        setForgotten(null);
        setSession(active);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(active));
      }
    } else {
      localStorage.removeItem(LOCAL_KEY);
      setSession(null);
      setForgotten(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Mantém várias instâncias do hook (Home, Treinos, avisos) sincronizadas.
  useEffect(() => {
    const onChange = () => {
      const local = readLocal();
      setSession(local && !isSessionForgotten(local) ? local : null);
      if (!local) setForgotten(null);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(LOCAL_KEY);
    setSession(null);
    setForgotten(null);
    notify();
  }, []);

  const setLocal = useCallback((s: ActiveWorkoutSession | null) => {
    if (s) localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    else localStorage.removeItem(LOCAL_KEY);
    setSession(s);
  }, []);

  return { session, forgotten, loading, refresh, clear, setLocal };
}
