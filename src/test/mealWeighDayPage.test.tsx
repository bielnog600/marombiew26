import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Salvar a pesagem entra na refeição DAQUELE dia: card com o consumido,
 * refeição marcada como feita, calorias do dia e próximas refeições pelo consumido.
 */

const mock = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(undefined), cache: vi.fn(), weighRows: [] as any[], plan: null as any,
  nextLog: null as any, user: { id: 'aluno-pesa' },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/i18n', () => ({ useLanguage: () => ({ language: 'pt' }) }));
vi.mock('@/lib/planTranslation', () => ({ translatePlanTexts: async () => null, getCachedPlanTranslation: () => null }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: vi.fn() }) }));
vi.mock('@/hooks/usePremiumScale', () => ({ usePremiumScale: () => true }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: mock.write }));
vi.mock('@/lib/offlineCache', () => ({ setCache: mock.cache, fetchWithCache: async (key: string) => ({
  data: key.startsWith('plan:dieta:') ? mock.plan : key.startsWith('tracking-week:') ? [] : key.startsWith('meal-weigh:') ? mock.weighRows : null,
}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: vi.fn() }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn(),
} }));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/diet/FoodScanner', () => ({ default: () => null }));
vi.mock('@/components/diet/ProtocolsDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/AddFoodDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/FoodSubstitutionDialog', () => ({ default: () => null }));
// Tela de pesagem simulada: só devolve a pesagem salva.
vi.mock('@/components/diet/mealWeigh/MealWeighScreen', () => ({ default: (props: any) => (
  <div data-testid="fake-weigh">
    <span>previsto: {props.meal.foods.map((f: any) => `${f.food} ${f.qty}`).join(', ')}</span>
    <button onClick={() => { props.onSaved?.({ ...mock.nextLog, meal_index: props.mealIndex, log_date: props.logDate }); props.onClose(); }}>Salvar pesagem</button>
  </div>
) }));

import MinhasDietas from '@/pages/MinhasDietas';

const PLANNED = [
  { alimento: 'Banana', gramas: 100, qty: '100 g', kcal: 89, p: 1, c: 23, g: 0.3 },
  { alimento: 'Aveia', gramas: 30, qty: '30 g', kcal: 117, p: 4, c: 20, g: 2 },
];
const weighLog = (id: string, created_at: string, bananaGrams: number, bananaKcal: number) => ({
  id, created_at, planned: { alimentos: PLANNED },
  items: [
    { alimento: 'Banana', food_id: 'f', gramas: bananaGrams, kcal: bananaKcal, p: 1.5, c: 34.5, g: 0.5, indice_plano: 0 },
    { alimento: 'Pasta de amendoim', food_id: 'p', gramas: 57, kcal: 335, p: 14, c: 11, g: 28, indice_plano: null, substituiu: { indice_plano: 1, alimento: 'Aveia' } },
  ],
  unweighed: [{ ...PLANNED[1], indice_plano: 1, escolha: 'nao_comeu' }],
});

const item = (name: string, grams: number, m: { kcal: number; p: number; c: number; g: number }) => ({
  name, qtyGrams: grams, portionLabel: `${grams} g`, macros: m,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 9)); // sexta, 09:00
  localStorage.clear(); mock.write.mockClear(); mock.weighRows = [];
  const lanche = { kcal: 206, p: 5, c: 43, g: 2.3 };
  const jantar = { kcal: 260, p: 5, c: 57, g: 0.6 };
  const target = { kcal: 466, p: 10, c: 100, g: 2.9 };
  mock.plan = { id: 'plan-pesa', conteudo: '', is_draft: false, protocols: {},
    conteudo_json: { meta: { foodContractVersion: '1' }, targets: target,
      days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((weekday) => ({ weekday, label: weekday, totals: target, meals: [
        { id: 'm0', order: 0, name: 'Lanche', time: '08:00', totals: lanche, items: [
          item('Banana', 100, { kcal: 89, p: 1, c: 23, g: 0.3 }), item('Aveia', 30, { kcal: 117, p: 4, c: 20, g: 2 }),
        ] },
        { id: 'm1', order: 1, name: 'Jantar', time: '20:00', totals: jantar, items: [item('Arroz branco', 200, jantar)] },
      ] })),
    },
  };
  mock.nextLog = weighLog('log-new', '2026-10-30T09:00:00Z', 150, 134);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const lancheCard = () => screen.getByText('Lanche').closest('.rounded-2xl') as HTMLElement;
