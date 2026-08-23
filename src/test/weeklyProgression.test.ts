import { describe, it, expect } from 'vitest';
import {
  buildExercisePerformance,
  buildProgressionReport,
  estimate1RM,
  parseRepRange,
  selectBestSet,
  type ExerciseLog,
} from '@/lib/weeklyProgression';

const log = (
  weight: number | null,
  reps: number | null,
  extra: Partial<ExerciseLog> = {},
): ExerciseLog => ({
  exercise_name: extra.exercise_name ?? 'SUPINO RETO',
  weight_kg: weight,
  reps,
  performed_at: extra.performed_at ?? '2026-08-18T10:00:00Z',
  set_number: extra.set_number ?? 1,
  rir: extra.rir ?? null,
  rpe: extra.rpe ?? null,
});

const perf = (
  current: ExerciseLog[],
  previous: ExerciseLog[],
  range?: { min: number; max: number } | null,
) => buildExercisePerformance('SUPINO RETO', current, previous, range ?? null);

describe('seleção do melhor set (nunca combina max weight com max reps)', () => {
  it('escolhe um set REAL — 105x6 e 90x12 nunca viram 105x12', () => {
    const best = selectBestSet([log(105, 6), log(90, 12, { set_number: 2 })]);
    expect(best).toBeTruthy();
    // 105*(1+6/30)=126 ; 90*(1+12/30)=126 -> empate no e1RM, desempate por carga
    expect(best!.weightKg).toBe(105);
    expect(best!.reps).toBe(6);
    expect([best!.weightKg, best!.reps]).not.toEqual([105, 12]);
  });

  it('bodyweight: melhor set é o de mais repetições', () => {
    const best = selectBestSet([log(0, 8), log(null, 14, { set_number: 2 })]);
    expect(best!.reps).toBe(14);
    expect(best!.weightKg).toBe(0);
    expect(best!.estimated1RM).toBeNull();
  });

  it('e1RM só com carga externa e reps 1..15', () => {
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
    expect(estimate1RM(0, 10)).toBeNull();
    expect(estimate1RM(100, 20)).toBeNull();
    expect(estimate1RM(100, 0)).toBeNull();
  });
});

describe('classificação de performance', () => {
  it('Caso A — mesma carga, mais reps => improved', () => {
    expect(perf([log(80, 10)], [log(80, 8)]).status).toBe('improved');
  });

  it('Caso B — mais carga, mesmas reps => improved', () => {
    expect(perf([log(82.5, 10)], [log(80, 10)]).status).toBe('improved');
  });

  it('Caso C — mais carga com queda grande de reps NÃO é improved', () => {
    const p = perf([log(82.5, 6)], [log(80, 10)]);
    expect(p.status).not.toBe('improved');
    expect(p.status).toBe('regressed');
  });

  it('Caso D — mesma carga e reps => stable', () => {
    expect(perf([log(80, 10)], [log(80, 10)]).status).toBe('stable');
  });

  it('Caso E — menos carga e menos reps => regressed', () => {
    expect(perf([log(75, 8)], [log(80, 10)]).status).toBe('regressed');
  });

  it('oscilação pequena (100x10 -> 100x9) é stable, não regressão', () => {
    expect(perf([log(100, 9)], [log(100, 10)]).status).toBe('stable');
  });

  it('RIR melhor com mesma carga/reps => improved', () => {
    const p = perf([log(80, 10, { rir: 3 })], [log(80, 10, { rir: 1 })]);
    expect(p.status).toBe('improved');
    expect(p.rirDelta).toBe(2);
  });

  it('RIR pior com mesma carga/reps não é progresso', () => {
    const p = perf([log(80, 10, { rir: 0 })], [log(80, 10, { rir: 3 })]);
    expect(p.status).toBe('regressed');
  });

  it('RIR derivado de rpe (10 - rpe) quando rir ausente', () => {
    const p = perf([log(80, 10, { rpe: 7 })], [log(80, 10, { rpe: 9 })]);
    expect(p.bestSet!.rir).toBe(3);
    expect(p.status).toBe('improved');
  });

  it('bodyweight com mais reps => improved (sem e1RM)', () => {
    const p = perf([log(0, 12)], [log(0, 10)]);
    expect(p.status).toBe('improved');
    expect(p.bestSet!.estimated1RM).toBeNull();
    expect(p.loaded).toBe(false);
  });

  it('sem semana anterior => insufficient_data', () => {
    expect(perf([log(80, 10)], []).status).toBe('insufficient_data');
  });

  it('sem registro atual => missing', () => {
    expect(perf([], [log(80, 10)]).status).toBe('missing');
  });
});

