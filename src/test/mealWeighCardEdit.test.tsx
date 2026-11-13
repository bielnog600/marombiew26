import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Refeição do dia depois de escanear: Substituir / Adicionar / Revisar ao
 * concluir, editar/apagar qualquer item direto no card e "Não comeu" agrupado.
 */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
vi.mock('@/components/diet/AddFoodDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/FoodSubstitutionDialog', () => ({ default: () => null }));
const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 8, fats: 6, portion_size: 100 },
  { id: 'f-ovo', name: 'Omelete', calories: 156, protein: 17.4, carbs: 1.6, fats: 9.9, portion_size: 100 },
  { id: 'f-mel', name: 'Mel', calories: 300, protein: 0, carbs: 80, fats: 0, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : {
        insert: (row: any) => { mock.insert(table, row); return { select: () => ({ single: async () => ({ data: { id: 'log-new', created_at: 'now', ...row }, error: null }) }) }; },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), eq: () => ({ in: async () => ({ data: [] }) }), in: async () => ({ data: [] }) }) }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }),
      },
    functions: { invoke: mock.invoke },
    rpc: async () => ({ data: [], error: null }),
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
import StudentMealCard from '@/components/diet/StudentMealCard';
import DayWeighFoodSheet from '@/components/diet/mealWeigh/DayWeighFoodSheet';
import { buildWeighLogRow, dayMealFoodsFromLog, plannedFromMeal, type PlannedMeal, type WeighedItem } from '@/lib/mealWeigh';
import {
  SCAN_APPLY_PREF_KEY, needsScanApplyChoice, readScanApplyPref, replaceMealWithScan, writeScanApplyPref,
} from '@/lib/mealWeigh/scanApply';
import { dayRowRef, dayStateFromLog, editDayRow, groupDayMealFoods, removeDayRow, setDayRowChoice } from '@/lib/mealWeigh/dayEdit';
import { correctionsFromItems } from '@/lib/mealWeigh/calibration';
import { buildScanMealLog, scannedFoodItem } from '@/lib/foodPhotoScan';

/* Café da Manhã do Fabiew (5 itens do plano). */
const CAFE = {
  name: 'Café da Manhã', time: '08:00',
  foods: [
    { food: 'Iogurte grego natural', qty: '170 g', kcal: '163', p: '17', c: '7', g: '7.5' },
    { food: 'Banana', qty: '120 g', kcal: '107', p: '1.3', c: '27', g: '0.4' },
    { food: 'Ovo cozido', qty: '100 g', kcal: '146', p: '13.3', c: '0.6', g: '9.5' },
    { food: 'Whey Protein Isolado', qty: '30 g', kcal: '114', p: '27', c: '0.6', g: '0.3' },
    { food: 'Pão de centeio', qty: '82 g', kcal: '212', p: '6.9', c: '39.7', g: '2.7' },
  ],
};
const PLANNED: PlannedMeal = plannedFromMeal(CAFE as any);
const est = (alimento: string, gramas: number, kcal: number, extra: Partial<WeighedItem> = {}): WeighedItem => ({
  alimento, food_id: null, gramas, kcal, p: 1, c: 1, g: 1, foto_url: null, editado_pelo_aluno: false,
  indice_plano: null, origem: 'estimado', estimativa_id: `e-${alimento}`, gramas_estimadas: gramas, alimento_ia: alimento, ...extra,
});
const SCANNED = [est('Pão de centeio', 75, 194), est('Omelete', 118, 184), est('Tomate', 54, 10), est('Suco de laranja', 268, 121)];

