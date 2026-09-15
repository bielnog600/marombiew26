/**
 * FASE 6 — publicação atômica, snapshot nutricional histórico e versionamento.
 *
 * Tudo aqui é determinístico: sem IA, sem rede, sem otimizador. A publicação
 * é o gate final — plano fora da meta, com item não resolvido ou sem meta de
 * algum dia NÃO publica.
 */
import { describe, it, expect } from 'vitest';
import { buildFoodCatalog } from '../../supabase/functions/_shared/foodCatalog';
import { computeItemMacros } from '../../supabase/functions/_shared/nutritionCore';
import { hydrateDietPlanFromFoods } from '../../supabase/functions/_shared/dietHydration';
import { validateFoodContract } from '../../supabase/functions/_shared/foodContract';
import {
  canonicalDietPlanToMarkdown,
} from '../../supabase/functions/_shared/canonicalDietMarkdown';
import {
  hasWeeklyDayTargetsLayer,
  resolvePublicationTargets,
  toPublicationTarget,
  validatePublicationNutrition,
} from '../../supabase/functions/_shared/publicationTargets';
import {
  buildPublishedSnapshotPlan,
  collectFoodAssertions,
  collectPublicationBlockers,
  isStructuredPlan,
  stripPublicationSnapshots,
  validatePublicationDailyAdjustments,
  validatePublicationPlan,
} from '../../supabase/functions/_shared/dietPublication';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const FOOD_ROWS = [
  { id: 'f-frango', name: 'Frango grelhado', portion_size: 100, calories: 165, protein: 31, carbs: 0, fats: 3.6, brand: null, source: 'TACO' },
  { id: 'f-arroz', name: 'Arroz branco cozido', portion_size: 100, calories: 130, protein: 2.7, carbs: 28, fats: 0.3, brand: null, source: 'TACO' },
  { id: 'f-azeite', name: 'Azeite de oliva', portion_size: 100, calories: 884, protein: 0, carbs: 0, fats: 100, brand: 'Gallo', source: 'USDA' },
];

const catalog = () => buildFoodCatalog(FOOD_ROWS as any);

/** Catálogo com valores alterados: simula edição da base durante a publicação. */
const changedCatalog = () =>
  buildFoodCatalog(
    FOOD_ROWS.map((f) => (f.id === 'f-frango' ? { ...f, calories: 200 } : f)) as any,
  );

const item = (foodId: string, qtyGrams: number) => ({
  foodId,
  name: FOOD_ROWS.find((f) => f.id === foodId)!.name,
  qtyGrams,
  resolutionStatus: 'resolved_by_id',
});

const singleDayPlan = () => ({
  meta: { version: '1.0', foodContractVersion: '1.0' },
  targets: { kcal: 1000, p: 80, c: 100, g: 25 },
  days: [
    {
      label: 'Padrão',
      meals: [
        { name: 'Almoço', items: [item('f-frango', 200), item('f-arroz', 250), item('f-azeite', 10)] },
      ],
    },
  ],
});

const expectedMacros = (plan: any) => {
  const cat = catalog();
  let kcal = 0, p = 0, c = 0, g = 0;
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const it of meal.items) {
        const m = computeItemMacros(
          { foodId: it.foodId, name: it.name, qtyGrams: it.qtyGrams },
          cat.index,
          'draft',
          'strict_id',
        ).macros;
        kcal += m.kcal; p += m.p; c += m.c; g += m.g;
      }
    }
  }
  return { kcal, p, c, g };
};

/* -------------------------------------------------------------------------- */
/* A–F: contrato de publicação (strict)                                       */
/* -------------------------------------------------------------------------- */

