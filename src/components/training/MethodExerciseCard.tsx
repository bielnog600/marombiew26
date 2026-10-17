import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { methodSummary } from '@/lib/workoutExecutionMethods';
import { useWorkoutGroupFlow, type GroupPause } from '@/hooks/useWorkoutGroupFlow';
import { WorkoutGroupTabs } from './WorkoutGroupTabs';
import { GroupFinishedOverlay, GroupTransitionOverlay } from './GroupTransitionOverlay';
import { MethodSetRows } from './MethodSetRows';
import { getRecommendationFor, targetLoadForSet, type ProgressionSnapshot } from '@/lib/sessionProgression';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { ProgressionHintCard } from './ProgressionHintCard';
import { ExerciseLoadHistorySheet } from './ExerciseLoadHistorySheet';
import { parsePauseSeconds } from './TrainerLogSheetUtils';
import { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import { RestOffscreenIndicator } from './WorkoutSetCard';

export function MethodExerciseCard({ exercises, indices, sets, onChange, onComplete, media, snapshot, studentId, savedPause, onPauseChange, inlineRest: sharedRest }: {
  exercises: ParsedExercise[]; indices: number[]; sets: Record<number, MethodSetEntry[]>;
  onChange: (exIndex: number, setIndex: number, entry: MethodSetEntry) => void;
  onComplete: (exIndex: number, setIndex: number, entry: MethodSetEntry) => void;
  media: Array<{ nome: string; imagem_url?: string | null; video_embed?: string | null }>;
  snapshot?: ProgressionSnapshot | null; studentId: string;
  savedPause?: GroupPause | null; onPauseChange?: (pause: GroupPause | null) => void;
  inlineRest?: ReturnType<typeof useInlineWorkoutRest>;
}) {
  const [current, setCurrent] = useState(() => {
    const pending = indices.flatMap(idx => (sets[idx] ?? []).flatMap((row, i) => !row.completed ? [i] : [])).sort((a, b) => a - b)[0];
    return indices.find(idx => !sets[idx]?.[pending ?? 0]?.completed) ?? indices[0];
  });
  const select = useCallback((index: number) => setCurrent(index), []);
  const flow = useWorkoutGroupFlow(exercises, current, select, savedPause, onPauseChange);
  const localRest = useInlineWorkoutRest();
  const inlineRest = sharedRest ?? localRest;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  // "Superset concluído ✓" por 2s no Modo Treino (admin permanece no card).
  useEffect(() => {
    if (!flow.finished) return;
    const t = window.setTimeout(() => flow.dismissFinished(), 2000);
    return () => window.clearTimeout(t);
  }, [flow.finished]);
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
    const rest = parsePauseSeconds(b?.pause);
    if (!flow.complete(index, { ...sets, [current]: nextRows }, rest)) {
      inlineRest.start(rest, current, index);
    }
  };
  const displayedPause = indices.length === 2 ? flow.pause ?? savedPause : null;
  return <div className="rounded-lg border border-primary/40 bg-card p-3 space-y-3">
    <WorkoutGroupTabs exercises={exercises} indices={indices} currentIndex={current} sets={sets} onSelect={select} />
    <div className="flex items-start gap-3">
      {matched?.imagem_url && <img src={matched.imagem_url} alt={ex.exercise} className="h-16 w-16 rounded-md object-cover shrink-0" />}
      <div className="min-w-0 flex-1"><p className="font-semibold text-sm">{ex.exercise}</p><p className="text-xs text-muted-foreground">{rows.length} séries × {ex.reps}{ex.rir ? ` · RIR ${ex.rir}` : ''}</p><p className="text-xs text-primary">{methodSummary(ex)}</p></div>
      <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>Cargas</Button>
    </div>
    {matched?.video_embed && <iframe src={matched.video_embed} title={`Vídeo ${ex.exercise}`} className="w-full aspect-video border-0" allow="autoplay; fullscreen" />}
    {(recommendation || ex.targetLoadKg || ex.targetLoadPerSet) && <ProgressionHintCard recommendation={recommendation} targetLoad={{ kg: ex.targetLoadKg, perSet: ex.targetLoadPerSet, note: ex.targetLoadNote }} variant="compact" />}
    {displayedPause && indices.length === 2 && (() => {
      const pause: GroupPause = {
        kind: 'rest', setIndex: 0,
        total: Math.max(1, Math.ceil((displayedPause.until - now) / 1000)),
        ...displayedPause,
      };
      const target = exercises[pause.nextIndex];
      const isBiset = exercises[indices[0]]?.tipo_grupo === 'biset';
      const isSwap = pause.kind === 'swap';
      const matchedTarget = target ? findBestExerciseMatch(target.exercise, media.map((item, i) => ({ ...item, id: String(i) }))) : null;
      return <GroupTransitionOverlay
        groupLabel={isBiset ? 'BI-SET' : 'SUPERSET'}
        pause={pause}
        remaining={Math.max(0, Math.ceil((pause.until - now) / 1000))}
        title={isSwap ? `Agora: ${target?.ordem_grupo ?? 'B'} — ${target?.exercise ?? ''}` : `Descanso do ${isBiset ? 'bi-set' : 'superset'}`}
        subtitle={isSwap
          ? `Série ${pause.setIndex + 1} · alvo ${target?.reps ?? ''} reps`
          : `Próximo: ${target?.ordem_grupo ?? 'A'} — ${target?.exercise ?? ''} · Série ${pause.setIndex + 1}`}
        thumbnail={matchedTarget?.imagem_url ?? null}
        onSkip={flow.skip}
        onAdd={flow.adjust}
      />;
    })()}
    {flow.finished && <GroupFinishedOverlay label={flow.finished} />}
    {rows.map((row, index) => <MethodSetRows key={index} exercise={ex} set={row} index={index} count={rows.length} restPresentation={indices.length === 2 ? undefined : { exIdx: current, rest: inlineRest.rest, completion: inlineRest.completion, next: !inlineRest.rest && index === rows.findIndex(r => !r.completed), onAdd: inlineRest.adjust, onSkip: () => inlineRest.skip() }} disabled={!!displayedPause || (indices.length === 2 && !row.completed && indices.some(idx => sets[idx]?.slice(0, index).some(prior => !prior.completed)))} targetReps={ex.setScheme?.sets[index]?.target_reps ?? ex.reps} recognition={ex.setScheme?.sets[index]?.set_type === 'recognition' || (Number(ex.series2) > 0 && index < Number(ex.series))} weightPlaceholder={String(targetLoadForSet(ex.targetLoadPerSet, index + 1) ?? ex.targetLoadKg ?? recommendation?.recommendedLoadKg ?? 'kg')} onChange={entry => onChange(current, index, entry)} onComplete={entry => complete(index, entry)} />)}
    {!sharedRest && <RestOffscreenIndicator rest={inlineRest.rest} />}
    <ExerciseLoadHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} studentId={studentId} exerciseName={ex.exercise} />
  </div>;
}