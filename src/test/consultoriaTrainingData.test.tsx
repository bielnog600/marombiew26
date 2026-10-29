import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { readConsultoriaTrainingData } from '@/lib/consultoriaTrainingData';
import { useWeeklyProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import { useStudentsWeeklySummary } from '@/hooks/useStudentsWeeklySummary';

const backend = vi.hoisted(() => ({
  calls: [] as { table: string; columns: string; from: number; to: number; ids?: string[] }[],
  logs: [] as any[],
  gate: null as Promise<void> | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, columns: '', from: 0, to: 999, ids: undefined as string[] | undefined };
      const builder: any = {
        select: (columns: string) => { call.columns = columns; return builder; },
        in: (column: string, ids: string[]) => { if (column === 'student_id') call.ids = ids; return builder; },
        eq: () => builder, gte: () => builder, lt: () => builder,
        or: () => builder, order: () => builder, not: () => builder,
        range: (from: number, to: number) => { call.from = from; call.to = to; return builder; },
        then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
          backend.calls.push({ ...call });
          return (async () => {
            if (table === 'exercise_set_logs' && backend.gate) await backend.gate;
            const rows = table === 'students_profile' || table === 'user_roles' ? [{ user_id: 'active' }]
              : table === 'profiles' ? [{ user_id: 'active', nome: 'Aluno', telefone: null }]
              : table === 'exercise_set_logs' ? backend.logs.slice(call.from, call.to + 1)
              : [];
            return { data: rows, error: null };
          })().then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

beforeEach(() => { backend.calls = []; backend.logs = []; backend.gate = null; });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

describe('dados compartilhados da Consultoria', () => {
  it('duas buscas simultâneas leem o histórico apenas uma vez, incluindo mais de 1000 séries', async () => {
    backend.logs = Array.from({ length: 1001 }, (_, id) => ({ id, student_id: 'active' }));
    const queryClient = client();
    const [summaryInputs, reviewInputs] = await Promise.all([
      readConsultoriaTrainingData(queryClient), readConsultoriaTrainingData(queryClient),
    ]);
    expect(summaryInputs).toBe(reviewInputs);
    expect(reviewInputs.logs).toHaveLength(1001);
    expect(reviewInputs.logs[1000].id).toBe(1000);
    expect(backend.calls.filter(c => c.table === 'exercise_set_logs').map(c => [c.from, c.to]))
      .toEqual([[0, 999], [1000, 1999]]);
    expect(backend.calls.filter(c => c.table === 'ai_plans')).toHaveLength(1);
    expect(backend.calls.filter(c => c.table === 'workout_sessions')).toHaveLength(1);
    expect(backend.calls.filter(c => c.ids).every(c => c.ids?.join() === 'active')).toBe(true);
    queryClient.clear();
  });

  it('mantém progressão em carregamento até concluir e compartilha a busca com o resumo', async () => {
    let finish: (() => void) | undefined;
    backend.gate = new Promise<void>(resolve => { finish = resolve; });
    const queryClient = client();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({
      review: useWeeklyProgressionReview(), summary: useStudentsWeeklySummary(),
    }), { wrapper });
    await waitFor(() => expect(backend.calls.some(c => c.table === 'exercise_set_logs')).toBe(true));
    expect(result.current.review.isFetching).toBe(true);
    expect(result.current.review.data).toBeUndefined();
    expect(result.current.summary.loading).toBe(true);
    await act(async () => { finish?.(); });
    await waitFor(() => expect(result.current.review.isFetching).toBe(false));
    await waitFor(() => expect(result.current.summary.loading).toBe(false));
    expect(result.current.review.data).toEqual([]);
    expect(backend.calls.filter(c => c.table === 'exercise_set_logs')).toHaveLength(1);
    expect(backend.calls.filter(c => c.table === 'profiles')).toHaveLength(1);
    expect(backend.calls.filter(c => c.table === 'ai_plans')).toHaveLength(1);
    unmount();
    queryClient.clear();
  });
});