describe('nextAction (double progression)', () => {
  const range = { min: 8, max: 12 };

  it('dentro da faixa, abaixo do topo => increase_reps', () => {
    expect(perf([log(70, 9)], [log(70, 8)], range).nextAction).toBe('increase_reps');
  });

  it('topo da faixa com RIR 2 => increase_load', () => {
    expect(perf([log(70, 12, { rir: 2 })], [log(70, 10, { rir: 2 })], range).nextAction).toBe('increase_load');
  });

  it('topo da faixa com RIR 0 => não aumenta carga automaticamente', () => {
    const p = perf([log(70, 12, { rir: 0 })], [log(70, 10, { rir: 0 })], range);
    expect(p.nextAction).toBe('maintain');
  });

  it('topo da faixa sem RIR registrado pela 1a vez => maintain (política conservadora)', () => {
    expect(perf([log(70, 12)], [log(70, 10)], range).nextAction).toBe('maintain');
  });

  it('abaixo da faixa nunca manda subir carga', () => {
    const p = perf([log(70, 6)], [log(70, 8)], range);
    expect(['maintain', 'reduce_load']).toContain(p.nextAction);
    expect(p.nextAction).not.toBe('increase_load');
  });

  it('regressão forte => reduce_load', () => {
    expect(perf([log(60, 8)], [log(80, 10)], range).nextAction).toBe('reduce_load');
  });

  it('sem faixa prescrita só sobe carga com folga de RIR', () => {
    expect(perf([log(70, 10)], [log(70, 10)]).nextAction).toBe('maintain');
    expect(perf([log(70, 10, { rir: 3 })], [log(70, 10, { rir: 3 })]).nextAction).toBe('increase_load');
  });

  it('faixa de reps parseada do plano', () => {
    expect(parseRepRange('8-12')).toEqual({ min: 8, max: 12 });
    expect(parseRepRange('8 a 12')).toEqual({ min: 8, max: 12 });
    expect(parseRepRange('10')).toEqual({ min: 10, max: 10 });
    expect(parseRepRange('')).toBeNull();
  });
});

describe('relatório semanal', () => {
  const planned = [
    {
      day: 'A',
      exercises: [
        { exercise: 'SUPINO RETO', series: '3', series2: '', reps: '8-12', rir: '2', pause: '', description: '', variation: '' },
        { exercise: 'REMADA CURVADA', series: '3', series2: '', reps: '8-12', rir: '2', pause: '', description: '', variation: '' },
        { exercise: 'MOBILIDADE DE OMBRO', series: '1', series2: '', reps: '10', rir: '', pause: '', description: '', variation: '' },
      ],
    },
  ] as any;

  it('missing só para planejado sem registro e sem contar mobilidade', () => {
    const last = [log(80, 10)];
    const prev = [log(80, 8)];
    const r = buildProgressionReport(last, prev, planned);
    expect(r.missing).toEqual(['REMADA CURVADA']);
    expect(r.improved.map((d) => d.exercise)).toEqual(['SUPINO RETO']);
    expect(r.hasProgress).toBe(true);
    const missingPerf = r.performances.find((p) => p.exerciseName === 'REMADA CURVADA');
    expect(missingPerf?.status).toBe('missing');
    expect(missingPerf?.nextAction).toBe('review');
  });

  it('deltas legados vêm do mesmo set real (nunca máximos combinados)', () => {
    const last = [log(105, 6), log(90, 12, { set_number: 2 })];
    const prev = [log(100, 6), log(85, 12, { set_number: 2 })];
    const r = buildProgressionReport(last, prev, []);
    const d = [...r.improved, ...r.regressed][0];
    expect(d.lastWeight).toBe(105);
    expect(d.lastReps).toBe(6);
    expect(d.prevWeight).toBe(100);
    expect(d.prevReps).toBe(6);
  });

  it('volume total é auxiliar e não define status', () => {
    // 4x80x10 (3200 kg) tem mais tonelagem que 3x100x10 (3000 kg), mas o
    // melhor set piorou => regressed.
    const last = Array.from({ length: 4 }, (_, i) => log(80, 10, { set_number: i + 1 }));
    const prev = Array.from({ length: 3 }, (_, i) => log(100, 10, { set_number: i + 1 }));
    const p = buildExercisePerformance('SUPINO RETO', last, prev, null);
    expect(p.totalVolume).toBe(3200);
    expect(p.status).toBe('regressed');
  });
});

// ============================================================
// Tipos de série (set_type) e RIR opcional
// ============================================================

const tlog = (
  weight: number | null,
  reps: number | null,
  set_type: string | null,
  extra: Partial<ExerciseLog> = {},
): ExerciseLog => ({ ...log(weight, reps, extra), set_type });

