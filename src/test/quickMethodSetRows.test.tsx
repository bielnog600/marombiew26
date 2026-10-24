import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MethodSetRows } from '@/components/training/MethodSetRows';
import { makeSubRecords, methodLogFields, methodPatch, type MethodSetEntry, type SeriesMethod } from '@/lib/workoutExecutionMethods';
import type { ParsedExercise } from '@/lib/trainingResultParser';

const base: ParsedExercise = { exercise: 'Remada', series: '3', series2: '', reps: '12', pause: '90s', variation: '', description: '', rir: '' };
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function harness(method: SeriesMethod, initial: MethodSetEntry = { weight: '', reps: '' }, recognition = false) {
  const ex = { ...base, ...methodPatch(method) };
  let latest = initial;
  const complete = vi.fn();
  function Harness() {
    const [set, update] = useState(initial);
    return <MethodSetRows exercise={ex} set={set} index={2} count={3} recognition={recognition} onChange={entry => { latest = entry; update(entry); }} onComplete={complete} />;
  }
  const mounted = render(<Harness />);
  return { ...mounted, ex, complete, latest: () => latest };
}

describe('Cluster e Rest-pause — registro por toque', () => {
  it('Cluster registra 3 reps com carga compartilhada e conclui só no terceiro bloco', () => {
    vi.useFakeTimers();
    const h = harness('cluster');
    fireEvent.change(screen.getByLabelText('Série 3 Bloco 1 carga'), { target: { value: '40' } });
    expect(h.latest().subRecords?.map(part => part.weight)).toEqual(['40', '40', '40']);
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    expect(h.latest().subRecords?.[0]).toMatchObject({ reps: '3', weight: '40', completed: true });
    expect(h.latest().pauseUntil).toBe(Date.now() + 20000);
    expect(h.complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20000));
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    act(() => vi.advanceTimersByTime(20000));
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(h.latest()).toMatchObject({ completed: true, pauseUntil: undefined, reps: '3', weight: '40' });
    expect(h.latest().subRecords?.map(part => part.reps)).toEqual(['3', '3', '3']);
    expect(methodLogFields(h.ex, h.latest()).sub_records).toHaveLength(3);
  });
  it('Fiz menos oferece 1 até reps_bloco−1 e registra o valor escolhido', () => {
    vi.useFakeTimers();
    const h = harness('cluster');
    fireEvent.click(screen.getByRole('button', { name: 'Fiz menos' }));
    expect(screen.queryByLabelText('Registrar 3 reps em Bloco 1')).toBeNull();
    fireEvent.click(screen.getByLabelText('Registrar 2 reps em Bloco 1'));
    expect(h.latest().subRecords?.[0].reps).toBe('2');
    expect(h.latest().pauseUntil).toBe(Date.now() + 20000);
  });
  it('+5s estende o prazo e Ir agora libera o bloco sem registrar nada', () => {
    vi.useFakeTimers();
    const h = harness('cluster');
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    const deadline = h.latest().pauseUntil;
    fireEvent.click(screen.getByRole('button', { name: '+5s' }));
    expect(h.latest().pauseUntil).toBe(Number(deadline) + 5000);
    fireEvent.click(screen.getByRole('button', { name: 'Ir agora' }));
    expect(h.latest().pauseUntil).toBeUndefined();
    expect(h.latest().subRecords?.filter(part => part.completed)).toHaveLength(1);
  });
  it('Rest-pause mantém principal livre e registra minis 4/3 com carga da principal', () => {
    vi.useFakeTimers();
    const h = harness('restpause', { weight: '50', reps: '12' });
    fireEvent.click(screen.getByLabelText('Confirmar série 3 Principal'));
    expect(h.latest().pauseUntil).toBe(Date.now() + 15000);
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getAllByRole('button', { name: /Registrar \d reps em Mini-série 1/ })).toHaveLength(8);
    fireEvent.click(screen.getByLabelText('Registrar 4 reps em Mini-série 1'));
    expect(h.complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(15000));
    fireEvent.click(screen.getByLabelText('Registrar 3 reps em Mini-série 2'));
    expect(h.latest().subRecords?.map(part => [part.weight, part.reps])).toEqual([['50', '12'], ['50', '4'], ['50', '3']]);
    expect(h.complete).toHaveBeenCalledTimes(1);
  });
  it('correções durante e após pausa preservam prazos e não reconcluem a série', () => {
    vi.useFakeTimers();
    const h = harness('cluster', { weight: '40', reps: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    const deadline = h.latest().pauseUntil;
    fireEvent.click(screen.getByLabelText('Corrigir série 3 Bloco 1'));
    fireEvent.change(screen.getByLabelText('Série 3 Bloco 1 reps'), { target: { value: '2' } });
    expect(h.latest().pauseUntil).toBe(deadline);
    act(() => vi.advanceTimersByTime(20000));
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    act(() => vi.advanceTimersByTime(20000));
    fireEvent.click(screen.getByRole('button', { name: 'Fiz 3 reps' }));
    fireEvent.click(screen.getByLabelText('Corrigir série 3 Bloco 3'));
    fireEvent.change(screen.getByLabelText('Série 3 Bloco 3 carga'), { target: { value: '35' } });
    expect(h.latest().subRecords?.[2]).toMatchObject({ weight: '35', completed: true });
    expect(h.latest().pauseUntil).toBeUndefined();
    expect(h.complete).toHaveBeenCalledTimes(1);
  });
  it('retoma o pauseUntil salvo e vibra uma vez em cada um dos últimos 3s', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const ex = { ...base, ...methodPatch('cluster') };
    const subRecords = makeSubRecords(ex, { weight: '40', reps: '3' });
    subRecords[0].completed = true;
    const h = harness('cluster', { weight: '40', reps: '3', subRecords, pauseUntil: Date.now() + 5000 });
    act(() => vi.advanceTimersByTime(2000));
    expect(vibrate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(vibrate).toHaveBeenCalledTimes(3);
    expect(h.latest().pauseUntil).toBeUndefined();
    expect(h.latest().subRecords?.[0]).toMatchObject({ completed: true, reps: '3' });
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('reconhecimento nunca usa registro rápido mesmo com Cluster', () => {
    const h = harness('cluster', { weight: '40', reps: '12' }, true);
    fireEvent.click(screen.getByLabelText('Confirmar série 3 Reconhecimento'));
    expect(h.latest().subRecords).toBeUndefined();
    expect(h.latest().pauseUntil).toBeUndefined();
  });
});