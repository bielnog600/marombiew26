/**
 * FONTE ÚNICA DE VERDADE DA FASE ATUAL (S1 → S2 → S3 → Deload)
 * ===========================================================
 *
 * Antes existiam três caminhos concorrentes:
 *   - aluno  (MeusTreinos)            → calculateCurrentPhase(plan.fase_inicio_data)
 *   - admin  (StudentTrainingTab)     → plan.fase
 *   - lote   (useStudentsWeeklySummary) → plan.fase
 *
 * Aluno e admin podiam avaliar semanas diferentes do mesmo plano.
 *
 * SEMÂNTICA AUDITADA NO BANCO (ai_plans, tipo = 'treino'):
 *   - `fase`             : fase para a qual o DOCUMENTO do plano foi escrito
 *                          (o aluno pode ter um plano por fase). É gravada no
 *                          save (workoutPlanRepo) e editável pelo admin.
 *                          Hoje é majoritariamente 'semana_1' → NÃO é uma
 *                          timeline confiável, é um rótulo/cache.
 *   - `fase_inicio_data` : início do CICLO de 4 semanas (timeline real).
 *   - `cycle_days`       : duração do CICLO INTEIRO (todos os planos = 45).
 *                          NÃO é duração de fase e não muda a semana.
 *   - `version` / `parent_plan_id` : versionamento do documento; não
 *                          participam da resolução temporal da fase.
 *
 * POLÍTICA ADOTADA:
 *   1. Se existe `fase_inicio_data` válida → a fase vem da TIMELINE semanal
 *      (7 dias por fase, ciclo de 4 fases, rollover S4 → S1).
 *   2. Sem `fase_inicio_data` → fallback legado para `plan.fase`.
 *   3. Sem nada → 'semana_1'.
 *
 * Toda a aplicação (aluno, admin individual, resumo em lote, execução do
 * treino e weeklyTraining) resolve a fase por aqui.
 */

import {
  TRAINING_PHASES,
  type TrainingPhase,
} from './trainingPhase';
import { PHASE_DURATION_DAYS } from './weekContext';

export type PhaseSource = 'timeline' | 'plan_column' | 'default';

export interface PhasePlanLike {
  id?: string | null;
  fase?: string | null;
  fase_inicio_data?: string | null;
  /** Duração do CICLO (45). Nunca altera a duração da fase. */
  cycle_days?: number | null;
}

export interface ResolvedTrainingPhase {
  phase: TrainingPhase;
  source: PhaseSource;
  /** Início do ciclo (meia-noite UTC) quando resolvido pela timeline. */
  cycleStart: Date | null;
  /** Índice da fase dentro do ciclo (0..3) quando resolvido pela timeline. */
  weekIndex: number | null;
  /** Dias decorridos desde o início do ciclo. */
  daysIn: number | null;
}

const isTrainingPhase = (v: unknown): v is TrainingPhase =>
  typeof v === 'string' && (TRAINING_PHASES as string[]).includes(v);

/** Parse seguro de YYYY-MM-DD ou DD/MM/YYYY em UTC (sem bug de fuso). */
export const parsePhaseStartDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const iso = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = String(dateStr).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Resolve a fase ATUAL de um plano.
 * `cycle_days` é ignorado de propósito: fase é sempre semanal
 * (PHASE_DURATION_DAYS = 7) enquanto não existir campo explícito de duração
 * de fase no schema.
 */
export const resolveCurrentTrainingPhase = (
  plan: PhasePlanLike | null | undefined,
  now: Date = new Date(),
): ResolvedTrainingPhase => {
  const fallbackPhase: TrainingPhase = isTrainingPhase(plan?.fase)
    ? (plan!.fase as TrainingPhase)
    : 'semana_1';

  const start = parsePhaseStartDate(plan?.fase_inicio_data);
  if (!start) {
    return {
      phase: fallbackPhase,
      source: isTrainingPhase(plan?.fase) ? 'plan_column' : 'default',
      cycleStart: null,
      weekIndex: null,
      daysIn: null,
    };
  }

  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysIn = Math.floor((todayUTC - start.getTime()) / 86400000);
  if (daysIn < 0) {
    return { phase: 'semana_1', source: 'timeline', cycleStart: start, weekIndex: 0, daysIn: 0 };
  }
  const weekIndex = Math.floor(daysIn / PHASE_DURATION_DAYS) % TRAINING_PHASES.length;
  return {
    phase: TRAINING_PHASES[weekIndex],
    source: 'timeline',
    cycleStart: start,
    weekIndex,
    daysIn,
  };
};

/**
 * Resolve a fase atual a partir de uma LISTA de planos do aluno (o aluno pode
 * ter um documento por fase). Usa o primeiro plano com `fase_inicio_data`
 * (a lista já chega ordenada por created_at desc) e, na ausência dele, cai no
 * `fase` do plano mais recente.
 */
export const resolveCurrentTrainingPhaseFromPlans = (
  plans: PhasePlanLike[] | null | undefined,
  now: Date = new Date(),
): ResolvedTrainingPhase => {
  const list = plans ?? [];
  const withDate = list.find((p) => parsePhaseStartDate(p?.fase_inicio_data) !== null);
  if (withDate) return resolveCurrentTrainingPhase(withDate, now);
  return resolveCurrentTrainingPhase(list[0] ?? null, now);
};