describe('Substituir a refeição pelo que escaneei — regras', () => {
  it('itens do plano não identificados viram "Não comi" e os identificados casam com o plano', () => {
    const r = replaceMealWithScan(PLANNED, SCANNED);
    expect(r.items.map((i) => [i.alimento, i.indice_plano])).toEqual([
      ['Pão de centeio', 4], ['Omelete', null], ['Tomate', null], ['Suco de laranja', null],
    ]);
    // Fora do plano entra sem perguntar item por item.
    expect(r.items.slice(1).every((i) => i.extra === true && !i.substituiu)).toBe(true);
    expect(r.choices).toEqual({ 0: 'nao_comeu', 1: 'nao_comeu', 2: 'nao_comeu', 3: 'nao_comeu' });
    const row = buildWeighLogRow(PLANNED, r.items, r.choices);
    expect(row.unweighed.map((u) => [u.alimento, u.escolha])).toEqual([
      ['Iogurte grego natural', 'nao_comeu'], ['Banana', 'nao_comeu'], ['Ovo cozido', 'nao_comeu'], ['Whey Protein Isolado', 'nao_comeu'],
    ]);
    expect(row.total_kcal).toBe(194 + 184 + 10 + 121);
  });

  it('scanner por foto: substituir tira os itens antigos; adicionar mescla', () => {
    const existing = {
      id: 'old', log_date: '2026-11-13', meal_index: 0, created_at: 'x',
      planned: PLANNED, unweighed: [],
      items: [{ alimento: 'Banana', food_id: null, gramas: 120, kcal: 107, p: 1.3, c: 27, g: 0.4, foto_url: null, editado_pelo_aluno: false, indice_plano: 1 }],
    };
    const iog = scannedFoodItem(FOODS[0] as any, 150);
    const replaced = buildScanMealLog(CAFE as any, existing as any, iog, 'replace');
    expect(replaced.items.map((i) => i.alimento)).toEqual(['Iogurte natural']);
    expect(replaced.items[0].indice_plano).toBe(0);
    expect(replaced.unweighed.filter((u) => u.escolha === 'nao_comeu').map((u) => u.indice_plano)).toEqual([1, 2, 3, 4]);
    expect(replaced.total_kcal).toBe(90);
    const added = buildScanMealLog(CAFE as any, existing as any, iog);
    expect(added.items.map((i) => i.alimento)).toEqual(['Banana', 'Iogurte natural']);
  });

  it('pergunta só com plano ou pesagem; lembra a última escolha mesmo sem armazenamento', () => {
    expect(needsScanApplyChoice(PLANNED, [])).toBe(true);
    expect(needsScanApplyChoice({ alimentos: [] }, [])).toBe(false);
    expect(needsScanApplyChoice({ alimentos: [] }, [{}])).toBe(true);
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readScanApplyPref(storage)).toBe('replace');
    writeScanApplyPref(storage, 'review');
    expect(readScanApplyPref(storage)).toBe('review');
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(() => writeScanApplyPref(broken, 'add')).not.toThrow();
    expect(readScanApplyPref(broken)).toBe('replace');
  });
});

/* Registro do dia já salvo depois do scan (como o do Fabiew em 13/11). */
const dayLog = () => {
  const r = replaceMealWithScan(PLANNED, SCANNED);
  const row = buildWeighLogRow(PLANNED, r.items, r.choices);
  return { id: 'log-1', log_date: '2026-11-13', meal_index: 0, created_at: '2026-11-13T08:29:00Z', ...row };
};

