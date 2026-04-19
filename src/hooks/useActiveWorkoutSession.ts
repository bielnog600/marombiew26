import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ActiveWorkoutSession {
  id: string;
  student_id: string;
  day_name: string | null;
  phase: string | null;
  started_at: string;
  session_state: any | null;
}

const LOCAL_KEY = 'mw_active_workout_session';
// Sessões com mais de 12h são consideradas abandonadas
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

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
    const { data } = await supabase
      .from('workout_sessions')
      .select('id, student_id, day_name, phase, started_at, session_state, status')
      .eq('student_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.started_at) {
      const age = Date.now() - new Date(data.started_at).getTime();
      if (age > MAX_SESSION_AGE_MS) {
        // Auto-abandona sessão muito antiga
        await supabase
          .from('workout_sessions')
          .update({ status: 'abandoned' })
          .eq('id', data.id);
        localStorage.removeItem(LOCAL_KEY);
        setSession(null);
      } else {
        const active: ActiveWorkoutSession = {
          id: data.id,
          student_id: data.student_id,
          day_name: data.day_name,
          phase: data.phase,
          started_at: data.started_at,
          session_state: data.session_state,
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
