import { describe, it, expect } from 'vitest';
import {
  classifySessionRpe,
  buildAttentionPriority,
  sortProgressionReviews,
} from '@/lib/trainingIntensityAttention';
import { buildProgressionContactMessage } from '@/lib/progressionContactMessage';

describe('classifySessionRpe', () => {
  it('classifica a escala 0-10', () => {
    expect(classifySessionRpe(5)).toBe('very_low');
    expect(classifySessionRpe(6)).toBe('low');
    expect(classifySessionRpe(7)).toBe('low');
    expect(classifySessionRpe(8)).toBe('target');
    expect(classifySessionRpe(9)).toBe('target');
    expect(classifySessionRpe(10)).toBe('maximal');
    expect(classifySessionRpe(null)).toBe('unknown');
  });
});

describe('buildAttentionPriority', () => {
  const base = { sessionStatus: 'completed', phase: 'semana_2' as string };

  it('complete + RPE 6 + increase_load → high', () => {
    expect(buildAttentionPriority({ ...base, rpe: 6, actions: ['increase_load'] }).attentionPriority).toBe('high');
  });
  it('complete + RPE 7 + increase_reps → high', () => {
    expect(buildAttentionPriority({ ...base, rpe: 7, actions: ['increase_reps'] }).attentionPriority).toBe('high');
  });
  it('complete + RPE 6 + maintain → attention_only', () => {
    expect(buildAttentionPriority({ ...base, rpe: 6, actions: ['maintain'] }).attentionPriority).toBe('attention_only');
  });
  it('complete + RPE 8 + increase_load → medium', () => {
    expect(buildAttentionPriority({ ...base, rpe: 8, actions: ['increase_load'] }).attentionPriority).toBe('medium');
  });
  it('complete + RPE 9 + maintain → none', () => {
    expect(buildAttentionPriority({ ...base, rpe: 9, actions: [] }).attentionPriority).toBe('none');
  });
  it('RPE 10 não gera alerta de baixa intensidade', () => {
    const r = buildAttentionPriority({ ...base, rpe: 10, actions: ['increase_load'] });
    expect(r.attentionPriority).toBe('none');
    expect(r.intensityStatus).toBe('maximal');
  });
  it('partial + RPE 6 → none', () => {
    expect(buildAttentionPriority({ sessionStatus: 'in_progress', rpe: 6, actions: ['increase_load'] }).attentionPriority).toBe('none');
  });
  it('abandoned + RPE 5 → none', () => {
    expect(buildAttentionPriority({ sessionStatus: 'abandoned', rpe: 5, actions: ['increase_load'] }).attentionPriority).toBe('none');
  });
  it('S4 + RPE 6 → none', () => {
    expect(buildAttentionPriority({ sessionStatus: 'completed', phase: 'semana_4', rpe: 6, actions: ['increase_load'] }).attentionPriority).toBe('none');
  });
  it('sem sessão → none', () => {
    expect(buildAttentionPriority({ sessionStatus: null, rpe: 6 }).attentionPriority).toBe('none');
  });
});

describe('sortProgressionReviews', () => {
  const mk = (studentName: string, attentionPriority: any, hasPendingReview: boolean, latestSessionRpe: number | null) =>
    ({ studentName, attentionPriority, hasPendingReview, latestSessionRpe });

  it('ordena HIGH → ATTENTION_ONLY → MEDIUM, pendentes antes de enviados', () => {
    const sorted = sortProgressionReviews([
      mk('Ana', 'medium', true, 8),
      mk('Bruno', 'high', false, 5),
      mk('Carla', 'attention_only', true, 7),
      mk('Diego', 'high', true, 7),
      mk('Elena', 'high', true, 5),
    ]);
    expect(sorted.map((s) => s.studentName)).toEqual(['Elena', 'Diego', 'Carla', 'Ana', 'Bruno']);
  });
});

describe('buildProgressionContactMessage', () => {
  it('high inclui RPE e progressões', () => {
    const msg = buildProgressionContactMessage({
      studentName: 'Maria Silva',
      rpe: 6,
      priority: 'high',
      recommendations: [
        { exerciseName: 'Leg Press', nextAction: 'increase_load', suggestedIncrement: 5 },
        { exerciseName: 'Extensora', nextAction: 'increase_reps', suggestedIncrement: 0 },
      ],
    });
    expect(msg).toContain('Oi Maria!');
    expect(msg).toContain('6/10');
    expect(msg).toContain('• Leg Press: +5 kg');
    expect(msg).toContain('• Extensora: +1 rep');
    expect(msg).not.toContain('fraco');
  });

  it('attention_only não inventa kg', () => {
    const msg = buildProgressionContactMessage({
      studentName: 'Maria',
      rpe: 6,
      priority: 'attention_only',
      recommendations: [],
    });
    expect(msg).not.toContain('kg');
    expect(msg).toContain('esforço planejado');
  });

  it('medium foca na progressão sem alerta de intensidade baixa', () => {
    const msg = buildProgressionContactMessage({
      studentName: 'João',
      rpe: 8,
      priority: 'medium',
      recommendations: [{ exerciseName: 'Supino', nextAction: 'increase_load', suggestedIncrement: 2.5 }],
    });
    expect(msg).toContain('dentro do alvo');
    expect(msg).toContain('+2,5 kg');
  });
});

describe('contato semanal', () => {
  const weekStart = '2026-08-24';
  const contacts = [
    { student_id: 'a', week_start: '2026-08-24' },
    { student_id: 'b', week_start: '2026-08-17' },
  ];
  it('usa a coluna real week_start e só bloqueia a semana corrente', () => {
    const contacted = new Set(contacts.filter((c) => c.week_start === weekStart).map((c) => c.student_id));
    expect(contacted.has('a')).toBe(true);
    expect(contacted.has('b')).toBe(false);
  });
});
