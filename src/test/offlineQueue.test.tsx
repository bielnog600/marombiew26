import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => {
  const store = new Map<number, any>();
  let seq = 0;
  const db = {
    add: async (_s: string, v: any) => { const id = ++seq; store.set(id, { ...v, id }); return id; },
    put: async (_s: string, v: any) => { store.set(v.id, v); },
    delete: async (_s: string, id: number) => { store.delete(id); },
    getAll: async () => [...store.values()],
    count: async () => store.size,
  };
  const failures: any[] = [];
  const upserts: any[] = [];
  const state = { result: null as any };
  const from = (table: string) => {
    if (table === 'client_sync_failures') {
      return { insert: async (row: any) => { failures.push(row); return { error: null }; } };
    }
    const run = async () => {
      const r = state.result;
      if (r instanceof Error) throw r;
      return { error: r };
    };
    return {
      insert: run,
      upsert: async (payload: any, options: any) => { upserts.push({ table, payload, options }); return run(); },
      update: () => ({ eq: run }),
    };
  };
  return { store, db, failures, upserts, state, from };
});

vi.mock('idb', () => ({ openDB: async () => h.db }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } },
}));

import { writeWithFallback, flushQueue, enqueue, getPending } from '@/lib/offlineQueue';

const op = (date = '2026-10-31', extra = {}) => ({
  table: 'daily_tracking', op: 'upsert' as const, onConflict: 'student_id,date',
  payload: { student_id: 'u1', date, ...extra },
});

beforeEach(() => {
  h.store.clear();
  h.failures.length = 0;
  h.upserts.length = 0;
  h.state.result = null;
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('fila offline', () => {
  it('erro de rede enfileira', async () => {
    h.state.result = new TypeError('Failed to fetch');
    const r = await writeWithFallback(op());
    expect(r.queued).toBe(true);
    expect(h.store.size).toBe(1);
    expect(h.failures).toHaveLength(0);
  });

  it.each(['42501', '23505'])('erro %s na escrita direta não enfileira e grava falha', async code => {
    h.state.result = { code, message: 'permanente' };
    const r = await writeWithFallback(op());
    expect(r.queued).toBe(false);
    expect(h.store.size).toBe(0);
    expect(h.failures[0]).toMatchObject({ student_id: 'u1', table_name: 'daily_tracking', error_code: code });
  });

  it('nunca apaga um item após 5 tentativas; guarda backoff para nova sincronização', async () => {
    h.state.result = new TypeError('Failed to fetch');
    await enqueue(op());
    const [item] = await getPending();
    h.store.set(item.id!, { ...item, attempts: 4 });
    const result = await flushQueue();
    expect(result.remaining).toBe(1);
    expect(h.store.size).toBe(1);
    expect(h.failures).toHaveLength(1);
    expect([...h.store.values()][0]).toMatchObject({ attempts: 5, failureRecorded: true });
    expect([...h.store.values()][0].nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('erro permanente durante flush também preserva os dados na fila', async () => {
    await enqueue(op());
    h.state.result = { code: '42501', message: 'sem permissão' };
    const result = await flushQueue();
    expect(result.remaining).toBe(1);
    expect(h.store.size).toBe(1);
    expect(h.failures).toHaveLength(1);
  });

  it('upserts na mesma chave são deduplicados', async () => {
    await enqueue(op('2026-10-31', { water_ml: 250 }));
    await enqueue(op('2026-10-31', { water_ml: 500 }));
    await enqueue(op('2026-10-30', { water_ml: 100 }));
    const items = await getPending();
    expect(items).toHaveLength(2);
    expect(items.find((i: any) => i.payload.date === '2026-10-31')!.payload).toMatchObject({ water_ml: 500 });
  });

  it('insert com UUID usa upsert por id e pode ser repetido sem duplicar', async () => {
    await writeWithFallback({ table: 'workout_sessions', op: 'insert', payload: { id: 'session-1', student_id: 'u1' } });
    expect(h.upserts[0]).toMatchObject({
      table: 'workout_sessions',
      payload: { id: 'session-1' },
      options: { onConflict: 'id', ignoreDuplicates: true },
    });
  });

  it('progresso repetido da mesma sessão mantém uma operação e os campos mais recentes', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await writeWithFallback({ table: 'workout_sessions', op: 'update', matchId: 's1', payload: { session_state: { currentIndex: 0 }, duration_minutes: 0 } });
    await writeWithFallback({ table: 'workout_sessions', op: 'update', matchId: 's1', payload: { session_state: { currentIndex: 2 }, status: 'completed' } });
    const items = await getPending();
    expect(items).toHaveLength(1);
    expect(items[0].payload).toMatchObject({ session_state: { currentIndex: 2 }, duration_minutes: 0, status: 'completed' });
  });
});

describe('OfflineIndicator', () => {
  it('não aparece online sem sincronização em andamento', async () => {
    vi.resetModules();
    vi.doMock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ online: true, pending: 0, syncing: false, synced: false }) }));
    const { default: OfflineIndicator } = await import('@/components/OfflineIndicator');
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/pendente/)).toBeNull();
  });

  it('mostra confirmação quando a fila terminou de sincronizar', async () => {
    vi.resetModules();
    vi.doMock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ online: true, pending: 0, syncing: false, synced: true }) }));
    const { default: OfflineIndicator } = await import('@/components/OfflineIndicator');
    render(<OfflineIndicator />);
    expect(screen.getByText('Tudo sincronizado')).toBeInTheDocument();
  });
});
