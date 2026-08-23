import { describe, expect, it, vi } from 'vitest';
import {
  buildSessionProgressionRecommendations,
  filterComparableSessionHistory,
  formatSessionHint,
  readProgressionSnapshot,
  PROGRESSION_SNAPSHOT_VERSION,
  type SessionLog,
  type SessionMetaRow,
} from '@/lib/sessionProgression';
import { buildHistoryNameVariants } from '@/lib/sessionProgressionQuery';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const ex = (name: string, reps = '8-12'): ParsedExercise => ({
  exercise: name,
  series: '3',
  series2: '',
  reps,
  rir: '2',
  pause: '60s',
  description: '',
  variation: '',
});

const day = (n: number) => new Date(Date.UTC(2026, 6, n, 10, 0, 0)).toISOString();

const log = (
  sessionId: string,
  performedAt: string,
  weight: number,
  reps: number,
  rir: number | null = 2,
  phase: string | null = null,
): SessionLog & { phase?: string | null } => ({
  exercise_name: 'SUPINO RETO',
  session_id: sessionId,
  performed_at: performedAt,
  weight_kg: weight,
  reps,
  rir,
  set_type: 'work',
  set_number: 1,
  ...(phase ? { phase } : {}),
});

const meta = (rows: Array<[string, string | null, string | null]>): Record<string, SessionMetaRow> =>
  Object.fromEntries(
    rows.map(([id, planId, phase]) => [id, { sessionId: id, planId, phase } as SessionMetaRow]),
  );

const build = (
  logs: SessionLog[],
  opts: Partial<Parameters<typeof buildSessionProgressionRecommendations>[0]> = {},
) =>
  buildSessionProgressionRecommendations({
    exercises: [ex('Supino Reto')],
    logs,
    currentSessionId: 'S-NOW',
    activePhase: 'semana_1',
    configuredIncrements: { 'SUPINO RETO': 2.5 },
    ...opts,
  });

// S1..S3 progredindo, S4 deload com carga muito menor.
const cycleLogs = (): SessionLog[] => [
  log('S1', day(1), 95, 10, 2, 'semana_1'),
  log('S2', day(8), 97.5, 11, 2, 'semana_2'),
  log('S3', day(15), 100, 8, 2, 'semana_3'),
  log('S4', day(22), 70, 8, 4, 'deload'),
];

const cycleMeta = meta([
  ['S1', 'PLAN-A', 'semana_1'],
  ['S2', 'PLAN-A', 'semana_2'],
  ['S3', 'PLAN-A', 'semana_3'],
  ['S4', 'PLAN-A', 'deload'],
  ['S-NOW', 'PLAN-A', 'semana_1'],
]);

