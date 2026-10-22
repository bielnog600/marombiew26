// TEMP reproduction: render admin Dashboard with REAL backend data (fixtures
// dumped from production on 2026-10-22) via a mocked supabase client.
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const TABLE_FIXTURES: Record<string, any[]> = {
  ai_plans: require('./__fixtures/ai_plans.json'),
  assessments: require('./__fixtures/assessments.json'),
  class_packages: require('./__fixtures/class_packages.json'),
  daily_tracking: require('./__fixtures/daily_tracking.json'),
  exercise_set_logs: require('./__fixtures/exercise_set_logs.json'),
  payments: require('./__fixtures/payments.json'),
  profiles: require('./__fixtures/profiles.json'),
  student_events: require('./__fixtures/student_events.json'),
  students_profile: require('./__fixtures/students_profile.json'),
  user_roles: require('./__fixtures/user_roles.json'),
  weekly_progression_contacts: require('./__fixtures/weekly_progression_contacts.json'),
  workout_sessions: require('./__fixtures/workout_sessions.json'),
};

function makeQueryStub(table: string) {
  const rows = TABLE_FIXTURES[table] ?? [];
  const stub: any = {
    __table: table,
    __single: false,
    then(resolve: any) {
      const data = stub.__single ? (rows[0] ?? null) : rows;
      return Promise.resolve({ data, error: null, count: rows.length }).then(resolve);
    },
  };
  const methods = ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'is', 'not', 'order', 'limit', 'range', 'filter', 'or', 'ilike', 'like', 'contains', 'match'];
  for (const m of methods) stub[m] = () => stub;
  stub.single = () => { stub.__single = true; return stub; };
  stub.maybeSingle = () => { stub.__single = true; return stub; };
  stub.insert = () => stub;
  stub.update = () => stub;
  stub.upsert = () => stub;
  stub.delete = () => stub;
  return stub;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQueryStub(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {}, track: async () => {} }),
    removeChannel: () => {},
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'c29fa2a5-65f4-49e2-b587-3f544e1d72a1', email: 'admin@test' },
    role: 'admin',
    loading: false,
    accessStatus: 'active',
    accessLoading: false,
    suspensionReason: null,
    lastActiveAt: null,
    signOut: vi.fn(),
    isAdmin: true,
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/useStudentPresence', () => ({ useStudentPresence: () => {} }));
vi.mock('@/hooks/useEventTracking', () => ({ useEventTracking: () => ({ trackEvent: vi.fn() }) }));
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ status: 'unsupported', enableNotifications: vi.fn(), isIOS: false, isStandalone: false }),
}));

class Catcher extends React.Component<any, { err: any }> {
  state = { err: null };
  static getDerivedStateFromError(err: any) { return { err }; }
  componentDidCatch(err: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('REPRO-CAUGHT:', err?.message, '\nSTACK:', err?.stack, '\nCOMPONENT:', info?.componentStack);
  }
  render() { return this.state.err ? <div data-testid="caught">{String((this.state.err as any)?.message)}</div> : this.props.children; }
}

import Dashboard from '@/pages/Dashboard';

describe('admin dashboard crash repro (real data fixtures)', () => {
  it('renders dashboard with real data without throwing', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, queryByTestId } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Catcher>
            <Dashboard />
          </Catcher>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      if (queryByTestId('caught')) return;
      // dashboard renders real student names once data loads
      expect(container.textContent).toMatch(/Dhan Kumari Ban|Josue Silva/);
    }, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 8000));
    const caught = queryByTestId('caught');
    expect(caught, `Dashboard threw: ${caught?.textContent}`).toBeNull();
  }, 60000);
});
