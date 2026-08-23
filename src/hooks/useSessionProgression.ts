import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentLoadIncrements } from '@/lib/loadIncrementRepo';
import {
  buildSessionProgressionRecommendations,
  readProgressionSnapshot,
  type ProgressionSnapshot,
  type SessionLog,
} from '@/lib/sessionProgression';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { TrainingPhase } from '@/lib/trainingPhase';

/** Janela de histórico considerada para performance/inferência de incremento. */
const HISTORY_DAYS = 120;
const HISTORY_LIMIT = 1000;

interface Params {
  studentId: string | null | undefined;
  sessionId: string | null;
  exercises: ParsedExercise[];
  phase: TrainingPhase | null;
  /** Snapshot já persistido no session_state (retomada / offline). */
  restoredSnapshot?: ProgressionSnapshot | null;
}

/**
 * Snapshot consultivo de progressão da sessão.
 *
 * - Se a sessão já tem snapshot (retomada), NÃO recalcula: apenas lê.
 * - Caso contrário, calcula UMA vez por sessão com exatamente 2 queries em
 *   lote (incrementos configurados + histórico de séries), sempre excluindo
 *   explicitamente a sessão atual.
 * - Nunca escreve em exercise_set_logs nem altera o plano; a persistência
 *   acontece junto do session_state normal da execução.
 */
export function useSessionProgression({
  studentId,
  sessionId,
  exercises,
  phase,
  restoredSnapshot,
}: Params) {
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot | null>(restoredSnapshot ?? null);
  const builtForSession = useRef<string | null>(null);

  // Retomada: snapshot existente sempre vence (não recalcular).
  useEffect(() => {
    const restored = readProgressionSnapshot({ progressionRecommendations: restoredSnapshot });
    if (restored) {
      setSnapshot(restored);
      builtForSession.current = sessionId ?? restored.sessionId ?? null;
    }
  }, [restoredSnapshot, sessionId]);

  useEffect(() => {
    if (!studentId || !sessionId || exercises.length === 0) return;
    if (snapshot) return; // já existe (novo ou retomado)
    if (builtForSession.current === sessionId) return;
    builtForSession.current = sessionId;

    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // 2 queries em lote — nunca por exercício (zero N+1).
      const [increments, logsRes] = await Promise.all([
        fetchStudentLoadIncrements(studentId),
        supabase
          .from('exercise_set_logs')
          .select('exercise_name, weight_kg, reps, rir, rpe, set_type, set_number, performed_at, session_id')
          .eq('student_id', studentId)
          .neq('session_id', sessionId) // exclusão explícita da sessão atual
          .gte('performed_at', since)
          .order('performed_at', { ascending: false })
          .limit(HISTORY_LIMIT),
      ]);

      if (cancelled) return;

      const snap = buildSessionProgressionRecommendations({
        exercises,
        logs: (logsRes.data ?? []) as SessionLog[],
        currentSessionId: sessionId,
        activePhase: phase,
        configuredIncrements: increments,
      });

      if (!cancelled && Object.keys(snap.recommendations).length > 0) setSnapshot(snap);
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId, sessionId, exercises, phase, snapshot]);

  return { snapshot };
}
