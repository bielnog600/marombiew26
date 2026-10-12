import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StudentWeightInput } from '@/components/training/StudentWeightInput';
import { lastWorkSetLine, studentSuggestionLine, studentWeightPlaceholder, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import { buildSessionStateLogRows } from '@/lib/workoutSessionResolution';
import type { SessionRecommendation } from '@/lib/sessionProgression';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
afterEach(cleanup);

const history: PreviousExerciseSet[] = [
  { set_number: 1, weight_kg: 80, reps: 12, set_type: 'recognition', performed_at: '2026-10-05T12:00:00Z' },
  { set_number: 2, weight_kg: 60, reps: 10, set_type: 'work', performed_at: '2026-10-05T12:00:00Z' },
  { set_number: 3, weight_kg: 55, reps: 8, set_type: 'work', performed_at: '2026-10-05T12:00:00Z' },
];
const recommendation = {
  action: 'increase_load', currentLoadKg: 60, recommendedLoadKg: 62.5,
  repRange: { min: 8, max: 10 }, qualitative: false, bodyweight: false,
  incrementSource: 'configured', reasons: [],
} as unknown as SessionRecommendation;

describe('carga na execução do aluno', () => {
  it('mostra a última carga da série apenas como placeholder', () => {
    render(<StudentWeightInput setNumber={2} value="" placeholder={studentWeightPlaceholder(2, history, {}, null)} disabled={false} onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '60');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });
  it('focar e confirmar sem digitar mantém vazio e salva null, nunca 0 ou o placeholder', () => {
    let saved: unknown;
    const Fixture = () => {
      const [weight, setWeight] = useState('');
      return <>
        <StudentWeightInput setNumber={2} value={weight} placeholder="60" disabled={false} onChange={setWeight} />
        <button onClick={() => {
          saved = buildSessionStateLogRows({ id: 'session', student_id: 'student', phase: null, day_name: 'Terça' },
            { exerciseNames: ['SUPINO'], sets: { 0: [{ reps: '10', weight, completed: true }] } }, '2026-10-12T10:00:00Z').rows[0].weight_kg;
        }}>Confirmar</button>
      </>;
    };
    render(<Fixture />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.blur(screen.getByRole('textbox'));
    fireEvent.click(screen.getByText('Confirmar'));
    expect(saved).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('aceita vírgula e o salvamento existente interpreta decimal', () => {
    const result = buildSessionStateLogRows({ id: 's', student_id: 'u', phase: null, day_name: 'Terça' },
      { exerciseNames: ['SUPINO'], sets: { 0: [{ reps: '10', weight: '62,5', completed: true }] } }, '2026-10-12T10:00:00Z');
    expect(result.rows[0].weight_kg).toBe(62.5);
  });
  it('prioriza alvo por série, alvo geral e sugestão sobre histórico', () => {
    expect(studentWeightPlaceholder(2, history, { kg: 65, perSet: [{ set_number: 2, load_kg: 70 }] }, recommendation)).toBe('70');
    expect(studentWeightPlaceholder(2, history, { kg: 65 }, recommendation)).toBe('65');
    expect(studentWeightPlaceholder(2, history, {}, recommendation)).toBe('62,5');
    expect(studentWeightPlaceholder(1, [], {}, null)).toBe('kg');
  });
  it('última vez usa maior carga de trabalho e ignora reconhecimento/aquecimento', () => {
    expect(lastWorkSetLine(history)).toBe('Última vez: 60 kg × 10 · 05/10');
    expect(lastWorkSetLine([{ ...history[0], set_type: 'warmup' }])).toBeNull();
    expect(lastWorkSetLine([])).toBeNull();
  });
  it('exibe sugestão calculada e dá prioridade ao professor', () => {
    expect(studentSuggestionLine({}, recommendation, '6-10')).toBe('Sugestão: 62,5 kg · 8–10 reps');
    expect(studentSuggestionLine({ kg: 65 }, recommendation, '6-10')).toBe('Carga alvo: 65 kg · 6–10 reps');
    expect(studentSuggestionLine({}, null, '6-10')).toBeNull();
  });
});