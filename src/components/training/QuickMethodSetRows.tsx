import { useEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { makeSubRecords, methodParameters, seriesMethod, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { WorkoutSetCard, type SetRestPresentation } from './WorkoutSetCard';

export function QuickMethodSetRows({ exercise, set, index, targetReps, weightPlaceholder, disabled, onChange, onComplete, restPresentation }: {
  exercise: ParsedExercise; set: MethodSetEntry; index: number; targetReps?: string;
  weightPlaceholder: string; disabled: boolean;
  onChange: (entry: MethodSetEntry) => void; onComplete: (entry: MethodSetEntry) => void;
  restPresentation?: SetRestPresentation;
}) {
  const cluster = seriesMethod(exercise) === 'cluster';
  const params = methodParameters(exercise);
  const records = (set.subRecords ?? makeSubRecords(exercise, set)).map((part, i) =>
    i > 0 && !part.completed ? { ...part, weight: set.subRecords?.[0]?.weight ?? set.weight } : part);
  const next = records.findIndex(part => !part.completed);
  const [now, setNow] = useState(Date.now);
  const [less, setLess] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const vibration = useRef<string>('');
  const remaining = set.pauseUntil ? Math.max(0, Math.ceil((set.pauseUntil - now) / 1000)) : 0;
  useEffect(() => {
    if (!set.pauseUntil) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [set.pauseUntil]);
  useEffect(() => {
    if (remaining > 0 && remaining <= 3) {
      const key = `${set.pauseUntil}:${remaining}`;
      if (vibration.current !== key) {
        vibration.current = key;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(80);
      }
    }
    if (set.pauseUntil && set.pauseUntil <= now) onChange({ ...set, pauseUntil: undefined });
  }, [remaining, set.pauseUntil, now, onChange]);

  const update = (partIndex: number, field: 'weight' | 'reps', value: string) => {
    const updated = records.map((part, i) => i === partIndex || (partIndex === 0 && field === 'weight' && !part.completed)
      ? { ...part, [field]: value } : part);
    onChange({ ...set, weight: updated[0].weight, reps: updated[0].reps, subRecords: updated });
  };
  const confirm = (reps: number) => {
    if (disabled || remaining > 0 || next < 0 || !Number.isInteger(reps) || reps <= 0) return;
    const updated = records.map((part, i) => i === next
      ? { ...part, weight: records[0].weight, reps: String(reps), completed: true } : part);
    const completed = updated.every(part => part.completed);
    const entry = { ...set, weight: updated[0].weight, reps: updated[0].reps, subRecords: updated, completed,
      pauseUntil: completed ? undefined : Date.now() + params.pausa_s * 1000 };
    setNow(Date.now());
    setLess(false);
    onChange(entry);
    if (completed) onComplete(entry);
  };
  const progress = Math.min(1, remaining / Math.max(params.pausa_s, remaining));
  const circumference = 2 * Math.PI * 52;
  return <WorkoutSetCard index={index} exIdx={-1} done={!!set.completed} {...restPresentation} className="bg-secondary/40">
    <div className="p-2 space-y-2" data-testid="method-set">
      <p className={`text-xs font-semibold ${restPresentation?.next ? 'text-primary' : ''}`}>
        Série {index + 1}{records.some(part => part.completed) ? ` · ${records.map(part => part.reps || '—').join(' + ')}` : ''}
      </p>
      {records.map((part, i) => {
        const correction = part.completed && editing === i;
        const primary = !cluster && i === 0;
        return <div key={i} className="grid grid-cols-[minmax(58px,1fr)_1fr_1fr_44px] gap-1.5 items-center">
          <span className="text-[10px] text-muted-foreground">{part.label}</span>
          <Input aria-label={`Série ${index + 1} ${part.label} carga`} inputMode="decimal" value={part.weight} placeholder={weightPlaceholder}
            disabled={disabled || (!correction && (part.completed || i > 0))} className="h-11 min-w-0 text-center text-base"
            onChange={e => update(i, 'weight', e.target.value)} />
          <Input aria-label={`Série ${index + 1} ${part.label} reps`} inputMode="numeric" value={part.reps}
            placeholder={cluster ? String(params.reps_bloco) : primary ? targetReps || 'reps' : 'reps'}
            disabled={disabled || (!correction && (!primary || part.completed || remaining > 0))}
            className="h-11 min-w-0 text-center text-base" onChange={e => update(i, 'reps', e.target.value)} />
          {part.completed ? <Button size="icon" variant="outline" className="h-11 w-11 text-chart-3" disabled={disabled}
            aria-label={`Corrigir série ${index + 1} ${part.label}`} onClick={() => setEditing(correction ? null : i)}>
            {correction ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button> : primary ? <Button size="icon" variant="outline" className="h-11 w-11" aria-label={`Confirmar série ${index + 1} Principal`}
            disabled={disabled || remaining > 0 || !(Number(part.reps) > 0)} onClick={() => confirm(Number(part.reps))}><Check className="h-4 w-4" /></Button>
            : <span className="text-center text-chart-3">{i === next ? '' : '·'}</span>}
        </div>;
      })}
      {remaining > 0 && next >= 0 ? <div className="flex flex-col items-center gap-2 py-2" data-testid="internal-method-rest">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="70" cy="70" r="52" fill="none" strokeWidth="8" className="stroke-secondary" />
            <circle cx="70" cy="70" r="52" fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
          </svg>
          <span role="timer" className="absolute inset-0 flex items-center justify-center text-4xl font-bold tabular-nums">{remaining}</span>
        </div>
        <p className="text-sm">Próximo: {records[next].label}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11" disabled={disabled} onClick={() => onChange({ ...set, pauseUntil: Math.max(Date.now(), set.pauseUntil ?? 0) + 5000 })}>+5s</Button>
          <Button className="h-11" disabled={disabled} onClick={() => { setNow(Date.now()); onChange({ ...set, pauseUntil: undefined }); }}>Ir agora</Button>
        </div>
      </div> : next >= 0 && (cluster || next > 0) && <div className="space-y-2" aria-label={records[next].label}>
        {cluster ? <>
          <Button className="h-14 w-full text-base" disabled={disabled} onClick={() => confirm(params.reps_bloco)}>Fiz {params.reps_bloco} reps</Button>
          {params.reps_bloco > 1 && <Button variant="link" className="h-11" disabled={disabled} onClick={() => setLess(!less)}>Fiz menos</Button>}
        </> : null}
        {(!cluster || less) && <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: cluster ? params.reps_bloco - 1 : 8 }, (_, i) => i + 1).map(reps =>
            <Button key={reps} variant="outline" className="h-11" disabled={disabled} aria-label={`Registrar ${reps} reps em ${records[next].label}`} onClick={() => confirm(reps)}>{reps}</Button>)}
        </div>}
      </div>}
    </div>
  </WorkoutSetCard>;
}