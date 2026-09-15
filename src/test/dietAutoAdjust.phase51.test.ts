/**
 * FASE 5.1 — hardening final: validação de meta, política de inviabilidade,
 * identificação de plano STRUCTURED e metas persistidas por dia.
 */
import { describe, it, expect } from 'vitest';
import {
  optimizeDietDay,
  optimizeDietPlan,
  isValidTarget,
  compareScores,
  scoreAdjustmentCandidate,
} from '@/lib/dietAutoAdjust';
import {
  isStructuredCanonicalPlan,
  hasUnresolvedCanonicalItems,
  resolvePersistedTargetsByDay,
} from '@/lib/dietStructuredGuards';
import { parseGrams } from '@/components/diet/CanonicalDietEditor';
import type { FoodRecord } from '@/lib/nutritionEngine';

const food = (id: string, name: string, kcal: number, p: number, c: number, g: number): FoodRecord => ({
  id,
  name,
  portion_size: 100,
  calories: kcal,
  protein: p,
  carbs: c,
  fats: g,
});

const ARROZ = food('rice-id', 'Arroz branco', 130, 2.7, 28, 0.3);
const FRANGO = food('chicken-id', 'Frango grelhado', 165, 31, 0, 3.6);
const FOODS = [ARROZ, FRANGO];

const item = (f: FoodRecord, qty: number, extra: Record<string, unknown> = {}) => ({
  foodId: f.id,
  name: f.name,
  qtyGrams: qty,
  macros: { kcal: 0, p: 0, c: 0, g: 0 },
  ...extra,
});

const day = (items: any[], weekday?: string) => ({
  label: weekday ?? 'Padrão',
  ...(weekday ? { weekday } : {}),
  meals: [{ id: 'm1', name: 'Almoço', order: 0, items, totals: { kcal: 0, p: 0, c: 0, g: 0 } }],
  totals: { kcal: 0, p: 0, c: 0, g: 0 },
});

const plan = (days: any[], meta: Record<string, unknown> = {}) => ({
  meta: { version: '1.0', ...meta },
  targets: { kcal: 2000, p: 150, c: 200, g: 60 },
  days,
});

describe('Fase 5.1 — validação de meta', () => {
  it('A. meta com macro negativo é inválida', () => {
    expect(isValidTarget({ kcal: 2000, p: -1, c: 200, g: 60 })).toBe(false);
    expect(isValidTarget({ kcal: -1, p: 10, c: 10, g: 10 })).toBe(false);
  });

  it('B. carboidrato zero é meta válida (cetogênica)', () => {
    expect(isValidTarget({ kcal: 1800, p: 160, c: 0, g: 130 })).toBe(true);
  });

  it('C. optimizeDietDay rejeita meta inválida', () => {
    const res = optimizeDietDay({
      plan: plan([day([item(ARROZ, 100)])]),
      dayIndex: 0,
      target: { kcal: 2000, p: 150, c: -5, g: 60 } as any,
      foods: FOODS,
    });
    expect(res.status).toBe('invalid_target');
    expect(res.adjustedPlan).toBeUndefined();
  });
});

describe('Fase 5.1 — dia sem meta', () => {
  it('D. dia materializado sem meta retorna invalid_target e não é ignorado', () => {
    const res = optimizeDietPlan({
      plan: plan([day([item(ARROZ, 100)], 'seg'), day([item(ARROZ, 100)], 'ter')]),
      targetsByDay: [{ kcal: 500, p: 10, c: 100, g: 2 }, null],
      foods: FOODS,
    });
    expect(res.days).toHaveLength(2);
    expect(res.days[1].status).toBe('invalid_target');
    expect(res.withinTolerance).toBe(false);
    expect(res.status).toBe('invalid_target');
  });

  it('E. plano com dia sem meta nunca vira already_within_target', () => {
    const res = optimizeDietPlan({
      plan: plan([day([item(ARROZ, 100)])]),
      targetsByDay: [null],
      foods: FOODS,
    });
    expect(res.status).not.toBe('already_within_target');
    expect(res.adjustedPlan).toBeUndefined();
  });
});

describe('Fase 5.1 — política de inviabilidade', () => {
  it('F. resultado inviável não expõe adjustedPlan, só bestAttemptPlan', () => {
    const res = optimizeDietDay({
      plan: plan([day([item(ARROZ, 100, { manualLocked: true })])]),
      dayIndex: 0,
      target: { kcal: 3000, p: 250, c: 300, g: 90 },
      foods: FOODS,
    });
    expect(res.withinTolerance).toBe(false);
    expect(res.adjustedPlan).toBeUndefined();
    expect(res.feasibleAdjustedPlan).toBeUndefined();
  });

  it('G. plano inviável não devolve adjustedPlan aplicável', () => {
    const res = optimizeDietPlan({
      plan: plan([day([item(ARROZ, 100, { manualLocked: true })])]),
      targetsByDay: [{ kcal: 4000, p: 300, c: 400, g: 120 }],
      foods: FOODS,
    });
    expect(res.adjustedPlan).toBeUndefined();
    expect(res.bestAttemptPlan).toBeTruthy();
  });
});

