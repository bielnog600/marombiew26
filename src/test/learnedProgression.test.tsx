import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { inferIncrementFromTransitions } from '@/lib/loadIncrement';
import { buildQuantitativeProgressionRecommendation as build } from '@/lib/quantitativeProgression';
import { buildExercisePerformance, withPlannedSetTypes, lastExerciseSessions, type ExerciseLog } from '@/lib/weeklyProgression';
import { buildPrescribedWorkSets, buildSessionProgressionRecommendations } from '@/lib/sessionProgression';
import { finalWorkingSetIndex, optionalRirValue } from '@/lib/finalWorkingSetRir';
import { FinalSetRir } from '@/components/training/FinalSetRir';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const now = new Date('2026-10-29T12:00:00Z');
const ex = (name = 'CADEIRA FLEXORA', reps = '12-15', series = '3'): ParsedExercise => ({ exercise: name, reps, series, series2: '', rir: '2', pause: '60', description: '', variation: '' });
const logs = (weights: number[], reps: number[], session = 'today', date = '2026-10-29'): ExerciseLog[] => weights.map((w, i) => ({ exercise_name: 'CADEIRA FLEXORA', weight_kg: w, reps: reps[i], performed_at: `${date}T10:00:00Z`, session_id: session, set_number: i + 1, set_type: 'work', rir: i === weights.length - 1 ? 2 : null }));
const recommend = (exercise: ParsedExercise, current: ExerciseLog[], previous: ExerciseLog[] = [], extras = {}) => build({ performance: buildExercisePerformance(exercise.exercise, current, previous, { min: 12, max: 15 }), recentLogs: current, previousLogs: previous, historyLogs: [...previous, ...current], prescribedSets: buildPrescribedWorkSets(exercise), now, ...extras });

