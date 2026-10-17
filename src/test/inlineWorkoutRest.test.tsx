import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import { formatRestTime } from '@/components/training/WorkoutSetCard';

afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

describe('descanso entre séries', () => {
  it('usa o tempo configurado e identifica o card da série concluída', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => result.current.start(120, 2, 1));
    expect(result.current.rest).toMatchObject({ total: 120, remaining: 120, exIdx: 2, setIndex: 1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.rest?.remaining).toBe(119);
    expect(formatRestTime(72)).toBe('1:12');
  });
  it('+15s estende o prazo atual por exatamente 15 segundos', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest());
    act(() => result.current.start(90, 0, 0));
    act(() => vi.advanceTimersByTime(10000));
    const end = result.current.rest?.endTime ?? 0;
    act(() => result.current.adjust(15));
    expect(result.current.rest?.endTime).toBe(end + 15000);
    expect(result.current.rest?.remaining).toBe(95);
  });
  it('pular encerra o descanso, mantém sua série e vibra [120,80,120]', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { result } = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => result.current.start(120, 0, 1));
    act(() => result.current.skip());
    expect(result.current.rest).toBeNull();
    expect(result.current.completion).toMatchObject({ exIdx: 0, setIndex: 1 });
    expect(vibrate).toHaveBeenCalledWith([120, 80, 120]);
    expect(localStorage.getItem('u:s')).toBeNull();
  });
  it('concluir outra série substitui o descanso sem emitir conclusão antiga', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest());
    act(() => result.current.start(120, 0, 0));
    act(() => vi.advanceTimersByTime(20000));
    act(() => result.current.start(120, 0, 1));
    expect(result.current.rest).toMatchObject({ remaining: 120, setIndex: 1 });
    expect(result.current.completion).toBeNull();
  });
  it('retoma pelo prazo absoluto após sair, sem reiniciar o descanso', () => {
    vi.useFakeTimers();
    const first = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => first.result.current.start(120, 0, 2));
    first.unmount();
    act(() => vi.advanceTimersByTime(45000));
    const second = renderHook(() => useInlineWorkoutRest('u:s'));
    expect(second.result.current.rest).toMatchObject({ remaining: 75, setIndex: 2 });
  });
  it('ao zerar na última série conclui uma vez e limpa o modo descanso', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => result.current.start(2, 0, 2));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.rest).toBeNull();
    expect(result.current.completion).toMatchObject({ exIdx: 0, setIndex: 2 });
    const id = result.current.completion?.id;
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.completion?.id).toBe(id);
  });
  it('separa o descanso de usuários e sessões diferentes', () => {
    vi.useFakeTimers();
    const a = renderHook(() => useInlineWorkoutRest('userA:sessionA'));
    act(() => a.result.current.start(90, 0, 0));
    const b = renderHook(() => useInlineWorkoutRest('userB:sessionA'));
    const c = renderHook(() => useInlineWorkoutRest('userA:sessionB'));
    expect(b.result.current.rest).toBeNull();
    expect(c.result.current.rest).toBeNull();
  });
  it('reordenar mantém prazo e série, alterando apenas o índice do exercício', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => result.current.start(120, 0, 1));
    const endTime = result.current.rest?.endTime;
    act(() => result.current.reindex(3));
    expect(result.current.rest).toMatchObject({ exIdx: 3, setIndex: 1, endTime });
  });
  it('cancelar limpa o descanso sem acionar sinal de próxima série', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInlineWorkoutRest('u:s'));
    act(() => result.current.start(90, 0, 0));
    act(() => result.current.cancel());
    expect(result.current.rest).toBeNull();
    expect(result.current.completion).toBeNull();
    expect(localStorage.getItem('u:s')).toBeNull();
  });
});