import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const calls = vi.hoisted(() => ({ tables: [] as string[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from: (table: string) => {
      const b: any = new Proxy({}, {
        get: (_t, prop) => {
          if (prop === 'then') return (resolve: any) => {
            calls.tables.push(table);
            const data = table === 'students_profile' ? [{ id: '1', user_id: 's1', data_nascimento: null, ativo: true }]
              : table === 'profiles' ? [{ user_id: 's1', nome: 'Aluno', telefone: null }] : [];
            resolve({ data, error: null });
          };
          return () => b;
        },
      });
      return b;
    },
  },
}));

import { useNotifications } from '@/hooks/useNotifications';

describe('notificações do admin ao trocar de tela', () => {
  it('nova tela em menos de 2 min reutiliza a lista; o botão atualizar lê de novo', async () => {
    const first = renderHook(() => useNotifications());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const reads = calls.tables.filter(t => t === 'students_profile').length;
    expect(reads).toBe(1);
    first.unmount();

    const second = renderHook(() => useNotifications());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(calls.tables.filter(t => t === 'students_profile').length).toBe(1);
    expect(second.result.current.count).toBe(first.result.current.count);

    await act(async () => { await second.result.current.refresh(); });
    expect(calls.tables.filter(t => t === 'students_profile').length).toBe(2);
    second.unmount();
  });
});
