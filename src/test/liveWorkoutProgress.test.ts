import { describe, it, expect } from 'vitest';
import { liveAgo, liveCurrent, liveFreshness, latestCompletedSet, nextLastSet } from '@/lib/liveWorkoutProgress';

const ex = (name: string, sets: any[], planned = 3) => ({ name, planned, sets });
const done = (weight: string, reps: string) => ({ weight, reps, completed: true });
const open = { weight: '', reps: '', completed: false };

describe('ao vivo — exercício e série atuais', () => {
  it('mostra a próxima série a fazer do exercício atual', () => {
    const list = [ex('SUPINO', [done('60', '10'), done('60', '9'), done('60', '8')]), ex('CRUCIFIXO', [done('14', '12'), open, open])];
    expect(liveCurrent(list, 1)).toMatchObject({ exerciseName: 'CRUCIFIXO', exerciseIndex: 1, totalExercises: 2, setNumber: 2, plannedSets: 3, doneSets: 1 });
    expect(liveCurrent(list, 0)).toMatchObject({ setNumber: null, doneSets: 3 });
  });
});

describe('ao vivo — última série registrada', () => {
  it('detecta a série recém-feita com o horário da atualização', () => {
    const before = [ex('SUPINO', [done('60', '10'), open, open])];
    const after = [ex('SUPINO', [done('60', '10'), done('62,5', '8'), open])];
    expect(nextLastSet(before, after, 0, null, '2026-11-20T18:39:20Z')).toEqual({
      exerciseIndex: 0, setIndex: 1, exerciseName: 'SUPINO', weight: '62,5 kg', reps: '8', at: '2026-11-20T18:39:20Z',
    });
  });
  it('sem novidade mantém a última série vista', () => {
    const list = [ex('SUPINO', [done('60', '10'), done('62', '8'), open]), ex('CRUCIFIXO', [open, open, open])];
    const last = { exerciseIndex: 0, setIndex: 1, exerciseName: 'SUPINO', weight: '62 kg', reps: '8', at: 'x' };
    expect(nextLastSet(list, list, 1, last, 'y')).toMatchObject({ setIndex: 1, at: 'x' });
  });
  it('ao abrir sem histórico usa a última feita pela ordem do treino', () => {
    const list = [ex('SUPINO', [done('60', '10'), done('62', '8')]), ex('CRUCIFIXO', [open, open])];
    expect(latestCompletedSet(list, 1)).toMatchObject({ exerciseName: 'SUPINO', setIndex: 1, weight: '62 kg', reps: '8' });
  });
  it('método com partes usa a parte principal', () => {
    const list = [ex('SUPINO', [{ completed: true, weight: '', reps: '', subRecords: [{ weight: 80, reps: 6 }, { weight: 60, reps: 8 }] }])];
    expect(latestCompletedSet(list, 0)).toMatchObject({ weight: '80 kg', reps: '6' });
  });
});

describe('ao vivo — há quanto tempo', () => {
  const now = new Date('2026-11-20T18:40:00Z').getTime();
  it('formata segundos, minutos e horas', () => {
    expect(liveAgo('2026-11-20T18:39:58Z', now)).toBe('agora');
    expect(liveAgo('2026-11-20T18:39:48Z', now)).toBe('há 12 s');
    expect(liveAgo('2026-11-20T18:37:00Z', now)).toBe('há 3 min');
    expect(liveAgo('2026-11-20T17:35:00Z', now)).toBe('há 1 h 05');
  });
  it('recente até 60 s, parado até 5 min', () => {
    expect(liveFreshness('2026-11-20T18:39:30Z', now)).toBe('fresh');
    expect(liveFreshness('2026-11-20T18:37:00Z', now)).toBe('idle');
    expect(liveFreshness('2026-11-20T18:30:00Z', now)).toBe('stale');
  });
});
