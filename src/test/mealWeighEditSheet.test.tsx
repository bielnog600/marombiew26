import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Editar/apagar alimentos já pesados e "Editar pesagem" de uma refeição salva (câmera/IA simuladas). */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 8, fats: 6, portion_size: 100 },
  { id: 'f-mel', name: 'Mel', calories: 300, protein: 0, carbs: 80, fats: 0, portion_size: 100 },
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
import { answerScanApply } from './scanApplyHelper';

const meal = {
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
beforeEach(() => { mock.invoke.mockReset(); mock.insert.mockReset(); mock.shot = 0; localStorage.clear(); (navigator.mediaDevices.getUserMedia as any).mockClear?.(); });
afterEach(() => cleanup());

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};
const chips = () => screen.getByTestId('meal-weigh-weighed-chips');

describe('Pesar refeição — editar e apagar itens confirmados', () => {
  it('tocar no chip abre o painel; mudar gramas recalcula e o aviso da tara usa o novo acumulado', async () => {
    mock.invoke
      .mockResolvedValueOnce(ai('Iogurte natural', 154))
      .mockResolvedValueOnce(ai('Whey protein', 26))
      .mockResolvedValueOnce(ai('Mel', 200));
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-11" mealIndex={0} dietPlanId="plano"
      initialMode="scan" onClose={() => {}} />);

    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Próximo alimento/ }));
    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Próximo alimento/ }));
    await screen.findByRole('button', { name: 'Tirar foto' });
    expect(chips()).toHaveAttribute('aria-label', 'Já pesados: Iogurte natural 154 g · Whey protein 26 g');

    // Editar o whey: foto dele, gramas e salvar.
    fireEvent.click(within(chips()).getByRole('button', { name: 'Editar Whey protein 26 g' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar Whey protein' });
    expect(within(sheet).getByRole('img', { name: 'Foto de Whey protein' })).toHaveAttribute('src', 'data:image/jpeg;base64,FOTO2');
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '30' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));
    await waitFor(() => expect(chips()).toHaveAttribute('aria-label', 'Já pesados: Iogurte natural 154 g · Whey protein 30 g'));

    // Apagar o whey (com confirmação): acumulado volta a 154 g.
    fireEvent.click(within(chips()).getByRole('button', { name: 'Editar Whey protein 30 g' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Editar Whey protein' })).getByRole('button', { name: /Apagar item/ }));
    expect(await screen.findByText('Apagar Whey protein?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(chips()).toHaveAttribute('aria-label', 'Já pesados: Iogurte natural 154 g'));

    // 200 g lidos > 154 g acumulados → aviso com o acumulado atual.
    await takePhoto();
    const warn = await screen.findByTestId('meal-weigh-tare-warning');
    expect(warn).toHaveTextContent('mais do que tudo o que já foi pesado (154 g)');
    expect(within(warn).getByRole('button', { name: 'Descontar 154 g' })).toBeInTheDocument();
    // A IA já enviou a foto anterior + itens pesados atuais (sem o whey apagado).
    expect(mock.invoke.mock.lastCall?.[1].body.addedFoods).toEqual([{ alimento: 'Iogurte natural', gramas: 154 }]);
  });

  it('no resumo, trocar o alimento recalcula o previsto × consumido', async () => {
    mock.invoke.mockResolvedValueOnce(ai('Iogurte natural', 150)).mockResolvedValueOnce(ai('Whey protein', 30));
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-11" mealIndex={0} dietPlanId="plano"
      initialMode="scan" onClose={() => {}} />);
    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Próximo alimento/ }));
    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Concluir refeição/ }));
    await answerScanApply();
    const summary = await screen.findByTestId('meal-weigh-summary');
    expect(summary).toHaveTextContent('Whey protein: previsto 30 g, pesou 30 g');

    fireEvent.click(within(summary).getByRole('button', { name: 'Editar Whey protein 30 g' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar Whey protein' });
    fireEvent.change(within(sheet).getByLabelText('Buscar alimento'), { target: { value: 'Mel' } });
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Mel' }));
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '20' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));

    // Whey vira "comi sem pesar" (previsto), mel entra fora do plano.
    const after = await screen.findByTestId('meal-weigh-summary');
    await waitFor(() => expect(after).toHaveTextContent('Mel: fora do plano, pesou 20 g'));
    expect(after).toHaveTextContent('Whey protein: comeu sem pesar (previsto 30 g)');
  });
});

describe('Pesar refeição — "Editar pesagem" de refeição já salva', () => {
  const savedLog = {
    id: 'log-old', log_date: '2026-11-11', meal_index: 0, created_at: '2026-11-11T16:05:00Z',
    planned: { nome: 'Lanche', alimentos: [
      { alimento: 'Iogurte natural', gramas: 150, qty: '150 g', kcal: 90, p: 6, c: 7.5, g: 4.5 },
      { alimento: 'Whey protein', gramas: 30, qty: '30 g', kcal: 120, p: 24, c: 2.4, g: 1.8 },
    ] },
    items: [
      { alimento: 'Iogurte natural', food_id: 'f-iog', gramas: 154, kcal: 92, p: 6.2, c: 7.7, g: 4.6, foto_url: null, editado_pelo_aluno: false, indice_plano: 0 },
      { alimento: 'Whey protein', food_id: 'f-whey', gramas: 26, kcal: 104, p: 20.8, c: 2.1, g: 1.6, foto_url: null, editado_pelo_aluno: false, indice_plano: 1 },
    ],
    unweighed: [],
  };

  it('abre o resumo editável sem câmera e salva um novo registro do dia com o item editado', async () => {
    const onSaved = vi.fn();
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-11" mealIndex={0} dietPlanId="plano"
      editLog={savedLog as any} onClose={() => {}} onSaved={onSaved} />);
    const summary = await screen.findByTestId('meal-weigh-summary');
    expect(screen.getByText('Editar pesagem')).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();

    fireEvent.click(within(summary).getByRole('button', { name: 'Editar Whey protein 26 g' }));
    const sheet = await screen.findByRole('dialog', { name: 'Editar Whey protein' });
    expect(within(sheet).getByText('A foto deste item não fica guardada.')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '30' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })); });
    const row = mock.insert.mock.calls[0][0];
    expect(row).toMatchObject({ student_id: 'aluno', log_date: '2026-11-11', meal_index: 0 });
    expect(row.items.map((i: any) => [i.alimento, i.gramas])).toEqual([['Iogurte natural', 154], ['Whey protein', 30]]);
    // Whey 30 g = previsto do plano (macros do plano salvo).
    expect(row.items[1]).toMatchObject({ kcal: 120, p: 24, editado_pelo_aluno: true, indice_plano: 1 });
    expect(row.total_kcal).toBe(92 + 120);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-new', meal_index: 0, log_date: '2026-11-11' }));
  });
});
