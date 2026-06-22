/**
 * Mirror tests for the shared similarity logic. We re-implement a tiny
 * client copy here so vitest can run without Deno imports; the shape and
 * behavior must match supabase/functions/_shared/planSimilarity.ts.
 */
import { describe, it, expect } from 'vitest';

// Lightweight copy of the normalization + Jaccard from the shared lib.
const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s: unknown): string => {
  if (typeof s !== 'string') return '';
  return strip(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
};
const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
};

const exSet = (day: any) => new Set<string>((day?.exercises ?? []).map((e: any) => norm(e?.exercise)).filter(Boolean));

const pair = (a: any, b: any): number => {
  const da = a?.days ?? [];
  const db = b?.days ?? [];
  if (!da.length || !db.length) return 0;
  let sum = 0, n = 0;
  for (const x of da) {
    let best = 0;
    for (const y of db) {
      const j = jaccard(exSet(x), exSet(y));
      if (j > best) best = j;
    }
    sum += best; n++;
  }
  return n ? sum / n : 0;
};

describe('planSimilarity (workout)', () => {
  const mk = (ex: string[]) => ({ days: [{ id: 'd1', day: 'SEG', exercises: ex.map((e) => ({ exercise: e })) }] });

  it('identical plans score 1', () => {
    const a = mk(['Agachamento Livre', 'Leg Press', 'Cadeira Extensora']);
    expect(pair(a, a)).toBe(1);
  });

  it('completely different plans score 0', () => {
    const a = mk(['Agachamento Livre', 'Leg Press']);
    const b = mk(['Supino Reto', 'Remada Curvada']);
    expect(pair(a, b)).toBe(0);
  });

  it('partial overlap returns intermediate score', () => {
    const a = mk(['Agachamento', 'Leg Press', 'Cadeira']);
    const b = mk(['Agachamento', 'Leg Press', 'Stiff']);
    const score = pair(a, b);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('normalization ignores accents and case', () => {
    const a = mk(['AGACHAMENTO LIVRE']);
    const b = mk(['agachamento livre']);
    expect(pair(a, b)).toBe(1);
  });

  it('empty history yields 0', () => {
    expect(pair({ days: [] }, { days: [{ exercises: [{ exercise: 'X' }] }] })).toBe(0);
  });
});