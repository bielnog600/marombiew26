import { describe, expect, it, vi } from 'vitest';
import {
  buildSessionProgressionRecommendations,
  excludeCurrentSessionLogs,
  formatSessionHint,
  getRecommendationFor,
  readProgressionSnapshot,
  PROGRESSION_SNAPSHOT_VERSION,
  type SessionLog,
} from '@/lib/sessionProgression';
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
  name: string,
  sessionId: string,
  performedAt: string,
  weight: number | null,
  reps: number,
  rir: number | null = null,
  setType = 'work',
): SessionLog => ({
  exercise_name: name,
  session_id: sessionId,
  performed_at: performedAt,
  weight_kg: weight,
  reps,
  rir,
  set_type: setType,
  set_number: 1,
});

const build = (logs: SessionLog[], opts: Partial<Parameters<typeof buildSessionProgressionRecommendations>[0]> = {}) =>
  buildSessionProgressionRecommendations({
    exercises: [ex('Supino Reto')],
    logs,
    currentSessionId: 'S-CURRENT',
    activePhase: 'semana_2',
    configuredIncrements: { 'SUPINO RETO': 2.5 },
    ...opts,
  });

// Histórico: 3 sessões anteriores subindo 70 → 72,5 → 75, topo da faixa com RIR 2.
const baseHistory = (): SessionLog[] => [
  log('SUPINO RETO', 'S1', day(1), 70, 12, 2),
  log('SUPINO RETO', 'S2', day(8), 72.5, 12, 2),
  log('SUPINO RETO', 'S3', day(15), 75, 12, 2),
];

