import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend = vi.hoisted(() => ({
  rpcCalls: [] as any[],
  rpcResult: { data: [] as any, error: null as any },
  pageCalls: 0,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => { backend.rpcCalls.push({ fn, args }); return backend.rpcResult; },
    from: () => {
      const b: any = {
        select: (_c: string, o?: { head?: boolean }) => { b.head = !!o?.head; return b; },
        in: () => b, gte: () => b, order: () => b, range: () => b,
        then: (resolve: any) => { backend.pageCalls++; resolve(b.head ? { count: 1, error: null } : { data: [{ id: 'page' }], error: null }); },
      };
      return b;
    },
  },
}));

import { readProgressionLogs, PROGRESSION_LOG_COLUMNS } from '@/lib/progressionHistory';

beforeEach(() => { backend.rpcCalls = []; backend.rpcResult = { data: [], error: null }; backend.pageCalls = 0; });

describe('histórico de séries numa única chamada', () => {
  it('colunas da Consultoria pedem a forma compacta, numa chamada só', async () => {
    backend.rpcResult = { data: [{ id: 'a' }, { id: 'b' }], error: null };
    const rows = await readProgressionLogs(['s1', 's2'], '2026-05-01T00:00:00.000Z', PROGRESSION_LOG_COLUMNS);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(backend.rpcCalls).toEqual([{ fn: 'set_logs_since', args: { _student_ids: ['s1', 's2'], _since: '2026-05-01T00:00:00.000Z', _compact: true } }]);
    expect(backend.pageCalls).toBe(0);
  });

  it('"*" pede a linha completa', async () => {
    await readProgressionLogs(['s1'], '2026-05-01T00:00:00.000Z');
    expect(backend.rpcCalls[0].args._compact).toBe(false);
  });

  it('sem alunos não chama o servidor', async () => {
    expect(await readProgressionLogs([], '2026-05-01')).toEqual([]);
    expect(backend.rpcCalls).toHaveLength(0);
  });

  it('só volta às páginas antigas quando a função não existe', async () => {
    backend.rpcResult = { data: null, error: { code: 'PGRST202', message: 'not found' } };
    const rows = await readProgressionLogs(['s1'], '2026-05-01');
    expect(rows).toEqual([{ id: 'page' }]);
    expect(backend.pageCalls).toBe(2);
  });

  it('outros erros (ex.: tempo esgotado) não disparam dezenas de páginas', async () => {
    backend.rpcResult = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    await expect(readProgressionLogs(['s1'], '2026-05-01')).rejects.toMatchObject({ code: '57014' });
    expect(backend.pageCalls).toBe(0);
  });
});
