import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opções da refeição na dieta do aluno: trocar a opção troca os alimentos do
 * dia; refeição já pesada pergunta antes e apaga a pesagem (novo registro).
 */

const mock = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(undefined), cache: vi.fn(), weighRows: [] as any[], plan: null as any,
  nextLog: null as any, user: { id: 'aluno-pesa' }, inserts: [] as any[], upserts: [] as any[],
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
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: (row: any) => { mock.upserts.push({ table, row }); return Promise.resolve({ error: null }); },
    insert: (row: any) => {
      mock.inserts.push({ table, row });
      return { select: () => ({ single: async () => ({ data: { id: `ins-${mock.inserts.length}`, created_at: '2026-10-30T09:59:00Z', ...row }, error: null }) }) };
    },
  }),
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
vi.mock('@/components/diet/mealWeigh/MealWeighScreen', async () => {
  const { buildScanMealLog, scannedFoodItem } = await import('@/lib/foodPhotoScan');
  const IOGURTE = { id: 'f-iog', name: 'Iogurte natural', calories: 60, protein: 4, carbs: 5, fats: 3, portion_size: 100 };
  return { default: (props: any) => (
    <div data-testid="fake-weigh">
      <span>previsto: {props.meal.foods.map((f: any) => `${f.food} ${f.qty}`).join(', ')}</span>
      <span>base: {props.addToLog ? props.addToLog.id : 'nenhuma'} · modo: {props.initialMode ?? '-'} · alimento: {props.startFoodIndex ?? '-'}</span>
      <span>registrar em: {props.mealOptions?.find((o: any) => o.index === props.mealIndex)?.label ?? '-'}</span>
      <button onClick={() => { props.onSaved?.({ ...mock.nextLog, meal_index: props.mealIndex, log_date: props.logDate }); props.onClose(); }}>Salvar pesagem</button>
      <button onClick={() => {
        const row = buildScanMealLog(props.meal, props.addToLog ?? null, scannedFoodItem(IOGURTE as any, 100));
        props.onSaved?.({ id: 'scan-log', created_at: '2026-10-30T09:30:00Z', log_date: props.logDate, meal_index: props.mealIndex, ...row });
        props.onClose();
      }}>Salvar escaneado</button>
    </div>
  ) };
});

import MinhasDietas from '@/pages/MinhasDietas';

