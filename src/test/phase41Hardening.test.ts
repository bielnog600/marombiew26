import { describe, it, expect } from 'vitest';
import { buildFoodCatalog, type FoodCatalog } from '../../supabase/functions/_shared/foodCatalog';
import {
  validateFoodContract,
  normalizeAllowedUnresolved,
} from '../../supabase/functions/_shared/foodContract';
import { hydrateDietPlanFromFoods } from '../../supabase/functions/_shared/dietHydration';
import {
  isCanonicalTargetValid,
  validateGlobalDietTarget,
} from '../../supabase/functions/_shared/globalDietTarget';
import { evaluateDietCandidateValidity } from '../../supabase/functions/_shared/dietRoutingPolicy';
import { validateDayTargets } from '../../supabase/functions/_shared/dayTargets';
import { resolveDietFoodItem } from '@/lib/dietFoodResolution';
import { collectUnresolvedItems } from '@/components/diet/UnresolvedFoodsPanel';
import { dietPlanToMarkdown } from '@/lib/dietMarkdownSerializer';
import { dietPlanToParsedMeals } from '@/lib/dietPlanAdapter';
import { buildStructuredUserPrompt } from '@/lib/structuredDietPrompt';
import { extractModelDietFoodNames } from '@/lib/modelDietFoods';
import { foodRecordFromRow } from '@/lib/nutritionEngine';

const ID_ARROZ = '11111111-1111-4111-8111-111111111111';
const ID_FRANGO = '33333333-3333-4333-8333-333333333333';

