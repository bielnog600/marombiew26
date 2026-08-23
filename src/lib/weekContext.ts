/**
 * IDENTIDADE ESTRUTURADA DA SEMANA (WeekContext)
 * ==============================================
 *
 * Antes, aderência e performance usavam apenas uma janela móvel de 7 dias
 * ([hoje-7d, hoje)). Isso podia misturar partes de fases diferentes ou deixar
 * sessões relevantes de fora dependendo do dia em que o relatório era aberto.
 *
 * Estruturas que JÁ existiam no banco e permitem identificar a semana lógica:
 *   - ai_plans.id                → plan_id (identidade do plano/ciclo)
 *   - ai_plans.fase              → fase planejada (semana_1..deload)
 *   - ai_plans.fase_inicio_data  → início do ciclo de 4 semanas
 *   - ai_plans.cycle_days        → duração da fase (default 7)
 *   - ai_plans.version / parent_plan_id → versionamento do plano
 *   - workout_sessions.plan_id / .phase / .completed_at → identidade da sessão
 *   - exercise_set_logs.session_id / .phase → vínculo do log com a sessão
 *
 * Com isso, a semana avaliada passa a ser a JANELA DA FASE do plano
 * (fase_inicio_data + n*cycle_days), e não os últimos 7 dias. A janela móvel
 * permanece apenas como FALLBACK quando o plano não tem fase_inicio_data.
 */

import { TRAINING_PHASES, type TrainingPhase } from './trainingPhase';
import { resolveWeeklyWindows } from './weeklyWindows';

export type WeekContextSource = 'structured_session' | 'legacy_time_window';

export type ComparisonBasis =
  | 'structured_previous_phase'
  | 'legacy_time_window'
  | 'none';

export interface WeekContext {
  planId: string | null;
  cycleId?: string | null;
  phase: TrainingPhase | null;
  startedAt: Date;
  endedAt: Date;
  source: WeekContextSource;
}

export interface WeekContexts {
  current: WeekContext;
  /** null quando não existe semana anterior comparável (S1 e deload). */
  previous: WeekContext | null;
  comparisonBasis: ComparisonBasis;
  /** Motivo textual quando não há comparação. */
  comparisonNote?: string;
}

/** Parse seguro de YYYY-MM-DD (local midnight) ou ISO completo. */
const parseDay = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Fase comparável da semana anterior para PERFORMANCE.
 *
 * S2 → S1, S3 → S2. Para S1 e deload NÃO existe comparação de performance:
 *  - S1 de um novo ciclo viria do deload (semana deliberadamente leve): a
 *    comparação inflaria falsas melhoras (70kg×8 no deload vs 90kg×10 na S1);
 *  - deload é avaliado por execução da recuperação, nunca por carga.
 */
export const performanceComparablePhase = (
  phase: TrainingPhase | null,
): TrainingPhase | null => {
  if (!phase) return null;
  if (phase === 'semana_1' || phase === 'deload') return null;
  const i = TRAINING_PHASES.indexOf(phase);
  return i > 0 ? TRAINING_PHASES[i - 1] : null;
};

/**
 * SEMÂNTICA CONFIRMADA de `ai_plans.cycle_days` (auditada no banco):
 * é a duração do CICLO INTEIRO do plano (default 45 dias — mesma constante
 * usada por workout-renewal-analyzer e pelos painéis de renovação), NÃO a
 * duração de uma fase/semana. Todos os planos reais têm cycle_days = 45.
 *
 * A fase (`semana_1..semana_3`, `deload`) é SEMPRE semanal (7 dias) e
 * `cycle_days` NUNCA altera essa duração — nem por heurística de valores
 * pequenos (cycle_days = 10 continua sendo duração de ciclo). Só um campo
 * explicitamente definido no schema como "duração da fase" poderia mudar
 * isso; ele não existe hoje.
 */
export const PHASE_DURATION_DAYS = 7;

/** Mantida por compatibilidade: a duração da fase é sempre 7 dias. */
export const phaseDurationFromCycle = (_cycleDays?: number | null): number =>
  PHASE_DURATION_DAYS;


export interface ResolveWeekContextsInput {
  planId?: string | null;
  phase: TrainingPhase;
  /** ai_plans.fase_inicio_data (início do ciclo) */
  phaseStartDate?: string | null;
  /** ai_plans.cycle_days — duração do CICLO (45), não da fase. */
  cycleDays?: number | null;
  now?: Date;
}

