// TEMP reproduction: render admin Dashboard with real backend data (permissive RLS, anon key).
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

describe('admin dashboard crash repro', () => {
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
      // wait until either crash captured or some content rendered
      if (queryByTestId('caught')) return;
      expect(container.textContent!.length).toBeGreaterThan(0);
    }, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 10000));
    console.log("REPRO-HTML-LEN:", container.textContent!.length);
    console.log("REPRO-SNAPSHOT:", container.textContent!.slice(0, 600).replace(/\s+/g, " "));
    const caught = queryByTestId('caught');
    expect(caught, `Dashboard threw: ${caught?.textContent}`).toBeNull();
  }, 60000);
});