describe('Editar / apagar item da refeição registrada — regras', () => {
  it('mudar as gramas de um estimado recalcula os totais e continua alimentando a calibração', () => {
    const log = dayLog();
    const state = dayStateFromLog(log as any);
    const rows = dayMealFoodsFromLog(log as any);
    const omelete = rows.find((r) => r.food === 'Omelete')!;
    const omeleteFood = { id: 'f-ovo', name: 'Omelete', calories: 156, protein: 17.4, carbs: 1.6, fats: 9.9, portion_size: 100 };
    const next = editDayRow(state, dayRowRef(omelete.weigh), { food: omeleteFood, grams: 150, planIndex: null });
    const edited = next.items.find((i) => i.alimento === 'Omelete')!;
    expect(edited.origem).toBe('estimado');
    expect(edited.gramas).toBe(150);
    expect(edited.gramas_estimadas).toBe(118);
    expect(edited.kcal).toBe(234);
    expect(buildWeighLogRow(next.planned, next.items, next.choices).total_kcal).toBe(194 + 234 + 10 + 121);
    const { upserts } = correctionsFromItems(next.items, { studentId: 'aluno', mealLogId: 'x' });
    expect(upserts.map((u) => [u.food_name, u.estimated_g, u.real_g])).toEqual([['Omelete', 118, 150]]);
  });

  it('apagar um item fora do plano tira ele dos totais; "Comi sem pesar" num do plano volta a contar o previsto', () => {
    const log = dayLog();
    const rows = dayMealFoodsFromLog(log as any);
    const state = dayStateFromLog(log as any);
    const suco = rows.find((r) => r.food === 'Suco de laranja')!;
    const noSuco = removeDayRow(state, dayRowRef(suco.weigh));
    expect(noSuco.items.map((i) => i.alimento)).toEqual(['Pão de centeio', 'Omelete', 'Tomate']);
    expect(buildWeighLogRow(noSuco.planned, noSuco.items, noSuco.choices).total_kcal).toBe(194 + 184 + 10);

    const banana = rows.find((r) => r.food === 'Banana')!;
    expect(banana.weigh.status).toBe('nao_comeu');
    const ate = setDayRowChoice(noSuco, dayRowRef(banana.weigh), 'comeu_sem_pesar');
    expect(buildWeighLogRow(ate.planned, ate.items, ate.choices).total_kcal).toBe(194 + 184 + 10 + 107);

    // Pão do plano marcado "Não comi": o estimado dele sai e o previsto não conta.
    const pao = rows.find((r) => r.food === 'Pão de centeio')!;
    const noPao = setDayRowChoice(ate, dayRowRef(pao.weigh), 'nao_comeu');
    expect(noPao.items.some((i) => i.alimento === 'Pão de centeio')).toBe(false);
    expect(buildWeighLogRow(noPao.planned, noPao.items, noPao.choices).total_kcal).toBe(184 + 10 + 107);
  });

  it('trocar um alimento do plano por outro fora do plano: o do plano fica "Não comi" e o novo aparece "no lugar de"', () => {
    const log = dayLog();
    const state = dayStateFromLog(log as any);
    const banana = dayMealFoodsFromLog(log as any).find((r) => r.food === 'Banana')!;
    const next = editDayRow(state, dayRowRef(banana.weigh), { food: FOODS[3] as any, grams: 20, planIndex: null });
    const mel = next.items.find((i) => i.alimento === 'Mel')!;
    expect(mel.origem).toBe('manual');
    expect(mel.substituiu).toEqual({ indice_plano: 1, alimento: 'Banana' });
    const rows = dayMealFoodsFromLog({ ...log, ...buildWeighLogRow(next.planned, next.items, next.choices) } as any);
    expect(rows.find((r) => r.food === 'Mel')!.weigh).toMatchObject({ status: 'fora_do_plano', substituiu: 'Banana', manual: true });
    expect(rows.find((r) => r.food === 'Banana')!.weigh.status).toBe('nao_comeu');
  });

  it('item escaneado editado continua escaneado', () => {
    const scanned: WeighedItem = { ...scannedFoodItem(FOODS[0] as any, 100), indice_plano: null };
    const log = { id: 'l', log_date: 'd', meal_index: 0, created_at: 'c', ...buildWeighLogRow(PLANNED, [scanned], {}) };
    const row = dayMealFoodsFromLog(log as any).find((r) => r.weigh.escaneado)!;
    const next = editDayRow(dayStateFromLog(log as any), dayRowRef(row.weigh), { food: FOODS[0] as any, grams: 200, planIndex: row.weigh.planIndex ?? null });
    expect(next.items[0]).toMatchObject({ origem: 'escaneado', gramas: 200, kcal: 120 });
  });

  it('card: consumidos primeiro e "Não comeu" do plano agrupados no fim', () => {
    const rows = dayMealFoodsFromLog(dayLog() as any);
    const g = groupDayMealFoods(rows);
    expect(g.consumed.map((r) => r.food.food)).toEqual(['Pão de centeio', 'Omelete', 'Tomate', 'Suco de laranja']);
    expect(g.notEaten.map((r) => r.food.food)).toEqual(['Iogurte grego natural', 'Banana', 'Ovo cozido', 'Whey Protein Isolado']);
  });
});

