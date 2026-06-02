/**
 * Liga a aderência semanal (logs reais) à prescrição efetivamente usada na semana.
 * Determina a semana *ativa* a partir da semana *planejada* pelo calendário e do status de aderência.
 */

import { TRAINING_PHASES, type TrainingPhase } from './trainingPhase';
import type { AdherenceStatus } from './weeklyAdherence';

export type WeekAction =
  | 'advance'        // avançar uma semana
  | 'hold'           // manter a mesma semana (sem progressão agressiva)
  | 'repeat'         // repetir a semana anterior
  | 'conservative'   // manter, sem liberar overload/intensificação
  | 'await_review';  // não avançar, recomendar revisão pelo coach

export interface WeekResolution {
  plannedPhase: TrainingPhase;
  activePhase: TrainingPhase;
  action: WeekAction;
  /** Bloqueia progressão de carga/reps/RIR agressiva. */
  blockOverload: boolean;
  /** Sinaliza que o coach deve revisar antes de novo avanço. */
  suggestRevision: boolean;
  /** Mensagem curta explicando o motivo do estado atual. */
  reasonLabel: string;
}

const idx = (p: TrainingPhase) => Math.max(0, TRAINING_PHASES.indexOf(p));
const cycle = (i: number) => TRAINING_PHASES[((i % TRAINING_PHASES.length) + TRAINING_PHASES.length) % TRAINING_PHASES.length];

export const nextPhase = (p: TrainingPhase): TrainingPhase => cycle(idx(p) + 1);
export const prevPhase = (p: TrainingPhase): TrainingPhase => cycle(idx(p) - 1);

const REASON: Record<AdherenceStatus, string> = {
  apto_avancar: 'Avanço liberado pela aderência da semana anterior',
  manter_semana: 'Semana mantida por poucos registros válidos',
  repetir_semana: 'Semana repetida por execução insuficiente',
  dados_insuficientes: 'Dados insuficientes para progressão mais precisa',
  sugerir_reanalise: 'Aguardando revisão do coach — registros pouco confiáveis',
};

/**
 * Resolve qual semana o aluno deve executar agora, com base na semana planejada
 * pelo calendário (ex: calculateCurrentPhase) e no status de aderência da semana
 * anterior. Nunca recua a partir de semana_1.
 */
export const resolveActiveWeek = (
  plannedPhase: TrainingPhase,
  status: AdherenceStatus | null | undefined,
): WeekResolution => {
  const s = status ?? 'dados_insuficientes';

  switch (s) {
    case 'apto_avancar':
      return {
        plannedPhase,
        activePhase: nextPhase(plannedPhase),
        action: 'advance',
        blockOverload: false,
        suggestRevision: false,
        reasonLabel: REASON.apto_avancar,
      };
    case 'manter_semana':
      return {
        plannedPhase,
        activePhase: plannedPhase,
        action: 'hold',
        blockOverload: true,
        suggestRevision: false,
        reasonLabel: REASON.manter_semana,
      };
    case 'repetir_semana': {
      // Não recuar abaixo de semana_1 — semana_1 repete em si mesma.
      const active = plannedPhase === 'semana_1' ? 'semana_1' : prevPhase(plannedPhase);
      return {
        plannedPhase,
        activePhase: active,
        action: 'repeat',
        blockOverload: true,
        suggestRevision: false,
        reasonLabel: REASON.repetir_semana,
      };
    }
    case 'sugerir_reanalise':
      return {
        plannedPhase,
        activePhase: plannedPhase,
        action: 'await_review',
        blockOverload: true,
        suggestRevision: true,
        reasonLabel: REASON.sugerir_reanalise,
      };
    case 'dados_insuficientes':
    default:
      return {
        plannedPhase,
        activePhase: plannedPhase,
        action: 'conservative',
        blockOverload: true,
        suggestRevision: false,
        reasonLabel: REASON.dados_insuficientes,
      };
  }
};

export const WEEK_ACTION_LABEL: Record<WeekAction, string> = {
  advance: 'Avançar de semana',
  hold: 'Manter semana',
  repeat: 'Repetir semana',
  conservative: 'Manter — modo conservador',
  await_review: 'Aguardar revisão do coach',
};