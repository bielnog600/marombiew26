import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishPhase, upsertWeighedItem, weighEntry } from '@/lib/mealWeigh/editItems';

/** Pesar refeição já pesada no dia: adicionar alimento, pesar um item da dieta e refazer do zero. */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 8, fats: 6, portion_size: 100 },
  { id: 'f-ban', name: 'Banana', calories: 100, protein: 1, carbs: 25, fats: 0, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : { insert: (row: any) => { mock.insert(row); return { select: () => ({ single: async () => ({ data: { id: 'log-new', created_at: 'now', ...row }, error: null }) }) }; } },
    functions: { invoke: mock.invoke },
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
import ReweighDialog from '@/components/diet/mealWeigh/ReweighDialog';
import { answerScanApply } from './scanApplyHelper';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7.5', g: '4.5' },
    { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '2.4', g: '1.8' },
    { food: 'Banana', qty: '90 g', kcal: '90', p: '0.9', c: '22.5', g: '0' },
  ],
};
const PLAN = [
  { alimento: 'Iogurte natural', gramas: 150, qty: '150 g', kcal: 90, p: 6, c: 7.5, g: 4.5 },
  { alimento: 'Whey protein', gramas: 30, qty: '30 g', kcal: 120, p: 24, c: 2.4, g: 1.8 },
  { alimento: 'Banana', gramas: 90, qty: '90 g', kcal: 90, p: 0.9, c: 22.5, g: 0 },
];
const savedLog = {
  id: 'log-old', log_date: '2026-11-12', meal_index: 0, created_at: '2026-11-12T16:05:00Z',
  planned: { nome: 'Lanche', alimentos: PLAN },
  items: [
    { alimento: 'Iogurte natural', food_id: 'f-iog', gramas: 154, kcal: 92, p: 6.2, c: 7.7, g: 4.6, foto_url: null, editado_pelo_aluno: false, indice_plano: 0 },
    { alimento: 'Whey protein', food_id: 'f-whey', gramas: 26, kcal: 104, p: 20.8, c: 2.1, g: 1.6, foto_url: null, editado_pelo_aluno: false, indice_plano: 1 },
  ],
  unweighed: [{ indice_plano: 2, alimento: 'Banana', gramas: 90, qty: '90 g', kcal: 90, p: 0.9, c: 22.5, g: 0, escolha: 'comeu_sem_pesar' }],
};
const scanAi = (alimento: string, gramas: number) => ({
  data: { result: { alimento, alimento_alternativas: [], gramas_lidas: gramas, confianca_alimento: 0.9, confianca_leitura: 0.95, visor_legivel: true, observacao: '' } },
  error: null,
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

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};
const item = (alimento: string, gramas: number, indice_plano: number | null) =>
  ({ alimento, food_id: null, gramas, kcal: gramas, p: 0, c: 0, g: 0, foto_url: null, editado_pelo_aluno: false, indice_plano }) as any;

describe('regras puras da pesagem incremental', () => {
  it('refeição já pesada: pela refeição pergunta; pela balança num alimento só atualiza aquele item', () => {
    expect(weighEntry(false)).toEqual({ kind: 'fresh' });
    expect(weighEntry(false, 1)).toEqual({ kind: 'fresh' });
    expect(weighEntry(true)).toEqual({ kind: 'ask' });
    expect(weighEntry(true, 1)).toEqual({ kind: 'add_food', food: 1 });
  });

  it('item da dieta substitui só o item do mesmo alimento; os outros ficam com as fotos', () => {
    const items = [item('Iogurte', 154, 0), item('Whey', 26, 1), item('Mel', 20, null)];
    const out = upsertWeighedItem(items, ['', 'F2', 'F3'], item('Whey', 30, 1), 'NOVA');
    expect(out.items.map((i) => [i.alimento, i.gramas])).toEqual([['Iogurte', 154], ['Mel', 20], ['Whey', 30]]);
    expect(out.photos).toEqual(['', 'F3', 'NOVA']);
    const added = upsertWeighedItem(items, ['', 'F2', 'F3'], item('Banana', 95, 2), 'B');
    expect(added.items).toHaveLength(4);
    expect(added.items.slice(0, 3)).toEqual(items);
  });

  it('concluir pesagem incremental vai ao resumo quando os não pesados já têm resposta', () => {
    const planned = { nome: 'Lanche', horario: null, alimentos: PLAN as any, kcal: 300, p: 30.9, c: 32.4, g: 6.3 };
    const items = [item('Iogurte natural', 154, 0), item('Whey protein', 30, 1)];
    expect(finishPhase(planned, items, { 2: 'comeu_sem_pesar' }, true)).toBe('summary');
    expect(finishPhase(planned, items, {}, true)).toBe('review');
    expect(finishPhase(planned, items, { 2: 'comeu_sem_pesar' }, false)).toBe('review');
  });
});

describe('Pesar refeição — Adicionar alimento numa refeição já pesada', () => {
  it('carrega os itens salvos, escaneia só o novo e salva mesclando (Banana "Comi sem pesar" vira pesada)', async () => {
    mock.invoke.mockResolvedValueOnce(scanAi('Banana', 95));
    const onSaved = vi.fn();
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={0} dietPlanId="plano"
      addToLog={savedLog as any} onClose={() => {}} onSaved={onSaved} />);

    // Com três jeitos de pesar, "Adicionar alimento" abre a escolha mostrando os já registrados.
    expect(await screen.findByTestId('meal-weigh-choose-saved')).toHaveTextContent('Já registrados: Iogurte natural 154 g · Whey protein 26 g');
    fireEvent.click(screen.getByRole('button', { name: /Escanear prato/ }));
    await screen.findByRole('button', { name: 'Tirar foto' });
    expect(screen.getByTestId('meal-weigh-weighed-chips')).toHaveAttribute('aria-label', 'Já pesados: Iogurte natural 154 g · Whey protein 26 g');
    expect(screen.getByText('Alimento 3')).toBeInTheDocument();

    await takePhoto();
    // A IA recebe os já pesados para identificar só o adicionado.
    expect(mock.invoke.mock.lastCall?.[1].body.addedFoods).toEqual([
      { alimento: 'Iogurte natural', gramas: 154 }, { alimento: 'Whey protein', gramas: 26 },
    ]);
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Concluir refeição/ }));
    await answerScanApply();
    await screen.findByTestId('meal-weigh-summary');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });

    const row = mock.insert.mock.calls[0][0];
    expect(row).toMatchObject({ student_id: 'aluno', log_date: '2026-11-12', meal_index: 0 });
    expect(row.items.map((i: any) => [i.alimento, i.gramas, i.indice_plano])).toEqual([
      ['Iogurte natural', 154, 0], ['Whey protein', 26, 1], ['Banana', 95, 2],
    ]);
    expect(row.items.slice(0, 2)).toEqual(savedLog.items);
    expect(row.unweighed).toEqual([]);
    expect(row.total_kcal).toBe(92 + 104 + row.items[2].kcal);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-new' }));
  });

  it('pesar um alimento da dieta numa refeição já pesada altera só ele', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { result: { gramas_lidas: 30, visor_legivel: true, confianca_leitura: 0.95 } }, error: null });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={0} dietPlanId="plano"
      addToLog={savedLog as any} initialMode="plan" startFoodIndex={1} onClose={() => {}} />);

    await takePhoto();
    expect(mock.invoke.mock.lastCall?.[1].body).toMatchObject({ action: 'read_weight', foodName: 'Whey protein' });
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Concluir refeição/ }));
    await answerScanApply();
    await screen.findByTestId('meal-weigh-summary');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });

    const row = mock.insert.mock.calls[0][0];
    expect(row.items.map((i: any) => [i.alimento, i.gramas])).toEqual([['Iogurte natural', 154], ['Whey protein', 30]]);
    expect(row.items[0]).toEqual(savedLog.items[0]);
    // 30 g = previsto do plano.
    expect(row.items[1]).toMatchObject({ kcal: 120, p: 24, indice_plano: 1 });
    // Banana continua "Comi sem pesar" como estava.
    expect(row.unweighed).toEqual([expect.objectContaining({ indice_plano: 2, escolha: 'comeu_sem_pesar' })]);
  });

  it('a tara conta os já pesados e sair com alimento novo avisa que os salvos continuam no dia', async () => {
    mock.invoke.mockResolvedValueOnce(scanAi('Banana', 275));
    const onClose = vi.fn();
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={0} dietPlanId="plano"
      addToLog={savedLog as any} initialMode="scan" onClose={onClose} />);
    await takePhoto();
    // 275 g no visor > 180 g já pesados (154 + 26) → balança não zerada.
    const warn = await screen.findByTestId('meal-weigh-tare-warning');
    expect(warn).toHaveTextContent('mais do que tudo o que já foi pesado (180 g)');
    fireEvent.click(within(warn).getByRole('button', { name: 'Descontar 180 g' }));
    fireEvent.click(within(screen.getByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Próximo alimento/ }));
    await screen.findByRole('button', { name: 'Tirar foto' });
    expect(screen.getByTestId('meal-weigh-weighed-chips')).toHaveAttribute('aria-label', 'Já pesados: Iogurte natural 154 g · Whey protein 26 g · Banana 95 g');

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0]);
    expect(await screen.findByText('Os alimentos novos não serão salvos. Os que já estavam pesados continuam no seu dia.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Pesar refeição — pergunta da refeição já pesada', () => {
  it('Refazer do zero só começa depois de confirmar; Adicionar alimento e Cancelar', async () => {
    const onAdd = vi.fn(); const onRestart = vi.fn(); const onCancel = vi.fn();
    const { rerender } = render(<ReweighDialog open onAdd={onAdd} onRestart={onRestart} onCancel={onCancel} />);
    expect(await screen.findByText('Essa refeição já tem alimentos pesados')).toBeInTheDocument();
    expect(screen.queryByText('Substituir a pesagem anterior?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refazer do zero/ }));
    expect(await screen.findByText('Apagar a pesagem atual desta refeição?')).toBeInTheDocument();
    expect(onRestart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByRole('button', { name: /Adicionar alimento/ });
    expect(onRestart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Refazer do zero/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar e refazer' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();

    rerender(<ReweighDialog open={false} onAdd={onAdd} onRestart={onRestart} onCancel={onCancel} />);
    rerender(<ReweighDialog open onAdd={onAdd} onRestart={onRestart} onCancel={onCancel} />);
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar alimento/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
