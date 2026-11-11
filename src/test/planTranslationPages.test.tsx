import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Bug: aluno com o celular em inglês ficava preso no skeleton porque a tela
 * esperava a tradução (IA) antes de mostrar o plano. Agora o plano aparece
 * na hora, em português, e a tradução só troca o texto quando chega.
 */

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { id: 'aluno-en' },
  dietPlan: null as any,
  trainingPlans: [] as any[],
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user, role: 'aluno' }) }));
vi.mock('@/i18n', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: vi.fn() }) }));
vi.mock('@/lib/offlineQueue', () => ({ writeWithFallback: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/offlineCache', () => ({
  setCache: vi.fn(),
  fetchWithCache: async (key: string) => ({
    data: key.startsWith('plan:dieta:') ? mock.dietPlan
      : key.startsWith('plans:treino:all:') ? mock.trainingPlans
      : key.startsWith('tracking-week:') ? [] : null,
    fromCache: false,
  }),
}));

const makeQuery = (data: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'order', 'limit', 'is', 'not', 'or', 'filter', 'contains', 'update', 'insert', 'delete', 'upsert']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.single = q.maybeSingle;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  return q;
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => makeQuery([]),
    functions: { invoke: mock.invoke },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/components/AppLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/diet/FoodScanner', () => ({ default: () => null }));
vi.mock('@/components/diet/ProtocolsDialog', () => ({ default: () => null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useActiveWorkoutSession', () => ({ useActiveWorkoutSession: () => ({ session: null, clear: vi.fn() }) }));
vi.mock('@/lib/workoutSessionResolution', () => ({
  cancelWorkoutSession: vi.fn(),
  resolveStaleWorkoutSessionsThrottled: vi.fn(async () => {}),
}));

import MinhasDietas from '@/pages/MinhasDietas';
import MeusTreinos from '@/pages/MeusTreinos';
import { __resetPlanTranslationState } from '@/lib/planTranslation';

const DIET_PT = `| Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G |
|---|---|---|---|---|---|---|---|
| Café da manhã | 07:00 | Pão francês | 50 g | 140 | 4 | 28 | 1 |
| Almoço | 12:00 | Arroz branco | 150 g | 190 | 4 | 42 | 0 |`;
const DIET_PAIRS = [['Café da manhã', 'Breakfast'], ['Almoço', 'Lunch'], ['Pão francês', 'French bread'], ['Arroz branco', 'White rice']];

const TRAINING_PT = `| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |
|---|---|---|---|---|---|---|---|---|
| SEGUNDA-FEIRA | LEG 180 | 3 | - | 8-12 | 2 | 90s | Descida controlada. | LEG PRESS 45 |`;
const TRAINING_PAIRS = [['TREINO DO DIA', 'WORKOUT DAY'], ['SEGUNDA-FEIRA', 'Monday']];

const renderDiet = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MinhasDietas />
  </QueryClientProvider>,
);

const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  localStorage.clear();
  __resetPlanTranslationState();
  mock.invoke.mockReset();
  mock.dietPlan = { id: 'diet-en', conteudo: DIET_PT, conteudo_json: null, is_draft: false, protocols: {}, content_revision: 1 };
  mock.trainingPlans = [{
    id: 'treino-en', conteudo: TRAINING_PT, conteudo_json: null, migration_status: 'pending',
    fase: 'semana_1', fase_inicio_data: null, periodization_model: null, periodization_reason: null,
    block_type: null, block_number: null, block_total: null, next_block_type: null, periodization_snapshot: null,
  }];
});
afterEach(() => cleanup());

describe('MinhasDietas em inglês — nunca fica no skeleton', () => {
  it('translate-plan que nunca responde: a dieta aparece em português', async () => {
    mock.invoke.mockReturnValue(new Promise(() => {}));
    renderDiet();
    expect(await screen.findByText('Café da manhã', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(mock.invoke).toHaveBeenCalledWith('translate-plan', expect.objectContaining({
      body: { planId: 'diet-en', targetLanguage: 'en' },
    }));
  });

  it('translate-plan com erro: a dieta aparece em português', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error('502') });
    renderDiet();
    expect(await screen.findByText('Café da manhã')).toBeInTheDocument();
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();
  });

  it('tradução chega depois: o texto troca para inglês', async () => {
    const call = deferred();
    mock.invoke.mockReturnValue(call.promise);
    renderDiet();
    expect(await screen.findByText('Café da manhã')).toBeInTheDocument();
    call.resolve({ data: { pairs: DIET_PAIRS, cached: false }, error: null });
    expect(await screen.findByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.queryByText('Café da manhã')).not.toBeInTheDocument();
  });

  it('resposta inválida do servidor é ignorada: continua em português', async () => {
    mock.invoke.mockResolvedValue({ data: { pairs: 'oops' }, error: null });
    renderDiet();
    expect(await screen.findByText('Café da manhã')).toBeInTheDocument();
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument();
  });

  it('tradução já salva neste aparelho aparece na hora, sem chamar o servidor', async () => {
    mock.invoke.mockResolvedValue({ data: { pairs: DIET_PAIRS }, error: null });
    const first = renderDiet();
    expect(await screen.findByText('Breakfast')).toBeInTheDocument();
    first.unmount();
    __resetPlanTranslationState();
    mock.invoke.mockReset();
    renderDiet();
    expect(await screen.findByText('Breakfast')).toBeInTheDocument();
    expect(mock.invoke).not.toHaveBeenCalled();
  });
});

describe('MeusTreinos em inglês — nunca fica no skeleton', () => {
  it('translate-plan que nunca responde: o treino aparece em português', async () => {
    mock.invoke.mockReturnValue(new Promise(() => {}));
    render(<MeusTreinos />);
    expect(await screen.findByText('SEGUNDA-FEIRA', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Treino' })).toBeEnabled();
  });

  it('translate-plan com erro: o treino aparece em português', async () => {
    mock.invoke.mockRejectedValue(new Error('rede'));
    render(<MeusTreinos />);
    expect(await screen.findByText('SEGUNDA-FEIRA')).toBeInTheDocument();
  });

  it('tradução chega depois: o dia troca para inglês', async () => {
    const call = deferred();
    mock.invoke.mockReturnValue(call.promise);
    render(<MeusTreinos />);
    expect(await screen.findByText('SEGUNDA-FEIRA')).toBeInTheDocument();
    call.resolve({ data: { pairs: TRAINING_PAIRS, cached: false }, error: null });
    expect(await screen.findByText('MONDAY')).toBeInTheDocument();
    expect(screen.queryByText('SEGUNDA-FEIRA')).not.toBeInTheDocument();
  });
});
