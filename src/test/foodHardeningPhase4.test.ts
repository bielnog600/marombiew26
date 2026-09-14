import { describe, it, expect } from 'vitest';
import { buildFoodCatalog, type FoodCatalog } from '../../supabase/functions/_shared/foodCatalog';
import {
  validateFoodContract,
  normalizeAllowedUnresolved,
} from '../../supabase/functions/_shared/foodContract';
import { hydrateDietPlanFromFoods } from '../../supabase/functions/_shared/dietHydration';
import { validateGlobalDietTarget } from '../../supabase/functions/_shared/globalDietTarget';
import { evaluateDietCandidateValidity } from '../../supabase/functions/_shared/dietRoutingPolicy';
import { parseDietPlanStrict } from '@/lib/dietSchema';
import { buildAllowedUnresolvedFromModelDiet } from '@/lib/modelDietFoods';
import { dietPlanToParsedMeals } from '@/lib/dietPlanAdapter';
import { buildMealTableMarkdown } from '@/lib/dietMarkdownSerializer';

const ID_ARROZ_A = '11111111-1111-4111-8111-111111111111';
const ID_ARROZ_B = '22222222-2222-4222-8222-222222222222';
const ID_FRANGO = '33333333-3333-4333-8333-333333333333';
const ID_AZEITE = '44444444-4444-4444-8444-444444444444';

