import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchStudentLoadIncrementsResult } from '@/lib/loadIncrementRepo';
import { normalizeExerciseKey } from '@/lib/loadIncrement';
import {
  buildSessionProgressionRecommendations,
  mergeProgressionSnapshots,
  missingExercisesFor,
  readProgressionSnapshot,
  type ProgressionSnapshot,
  type SessionLog,
  type SessionMetaRow,
} from '@/lib/sessionProgression';
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
  /** Exercícios do dia na tela (podem ser renomeados/adicionados na sessão). */
  exercises: ParsedExercise[];
  /** Todos os exercícios do plano (todos os dias): o snapshot já nasce cobrindo a troca de dia. */
  allExercises?: ParsedExercise[];
  phase: TrainingPhase | null;
  /** Plano da sessão atual, quando conhecido (comparabilidade por plano). */
  planId?: string | null;
  /** Início do plano atual: sessões sem plan_id depois dessa data são deste plano. */
  planStartedAt?: string | null;
  /** Snapshot já persistido no session_state (retomada / offline). */
  restoredSnapshot?: ProgressionSnapshot | null;
}

const unir = (a: ParsedExercise[], b: ParsedExercise[]): ParsedExercise[] => {
  const vistos = new Set<string>();
  const out: ParsedExercise[] = [];
  [...a, ...b].forEach((ex) => {
    const k = normalizeExerciseKey(ex?.exercise || '');
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    out.push(ex);
  });
  return out;
};

/**
 * Snapshot consultivo de progressão da sessão.
 *
 * - Nasce cobrindo TODOS os dias do plano (antes ficava preso ao primeiro dia
 *   aberto e a troca de aba deixava os exercícios sem sugestão).
 * - Retomada: o snapshot salvo é reaproveitado e só COMPLETADO com exercícios
 *   ainda não avaliados (troca de dia, renomeado, adicionado, editado pela IA).
 *   Nada já avaliado é recalculado.
 * - Mudou a semana (ex.: ajustada para deload no card da semana): recalcula tudo.
 * - Histórico: uma busca por aluno (180 dias) filtrada aqui pela chave
 *   normalizada — acento e caixa não separam mais "ELEVAÇÃO PELVICA" de
 *   "ELEVAÇÃO PÉLVICA".
 * - Falha de rede/backend NÃO vira snapshot vazio: status `load_error` + retry.
 * - Nunca escreve em exercise_set_logs nem altera o plano.
 */
export function useSessionProgression({
  studentId,
  sessionId,
  exercises,
  allExercises = [],
  phase,
  planId = null,
  planStartedAt = null,
  restoredSnapshot,
}: Params) {
  const [snapshot, setSnapshot] = useState<ProgressionSnapshot | null>(restoredSnapshot ?? null);
  const [status, setStatus] = useState<ProgressionStatus>('idle');
  const restoredFor = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);
  const retries = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  // Retomada: o snapshot salvo é a base (depois só completamos o que faltar).
  useEffect(() => {
    const restored = readProgressionSnapshot({ progressionRecommendations: restoredSnapshot });
    const id = sessionId ?? restored?.sessionId ?? null;
    if (restored && restoredFor.current !== id) {
      restoredFor.current = id;
      setSnapshot(restored);
      setStatus('ready');
    }
  }, [restoredSnapshot, sessionId]);

  const loadHistoryPaged = useCallback(
    async (student: string, session: string, keys: Set<string>, since: string) => {
      const rows: SessionLog[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = await supabase
          .from('exercise_set_logs')
          .select(
            'exercise_name, weight_kg, reps, rir, rpe, set_type, set_number, performed_at, session_id, phase',
          )
          .eq('student_id', student)
          .neq('session_id', session) // exclusão explícita da sessão atual
          .gte('performed_at', since)
          // Ordenação cronológica explícita (nunca depender da ordem do banco).
          .order('performed_at', { ascending: false })
          .order('set_number', { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) return { ok: false as const, rows: [] as SessionLog[] };
        const chunk = (data ?? []) as unknown as SessionLog[];
        chunk.forEach((l) => {
          if (keys.has(normalizeExerciseKey(l.exercise_name || ''))) rows.push(l);
        });
        if (chunk.length < PAGE_SIZE) break;
      }
      return { ok: true as const, rows };
    },
    [],
  );

  const todos = unir(exercises, allExercises);
  const assinatura = todos.map((e) => normalizeExerciseKey(e?.exercise || '')).join('|');

  useEffect(() => {
    if (!studentId || !sessionId || todos.length === 0) return;

    const faseMudou = !!snapshot && !!phase && !!snapshot.phase && snapshot.phase !== phase;
    const base = faseMudou ? null : snapshot;
    const alvo = base ? missingExercisesFor(base, todos) : todos;
    if (alvo.length === 0) return;

    const chave = `${sessionId}|${phase ?? ''}|${alvo
      .map((e) => normalizeExerciseKey(e.exercise || ''))
      .join('|')}|${retryTick}`;
    if (inFlight.current === chave) return;
    inFlight.current = chave;

    let cancelled = false;
    (async () => {
      if (!base) setStatus('loading');
      const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const keys = new Set(alvo.map((e) => normalizeExerciseKey(e?.exercise || '')).filter(Boolean));

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
        loadHistoryPaged(studentId, sessionId, keys, since),
      ]);

      if (cancelled) return;

      // Erro de busca ≠ "sem dados": não congelar snapshot vazio por falha.
      if (!incRes.ok || sessionsRes.error || !logsRes.ok) {
        inFlight.current = null;
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

      const novo = buildSessionProgressionRecommendations({
        exercises: alvo,
        logs: logsRes.rows,
        currentSessionId: sessionId,
        activePhase: phase,
        configuredIncrements: incRes.increments,
        sessionMeta,
        currentPlanId: resolvedPlanId,
        currentPlanStartedAt: planStartedAt,
      });

      if (cancelled) return;
      // Snapshot vazio TAMBÉM é snapshot: `coveredKeys` evita buscar de novo
      // exercício sem histórico.
      setSnapshot((atual) => (atual && !faseMudou ? mergeProgressionSnapshots(atual, novo) : novo));
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
      if (inFlight.current === chave) inFlight.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, sessionId, assinatura, phase, planId, planStartedAt, snapshot, retryTick]);

  return { snapshot, status };
}