beforeAll(() => {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 960 });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: () => {} })) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => `data:image/jpeg;base64,FOTO${++mock.shot}`);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => {} }] })) },
  });
});
beforeEach(() => { mock.invoke.mockReset(); mock.insert.mockReset(); mock.shot = 0; localStorage.clear(); });
afterEach(() => cleanup());

const LANCHE = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7.5', g: '4.5' },
    { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '2.4', g: '1.8' },
  ],
};
const ai = (alimento: string, gramas: number) => ({
  data: { result: { alimento, alimento_alternativas: [], gramas_lidas: gramas, confianca_alimento: 0.9, confianca_leitura: 0.95, visor_legivel: true, observacao: '' } },
  error: null,
});
const weighInserts = () => mock.insert.mock.calls.filter(([t]) => t === 'meal_weigh_logs').map(([, r]) => r);

describe('Concluir o scan na tela de pesagem', () => {
  it('pergunta Substituir/Adicionar/Revisar com a última escolha marcada; substituir salva o escaneado e o resto do plano como "Não comi"', async () => {
    localStorage.setItem(SCAN_APPLY_PREF_KEY, 'add');
    const saved = {
      id: 'log-old', log_date: '2026-11-13', meal_index: 0, created_at: 'x', planned: plannedFromMeal(LANCHE as any), unweighed: [],
      items: [{ alimento: 'Whey protein', food_id: 'f-whey', gramas: 30, kcal: 120, p: 24, c: 2.4, g: 1.8, foto_url: null, editado_pelo_aluno: false, indice_plano: 1 }],
    };
    mock.invoke.mockResolvedValueOnce(ai('Iogurte natural', 160));
    render(<MealWeighScreen meal={LANCHE as any} studentId="aluno" logDate="2026-11-13" mealIndex={0} dietPlanId="p"
      initialMode="scan" addToLog={saved as any} onClose={() => {}} />);
    const shot = await screen.findByRole('button', { name: 'Tirar foto' });
    await waitFor(() => expect(shot).toBeEnabled());
    await act(async () => { fireEvent.click(shot); });
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Concluir refeição/ }));

    const choice = await screen.findByTestId('scan-apply-choice');
    expect(within(choice).getByRole('radio', { name: /Adicionar ao que já tem/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(choice).getByRole('radio', { name: /Substituir a refeição pelo que escaneei/ }));
    await act(async () => { fireEvent.click(within(choice).getByRole('button', { name: 'Continuar' })); });
    expect(localStorage.getItem(SCAN_APPLY_PREF_KEY)).toBe('replace');

    await screen.findByTestId('meal-weigh-summary');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const row = weighInserts()[0];
    // O whey salvo antes sai; o iogurte escaneado casa com o plano; o whey do plano vira "Não comi".
    expect(row.items.map((i: WeighedItem) => [i.alimento, i.indice_plano])).toEqual([['Iogurte natural', 0]]);
    expect(row.unweighed.map((u: any) => [u.alimento, u.escolha])).toEqual([['Whey protein', 'nao_comeu']]);
    expect(row.total_kcal).toBe(96);
  });

  it('"Editar pesagem": estimados são editáveis e dá para apagar todos e salvar', async () => {
    const log = dayLog();
    const onSaved = vi.fn();
    render(<MealWeighScreen meal={CAFE as any} studentId="aluno" logDate="2026-11-13" mealIndex={0} dietPlanId="p"
      editLog={log as any} onClose={() => {}} onSaved={onSaved} />);
    await screen.findByTestId('meal-weigh-summary');
    fireEvent.click(screen.getByRole('button', { name: 'Editar Tomate 54 g' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar Tomate' });
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '80' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar Tomate 80 g' })).toBeInTheDocument());

    for (const name of ['Editar Pão de centeio 75 g', 'Editar Omelete 118 g', 'Editar Tomate 80 g', 'Editar Suco de laranja 268 g']) {
      fireEvent.click(screen.getByRole('button', { name }));
      const s = await screen.findByTestId('meal-weigh-edit-sheet');
      fireEvent.click(within(s).getByRole('button', { name: /Apagar item/ }));
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Apagar' })); });
      await waitFor(() => expect(screen.queryByTestId('meal-weigh-edit-sheet')).toBeNull());
    }
    // Continua no resumo (não volta para a câmera) e salva a refeição só com "Não comi".
    expect(await screen.findByTestId('meal-weigh-empty-edit')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })); });
    const row = weighInserts()[0];
    expect(row.items).toEqual([]);
    expect(row.total_kcal).toBe(0);
    expect(row.unweighed.every((u: any) => u.escolha === 'nao_comeu')).toBe(true);
    expect(onSaved).toHaveBeenCalled();
  });
});

