/**
 * Daily Adjustments — contrato formal para a saída "Ajustes por dia" da IA
 * de dieta quando um `weekly_energy_schedule` está presente.
 *
 * Este módulo é PURO (sem I/O, sem React) e reutilizado tanto no cliente
 * quanto na Edge Function `diet-agent` (via cópia mirror em
 * `supabase/functions/_shared/dailyAdjustments.ts`). Qualquer alteração de
 * shape deve ser aplicada nos dois arquivos.
 */
import { ENERGY_WEEKDAYS, WEEKDAY_LABELS, type EnergyWeekday, type WeeklyEnergySchedule, computeDayTarget } from './weeklyEnergy';

export type AdjustmentAction = 'add' | 'remove';
export type AdjustmentStatus = 'base' | 'adjusted';

export interface AdjustmentInstruction {
  action: AdjustmentAction;
  food_name: string;
  quantity: number;
  unit: string;
  estimated_kcal: number;
}

export interface DailyAdjustment {
  target_kcal: number;
  requested_adjustment_kcal: number;
  estimated_adjustment_kcal: number;
  /** Valor declarado pela IA (não usado na validação; mantido como dado técnico). */
  model_estimated_adjustment_kcal?: number;
  status: AdjustmentStatus;
  instructions: AdjustmentInstruction[];
  summary: string;
  /** Marcador opcional: 'base_day' quando o dia foi completado pelo servidor sem exigir ajuste. */
  validation_status?: 'base_day';
}

export type DailyAdjustments = Record<EnergyWeekday, DailyAdjustment>;

/** Requested target/adjustment derivados do schedule (fonte de verdade). */
export interface RequestedDay {
  target_kcal: number;
  requested_adjustment_kcal: number;
}

export function buildRequestedFromSchedule(
  schedule: WeeklyEnergySchedule,
): Record<EnergyWeekday, RequestedDay> {
  const base = Math.round(schedule.base_daily_kcal);
  const out = {} as Record<EnergyWeekday, RequestedDay>;
  for (const wd of ENERGY_WEEKDAYS) {
    const target = computeDayTarget(schedule.days[wd]);
    out[wd] = {
      target_kcal: target,
      requested_adjustment_kcal: target - base,
    };
  }
  return out;
}

/**
 * Determina deterministicamente se o schedule possui alguma variação calórica real
 * em qualquer dia da semana. Retorna false quando todos os 7 dias mantêm a meta base.
 */
export function hasDailyCalorieVariation(schedule: WeeklyEnergySchedule | null | undefined): boolean {
  if (!schedule || !schedule.days) return false;
  const base = Math.round(Number(schedule.base_daily_kcal ?? 0));
  for (const wd of ENERGY_WEEKDAYS) {
    const d: any = (schedule.days as any)[wd];
    if (!d) continue;
    const adj = Number(d.adjustment_kcal ?? 0);
    const fixed = d.fixed_kcal;
    if (adj !== 0) return true;
    if (fixed != null && Number(fixed) > 0 && Math.round(Number(fixed)) !== base) return true;
    const target = computeDayTarget(d);
    if (target !== base) return true;
  }
  return false;
}

function sanitizeInstruction(raw: any): AdjustmentInstruction | null {
  if (!raw || typeof raw !== 'object') return null;
  const action = raw.action === 'remove' ? 'remove' : raw.action === 'add' ? 'add' : null;
  if (!action) return null;
  const food_name = typeof raw.food_name === 'string' ? raw.food_name.trim() : '';
  if (!food_name) return null;
  const quantity = Number(raw.quantity);
  const estimated_kcal = Number(raw.estimated_kcal);
  const unit = typeof raw.unit === 'string' ? raw.unit.trim() : 'g';
  return {
    action,
    food_name,
    quantity: Number.isFinite(quantity) ? Math.round(quantity) : 0,
    unit: unit || 'g',
    estimated_kcal: Number.isFinite(estimated_kcal) ? Math.round(estimated_kcal) : 0,
  };
}

/**
 * Normaliza o objeto devolvido pelo modelo combinando:
 *  - targets DETERMINÍSTICOS do schedule (fonte de verdade — não confiar na IA);
 *  - `estimated_adjustment_kcal`, `instructions`, `summary` sugeridos pela IA.
 *
 * Sempre retorna 7 dias. Se a IA não devolveu algum dia, ele fica marcado
 * como `missing_data` via `validateDailyAdjustments`. Dias com ajuste zero
 * viram automaticamente `status: 'base'` com instruções vazias.
 */