describe('comparabilidade das sessões usadas pelo sessionProgression', () => {
  it('1/2. S3 → S4 (deload) não vira regressão para a nova S1', () => {
    const snap = build(cycleLogs(), { sessionMeta: cycleMeta, currentPlanId: 'PLAN-A' });
    const r = snap.recommendations['SUPINO RETO'];
    expect(r.action).not.toBe('reduce_load');
    expect(r.currentLoadKg).toBe(100); // S3, não os 70 kg do deload
  });

  it('2b. deload é removido do histórico de progressão normal', () => {
    const res = filterComparableSessionHistory({
      logs: cycleLogs(),
      currentSessionId: 'S-NOW',
      currentPlanId: 'PLAN-A',
      sessionMeta: cycleMeta,
    });
    expect(res.excludedDeloadSessions).toBe(1);
    expect(res.logs.some((l) => l.session_id === 'S4')).toBe(false);
    expect(res.legacyFallback).toBe(false);
  });

  it('3/4. outro plan_id não entra silenciosamente; o plano atual é priorizado', () => {
    const logs = [
      log('X1', day(1), 120, 12, 2, 'semana_1'),
      log('S2', day(8), 80, 10, 2, 'semana_2'),
      log('S3', day(15), 82.5, 10, 2, 'semana_3'),
    ];
    const m = meta([
      ['X1', 'PLAN-OLD', 'semana_1'],
      ['S2', 'PLAN-A', 'semana_2'],
      ['S3', 'PLAN-A', 'semana_3'],
    ]);
    const res = filterComparableSessionHistory({
      logs,
      currentSessionId: 'S-NOW',
      currentPlanId: 'PLAN-A',
      sessionMeta: m,
    });
    expect(res.excludedOtherPlanSessions).toBe(1);
    expect(res.logs.every((l) => l.session_id !== 'X1')).toBe(true);

    const r = build(logs, { sessionMeta: m, currentPlanId: 'PLAN-A' }).recommendations['SUPINO RETO'];
    expect(r.currentLoadKg).toBe(82.5);
  });

  it('19. plano anterior com carga muito maior não causa reduce_load falso', () => {
    const logs = [
      log('X1', day(1), 140, 12, 1, 'semana_3'),
      log('S2', day(8), 80, 10, 2, 'semana_1'),
      log('S3', day(15), 80, 10, 2, 'semana_2'),
    ];
    const m = meta([
      ['X1', 'PLAN-OLD', 'semana_3'],
      ['S2', 'PLAN-A', 'semana_1'],
      ['S3', 'PLAN-A', 'semana_2'],
    ]);
    const r = build(logs, { sessionMeta: m, currentPlanId: 'PLAN-A' }).recommendations['SUPINO RETO'];
    expect(r.action).not.toBe('reduce_load');
  });

  it('5. fase explicitamente incompatível (deload) é rejeitada mesmo sem meta', () => {
    const res = filterComparableSessionHistory({
      logs: [log('S3', day(15), 100, 8, 2, 'semana_3'), log('S4', day(22), 70, 8, 4, 'deload')],
      currentSessionId: 'S-NOW',
      currentPlanId: null,
    });
    expect(res.logs).toHaveLength(1);
    expect(res.logs[0].session_id).toBe('S3');
  });

  it('6. phase/plan null entra só como fallback de baixa confiança', () => {
    const logs = [log('L1', day(1), 80, 12, 2), log('L2', day(8), 80, 12, 1)];
    const res = filterComparableSessionHistory({
      logs,
      currentSessionId: 'S-NOW',
      currentPlanId: 'PLAN-A',
      sessionMeta: {},
    });
    expect(res.legacyFallback).toBe(true);
    const r = build(logs, { currentPlanId: 'PLAN-A' }).recommendations['SUPINO RETO'];
    expect(r.legacyFallback).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.action).not.toBe('reduce_load');
  });

  it('7. duas sessões comparáveis geram tendência normal', () => {
    const logs = [
      log('S1', day(1), 80, 12, 2, 'semana_1'),
      log('S2', day(8), 80, 12, 2, 'semana_2'),
    ];
    const m = meta([['S1', 'PLAN-A', 'semana_1'], ['S2', 'PLAN-A', 'semana_2']]);
    const r = build(logs, { sessionMeta: m, currentPlanId: 'PLAN-A' }).recommendations['SUPINO RETO'];
    expect(r.singlePerformance).toBe(false);
    expect(['increase_load', 'maintain', 'increase_reps']).toContain(r.action);
  });

  it('8. apenas uma sessão válida não inventa tendência', () => {
    const logs = [log('S3', day(15), 80, 12, 2, 'semana_3'), log('S4', day(22), 60, 12, 4, 'deload')];
    const m = meta([['S3', 'PLAN-A', 'semana_3'], ['S4', 'PLAN-A', 'deload']]);
    const r = build(logs, { sessionMeta: m, currentPlanId: 'PLAN-A' }).recommendations['SUPINO RETO'];
    expect(r.singlePerformance).toBe(true);
    expect(r.action).toBe('maintain');
    expect(r.recommendedLoadKg).toBeNull();
    expect(formatSessionHint(r)!.text).toContain('Mantenha 80 kg');
  });

  it('9/14. nenhum histórico gera snapshot VAZIO (mas versionado)', () => {
    const snap = build([], { logs: [] } as any);
    expect(snap.version).toBe(PROGRESSION_SNAPSHOT_VERSION);
    expect(snap.recommendations).toEqual({});
    // Distinguível de sessão antiga sem feature:
    expect(readProgressionSnapshot({ progressionRecommendations: snap })).not.toBeNull();
    expect(readProgressionSnapshot({ sets: {} })).toBeNull();
  });

  it('10/12/13. snapshot vazio congela a ausência de recomendação', () => {
    const empty = build([], { logs: [] } as any);
    const restored = readProgressionSnapshot({ progressionRecommendations: empty })!;
    expect(restored.recommendations).toEqual({});
    // Mesmo com histórico/config novos, o snapshot da sessão não é recalculado.
    const later = build(cycleLogs(), { configuredIncrements: { 'SUPINO RETO': 5 } });
    expect(Object.keys(later.recommendations).length).toBeGreaterThan(0);
    expect(restored.recommendations).toEqual({});
  });

  it('15. histórico >1000 linhas não altera as sessões relevantes', () => {
    const relevant = [
      log('S1', day(20), 80, 12, 2, 'semana_1'),
      log('S2', day(21), 80, 12, 2, 'semana_2'),
    ];
    const noise: SessionLog[] = [];
    for (let i = 0; i < 1400; i += 1) {
      noise.push({ ...log(`OLD-${i}`, day(1), 40, 10, 3, 'semana_1'), exercise_name: 'ROSCA DIRETA' });
    }
    const small = build(relevant).recommendations['SUPINO RETO'];
    const big = build([...noise, ...relevant]).recommendations['SUPINO RETO'];
    expect(big).toEqual(small);
  });

  it('16/17. filtro por nomes do treino atual e exclusão da sessão atual', () => {
    const variants = buildHistoryNameVariants(['Supino Reto', 'Remada Curvada']);
    expect(variants).toContain('SUPINO RETO');
    expect(variants).toContain('REMADA CURVADA');
    // Uma única lista → uma única query (sem N+1).
    expect(new Set(variants).size).toBe(variants.length);

    const logs = [...cycleLogs(), log('S-NOW', day(30), 200, 20, 0, 'semana_1')];
    const res = filterComparableSessionHistory({ logs, currentSessionId: 'S-NOW' });
    expect(res.logs.every((l) => l.session_id !== 'S-NOW')).toBe(true);
  });

  it('18. sessão atual em deload continua sem increase_load', () => {
    const r = build(cycleLogs(), {
      sessionMeta: cycleMeta,
      currentPlanId: 'PLAN-A',
      activePhase: 'deload',
    }).recommendations['SUPINO RETO'];
    expect(r.action).toBe('maintain');
    expect(formatSessionHint(r)!.text).toContain('recuperação');
  });

  it('20. sessão antiga sem snapshot continua backward-compatible', () => {
    expect(readProgressionSnapshot(null)).toBeNull();
    expect(readProgressionSnapshot({ progressionRecommendations: { version: 0, recommendations: {} } })).toBeNull();
  });
});