const item = (name: string, grams: number, m: { kcal: number; p: number; c: number; g: number }, foodId?: string) => ({
  foodId, name, qtyGrams: grams, portionLabel: `${grams} g`, macros: m,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 30, 9)); // sexta, 09:00
  localStorage.clear(); mock.write.mockClear(); mock.weighRows = []; mock.inserts = []; mock.upserts = [];
  const lanche = { kcal: 206, p: 5, c: 43, g: 2.3 };
  const jantar = { kcal: 260, p: 5, c: 57, g: 0.6 };
  const target = { kcal: 466, p: 10, c: 100, g: 2.9 };
  mock.plan = { id: 'plan-opcoes', conteudo: '', is_draft: false, protocols: {},
    conteudo_json: { meta: { foodContractVersion: '1' }, targets: target,
      days: [{ label: 'Padrão', totals: target, meals: [
        { id: 'm0', order: 0, name: 'Lanche', time: '08:00', totals: lanche, items: [
          item('Banana', 100, { kcal: 89, p: 1, c: 23, g: 0.3 }), item('Aveia', 30, { kcal: 117, p: 4, c: 20, g: 2 }),
        ], options: [
          { source: 'plan', name: 'Aveia e Banana', items: [] },
          { source: 'bank', bankCode: 'LT01', name: 'Iogurte com whey', prep: 'Misturar o whey no iogurte.', items: [
            { foodId: 'iog', name: 'Iogurte natural', qtyGrams: 200, macros: { kcal: 120, p: 8, c: 10, g: 6 } },
            { foodId: 'whey', name: 'Whey', qtyGrams: 20, macros: { kcal: 80, p: 15, c: 2, g: 1 } },
          ] },
          { source: 'bank', bankCode: 'LT08', name: 'Cottage com torradas', items: [
            { foodId: 'cot', name: 'Queijo cottage', qtyGrams: 100, macros: { kcal: 98, p: 11, c: 3, g: 4 } },
            { foodId: 'pao', name: 'Pão integral', qtyGrams: 40, macros: { kcal: 100, p: 4, c: 18, g: 1 } },
          ] },
        ] },
        { id: 'm1', order: 1, name: 'Jantar', time: '20:00', totals: jantar, items: [item('Arroz branco', 200, jantar)] },
      ] }],
    },
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const lancheCard = () => screen.getByText('Lanche').closest('.rounded-2xl') as HTMLElement;

const weighedLanche = {
  id: 'log-old', created_at: '2026-10-30T08:10:00Z', log_date: '2026-10-30', meal_index: 0,
  planned: { alimentos: [{ alimento: 'Banana', gramas: 100, qty: '100 g', kcal: 89, p: 1, c: 23, g: 0.3 }] },
  items: [{ alimento: 'Banana', food_id: 'f', gramas: 150, kcal: 134, p: 1.5, c: 34.5, g: 0.5, indice_plano: 0 }],
  unweighed: [],
};

describe('Dieta do aluno — 3 opções por refeição', () => {
  it('trocar para a Opção 2 troca os alimentos da refeição, sem pergunta', async () => {
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const card = lancheCard();
    expect(within(card).getByTestId('meal-option-badge')).toHaveTextContent('Opção 1/3');
    fireEvent.click(within(card).getByRole('button', { name: 'Opção 2: Iogurte com whey' }));
    expect(screen.queryByText(/Voltar para a Opção/)).toBeNull();
    await waitFor(() => expect(within(lancheCard()).getByTestId('meal-option-badge')).toHaveTextContent('Opção 2/3'));
    expect(within(lancheCard()).getByText('Iogurte natural')).toBeInTheDocument();
    expect(within(lancheCard()).queryByText('Banana')).toBeNull();
    expect(within(lancheCard()).getByTestId('meal-option-prep')).toHaveTextContent('Misturar o whey no iogurte.');
    // Escolha guardada junto das edições do dia (para o treinador ver).
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); });
    const up = mock.upserts.find((u) => u.table === 'student_diet_overrides');
    expect(up?.row.edited_meta.__options['4-0']).toMatchObject({ n: 1, nome: 'Iogurte com whey', refeicao: 'Lanche' });
  });

  it('refeição já pesada: pergunta "Voltar para a Opção N?" e só troca ao confirmar', async () => {
    mock.weighRows = [weighedLanche];
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    expect(within(lancheCard()).getByTestId('meal-option-edited')).toHaveTextContent('pesada / alterada');
    fireEvent.click(within(lancheCard()).getByRole('button', { name: 'Opção 1: Aveia e Banana' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Voltar para a Opção 1?');
    expect(dialog).toHaveTextContent('Você já pesou o lanche');
    expect(within(dialog).getByTestId('option-switch-foods')).toHaveTextContent('Banana');
    expect(dialog).toHaveTextContent('Registrado agora: 134 kcal → volta para 206 kcal');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar à Opção 1' })); });
    await waitFor(() => expect(mock.inserts.some((i) => i.table === 'meal_weigh_logs')).toBe(true));
    const cleared = mock.inserts.find((i) => i.table === 'meal_weigh_logs')!.row;
    expect(cleared).toMatchObject({ meal_index: 0, log_date: '2026-10-30', items: [], total_kcal: 0 });
    expect(cleared.planned).toMatchObject({ cleared: true, opcao: 1 });
    await waitFor(() => expect(within(lancheCard()).queryByTestId('meal-weighed-badge')).toBeNull());
    expect(within(lancheCard()).getByText('Aveia')).toBeInTheDocument();
  });

  it('cancelar mantém a pesagem', async () => {
    mock.weighRows = [weighedLanche];
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    fireEvent.click(within(lancheCard()).getByRole('button', { name: 'Opção 3: Cottage com torradas' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(mock.inserts).toHaveLength(0);
    expect(within(lancheCard()).getByTestId('meal-weighed-badge')).toBeInTheDocument();
  });

  it('Escanear fica no card de calorias e o botão Protocolos some', async () => {
    mock.plan.protocols = { refeed: true };
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    expect(screen.getByRole('button', { name: /Escanear/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Protocolos/ })).toBeNull();
  });
});
