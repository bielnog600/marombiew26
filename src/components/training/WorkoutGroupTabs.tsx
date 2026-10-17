import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';

export function WorkoutGroupTabs({ exercises, indices, currentIndex, sets, onSelect }: {
  exercises: ParsedExercise[]; indices: number[]; currentIndex: number;
  sets: Record<number, MethodSetEntry[]>; onSelect: (index: number) => void;
}) {
  if (indices.length !== 2) return null;
  const a = indices[0], b = indices[1];
  const count = sets[a]?.length ?? 0;
  const pending = Array.from({ length: count }, (_, i) => i).find(i => !sets[a]?.[i]?.completed || !sets[b]?.[i]?.completed) ?? Math.max(0, count - 1);
  const allDone = (idx: number) => (sets[idx]?.length ?? 0) > 0 && sets[idx].every(s => s.completed);
  return <div className="space-y-1.5" data-testid="workout-group">
    <p className="text-[13px] font-bold text-primary text-center tracking-[0.2em] uppercase">{exercises[a].tipo_grupo === 'superset' ? 'Superset' : 'Bi-set'}</p>
    <div className="grid grid-cols-2 gap-2">{indices.map((idx, i) => (
      <Button
        key={exercises[idx].id ?? idx}
        variant={currentIndex === idx ? 'default' : 'outline'}
        className="h-10 min-w-0 justify-start gap-1.5 px-2.5 text-sm"
        onClick={() => onSelect(idx)}
      >
        <span className="font-bold shrink-0">{i === 0 ? 'A' : 'B'}</span>
        <span className="truncate font-normal flex-1 text-left">{exercises[idx].exercise}</span>
        {allDone(idx) && <Check aria-label="Concluído" className="h-3.5 w-3.5 shrink-0 text-chart-3" />}
      </Button>
    ))}</div>
    <p className="text-[13px] text-foreground text-center font-medium">Série {pending + 1} de {count}</p>
  </div>;
}
