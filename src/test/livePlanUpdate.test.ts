import { describe, it, expect } from 'vitest';
import { mergeLivePlanUpdate, isRelevantPlanChange } from '@/lib/livePlanUpdate';

const ex = (id: string, exercise: string, series = '3', extra: Record<string, unknown> = {}) =>
  ({ id, exercise, series, series2: '', reps: '10', rir: '', pause: '60s', description: '', variation: '', ...extra }) as any;
const done = (weight: string, reps = '10') => ({ weight, reps, completed: true });
const open = () => ({ weight: '', reps: '', completed: false });
const setCount = (e: any) => Number(e.series) || 3;

describe('mergeLivePlanUpdate — plano do coach aplicado no treino em andamento', () => {
  const current = [ex('ex-1', 'SUPINO RETO'), ex('ex-2', 'CRUCIFIXO'), ex('ex-3', 'TRÍCEPS CORDA')];
  const sets = { 0: [done('60'), done('60'), done('62')], 1: [done('14'), open(), open()] };

  it('mesmo treino: nada muda e nenhum aviso', () => {
    const r = mergeLivePlanUpdate({ current, next: current.map((e) => ({ ...e })), sets, currentIndex: 1, setCount });
    expect(r.changed).toBe(false);
  });

  it('muda reps/descanso/carga alvo de um exercício: séries feitas ficam, campos novos entram', () => {
    const next = [current[0], ex('ex-2', 'CRUCIFIXO', '3', { reps: '12-15', pause: '90s', targetLoadKg: 16 }), current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.changed).toBe(true);
    expect((r.exercises[1] as any).reps).toBe('12-15');
    expect((r.exercises[1] as any).targetLoadKg).toBe(16);
    expect(r.sets[0]).toEqual(sets[0]);
    expect(r.sets[1]).toEqual(sets[1]);
    expect(r.currentIndex).toBe(1);
  });

  it('coach reduz séries abaixo das já feitas: nenhuma série feita é apagada', () => {
    const next = [ex('ex-1', 'SUPINO RETO', '2'), current[1], current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.sets[0]).toHaveLength(3);
    expect(r.sets[0].every((s) => s.completed)).toBe(true);
  });

  it('coach aumenta séries: acrescenta séries vazias no fim', () => {
    const next = [current[0], ex('ex-2', 'CRUCIFIXO', '4'), current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.sets[1]).toHaveLength(4);
    expect(r.sets[1][0]).toEqual(done('14'));
    expect(r.sets[1][3]).toEqual({ reps: '', weight: '', completed: false });
  });

  it('insere exercício e reordena: séries seguem o exercício e o atual continua o mesmo', () => {
    const next = [ex('ex-9', 'PECK DECK'), current[1], current[0], current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.exercises.map((e: any) => e.exercise)).toEqual(['PECK DECK', 'CRUCIFIXO', 'SUPINO RETO', 'TRÍCEPS CORDA']);
    expect(r.sets[0]).toBeUndefined();
    expect(r.sets[1]).toEqual(sets[1]);
    expect(r.sets[2]).toEqual(sets[0]);
    expect(r.currentIndex).toBe(1);
    expect(r.indexMap).toEqual({ 0: 2, 1: 1, 2: 3 });
  });

  it('remove exercício sem séries feitas: some do treino', () => {
    const next = [current[0], current[1]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.exercises).toHaveLength(2);
    expect(r.kept).toBe(0);
  });

  it('remove exercício que já tinha séries feitas: continua no treino para não perder o registro', () => {
    const next = [current[1], current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.exercises.map((e: any) => e.exercise)).toEqual(['SUPINO RETO', 'CRUCIFIXO', 'TRÍCEPS CORDA']);
    expect(r.sets[0]).toEqual(sets[0]);
    expect(r.kept).toBe(1);
  });

  it('troca o exercício do slot atual: o feito fica, o novo entra vazio e vira o atual', () => {
    const next = [current[0], ex('ex-2', 'VOADOR'), current[2]];
    const r = mergeLivePlanUpdate({ current, next, sets, currentIndex: 1, setCount });
    expect(r.exercises.map((e: any) => e.exercise)).toEqual(['SUPINO RETO', 'CRUCIFIXO', 'VOADOR', 'TRÍCEPS CORDA']);
    expect(r.sets[1]).toEqual(sets[1]);
    expect(r.sets[2]).toBeUndefined();
    expect(r.currentIndex).toBe(1);
  });

  it('troca o exercício atual ainda sem séries feitas: vai para o novo exercício do mesmo slot', () => {
    const r = mergeLivePlanUpdate({ current, next: [current[0], current[1], ex('ex-3', 'TRÍCEPS FRANCÊS')], sets, currentIndex: 2, setCount });
    expect(r.exercises).toHaveLength(3);
    expect(r.currentIndex).toBe(2);
    expect(r.sets[2]).toBeUndefined();
  });

  it('aceita chaves de séries em texto (session_state vindo do banco)', () => {
    const r = mergeLivePlanUpdate({ current, next: [ex('ex-0', 'NOVO'), ...current], sets: { '0': sets[0] } as any, currentIndex: 0, setCount });
    expect(r.sets[1]).toEqual(sets[0]);
    expect(r.currentIndex).toBe(1);
  });
});

describe('isRelevantPlanChange', () => {
  it('só o tipo pedido e nunca rascunho', () => {
    expect(isRelevantPlanChange({ new: { tipo: 'treino', is_draft: false } }, 'treino')).toBe(true);
    expect(isRelevantPlanChange({ new: { tipo: 'dieta', is_draft: false } }, 'treino')).toBe(false);
    expect(isRelevantPlanChange({ new: { tipo: 'treino', is_draft: true } }, 'treino')).toBe(false);
  });
  it('evento sem tipo (registro grande ou DELETE) confere de novo', () => {
    expect(isRelevantPlanChange({ new: {}, old: { id: 'x' } }, 'cardio')).toBe(true);
  });
});
