import { describe, it, expect } from 'vitest';
import {
  buildWeeklyFocus,
  buildFocusTextMessage,
  buildFocusAudioScript,
  type ManualCoachingAction,
} from '@/lib/weeklyCoachingFocus';

const perf = (name: string, nextAction: any, extra: any = {}) => ({
  exerciseName: name,
  nextAction,
  status: 'ok',
  totalWorkingSets: 3,
  auxiliarySets: 0,
  preparationSets: 0,
  totalReps: 30,
  totalVolume: 1000,
  loaded: true,
  comparisonBasis: 'structured',
  reason: '',
  bestSet: { reps: 10, weightKg: 35 },
  ...extra,
}) as any;

const quant = (name: string, o: any = {}) => ({
  exerciseName: name,
  sourceAction: 'increase_load',
  action: 'increase_load',
  currentLoadKg: 35,
  recommendedLoadKg: 37.5,
  currentReps: 10,
  targetReps: 12,
  workingSetTargets: null,
  totalRepsTarget: null,
  repRange: { min: 10, max: 12 },
  incrementKg: 2.5,
  incrementSource: 'configured',
  incrementConfidence: 'high',
  relativeChangePct: 7,
  confidence: 'high',
  qualitative: false,
  basis: '',
  reasons: [],
  ...o,
}) as any;

const manual = (o: Partial<ManualCoachingAction>): ManualCoachingAction => ({
  id: 'x', student_id: 's', plan_id: null, week_start: '2026-01-05',
  exercise_name: 'Leg Press', action_type: 'amplitude', message: null, status: 'pending',
  ...o,
} as ManualCoachingAction);

describe('weeklyCoachingFocus', () => {
  it('TESTE 1 — increase_load mostra a carga recomendada real', () => {
    const [item] = buildWeeklyFocus({
      performances: [perf('Supino máquina', 'increase_load')],
      quantitative: [quant('Supino máquina')],
    });
    expect(item.actionType).toBe('increase_load');
    expect(item.detail).toBe('Subir para 37,5 kg');
  });

  it('TESTE 2 — increase_reps mantém carga e pede topo da faixa', () => {
    const [item] = buildWeeklyFocus({
      performances: [perf('Remada baixa', 'increase_reps', { bestSet: { reps: 10, weightKg: 40 }, repRange: { min: 10, max: 12 } })],
    });
    expect(item.detail).toBe('Manter 40 kg • buscar 10–12 reps');
  });

  it('TESTE 3 — vídeo needs_redo vira pedido de novo vídeo com observação', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Agachamento', 'maintain')],
      videosNeedsRedo: [{ exerciseName: 'Agachamento', note: 'Controlar descida' }],
    });
    const squat = items.find((i) => i.exerciseName === 'Agachamento')!;
    expect(squat.actionType).toBe('request_video');
    expect(squat.detail).toBe('Pedir novo vídeo');
    expect(squat.videoNote).toBe('Controlar descida');
  });

  it('TESTE 4 — ação manual de amplitude sobrepõe a automática e mantém status', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Leg Press', 'increase_load')],
      quantitative: [quant('Leg Press')],
      manualActions: [manual({ action_type: 'amplitude', status: 'waiting' })],
    });
    expect(items[0].actionType).toBe('amplitude');
    expect(items[0].status).toBe('waiting');
    expect(items[0].source).toBe('manual');
  });

  it('não infere técnica/amplitude sem evidência manual ou vídeo', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Cadeira extensora', 'reduce_load')],
    });
    expect(items.every((i) => i.actionType !== 'amplitude' && i.actionType !== 'technique')).toBe(true);
  });

  it('remove orientação quando marcada como dismissed', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Leg Press', 'maintain')],
      manualActions: [manual({ action_type: 'dismissed' })],
    });
    expect(items).toHaveLength(0);
  });

  it('deload nunca gera sobrecarga', () => {
    const [item] = buildWeeklyFocus({
      performances: [perf('Supino', 'increase_load')],
      deload: true,
    });
    expect(item.actionType).toBe('maintain');
  });

  it('ordena por prioridade: regressão, vídeo, carga, reps, manter', () => {
    const items = buildWeeklyFocus({
      performances: [
        perf('Manter ex', 'maintain'),
        perf('Reps ex', 'increase_reps'),
        perf('Carga ex', 'increase_load'),
        perf('Queda ex', 'reduce_load'),
        perf('Video ex', 'maintain'),
      ],
      videosNeedsRedo: [{ exerciseName: 'Video ex', note: null }],
    });
    expect(items.map((i) => i.exerciseName)).toEqual(['Queda ex', 'Video ex', 'Carga ex', 'Reps ex', 'Manter ex']);
  });

  it('TESTE 5 — mensagem usa somente as orientações selecionadas', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Supino', 'increase_load'), perf('Remada', 'increase_reps')],
      quantitative: [quant('Supino')],
    });
    const text = buildFocusTextMessage('Marta Silva', items.slice(0, 1));
    expect(text).toContain('Oi Marta!');
    expect(text).toContain('Supino');
    expect(text).not.toContain('Remada');
  });

  it('roteiro de áudio é curto e natural com as mesmas orientações', () => {
    const items = buildWeeklyFocus({
      performances: [perf('Supino', 'increase_load')],
      quantitative: [quant('Supino')],
    });
    const script = buildFocusAudioScript('Marta Silva', items);
    expect(script.startsWith('Marta, para essa semana')).toBe(true);
    expect(script).toContain('37,5 kg');
    expect(script).not.toContain('•');
  });
});
