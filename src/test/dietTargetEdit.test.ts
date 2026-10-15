import { describe, it, expect } from 'vitest';
import { applyTargetToPlan, redistributeFromKcal, kcalFromMacros, replaceMetaLine } from '@/lib/dietTargetEdit';

const plan: any = { targets: { kcal: 1450, p: 119, c: 147, g: 43 }, days: [{ weekday: 'seg', targets: { kcal: 1450, p: 119, c: 147, g: 43 }, meals: [{ name: 'Almoço', items: [{ foodId: 'x', name: 'Arroz', qtyGrams: 100, portionLabel: '100 g', macros: { kcal: 130, p: 2.5, c: 28, g: 0.3 } }] }] }] };

describe('dietTargetEdit', () => {
  it('kcal change keeps P/G and closes on carbs', () => {
    expect(redistributeFromKcal(1603, 119, 43)).toEqual({ kcal: 1603, p: 119, c: 185, g: 43 });
    expect(kcalFromMacros(119, 147, 43)).toBe(1451);
  });
  it('applies target without touching foods when rescale is off', () => {
    const t = { kcal: 1603, p: 119, c: 185, g: 43 };
    const out = applyTargetToPlan(plan, t, { weekly_day_targets: { seg: { kcal: 1450, p: 1, c: 1, g: 1, type: 'normal' } } }, false);
    expect(out.plan.targets.kcal).toBe(1603);
    expect((out.plan.days[0] as any).targets.kcal).toBe(1603);
    expect(out.plan.days[0].meals[0].items[0]).toEqual(plan.days[0].meals[0].items[0]);
    expect(out.protocols.weekly_day_targets.seg).toMatchObject({ kcal: 1603, c: 185, type: 'normal' });
  });
  it('rescale scales quantities', () => {
    const out = applyTargetToPlan(plan, { kcal: 260, p: 5, c: 56, g: 1 }, null, true);
    expect(out.plan.days[0].meals[0].items[0].qtyGrams).toBe(200);
  });
  it('replaces meta line in markdown', () => {
    expect(replaceMetaLine('x\n**Meta diária:** 1450 kcal · 1g P\ny', { kcal: 1603, p: 119, c: 185, g: 43 })).toContain('**Meta diária:** 1603 kcal · 119g P · 185g C · 43g G');
  });
});
