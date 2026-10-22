import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { exerciseBlocks } from '@/lib/workoutExecutionMethods';

export interface GroupPause {
  until: number;
  nextIndex: number;
  label: string;
  /** swap = pausa curta A→B; rest = descanso do grupo após o B. */
  kind: 'swap' | 'rest';
  /** Série (0-based) que o próximo exercício vai executar. */
  setIndex: number;
  /** Duração configurada em segundos (para o anel de progresso). */
  total: number;
}

export type GroupStep =
  | { kind: 'swap' | 'rest'; nextIndex: number; seconds: number; setIndex: number }
  | { kind: 'done' };

/**
 * Decide o próximo passo do grupo após concluir uma série (puro, testável):
 * A concluída → troca para o B (pausa_grupo_s); A e B concluídas → descanso do
 * grupo e volta para o A na série seguinte; última série dos dois → done.
 */
export function nextGroupStep(
  exercises: ParsedExercise[],
  indices: number[],
  currentIndex: number,
  setIndex: number,
  nextSets: Record<number, MethodSetEntry[]>,
  restSeconds: number,
): GroupStep | null {
  if (indices.length !== 2) return null;
  const [a, b] = indices;
  if (a === b || !exercises[a] || !exercises[b] || !indices.includes(currentIndex)) return null;
  const count = nextSets[a]?.length ?? 0;
  if (currentIndex === a && !nextSets[b]?.[setIndex]?.completed) {
    return { kind: 'swap', nextIndex: b, seconds: Math.max(0, exercises[a]?.pausa_grupo_s ?? 0), setIndex };
  }
  if (nextSets[a]?.[setIndex]?.completed && nextSets[b]?.[setIndex]?.completed) {
    const allDone = count > 0
      && (nextSets[a] ?? []).every(s => s.completed)
      && (nextSets[b] ?? []).every(s => s.completed);
    if (allDone) return { kind: 'done' };
    return { kind: 'rest', nextIndex: a, seconds: restSeconds, setIndex: setIndex + 1 };
  }
  // B concluído antes do A (ordem manual): volta para o A sem pausa.
  return { kind: 'swap', nextIndex: a, seconds: 0, setIndex };
}

export function useWorkoutGroupFlow(
  exercises: ParsedExercise[],
  currentIndex: number,
  onSelect: (index: number) => void,
  restoredPause?: GroupPause | null,
  onPauseChange?: (pause: GroupPause | null) => void,
) {
  const [pause, setPause] = useState<GroupPause | null>(restoredPause ?? null);
  const [now, setNow] = useState(Date.now);
  const [finished, setFinished] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const block = exerciseBlocks(exercises).find(b => b.indices.includes(currentIndex));
  const indices = block?.indices ?? [currentIndex];

  // Beeps Web Audio (sessão "ambient" no iOS: não pausa a música do aluno).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
  const clearBeeps = useCallback(() => {
    for (const { osc, gain } of nodesRef.current) {
      try { osc.stop(); } catch { /* noop */ }
      try { osc.disconnect(); gain.disconnect(); } catch { /* noop */ }
    }
    nodesRef.current = [];
  }, []);
  const scheduleBeeps = useCallback((seconds: number) => {
    clearBeeps();
    if (seconds <= 0) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      const beep = (at: number, freq: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(vol, at + 0.01);
        gain.gain.setValueAtTime(vol, at + dur - 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at); osc.stop(at + dur + 0.05);
        nodesRef.current.push({ osc, gain });
      };
      const t0 = ctx.currentTime;
      // Aviso curto nos últimos 3s e ao zerar.
      for (const s of [3, 2, 1]) if (seconds >= s) beep(t0 + (seconds - s), 880, 0.12, 0.25);
      beep(t0 + seconds, 1320, 0.35, 0.3);
    } catch { /* noop */ }
  }, [clearBeeps]);

  useEffect(() => { if (restoredPause) setPause(restoredPause); }, [restoredPause?.until]);

  const endPause = useCallback(() => {
    setPause(null); onPauseChange?.(null); clearBeeps();
  }, [onPauseChange, clearBeeps]);

  useEffect(() => {
    if (!pause) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= pause.until) {
        try { navigator.vibrate?.(200); } catch { /* noop */ }
        onSelect(pause.nextIndex);
        endPause();
      }
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [pause?.until, pause?.nextIndex, onSelect, endPause]);

  useEffect(() => () => { clearBeeps(); try { audioCtxRef.current?.close(); } catch { /* noop */ } }, [clearBeeps]);

  const complete = (setIndex: number, nextSets: Record<number, MethodSetEntry[]>, restSeconds: number) => {
    const step = nextGroupStep(exercises, indices, currentIndex, setIndex, nextSets, restSeconds);
    if (!step) return false;
    if (step.kind === 'done') {
      setFinished(exercises[indices[0]]?.tipo_grupo === 'biset' ? 'Bi-set concluído ✓' : 'Superset concluído ✓');
      return true;
    }
    if (step.seconds > 0) {
      const next: GroupPause = {
        until: Date.now() + step.seconds * 1000,
        nextIndex: step.nextIndex,
        label: step.kind === 'swap' ? 'Troca A → B' : 'Descanso do grupo',
        kind: step.kind, setIndex: step.setIndex, total: step.seconds,
      };
      setPause(next); onPauseChange?.(next); scheduleBeeps(step.seconds);
    } else {
      // Pausa A→B = 0s: troca direto, só um aviso rápido.
      onSelect(step.nextIndex);
      if (step.kind === 'swap') {
        const ex = exercises[step.nextIndex];
        setNotice(`Agora: ${ex?.ordem_grupo ?? ''} — ${ex?.exercise ?? ''}`);
      }
    }
    return true;
  };

  const skip = () => { if (pause) onSelect(pause.nextIndex); endPause(); };
  const adjust = (seconds: number) => {
    setPause(prev => {
      if (!prev) return null;
      const until = prev.until + seconds * 1000;
      const next: GroupPause = { ...prev, until, total: prev.total + (seconds > 0 ? seconds : 0) };
      onPauseChange?.(next);
      scheduleBeeps(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
      return next;
    });
  };

  return {
    indices, complete, pause,
    remaining: pause ? Math.max(0, Math.ceil((pause.until - now) / 1000)) : 0,
    skip, adjust,
    finished, dismissFinished: () => setFinished(null),
    notice, clearNotice: () => setNotice(null),
  };
}
