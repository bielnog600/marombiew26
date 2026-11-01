import { describe, it, expect } from 'vitest';
import { buildFoodCatalog } from '../../supabase/functions/_shared/foodCatalog';
import { hydrateDietPlanFromFoods } from '../../supabase/functions/_shared/dietHydration';
import {
  formatGlobalTargetDetails,
  validateGlobalDietTarget,
} from '../../supabase/functions/_shared/globalDietTarget';
import { rebalanceDayCarbs } from '../../supabase/functions/_shared/dayCarbRebalance';
import { normalizeStructuredDietOutput } from '../../supabase/functions/_shared/structuredDietOutput';

const ID_TAPIOCA = '44444444-4444-4444-8444-444444444444';
const ID_FRANGO = '33333333-3333-4333-8333-333333333333';
const ID_AZEITE = '55555555-5555-4555-8555-555555555555';

const catalog = buildFoodCatalog([
  { id: ID_TAPIOCA, name: 'Tapioca (goma)', calories: 340, protein: 0, carbs: 85, fats: 0, portion: 'gramas', portion_size: 100 },
  { id: ID_FRANGO, name: 'Frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion: 'gramas', portion_size: 100 },
  { id: ID_AZEITE, name: 'Azeite de oliva', calories: 884, protein: 0, carbs: 0, fats: 100, portion: 'gramas', portion_size: 100 },
] as any);

// Meta do caso Heracto (Katch-McArdle, bulking): 3397 kcal · P 166 · C 516 · G 75.
const TARGET = { kcal: 3397, p: 166, c: 516, g: 75 };

const linearPlan = (tapiocaG: number) => ({
  meta: { strategy: 'linear' },
  days: [
    {
      label: 'Padrão',
      meals: [
        { name: 'Almoço', items: [{ foodId: ID_FRANGO, qtyGrams: 260 }, { foodId: ID_TAPIOCA, qtyGrams: tapiocaG / 2 }, { foodId: ID_AZEITE, qtyGrams: 30 }] },
        { name: 'Jantar', items: [{ foodId: ID_FRANGO, qtyGrams: 260 }, { foodId: ID_TAPIOCA, qtyGrams: tapiocaG / 2 }, { foodId: ID_AZEITE, qtyGrams: 25 }] },
      ],
    },
  ],
});

const validate = (plan: any) =>
  validateGlobalDietTarget(hydrateDietPlanFromFoods(plan, catalog, 'strict_id').plan, TARGET);

describe('dieta linear com carbo alto (bulking)', () => {
  it('days enviado como texto JSON pela IA é lido como lista de dias', () => {
    const plan = linearPlan(610);
    const raw = { ...plan, days: JSON.stringify(plan.days) };
    expect(validate(raw).issues).toEqual(['Plano sem dias.']);
    const normalized = normalizeStructuredDietOutput(raw);
    expect(Array.isArray(normalized.days)).toBe(true);
    expect(validate(normalized).ok).toBe(true);
  });

  it('plano embrulhado num campo único e meals em texto também é lido', () => {
    const plan = linearPlan(610);
    const wrapped = { plan: JSON.stringify({ ...plan, days: [{ ...plan.days[0], meals: JSON.stringify(plan.days[0].meals) }] }) };
    expect(validate(normalizeStructuredDietOutput(wrapped)).ok).toBe(true);
  });

  it('carbo 220 g abaixo da meta é fechado pelo ajuste determinístico antes de reprovar', () => {
    const plan = linearPlan(350);
    expect(validate(plan).ok).toBe(false);
    const fixed = rebalanceDayCarbs(plan, null, catalog, { carbs_g: TARGET.c, target_kcal: TARGET.kcal, fat_g: TARGET.g });
    expect(fixed.adjustedDays).toEqual(['padrão']);
    const report = validate(fixed.plan);
    expect(report.ok).toBe(true);
    expect(Math.abs(report.diffs[0].c)).toBeLessThanOrEqual(15);
    expect(Math.abs(report.diffs[0].kcal)).toBeLessThanOrEqual(50);
  });

  it('sem meta única, o ajuste linear não mexe em nada (metas por dia seguem iguais)', () => {
    const plan = linearPlan(350);
    expect(rebalanceDayCarbs(plan, null, catalog).adjustedDays).toEqual([]);
  });

  it('detalhes do erro mostram dia, gerado × meta e o macro fora', () => {
    const report = validate(linearPlan(350));
    const [line] = formatGlobalTargetDetails(report, TARGET);
    expect(line).toContain('Padrão:');
    expect(line).toContain('× 3397 kcal');
    expect(line).toMatch(/C 298! × 516 g/);
    expect(line).toMatch(/P 161 × 166 g/);
  });

  it('plano sem dias vira uma explicação legível', () => {
    const report = validateGlobalDietTarget({ days: '[]' }, TARGET);
    expect(formatGlobalTargetDetails(report, TARGET)).toEqual([
      'Plano sem dias: a resposta da IA veio sem a lista de dias/refeições',
    ]);
  });
});
