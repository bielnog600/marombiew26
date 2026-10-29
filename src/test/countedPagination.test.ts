import { describe, it, expect, vi } from 'vitest';
import { readCountedPages } from '@/lib/countedPagination';

describe('paginação contada', () => {
  it('lê 22 páginas em paralelo com no máximo 6 simultâneas e preserva ordem mesmo com respostas invertidas', async () => {
    let concurrent = 0;
    let maximum = 0;
    const finished: number[] = [];
    const rows = Array.from({ length: 21501 }, (_, id) => id);
    const result = await readCountedPages(
      async () => ({ count: rows.length, error: null }),
      async (from, to) => {
        concurrent++;
        maximum = Math.max(maximum, concurrent);
        await new Promise(resolve => setTimeout(resolve, 12 - (from / 1000 % 6) * 2));
        finished.push(from);
        concurrent--;
        return { data: rows.slice(from, to + 1), error: null };
      },
    );
    expect(maximum).toBe(6);
    expect(finished).toHaveLength(22);
    expect(finished[0]).not.toBe(0);
    expect(result).toEqual(rows);
  });

  it.each(['returned', 'thrown', 'missing'] as const)('fallback sequencial quando count falha (%s)', async kind => {
    const rows = Array.from({ length: 2000 }, (_, id) => id);
    let concurrent = 0;
    let maximum = 0;
    const pages: number[] = [];
    const result = await readCountedPages(
      async () => {
        if (kind === 'thrown') throw new Error('count indisponível');
        return { count: null, error: kind === 'returned' ? new Error('count indisponível') : null };
      },
      async (from, to) => {
        concurrent++;
        maximum = Math.max(maximum, concurrent);
        pages.push(from);
        await Promise.resolve();
        concurrent--;
        return { data: rows.slice(from, to + 1), error: null };
      },
    );
    expect(result).toEqual(rows);
    expect(maximum).toBe(1);
    expect(pages).toEqual([0, 1000, 2000]);
  });

  it('count zero evita páginas vazias', async () => {
    const read = vi.fn();
    expect(await readCountedPages(async () => ({ count: 0, error: null }), read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('count exato múltiplo de 1000 não precisa de página extra', async () => {
    const read = vi.fn(async (from: number) => ({ data: [from], error: null }));
    expect(await readCountedPages(async () => ({ count: 2000, error: null }), read)).toEqual([0, 1000]);
    expect(read.mock.calls.map(c => c[0])).toEqual([0, 1000]);
  });

  it('erro de página é propagado, sem devolver histórico incompleto', async () => {
    const error = new Error('página indisponível');
    await expect(readCountedPages(async () => ({ count: 1001, error: null }),
      async from => ({ data: from === 0 ? [1] : null, error: from === 0 ? null : error })))
      .rejects.toBe(error);
  });
});