/**
 * FASE 5.2 — fechamento final da Fase 5:
 * duplicação sempre rascunho, meta persistida completa, camada semanal
 * autoritária, solver end-to-end (2 itens vs 4) e tie-break determinístico.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { optimizeDietDay } from '@/lib/dietAutoAdjust';
import {
  buildDuplicateDietPayload,
  resolvePersistedTargetsByDay,
  hasWeeklyDayTargetsLayer,
} from '@/lib/dietStructuredGuards';
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

const CARB = food('carb-id', 'Arroz', 100, 0, 25, 0);
const PROT = food('prot-id', 'Frango', 100, 25, 0, 0);
const FAT = food('fat-id', 'Azeite', 90, 0, 0, 10);
const MISC = food('misc-id', 'Mix', 100, 5, 10, 3);
const FOODS = [CARB, PROT, FAT, MISC];

const item = (f: FoodRecord, qty: number) => ({
  foodId: f.id,
  name: f.name,
  qtyGrams: qty,
  macros: { kcal: 0, p: 0, c: 0, g: 0 },
});

const makePlan = (items: any[]) => ({
  meta: { version: '1.0', foodContractVersion: 1 },
  targets: { kcal: 2000, p: 150, c: 200, g: 60 },
  days: [
    {
      label: 'Padrão',
      meals: [{ id: 'm1', name: 'Almoço', order: 0, items, totals: { kcal: 0, p: 0, c: 0, g: 0 } }],
      totals: { kcal: 0, p: 0, c: 0, g: 0 },
    },
  ],
});

describe('Fase 5.2 — duplicação nasce como rascunho', () => {
  it('A. duplicar plano publicado gera cópia em rascunho', () => {
    const payload = buildDuplicateDietPayload(
      { student_id: 's1', conteudo: '# dieta', conteudo_json: { a: 1 }, is_draft: false },
      'Dieta (cópia)',
    );
    expect(payload.is_draft).toBe(true);
    expect(payload.conteudo_json).toEqual({ a: 1 });
    expect(payload.whatsapp_notified_at).toBeNull();
    expect(payload.whatsapp_notified_count).toBe(0);
  });

  it('A2. duplicar rascunho continua rascunho', () => {
    expect(buildDuplicateDietPayload({ student_id: 's1', is_draft: true }, 't').is_draft).toBe(true);
  });

  it('B. duplicar structured unresolved preserva JSON e nasce rascunho', () => {
    const json = {
      meta: { foodContractVersion: 1 },
      days: [{ meals: [{ items: [{ foodId: null, name: 'Tapioca', qtyGrams: 50 }] }] }],
    };
    const payload = buildDuplicateDietPayload(
      { student_id: 's1', conteudo_json: json, protocols: { carb_cycling: { enabled: true } }, is_draft: false },
      'cópia',
    );
    expect(payload.is_draft).toBe(true);
    expect(payload.conteudo_json).toEqual(json);
    expect(payload.protocols).toEqual({ carb_cycling: { enabled: true } });
  });
});

describe('Fase 5.2 — meta persistida completa', () => {
  const planWithTargets = (targets: any) => ({ days: [{ label: 'Dia 1' }], targets });

  it('C. meta com c=0 explícito é válida', () => {
    const [t] = resolvePersistedTargetsByDay({ plan: planWithTargets({ kcal: 2000, p: 150, c: 0, g: 70 }) });
    expect(t).toEqual({ kcal: 2000, p: 150, c: 0, g: 70 });
  });

  it('D. meta sem c é inválida', () => {
    const [t] = resolvePersistedTargetsByDay({ plan: planWithTargets({ kcal: 2000, p: 150, g: 70 }) });
    expect(t).toBeNull();
  });

  it('E. meta apenas com kcal é inválida', () => {
    const [t] = resolvePersistedTargetsByDay({ plan: planWithTargets({ kcal: 2000 }) });
    expect(t).toBeNull();
  });
});

describe('Fase 5.2 — camada semanal é autoridade', () => {
  it('F. weekday ausente em weekly_day_targets não cai no global', () => {
    const protocols = {
      weekly_day_targets: {
        seg: { kcal: 2200, p: 160, c: 220, g: 70 },
      },
    };
    const plan = {
      targets: { kcal: 2000, p: 150, c: 200, g: 60 },
      days: [{ weekday: 'seg' }, { weekday: 'dom' }],
    };
    expect(hasWeeklyDayTargetsLayer(protocols)).toBe(true);
    const out = resolvePersistedTargetsByDay({ plan, protocols });
    expect(out[0]).toEqual({ kcal: 2200, p: 160, c: 220, g: 70 });
    expect(out[1]).toBeNull();
  });

  it('F2. sem camada diária, o global é fallback legítimo', () => {
    const out = resolvePersistedTargetsByDay({
      plan: { targets: { kcal: 2000, p: 150, c: 200, g: 60 }, days: [{ weekday: 'dom' }] },
      protocols: {},
    });
    expect(out[0]).toEqual({ kcal: 2000, p: 150, c: 200, g: 60 });
  });
});

describe('Fase 5.2 — solver end-to-end', () => {
  it('G. escolhe solução de 2 itens mesmo havendo solução de 4', () => {
    const plan = makePlan([item(CARB, 200), item(PROT, 200), item(FAT, 200), item(MISC, 200)]);
    const res = optimizeDietDay({
      plan,
      dayIndex: 0,
      target: { kcal: 980, p: 85, c: 95, g: 26 },
      foods: FOODS,
    });
    expect(res.status).toBe('feasible');
    expect(res.changedItems).toBe(2);
    expect(res.changes.map((c) => c.itemIndex).sort()).toEqual([0, 1]);
  });

  it('H. tie-break posicional é determinístico entre execuções', () => {
    const run = () =>
      optimizeDietDay({
        plan: makePlan([item(PROT, 200), item(PROT, 200)]),
        dayIndex: 0,
        target: { kcal: 500, p: 125, c: 0, g: 0 },
        foods: FOODS,
      });
    const a = run();
    const b = run();
    const c = run();
    expect(a.status).toBe('feasible');
    expect(a.changes.length).toBe(1);
    expect(a.changes[0].itemIndex).toBe(0);
    expect(b.changes).toEqual(a.changes);
    expect(c.changes).toEqual(a.changes);
  });
});

describe('Fase 5.2 — picker e undo', () => {
  it('I. homônimos permanecem opções distintas por ID, com marca/fonte', () => {
    const src = readFileSync('src/components/diet/CanonicalFoodPickerDialog.tsx', 'utf8');
    expect(src).toContain('key={f.id}');
    expect(src).toContain('f.brand');
    expect(src).toContain('f.source');
    // sem agrupamento por nome
    expect(src).not.toMatch(/group.*by.*name/i);

    const a = food('a', 'Arroz branco', 358, 7, 78, 0.5);
    const b = food('b', 'Arroz branco', 130, 2.7, 28, 0.3);
    const filtered = [a, b].filter((f) => f.name.toLowerCase().includes('arroz'));
    expect(filtered.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('J. toda edição manual invalida o undo do autoajuste', () => {
    const src = readFileSync('src/components/diet/CanonicalDietEditor.tsx', 'utf8');
    for (const fn of ['commitQty', 'toggleLock', 'removeItem', 'handlePickFood']) {
      const start = src.indexOf(`const ${fn} =`);
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, start + 900);
      const end = body.indexOf('\n  };');
      expect(body.slice(0, end)).toContain('setUndoSnapshot(null)');
    }
  });
});

describe('Fase 5.2.1 — micro-correções', () => {
  const dayPlan = (targets: any) => ({ days: [{ label: 'Dia 1' }], targets });

  it('K. null não vira zero', () => {
    expect(
      resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: 150, c: null, g: 70 }) })[0],
    ).toBeNull();
  });

  it('L. string vazia não vira zero', () => {
    expect(
      resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: 150, c: '', g: 70 }) })[0],
    ).toBeNull();
    expect(
      resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: 150, c: '   ', g: 70 }) })[0],
    ).toBeNull();
    expect(
      resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: true, c: 10, g: 70 }) })[0],
    ).toBeNull();
  });

  it('M. zero explícito (número e string) continua válido', () => {
    expect(resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: 150, c: 0, g: 70 }) })[0]).toEqual(
      { kcal: 2000, p: 150, c: 0, g: 70 },
    );
    expect(
      resolvePersistedTargetsByDay({ plan: dayPlan({ kcal: 2000, p: '150', c: '0', g: '0,5' }) })[0],
    ).toEqual({ kcal: 2000, p: 150, c: 0, g: 0.5 });
  });

  it('N. camada semanal inválida continua sendo camada (nunca global)', () => {
    const protocols = { weekly_day_targets: { seg: { kcal: 2200, p: 160, c: null, g: 70 } } };
    expect(hasWeeklyDayTargetsLayer(protocols)).toBe(true);
    const out = resolvePersistedTargetsByDay({
      plan: { targets: { kcal: 2000, p: 150, c: 200, g: 60 }, days: [{ weekday: 'seg' }] },
      protocols,
    });
    expect(out[0]).toBeNull();
  });

  it('O. camada semanal vazia permite o global', () => {
    const protocols = { weekly_day_targets: {} };
    expect(hasWeeklyDayTargetsLayer(protocols)).toBe(false);
    expect(
      resolvePersistedTargetsByDay({
        plan: { targets: { kcal: 2000, p: 150, c: 200, g: 60 }, days: [{ weekday: 'seg' }] },
        protocols,
      })[0],
    ).toEqual({ kcal: 2000, p: 150, c: 200, g: 60 });
  });

  it('P. metadata sem weekday não cria camada', () => {
    const protocols = { weekly_day_targets: { version: 1 } };
    expect(hasWeeklyDayTargetsLayer(protocols)).toBe(false);
    expect(
      resolvePersistedTargetsByDay({
        plan: { targets: { kcal: 2000, p: 150, c: 200, g: 60 }, days: [{ weekday: 'seg' }] },
        protocols,
      })[0],
    ).toEqual({ kcal: 2000, p: 150, c: 200, g: 60 });
  });
});
