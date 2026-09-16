import { describe, it, expect } from 'vitest';
import {
  areDietsSemanticallyEqual,
  buildDietSemanticPayload,
  dietSemanticFingerprint,
  shouldDiscardRedundantDraft,
} from '../../supabase/functions/_shared/dietSemanticFingerprint';
import { normalizeDietTitle } from '../../supabase/functions/_shared/dietTitle';
import { groupDietVersionChains } from '@/lib/dietVersionChains';
import { buildWorkingPlan, diffPreviewDay, removePreviewItem } from '@/lib/dietPreviewEdits';

const basePlan = () => ({
  meta: { foodContractVersion: 1 },
  targets: { kcal: 2000, p: 150, c: 200, g: 60 },
  days: [
    {
      label: 'Dia 1',
      weekday: 'seg',
      target: { kcal: 2000, p: 150, c: 200, g: 60 },
      totals: { kcal: 1999, p: 150, c: 200, g: 60 },
      meals: [
        {
          name: 'Almoço',
          totals: { kcal: 500, p: 40, c: 50, g: 10 },
          items: [
            { foodId: 'f1', name: 'Arroz', qtyGrams: 100, resolutionStatus: 'resolved_by_id', macros: { kcal: 130 }, nutritionSnapshot: { kcal: 130 } },
            { foodId: 'f2', name: 'Frango', qtyGrams: 150, resolutionStatus: 'resolved_by_id', macros: { kcal: 247 } },
          ],
        },
      ],
    },
  ],
});

const protocols = () => ({
  weekly_energy_schedule: { enabled: true, days: { seg: 'MEDIUM' } },
});

describe('fingerprint semântico — iguais', () => {
  it('1: metadados de publicação não contam', () => {
    const a: any = basePlan();
    const b: any = basePlan();
    b.meta.publishedAt = '2026-01-01T00:00:00Z';
    b.meta.publishedBy = 'admin';
    b.meta.publicationRevision = 3;
    expect(areDietsSemanticallyEqual(a, protocols(), b, protocols())).toBe(true);
  });

  it('2: snapshots nutricionais não contam', () => {
    const a: any = basePlan();
    const b: any = basePlan();
    b.days[0].meals[0].items[0].nutritionSnapshot = { kcal: 999, version: 7 };
    expect(areDietsSemanticallyEqual(a, protocols(), b, protocols())).toBe(true);
  });

  it('3: macros e totais recalculáveis não contam', () => {
    const a: any = basePlan();
    const b: any = basePlan();
    b.days[0].totals = { kcal: 1, p: 1, c: 1, g: 1 };
    b.days[0].meals[0].totals = { kcal: 2 };
    b.days[0].meals[0].items[0].macros = { kcal: 3 };
    expect(areDietsSemanticallyEqual(a, protocols(), b, protocols())).toBe(true);
  });

  it('4: generated_adjustments do schedule não contam', () => {
    const p2: any = protocols();
    p2.weekly_energy_schedule.generated_adjustments = [{ weekday: 'seg', food_id: 'f1' }];
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), basePlan(), p2)).toBe(true);
  });

  it('5: fingerprint é estável e determinístico', () => {
    expect(dietSemanticFingerprint(basePlan(), protocols())).toBe(
      dietSemanticFingerprint(basePlan(), protocols()),
    );
    expect(Object.keys(buildDietSemanticPayload(basePlan(), protocols()))).toContain('days');
  });
});

describe('fingerprint semântico — diferentes', () => {
  it('6: qtyGrams diferente', () => {
    const b: any = basePlan();
    b.days[0].meals[0].items[0].qtyGrams = 120;
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), b, protocols())).toBe(false);
  });

  it('7: foodId diferente', () => {
    const b: any = basePlan();
    b.days[0].meals[0].items[0].foodId = 'f9';
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), b, protocols())).toBe(false);
  });

  it('8: alimento removido', () => {
    const b: any = basePlan();
    b.days[0].meals[0].items.pop();
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), b, protocols())).toBe(false);
  });

  it('9: meta alterada', () => {
    const b: any = basePlan();
    b.days[0].target.kcal = 2100;
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), b, protocols())).toBe(false);
  });

  it('10: configuração de carb cycling alterada', () => {
    const p2: any = protocols();
    p2.weekly_energy_schedule.days.seg = 'HIGH';
    expect(areDietsSemanticallyEqual(basePlan(), protocols(), basePlan(), p2)).toBe(false);
  });
});

describe('títulos canônicos', () => {
  it('17: remove (v2)', () => {
    expect(normalizeDietTitle('Dieta - 16/09/2026 (v2)')).toBe('Dieta - 16/09/2026');
  });
  it('18: remove sufixos acumulados', () => {
    expect(normalizeDietTitle('Dieta (v2) (v3) (v4)')).toBe('Dieta');
  });
  it('19: remove (editada)', () => {
    expect(normalizeDietTitle('Dieta (editada)')).toBe('Dieta');
  });
  it('20: título sem sufixo permanece intacto', () => {
    expect(normalizeDietTitle('Cutting v2 semana 3')).toBe('Cutting v2 semana 3');
  });
});