describe('queries de histórico (lote, ordenação, erro)', () => {
  const mockSupabase = (opts: { logsError?: boolean; incError?: boolean; pages?: number }) => {
    const calls: { table: string; ordered: string[]; ranges: number[][]; filteredByName: boolean }[] = [];
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from(table: string) {
          const entry = { table, ordered: [] as string[], ranges: [] as number[][], filteredByName: false };
          calls.push(entry);
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            neq: () => chain,
            gte: () => chain,
            in: () => {
              entry.filteredByName = true;
              return chain;
            },
            order: (col: string) => {
              entry.ordered.push(col);
              return chain;
            },
            limit: () => Promise.resolve({ data: [], error: null }),
            range: (a: number, b: number) => {
              entry.ranges.push([a, b]);
              return Promise.resolve({
                data: [],
                error: opts.logsError ? { message: 'network' } : null,
              });
            },
            then: (res: any) =>
              Promise.resolve({
                data: [],
                error: opts.incError && table === 'student_load_increments' ? { message: 'x' } : null,
              }).then(res),
          };
          return chain;
        },
      },
    }));
    return calls;
  };

  it('14b/16b. histórico usa ordenação cronológica explícita, filtro por nome e lote', async () => {
    vi.resetModules();
    const calls = mockSupabase({});
    const { renderHook, waitFor } = await import('@testing-library/react');
    const { useSessionProgression } = await import('@/hooks/useSessionProgression');

    const { result } = renderHook(() =>
      useSessionProgression({
        studentId: 'aluno-1',
        sessionId: 'S-NOW',
        exercises: [ex('Supino Reto'), ex('Remada Curvada')],
        phase: 'semana_1',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const logCalls = calls.filter((c) => c.table === 'exercise_set_logs');
    expect(logCalls).toHaveLength(1); // 2 exercícios → 1 query (zero N+1)
    expect(logCalls[0].ordered[0]).toBe('performed_at');
    expect(logCalls[0].filteredByName).toBe(true);
    expect(calls.filter((c) => c.table === 'student_load_increments')).toHaveLength(1);
    // Snapshot vazio é gravado como snapshot.
    expect(result.current.snapshot?.recommendations).toEqual({});
    vi.doUnmock('@/integrations/supabase/client');
    vi.resetModules();
  });

  it('11. erro de query NÃO grava snapshot vazio', async () => {
    vi.resetModules();
    mockSupabase({ logsError: true });
    const { renderHook, waitFor } = await import('@testing-library/react');
    const { useSessionProgression } = await import('@/hooks/useSessionProgression');

    const { result } = renderHook(() =>
      useSessionProgression({
        studentId: 'aluno-1',
        sessionId: 'S-NOW',
        exercises: [ex('Supino Reto')],
        phase: 'semana_1',
      }),
    );

    await waitFor(() => expect(result.current.status).toBe('load_error'));
    expect(result.current.snapshot).toBeNull();
    vi.doUnmock('@/integrations/supabase/client');
    vi.resetModules();
  });
});
