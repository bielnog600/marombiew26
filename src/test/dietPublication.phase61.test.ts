/**
 * FASE 6.1 — hardening da publicação atômica.
 *
 * Cobre: assertions incluindo os alimentos dos ajustes diários, integridade
 * snapshot × assertion e camada semanal como autoridade única de metas.
 */
import { describe, it, expect } from 'vitest';
import { buildFoodCatalog } from '../../supabase/functions/_shared/foodCatalog';
import {
  buildPublishedSnapshotPlan,
  collectFoodAssertions,
  validateSnapshotAssertionIntegrity,
} from '../../supabase/functions/_shared/dietPublication';
import { resolvePublicationTargets } from '../../supabase/functions/_shared/publicationTargets';

const FOOD_ROWS = [
  { id: 'f-frango', name: 'Frango grelhado', portion_size: 100, calories: 165, protein: 31, carbs: 0, fats: 3.6, brand: null, source: 'TACO' },
  { id: 'f-arroz', name: 'Arroz branco cozido', portion_size: 100, calories: 130, protein: 2.7, carbs: 28, fats: 0.3, brand: null, source: 'TACO' },
  { id: 'f-azeite', name: 'Azeite de oliva', portion_size: 100, calories: 884, protein: 0, carbs: 0, fats: 100, brand: 'Gallo', source: 'USDA' },
];

const catalog = () => buildFoodCatalog(FOOD_ROWS as any);

const item = (foodId: string, qtyGrams: number) => ({
  foodId,
  name: FOOD_ROWS.find((f) => f.id === foodId)!.name,
  qtyGrams,
  resolutionStatus: 'resolved_by_id',
});

const plan = () => ({
  meta: { version: '1.0', foodContractVersion: '1.0' },
  targets: { kcal: 1000, p: 80, c: 100, g: 25 },
  days: [
    { label: 'Padrão', weekday: 'seg', meals: [{ name: 'Almoço', items: [item('f-frango', 200), item('f-arroz', 250)] }] },
  ],
});

const adjustments = {
  qua: { instructions: [{ food_id: 'f-azeite', delta_grams: 10 }] },
};

describe('Fase 6.1 — assertions e integridade de snapshot', () => {
  it('A: assertions incluem os alimentos dos ajustes diários normalizados', () => {
    const { plan: snap } = buildPublishedSnapshotPlan(plan(), catalog());
    const assertions = collectFoodAssertions(snap, catalog(), adjustments);
    expect(assertions.map((a) => a.id).sort()).toEqual(['f-arroz', 'f-azeite', 'f-frango']);
  });

  it('B: assertions são únicas por foodId', () => {
    const p = plan();
    p.days[0].meals[0].items.push(item('f-frango', 50) as any);
    const { plan: snap } = buildPublishedSnapshotPlan(p, catalog());
    const ids = collectFoodAssertions(snap, catalog()).map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('C: plano publicado íntegro passa na verificação snapshot × assertion', () => {
    const { plan: snap } = buildPublishedSnapshotPlan(plan(), catalog());
    const assertions = collectFoodAssertions(snap, catalog(), adjustments);
    expect(validateSnapshotAssertionIntegrity(snap, assertions, adjustments).ok).toBe(true);
  });

  it('D: snapshot adulterado é rejeitado', () => {
    const { plan: snap } = buildPublishedSnapshotPlan(plan(), catalog());
    const assertions = collectFoodAssertions(snap, catalog());
    (snap as any).days[0].meals[0].items[0].nutritionSnapshot.kcal = 999;
    const res = validateSnapshotAssertionIntegrity(snap, assertions);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toContain('kcal');
  });

  it('E: nome divergente do alimento é rejeitado', () => {
    const { plan: snap } = buildPublishedSnapshotPlan(plan(), catalog());
    const assertions = collectFoodAssertions(snap, catalog());
    (snap as any).days[0].meals[0].items[0].name = 'Outro alimento';
    expect(validateSnapshotAssertionIntegrity(snap, assertions).ok).toBe(false);
  });

  it('F: ajuste diário sem assertion é rejeitado', () => {
    const { plan: snap } = buildPublishedSnapshotPlan(plan(), catalog());
    const assertions = collectFoodAssertions(snap, catalog()); // sem adjustments
    const res = validateSnapshotAssertionIntegrity(snap, assertions, adjustments);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toContain('f-azeite');
  });
});

describe('Fase 6.1 — camada semanal é autoridade de metas', () => {
  it('G: com camada semanal, meta do dia materializado nunca vem do plano', () => {
    const p = plan();
    (p.days[0] as any).targets = { kcal: 5000, p: 300, c: 500, g: 100 };
    const res = resolvePublicationTargets(p, {
      weekly_day_targets: { seg: { kcal: 1000, p: 80, c: 100, g: 25 } },
    });
    expect(res.ok).toBe(true);
    expect(res.byWeekday?.seg?.kcal).toBe(1000);
  });

  it('H: camada semanal sem a meta do weekday do dia falha', () => {
    const res = resolvePublicationTargets(plan(), {
      weekly_day_targets: { ter: { kcal: 1000, p: 80, c: 100, g: 25 } },
    });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('publication_targets_invalid');
  });

  it('I: carb cycling ativo exige os sete dias da semana', () => {
    const res = resolvePublicationTargets(plan(), {
      carb_cycling: { enabled: true },
      weekly_day_targets: { seg: { kcal: 1000, p: 80, c: 100, g: 25 } },
    });
    expect(res.ok).toBe(false);
  });
});
