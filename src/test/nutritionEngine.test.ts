import { describe, it, expect } from 'vitest';
import {
  buildFoodIndex,
  computeItemMacros,
  computeDayTotals,
  compareSnapshotToFood,
  makeNutritionSnapshot,
  classifyMacroRole,
  roundForDisplay,
  diffToTarget,
  type FoodRecord,
} from '@/lib/nutritionEngine';
import { resolveDayTarget, resolveDayKcal } from '@/lib/dietDayTargets';
import {
  defaultMacroConfig,
  resolveMacroConfig,
  gramsFromPerKg,
  perKgFromGrams,
  setMacroBasis,
  type MacroConfig,
} from '@/lib/macroConfig';
import { selectEnergyFormula, applyMedicationEnergyAdjustment } from '@/lib/energyFormula';

const rice: FoodRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Arroz Branco Cozido',
  portion_size: 100,
  calories: 128,
  protein: 2.5,
  carbs: 28,
  fats: 0.2,
};
const chicken: FoodRecord = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Frango Grelhado',
  portion_size: 100,
  calories: 165,
  protein: 31,
  carbs: 0,
  fats: 3.6,
};
const wheyA: FoodRecord = { ...chicken, id: '33333333-3333-3333-3333-333333333333', name: 'Whey Protein' };
const wheyB: FoodRecord = { ...chicken, id: '44444444-4444-4444-4444-444444444444', name: 'whey protein' };

const index = buildFoodIndex([rice, chicken]);

describe('nutritionEngine — resolução e cálculo', () => {
  it('1. item com foodId usa a base e ignora os macros da IA', () => {
    const r = computeItemMacros(
      { foodId: rice.id, name: 'Arroz', qtyGrams: 200, macros: { kcal: 999, p: 99, c: 99, g: 99 } },
      index,
    );
    expect(r.status).toBe('resolved_by_id');
    expect(r.validated).toBe(true);
    expect(r.macros.kcal).toBeCloseTo(256, 5);
    expect(r.macros.c).toBeCloseTo(56, 5);
  });

  it('2. plano legado sem foodId resolve por nome exato normalizado', () => {
    const r = computeItemMacros({ name: '  arroz   branco cozido ', qtyGrams: 100 }, index);
    expect(r.status).toBe('resolved_by_name');
    expect(r.macros.kcal).toBeCloseTo(128, 5);
  });

  it('3. alimento inexistente fica unresolved e não é validado', () => {
    const r = computeItemMacros(
      { name: 'Tapioca artesanal da vovó', qtyGrams: 80, macros: { kcal: 200, p: 1, c: 48, g: 0 } },
      index,
    );
    expect(r.status).toBe('unresolved');
    expect(r.validated).toBe(false);
    expect(r.macros.kcal).toBe(200);
  });

  it('4. nome ambíguo não faz fuzzy match — fica unresolved', () => {
    const ambiguous = buildFoodIndex([wheyA, wheyB]);
    const r = computeItemMacros({ name: 'Whey Protein', qtyGrams: 30 }, ambiguous);
    expect(r.status).toBe('unresolved');
    expect(r.ambiguous).toBe(true);
  });

  it('5. plano publicado usa o snapshot mesmo com a base alterada', () => {
    const snapshot = makeNutritionSnapshot(rice);
    const changed = buildFoodIndex([{ ...rice, calories: 300, carbs: 70 }]);
    const r = computeItemMacros(
      { foodId: rice.id, name: 'Arroz', qtyGrams: 100, nutritionSnapshot: snapshot },
      changed,
      'published',
    );
    expect(r.status).toBe('snapshot');
    expect(r.macros.kcal).toBeCloseTo(128, 5);
  });

  it('6. divergência é sinalizada antes de qualquer atualização', () => {
    const snapshot = makeNutritionSnapshot(rice);
    const diff = compareSnapshotToFood(snapshot, { ...rice, calories: 140 });
    expect(diff.diverged).toBe(true);
    expect(diff.fields).toContain('kcal');
    expect(diff.snapshot.kcal).toBe(128);
    expect(diff.current?.kcal).toBe(140);
  });

  it('7. soma do dia sem erro acumulado de arredondamento', () => {
    const day = computeDayTotals(
      [
        { items: Array.from({ length: 10 }, () => ({ foodId: rice.id, name: 'Arroz', qtyGrams: 33 })) },
        { items: [{ foodId: chicken.id, name: 'Frango', qtyGrams: 155 }] },
      ],
      index,
    );
    expect(day.totals.kcal).toBeCloseTo(128 * 3.3 + 165 * 1.55, 6);
    expect(roundForDisplay(day.totals).kcal).toBe(Math.round(128 * 3.3 + 165 * 1.55));
  });

  it('classifica o papel do alimento', () => {
    expect(classifyMacroRole({ kcal: 165, p: 31, c: 0, g: 3.6 })).toBe('protein');
    expect(classifyMacroRole({ kcal: 128, p: 2.5, c: 28, g: 0.2 })).toBe('carb');
    expect(classifyMacroRole({ kcal: 884, p: 0, c: 0, g: 100 })).toBe('fat');
    expect(classifyMacroRole({ kcal: 15, p: 1, c: 2, g: 0 })).toBe('low_calorie');
  });

  it('diferença é current − target', () => {
    const d = diffToTarget({ kcal: 2600, p: 180, c: 300, g: 70 }, { kcal: 2660, p: 190, c: 300, g: 70 });
    expect(d.kcal).toBe(-60);
    expect(d.p).toBe(-10);
  });
});