const rows = [
  { id: ID_ARROZ_A, name: 'Arroz branco', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, portion: 'gramas', portion_size: 100, brand: null, source: 'TACO', barcode: null, source_food_id: null },
  { id: ID_ARROZ_B, name: 'Arroz branco', calories: 358, protein: 7.2, carbs: 78, fats: 0.6, portion: 'gramas', portion_size: 100, brand: 'Cigala', source: 'rotulo', barcode: null, source_food_id: '123456' },
  { id: ID_FRANGO, name: 'Frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion: 'gramas', portion_size: 100, brand: null, source: null, barcode: null, source_food_id: null },
  // calories cadastradas divergem de 4/4/9 de propósito (200 vs 180)
  { id: ID_AZEITE, name: 'Mistura teste', calories: 200, protein: 10, carbs: 10, fats: 10, portion: 'gramas', portion_size: 100, brand: null, source: null, barcode: null, source_food_id: null },
];

const catalog: FoodCatalog = buildFoodCatalog(rows as any);

const planWith = (items: any[], extra: any = {}) => ({
  version: 1,
  days: [
    {
      weekday: 'seg',
      label: 'Segunda',
      meals: [{ name: 'Almoço', time: '12:00', items }],
    },
  ],
  ...extra,
});

const hydrate = (plan: any) => hydrateDietPlanFromFoods(plan, catalog, 'strict_id');

describe('Fase 4 — hardening', () => {
  it('A: target global validado com os totais hidratados', () => {
    const { plan } = hydrate(planWith([
      { foodId: ID_FRANGO, qtyGrams: 200 },
      { foodId: ID_ARROZ_A, qtyGrams: 200 },
    ]));
    // 330 + 260 = 590 kcal, P 67.4, C 56, G 7.8
    const report = validateGlobalDietTarget(plan, { kcal: 590, p: 67, c: 56, g: 8 });
    expect(report.ok).toBe(true);
  });

  it('B: target global reprova fora da tolerância', () => {
    const { plan } = hydrate(planWith([{ foodId: ID_FRANGO, qtyGrams: 200 }]));
    const report = validateGlobalDietTarget(plan, { kcal: 2000, p: 180, c: 200, g: 60 });
    expect(report.ok).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('C: macros inventados pela IA são ignorados', () => {
    const { plan } = hydrate(planWith([
      { foodId: ID_FRANGO, qtyGrams: 100, macros: { kcal: 9999, p: 999, c: 999, g: 999 } },
    ]));
    expect(plan.days[0].meals[0].items[0].macros.kcal).toBe(165);
  });

  it('D/E/F/G: qtyGrams obrigatório e > 0', () => {
    const bad = [undefined, null, '', 0, -10, NaN];
    for (const qty of bad) {
      const report = validateFoodContract(planWith([{ foodId: ID_FRANGO, qtyGrams: qty }]), catalog);
      expect(report.issues.some((i) => i.reason === 'invalid_qty')).toBe(true);
    }
    const okReport = validateFoodContract(planWith([{ foodId: ID_FRANGO, qtyGrams: 87.5 }]), catalog);
    expect(okReport.valid).toBe(true);
  });

  it('H: ajuste diário fresh sem food_id reprova', () => {
    const plan = planWith([{ foodId: ID_FRANGO, qtyGrams: 100 }], {
      dailyAdjustments: { seg: { instructions: [{ food_name: 'Arroz branco', quantity: 50, unit: 'g' }] } },
    });
    const report = validateFoodContract(plan, catalog, { mode: 'fresh' });
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.reason === 'missing_food_id')).toBe(true);
  });

  it('H2: ajuste legado com food_name continua aceito', () => {
    const plan = planWith([{ foodId: ID_FRANGO, qtyGrams: 100 }], {
      dailyAdjustments: { seg: { instructions: [{ food_name: 'Arroz branco', quantity: 50, unit: 'g' }] } },
    });
    expect(validateFoodContract(plan, catalog, { mode: 'legacy' }).valid).toBe(true);
  });

  it('I: ajuste diário com ID inventado reprova', () => {
    const plan = planWith([{ foodId: ID_FRANGO, qtyGrams: 100 }], {
      dailyAdjustments: { seg: { instructions: [{ food_id: 'nao-existe', quantity: 50, unit: 'g' }] } },
    });
    const report = validateFoodContract(plan, catalog);
    expect(report.valid).toBe(false);
    expect(report.invalidFoodIds).toContain('nao-existe');
  });

  it('J: estimated_kcal do ajuste é recalculado pela base', () => {
    const plan = planWith([{ foodId: ID_FRANGO, qtyGrams: 100 }], {
      dailyAdjustments: {
        seg: { instructions: [{ food_id: ID_ARROZ_A, quantity: 200, unit: 'g', estimated_kcal: 9999, food_name: 'inventado' }] },
      },
    });
    const { plan: hydrated } = hydrate(plan);
    const ins = hydrated.dailyAdjustments.seg.instructions[0];
    expect(ins.estimated_kcal).toBe(260);
    expect(ins.food_name).toBe('Arroz branco');
  });

  it('K/L: legado resolve nome único e marca duplicado como ambíguo', () => {
    const legacy = hydrateDietPlanFromFoods(
      planWith([
        { foodId: null, name: 'Frango grelhado', qtyGrams: 100 },
        { foodId: null, name: 'Arroz branco', qtyGrams: 100 },
      ]),
      catalog,
      'legacy',
    );
    const items = legacy.plan.days[0].meals[0].items;
    expect(items[0].resolutionStatus).toBe('resolved_by_name');
    expect(items[1].resolutionStatus).toBe('unresolved');
    expect(legacy.unresolvedItems[0].ambiguous).toBe(true);
    expect(legacy.unresolvedItems[0].reason).toBe('ambiguous_name');
  });

  it('M: fresh sem ID não cai em fallback por nome', () => {
    const { plan } = hydrate(planWith([{ foodId: null, foodName: 'Frango grelhado', qtyGrams: 100 }]));
    expect(plan.days[0].meals[0].items[0].resolutionStatus).toBe('unresolved');
    const report = validateFoodContract(planWith([{ foodId: null, foodName: 'Frango grelhado', qtyGrams: 100 }]), catalog);
    expect(report.valid).toBe(false);
  });

  it('N: foods.calories vence 4/4/9', () => {
    const { plan } = hydrate(planWith([{ foodId: ID_AZEITE, qtyGrams: 100 }]));
    expect(plan.days[0].meals[0].items[0].macros.kcal).toBe(200);
  });

  it('O: unresolved autorizado → requires_resolution sem quebrar o contrato', () => {
    const raw = planWith([
      { foodId: ID_FRANGO, qtyGrams: 100 },
      { foodId: null, foodName: 'Pão da padaria', qtyGrams: 80 },
    ]);
    const contract = validateFoodContract(raw, catalog, {
      mode: 'fresh',
      allowedUnresolved: [{ name: 'Pão da padaria', source: 'model_diet' }],
    });
    expect(contract.valid).toBe(true);
    const hydrated = hydrateDietPlanFromFoods(raw, catalog, 'strict_id', {
      authorizationBySource: contract.authorizationBySource,
    });
    expect(hydrated.requiresResolution).toBe(true);
    expect(hydrated.unresolvedItems[0].authorizationSource).toBe('model_diet');
  });

  it('P: unresolved não autorizado continua erro crítico', () => {
    const contract = validateFoodContract(
      planWith([{ foodId: null, foodName: 'Pão da padaria', qtyGrams: 80 }]),
      catalog,
      { mode: 'fresh', allowedUnresolved: [] },
    );
    expect(contract.valid).toBe(false);
    const validity = evaluateDietCandidateValidity({
      nutritionOk: true,
      dailyAdjustmentsOk: true,
      foodContractOk: contract.valid,
    });
    expect(validity.criticalValid).toBe(false);
    expect(validity.reason).toBe('food_contract_invalid');
  });

  it('P2: proveniência "AI" ou ausente é recusada', () => {
    expect(normalizeAllowedUnresolved([{ name: 'X', source: 'AI' } as any])).toHaveLength(0);
    expect(normalizeAllowedUnresolved([{ name: 'X' } as any])).toHaveLength(0);
    expect(normalizeAllowedUnresolved([{ name: 'X', source: 'model_diet' }])).toHaveLength(1);
  });

  it('Q: plano hidratado passa no schema Zod', () => {
    const { plan } = hydrate(planWith([{ foodId: ID_FRANGO, qtyGrams: 120 }]));
    plan.targets = { kcal: 198, p: 37, c: 0, g: 4 };
    const parsed = parseDietPlanStrict(plan);
    if (!parsed.success) console.log(JSON.stringify((parsed as any).error.issues, null, 1), JSON.stringify(plan, null, 1));
    expect(parsed.success).toBe(true);
  });

  it('R: nutritionSnapshotVersion só aparece com snapshot real', () => {
    const { plan } = hydrate(planWith([{ foodId: ID_FRANGO, qtyGrams: 100 }]));
    expect(plan.meta.nutritionSnapshotVersion).toBeUndefined();
    expect(plan.meta.foodContractVersion).toBe('1.0');
  });

  it('S: gate foodTargetsOk entra na validade crítica', () => {
    const validity = evaluateDietCandidateValidity({
      nutritionOk: true,
      dailyAdjustmentsOk: true,
      dayTargetsOk: true,
      foodContractOk: true,
      foodTargetsOk: false,
    });
    expect(validity.criticalValid).toBe(false);
    expect(validity.reason).toBe('food_targets_invalid');
  });

  it('U: cards, markdown e PDF consomem os macros hidratados', () => {
    const { plan } = hydrate(planWith([
      { foodId: ID_ARROZ_A, qtyGrams: 100, macros: { kcal: 9999, p: 999, c: 999, g: 999 } },
    ]));
    const meals = dietPlanToParsedMeals(plan as any);
    expect(Number(meals[0].foods[0].kcal)).toBe(130);
    const md = buildMealTableMarkdown(meals);
    expect(md).toContain('130');
    expect(md).not.toContain('9999');
  });

  it('T: dieta modelo autoriza só nomes sem correspondência única', () => {
    const allowed = buildAllowedUnresolvedFromModelDiet(
      '- 150g Frango grelhado\n- 100g Arroz branco\n- 80g Pão da padaria',
      rows as any,
    );
    const names = allowed.map((a) => a.name.toLowerCase());
    expect(names.some((n) => n.includes('frango'))).toBe(false);
    expect(names.some((n) => n.includes('arroz'))).toBe(true);
    expect(names.some((n) => n.includes('pão'))).toBe(true);
    expect(allowed.every((a) => a.source === 'model_diet')).toBe(true);
  });
});
