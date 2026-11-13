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
// Scanner simulado: adiciona um alimento escaneado na refeição sugerida pelo mesmo caminho do scanner real.
vi.mock('@/components/diet/FoodScanner', async () => {
  const { buildScanMealLog, scannedFoodItem } = await import('@/lib/foodPhotoScan');
  const IOGURTE = { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 };
  return { default: (props: any) => (props.open && props.mealContext ? (
    <button onClick={() => {
      const c = props.mealContext;
      const mi = c.suggested;
      const row = buildScanMealLog(c.meals[mi], c.latestLog(mi), scannedFoodItem(IOGURTE as any, 100));
      c.onSaved({ id: 'scan-log', created_at: '2026-10-30T09:30:00Z', log_date: c.logDate, meal_index: mi, ...row });
    }}>Adicionar escaneado ({props.mealContext.meals[props.mealContext.suggested]?.name})</button>
  ) : null) };
});
vi.mock('@/components/diet/ProtocolsDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/AddFoodDialog', () => ({ default: () => null }));
vi.mock('@/components/diet/FoodSubstitutionDialog', () => ({ default: () => null }));
// Tela de pesagem simulada: só devolve a pesagem salva.
vi.mock('@/components/diet/mealWeigh/MealWeighScreen', () => ({ default: (props: any) => (
  <div data-testid="fake-weigh">
    <span>previsto: {props.meal.foods.map((f: any) => `${f.food} ${f.qty}`).join(', ')}</span>
    <span>base: {props.addToLog ? props.addToLog.id : 'nenhuma'} · modo: {props.initialMode ?? '-'} · alimento: {props.startFoodIndex ?? '-'}</span>
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
    // "Não comeu" do plano fica agrupado e recolhido no fim do card.
    expect(within(card).queryByText('não comeu')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Itens do plano não consumidos \(1\)/ }));
    expect(within(card).getByText('não comeu')).toBeInTheDocument();
    expect(card).toHaveTextContent('Aprox. 469 kcal');

    // Calorias do dia = consumido da refeição pesada.
    expect(screen.getByText('469')).toBeInTheDocument();
    // Próxima refeição reajustada pelo consumido (comeu mais que o previsto).
    expect(jantarKcal()).toBeLessThan(jantarBefore);
    // Plano publicado intacto: nada escrito além do acompanhamento do dia.
    expect(mock.write.mock.calls.every(([w]) => w.table === 'daily_tracking')).toBe(true);
  });

  it('refazer do zero só depois de confirmar e a nova pesagem substitui a anterior', async () => {
    mock.weighRows = [{ ...weighLog('log-old', '2026-10-30T08:10:00Z', 120, 107), meal_index: 0, log_date: '2026-10-30' }];
    mock.nextLog = { ...weighLog('log-new', '2026-10-30T09:00:00Z', 100, 89), unweighed: [], items: [
      { alimento: 'Banana', food_id: 'f', gramas: 100, kcal: 89, p: 1, c: 23, g: 0.3, indice_plano: 0 },
      { alimento: 'Aveia', food_id: 'a', gramas: 30, kcal: 117, p: 4, c: 20, g: 2, indice_plano: 1 },
    ] };
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    expect(within(lancheCard()).getByText('pesou 120 g (previsto 100 g)')).toBeInTheDocument();

    fireEvent.click(within(lancheCard()).getByRole('button', { name: /Pesar de novo/ }));
    expect(await screen.findByText('Essa refeição já tem alimentos pesados')).toBeInTheDocument();
    expect(screen.queryByText('Substituir a pesagem anterior?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Refazer do zero/ }));
    expect(await screen.findByText('Apagar a pesagem atual desta refeição?')).toBeInTheDocument();
    expect(screen.queryByTestId('fake-weigh')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar e refazer' }));
    const fake = await screen.findByTestId('fake-weigh');
    // Pesagem nova: o previsto é o plano do dia, sem partir da pesagem antiga.
    expect(fake).toHaveTextContent('previsto: Banana 100 g, Aveia 30 g');
    expect(fake).toHaveTextContent('base: nenhuma');
    await act(async () => { fireEvent.click(within(fake).getByRole('button', { name: 'Salvar pesagem' })); });

    const card = lancheCard();
    expect(within(card).getByText('pesou 100 g (previsto 100 g)')).toBeInTheDocument();
    expect(within(card).queryByText('pesou 120 g (previsto 100 g)')).toBeNull();
    expect(within(card).queryByText('Fora do plano')).toBeNull();
    expect(card).toHaveTextContent('Aprox. 206 kcal');
  });

  it('"Adicionar alimento" abre a pesagem com a pesagem salva do dia', async () => {
    mock.weighRows = [{ ...weighLog('log-old', '2026-10-30T08:10:00Z', 120, 107), meal_index: 0, log_date: '2026-10-30' }];
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    fireEvent.click(within(lancheCard()).getByRole('button', { name: /Pesar de novo/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar alimento/ }));
    const fake = await screen.findByTestId('fake-weigh');
    expect(fake).toHaveTextContent('base: log-old · modo: - · alimento: -');
  });

  it('balança num alimento da refeição já pesada abre só aquele alimento, sem perguntar', async () => {
    mock.weighRows = [{ ...weighLog('log-old', '2026-10-30T08:10:00Z', 120, 107), meal_index: 0, log_date: '2026-10-30' }];
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const card = lancheCard();
    expect(within(card).queryByRole('button', { name: /^Remover / })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Itens do plano não consumidos/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Pesar Aveia' }));
    const fake = await screen.findByTestId('fake-weigh');
    expect(fake).toHaveTextContent('base: log-old · modo: plan · alimento: 1');
    expect(screen.queryByText('Essa refeição já tem alimentos pesados')).toBeNull();
  });

  it('alimento escaneado adicionado à refeição entra nos totais do dia e reajusta as próximas', async () => {
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const jantarBefore = jantarKcal();
    fireEvent.click(screen.getByRole('button', { name: /Escanear alimento/ }));
    // 09:00 → refeição sugerida é o Lanche (08:00).
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Adicionar escaneado (Lanche)' })); });
    const card = lancheCard();
    expect(within(card).getByTestId('meal-weighed-badge')).toHaveTextContent('Escaneado');
    expect(within(card).getByText('Iogurte natural')).toBeInTheDocument();
    expect(within(card).getAllByText('Escaneado').length).toBeGreaterThanOrEqual(2);
    // Lanche previsto (206) "comi sem pesar" + iogurte 60 kcal.
    expect(card).toHaveTextContent('Aprox. 266 kcal');
    expect(screen.getByText('266')).toBeInTheDocument();
    expect(jantarKcal()).toBeLessThan(jantarBefore);
  });
});
