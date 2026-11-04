import { describe, it, expect } from 'vitest';
import { applyCarbCycle, computeLevelTarget, DEFAULT_CARB_LEVELS, readCarbCycleConfig } from '@/lib/dietCarbCycle';
import { buildStructuredDisplayGroups } from '@/lib/studentStructuredDiet';
import { resolvePersistedTargetsByDay } from '@/lib/dietStructuredGuards';

const foods: any[] = [
  { id: 'arroz', name: 'Arroz', portion_size: 100, calories: 130, protein: 2.5, carbs: 28, fats: 0.3 },
  { id: 'frango', name: 'Frango', portion_size: 100, calories: 165, protein: 31, carbs: 0, fats: 3.6 },
  { id: 'azeite', name: 'Azeite', portion_size: 100, calories: 884, protein: 0, carbs: 0, fats: 100 },
];

const base = { kcal: 2000, p: 150, c: 200, g: 67 };
const item = (foodId: string, qtyGrams: number) => ({ foodId, name: foodId, qtyGrams, macros: { kcal: 0, p: 0, c: 0, g: 0 } });
const plan: any = {
  meta: { version: '1.0', strategy: 'linear', foodContractVersion: '1' },
  targets: base,
  days: [{
    label: 'Padrão',
    meals: [{ id: 'm1', name: 'Almoço', order: 0, items: [item('arroz', 300), item('frango', 200), item('azeite', 10)], totals: { kcal: 0, p: 0, c: 0, g: 0 } }],
    totals: { kcal: 0, p: 0, c: 0, g: 0 },
  }],
};

describe('ciclo de carbo no editor', () => {
  it('alto +15% kcal com o extra todo no carbo; P e G iguais à base', () => {
    const t = computeLevelTarget(base, DEFAULT_CARB_LEVELS.alto);
    expect(t.p).toBe(150);
    expect(t.g).toBe(67);
    expect(Math.abs(t.kcal - 2300)).toBeLessThanOrEqual(2);
    expect(t.c).toBe(275);
  });

  it('médio +7% e baixo −15% vêm do carbo', () => {
    expect(computeLevelTarget(base, DEFAULT_CARB_LEVELS.medio).c).toBe(235);
    expect(computeLevelTarget(base, DEFAULT_CARB_LEVELS.baixo).c).toBe(125);
  });

  it('cria 7 dias, só escala fontes de carbo e grava metas por dia', () => {
    const cfg = readCarbCycleConfig(plan);
    cfg.assignments = { ter: 'alto', qua: 'baixo' };
    const { plan: next, protocols } = applyCarbCycle(plan, null, cfg, foods);
    expect(next.days.map((d: any) => d.weekday)).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
    expect(next.meta.strategy).toBe('carb_cycling');
    expect(next.targets).toEqual(base);
    const ter: any = next.days[1];
    expect(ter.label).toBe('Terça — Carbo alto');
    const qty = (d: any, id: string) => d.meals[0].items.find((i: any) => i.foodId === id).qtyGrams;
    expect(qty(ter, 'frango')).toBe(200);
    expect(qty(ter, 'azeite')).toBe(10);
    expect(qty(ter, 'arroz') % 5).toBe(0);
    expect(qty(ter, 'arroz')).toBeGreaterThan(300);
    expect(qty(next.days[2], 'arroz')).toBeLessThan(300);
    expect(qty(next.days[0], 'arroz')).toBe(300);
    expect(protocols.weekly_day_targets.seg).toEqual(base);
    expect(protocols.weekly_day_targets.ter.c).toBe(275);
    const targets = resolvePersistedTargetsByDay({ plan: next, protocols });
    expect(targets[1]?.c).toBe(275);
    expect(targets[0]?.kcal).toBe(2000);
  });

  it('aluno vê o selo do dia e dias base sem selo', () => {
    const cfg = readCarbCycleConfig(plan);
    cfg.assignments = { ter: 'alto' };
    const { plan: next, protocols } = applyCarbCycle(plan, null, cfg, foods);
    const groups = buildStructuredDisplayGroups(next, protocols);
    expect(groups).toHaveLength(7);
    expect(groups[1].carbLabel).toBe('Carbo alto');
    expect(groups[1].target?.c).toBe(275);
    expect(groups[0].carbLabel).toBeNull();
  });

  it('reaplicar parte do cardápio base salvo, não do dia já ciclado', () => {
    const cfg = readCarbCycleConfig(plan);
    cfg.assignments = { seg: 'alto' };
    const first = applyCarbCycle(plan, null, cfg, foods);
    const again = applyCarbCycle(first.plan, first.protocols, { ...cfg, assignments: { seg: 'base' } }, foods);
    expect((again.plan.days[0] as any).meals[0].items[0].qtyGrams).toBe(300);
  });
});
