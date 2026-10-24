import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MethodExerciseCard } from '@/components/training/MethodExerciseCard';
import { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import { methodPatch, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import type { ParsedExercise } from '@/lib/trainingResultParser';

vi.mock('@/components/training/ExerciseLoadHistorySheet', () => ({ ExerciseLoadHistorySheet: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

const base: ParsedExercise = { exercise: 'Remada', series: '2', series2: '', reps: '10', pause: '90s', variation: '', description: '', rir: '' };

describe('Modo Treino — descanso sem grupo', () => {
  it('série simples no card admin conclui e inicia 90s sem bloquear a próxima', () => {
    vi.useFakeTimers();
    let latest: ReturnType<typeof useInlineWorkoutRest> | undefined;
    function Harness() {
      const [sets, update] = useState<Record<number, MethodSetEntry[]>>({ 0: [{ weight: '40', reps: '10' }, { weight: '40', reps: '10' }] });
      latest = useInlineWorkoutRest('admin:s:u');
      return <MethodExerciseCard exercises={[base]} indices={[0]} sets={sets} media={[]} studentId="u" inlineRest={latest} onChange={(ex, i, row) => update(prev => ({ ...prev, [ex]: prev[ex].map((r, j) => j === i ? row : r) }))} onComplete={(ex, i, row) => update(prev => ({ ...prev, [ex]: prev[ex].map((r, j) => j === i ? row : r) }))} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Confirmar série 1 Principal'));
    expect(latest?.rest).toMatchObject({ remaining: 90, setIndex: 0 });
    expect((screen.getByLabelText('Confirmar série 2 Principal') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Confirmar série 2 Principal'));
    expect(latest?.rest).toMatchObject({ remaining: 90, setIndex: 1 });
  });
  it('Rest-pause preserva pausa interna de 15s e só descansa 90s após a última parte', () => {
    vi.useFakeTimers();
    const ex = { ...base, ...methodPatch('restpause'), series: '1' };
    let latest: ReturnType<typeof useInlineWorkoutRest> | undefined;
    function Harness() {
      const [sets, update] = useState<Record<number, MethodSetEntry[]>>({ 0: [{ weight: '40', reps: '10' }] });
      latest = useInlineWorkoutRest('admin:s:u');
      return <MethodExerciseCard exercises={[ex]} indices={[0]} sets={sets} media={[]} studentId="u" inlineRest={latest} onChange={(ex, i, row) => update(prev => ({ ...prev, [ex]: [row] }))} onComplete={(ex, i, row) => update(prev => ({ ...prev, [ex]: [row] }))} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Confirmar série 1 Principal'));
    expect(latest?.rest).toBeNull();
    expect((screen.getByLabelText('Série 1 Mini-série 1 reps') as HTMLInputElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(15000));
    fireEvent.click(screen.getByLabelText('Registrar 4 reps em Mini-série 1'));
    expect(latest?.rest).toBeNull();
    act(() => vi.advanceTimersByTime(15000));
    fireEvent.click(screen.getByLabelText('Registrar 3 reps em Mini-série 2'));
    expect(latest?.rest).toMatchObject({ total: 90, remaining: 90, setIndex: 0 });
  });
});