describe('regras solicitadas de progressão', () => {
  it('Suzane: Flexora 50→60 aprende 10 kg sem inventar 52,5', () => {
    const history = [...logs([50], [15], 'old', '2026-10-26'), ...logs([60], [15])];
    expect(inferIncrementFromTransitions(history, now).incrementKg).toBe(10);
    const r = recommend(ex(), logs([50,50,50], [15,15,15]), logs([60,60,60], [15,15,15], 'old', '2026-10-26'));
    expect(r.recommendedLoadKg).toBe(50);
    expect(r.targetReps).toBe(16);
  });
  it('Flexora só sobe o degrau >10% depois de superar topo em todas as séries', () => {
    const r = recommend(ex(), logs([50,50,50], [16,16,16]), logs([60,60,60], [15,15,15], 'old', '2026-10-26'));
    expect(r.recommendedLoadKg).toBe(60);
    expect(r.targetReps).toBe(12);
  });
  it('degrau recente por aluno: halteres 12/14/16 aprende 2 kg', () => {
    expect(inferIncrementFromTransitions(logs([12,14,16], [12,12,12]), now).incrementKg).toBe(2);
    expect(inferIncrementFromTransitions(logs([50,60], [12,12]), now).incrementKg).toBe(10);
  });
  it('academia nova: 60 dias recentes substituem degrau antigo', () => {
    const h = [...logs([12,14,16], [10,10,10], 'old', '2026-07-01'), ...logs([20,25], [10,10], 'new', '2026-10-28')];
    expect(inferIncrementFromTransitions(h, now).incrementKg).toBe(5);
  });
  it('uma carga recente não ressuscita degrau da academia antiga', () => {
    const h = [...logs([12,14,16], [10,10,10], 'old', '2026-07-01'), ...logs([20], [10], 'new', '2026-10-28')];
    expect(inferIncrementFromTransitions(h, now).incrementKg).toBeNull();
  });
  it('sem histórico não sugere kg', () => {
    const r = buildSessionProgressionRecommendations({ exercises: [ex()], logs: [], currentSessionId: 'new' }).recommendations['CADEIRA FLEXORA'];
    expect(r.recommendedLoadKg).toBeNull();
    expect(r.action).toBe('review');
  });
  it('Búlgaro 10×10→10×12 compara com sessão anterior e busca reps', () => {
    const r = recommend(ex('BÚLGARO', '10-15'), logs([10,10,10], [12,12,12]), logs([10,10,10], [10,10,10], 'old', '2026-10-01'));
    expect(r.currentLoadKg).toBe(10);
    expect(r.targetReps).toBe(13);
    expect(r.action).toBe('increase_reps');
  });
  it('RIR da última série 1 mantém apesar de RIR 3 na primeira', () => {
    const current = logs([20,20,20], [12,12,12]).map((s,i) => ({ ...s, rir: i === 2 ? 1 : 3 }));
    const r = recommend(ex('SUPINO', '8-12'), current, logs([18,18,18], [12,12,12], 'old', '2026-10-26'));
    expect(r.action).toBe('maintain'); expect(r.recommendedLoadKg).toBe(20);
  });
  it('topo+RIR final 2 sobe carga aprendida até 10%', () => {
    const r = recommend(ex('SUPINO', '8-12'), logs([20,20,20], [12,12,12]), logs([18,18,18], [12,12,12], 'old', '2026-10-26'));
    expect(r.recommendedLoadKg).toBe(22);
  });
  it.each(['semana_2','semana_3'] as const)('%s permite aumentar com critérios', phase => {
    expect(recommend(ex('SUPINO','8-12'), logs([20,20,20],[12,12,12]), logs([18,18,18],[12,12,12],'old','2026-10-26'), { activePhase: phase }).recommendedLoadKg).toBe(22);
  });
  it('deload nunca sobe', () => {
    expect(recommend(ex('SUPINO','8-12'), logs([20,20,20],[12,12,12]), logs([18,18,18],[12,12,12],'old','2026-10-26'), { activePhase: 'deload' }).action).toBe('maintain');
  });
  it('pirâmide 12/10/8 preserva carga e meta de cada série', () => {
    const r = recommend(ex('SUPINO','12/10/8'), logs([20,22,24],[11,9,7]));
    expect(r.seriesTargets?.map(s => [s.recommendedLoadKg,s.targetReps])).toEqual([[20,12],[22,10],[24,8]]);
  });
  it('reconhecimento 12 + 8-12 é ignorado, inclusive legado', () => {
    const e = { ...ex('SUPINO','12 + 8-12','1'), series2: '2' };
    const c = withPlannedSetTypes(logs([5,20,20],[12,11,11]).map(s => ({ ...s, set_type: null })), e);
    const r = recommend(e,c);
    expect(r.seriesTargets?.map(s => s.setNumber)).toEqual([2,3]);
    expect(r.targetReps).toBe(12);
  });
  it('drop/rest-pause: principal decide, partes só entram no volume', () => {
    const c = logs([60],[12]).map(s => ({ ...s, sub_records: [{ weight: '60', reps: '12', completed: true }, { weight: '45', reps: '15', completed: true }] }));
    const p = buildExercisePerformance('FLEXORA',c,[],{min:8,max:12});
    expect(p.totalVolume).toBe(1395); expect(p.bestSet?.weightKg).toBe(60); expect(p.totalWorkingSets).toBe(1);
  });
  it('comparação usa última execução mesmo após faltar semanas', () => {
    const pair = lastExerciseSessions([...logs([50],[15],'other-plan','2026-09-01'), ...logs([60],[15])]);
    expect(pair.previous[0].session_id).toBe('other-plan');
  });
  it('RPE ≤6 auxilia aumento sem RIR no topo', () => {
    const c = logs([20,20,20],[12,12,12]).map(s => ({...s,rir:null}));
    expect(recommend(ex('SUPINO','8-12'),c,logs([18,18,18],[10,10,10],'old','2026-10-26'), { sessionAvgRpe:6 }).recommendedLoadKg).toBe(22);
  });
  it('RPE 9-10 reforça manter', () => {
    expect(recommend(ex('SUPINO','8-12'),logs([20,20,20],[12,12,12]),logs([18,18,18],[12,12,12],'old','2026-10-26'), { sessionAvgRpe:9 }).action).toBe('maintain');
  });
  it('mobilidade não recebe progressão', () => {
    expect(recommend(ex('MOBILIDADE DE QUADRIL','8-12'),logs([20,20,20],[12,12,12])).action).toBe('maintain');
  });
  it('RIR final é opcional e não altera conclusão', () => {
    expect(finalWorkingSetIndex(['recognition','work','work'])).toBe(2);
    expect(optionalRirValue('')).toBeNull(); expect(optionalRirValue('3')).toBe(3);
    let value = '';
    render(<FinalSetRir value={value} onChange={v => { value = v; }} />);
    fireEvent.click(screen.getByRole('button',{name:'RIR 2'}));
    expect(value).toBe('2'); cleanup();
  });
});