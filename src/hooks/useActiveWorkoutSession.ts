import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  isSessionStale,
  resolveStaleWorkoutSessions,
  STALE_INACTIVITY_MINUTES,
} from '@/lib/workoutSessionResolution';

export interface ActiveWorkoutSession {
  id: string;
  student_id: string;
  day_name: string | null;
  phase: string | null;
  plan_id: string | null;
  started_at: string;
  session_state: any | null;
}

const LOCAL_KEY = 'mw_active_workout_session';
// Retomada é baseada em INATIVIDADE (não no tempo total desde o início).
const MAX_SESSION_AGE_MS = STALE_INACTIVITY_MINUTES * 60 * 1000;

export function useActiveWorkoutSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ActiveWorkoutSession | null>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as ActiveWorkoutSession;
      const age = Date.now() - new Date(parsed.started_at).getTime();
      if (age > MAX_SESSION_AGE_MS) {
        localStorage.removeItem(LOCAL_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
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
      if (isSessionStale(data as any)) {
        // Sessão parada: classifica automaticamente (completed/partial/abandoned)
        await resolveStaleWorkoutSessions(user.id);
        localStorage.removeItem(LOCAL_KEY);
        setSession(null);
      } else {
        // Preserva session_state local se for da MESMA sessão — pode conter
        // edições recentes ainda não persistidas no banco (debounce / app fechado).
        let cachedState: any = null;
        try {
          const raw = localStorage.getItem(LOCAL_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as ActiveWorkoutSession;
            if (parsed.id === data.id && parsed.session_state) {
              cachedState = parsed.session_state;
            }
          }
        } catch {}
        const active: ActiveWorkoutSession = {
          id: data.id,
          student_id: data.student_id,
          day_name: data.day_name,
          phase: data.phase,
          started_at: data.started_at,
          session_state: cachedState ?? data.session_state,
        };
        setSession(active);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(active));
      }
    } else {
      localStorage.removeItem(LOCAL_KEY);
      setSession(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clear = useCallback(() => {
    localStorage.removeItem(LOCAL_KEY);
    setSession(null);
  }, []);

  const setLocal = useCallback((s: ActiveWorkoutSession | null) => {
    if (s) localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    else localStorage.removeItem(LOCAL_KEY);
    setSession(s);
  }, []);

  return { session, loading, refresh, clear, setLocal };
}
