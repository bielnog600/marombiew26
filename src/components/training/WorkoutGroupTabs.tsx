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
  const aDone = !!sets[a]?.[pending]?.completed;
  const bDone = !!sets[b]?.[pending]?.completed;
  // De quem é a vez na série pendente: A primeiro, depois B.
  const turn = aDone ? (bDone ? null : b) : a;
  const statusOf = (idx: number) =>
    currentIndex === idx ? 'AGORA' : (sets[idx]?.[pending]?.completed ? '✓' : 'a seguir');
  return <div className="space-y-2" data-testid="workout-group">
    <p className="text-sm font-bold text-primary text-center tracking-wide uppercase">{exercises[a].tipo_grupo === 'superset' ? 'Superset' : 'Bi-set'}</p>
    <div className="grid grid-cols-2 gap-2">{indices.map((idx, i) => (
      <Button
        key={exercises[idx].id ?? idx}
        variant={currentIndex === idx ? 'default' : 'outline'}
        className="h-auto min-h-11 whitespace-normal text-center text-sm flex-col gap-0.5 py-1.5 px-2"
        onClick={() => onSelect(idx)}
      >
        <span className="line-clamp-2 leading-tight">{i === 0 ? 'A' : 'B'} · {exercises[idx].exercise}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${currentIndex === idx ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{statusOf(idx)}</span>
      </Button>
    ))}</div>
    <p className="text-sm text-foreground text-center font-medium">
      Série {pending + 1} de {count} · A {aDone ? '✓' : turn === a ? 'agora' : 'a seguir'} · B {bDone ? '✓' : turn === b ? 'agora' : 'a seguir'}
    </p>
  </div>;
}
