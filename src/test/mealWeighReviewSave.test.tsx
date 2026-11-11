import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Concluir com alimentos não pesados, troca fora do plano e salvar (câmera/IA simuladas). */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = [
  { id: 'f-ban', name: 'Banana', calories: 89, protein: 1, carbs: 23, fats: 0.3, portion_size: 100 },
  { id: 'f-pasta', name: 'Pasta de amendoim', calories: 588, protein: 25, carbs: 20, fats: 50, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : { insert: (row: any) => { mock.insert(row); return { select: () => ({ single: async () => ({ data: { id: 'log-1', created_at: 'now', ...row }, error: null }) }) }; } },
    functions: { invoke: mock.invoke },
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Banana', qty: '100 g', kcal: '89', p: '1', c: '23', g: '0.3' },
    { food: 'Aveia', qty: '30 g', kcal: '117', p: '4', c: '20', g: '2' },
    { food: 'Mel', qty: '10 g', kcal: '30', p: '0', c: '8', g: '0' },
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
beforeEach(() => { mock.invoke.mockReset(); mock.insert.mockReset(); mock.shot = 0; });
afterEach(() => cleanup());

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};

describe('Pesar refeição — concluir com itens não pesados', () => {
  it('pergunta "Comi sem pesar"/"Não comi", pergunta a troca e salva tudo no registro', async () => {
    mock.invoke.mockResolvedValueOnce(ai('Banana', 150)).mockResolvedValueOnce(ai('Pasta de amendoim', 57));
    const onSaved = vi.fn();
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-10-30" mealIndex={0} dietPlanId="plano"
      initialMode="scan" onClose={() => {}} onSaved={onSaved} />);

    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Próximo alimento/ }));
    await takePhoto();
    fireEvent.click(within(await screen.findByTestId('meal-weigh-item-actions')).getByRole('button', { name: /Concluir refeição/ }));

    const review = await screen.findByTestId('meal-weigh-review');
    const rows = within(review).getAllByTestId('meal-weigh-unweighed-row');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Aveia'), expect.stringContaining('Mel')]);
    // Padrão: comi sem pesar.
    rows.forEach((r) => expect(within(r).getByRole('button', { name: 'Comi sem pesar' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByTestId('meal-weigh-swap')).toBeNull();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Não comi' }));
    const swap = await screen.findByTestId('meal-weigh-swap');
    expect(swap).toHaveTextContent('A Pasta de amendoim substituiu algum item?');
    expect(screen.getByRole('button', { name: /Ver resumo/ })).toBeDisabled();
    fireEvent.click(within(swap).getByRole('button', { name: 'Aveia' }));
    fireEvent.click(screen.getByRole('button', { name: /Ver resumo/ }));

    const summary = await screen.findByTestId('meal-weigh-summary');
    expect(summary).toHaveTextContent('Aveia: não comeu');
    expect(summary).toHaveTextContent('Mel: comeu sem pesar (previsto 10 g)');
    expect(summary).toHaveTextContent('Trocou Aveia → Pasta de amendoim');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const row = mock.insert.mock.calls[0][0];
    // Banana 150 g (134) + pasta 57 g (335) + mel sem pesar (30); aveia não comida = 0.
    expect(row.total_kcal).toBe(134 + 335 + 30);
    expect(row.unweighed.map((u: any) => [u.alimento, u.escolha])).toEqual([['Aveia', 'nao_comeu'], ['Mel', 'comeu_sem_pesar']]);
    expect(row.items[1]).toMatchObject({ alimento: 'Pasta de amendoim', substituiu: { indice_plano: 1, alimento: 'Aveia' } });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-1', meal_index: 0, log_date: '2026-10-30' }));
  });
});