describe('selectBestSet respeita o tipo estrutural da série', () => {
  it('working set representa a performance mesmo quando o aquecimento é registrado', () => {
    const best = selectBestSet([
      tlog(40, 20, 'warmup', { set_number: 1 }),
      tlog(80, 10, 'work', { set_number: 2 }),
    ]);
    expect(best!.weightKg).toBe(80);
    expect(best!.reps).toBe(10);
  });

  it('série de reconhecimento não substitui a série de trabalho', () => {
    const best = selectBestSet([
      tlog(100, 12, 'recognition', { set_number: 1 }),
      tlog(90, 8, 'work', { set_number: 2 }),
    ]);
    expect(best!.weightKg).toBe(90);
  });

  it('drop-set com e1RM maior não vira bestSet quando existe working set', () => {
    const best = selectBestSet([
      tlog(80, 8, 'work', { set_number: 1 }),
      tlog(60, 25, 'drop', { set_number: 2 }),
    ]);
    expect(best!.weightKg).toBe(80);
    expect(best!.reps).toBe(8);
  });

  it('rest-pause/myo-reps só entram quando não há nenhuma série principal', () => {
    const best = selectBestSet([tlog(70, 15, 'rest_pause', { set_number: 1 })]);
    expect(best!.weightKg).toBe(70);
  });

  it('múltiplos working sets: escolhe o de maior e1RM (set real)', () => {
    const best = selectBestSet([
      tlog(80, 8, 'work', { set_number: 1 }),
      tlog(85, 8, 'work', { set_number: 2 }),
      tlog(80, 10, 'work', { set_number: 3 }),
    ]);
    expect(best!.weightKg).toBe(85);
    expect(best!.reps).toBe(8);
  });

  it('sem set_type (legado) trata tudo como working set — fallback documentado', () => {
    const best = selectBestSet([log(80, 8), log(85, 8, { set_number: 2 })]);
    expect(best!.weightKg).toBe(85);
  });
});

describe('técnicas não são perdidas nas métricas auxiliares', () => {
  it('drop-set conta em volume/reps mas não determina o bestSet nem gera falso progresso', () => {
    const p = perf(
      [tlog(80, 8, 'work', { set_number: 1 }), tlog(60, 25, 'drop', { set_number: 2 })],
      [tlog(80, 8, 'work', { set_number: 1 })],
    );
    expect(p.bestSet!.weightKg).toBe(80);
    expect(p.auxiliarySets).toBe(1);
    expect(p.totalWorkingSets).toBe(2);
    expect(p.totalReps).toBe(33);
    expect(p.status).toBe('stable');
  });

  it('aquecimento não conta como série de trabalho', () => {
    const p = perf(
      [tlog(40, 20, 'warmup', { set_number: 1 }), tlog(80, 8, 'work', { set_number: 2 })],
      [tlog(80, 8, 'work', { set_number: 1 })],
    );
    expect(p.preparationSets).toBe(1);
    expect(p.totalWorkingSets).toBe(1);
  });

  it('marca a base de comparação como like_for_like quando ambas as janelas têm tipos', () => {
    const p = perf([tlog(80, 8, 'work')], [tlog(78, 8, 'work')]);
    expect(p.comparisonBasis).toBe('like_for_like');
  });

  it('marca fallback_untyped quando a semana anterior é legado sem tipos', () => {
    const p = perf([tlog(80, 8, 'work')], [log(78, 8)]);
    expect(p.comparisonBasis).toBe('fallback_untyped');
  });
});

describe('RIR é opcional e nunca bloqueia o cálculo', () => {
  it('calcula performance apenas com peso + reps (rir null)', () => {
    const p = perf([tlog(85, 8, 'work')], [tlog(80, 8, 'work')]);
    expect(p.status).toBe('improved');
    expect(p.bestSet!.rir).toBeNull();
  });

  it('usa RIR quando presente sem exigir nas duas séries', () => {
    const p = perf([tlog(80, 10, 'work', { rir: 3 })], [tlog(80, 10, 'work', { rir: 0 })]);
    expect(p.rirDelta).toBe(3);
    expect(p.status).toBe('improved');
  });
});

describe('double progression no topo da faixa', () => {
  const range = { min: 8, max: 12 };

  it('topo da faixa com RIR >= 2 => increase_load', () => {
    const p = perf([tlog(70, 12, 'work', { rir: 2 })], [tlog(70, 10, 'work', { rir: 1 })], range);
    expect(p.nextAction).toBe('increase_load');
  });

  it('topo da faixa com RIR 0-1 => maintain', () => {
    const p = perf([tlog(70, 12, 'work', { rir: 1 })], [tlog(70, 10, 'work', { rir: 1 })], range);
    expect(p.nextAction).toBe('maintain');
  });

  it('topo da faixa SEM RIR pela primeira vez => maintain (confirmar performance)', () => {
    const p = perf([tlog(70, 12, 'work')], [tlog(70, 9, 'work')], range);
    expect(p.bestSet!.rir).toBeNull();
    expect(p.nextAction).toBe('maintain');
  });

  it('topo da faixa SEM RIR repetido em semanas comparáveis => increase_load', () => {
    const p = perf([tlog(70, 12, 'work')], [tlog(70, 12, 'work')], range);
    expect(p.nextAction).toBe('increase_load');
  });
});