describe('Fase 6 — contrato strict de publicação', () => {
  it('A: plano válido não tem bloqueadores', () => {
    expect(collectPublicationBlockers(singleDayPlan(), catalog())).toEqual([]);
  });

  it('B: item sem foodId bloqueia a publicação', () => {
    const plan = singleDayPlan();
    delete (plan.days[0].meals[0].items[0] as any).foodId;
    const blockers = collectPublicationBlockers(plan, catalog());
    expect(blockers.map((b) => b.reason)).toContain('no_food_id');
  });

  it('C: foodId inexistente bloqueia a publicação', () => {
    const plan = singleDayPlan();
    (plan.days[0].meals[0].items[0] as any).foodId = 'f-inexistente';
    expect(collectPublicationBlockers(plan, catalog())[0].reason).toBe('not_found');
  });

  it('D: qtyGrams <= 0 bloqueia a publicação', () => {
    const plan = singleDayPlan();
    (plan.days[0].meals[0].items[1] as any).qtyGrams = 0;
    expect(collectPublicationBlockers(plan, catalog())[0].reason).toBe('invalid_qty');
  });

  it('E: item marcado como unresolved bloqueia a publicação', () => {
    const plan = singleDayPlan();
    (plan.days[0].meals[0].items[2] as any).resolutionStatus = 'unresolved';
    expect(collectPublicationBlockers(plan, catalog())[0].reason).toBe('unresolved');
  });

  it('F: contrato fresh exige food_id também no ajuste diário', () => {
    const plan: any = singleDayPlan();
    plan.dailyAdjustments = { seg: { instructions: [{ action: 'add', food_name: 'Arroz', quantity: 50 }] } };
    const report = validateFoodContract(plan, catalog(), { mode: 'fresh', allowedUnresolved: [] });
    expect(report.valid).toBe(false);
    expect(report.missingFoodIds.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* G–L: snapshot nutricional                                                  */
/* -------------------------------------------------------------------------- */

describe('Fase 6 — snapshot nutricional histórico', () => {
  it('G: cada item publicado recebe snapshot e resolutionStatus snapshot', () => {
    const hydrated = hydrateDietPlanFromFoods(singleDayPlan(), catalog(), 'strict_id');
    const { plan, snapshotCount } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    expect(snapshotCount).toBe(3);
    for (const it of plan.days[0].meals[0].items) {
      expect(it.nutritionSnapshot).toBeTruthy();
      expect(it.resolutionStatus).toBe('snapshot');
    }
  });

  it('H: totais publicados vêm do nutritionCore, não do rascunho', () => {
    const draft: any = singleDayPlan();
    draft.days[0].totals = { kcal: 1, p: 1, c: 1, g: 1 };
    const hydrated = hydrateDietPlanFromFoods(draft, catalog(), 'strict_id');
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    const exp = expectedMacros(singleDayPlan());
    expect(plan.days[0].totals.kcal).toBeCloseTo(Math.round(exp.kcal), 0);
  });

  it('I: snapshot congela o histórico mesmo se o alimento mudar depois', () => {
    const hydrated = hydrateDietPlanFromFoods(singleDayPlan(), catalog(), 'strict_id');
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    const frozen = plan.days[0].meals[0].items[0].macros.kcal;
    const after = computeItemMacros(
      plan.days[0].meals[0].items[0],
      changedCatalog().index,
      'published',
      'strict_id',
    ).macros.kcal;
    expect(Math.round(after)).toBe(Math.round(frozen));
  });

  it('J: meta de versões é preenchida na publicação', () => {
    const hydrated = hydrateDietPlanFromFoods(singleDayPlan(), catalog(), 'strict_id');
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    expect(plan.meta.nutritionEngineVersion).toBeTruthy();
    expect(plan.meta.nutritionSnapshotVersion).toBeTruthy();
    expect(plan.meta.foodContractVersion).toBeTruthy();
  });

  it('K: novo rascunho (nova versão) não carrega snapshot', () => {
    const hydrated = hydrateDietPlanFromFoods(singleDayPlan(), catalog(), 'strict_id');
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    plan.meta.publishedAt = '2026-01-01T00:00:00Z';
    const stripped = stripPublicationSnapshots(plan);
    for (const it of stripped.days[0].meals[0].items) {
      expect(it.nutritionSnapshot).toBeUndefined();
      expect(it.resolutionStatus).toBe('resolved_by_id');
    }
    expect(stripped.meta.publishedAt).toBeUndefined();
    expect(stripped.meta.nutritionSnapshotVersion).toBeUndefined();
  });

  it('L: validação estrutural reprova plano publicado sem snapshot', () => {
    const hydrated = hydrateDietPlanFromFoods(singleDayPlan(), catalog(), 'strict_id');
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    const broken = stripPublicationSnapshots(plan);
    expect(validatePublicationPlan(plan).ok).toBe(true);
    expect(validatePublicationPlan(broken).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* M–R: metas de publicação                                                   */
/* -------------------------------------------------------------------------- */

describe('Fase 6 — metas de publicação', () => {
  it('M: meta sem kcal ou com macro ausente é inválida', () => {
    expect(toPublicationTarget({ kcal: 0, p: 1, c: 1, g: 1 })).toBeNull();
    expect(toPublicationTarget({ kcal: 2000, p: 150, c: null, g: 60 })).toBeNull();
    expect(toPublicationTarget({ kcal: 2000, p: 150, c: 0, g: 60 })).toEqual({ kcal: 2000, p: 150, c: 0, g: 60 });
  });

  it('N: camada semanal é detectada por weekday reconhecido', () => {
    expect(hasWeeklyDayTargetsLayer({ weekly_day_targets: { seg: { kcal: 1, p: 1, c: 1, g: 1 } } })).toBe(true);
    expect(hasWeeklyDayTargetsLayer({ weekly_day_targets: { xyz: {} } })).toBe(false);
    expect(hasWeeklyDayTargetsLayer(null)).toBe(false);
  });

  it('O: com camada semanal, dia sem meta NUNCA cai no target global', () => {
    const plan: any = singleDayPlan();
    plan.days[0].weekday = 'ter';
    const res = resolvePublicationTargets(plan, {
      weekly_day_targets: { seg: { kcal: 2000, p: 150, c: 200, g: 60 } },
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('publication_targets_invalid');
    expect(res.mode).toBe('daily');
  });

  it('P: carb cycling ativo sem meta do dia reprova a publicação', () => {
    const plan: any = singleDayPlan();
    plan.days[0].weekday = 'seg';
    const res = resolvePublicationTargets(plan, { carb_cycling: { enabled: true } });
    expect(res.ok).toBe(false);
    expect(res.global).toBeNull();
  });

  it('Q: sem camada diária, a meta global é usada', () => {
    const res = resolvePublicationTargets(singleDayPlan(), {});
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('global');
    expect(res.global?.kcal).toBe(1000);
  });

  it('R: plano fora da tolerância oficial não publica', () => {
    const draft: any = singleDayPlan();
    draft.targets = { kcal: 100, p: 10, c: 10, g: 2 };
    const hydrated = hydrateDietPlanFromFoods(draft, catalog(), 'strict_id');
    const res = resolvePublicationTargets(hydrated.plan, {});
    const check = validatePublicationNutrition(hydrated.plan, res);
    expect(check.ok).toBe(false);
    expect(check.issues.length).toBeGreaterThan(0);
  });

  it('S: plano dentro da meta passa na validação nutricional', () => {
    const draft: any = singleDayPlan();
    const exp = expectedMacros(draft);
    draft.targets = {
      kcal: Math.round(exp.kcal),
      p: Math.round(exp.p),
      c: Math.round(exp.c),
      g: Math.round(exp.g),
    };
    const hydrated = hydrateDietPlanFromFoods(draft, catalog(), 'strict_id');
    const res = resolvePublicationTargets(hydrated.plan, {});
    expect(validatePublicationNutrition(hydrated.plan, res).ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* T–X: ajustes diários e food assertions                                     */
/* -------------------------------------------------------------------------- */

describe('Fase 6 — ajustes diários e assertions', () => {
  const schedule = (adjust: number) => ({
    weekly_energy_schedule: {
      base_daily_kcal: 2000,
      days: {
        seg: { adjustment_kcal: adjust }, ter: { adjustment_kcal: 0 }, qua: { adjustment_kcal: 0 },
        qui: { adjustment_kcal: 0 }, sex: { adjustment_kcal: 0 }, sab: { adjustment_kcal: 0 },
        dom: { adjustment_kcal: 0 },
      },
      generated_adjustments: {
        seg: { instructions: [{ action: 'add', food_id: 'f-arroz', quantity: 250 }] },
        ter: { instructions: [] }, qua: { instructions: [] }, qui: { instructions: [] },
        sex: { instructions: [] }, sab: { instructions: [] }, dom: { instructions: [] },
      },
    },
  });

  it('T: kcal estimada pela IA é recalculada pela base', () => {
    const report = validatePublicationDailyAdjustments(schedule(325), catalog());
    expect(report.ok).toBe(true);
    expect(report.adjustments.seg.estimated_adjustment_kcal).toBe(325);
    expect(report.adjustments.seg.instructions[0].food_name).toBe('Arroz branco cozido');
  });

  it('U: ajuste fora da tolerância reprova a publicação', () => {
    const report = validatePublicationDailyAdjustments(schedule(800), catalog());
    expect(report.ok).toBe(false);
  });

  it('V: dia ajustado sem instruções reprova a publicação', () => {
    const p: any = schedule(300);
    p.weekly_energy_schedule.generated_adjustments.seg.instructions = [];
    expect(validatePublicationDailyAdjustments(p, catalog()).ok).toBe(false);
  });

  it('W: sem schedule com variação, não exige ajustes', () => {
    expect(validatePublicationDailyAdjustments({}, catalog()).ok).toBe(true);
  });

  it('X: assertions cobrem itens e ajustes, sem duplicar foodId', () => {
    const plan: any = singleDayPlan();
    plan.dailyAdjustments = {
      seg: { instructions: [{ action: 'add', food_id: 'f-arroz', quantity: 100 }] },
    };
    const assertions = collectFoodAssertions(plan, catalog());
    expect(assertions.map((a) => a.id)).toEqual(['f-arroz', 'f-azeite', 'f-frango']);
    const frango = assertions.find((a) => a.id === 'f-frango')!;
    expect(frango).toMatchObject({ portionSize: 100, kcal: 165, p: 31, c: 0, g: 3.6 });
  });

  it('Y: assertions mudam quando a base muda (detecção TOCTOU)', () => {
    const before = collectFoodAssertions(singleDayPlan(), catalog());
    const after = collectFoodAssertions(singleDayPlan(), changedCatalog());
    expect(before).not.toEqual(after);
  });
});

/* -------------------------------------------------------------------------- */
/* Z–AD: markdown canônico e contrato structured                              */
/* -------------------------------------------------------------------------- */

describe('Fase 6 — markdown canônico', () => {
  it('Z: markdown de um dia usa CARDÁPIO BASE', () => {
    const md = canonicalDietPlanToMarkdown(singleDayPlan());
    expect(md).toContain('CARDÁPIO BASE');
    expect(md).not.toContain('PLANO ALIMENTAR POR DIA');
  });

  it('AA: markdown multi-dia nunca diz "segue de segunda a domingo"', () => {
    const plan: any = singleDayPlan();
    plan.days = [
      { ...plan.days[0], label: 'Segunda', weekday: 'seg' },
      { ...JSON.parse(JSON.stringify(plan.days[0])), label: 'Terça', weekday: 'ter' },
    ];
    const md = canonicalDietPlanToMarkdown(plan);
    expect(md).toContain('PLANO ALIMENTAR POR DIA');
    expect(md).not.toContain('segue de segunda a domingo');
  });

  it('AB: markdown é determinístico para o mesmo plano', () => {
    const plan = singleDayPlan();
    expect(canonicalDietPlanToMarkdown(plan)).toBe(canonicalDietPlanToMarkdown(plan));
  });

  it('AC: structured é identificado pelo contrato, não pelo foodId', () => {
    expect(isStructuredPlan({ meta: { foodContractVersion: '1.0' }, days: [] })).toBe(true);
    expect(isStructuredPlan({ meta: {}, days: [{ meals: [{ items: [{ foodId: 'x' }] }] }] })).toBe(false);
  });

  it('AD: publicação completa (fluxo puro) produz plano válido e íntegro', () => {
    const draft: any = singleDayPlan();
    const exp = expectedMacros(draft);
    draft.targets = { kcal: Math.round(exp.kcal), p: Math.round(exp.p), c: Math.round(exp.c), g: Math.round(exp.g) };
    expect(collectPublicationBlockers(draft, catalog())).toEqual([]);
    const hydrated = hydrateDietPlanFromFoods(draft, catalog(), 'strict_id');
    expect(hydrated.requiresResolution).toBe(false);
    const res = resolvePublicationTargets(hydrated.plan, {});
    expect(validatePublicationNutrition(hydrated.plan, res).ok).toBe(true);
    const { plan } = buildPublishedSnapshotPlan(hydrated.plan, catalog());
    expect(validatePublicationPlan(plan).ok).toBe(true);
    expect(canonicalDietPlanToMarkdown(plan)).toContain('Frango grelhado');
  });
});
