import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  buildProgressionSessionTelemetry, 
  buildProgressionTelemetrySummary,
  type SessionTelemetryResult,
  type TelemetrySummary,
  type TelemetryLog
} from '@/lib/progressionTelemetry';
import { readProgressionSnapshot } from '@/lib/sessionProgression';

interface Params {
  studentId: string | null | undefined;
  days?: number;
}

export function useProgressionTelemetry({ studentId, days = 30 }: Params) {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [results, setResults] = useState<SessionTelemetryResult[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Query 1: workout_sessions (completed only)
      const { data: sessions, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, student_id, plan_id, phase, session_state, source, executed_by, session_mode, started_at, completed_at, status')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .gte('completed_at', since)
        .order('completed_at', { ascending: false });

      if (sessionError) throw sessionError;

      // Query 2: exercise_set_logs
      const sessionIds = (sessions || []).map(s => s.id);
      let logs: TelemetryLog[] = [];
      
      if (sessionIds.length > 0) {
        const { data: logRows, error: logError } = await supabase
          .from('exercise_set_logs')
          .select('student_id, session_id, exercise_name, set_number, weight_kg, reps, rir, set_type, source, performed_at')
          .in('session_id', sessionIds)
          .order('performed_at', { ascending: false });
        
        if (logError) throw logError;
        logs = logRows as unknown as TelemetryLog[];
      }

      const logsBySession = new Map<string, TelemetryLog[]>();
      logs.forEach(l => {
        if (!logsBySession.has(l.session_id)) logsBySession.set(l.session_id, []);
        logsBySession.get(l.session_id)!.push(l);
      });

      const sessionResults = (sessions || []).map(s => {
        const snapshot = readProgressionSnapshot(s.session_state);
        return buildProgressionSessionTelemetry({
          snapshot,
          logs: logsBySession.get(s.id) || [],
          studentId: s.student_id,
          sessionId: s.id,
          source: s.source || 'student',
          executedBy: s.executed_by || 'student'
        });
      });

      setResults(sessionResults);
      setSummary(buildProgressionTelemetrySummary(sessionResults));
    } catch (err) {
      console.error('Failed to load telemetry', err);
    } finally {
      setLoading(false);
    }
  }, [studentId, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, results, loading, refresh: load };
}
