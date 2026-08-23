import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentLoadIncrementsResult } from '@/lib/loadIncrementRepo';
import {
  buildSessionProgressionRecommendations,
  readProgressionSnapshot,
  type ProgressionSnapshot,
  type SessionLog,
  type SessionMetaRow,
} from '@/lib/sessionProgression';
import { buildHistoryNameVariants } from '@/lib/sessionProgressionQuery';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { TrainingPhase } from '@/lib/trainingPhase';

/** Janela de histórico considerada para performance/inferência de incremento. */
const HISTORY_DAYS = 180;
/** Tamanho da página; a paginação evita truncamento silencioso. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 6;
const MAX_RETRIES = 2;

export type ProgressionStatus = 'idle' | 'loading' | 'ready' | 'load_error';

interface Params {
  studentId: string | null | undefined;
  sessionId: string | null;
  exercises: ParsedExercise[];
  phase: TrainingPhase | null;
  /** Plano da sessão atual, quando conhecido (comparabilidade por plano). */
  planId?: string | null;
  /** Snapshot já persistido no session_state (retomada / offline). */
  restoredSnapshot?: ProgressionSnapshot | null;
}

/**
 * Snapshot consultivo de progressão da sessão.
 *
 * - Se a sessão já tem snapshot (retomada), NÃO recalcula: apenas lê. Isso vale
 *   inclusive para o snapshot VAZIO (`recommendations: {}`), que significa
 *   "o motor rodou nesta sessão e não havia recomendação".
 * - Caso contrário, calcula UMA vez por sessão com 3 queries em lote
 *   (incrementos + metadados de sessões + histórico de séries filtrado pelos
 *   exercícios do treino atual), sempre excluindo explicitamente a sessão atual.
 * - Falha de rede/backend NÃO vira snapshot vazio: status `load_error` + retry.
 * - Nunca escreve em exercise_set_logs nem altera o plano.
 */
export function useSessionProgression({
  studentId,
  sessionId,
  exercises,
  phase,
  planId = null,
  restoredSnapshot,
}: Params) {
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot | null>(restoredSnapshot ?? null);
  const [status, setStatus] = useState<ProgressionStatus>('idle');
  const builtForSession = useRef<string | null>(null);
  const retries = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  // Retomada: snapshot existente sempre vence (não recalcular).
  useEffect(() => {
    const restored = readProgressionSnapshot({ progressionRecommendations: restoredSnapshot });
    if (restored) {
      setSnapshot(restored);
      setStatus('ready');
      builtForSession.current = sessionId ?? restored.sessionId ?? null;
    }
  }, [restoredSnapshot, sessionId]);

  const exerciseNames = exercises.map((e) => e?.exercise || '').filter(Boolean).join('|');

  const loadHistoryPaged = useCallback(
    async (student: string, session: string, names: string[], since: string) => {
      const rows: SessionLog[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        let query = supabase
          .from('exercise_set_logs')
          .select(
            'exercise_name, weight_kg, reps, rir, rpe, set_type, set_number, performed_at, session_id, phase',
          )
          .eq('student_id', student)
          .neq('session_id', session) // exclusão explícita da sessão atual
          .gte('performed_at', since);
        if (names.length > 0) query = query.in('exercise_name', names);
        // Ordenação cronológica explícita (nunca depender da ordem do banco).
        const { data, error } = await query
          .order('performed_at', { ascending: false })
          .order('set_number', { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) return { ok: false as const, rows: [] as SessionLog[] };
        const chunk = (data ?? []) as unknown as SessionLog[];
        rows.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
      }
      return { ok: true as const, rows };
    },
    [],
  );

  useEffect(() => {
    if (!studentId || !sessionId || exercises.length === 0) return;
    if (snapshot) return; // já existe (novo ou retomado) — nunca sobrescrever
    if (builtForSession.current === sessionId && status !== 'load_error') return;
    builtForSession.current = sessionId;

    let cancelled = false;
    (async () => {
      setStatus('loading');
      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const names = buildHistoryNameVariants(exercises.map((e) => e?.exercise || ''));

      // 3 queries em lote — nunca por exercício (zero N+1).
      const [incRes, sessionsRes, logsRes] = await Promise.all([
        fetchStudentLoadIncrementsResult(studentId),
        supabase
          .from('workout_sessions')
          .select('id, plan_id, phase, started_at, completed_at')
          .eq('student_id', studentId)
          .gte('started_at', since)
          .order('started_at', { ascending: false })
          .limit(400),
        loadHistoryPaged(studentId, sessionId, names, since),
      ]);

      if (cancelled) return;

      // Erro de busca ≠ "sem dados": não congelar snapshot vazio por falha.
      if (!incRes.ok || sessionsRes.error || !logsRes.ok) {
        setStatus('load_error');
        if (retries.current < MAX_RETRIES) {
          retries.current += 1;
          setTimeout(() => !cancelled && setRetryTick((t) => t + 1), 4000);
        }
        return;
      }

      const sessionMeta: Record<string, SessionMetaRow> = {};
      let resolvedPlanId = planId ?? null;
      (sessionsRes.data ?? []).forEach((s: any) => {
        sessionMeta[s.id] = { sessionId: s.id, planId: s.plan_id ?? null, phase: s.phase ?? null };
        if (s.id === sessionId && s.plan_id) resolvedPlanId = resolvedPlanId ?? s.plan_id;
      });
      // Fallback explícito: plano da sessão anterior mais recente que o tenha.
      if (!resolvedPlanId) {
        const withPlan = (sessionsRes.data ?? []).find((s: any) => s.id !== sessionId && s.plan_id);
        resolvedPlanId = (withPlan as any)?.plan_id ?? null;
      }

      const snap = buildSessionProgressionRecommendations({
        exercises,
        logs: logsRes.rows,
        currentSessionId: sessionId,
        activePhase: phase,
        configuredIncrements: incRes.increments,
        sessionMeta,
        currentPlanId: resolvedPlanId,
      });

      if (cancelled) return;
      // Snapshot vazio TAMBÉM é snapshot: congela a ausência de recomendação.
      setSnapshot(snap);
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, sessionId, exerciseNames, phase, planId, snapshot, retryTick]);

  return { snapshot, status };
}
