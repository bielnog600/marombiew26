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
    return { insert: run, upsert: run, update: () => ({ eq: run }) };
  };
  return { store, db, failures, state, from };
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

beforeEach(() => { h.store.clear(); h.failures.length = 0; h.state.result = null; });

describe('fila offline', () => {
  it('erro de rede enfileira', async () => {
    h.state.result = new TypeError('Failed to fetch');
    const r = await writeWithFallback(op());
    expect(r.queued).toBe(true);
    expect(h.store.size).toBe(1);
    expect(h.failures).toHaveLength(0);
  });

  it.each(['42501', '23505'])('erro %s não enfileira e grava falha', async (code) => {
    h.state.result = { code, message: 'permanente' };
    const r = await writeWithFallback(op());
    expect(r.queued).toBe(false);
    expect(h.store.size).toBe(0);
    expect(h.failures[0]).toMatchObject({ student_id: 'u1', table_name: 'daily_tracking', error_code: code });
  });

  it('item com 5 tentativas sai da fila e vira falha', async () => {
    await flushQueue(); // consome a "última chance" de itens antigos
    h.state.result = new TypeError('Failed to fetch');
    await enqueue(op());
    const [item] = await getPending();
    h.store.set(item.id!, { ...item, attempts: 4 });
    await flushQueue();
    expect(h.store.size).toBe(0);
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
});

describe('OfflineIndicator', () => {
  it('não aparece online sem sincronização em andamento', async () => {
    vi.resetModules();
    vi.doMock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ online: true, pending: 4, syncing: false }) }));
    const { default: OfflineIndicator } = await import('@/components/OfflineIndicator');
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/pendente/)).toBeNull();
  });
});
