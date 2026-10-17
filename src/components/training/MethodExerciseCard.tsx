import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { methodSummary } from '@/lib/workoutExecutionMethods';
import { useWorkoutGroupFlow, type GroupPause } from '@/hooks/useWorkoutGroupFlow';
import { WorkoutGroupTabs } from './WorkoutGroupTabs';
import { MethodSetRows } from './MethodSetRows';
import { getRecommendationFor, targetLoadForSet, type ProgressionSnapshot } from '@/lib/sessionProgression';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { ProgressionHintCard } from './ProgressionHintCard';
import { ExerciseLoadHistorySheet } from './ExerciseLoadHistorySheet';

export function MethodExerciseCard({ exercises, indices, sets, onChange, onComplete, media, snapshot, studentId, savedPause, onPauseChange }: {
  exercises: ParsedExercise[]; indices: number[]; sets: Record<number, MethodSetEntry[]>;
  onChange: (exIndex: number, setIndex: number, entry: MethodSetEntry) => void;
  onComplete: (exIndex: number, setIndex: number, entry: MethodSetEntry) => void;
  media: Array<{ nome: string; imagem_url?: string | null; video_embed?: string | null }>;
  snapshot?: ProgressionSnapshot | null; studentId: string;
  savedPause?: GroupPause | null; onPauseChange?: (pause: GroupPause | null) => void;
}) {
  const [current, setCurrent] = useState(indices[0]);
  const select = useCallback((index: number) => setCurrent(index), []);
  const flow = useWorkoutGroupFlow(exercises, current, select, savedPause, onPauseChange);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => { if (!indices.includes(current)) setCurrent(indices[0]); }, [indices.join(',')]);
  const ex = exercises[current];
  if (!ex) return null;
  const rows = sets[current] ?? [];
  const matched = findBestExerciseMatch(ex.exercise, media.map((item, i) => ({ ...item, id: String(i) })));
  const recommendation = getRecommendationFor(snapshot ?? null, ex.exercise);
  const complete = (index: number, entry: MethodSetEntry) => {
    onComplete(current, index, entry);
    const nextRows = [...rows]; nextRows[index] = entry;
    const b = exercises[indices[1] ?? current];
    const raw = b?.pause ?? '60s';
    const rest = /min/.test(raw) ? (Number(raw.match(/\d+/)?.[0]) || 1) * 60 : Number(raw.match(/\d+/)?.[0]) || 60;
    if (!flow.complete(index, { ...sets, [current]: nextRows }, rest)) {
      onPauseChange?.({ until: Date.now() + rest * 1000, nextIndex: current, label: 'Descanso' });
    }
  };
  const displayedPause = flow.pause ?? savedPause;
  return <div className="rounded-lg border border-primary/40 bg-card p-3 space-y-3">
    <WorkoutGroupTabs exercises={exercises} indices={indices} currentIndex={current} sets={sets} onSelect={select} />
    <div className="flex items-start gap-3">
      {matched?.imagem_url && <img src={matched.imagem_url} alt={ex.exercise} className="h-16 w-16 rounded-md object-cover shrink-0" />}
      <div className="min-w-0 flex-1"><p className="font-semibold text-sm">{ex.exercise}</p><p className="text-xs text-muted-foreground">{rows.length} séries × {ex.reps}{ex.rir ? ` · RIR ${ex.rir}` : ''}</p><p className="text-xs text-primary">{methodSummary(ex)}</p></div>
      <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>Cargas</Button>
    </div>
    {matched?.video_embed && <iframe src={matched.video_embed} title={`Vídeo ${ex.exercise}`} className="w-full aspect-video border-0" allow="autoplay; fullscreen" />}
    {(recommendation || ex.targetLoadKg || ex.targetLoadPerSet) && <ProgressionHintCard recommendation={recommendation} targetLoad={{ kg: ex.targetLoadKg, perSet: ex.targetLoadPerSet, note: ex.targetLoadNote }} variant="compact" />}
    {displayedPause && <div className="flex items-center justify-between text-primary text-xs"><span>{displayedPause.label} · pausa automática</span><Button variant="ghost" size="sm" onClick={flow.skip}>Pular</Button></div>}
    {rows.map((row, index) => <MethodSetRows key={index} exercise={ex} set={row} index={index} count={rows.length} targetReps={ex.setScheme?.sets[index]?.target_reps ?? ex.reps} recognition={ex.setScheme?.sets[index]?.set_type === 'recognition' || (Number(ex.series2) > 0 && index < Number(ex.series))} weightPlaceholder={String(targetLoadForSet(ex.targetLoadPerSet, index + 1) ?? ex.targetLoadKg ?? recommendation?.recommendedLoadKg ?? 'kg')} onChange={entry => onChange(current, index, entry)} onComplete={entry => complete(index, entry)} />)}
    <ExerciseLoadHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} studentId={studentId} exerciseName={ex.exercise} />
  </div>;
}