describe('cadeias de versões', () => {
  const v1 = { id: '1', parent_plan_id: null, version: 1, is_draft: false, titulo: 'Dieta', created_at: '2026-01-01', published_at: '2026-01-01' };
  const v2 = { id: '2', parent_plan_id: '1', version: 2, is_draft: false, titulo: 'Dieta (v2)', created_at: '2026-01-02', published_at: '2026-01-02' };
  const v3 = { id: '3', parent_plan_id: '2', version: 3, is_draft: false, titulo: 'Dieta (v3)', created_at: '2026-01-03', published_at: '2026-01-03' };
  const v4 = { id: '4', parent_plan_id: '3', version: 4, is_draft: true, titulo: 'Dieta (v4)', created_at: '2026-01-04', published_at: null };

  it('21: quatro versões viram uma cadeia', () => {
    const chains = groupDietVersionChains([v3, v1, v4, v2] as any);
    expect(chains).toHaveLength(1);
    expect(chains[0].rootId).toBe('1');
    expect(chains[0].versions.map(v => v.id)).toEqual(['4', '3', '2', '1']);
  });

  it('22: card principal é o rascunho quando existe', () => {
    const chains = groupDietVersionChains([v1, v2, v3, v4] as any);
    expect(chains[0].head.id).toBe('4');
    expect(chains[0].latestPublished?.id).toBe('3');
    expect(chains[0].latestDraft?.id).toBe('4');
  });

  it('23: sem rascunho, o card é a última publicada', () => {
    const chains = groupDietVersionChains([v1, v2, v3] as any);
    expect(chains[0].head.id).toBe('3');
    expect(chains[0].latestDraft).toBeNull();
  });

  it('24: dietas independentes ficam em cadeias separadas', () => {
    const other = { id: '9', parent_plan_id: null, version: 1, is_draft: false, titulo: 'Outra', created_at: '2026-02-01', published_at: '2026-02-01' };
    const chains = groupDietVersionChains([v1, v2, other] as any);
    expect(chains).toHaveLength(2);
  });

  it('25: título da cadeia é normalizado', () => {
    expect(groupDietVersionChains([v1, v2, v3, v4] as any)[0].title).toBe('Dieta');
  });

  it('26: pai ausente não quebra o agrupamento', () => {
    const orphan = { id: '7', parent_plan_id: 'inexistente', version: 2, is_draft: true, titulo: 'Dieta', created_at: '2026-03-01' };
    const chains = groupDietVersionChains([orphan] as any);
    expect(chains).toHaveLength(1);
    expect(chains[0].rootId).toBe('7');
  });
});

describe('identidade do preview', () => {
  const previewPlan = () => ({
    days: [
      {
        label: 'Dia 1',
        totals: {},
        meals: [
          {
            name: 'Almoço',
            totals: {},
            items: [
              { foodId: 'f1', name: 'A', qtyGrams: 100 },
              { foodId: 'f2', name: 'B', qtyGrams: 100 },
              { foodId: 'f3', name: 'C', qtyGrams: 100 },
            ],
          },
        ],
      },
    ],
  });

  it('27: remover B mantém a identidade de C', () => {
    const original: any = previewPlan();
    let working: any = buildWorkingPlan(previewPlan(), 0);
    working = removePreviewItem(working, { dayIndex: 0, mealIndex: 0, itemIndex: 1 }, []);
    working = buildWorkingPlan(working, 0);
    const items = working.days[0].meals[0].items;
    expect(items.map((i: any) => i.__previewSrcIndex)).toEqual([0, 2]);
    const diff = diffPreviewDay(original, working, 0);
    const flat = JSON.stringify(diff);
    expect(flat).toContain('B');
    expect(diff.find((d: any) => d.name === 'C' && d.kind === 'replace')).toBeUndefined();
  });

  it('28: buildWorkingPlan só preenche marcadores ausentes', () => {
    let working: any = buildWorkingPlan(previewPlan(), 0);
    working.days[0].meals[0].items.shift();
    working = buildWorkingPlan(working, 0);
    expect(working.days[0].meals[0].items[0].__previewSrcIndex).toBe(1);
  });

  it('29: chamadas repetidas não remapeiam índices', () => {
    let working: any = buildWorkingPlan(previewPlan(), 0);
    const before = working.days[0].meals[0].items.map((i: any) => i.__previewSrcIndex);
    working = buildWorkingPlan(buildWorkingPlan(working, 0), 0);
    expect(working.days[0].meals[0].items.map((i: any) => i.__previewSrcIndex)).toEqual(before);
  });
});

describe('guarda de publicação no-op', () => {
  const parent = () => ({ id: 'p', tipo: 'dieta', is_draft: false, conteudo_json: basePlan(), protocols: protocols() });
  const draft = (over: any = {}) => ({
    id: 'd', tipo: 'dieta', is_draft: true, parent_plan_id: 'p',
    conteudo_json: basePlan(), protocols: protocols(), ...over,
  });

  it('11: rascunho idêntico ao pai é descartável', () => {
    expect(shouldDiscardRedundantDraft(draft(), parent())).toBe(true);
  });

  it('12: rascunho com qtyGrams diferente segue o fluxo normal', () => {
    const plan: any = basePlan();
    plan.days[0].meals[0].items[0].qtyGrams = 180;
    expect(shouldDiscardRedundantDraft(draft({ conteudo_json: plan }), parent())).toBe(false);
  });

  it('13: rascunho sem pai nunca é descartado', () => {
    expect(shouldDiscardRedundantDraft(draft({ parent_plan_id: null }), parent())).toBe(false);
  });

  it('14: versão publicada nunca é candidata a descarte', () => {
    expect(shouldDiscardRedundantDraft({ ...draft(), is_draft: false }, parent())).toBe(false);
  });

  it('15: pai não publicado não gera descarte', () => {
    expect(shouldDiscardRedundantDraft(draft(), { ...parent(), is_draft: true })).toBe(false);
  });

  it('16: só metadados de publicação diferentes ainda é no-op', () => {
    const plan: any = basePlan();
    plan.meta.publishedAt = '2026-05-05T10:00:00Z';
    plan.days[0].meals[0].items[0].nutritionSnapshot = { kcal: 1 };
    expect(shouldDiscardRedundantDraft(draft(), { ...parent(), conteudo_json: plan })).toBe(true);
  });
});
