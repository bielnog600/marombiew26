import { useEffect, useState } from 'react';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { exerciseBlocks } from '@/lib/workoutExecutionMethods';

export interface GroupPause { until: number; nextIndex: number; label: string }
export function useWorkoutGroupFlow(exercises: ParsedExercise[], currentIndex: number, onSelect: (index: number) => void, restoredPause?: GroupPause | null, onPauseChange?: (pause: GroupPause | null) => void) {
  const [pause, setPause] = useState<GroupPause | null>(restoredPause ?? null);
  const [now, setNow] = useState(Date.now);
  const block = exerciseBlocks(exercises).find(b => b.indices.includes(currentIndex));
  const indices = block?.indices ?? [currentIndex];
  useEffect(() => { if (restoredPause) setPause(restoredPause); }, [restoredPause?.until]);
  useEffect(() => {
    if (!pause) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= pause.until) { onSelect(pause.nextIndex); setPause(null); onPauseChange?.(null); }
    };
    tick(); const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [pause?.until, pause?.nextIndex, onSelect]);
  const complete = (setIndex: number, nextSets: Record<number, MethodSetEntry[]>, restSeconds: number) => {
    if (indices.length !== 2) return false;
    const [a, b] = indices;
    let nextIndex: number;
    let seconds: number;
    let label: string;
    if (currentIndex === a && !nextSets[b]?.[setIndex]?.completed) {
      nextIndex = b; seconds = exercises[a].pausa_grupo_s ?? 0; label = 'Troca A → B';
    } else if (nextSets[a]?.[setIndex]?.completed && nextSets[b]?.[setIndex]?.completed) {
      nextIndex = a; seconds = restSeconds; label = 'Descanso do grupo';
    } else { nextIndex = a; seconds = 0; label = 'Exercício A'; }
    if (seconds > 0) {
      const next = { until: Date.now() + seconds * 1000, nextIndex, label };
      setPause(next); onPauseChange?.(next);
    } else onSelect(nextIndex);
    return true;
  };
  const skip = () => { if (pause) onSelect(pause.nextIndex); setPause(null); onPauseChange?.(null); };
  return { indices, complete, pause, remaining: pause ? Math.max(0, Math.ceil((pause.until - now) / 1000)) : 0, skip };
}