const rows = [
  { id: ID_ARROZ, name: 'Arroz integral', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, portion: 'gramas', portion_size: 100 },
  { id: ID_FRANGO, name: 'Frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion: 'gramas', portion_size: 100 },
];
const catalog: FoodCatalog = buildFoodCatalog(rows as any);
const foods = rows.map((r) => foodRecordFromRow(r as any));

const authorized = [{ name: 'Pão da padaria', source: 'model_diet' as const }];

const rawPlan = (weekday = 'seg') => ({
  version: 1,
  days: [
    {
      weekday,
      label: 'Segunda',
      meals: [
        {
          name: 'Almoço',
          time: '12:00',
          items: [
            { foodId: null, foodName: 'Pão da padaria', qtyGrams: 100 },
            { foodId: ID_ARROZ, qtyGrams: 100 },
          ],
        },
      ],
    },
  ],
});

const prepare = (plan: any, allowed = authorized) => {
  const contract = validateFoodContract(plan, catalog, { mode: 'fresh', allowedUnresolved: allowed });
  const hydrated = hydrateDietPlanFromFoods(plan, catalog, 'strict_id', {
    authorizationBySource: contract.authorizationBySource,
  });
  return { contract, hydrated };
};

describe('Fase 4.1 — micro-hardening', () => {
  it('A: unresolved autorizado em dieta linear volta como requires_resolution', () => {
    const { contract, hydrated } = prepare(rawPlan());
    expect(contract.valid).toBe(true);
    expect(hydrated.requiresResolution).toBe(true);
    const globalTarget = hydrated.requiresResolution
      ? { ok: true }
      : validateGlobalDietTarget(hydrated.plan, { kcal: 2000, p: 180, c: 200, g: 60 });
    const validity = evaluateDietCandidateValidity({
      foodContractOk: contract.valid,
      nutritionOk: hydrated.requiresResolution || false,
      dailyAdjustmentsOk: true,
      dayTargetsOk: true,
      foodTargetsOk: globalTarget.ok,
    });
    expect(validity.criticalValid).toBe(true);
  });

  it('B: unresolved proteico autorizado não vira nutrition_invalid', () => {
    const { hydrated } = prepare(rawPlan());
    const nutritionOkForGate = hydrated.requiresResolution || false;
    expect(nutritionOkForGate).toBe(true);
  });

  it('C: unresolved autorizado com carb cycling não reprova metas diárias', () => {
    const { hydrated } = prepare(rawPlan());
    const schedule = {
      days: {
        seg: { target_kcal: 2500, target_protein_g: 190, target_carbs_g: 300, target_fat_g: 70 },
      },
    };
    const check = validateDayTargets(hydrated.plan, schedule as any);
    const dayTargetsOkForGate = hydrated.requiresResolution || check.ok;
    expect(dayTargetsOkForGate).toBe(true); // mas não bloqueia
  });

  it('D: unresolved não autorizado continua crítico', () => {
    const { contract, hydrated } = prepare(rawPlan(), []);
    expect(contract.valid).toBe(false);
    const validity = evaluateDietCandidateValidity({
      foodContractOk: contract.valid,
      nutritionOk: hydrated.requiresResolution || true,
      dailyAdjustmentsOk: true,
    });
    expect(validity.criticalValid).toBe(false);
    expect(validity.reason).toBe('food_contract_invalid');
  });

  it('E: string solta não autoriza no contrato fresh', () => {
    expect(normalizeAllowedUnresolved(['Pão artesanal'], 'fresh')).toHaveLength(0);
    expect(normalizeAllowedUnresolved(['Pão artesanal'], 'legacy')).toHaveLength(1);
  });

  it('F: source model_diet autoriza', () => {
    expect(
      normalizeAllowedUnresolved([{ name: 'Pão artesanal', source: 'model_diet' }], 'fresh'),
    ).toHaveLength(1);
  });

  it('G/H: metas canônicas obrigatórias na geração linear', () => {
    expect(isCanonicalTargetValid(null)).toBe(false);
    expect(isCanonicalTargetValid({ kcal: 0, p: 10, c: 10, g: 10 } as any)).toBe(false);
    expect(isCanonicalTargetValid({ kcal: 2000, p: 180, c: 200 } as any)).toBe(false);
    expect(isCanonicalTargetValid({ kcal: 2000, p: 180, c: 200, g: 60 })).toBe(true);
  });

  it('I/J/L/M: resolver alimento usa o motor único e atualiza os derivados', () => {
    const { contract, hydrated } = prepare(rawPlan());
    const plan: any = hydrated.plan;
    expect(contract.valid).toBe(true);
    expect(plan.days[0].meals[0].items[0].macros.kcal).toBe(0);
    expect(collectUnresolvedItems(plan)).toHaveLength(1);

    const resolved = resolveDietFoodItem(plan, { dayIdx: 0, mealIdx: 0, itemIdx: 0 }, foods[0], foods);
    const item = resolved.days[0].meals[0].items[0];
    expect(item.resolutionStatus).toBe('resolved_by_id');
    expect(item.name).toBe('Arroz integral');
    expect(item.macros.kcal).toBe(130);
    expect(resolved.days[0].meals[0].totals.kcal).toBe(260);
    expect(resolved.days[0].totals.kcal).toBe(260);
    expect(collectUnresolvedItems(resolved)).toHaveLength(0);

    const md = dietPlanToMarkdown(resolved);
    expect(md).toContain('130');
    const meals = dietPlanToParsedMeals(resolved);
    expect(Number(meals[0].foods[0].kcal)).toBe(130);
  });

  it('K: com carb cycling, a revalidação usa o target do weekday', () => {
    const { hydrated } = prepare(rawPlan('ter'));
    const resolved = resolveDietFoodItem(hydrated.plan, { dayIdx: 0, mealIdx: 0, itemIdx: 0 }, foods[1], foods);
    const schedule = {
      days: {
        ter: { target_kcal: 295, target_protein_g: 34, target_carbs_g: 28, target_fat_g: 4 },
      },
    };
    expect(validateDayTargets(resolved, schedule as any).ok).toBe(true);
  });

  it('O/P: prompt estruturado não pede macros nem totais da IA', () => {
    const legacy = [
      'Se o alimento não estiver na base do sistema, use-o mesmo assim e devolva kcal/P/C/G estimados por você.',
      'Para cada alimento, preencha SEMPRE Kcal, P, C, G reais daquela quantidade.',
      'A tabela DEVE ter as colunas: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição',
      '6) Total de cada refeição e do dia',
      '=== ROTINA DO ALUNO ===',
    ].join('\n');
    const out = buildStructuredUserPrompt(legacy);
    expect(out).not.toMatch(/devolva kcal/i);
    expect(out).not.toMatch(/preencha SEMPRE Kcal/i);
    expect(out).not.toMatch(/Kcal \| P \| C \| G/i);
    expect(out).not.toMatch(/Total de cada refeição/i);
    expect(out).toContain('ROTINA DO ALUNO');
    expect(out).toContain('NUNCA informe calorias');
  });

  it('Q: texto narrativo da dieta modelo não vira alimento autorizado', () => {
    const names = extractModelDietFoodNames(
      [
        '### 1. Café da manhã — 07h00',
        '* Ovos mexidos: 3 unidades',
        'Observação: aluno prefere refeições rápidas',
        'O aluno treina no fim da tarde e costuma sentir fome.',
      ].join('\n'),
    );
    expect(names.some((n) => /ovos/i.test(n))).toBe(true);
    expect(names.some((n) => /prefere|treina/i.test(n))).toBe(false);
  });
});
