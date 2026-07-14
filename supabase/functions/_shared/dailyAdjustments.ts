// Mirror simplificado de src/lib/dailyAdjustments.ts para uso na Edge Function.
// Mantém o MESMO shape público. Alterações precisam ocorrer nos dois arquivos.

export type EnergyWeekday = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export const ENERGY_WEEKDAYS: EnergyWeekday[] = [
  'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom',
];

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
  model_estimated_adjustment_kcal?: number;
  status: AdjustmentStatus;
  instructions: AdjustmentInstruction[];
  summary: string;
  validation_status?: 'base_day';
}

export type DailyAdjustments = Record<EnergyWeekday, DailyAdjustment>;

function computeDayTarget(entry: any): number {
  if (entry?.fixed_kcal != null && Number(entry.fixed_kcal) > 0) {
    return Math.round(Number(entry.fixed_kcal));
  }
  return Math.round(Number(entry?.base_kcal ?? 0) + Number(entry?.adjustment_kcal ?? 0));
}

export function buildRequestedFromSchedule(schedule: any): Record<EnergyWeekday, { target_kcal: number; requested_adjustment_kcal: number }> {
  const base = Math.round(Number(schedule?.base_daily_kcal ?? 0));
  const out: any = {};
  for (const wd of ENERGY_WEEKDAYS) {
    const d = schedule?.days?.[wd];
    const t = computeDayTarget(d);
    out[wd] = { target_kcal: t, requested_adjustment_kcal: t - base };
  }
  return out;
}

export function hasDailyCalorieVariation(schedule: any): boolean {
  if (!schedule || !schedule.days) return false;
  const base = Math.round(Number(schedule.base_daily_kcal ?? 0));
  for (const wd of ENERGY_WEEKDAYS) {
    const d = schedule.days?.[wd];
    if (!d) continue;
    const adj = Number(d.adjustment_kcal ?? 0);
    const fixed = d.fixed_kcal;
    if (adj !== 0) return true;
    if (fixed != null && Number(fixed) > 0 && Math.round(Number(fixed)) !== base) return true;
    if (computeDayTarget(d) !== base) return true;
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

export function normalizeDailyAdjustments(modelAdjustments: unknown, schedule: any): { adjustments: DailyAdjustments; missing: EnergyWeekday[] } {
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
          .filter((x: AdjustmentInstruction | null): x is AdjustmentInstruction => x !== null);
    const serverEstimated = isBaseDay
      ? 0
      : instructions.reduce((acc: number, inst: AdjustmentInstruction) => {
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

export function validateDailyAdjustments(adj: DailyAdjustments | null | undefined, missing: EnergyWeekday[] = []): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!adj) return { ok: false, errors: ['dailyAdjustments ausente.'] };
  for (const wd of missing) errors.push(`${wd}: dia ausente na resposta do modelo.`);
  for (const wd of ENERGY_WEEKDAYS) {
    const d = adj[wd];
    if (!d) { errors.push(`${wd}: dia ausente.`); continue; }
    const req = d.requested_adjustment_kcal;
    if (req === 0) {
      if (d.status !== 'base') errors.push(`${wd}: status inválido para dia base.`);
      if (d.instructions.length > 0) errors.push(`${wd}: dia base não pode ter instruções.`);
      if (d.estimated_adjustment_kcal !== 0) errors.push(`${wd}: dia base deve ter estimated_adjustment_kcal = 0.`);
    } else {
      if (d.status !== 'adjusted') errors.push(`${wd}: status inválido para dia ajustado.`);
      if (d.instructions.length === 0) {
        errors.push(`${wd}: dia ajustado precisa de pelo menos uma instrução.`);
      } else {
        const expected: AdjustmentAction = req > 0 ? 'add' : 'remove';
        for (const inst of d.instructions) {
          if (inst.action !== expected) {
            errors.push(`${wd}: instrução com action inválida (${inst.action}).`);
            break;
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}