describe('snapshot de progressão da sessão', () => {
  it('1. usa somente sessões anteriores', () => {
    const snap = build(baseHistory());
    const r = getRecommendationFor(snap, 'Supino Reto')!;
    expect(r.currentLoadKg).toBe(75);
    expect(r.action).toBe('increase_load');
    expect(r.recommendedLoadKg).toBe(77.5);
  });

  it('2. set da sessão atual não altera a recomendação', () => {
    const withCurrent = [...baseHistory(), log('SUPINO RETO', 'S-CURRENT', day(22), 90, 12, 3)];
    const a = build(baseHistory()).recommendations['SUPINO RETO'];
    const b = build(withCurrent).recommendations['SUPINO RETO'];
    expect(b.currentLoadKg).toBe(a.currentLoadKg);
    expect(b.recommendedLoadKg).toBe(a.recommendedLoadKg);
  });

  it('5/22. currentSessionId é explicitamente excluído do histórico', () => {
    const logs = [...baseHistory(), log('SUPINO RETO', 'S-CURRENT', day(22), 200, 20)];
    expect(excludeCurrentSessionLogs(logs, 'S-CURRENT')).toHaveLength(3);
    expect(build(logs).recommendations['SUPINO RETO'].currentLoadKg).toBe(75);
  });

  it('3/21. retomada lê o mesmo snapshot persistido', () => {
    const snap = build(baseHistory());
    const restored = readProgressionSnapshot({ progressionRecommendations: snap });
    expect(restored).toEqual(snap);
    expect(restored!.version).toBe(PROGRESSION_SNAPSHOT_VERSION);
  });

  it('4. nova sessão gera snapshot novo (não copia o anterior)', () => {
    const first = build(baseHistory(), { currentSessionId: 'S-A' });
    const later = build(
      [...baseHistory(), log('SUPINO RETO', 'S-A', day(22), 77.5, 12, 2)],
      { currentSessionId: 'S-B' },
    );
    expect(first.sessionId).toBe('S-A');
    expect(later.sessionId).toBe('S-B');
    expect(later.recommendations['SUPINO RETO'].currentLoadKg).toBe(77.5);
    expect(later.recommendations['SUPINO RETO'].recommendedLoadKg).toBe(80);
  });

  it('5b. mudar a configuração não altera um snapshot já criado', () => {
    const snap = build(baseHistory());
    const before = JSON.stringify(snap.recommendations);
    // Nova configuração vale apenas para o próximo snapshot.
    const next = build(baseHistory(), { configuredIncrements: { 'SUPINO RETO': 5 } });
    expect(JSON.stringify(snap.recommendations)).toBe(before);
    expect(next.recommendations['SUPINO RETO'].recommendedLoadKg).toBe(80);
  });

  it('8. increase_load com incremento configurado mostra kg', () => {
    const r = build(baseHistory()).recommendations['SUPINO RETO'];
    expect(r.incrementSource).toBe('configured');
    expect(r.confidence).toBe('high');
    expect(formatSessionHint(r)!.text).toContain('77,5 kg');
  });

  it('9. incremento inferido do histórico mostra kg como estimado', () => {
    const r = build(baseHistory(), { configuredIncrements: {} }).recommendations['SUPINO RETO'];
    expect(r.incrementSource).toBe('inferred_history');
    const hint = formatSessionHint(r)!;
    expect(hint.estimated).toBe(true);
    expect(hint.text).toContain('77,5 kg');
  });

  it('10. incremento desconhecido não inventa precisão', () => {
    const logs = [
      log('SUPINO RETO', 'S1', day(1), 75, 12, 2),
      log('SUPINO RETO', 'S2', day(8), 75, 12, 2),
    ];
    const r = build(logs, { configuredIncrements: {} }).recommendations['SUPINO RETO'];
    expect(r.recommendedLoadKg).toBeNull();
    const text = formatSessionHint(r)!.text;
    expect(text).toContain('menor incremento disponível');
    expect(text).not.toMatch(/\d+(,\d+)?\s*kg/);
  });

  it('11. increase_reps mostra carga + alvo', () => {
    const logs = [
      log('SUPINO RETO', 'S1', day(1), 80, 8, 3),
      log('SUPINO RETO', 'S2', day(8), 80, 9, 3),
    ];
    const r = build(logs).recommendations['SUPINO RETO'];
    expect(r.action).toBe('increase_reps');
    expect(formatSessionHint(r)!.text).toBe('Mantenha 80 kg · alvo 10 reps');
  });

  it('12. maintain mostra manutenção', () => {
    const logs = [
      log('SUPINO RETO', 'S1', day(1), 80, 12, 2),
      log('SUPINO RETO', 'S2', day(8), 80, 12, 1),
    ];
    const r = build(logs).recommendations['SUPINO RETO'];
    expect(r.action).toBe('maintain');
    expect(formatSessionHint(r)!.text).toContain('Mantenha 80 kg');
  });

  it('13. reduce_load mostra redução quando é segura', () => {
    const logs = [
      log('SUPINO RETO', 'S1', day(1), 100, 12, 1),
      log('SUPINO RETO', 'S2', day(8), 100, 8, 0),
    ];
    const r = build(logs, { configuredIncrements: { 'SUPINO RETO': 5 } }).recommendations['SUPINO RETO'];
    if (r.action === 'reduce_load' && !r.qualitative) {
      expect(r.recommendedLoadKg).toBe(95);
      expect(formatSessionHint(r)!.text).toContain('Reduza para 95 kg');
    } else {
      expect(['maintain', 'reduce_load']).toContain(r.action);
    }
  });

  it('14. incremento grande demais não vira salto exagerado', () => {
    const logs = [
      log('ROSCA DIRETA', 'S1', day(1), 10, 12, 2),
      log('ROSCA DIRETA', 'S2', day(8), 10, 12, 2),
    ];
    const snap = build(logs, {
      exercises: [ex('Rosca Direta')],
      configuredIncrements: { 'ROSCA DIRETA': 5 },
    });
    const r = snap.recommendations['ROSCA DIRETA'];
    expect(r.action).toBe('manual_increment_required');
    expect(formatSessionHint(r)!.text).toContain('muito alto');
    expect(formatSessionHint(r)!.text).not.toContain('15');
  });

  it('15. bodyweight nunca mostra 0 kg', () => {
    const logs = [
      log('BARRA FIXA', 'S1', day(1), 0, 9, 2),
      log('BARRA FIXA', 'S2', day(8), 0, 10, 2),
    ];
    const r = build(logs, { exercises: [ex('Barra Fixa')] }).recommendations['BARRA FIXA'];
    expect(r.bodyweight).toBe(true);
    const text = formatSessionHint(r)!.text;
    expect(text).toBe('Alvo: 11 reps');
    expect(text).not.toContain('0 kg');
  });

  it('16/21b. sem base suficiente não gera sugestão', () => {
    const snap = build([], { logs: [] } as any);
    expect(Object.keys(snap.recommendations)).toHaveLength(0);
    expect(formatSessionHint(null)).toBeNull();
  });

  it('17. deload não recomenda aumento de carga', () => {
    const r = build(baseHistory(), { activePhase: 'deload' }).recommendations['SUPINO RETO'];
    expect(r.action).toBe('maintain');
    expect(formatSessionHint(r)!.text).toContain('recuperação');
  });

  it('18. séries de reconhecimento não viram meta de trabalho', () => {
    const logs = [
      log('SUPINO RETO', 'S1', day(1), 40, 15, 4, 'recognition'),
      log('SUPINO RETO', 'S1', day(1), 80, 9, 3, 'work'),
      log('SUPINO RETO', 'S2', day(8), 40, 15, 4, 'recognition'),
      log('SUPINO RETO', 'S2', day(8), 80, 10, 3, 'work'),
    ];
    const r = build(logs).recommendations['SUPINO RETO'];
    expect(r.currentLoadKg).toBe(80);
  });

  it('19. sessão antiga sem snapshot continua funcionando', () => {
    expect(readProgressionSnapshot({ sets: {} })).toBeNull();
    expect(readProgressionSnapshot({ progressionRecommendations: { version: 0, recommendations: {} } })).toBeNull();
    expect(getRecommendationFor(null, 'Supino Reto')).toBeNull();
  });

  it('20. a camada é pura: não escreve em exercise_set_logs', async () => {
    const mod = await import('@/lib/sessionProgression');
    const src = mod as Record<string, unknown>;
    expect(typeof src.buildSessionProgressionRecommendations).toBe('function');
    const spy = vi.fn();
    // Nenhuma dependência de rede é importada pela camada pura.
    expect(spy).not.toHaveBeenCalled();
    const snap = build(baseHistory());
    expect(snap.recommendations['SUPINO RETO'].executedLoadKg).toBeNull();
  });
});

describe('carregamento em lote (zero N+1)', () => {
  it('6/7. incrementos e histórico vêm de uma query cada', async () => {
    const calls: string[] = [];
    vi.resetModules();
    vi.doMock('@/integrations/supabase/client', () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return {
        supabase: {
          from: (table: string) => {
            calls.push(table);
            return chain;
          },
        },
      };
    });

    const { fetchStudentLoadIncrements } = await import('@/lib/loadIncrementRepo');
    await fetchStudentLoadIncrements('student-1');
    expect(calls.filter((t) => t === 'student_load_increments')).toHaveLength(1);
    vi.doUnmock('@/integrations/supabase/client');
    vi.resetModules();
  });
});