describe('8. consumidor de kcal continua funcionando', () => {
  it('resolveDayTarget devolve objeto e .kcal mantém o valor antigo', () => {
    const target = resolveDayTarget({
      schedule: { base_daily_kcal: 2660, days: { seg: { adjustment_kcal: -83 } } },
      dayIndex: 0,
      planTargetKcal: 2660,
    });
    expect(target.kcal).toBe(2577);
    expect(resolveDayKcal({ dayIndex: 3, planTargetKcal: 2400 })).toBe(2400);
    expect(resolveDayTarget({ dayIndex: 0, currentTotalKcal: 1900 }).kcal).toBe(1900);
  });
});

describe('macroConfig — g/kg e travas', () => {
  const body = { weightKg: 80, leanMassKg: 64 };

  it('9. g/kg ↔ gramas nos dois sentidos', () => {
    expect(gramsFromPerKg(2.2, 'body_weight', body)).toBe(176);
    expect(perKgFromGrams(176, 'body_weight', body)).toBe(2.2);
    expect(gramsFromPerKg(2.2, 'lean_mass', body)).toBeCloseTo(140.8, 5);
    const s = setMacroBasis({ perKg: 2, grams: 160, basis: 'body_weight', locked: true }, 'lean_mass', body);
    expect(s.grams).toBe(128);
  });

  it('10a. dois travados + um livre → o livre fecha as calorias', () => {
    const r = resolveMacroConfig({ kcalTarget: 2600, config: defaultMacroConfig(), body });
    expect(r.status).toBe('ok');
    expect(r.closingMacro).toBe('carbs');
    // 176g P (704) + 64g G (576) = 1280 → 1320 kcal / 4 = 330g C
    expect(r.grams?.carbs).toBeCloseTo(330, 1);
    expect(Math.abs(r.kcalDelta)).toBeLessThanOrEqual(2);
  });

  it('10b. três travados só valem dentro da tolerância', () => {
    const config: MacroConfig = {
      protein: { perKg: 2.2, grams: null, basis: 'body_weight', locked: true },
      fat: { perKg: 0.8, grams: null, basis: 'body_weight', locked: true },
      carbs: { perKg: null, grams: 330, basis: 'body_weight', locked: true },
    };
    expect(resolveMacroConfig({ kcalTarget: 2600, config, body }).status).toBe('ok');
    const bad = resolveMacroConfig({ kcalTarget: 2000, config, body });
    expect(bad.status).toBe('infeasible');
    expect(bad.message).toContain('kcal');
  });

  it('10c. dois macros livres exigem escolha explícita', () => {
    const config: MacroConfig = {
      protein: { perKg: 2.2, grams: null, basis: 'body_weight', locked: true },
      fat: { perKg: 0.8, grams: null, basis: 'body_weight', locked: false },
      carbs: { perKg: null, grams: null, basis: 'body_weight', locked: false },
    };
    const r = resolveMacroConfig({ kcalTarget: 2600, config, body });
    expect(r.status).toBe('needs_closing_macro');
    expect(r.closingOptions.sort()).toEqual(['carbs', 'fat']);
    const chosen = resolveMacroConfig({
      kcalTarget: 2600,
      config: { ...config, fat: { perKg: 0.8, grams: null, basis: 'body_weight', locked: false } },
      body,
      closingMacro: 'carbs',
    });
    expect(chosen.status).toBe('ok');
    expect(chosen.closingMacro).toBe('carbs');
  });

  it('11. combinação inviável gera erro explícito', () => {
    const config: MacroConfig = {
      protein: { perKg: 3.5, grams: null, basis: 'body_weight', locked: true },
      fat: { perKg: 1.5, grams: null, basis: 'body_weight', locked: true },
      carbs: { perKg: null, grams: null, basis: 'body_weight', locked: false },
    };
    const r = resolveMacroConfig({ kcalTarget: 1500, config, body });
    expect(r.status).toBe('infeasible');
    expect(r.message).toContain('ultrapassa a meta calórica');
  });
});

describe('energyFormula', () => {
  const base = { sex: 'male' as const, weightKg: 80, heightCm: 178, ageYears: 30 };

  it('usa Cunningham quando a massa magra é utilizável', () => {
    const r = selectEnergyFormula({
      ...base,
      leanMass: { kg: 64, measuredAt: new Date().toISOString(), source: 'Avaliação física' },
    });
    expect(r.formula).toBe('cunningham');
    expect(r.bmr).toBe(Math.round(500 + 22 * 64));
    expect(r.alternatives.mifflin).toBeGreaterThan(0);
  });

  it('cai para Mifflin sem massa magra utilizável e avisa quando implausível', () => {
    const r = selectEnergyFormula({ ...base, leanMass: { kg: 95 } });
    expect(r.formula).toBe('mifflin');
    expect(r.warnings.join(' ')).toContain('implausível');
  });

  it('não assume masculino quando o sexo é desconhecido', () => {
    const r = selectEnergyFormula({ ...base, sex: null });
    expect(r.warnings.join(' ')).toContain('Sexo biológico não informado');
  });

  it('escolha manual do treinador prevalece', () => {
    const r = selectEnergyFormula({ ...base, leanMass: { kg: 64 }, manualFormula: 'harris_benedict' });
    expect(r.formula).toBe('harris_benedict');
    expect(r.manual).toBe(true);
  });

  it('12. medicamentos/hormônios não alteram o gasto energético', () => {
    expect(applyMedicationEnergyAdjustment(2800)).toBe(2800);
  });
});
