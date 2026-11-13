import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

/** Tela "Pesar refeição" (Escanear prato) — câmera e IA simuladas, nenhuma chamada real. */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), shot: 0 }));

vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ role: 'aluno', signOut: vi.fn(), isAdmin: false }) }));
vi.mock('@/contexts/TabSwipeContext', () => ({ useTabSwipe: () => ({ dragProgress: 0, isDragging: false }) }));
const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 4.7, fats: 3, portion_size: 100 },
  { id: 'f-whey', name: 'Whey protein', calories: 400, protein: 80, carbs: 10, fats: 5, portion_size: 100 },
  { id: 'f-chia', name: 'Chia', calories: 486, protein: 16.5, carbs: 42, fats: 30.7, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }),
    functions: { invoke: mock.invoke },
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
import BottomNav from '@/components/BottomNav';
import { answerScanApply } from './scanApplyHelper';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural', qty: '150 g', kcal: '90', p: '6', c: '7', g: '4.5' },
    { food: 'Whey protein', qty: '30 g', kcal: '120', p: '24', c: '3', g: '1.5' },
    { food: 'Chia', qty: '15 g', kcal: '73', p: '2.5', c: '6.3', g: '4.6' },
  ],
};
const aiResult = (alimento: string, gramas: number, observacao = '') => ({
  data: { result: { alimento, alimento_alternativas: [], gramas_lidas: gramas, confianca_alimento: 0.9, confianca_leitura: 0.95, visor_legivel: true, observacao } },
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
beforeEach(() => { mock.invoke.mockReset(); mock.shot = 0; });
afterEach(() => cleanup());

const renderWithNav = (open: boolean) => (
  <MemoryRouter initialEntries={['/minhas-dietas']}>
    <BottomNav />
    {open && (
      <MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-11" mealIndex={2} dietPlanId="plano" testMode initialMode="scan" onClose={() => {}} />
    )}
  </MemoryRouter>
);

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};

describe('Pesar refeição — tela cheia', () => {
  it('abre por cima de tudo (portal no body) e esconde o menu inferior enquanto está aberta', () => {
    const { rerender } = render(renderWithNav(false));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    rerender(renderWithNav(true));
    expect(screen.getByTestId('meal-weigh-screen').parentElement).toBe(document.body);
    expect(screen.queryByRole('navigation')).toBeNull();
    rerender(renderWithNav(false));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

describe('Pesar refeição — escanear prato item a item', () => {
  it('botões sempre visíveis, foto anterior a partir do 2º item, chips no topo e repetido rejeitado', async () => {
    mock.invoke
      .mockResolvedValueOnce(aiResult('Iogurte natural', 154, 'Há uma tigela na balança, confira a tara.'))
      .mockResolvedValueOnce(aiResult('Whey protein', 26))
      .mockResolvedValueOnce(aiResult('Iogurte natural', 13));
    render(renderWithNav(true));

    await takePhoto();
    const actions1 = await screen.findByTestId('meal-weigh-item-actions');
    expect(screen.getByText('Alimento 1')).toBeInTheDocument();
    expect(within(actions1).getByRole('button', { name: /Próximo alimento/ })).toBeEnabled();
    expect(within(actions1).getByRole('button', { name: /Concluir refeição/ })).toBeEnabled();
    expect(within(actions1).getByRole('button', { name: /Tirar de novo/ })).toBeEnabled();
    expect(screen.queryByTestId('meal-weigh-observation')).toBeNull(); // tigela no 1º item não é suspeita
    expect(mock.invoke.mock.calls[0][1].body.previousImage).toBeNull();
    fireEvent.click(within(actions1).getByRole('button', { name: /Próximo alimento/ }));

    expect(await screen.findByText('Alimento 2')).toBeInTheDocument();
    expect(screen.getByTestId('meal-weigh-weighed-chips')).toHaveAccessibleName('Já pesados: Iogurte natural 154 g');
    await takePhoto();
    await screen.findByTestId('meal-weigh-item-actions');
    const body2 = mock.invoke.mock.calls[1][1].body;
    expect(body2.previousImage).toBe('data:image/jpeg;base64,FOTO1');
    expect(body2.addedFoods).toEqual([{ alimento: 'Iogurte natural', gramas: 154 }]);
    expect(body2.pendingPlanFoods).toEqual(['Whey protein', 'Chia']);
    fireEvent.click(screen.getByRole('button', { name: /Próximo alimento/ }));

    expect(await screen.findByText('Alimento 3')).toBeInTheDocument();
    expect(screen.getByTestId('meal-weigh-weighed-chips')).toHaveAccessibleName('Já pesados: Iogurte natural 154 g · Whey protein 26 g');
    await takePhoto();
    const body3 = mock.invoke.mock.calls[2][1].body;
    expect(body3.previousImage).toBe('data:image/jpeg;base64,FOTO2');
    expect(body3.pendingPlanFoods).toEqual(['Chia']);

    // A IA devolveu de novo o iogurte: não aceita sozinho.
    expect(await screen.findByTestId('meal-weigh-repeated')).toHaveTextContent('Esse alimento já foi pesado. O que você adicionou?');
    expect(screen.getByRole('button', { name: /Próximo alimento/ })).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('meal-weigh-pending-chips')).getByRole('button', { name: 'Chia' }));
    expect(screen.getByRole('button', { name: /Concluir refeição/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Concluir refeição/ }));
    await answerScanApply();

    const summary = await screen.findByTestId('meal-weigh-summary');
    expect(summary).toHaveTextContent('Chia');
    expect(summary).toHaveTextContent('13 g');
    expect(summary).toHaveTextContent('Iogurte natural');
  });
});
