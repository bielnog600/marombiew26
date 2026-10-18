import React from 'react';
import { describe, it, vi, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const STUDENT_ID = 'stu-1';
const MD = `| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |
|---|---|---|---|---|---|---|---|---|
| SEGUNDA-FEIRA | SUPINO INCLINADO ART. | 2 | - | 8-12 | 3 | 90s | Descida controlada. | SUPINO INCLINADO HALTERES |
`;
const makePlan = (over: Record<string, unknown>) => ({ id: 'p1', conteudo: MD, conteudo_json: null, migration_status: 'completed', periodization_model: null, ...over });
let plansFixture: unknown[] = [];

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: STUDENT_ID }, role: 'aluno' }) }));
vi.mock('@/i18n', () => ({ useLanguage: () => ({ language: 'pt' }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useActiveWorkoutSession', () => ({ useActiveWorkoutSession: () => ({ session: null, clear: vi.fn() }) }));
vi.mock('@/lib/offlineCache', () => ({ fetchWithCache: (_k: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/workoutSessionResolution', () => ({ cancelWorkoutSession: vi.fn(), resolveStaleWorkoutSessionsThrottled: vi.fn(async () => {}) }));

const fromCalls: string[] = [];
const makeQuery = (data: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ['select','eq','neq','in','gte','lt','order','limit','is','not','or','filter','contains','update','insert','delete','upsert']) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
  q.single = q.maybeSingle;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  return q;
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => { fromCalls.push(t); return makeQuery(t === 'ai_plans' ? plansFixture : []); },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

import MeusTreinos from '@/pages/MeusTreinos';

describe('dbg', () => {
  it('loads plans', async () => {
    plansFixture = [makePlan({ fase: 'deload', fase_inicio_data: '2026-10-17' }), makePlan({ id: 'p2', fase: 'semana_1', fase_inicio_data: '2026-09-04' })];
    const { container } = render(<MeusTreinos />);
    await new Promise((r) => setTimeout(r, 800));
    console.log('fromCalls:', fromCalls);
    console.log('body text:', container.textContent?.slice(0, 300));
    expect(true).toBe(true);
  });
});
