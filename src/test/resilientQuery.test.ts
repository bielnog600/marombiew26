import { describe, it, expect, vi } from 'vitest';
import { resilientQuery, TIMEOUT_ERROR } from '@/lib/resilientQuery';

const noSleep = vi.fn(async () => {});

describe('consultas do Dashboard com tempo limite e repetição', () => {
  it('devolve logo quando a primeira tentativa dá certo', async () => {
    const run = vi.fn(async () => ({ count: 50, error: null }));
    const res = await resilientQuery(run, { sleep: noSleep });
    expect(res.count).toBe(50);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('repete até 2 vezes, com espera de 800 ms e 2000 ms, antes de mostrar falha', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const run = vi.fn(async () => ({ count: null, error: { message: 'overloaded' } }));
    const res = await resilientQuery(run, { sleep });
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(c => c[0])).toEqual([800, 2000]);
    expect(res.error).toEqual({ message: 'overloaded' });
  });

  it('a segunda tentativa salva o valor (não mostra "—")', async () => {
    let n = 0;
    const res = await resilientQuery(async () => (++n === 1 ? { count: null, error: { message: 'x' } } : { count: 7, error: null }), { sleep: noSleep });
    expect(res).toEqual({ count: 7, error: null });
  });

  it('uma tentativa que trava é abandonada no tempo limite e cancelada', async () => {
    const signals: AbortSignal[] = [];
    const run = (signal: AbortSignal) => { signals.push(signal); return new Promise<{ error: unknown }>(() => {}); };
    const res = await resilientQuery(run, { timeoutMs: 20, retryDelaysMs: [0], sleep: noSleep });
    expect(res.error).toEqual(TIMEOUT_ERROR);
    expect(signals).toHaveLength(2);
    expect(signals.every(s => s.aborted)).toBe(true);
  });

  it('erro lançado vira falha da tentativa e é repetido', async () => {
    let n = 0;
    const res = await resilientQuery(async () => { if (++n === 1) throw new Error('rede'); return { data: [1], error: null }; }, { sleep: noSleep });
    expect(res).toEqual({ data: [1], error: null });
  });
});