const jantarKcal = () => Number((screen.getByText('Jantar').closest('button')!.textContent!.match(/Aprox\. (\d+) kcal/) ?? [])[1]);

describe('Pesar refeição — salvar entra na refeição do dia', () => {
  it('mostra o consumido no card, marca a refeição e atualiza calorias e próximas refeições', async () => {
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const jantarBefore = jantarKcal();
    expect(jantarBefore).toBe(260);

    fireEvent.click(within(lancheCard()).getByRole('button', { name: /Pesar refeição/ }));
    const fake = await screen.findByTestId('fake-weigh');
    expect(fake).toHaveTextContent('previsto: Banana 100 g, Aveia 30 g');
    await act(async () => { fireEvent.click(within(fake).getByRole('button', { name: 'Salvar pesagem' })); });

    // Marcada como feita no acompanhamento diário (sexta = dia 4, refeição 0).
    await waitFor(() => expect(mock.write).toHaveBeenCalled());
    expect(mock.write.mock.lastCall?.[0]).toMatchObject({ table: 'daily_tracking', payload: { date: '2026-10-30', meals_completed: [4000] } });

    const card = lancheCard();
    expect(within(card).getByTestId('meal-weighed-badge')).toHaveTextContent('Pesado');
    expect(within(card).getByText('pesou 150 g (previsto 100 g)')).toBeInTheDocument();
    expect(within(card).getByText('Fora do plano')).toBeInTheDocument();
    expect(within(card).getByText('no lugar de Aveia')).toBeInTheDocument();
    expect(within(card).getByText('não comeu')).toBeInTheDocument();
    expect(card).toHaveTextContent('Aprox. 469 kcal');

    // Calorias do dia = consumido da refeição pesada.
    expect(screen.getByText('469')).toBeInTheDocument();
    // Próxima refeição reajustada pelo consumido (comeu mais que o previsto).
    expect(jantarKcal()).toBeLessThan(jantarBefore);
    // Plano publicado intacto: nada escrito além do acompanhamento do dia.
    expect(mock.write.mock.calls.every(([w]) => w.table === 'daily_tracking')).toBe(true);
  });

  it('pesar de novo no mesmo dia pergunta e substitui a pesagem anterior', async () => {
    mock.weighRows = [{ ...weighLog('log-old', '2026-10-30T08:10:00Z', 120, 107), meal_index: 0, log_date: '2026-10-30' }];
    mock.nextLog = { ...weighLog('log-new', '2026-10-30T09:00:00Z', 100, 89), unweighed: [], items: [
      { alimento: 'Banana', food_id: 'f', gramas: 100, kcal: 89, p: 1, c: 23, g: 0.3, indice_plano: 0 },
      { alimento: 'Aveia', food_id: 'a', gramas: 30, kcal: 117, p: 4, c: 20, g: 2, indice_plano: 1 },
    ] };
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    expect(within(lancheCard()).getByText('pesou 120 g (previsto 100 g)')).toBeInTheDocument();

    fireEvent.click(within(lancheCard()).getByRole('button', { name: /Pesar de novo/ }));
    expect(await screen.findByText('Substituir a pesagem anterior?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pesar de novo' }));
    const fake = await screen.findByTestId('fake-weigh');
    // O previsto é o plano do dia, não a pesagem antiga.
    expect(fake).toHaveTextContent('previsto: Banana 100 g, Aveia 30 g');
    await act(async () => { fireEvent.click(within(fake).getByRole('button', { name: 'Salvar pesagem' })); });

    const card = lancheCard();
    expect(within(card).getByText('pesou 100 g (previsto 100 g)')).toBeInTheDocument();
    expect(within(card).queryByText('pesou 120 g (previsto 100 g)')).toBeNull();
    expect(within(card).queryByText('Fora do plano')).toBeNull();
    expect(card).toHaveTextContent('Aprox. 206 kcal');
  });
});
