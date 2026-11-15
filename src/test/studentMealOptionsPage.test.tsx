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
  bank: [] as any[], foods: [] as any[],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/i18n', () => ({ useLanguage: () => ({ language: 'pt' }) }));
vi.mock('@/lib/planTranslation', () => ({ translatePlanTexts: async () => null, getCachedPlanTranslation: () => null }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: vi.fn() }) }));
vi.mock('@/hooks/usePremiumScale', () => ({ usePremiumScale: () => true }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: mock.write }));
vi.mock('@/lib/offlineCache', () => ({ setCache: mock.cache, fetchWithCache: async (key: string) => ({
  data: key.startsWith('plan:dieta:') ? mock.plan : key.startsWith('tracking-week:') ? [] : key.startsWith('meal-weigh:') ? mock.weighRows
    : key === 'meal-bank:v1' ? mock.bank : key === 'foods:recipes:v1' ? mock.foods
      : key.startsWith('meal-context:') ? { telefone: '351911000000', restricoes: null, questionario: null } : null,
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
import { dietPlanToMarkdown } from '@/lib/dietMarkdownSerializer';

const item = (name: string, grams: number, m: { kcal: number; p: number; c: number; g: number }, foodId?: string) => ({
  foodId, name, qtyGrams: grams, portionLabel: `${grams} g`, macros: m,
});

/** O plano publicado só aceita foodId em formato UUID. */
const ARROZ_ID = '00000000-0000-4000-8000-0000000000a1';
const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number) =>
  ({ id, name, calories, protein, carbs, fats, portion: 'gramas', portion_size: 100, brand: null, source: null, barcode: null, sourceFoodId: null });
const bankMeal = (code: string, slot: string, name: string, items: Array<[string, number]>, prep: string | null = null, tags: string[] = []) =>
  ({ id: code, code, slot, name, origin: 'BR/PT', tags, prep, active: true, items: items.map(([foodId, grams], ordem) => ({ foodId, grams, ordem })) });

beforeEach(() => {
  mock.foods = [
    food(ARROZ_ID, 'Arroz branco cozido', 130, 2.5, 28.5, 0.3),
    food('broc', 'Brócolis cozido', 25, 2.4, 4, 0.4),
    food('frango', 'Peito de frango grelhado', 160, 32, 0, 2.5),
    food('banana', 'Banana', 89, 1.1, 22.8, 0.3),
    food('aveia', 'Aveia em flocos', 394, 13.9, 66.6, 8.5),
    food('ovo', 'Ovo', 143, 12.6, 0.7, 9.5),
  ];
  mock.bank = [
    bankMeal('JA01', 'jantar', 'Arroz com brócolis', [[ARROZ_ID, 180], ['broc', 50]], 'Cozinhar o arroz e juntar os brócolis.'),
    bankMeal('JA02', 'jantar', 'Frango com arroz', [['frango', 200], [ARROZ_ID, 100]]),
    bankMeal('LT05', 'lanche_tarde', 'Banana amassada com aveia', [['banana', 100], ['aveia', 30]], 'Amassar a banana e misturar a aveia.'),
    bankMeal('LT06', 'lanche_tarde', 'Panqueca de banana', [['banana', 60], ['ovo', 50], ['aveia', 20]]),
  ];
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
        { id: 'm1', order: 1, name: 'Jantar', time: '20:00', totals: jantar, items: [item('Arroz branco cozido', 200, jantar, ARROZ_ID)] },
      ] }],
    },
  };
  // Dieta de um dia só ("Padrão"): o aluno lê o texto publicado e as opções vêm do JSON.
  mock.plan.conteudo = dietPlanToMarkdown(mock.plan.conteudo_json);
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
    expect(within(card).getByTestId('meal-option-badge')).toHaveTextContent('Opção 1');
    // A antiga Opção 3 não vira cartão: ficam Opção 1, Opção 2 e Receitas.
    expect(within(card).queryByRole('button', { name: /^Opção 3/ })).toBeNull();
    expect(await within(card).findByTestId('meal-recipes-card')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Opção 2: Iogurte com whey' }));
    expect(screen.queryByText(/Voltar para a Opção/)).toBeNull();
    await waitFor(() => expect(within(lancheCard()).getByTestId('meal-option-badge')).toHaveTextContent('Opção 2'));
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
    fireEvent.click(within(lancheCard()).getByRole('button', { name: 'Opção 2: Iogurte com whey' }));
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
  it('refeição sem opções salvas ganha a Opção 2 calculada no app, sempre a mesma, sem mexer na dieta', async () => {
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const jantarCard = () => screen.getByText('Jantar', { selector: 'span.truncate' }).closest('.rounded-2xl') as HTMLElement;
    fireEvent.click(within(jantarCard()).getByRole('button', { name: /^20:00\s*Jantar/ }));
    const opt2 = await within(jantarCard()).findByRole('button', { name: /^Opção 2: Arroz com brócolis/ });
    expect(within(jantarCard()).getByRole('button', { name: /^Opção 1/ })).toBeInTheDocument();
    fireEvent.click(opt2);
    await waitFor(() => expect(within(jantarCard()).getByText('Brócolis cozido')).toBeInTheDocument());
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); });
    expect(mock.upserts.every((u) => u.table === 'student_diet_overrides')).toBe(true);
    expect(mock.upserts.at(-1)?.row.edited_meta.__options['4-1']).toMatchObject({ n: 1, codigo: 'JA01' });
  });

  it('sem refeição do banco que bata, mostra só Opção 1 e Receitas', async () => {
    mock.bank = mock.bank.filter((m) => m.code !== 'JA01');
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    const jantarCard = () => screen.getByText('Jantar', { selector: 'span.truncate' }).closest('.rounded-2xl') as HTMLElement;
    fireEvent.click(within(jantarCard()).getByRole('button', { name: /^20:00\s*Jantar/ }));
    const recipes = await within(jantarCard()).findByTestId('meal-recipes-card');
    expect(recipes).toHaveTextContent('0 que batem');
    expect(within(jantarCard()).queryByRole('button', { name: /^Opção 2/ })).toBeNull();
  });

  it('Receitas: lista com gramas ajustadas, só as que batem podem ser escolhidas e substituir troca só hoje', async () => {
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    // Panqueca (LT06) não fecha os macros do lanche: só a banana com aveia bate.
    await waitFor(() => expect(within(lancheCard()).getByTestId('meal-recipes-card')).toHaveTextContent('1 que batem'));
    fireEvent.click(within(lancheCard()).getByTestId('meal-recipes-card'));
    const sheet = await screen.findByTestId('recipes-sheet');
    expect(sheet).toHaveTextContent('Receitas para o Lanche');
    expect(within(sheet).getByTestId('recipes-target')).toHaveTextContent('206 kcal · P 5 · C 43 · G 2');
    expect(within(sheet).getByTestId('recipe-LT05')).toHaveTextContent('Bate com a refeição');
    expect(within(sheet).getByTestId('recipe-LT05')).toHaveTextContent('📖 receita');
    expect(within(sheet).getByTestId('recipe-LT06')).toBeDisabled();
    // Sem ovo tira a panqueca.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sem ovo' }));
    expect(within(sheet).queryByTestId('recipe-LT06')).toBeNull();
    fireEvent.click(within(sheet).getByTestId('recipe-LT05'));
    const detail = await screen.findByTestId('recipe-detail');
    expect(within(detail).getByTestId('recipe-compare')).toHaveTextContent('Refeição atual');
    expect(within(detail).getByTestId('recipe-ingredients')).toHaveTextContent('Banana');
    expect(within(detail).getByTestId('recipe-prep')).toHaveTextContent('Amassar a banana');
    expect(detail).toHaveTextContent('Troca só hoje. A tua dieta continua igual nos outros dias.');
    fireEvent.click(within(detail).getByRole('button', { name: 'Substituir o Lanche de hoje' }));
    await waitFor(() => expect(within(lancheCard()).getByTestId('meal-option-badge')).toHaveTextContent('Receita'));
    expect(within(lancheCard()).getByTestId('meal-recipes-card')).toHaveTextContent('Banana amassada com aveia');
    expect(within(lancheCard()).getByTestId('meal-option-prep')).toHaveTextContent('Amassar a banana');
    await act(async () => { await new Promise((r) => setTimeout(r, 1300)); });
    const up = mock.upserts.at(-1);
    expect(up?.table).toBe('student_diet_overrides');
    expect(up?.row.edited_meta.__options['4-0']).toMatchObject({ n: 2, codigo: 'LT05', data: '2026-10-30', nome: 'Banana amassada com aveia' });
  });

  it('receita numa refeição já pesada pergunta antes e apaga a pesagem ao confirmar', async () => {
    mock.weighRows = [weighedLanche];
    render(<MinhasDietas />);
    await screen.findByText('Lanche');
    fireEvent.click(await within(lancheCard()).findByTestId('meal-recipes-card'));
    fireEvent.click(await screen.findByTestId('recipe-LT05'));
    fireEvent.click(await screen.findByRole('button', { name: 'Substituir o Lanche de hoje' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Trocar o lanche por esta receita?');
    expect(mock.inserts).toHaveLength(0);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Substituir' })); });
    await waitFor(() => expect(mock.inserts.some((i) => i.table === 'meal_weigh_logs')).toBe(true));
    expect(mock.inserts.find((i) => i.table === 'meal_weigh_logs')!.row.planned).toMatchObject({ cleared: true, receita: 'LT05' });
    await waitFor(() => expect(within(lancheCard()).getByTestId('meal-option-badge')).toHaveTextContent('Receita'));
  });
});
