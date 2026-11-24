import { describe, expect, it } from 'vitest';
import { executedRepsForLog, executedRepsInteger, repsInputValue, requiresExecutedReps, sanitizeResumedSetReps } from '@/lib/setRepsInput';

describe('repetições executadas', () => {
  it('aceita apenas campo vazio ou dígitos durante a digitação', () => {
    expect(repsInputValue('')).toBe('');
    expect(repsInputValue('8')).toBe('8');
    expect(repsInputValue('6-8')).toBeNull();
    expect(repsInputValue('8.5')).toBeNull();
  });

  it('nunca transforma a faixa 6-8 em 6 reps', () => {
    expect(executedRepsInteger('6-8')).toBeNull();
    expect(executedRepsInteger('6–8')).toBeNull();
    expect(executedRepsForLog('6-8')).toBeNull();
    expect(executedRepsForLog('8')).toBe(8);
  });

  it('mantém o formato legado apenas para exercício por tempo', () => {
    expect(executedRepsForLog('30s')).toBe(30);
    expect(requiresExecutedReps('PRANCHA', '45s')).toBe(false);
    expect(requiresExecutedReps('ALONGAMENTO DE POSTERIOR', '10')).toBe(false);
    expect(requiresExecutedReps('SUPINO VERTICAL 2', '6-8')).toBe(true);
  });

  it('ao retomar, limpa faixas antigas e reabre somente a série inválida', () => {
    const result = sanitizeResumedSetReps({
      weight: '25', weightAuto: '25', reps: '6-8', completed: true, rir: '2', pauseUntil: 123,
      subRecords: [
        { label: 'Principal', weight: '25', reps: '6-8', completed: true },
        { label: 'Drop 1', weight: '20', reps: '9', completed: true },
      ],
    });
    expect(result).toMatchObject({ weight: '25', weightAuto: '25', reps: '', completed: false, rir: '2', pauseUntil: 123 });
    expect(result.subRecords).toEqual([
      { label: 'Principal', weight: '25', reps: '', completed: false },
      { label: 'Drop 1', weight: '20', reps: '9', completed: true },
    ]);
  });

  it('preserva reps válidas e o tempo legado ao retomar', () => {
    expect(sanitizeResumedSetReps({ weight: '27,5', reps: '8', completed: true })).toMatchObject({ reps: '8', completed: true });
    expect(sanitizeResumedSetReps({ weight: '', reps: '30s', completed: true })).toMatchObject({ reps: '30s', completed: true });
  });
});
