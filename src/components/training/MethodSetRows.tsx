import { useEffect, useState } from 'react';
import { Check, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkoutSetCard, type SetRestPresentation } from './WorkoutSetCard';
import { QuickMethodSetRows } from './QuickMethodSetRows';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { makeSubRecords, methodOnSet, methodParameters, seriesMethod, type MethodSetEntry } from '@/lib/workoutExecutionMethods';

export function MethodSetRows({ exercise, set, index, count, recognition = false, targetReps, weightPlaceholder = 'kg', disabled = false, onChange, onComplete, restPresentation }: {
  exercise: ParsedExercise; set: MethodSetEntry; index: number; count: number; recognition?: boolean;
  targetReps?: string; weightPlaceholder?: string; disabled?: boolean; onChange: (set: MethodSetEntry) => void;
  onComplete: (set: MethodSetEntry) => void;
  restPresentation?: SetRestPresentation;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!set.pauseUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [set.pauseUntil]);
  const advanced = methodOnSet(exercise, index, count, recognition);
  if (advanced && (seriesMethod(exercise) === 'cluster' || seriesMethod(exercise) === 'restpause')) {
    return <QuickMethodSetRows exercise={exercise} set={set} index={index} targetReps={targetReps} weightPlaceholder={weightPlaceholder} disabled={disabled} onChange={onChange} onComplete={onComplete} restPresentation={restPresentation} />;
  }
  const baseRecords = advanced ? set.subRecords ?? makeSubRecords(exercise, set) : [{ label: recognition ? 'Reconhecimento' : 'Principal', weight: set.weight, reps: set.reps, completed: !!set.completed }];
  // Drop set: drops vazios e não concluídos herdam a sugestão (−reducao_pct por drop, 0,5 kg).
  const records = advanced && seriesMethod(exercise) === 'dropset'
    ? baseRecords.map((r, i) => {
        if (i === 0 || r.completed || r.weight.trim()) return r;
        const suggested = makeSubRecords(exercise, { ...set, weight: baseRecords[0].weight })[i]?.weight;
        return suggested ? { ...r, weight: suggested } : r;
      })
    : baseRecords;
  // Carga principal só como sugestão (placeholder): drops sugeridos viram placeholders cinza.
  const placeholderLoad = weightPlaceholder.replace(',', '.');
  const dropPlaceholders = advanced && seriesMethod(exercise) === 'dropset' && !baseRecords[0].weight.trim() && Number(placeholderLoad) > 0
    ? makeSubRecords(exercise, { ...set, weight: placeholderLoad }).map(r => r.weight)
    : [];
  const remaining = Math.max(0, Math.ceil(((set.pauseUntil ?? 0) - now) / 1000));
  const next = records.findIndex(r => !r.completed);
  const updateRecord = (recordIndex: number, field: 'weight' | 'reps', value: string) => {
    let updated = records.map((r, i) => i === recordIndex ? { ...r, [field]: value } : r);
    if (recordIndex === 0 && field === 'weight' && seriesMethod(exercise) === 'dropset') {
      const suggestions = makeSubRecords(exercise, { ...set, weight: value });
      updated = updated.map((r, i) => i > 0 && !set.subRecords?.[i]?.completed && (!set.subRecords?.[i]?.weight || set.subRecords?.[i]?.weight === makeSubRecords(exercise, set)[i]?.weight) ? { ...r, weight: suggestions[i].weight } : r);
    }
    onChange({ ...set, weight: updated[0].weight, reps: updated[0].reps, ...(advanced ? { subRecords: updated } : {}) });
  };
  const confirm = (recordIndex: number) => {
    const record = records[recordIndex];
    if (!record.reps.trim() || !Number.isFinite(Number(record.reps)) || Number(record.reps) <= 0) return;
    const updated = records.map((r, i) => i === recordIndex ? { ...r, completed: !r.completed } : r);
    const completed = updated.every(r => r.completed);
    const internal = advanced && !completed && updated[recordIndex].completed && seriesMethod(exercise) !== 'dropset';
    const result: MethodSetEntry = { ...set, weight: updated[0].weight, reps: updated[0].reps, completed, pauseUntil: internal ? Date.now() + methodParameters(exercise).pausa_s * 1000 : undefined, ...(advanced ? { subRecords: updated } : {}) };
    onChange(result);
    if (completed) onComplete(result);
  };
  return <WorkoutSetCard index={index} exIdx={-1} done={!!set.completed} {...restPresentation} className="bg-secondary/40"><div className="p-2 space-y-2" data-testid="method-set">
    <div className="flex items-center justify-between text-xs"><span className={`font-semibold ${restPresentation?.next ? 'text-primary' : ''}`}>Série {index + 1}{advanced && seriesMethod(exercise) === 'restpause' && set.subRecords?.some(r => r.completed) ? ` · ${records.map(r => r.reps || '—').join(' + ')}` : ''}</span>{remaining > 0 && <span className="inline-flex items-center gap-1 text-primary"><Timer className="h-3 w-3" />{remaining}s</span>}</div>
    {records.map((record, i) => <div key={i} className="grid grid-cols-[minmax(58px,1fr)_1fr_1fr_44px] gap-1.5 items-center">
      <span className="text-[10px] text-muted-foreground">{advanced ? record.label : recognition ? 'REC' : `#${index + 1}`}</span>
      <Input aria-label={`Série ${index + 1} ${record.label} carga`} inputMode="decimal" value={record.weight} placeholder={i === 0 ? weightPlaceholder : (dropPlaceholders[i] || 'kg')} onChange={e => updateRecord(i, 'weight', e.target.value)} onFocus={e => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })} disabled={disabled || record.completed || remaining > 0} className="h-11 text-center text-base min-w-0" />
      <Input aria-label={`Série ${index + 1} ${record.label} reps`} inputMode="numeric" value={record.reps} placeholder={seriesMethod(exercise) === 'cluster' && advanced ? String(methodParameters(exercise).reps_bloco) : i === 0 ? targetReps || 'reps' : 'reps'} onChange={e => updateRecord(i, 'reps', e.target.value)} onFocus={e => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })} disabled={disabled || record.completed || remaining > 0} className="h-11 text-center text-base min-w-0" />
      <Button size="icon" variant="outline" aria-label={`Confirmar série ${index + 1} ${record.label}`} className={`h-11 w-11 ${record.completed ? 'bg-chart-3/15 border-chart-3/50 text-chart-3 hover:bg-chart-3/20 hover:text-chart-3' : ''}`} disabled={disabled || (!record.completed && (remaining > 0 || (advanced && i !== next) || !(Number(record.reps) > 0)))} onClick={() => confirm(i)}><Check className="h-4 w-4" /></Button>
    </div>)}
  </div></WorkoutSetCard>;
}