/**
 * Resolve a semana lógica atual (e a anterior comparável) do plano.
 * Sem `phaseStartDate` cai no fallback de janela móvel (dado legado).
 */
export const resolveWeekContexts = (input: ResolveWeekContextsInput): WeekContexts => {
  const { planId = null, phase, phaseStartDate, now = new Date() } = input;
  const cycleDays = phaseDurationFromCycle(input.cycleDays);
  const prevPhase = performanceComparablePhase(phase);


  const cycleStart = parseDay(phaseStartDate);
  if (!cycleStart) {
    // ---- FALLBACK LEGADO: janela móvel de 7 dias.
    const w = resolveWeeklyWindows(now);
    const current: WeekContext = {
      planId,
      phase,
      startedAt: w.current.start,
      endedAt: w.current.end,
      source: 'legacy_time_window',
    };
    if (!prevPhase) {
      return {
        current,
        previous: null,
        comparisonBasis: 'none',
        comparisonNote:
          phase === 'deload'
            ? 'Deload não é avaliado por comparação de performance.'
            : 'Semana 1 de novo ciclo não é comparada com o deload anterior.',
      };
    }
    return {
      current,
      previous: {
        planId,
        phase: prevPhase,
        startedAt: w.previous.start,
        endedAt: w.previous.end,
        source: 'legacy_time_window',
      },
      comparisonBasis: 'legacy_time_window',
    };
  }

  // ---- IDENTIDADE ESTRUTURADA: janela da fase dentro do ciclo do plano.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const diffDays = Math.floor((today.getTime() - cycleStart.getTime()) / dayMs);
  const weekIndex = diffDays > 0 ? Math.floor(diffDays / cycleDays) : 0;

  const startedAt = new Date(cycleStart);
  startedAt.setDate(startedAt.getDate() + weekIndex * cycleDays);
  const endedAt = new Date(startedAt);
  endedAt.setDate(endedAt.getDate() + cycleDays);

  const current: WeekContext = {
    planId,
    cycleId: planId,
    phase,
    startedAt,
    endedAt,
    source: 'structured_session',
  };

  if (!prevPhase) {
    return {
      current,
      previous: null,
      comparisonBasis: 'none',
      comparisonNote:
        phase === 'deload'
          ? 'Deload não é avaliado por comparação de performance.'
          : 'Semana 1 de novo ciclo não é comparada com o deload anterior.',
    };
  }

  const prevStart = new Date(startedAt);
  prevStart.setDate(prevStart.getDate() - cycleDays);
  return {
    current,
    previous: {
      planId,
      cycleId: planId,
      phase: prevPhase,
      startedAt: prevStart,
      endedAt: new Date(startedAt),
      source: 'structured_session',
    },
    comparisonBasis: 'structured_previous_phase',
  };
};

/** Menor instante que precisa ser buscado no banco para cobrir os contextos. */
export const fetchRangeFor = (ctx: WeekContexts): { from: Date; to: Date } => ({
  from: new Date((ctx.previous?.startedAt ?? ctx.current.startedAt).getTime()),
  to: new Date(Math.max(ctx.current.endedAt.getTime(), Date.now())),
});

// ------------------------------------------------------------------
// Regras de pertencimento (fase / plano / janela)
// ------------------------------------------------------------------

/**
 * Compatibilidade de fase:
 *  - fase igual              → aceita
 *  - fase ausente (null)     → aceita como fallback legado
 *  - fase explicitamente diferente → SEMPRE rejeitada (nunca relaxar)
 */
export const phaseCompatible = (
  itemPhase: string | null | undefined,
  ctxPhase: TrainingPhase | null,
): boolean => {
  if (itemPhase == null) return true; // session.phase = null -> aceita fallback temporal
  if (ctxPhase == null) return true;
  return itemPhase === ctxPhase; // session.phase diverge de ctxPhase -> REJEITA (identidade forte)
};

/** Compatibilidade de plano: plan_id ausente é legado e aceito. */
export const planCompatible = (
  itemPlanId: string | null | undefined,
  ctxPlanId: string | null | undefined,
): boolean => {
  if (itemPlanId == null) return true; // plan_id null legado -> aceita temporalmente
  if (ctxPlanId == null) return true;
  return itemPlanId === ctxPlanId; // plan_id explicitamente diferente -> REJEITA
};

export const inWindow = (iso: string | null | undefined, ctx: WeekContext): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= ctx.startedAt.getTime() && t < ctx.endedAt.getTime();
};
