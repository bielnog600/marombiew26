import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ExerciseLogCard from '@/components/training/ExerciseLogCard';
import { MethodExerciseCard } from '@/components/training/MethodExerciseCard';
import { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import { restAfterSet } from '@/lib/setTypeRest';
import { parsePauseSeconds } from '@/components/training/TrainerLogSheetUtils';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import type { ParsedExercise } from '@/lib/trainingResultParser';

vi.mock('@/components/training/ExerciseLoadHistorySheet', () => ({ ExerciseLoadHistorySheet: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

const typed: ParsedExercise = {
  exercise: 'Leg Press 45', series: '4', series2: '', reps: '6-8', pause: '90s', variation: '', description: '', rir: '',
  setScheme: { mode: 'per_set', sets: [
    { set_number: 1, set_type: 'warmup', target_reps: '12-15' },
    { set_number: 2, set_type: 'preparatory', target_reps: '10' },
    { set_number: 3, set_type: 'work', target_reps: '6-8' },
    { set_number: 4, set_type: 'work', target_reps: '6-8' },
  ] },
} as ParsedExercise;
const untyped: ParsedExercise = { exercise: 'Remada', series: '2', series2: '', reps: '10', pause: '90s', variation: '', description: '', rir: '' };

describe('descanso por tipo de série — regra', () => {
  const types = ['warmup', 'preparatory', 'work', 'work'];
  it('depois do Aquecimento descansa 60s', () => {
    expect(restAfterSet({ setTypes: types, setIndex: 0, planPauseSeconds: 90 })).toEqual({ seconds: 60, label: 'Aquecimento 1 min' });
  });
  it('depois da Preparatória descansa 120s', () => {
    expect(restAfterSet({ setTypes: types, setIndex: 1, planPauseSeconds: 90 })).toEqual({ seconds: 120, label: 'Preparatória 2 min' });
  });
  it('depois do Trabalho descansa 180s', () => {
    expect(restAfterSet({ setTypes: types, setIndex: 2, planPauseSeconds: 90 })).toEqual({ seconds: 180, label: 'Trabalho 3 min' });
  });
  it('depois do Reconhecimento descansa 90s', () => {
    expect(restAfterSet({ setTypes: ['recognition', 'work'], setIndex: 0, planPauseSeconds: 45 })).toEqual({ seconds: 90, label: 'Reconhecimento 1 min 30s' });
  });
  it('sem tipos (todas Trabalho) continua com a pausa do plano', () => {
    expect(restAfterSet({ setTypes: ['work', 'work', 'work'], setIndex: 1, planPauseSeconds: 75 })).toEqual({ seconds: 75, label: null });
    expect(restAfterSet({ setTypes: [], setIndex: 0, planPauseSeconds: 75 })).toEqual({ seconds: 75, label: null });
  });
});

const Picker = ({ value }: { value: string }) => <span>{value}</span>;
const History = () => null;

function AdminCard({ ex, initial, onRest }: { ex: ParsedExercise; initial: MethodSetEntry[]; onRest: (r: ReturnType<typeof useInlineWorkoutRest>) => void }) {
  const [sets, setSets] = useState<MethodSetEntry[]>(initial);
  const rest = useInlineWorkoutRest('admin:typed:u');
  onRest(rest);
  const kinds = (ex.setScheme?.sets ?? sets.map(() => ({ set_type: 'work', target_reps: ex.reps }))).map((s: any) => ({ kind: s.set_type === 'recognition' ? 'recon' : s.set_type, targetReps: s.target_reps }));
  const st = { sets, plan: kinds, notes: '', saving: false, lastWeight: null, lastReps: null, lastDate: null, lastWorkLoad: null, savedSets: 0, exerciseName: ex.exercise } as any;
  const put = (_: number, i: number, entry: MethodSetEntry) => setSets((prev) => prev.map((r, j) => (j === i ? entry : r)));
  return <ExerciseLogCard exIdx={0} ex={ex} st={st} exercisesList={[]} studentId="u" onUpdateSet={() => {}} onUpdateNotes={() => {}} onSaveExercise={() => {}} onStartRestTimer={() => {}} onExerciseNameChange={() => {}}
    ExerciseNamePicker={Picker} HistoryPopover={History} parsePauseSeconds={parsePauseSeconds} inlineRest={rest} onChangeSetEntry={put} onCompleteSet={put} />;
}

describe('Modo Treino admin — exercício normal no formato do grupo', () => {
  it('mostra o rótulo do tipo em cada série e as reps alvo', () => {
    render(<AdminCard ex={typed} initial={[0, 1, 2, 3].map(() => ({ weight: '', reps: '' }))} onRest={() => {}} />);
    expect(screen.getByText('Aquecimento')).toBeTruthy();
    expect(screen.getByText('Preparatória')).toBeTruthy();
    expect(screen.getAllByText('Trabalho')).toHaveLength(2);
    expect(screen.getByText(/alvo 12-15 reps/)).toBeTruthy();
  });

  it('confirmar cada tipo inicia o descanso do tipo e mostra qual está rodando', () => {
    vi.useFakeTimers();
    let latest: ReturnType<typeof useInlineWorkoutRest> | undefined;
    render(<AdminCard ex={typed} initial={[{ weight: '100', reps: '15' }, { weight: '170', reps: '10' }, { weight: '200', reps: '8' }, { weight: '200', reps: '7' }]} onRest={(r) => { latest = r; }} />);
    fireEvent.click(screen.getByLabelText('Confirmar série 1 Aquecimento'));
    expect(latest?.rest).toMatchObject({ total: 60, setIndex: 0 });
    expect(screen.getByText(/Descanso · Aquecimento 1 min/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Confirmar série 2 Preparatória'));
    expect(latest?.rest).toMatchObject({ total: 120, setIndex: 1 });
    fireEvent.click(screen.getByLabelText('Confirmar série 3 Principal'));
    expect(latest?.rest).toMatchObject({ total: 180, setIndex: 2 });
    expect(screen.getByText(/Descanso · Trabalho 3 min/)).toBeTruthy();
  });

  it('exercício sem tipos usa a pausa do plano (90s), sem rótulo de tipo', () => {
    vi.useFakeTimers();
    let latest: ReturnType<typeof useInlineWorkoutRest> | undefined;
    render(<AdminCard ex={untyped} initial={[{ weight: '40', reps: '10' }, { weight: '40', reps: '10' }]} onRest={(r) => { latest = r; }} />);
    fireEvent.click(screen.getByLabelText('Confirmar série 1 Principal'));
    expect(latest?.rest).toMatchObject({ total: 90, setIndex: 0, label: null });
    expect(screen.getByText('DESCANSO')).toBeTruthy();
  });
});

describe('cartão com método numa série só — descanso por tipo', () => {
  it('Aquecimento confirmado descansa 60s', () => {
    vi.useFakeTimers();
    let latest: ReturnType<typeof useInlineWorkoutRest> | undefined;
    function Harness() {
      const [sets, update] = useState<Record<number, MethodSetEntry[]>>({ 0: [{ weight: '50', reps: '15' }, { weight: '85', reps: '10' }, { weight: '100', reps: '8' }, { weight: '100', reps: '8' }] });
      latest = useInlineWorkoutRest('admin:m:u');
      const put = (ex: number, i: number, row: MethodSetEntry) => update((prev) => ({ ...prev, [ex]: prev[ex].map((r, j) => (j === i ? row : r)) }));
      return <MethodExerciseCard exercises={[typed]} indices={[0]} sets={sets} media={[]} studentId="u" inlineRest={latest} onChange={put} onComplete={put} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Confirmar série 1 Aquecimento'));
    expect(latest?.rest).toMatchObject({ total: 60, label: 'Aquecimento 1 min' });
  });
});
