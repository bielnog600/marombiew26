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
  return <div className="space-y-2" data-testid="workout-group">
    <p className="text-xs font-semibold text-primary">{exercises[a].tipo_grupo === 'superset' ? 'Superset' : 'Bi-set'} · A1 / A2</p>
    <div className="grid grid-cols-2 gap-2">{indices.map((idx, i) => <Button key={exercises[idx].id ?? idx} variant={currentIndex === idx ? 'default' : 'outline'} className="h-auto min-h-9 whitespace-normal text-xs" onClick={() => onSelect(idx)}>{i === 0 ? 'A' : 'B'} · {exercises[idx].exercise}</Button>)}</div>
    <p className="text-xs text-muted-foreground">Série {pending + 1} de {count} · A {sets[a]?.[pending]?.completed ? '✓' : 'pendente'} · B {sets[b]?.[pending]?.completed ? '✓' : 'pendente'}</p>
  </div>;
}