describe('Fase 5.1 — score: menos itens e desempate', () => {
  const score = (over: Partial<ReturnType<typeof scoreAdjustmentCandidate>>) => ({
    feasible: true,
    changedItemCount: 2,
    maxNormalizedResidual: 0.01,
    sumNormalizedResidual: 0.02,
    totalRelativeChange: 0.1,
    totalAbsoluteGramChange: 100,
    ...over,
  });

  it('H. entre duas soluções viáveis, a de 2 itens vence a de 4 itens', () => {
    const two = score({ changedItemCount: 2, totalAbsoluteGramChange: 400 });
    const four = score({ changedItemCount: 4, totalAbsoluteGramChange: 100 });
    expect(compareScores(two, four)).toBeLessThan(0);
  });

  it('I. empate total devolve 0 — a primeira solução encontrada é mantida', () => {
    expect(compareScores(score({}), score({}))).toBe(0);
  });

  it('I2. viável sempre vence inviável, mesmo com mais alterações', () => {
    const feasible = score({ changedItemCount: 5 });
    const infeasible = score({ feasible: false, changedItemCount: 1 });
    expect(compareScores(feasible, infeasible)).toBeLessThan(0);
  });
});

describe('Fase 5.1 — identificação STRUCTURED por contrato', () => {
  it('J. contrato presente com todos os itens unresolved continua structured', () => {
    const p = plan(
      [day([{ foodId: null, name: 'Arroz caseiro', qtyGrams: 100, resolutionStatus: 'unresolved' }])],
      { foodContractVersion: '1.0' },
    );
    expect(isStructuredCanonicalPlan(p)).toBe(true);
    expect(hasUnresolvedCanonicalItems(p)).toBe(true);
  });

  it('K. plano legado sem contrato e sem foodId não é structured', () => {
    const p = plan([day([{ name: 'Arroz', qtyGrams: 100 }])]);
    expect(isStructuredCanonicalPlan(p)).toBe(false);
  });

  it('L. compatibilidade: plano antigo com foodId ainda é tratado como structured', () => {
    expect(isStructuredCanonicalPlan(plan([day([item(ARROZ, 100)])]))).toBe(true);
  });

  it('M. plano structured totalmente resolvido não tem unresolved', () => {
    const p = plan([day([item(ARROZ, 100)])], { foodContractVersion: '1.0' });
    expect(hasUnresolvedCanonicalItems(p)).toBe(false);
  });
});

describe('Fase 5.1 — metas persistidas por dia', () => {
  const carbPlan = plan([day([item(ARROZ, 100)], 'seg'), day([item(ARROZ, 100)], 'ter')], {
    foodContractVersion: '1.0',
  });

  it('N. carb cycling usa a meta do weekday', () => {
    const targets = resolvePersistedTargetsByDay({
      plan: carbPlan,
      protocols: {
        carb_cycling: { enabled: true },
        weekly_day_targets: {
          seg: { kcal: 2200, p: 160, c: 250, g: 60 },
          ter: { kcal: 1800, p: 160, c: 120, g: 70 },
        },
      },
    });
    expect(targets[0]?.kcal).toBe(2200);
    expect(targets[1]?.kcal).toBe(1800);
  });

  it('O. carb cycling sem meta do dia retorna null (nunca usa a meta global)', () => {
    const targets = resolvePersistedTargetsByDay({
      plan: carbPlan,
      protocols: {
        carb_cycling: { enabled: true },
        weekly_day_targets: { seg: { kcal: 2200, p: 160, c: 250, g: 60 } },
      },
    });
    expect(targets[1]).toBeNull();
  });

  it('P. dieta linear usa a meta global em todos os dias', () => {
    const targets = resolvePersistedTargetsByDay({
      plan: carbPlan,
      protocols: { carb_cycling: { enabled: false } },
    });
    expect(targets[0]).toEqual({ kcal: 2000, p: 150, c: 200, g: 60 });
    expect(targets[1]).toEqual({ kcal: 2000, p: 150, c: 200, g: 60 });
  });
});

describe('Fase 5.1 — quantidade manual', () => {
  it('Q. quantidade deve ser maior que zero', () => {
    expect(parseGrams('0')).toBeNull();
    expect(parseGrams('-10')).toBeNull();
    expect(parseGrams('')).toBeNull();
    expect(parseGrams('abc')).toBeNull();
  });

  it('R. aceita decimal com vírgula ou ponto', () => {
    expect(parseGrams('18,5')).toBe(18.5);
    expect(parseGrams('18.5')).toBe(18.5);
    expect(parseGrams('120')).toBe(120);
  });
});
