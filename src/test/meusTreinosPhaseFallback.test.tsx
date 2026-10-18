import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

/**
 * Reprodução do bug do aluno Wemerson (18/10/2026):
 * - plano MAIS RECENTE em `deload` (criado 17/10, fase_inicio_data 17/10);
 * - planos antigos em `semana_1` e um `semana_3` legado;
 * - o calendário resolve `semana_1` (início do ciclo ontem), mas o plano que
 *   o personal acabou de gerar é o deload.
 *
 * Esperado: a tela mostra por padrão o plano mais recente (deload), nunca
 * fica preta, e o auto-ajuste de fase não oscila.
 */

const STUDENT_ID = 'cb6fc3e7-c863-42cf-9680-49570a9e3d4b';

const MD = `| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |
|---|---|---|---|---|---|---|---|---|
| SEGUNDA-FEIRA | SUPINO INCLINADO ART. | 2 | - | 8-12 | 3 | 90s | Descida controlada. | SUPINO INCLINADO HALTERES |
| SEGUNDA-FEIRA | REMADA NEUTRA MAQ. | 2 | - | 8-12 | 3 | 90s | Peito apoiado. | REMADA SUPINADA MÁQUINA |
| TERÇA-FEIRA | PRANCHA FRONTAL | 3 | - | 30s | - | 45s | Corpo reto. | PRANCHA 2 |
`;

const makePlan = (over: Record<string, unknown>) => ({
  id: 'plan-x',
  conteudo: MD,
  conteudo_json: null,
  migration_status: 'completed',
  periodization_model: null,
  periodization_reason: null,
  block_type: null,
  block_number: null,
  block_total: null,
  next_block_type: null,
  periodization_snapshot: null,
  ...over,
});

/** Lista real do Wemerson (mais recente primeiro). */
const wemersonPlans = [
  makePlan({
    id: '7962ba09-f50c-4a8a-b327-3180b47537c7',
    fase: 'deload',
    fase_inicio_data: '2026-10-17',
    periodization_model: 'ondulatoria',
    block_type: 'acumulacao',
    block_number: 1,
    block_total: 1,
    next_block_type: 'acumulacao',
  }),
  makePlan({ id: '9696c799-4441-4085-a789-22ca18d7e5ad', fase: 'semana_1', fase_inicio_data: '2026-09-04', periodization_model: 'linear' }),
  makePlan({ id: 'bb94de59-6751-4ebe-ba6a-c790acf7279a', fase: 'semana_1', fase_inicio_data: '2026-08-31' }),
  makePlan({ id: '05542d75-de6e-4e25-98dd-2be8577306f2', fase: 'semana_1', fase_inicio_data: '2026-07-13' }),
  makePlan({ id: '70934bef-6b01-4643-bc6e-8dd17ccae6e6', fase: 'semana_1', fase_inicio_data: null }),
  makePlan({ id: '42456464-c446-4939-897d-7f2be9abff4d', fase: 'semana_3', fase_inicio_data: null, migration_status: 'pending' }),
];

// ---- Mocks ----------------------------------------------------------------

vi.mock('@/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const STABLE_USER = { id: STUDENT_ID };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: STABLE_USER, role: 'aluno' }),
}));
vi.mock('@/i18n', () => ({
  useLanguage: () => ({ language: 'pt' }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@/hooks/useActiveWorkoutSession', () => ({
  useActiveWorkoutSession: () => ({ session: null, clear: vi.fn() }),
}));
vi.mock('@/lib/offlineCache', () => ({
  fetchWithCache: async (_key: string, fn: () => Promise<unknown>) => ({ data: await fn(), fromCache: false }),
}));
vi.mock('@/lib/workoutSessionResolution', () => ({
  cancelWorkoutSession: vi.fn(),
  resolveStaleWorkoutSessionsThrottled: vi.fn(async () => {}),
}));

let plansFixture: unknown[] = [];

const makeQuery = (data: unknown) => {
  const q: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lt', 'order', 'limit', 'is', 'not', 'or', 'filter', 'contains', 'update', 'insert', 'delete', 'upsert'];
  for (const m of methods) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
  q.single = q.maybeSingle;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  return q;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQuery(table === 'ai_plans' ? plansFixture : []),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

import MeusTreinos from '@/pages/MeusTreinos';

afterEach(() => cleanup());

describe('MeusTreinos — plano recente em fase diferente do calendário', () => {
  it('mostra por padrão o plano mais recente (deload), sem tela preta nem oscilação', async () => {
    plansFixture = wemersonPlans;
    render(<MeusTreinos />);

    // Os cards de treino do plano deload aparecem (não os do plano antigo).
    await waitFor(() => {
      expect(screen.getAllByText('SEGUNDA-FEIRA').length).toBeGreaterThan(0);
    });

    // A aba ativa deve ser a do plano mais recente: Deload.
    await waitFor(() => {
      const deloadTab = screen.getByRole('tab', { name: /deload/i });
      expect(deloadTab).toHaveAttribute('data-state', 'active');
    });

    // Estável: após a resolução semanal carregar, a aba ativa não oscila.
    await new Promise((r) => setTimeout(r, 300));
    const deloadTab = screen.getByRole('tab', { name: /deload/i });
    expect(deloadTab).toHaveAttribute('data-state', 'active');
  });

  it('quando o plano mais recente está na fase do calendário, mantém a fase calculada', async () => {
    plansFixture = [
      makePlan({ id: 'p1', fase: 'semana_1', fase_inicio_data: '2026-10-17' }),
      makePlan({ id: 'p2', fase: 'semana_1', fase_inicio_data: '2026-09-04' }),
    ];
    render(<MeusTreinos />);
    await waitFor(() => {
      expect(screen.getAllByText('SEGUNDA-FEIRA').length).toBeGreaterThan(0);
    });
    // Só existe uma fase -> sem seletor de abas.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