export function normalizeDailyAdjustments(
  modelAdjustments: unknown,
  schedule: WeeklyEnergySchedule,
): { adjustments: DailyAdjustments; missing: EnergyWeekday[] } {
  const requested = buildRequestedFromSchedule(schedule);
  const raw = (modelAdjustments && typeof modelAdjustments === 'object')
    ? (modelAdjustments as Record<string, any>)
    : {};
  const out = {} as DailyAdjustments;
  const missing: EnergyWeekday[] = [];
  for (const wd of ENERGY_WEEKDAYS) {
    const req = requested[wd];
    const modelDay = raw[wd];
    if (!modelDay || typeof modelDay !== 'object') {
      // Apenas dias que REALMENTE possuem ajuste são considerados ausentes.
      // Dias base ausentes são completados pelo servidor como "Manter plano base".
      if (req.requested_adjustment_kcal !== 0) {
        missing.push(wd);
        out[wd] = {
          target_kcal: req.target_kcal,
          requested_adjustment_kcal: req.requested_adjustment_kcal,
          estimated_adjustment_kcal: 0,
          model_estimated_adjustment_kcal: 0,
          status: 'adjusted',
          instructions: [],
          summary: '',
        };
      } else {
        out[wd] = {
          target_kcal: req.target_kcal,
          requested_adjustment_kcal: 0,
          estimated_adjustment_kcal: 0,
          model_estimated_adjustment_kcal: 0,
          status: 'base',
          instructions: [],
          summary: 'Manter plano base',
          validation_status: 'base_day',
        };
      }
      continue;
    }
    const estRaw = Number(modelDay.estimated_adjustment_kcal);
    const isBaseDay = req.requested_adjustment_kcal === 0;
    const rawInstructions = Array.isArray(modelDay.instructions) ? modelDay.instructions : [];
    const instructions = isBaseDay
      ? []
      : rawInstructions
          .map(sanitizeInstruction)
          .filter((x): x is AdjustmentInstruction => x !== null);
    // Fonte de verdade do estimado = soma assinada das instructions.
    const serverEstimated = isBaseDay
      ? 0
      : instructions.reduce((acc, inst) => {
          const kcal = Math.abs(inst.estimated_kcal);
          return acc + (inst.action === 'add' ? kcal : -kcal);
        }, 0);
    out[wd] = {
      target_kcal: req.target_kcal,
      requested_adjustment_kcal: req.requested_adjustment_kcal,
      estimated_adjustment_kcal: serverEstimated,
      model_estimated_adjustment_kcal: Number.isFinite(estRaw) ? Math.round(estRaw) : 0,
      status: isBaseDay ? 'base' : 'adjusted',
      instructions,
      summary: typeof modelDay.summary === 'string' ? modelDay.summary.slice(0, 500) : '',
    };
  }
  return { adjustments: out, missing };
}

export interface DailyAdjustmentValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Regras (todas obrigatórias quando o schedule está presente):
 *  - 7 dias exatos (seg..dom);
 *  - dias com requested_adjustment_kcal === 0 devem estar em status 'base' e sem instructions;
 *  - dias ajustados devem ter pelo menos 1 instrução;
 *  - action deve casar com o sinal do ajuste solicitado (positivo → add, negativo → remove).
 */
export function validateDailyAdjustments(
  adj: DailyAdjustments | null | undefined,
  missing: EnergyWeekday[] = [],
): DailyAdjustmentValidation {
  const errors: string[] = [];
  if (!adj) {
    return { ok: false, errors: ['dailyAdjustments ausente.'] };
  }
  for (const wd of missing) {
    errors.push(`${WEEKDAY_LABELS[wd]}: dia ausente na resposta do modelo.`);
  }
  for (const wd of ENERGY_WEEKDAYS) {
    const d = adj[wd];
    if (!d) {
      errors.push(`${WEEKDAY_LABELS[wd]}: dia ausente.`);
      continue;
    }
    const req = d.requested_adjustment_kcal;
    if (req === 0) {
      if (d.status !== 'base') {
        errors.push(`${WEEKDAY_LABELS[wd]}: status inválido para dia base (${d.status}).`);
      }
      if (d.instructions.length > 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia base não pode ter instruções.`);
      }
      if (d.estimated_adjustment_kcal !== 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia base deve ter estimated_adjustment_kcal = 0.`);
      }
    } else {
      if (d.status !== 'adjusted') {
        errors.push(`${WEEKDAY_LABELS[wd]}: status inválido para dia ajustado (${d.status}).`);
      }
      if (d.instructions.length === 0) {
        errors.push(`${WEEKDAY_LABELS[wd]}: dia ajustado precisa de pelo menos uma instrução.`);
      } else {
        const expectedAction: AdjustmentAction = req > 0 ? 'add' : 'remove';
        for (const inst of d.instructions) {
          if (inst.action !== expectedAction) {
            errors.push(
              `${WEEKDAY_LABELS[wd]}: instrução com action="${inst.action}" incompatível com ajuste ${req > 0 ? 'positivo' : 'negativo'}.`,
            );
            break;
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export type ToleranceState =
  | 'within_tolerance'
  | 'outside_tolerance'
  | 'base_day'
  | 'missing_data';

export const TOLERANCE_TEXT: Record<ToleranceState, string> = {
  within_tolerance: 'Dentro da tolerância',
  outside_tolerance: 'Fora da tolerância — regere ou edite manualmente',
  base_day: 'Manter plano base',
  missing_data: 'Dados de ajuste ausentes',
};

/** Tolerância fixa (MVP). */
export const TOLERANCE_KCAL = 75;

export interface ToleranceResult {
  state: ToleranceState;
  tolerance_kcal: number;
  difference_kcal: number;
}

export function evaluateTolerance(
  requested_adjustment_kcal: number,
  estimated_adjustment_kcal: number | null | undefined,
): ToleranceResult {
  if (estimated_adjustment_kcal == null || !Number.isFinite(estimated_adjustment_kcal)) {
    return { state: 'missing_data', tolerance_kcal: 0, difference_kcal: 0 };
  }
  if (requested_adjustment_kcal === 0) {
    return { state: 'base_day', tolerance_kcal: 0, difference_kcal: estimated_adjustment_kcal };
  }
  const tolerance = TOLERANCE_KCAL;
  const diff = estimated_adjustment_kcal - requested_adjustment_kcal;
  return {
    state: Math.abs(diff) <= tolerance ? 'within_tolerance' : 'outside_tolerance',
    tolerance_kcal: tolerance,
    difference_kcal: diff,
  };
}