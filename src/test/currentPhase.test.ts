import { describe, it, expect } from 'vitest';
import {
  resolveCurrentTrainingPhase,
  resolveCurrentTrainingPhaseFromPlans,
} from '@/lib/currentPhase';
import { PHASE_DURATION_DAYS } from '@/lib/weekContext';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('resolveCurrentTrainingPhase — fonte única de verdade', () => {
  it('usa a timeline semanal quando fase_inicio_data existe', () => {
    const plan = { id: 'p1', fase: 'semana_1', fase_inicio_data: '2026-01-05' };
    expect(resolveCurrentTrainingPhase(plan, at('2026-01-05')).phase).toBe('semana_1');
    expect(resolveCurrentTrainingPhase(plan, at('2026-01-12')).phase).toBe('semana_2');
    expect(resolveCurrentTrainingPhase(plan, at('2026-01-19')).phase).toBe('semana_3');
    expect(resolveCurrentTrainingPhase(plan, at('2026-01-26')).phase).toBe('deload');
    // Ciclo reinicia em S1
    expect(resolveCurrentTrainingPhase(plan, at('2026-02-02')).phase).toBe('semana_1');
  });

  it('a timeline ignora plan.fase divergente (timeline vence)', () => {
    const plan = { id: 'p1', fase: 'deload', fase_inicio_data: '2026-01-05' };
    const r = resolveCurrentTrainingPhase(plan, at('2026-01-12'));
    expect(r.phase).toBe('semana_2');
    expect(r.source).toBe('timeline');
  });

  it('cai para plan.fase quando não há fase_inicio_data (legado)', () => {
    const r = resolveCurrentTrainingPhase({ id: 'p', fase: 'semana_3', fase_inicio_data: null }, at('2026-03-01'));
    expect(r.phase).toBe('semana_3');
    expect(r.source).toBe('plan_column');
  });

  it('cai para semana_1 quando não há nada', () => {
    const r = resolveCurrentTrainingPhase(null, at('2026-03-01'));
    expect(r.phase).toBe('semana_1');
    expect(r.source).toBe('default');
  });

  it('cycle_days (duração do ciclo) NÃO altera a duração da fase (7 dias)', () => {
    expect(PHASE_DURATION_DAYS).toBe(7);
    const a = { id: 'a', fase: null, fase_inicio_data: '2026-01-05', cycle_days: 45 };
    const b = { id: 'b', fase: null, fase_inicio_data: '2026-01-05', cycle_days: 10 };
    expect(resolveCurrentTrainingPhase(a, at('2026-01-12')).phase).toBe('semana_2');
    expect(resolveCurrentTrainingPhase(b, at('2026-01-12')).phase).toBe('semana_2');
  });

  it('datas futuras não geram fase negativa', () => {
    const r = resolveCurrentTrainingPhase({ fase_inicio_data: '2026-06-01' }, at('2026-05-01'));
    expect(r.phase).toBe('semana_1');
  });
});

describe('identidade de fase entre aluno, admin e lote', () => {
  const plans = [
    { id: 'p1', fase: 'semana_1', fase_inicio_data: '2026-01-05', cycle_days: 45 },
    { id: 'p2', fase: 'semana_2', fase_inicio_data: '2026-01-05', cycle_days: 45 },
    { id: 'p3', fase: 'deload', fase_inicio_data: '2026-01-05', cycle_days: 45 },
  ];
  const now = at('2026-01-21'); // 16 dias => semana_3

  it('aluno (lista de planos) e admin/lote (plano isolado) chegam à mesma fase', () => {
    const aluno = resolveCurrentTrainingPhaseFromPlans(plans, now).phase;
    const admin = resolveCurrentTrainingPhase(plans[2], now).phase; // plan.fase = deload
    const lote = resolveCurrentTrainingPhase(plans[0], now).phase;
    expect(aluno).toBe('semana_3');
    expect(admin).toBe('semana_3');
    expect(lote).toBe('semana_3');
    expect(new Set([aluno, admin, lote]).size).toBe(1);
  });

  it('sem timeline em nenhum plano, todos usam o mesmo fallback de coluna', () => {
    const legacy = [{ id: 'x', fase: 'semana_2', fase_inicio_data: null }];
    expect(resolveCurrentTrainingPhaseFromPlans(legacy, now).phase).toBe('semana_2');
    expect(resolveCurrentTrainingPhase(legacy[0], now).phase).toBe('semana_2');
  });

  it('prefere o plano que possui timeline mesmo que não seja o primeiro', () => {
    const mixed = [
      { id: 'a', fase: 'deload', fase_inicio_data: null },
      { id: 'b', fase: 'semana_1', fase_inicio_data: '2026-01-05' },
    ];
    const r = resolveCurrentTrainingPhaseFromPlans(mixed, now);
    expect(r.source).toBe('timeline');
    expect(r.phase).toBe('semana_3');
  });
});