describe('Card da refeição registrada', () => {
  const cardFoods = () => dayMealFoodsFromLog(dayLog() as any);

  it('cada item é tocável e os "Não comeu" ficam recolhidos em "Itens do plano não consumidos"', () => {
    const onEdit = vi.fn();
    render(<StudentMealCard meal={{ ...CAFE, foods: cardFoods() } as any} expanded onToggleExpand={() => {}} onFoodsChange={() => {}}
      moveTargets={[]} onMoveFood={() => {}} weighed onEditWeighedFood={onEdit} />);
    expect(screen.queryByText('Iogurte grego natural')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Suco de laranja' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ food: 'Suco de laranja' }));
    fireEvent.click(screen.getByRole('button', { name: /Itens do plano não consumidos \(4\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar Banana' }));
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ food: 'Banana' }));
  });

  it('painel: editar gramas, "Comi sem pesar" e apagar salvam o novo registro com os totais recalculados', async () => {
    const log = dayLog();
    const state = dayStateFromLog(log as any);
    const rows = cardFoods();
    const onApply = vi.fn(async () => true);
    const omelete = rows.find((r) => r.food === 'Omelete')!;
    const { unmount } = render(<DayWeighFoodSheet name="Omelete" weigh={omelete.weigh} state={state} onApply={onApply} onClose={() => {}} />);
    const sheet = await screen.findByRole('dialog', { name: 'Editar Omelete' });
    await waitFor(() => expect(within(sheet).getByTestId('day-weigh-edit-food')).toHaveTextContent('Omelete'));
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '150' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));
    const edited = onApply.mock.calls[0][0] as any;
    expect(buildWeighLogRow(edited.planned, edited.items, edited.choices).total_kcal).toBe(194 + 234 + 10 + 121);

    // Apagar (fora do plano) pede confirmação.
    fireEvent.click(within(sheet).getByRole('button', { name: /Apagar item/ }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Apagar' })); });
    const removed = onApply.mock.calls[1][0] as any;
    expect(removed.items.map((i: WeighedItem) => i.alimento)).toEqual(['Pão de centeio', 'Tomate', 'Suco de laranja']);
    unmount();

    const banana = rows.find((r) => r.food === 'Banana')!;
    render(<DayWeighFoodSheet name="Banana" weigh={banana.weigh} state={state} onApply={onApply} onClose={() => {}} />);
    const s2 = await screen.findByRole('dialog', { name: 'Editar Banana' });
    expect(within(s2).queryByRole('button', { name: /Apagar item/ })).toBeNull();
    fireEvent.click(within(s2).getByRole('button', { name: 'Comi sem pesar' }));
    const ate = onApply.mock.calls[2][0] as any;
    expect(buildWeighLogRow(ate.planned, ate.items, ate.choices).total_kcal).toBe(194 + 184 + 10 + 121 + 107);
  });
});
