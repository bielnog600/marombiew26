import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Aluna sem Premium (usa só o scanner de produtos) edita o Café da Manhã já
 * escaneado no card: cada edição grava um registro novo do próprio diário.
 * O mock aplica a mesma regra do banco: o aluno insere só o próprio registro,
 * com items em lista (pode ser vazia).
 */
const db = vi.hoisted(() => ({ uid: 'aluna-mara', rows: [] as any[], fail: null as null | { message: string } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_table: string) => ({
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            if (db.fail) return { data: null, error: db.fail };
            if (row.student_id !== db.uid || !Array.isArray(row.items)) {
              return { data: null, error: { message: 'new row violates row-level security policy for table "meal_weigh_logs"' } };
            }
            db.rows.push(row);
            return { data: { id: `log-${db.rows.length}`, created_at: 'now', ...row }, error: null };
          },
        }),
      }),
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
    }),
    rpc: async () => ({ data: [], error: null }),
  },
}));

import { insertDayWeighLog } from '@/components/diet/mealWeigh/dayLogApi';
import { buildWeighLogRow, dayMealFoodsFromLog, plannedFromMeal } from '@/lib/mealWeigh';
import { dayRowRef, dayStateFromLog, editDayRow, removeDayRow, setDayRowChoice } from '@/lib/mealWeigh/dayEdit';
import { scannedFoodItem } from '@/lib/foodPhotoScan';
import { MEAL_SAVE_ERROR_MESSAGE } from '@/lib/mealWeigh/saveError';

const CAFE = {
  name: 'Café da Manhã', time: '08:00',
  foods: [
    { food: 'Café', qty: '150 ml', kcal: '3', p: '0.2', c: '0', g: '0' },
    { food: 'Pão de centeio', qty: '82 g', kcal: '212', p: '6.9', c: '39.7', g: '2.7' },
  ],
};
const PLANNED = plannedFromMeal(CAFE as any);
const IOGURTE = { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 };
const CAFE_FOOD = { id: 'f-cafe', name: 'Café', calories: 2, protein: 0.13, carbs: 0, fats: 0, portion_size: 100 };
const CTX = { studentId: 'aluna-mara', logDate: '2026-11-15', dietPlanId: 'plano', mealIndex: 0, mealName: 'Café da Manhã', mealTime: '08:00' };

/* Card já escaneado: iogurte escaneado, Café "Comi sem pesar", pão "Não comi". */
const savedLog = () => ({
  id: 'log-0', log_date: '2026-11-15', meal_index: 0, created_at: '2026-11-15T08:10:00Z',
  ...buildWeighLogRow(PLANNED, [{ ...scannedFoodItem(IOGURTE as any, 170), indice_plano: null }], { 0: 'comeu_sem_pesar', 1: 'nao_comeu' }),
});
const rowOf = (log: any, name: string) => dayMealFoodsFromLog(log).find((r) => r.food === name)!;
/** Regra antiga do banco para quem não é Premium: só itens escaneados, lista não vazia. */
const oldRuleAllows = (items: any[]) => items.length > 0 && items.every((i) => i.origem === 'escaneado');

afterEach(() => { db.rows = []; db.fail = null; vi.restoreAllMocks(); });

describe('Card da refeição — aluno sem Premium salva as edições', () => {
  it('mudar as gramas do "Café" do plano (comi sem pesar) salva um registro novo', async () => {
    const log = savedLog();
    const next = editDayRow(dayStateFromLog(log as any, PLANNED), dayRowRef(rowOf(log, 'Café').weigh), { food: CAFE_FOOD as any, grams: 200, planIndex: 0 });
    const row = buildWeighLogRow(next.planned, next.items, next.choices);
    expect(oldRuleAllows(row.items)).toBe(false); // era aqui que dava o erro
    const r = await insertDayWeighLog(CTX, next);
    expect(r.error).toBeNull();
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].items.find((i: any) => i.alimento === 'Café')).toMatchObject({ gramas: 200, origem: 'manual', indice_plano: 0 });
  });

  it('"Não comi" no Café salva', async () => {
    const log = savedLog();
    const next = setDayRowChoice(dayStateFromLog(log as any, PLANNED), dayRowRef(rowOf(log, 'Café').weigh), 'nao_comeu');
    const r = await insertDayWeighLog(CTX, next);
    expect(r.error).toBeNull();
    expect(db.rows[0].unweighed.find((u: any) => u.indice_plano === 0).escolha).toBe('nao_comeu');
  });

  it('apagar o item escaneado (lista fica vazia) salva', async () => {
    const log = savedLog();
    const next = removeDayRow(dayStateFromLog(log as any, PLANNED), dayRowRef(rowOf(log, 'Iogurte natural').weigh));
    const r = await insertDayWeighLog(CTX, next);
    expect(r.error).toBeNull();
    expect(db.rows[0].items).toEqual([]);
    expect(db.rows[0].total_kcal).toBe(3);
  });

  it('erro ao salvar: frase simples para o aluno e o erro real no console', async () => {
    db.fail = { message: 'new row violates row-level security policy for table "meal_weigh_logs"' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await insertDayWeighLog(CTX, dayStateFromLog(savedLog() as any, PLANNED));
    expect(r.log).toBeNull();
    expect(r.error).toBe('Não deu para salvar, tenta de novo');
    expect(r.error).toBe(MEAL_SAVE_ERROR_MESSAGE);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('card da refeição'), db.fail);
  });
});
