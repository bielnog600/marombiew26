import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRestTimer, type RestTimerState } from './useRestTimer';

export type InlineRestState = RestTimerState & { setIndex: number };
export type RestCompletion = { exIdx: number; setIndex: number; id: number };

/** Absolute deadlines survive navigation/backgrounding; no progression data is changed. */
export function useInlineWorkoutRest(storageKey?: string) {
  const timer = useRestTimer();
  const [completion, setCompletion] = useState<RestCompletion | null>(null);
  const activeRef = useRef<InlineRestState | null>(null);
  const keyRef = useRef(storageKey);
  keyRef.current = storageKey;
  const persist = useCallback((state: InlineRestState | null) => {
    activeRef.current = state;
    if (!keyRef.current) return;
    try {
      if (state) localStorage.setItem(keyRef.current, JSON.stringify(state));
      else localStorage.removeItem(keyRef.current);
    } catch { /* Storage may be unavailable in private browsing. */ }
  }, []);
  const finish = useCallback((sound = true) => {
    const current = activeRef.current;
    if (!current) return;
    persist(null);
    timer.stopTimer();
    if (sound) timer.playCompletionBeep();
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* optional */ }
    setCompletion({ exIdx: current.exIdx, setIndex: current.setIndex, id: Date.now() });
  }, [persist, timer.stopTimer, timer.playCompletionBeep]);
  const restore = useCallback((state: InlineRestState | null | undefined) => {
    if (!state || !Number.isFinite(state.endTime) || !Number.isInteger(state.setIndex)) return;
    persist(state);
    timer.restoreTimer(state);
  }, [persist, timer.restoreTimer]);
  useEffect(() => {
    timer.stopTimer();
    activeRef.current = null;
    setCompletion(null);
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) restore(JSON.parse(raw));
    } catch { /* ignore invalid cache */ }
  }, [storageKey, restore, timer.stopTimer]);
  const start = useCallback((seconds: number, exIdx: number, setIndex: number) => {
    const now = Date.now();
    const state: InlineRestState = { total: Math.max(0, seconds), remaining: Math.max(0, seconds), exIdx, setIndex, startTime: now, endTime: now + Math.max(0, seconds) * 1000 };
    persist(state);
    setCompletion(null);
    timer.startTimer(state.total, exIdx, setIndex);
  }, [persist, timer.startTimer]);
  const adjust = useCallback((seconds: number) => {
    const state = activeRef.current;
    if (!state) return;
    const endTime = state.endTime + seconds * 1000;
    const next = { ...state, endTime, total: state.total + Math.max(0, seconds), remaining: Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) };
    persist(next);
    timer.restoreTimer(next);
  }, [persist, timer.restoreTimer]);
  useEffect(() => {
    if (timer.restTimer && timer.restTimer.remaining <= 0) finish(false);
  }, [timer.restTimer?.remaining, finish]);
  // Deadline-only snapshot keeps session autosaves independent of countdown ticks.
  const snapshot = useMemo(() => activeRef.current, [timer.restTimer?.endTime, timer.restTimer?.exIdx, timer.restTimer?.setIndex]);
  const rest = timer.restTimer?.setIndex != null ? timer.restTimer as InlineRestState : null;
  return { rest, snapshot, completion, start, adjust, skip: finish, restore };
}