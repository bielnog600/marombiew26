import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, History, Dumbbell, Check, ChevronDown, Pencil, Timer, X, Play } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';
import { useRestTimer } from '@/hooks/useRestTimer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import {
  normalizeExName,
  buildSetPlan,
  makeDaySignature,
  draftKey,
  loadDraft,
  saveDraft,
  parsePauseSeconds,
  type SetEntry,
  type SetPlan,
} from './TrainerLogSheetUtils';

export interface HistoryRow {
  performed_at: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
}

export const ExerciseNamePicker: React.FC<{
  value: string;
  original: string;
  options: { id: string; nome: string; grupo_muscular: string }[];
  onChange: (name: string) => void;
}> = ({ value, original, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const isChanged = value && original && value.trim().toLowerCase() !== original.trim().toLowerCase();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1 text-left max-w-full"
          title="Clique para trocar o exercício"
        >
          <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
            {value || original || 'Sem nome'}
          </span>
          <Pencil className="h-3 w-3 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100" />
          {isChanged && (
            <span className="text-[9px] font-bold uppercase bg-primary/15 text-primary border border-primary/30 rounded px-1 py-px shrink-0">
              alterado
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar exercício..." />
          <CommandList>
            <CommandEmpty>Nenhum exercício encontrado.</CommandEmpty>
            {original && (
              <CommandGroup heading="Original">
                <CommandItem
                  value={original}
                  onSelect={() => {
                    onChange(original);
                    setOpen(false);
                  }}
                >
                  <Check className={`h-3 w-3 mr-2 ${value === original ? 'opacity-100' : 'opacity-0'}`} />
                  {original}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Catálogo">
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={`${opt.nome} ${opt.grupo_muscular}`}
                  onSelect={() => {
                    onChange(opt.nome);
                    setOpen(false);
                  }}
                >
                  <Check className={`h-3 w-3 mr-2 ${value === opt.nome ? 'opacity-100' : 'opacity-0'}`} />
                  <div className="min-w-0">
                    <p className="truncate">{opt.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{opt.grupo_muscular}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const HistoryPopover: React.FC<{
  studentId: string;
  exerciseName: string;
  last: { lastWeight: number | null; lastReps: number | null; lastDate: string | null };
}> = ({ studentId, exerciseName, last }) => {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (rows) return;
    setLoading(true);
    const { data } = await supabase
      .from('exercise_set_logs')
      .select('performed_at, set_number, weight_kg, reps')
      .eq('student_id', studentId)
      .ilike('exercise_name', normalizeExName(exerciseName))
      .order('performed_at', { ascending: false })
      .limit(200);
    setRows((data as HistoryRow[]) || []);
    setLoading(false);
  };

  const groups: Record<string, HistoryRow[]> = {};
  (rows || []).forEach((r) => {
    const d = format(new Date(r.performed_at), 'dd/MM/yyyy', { locale: ptBR });
    if (!groups[d]) groups[d] = [];
    groups[d].push(r);
  });

  return (
    <Popover onOpenChange={(o) => o && load()}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[10px] shrink-0"
        >
          <History className="h-3 w-3" />
          {last.lastWeight !== null
            ? <span><strong className="text-foreground">{last.lastWeight}kg × {last.lastReps ?? '—'}</strong></span>
            : 'Histórico'}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2 max-h-80 overflow-y-auto">
        <p className="text-xs font-semibold mb-2 px-1">Histórico — {exerciseName}</p>
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        )}
        {!loading && rows && rows.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1 py-2">Sem registros anteriores.</p>
        )}
        {!loading && rows && rows.length > 0 && (
          <div className="space-y-2">
            {Object.entries(groups).map(([date, sets]) => (
              <div key={date} className="rounded border border-border/50 p-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">{date}</p>
                <div className="space-y-0.5">
                  {sets
                    .sort((a, b) => a.set_number - b.set_number)
                    .map((r, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Série {r.set_number}</span>
                        <span className="font-medium">
                          {r.weight_kg ?? '—'}kg × {r.reps ?? '—'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  days: ParsedTrainingDay[];
  phase?: string | null;
}

export interface ExerciseState {
  sets: SetEntry[];
  plan: SetPlan[];
  notes: string;
  saving: boolean;
  lastWeight: number | null;
  lastReps: number | null;
  lastDate: string | null;
  savedSets: number;
  exerciseName: string;
}

export interface SessionState {
  id: string | null;
  startedAt: string | null;
  durationSeconds: number;
  isPaused: boolean;
}

export const TrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentId, days, phase }) => {
  const [state, setState] = useState<Record<number, ExerciseState>>({});
  const [loading, setLoading] = useState(false);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [exercisesList, setExercisesList] = useState<{ id: string; nome: string; grupo_muscular: string; imagem_url?: string | null }[]>([]);
  const { restTimer, startTimer: setRestTimer, stopTimer, adjustTimer } = useRestTimer();
  
  const [session, setSession] = useState<SessionState>({
    id: null,
    startedAt: null,
    durationSeconds: 0,
    isPaused: true
  });
  const [finishing, setFinishing] = useState(false);

  const parsePauseSeconds = (raw?: string | null): number => {
    if (!raw) return 60;
    const s = String(raw).trim().toLowerCase();
    const mmss = s.match(/^(\d+):(\d{1,2})$/);
    if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    if (/min/.test(s)) {
      const n = parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.'));
      return Math.round((isFinite(n) ? n : 1) * 60);
    }
    const n = parseInt(s.replace(/[^\d]/g, ''), 10);
    return isFinite(n) && n > 0 ? n : 60;
  };

  useEffect(() => {
    if (!open) {
      stopTimer();
      setSession(prev => ({ ...prev, isPaused: true }));
    } else {
      if (!session.startedAt) {
        setSession({
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
          durationSeconds: 0,
          isPaused: false
        });
      } else {
        setSession(prev => ({ ...prev, isPaused: false }));
      }
    }
  }, [open]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (open && !session.isPaused) {
      interval = setInterval(() => {
        setSession(prev => ({ ...prev, durationSeconds: prev.durationSeconds + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [open, session.isPaused]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0 
      ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const day = days[activeDayIdx] || null;
  const daySignature = makeDaySignature(day);

  useEffect(() => {
    if (!open || exercisesList.length > 0) return;
    (async () => {
      const { data } = await supabase.from('exercises').select('id, nome, grupo_muscular, imagem_url').order('nome');
      if (data) setExercisesList(data);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || days.length === 0) return;
    const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const today = weekdays[new Date().getDay()];
    const idx = days.findIndex((d) => d.day.toLowerCase().includes(today));
    setActiveDayIdx(idx >= 0 ? idx : 0);
  }, [open]);

  useEffect(() => {
    if (!open || !day) return;
    setLoading(true);
    (async () => {
      const initial: Record<number, ExerciseState> = {};
      day.exercises.forEach((ex, i) => {
        const plan = buildSetPlan(ex.series, ex.series2, ex.reps);
        initial[i] = {
          sets: plan.map(() => ({ weight: '', reps: '' })),
          plan,
          notes: '',
          saving: false,
          lastWeight: null,
          lastReps: null,
          lastDate: null,
          savedSets: 0,
          exerciseName: ex.exercise || '',
        };
      });
      const draft = loadDraft(studentId, day.day, daySignature);
      if (draft) {
        Object.keys(initial).forEach((k) => {
          const idx = Number(k);
          if (draft.sets?.[idx]) initial[idx].sets = initial[idx].sets.map((s, i) => draft.sets[idx][i] || s);
          if (draft.notes?.[idx]) initial[idx].notes = draft.notes[idx];
          if (draft.savedSets?.[idx]) initial[idx].savedSets = draft.savedSets[idx];
          if (draft.exerciseNames?.[idx]) initial[idx].exerciseName = draft.exerciseNames[idx];
        });
      }
      await Promise.all(
        day.exercises.map(async (ex, i) => {
          if (!ex.exercise) return;
          const { data } = await supabase
            .from('exercise_set_logs')
            .select('weight_kg, reps, performed_at')
            .eq('student_id', studentId)
            .ilike('exercise_name', normalizeExName(ex.exercise))
            .order('performed_at', { ascending: false })
            .limit(1);
          if (data?.[0]) {
            initial[i].lastWeight = data[0].weight_kg;
            initial[i].lastReps = data[0].reps;
            initial[i].lastDate = data[0].performed_at;
          }
        })
      );
      setState(initial);
      setLoading(false);
    })();
  }, [open, day?.day, daySignature, studentId]);

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetEntry, value: string) => {
    setState((prev) => {
      const copy = { ...prev };
      copy[exIdx].sets[setIdx][field] = value;
      saveDraft(studentId, day.day, daySignature, copy);
      return { ...copy };
    });
  };

  const updateNotes = (exIdx: number, value: string) => {
    setState((prev) => {
      const next = { ...prev, [exIdx]: { ...prev[exIdx], notes: value } };
      saveDraft(studentId, day.day, daySignature, next);
      return next;
    });
  };

  const saveExercise = async (exIdx: number) => {
    const ex = day.exercises[exIdx];
    const st = state[exIdx];
    if (!ex || !st) return;
    const exerciseName = (st.exerciseName || ex.exercise || '').trim();
    const validSets = st.sets
      .map((s, idx) => ({ idx, weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
      .filter((s) => !Number.isNaN(s.weight) || !Number.isNaN(s.reps));

    if (validSets.length === 0) {
      toast.error('Preencha ao menos uma série');
      return;
    }

    setState((prev) => ({ ...prev, [exIdx]: { ...prev[exIdx], saving: true } }));

    const rows = validSets.map((s) => ({
      student_id: studentId,
      session_id: session.id,
      exercise_name: normalizeExName(exerciseName),
      set_number: s.idx + 1,
      weight_kg: Number.isNaN(s.weight) ? null : s.weight,
      reps: Number.isNaN(s.reps) ? null : s.reps,
      day_name: day.day,
      phase: phase || null,
      performed_at: new Date().toISOString(),
      source: 'admin',
    }));

    const { error } = await supabase.from('exercise_set_logs').insert(rows);

    setState((prev) => {
      const cur = prev[exIdx];
      const savedIdx = new Set(validSets.map((s) => s.idx));
      const nextSets = cur.sets.map((s, i) => (savedIdx.has(i) ? { weight: '', reps: '' } : s));
      const next = { ...prev, [exIdx]: { ...cur, saving: false, sets: nextSets, savedSets: cur.savedSets + rows.length } };
      saveDraft(studentId, day.day, daySignature, next);
      return next;
    });

    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Série(s) registrada(s)');
  };

  const handleFinishSession = async () => {
    if (!session.startedAt) return;
    setFinishing(true);
    try {
      const durationMinutes = Math.ceil(session.durationSeconds / 60);
      const exercisesCompleted = Object.values(state).filter(ex => ex.savedSets > 0).length;
      const { error } = await supabase.from('workout_sessions').insert({
        id: session.id,
        student_id: studentId,
        day_name: day.day,
        phase: phase || null,
        started_at: session.startedAt,
        completed_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        exercises_completed: exercisesCompleted,
        total_exercises: day.exercises.length,
        status: 'completed',
        source: 'admin',
        executed_by: 'coach',
        session_mode: 'individual'
      });
      if (error) throw error;
      toast.success('Treino finalizado!');
      onOpenChange(false);
      localStorage.removeItem(draftKey(studentId, day.day, daySignature));
    } catch (err: any) {
      toast.error('Erro ao finalizar: ' + err.message);
    } finally {
      setFinishing(false);
    }
  };

  if (!day) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              Modo Treino
            </div>
            {session.startedAt && (
              <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                <Timer className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-mono font-bold text-primary">{formatDuration(session.durationSeconds)}</span>
              </div>
            )}
          </SheetTitle>
          <SheetDescription>Registre o treino do aluno em tempo real.</SheetDescription>
        </SheetHeader>

        {days.length > 1 && (
          <div className="flex gap-1.5 p-2 mt-3 rounded-lg bg-secondary/40 border border-border/40 overflow-x-auto">
            {days.map((d, i) => (
              <Button key={i} size="sm" variant={activeDayIdx === i ? 'default' : 'ghost'} onClick={() => setActiveDayIdx(i)}>{d.day}</Button>
            ))}
          </div>
        )}

        {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div> : (
          <div className="space-y-3 mt-4">
            {day.exercises.map((ex, exIdx) => (
              <Card key={exIdx} className="border-border/60">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      {(() => {
                        const m = state[exIdx]?.exerciseName ? findBestExerciseMatch(state[exIdx].exerciseName, exercisesList as any) : undefined;
                        const url = (m as any)?.imagem_url;
                        return url ? <img src={url} className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <div className="h-10 w-10 shrink-0 rounded-md bg-muted flex items-center justify-center"><Dumbbell className="h-4 w-4" /></div>;
                      })()}
                      <div className="min-w-0 flex-1">
                        <ExerciseNamePicker
                          value={state[exIdx]?.exerciseName || ''}
                          options={exercisesList}
                          original={ex.exercise || ''}
                          onChange={(name) => setState(prev => ({ ...prev, [exIdx]: { ...prev[exIdx], exerciseName: name } }))}
                        />
                        <p className="text-[10px] text-muted-foreground">Prescrição: {ex.series} séries × {ex.reps}</p>
                      </div>
                    </div>
                    {state[exIdx]?.exerciseName && <HistoryPopover studentId={studentId} exerciseName={state[exIdx].exerciseName} last={state[exIdx]} />}
                  </div>
                  <div className="space-y-1.5">
                    {state[exIdx]?.sets.map((s, sIdx) => (
                      <div key={sIdx} className="grid grid-cols-[68px_1fr_1fr] items-center gap-2">
                        <span className="text-[9px] font-bold text-center bg-secondary rounded py-0.5">#{sIdx + 1}</span>
                        <Input type="number" placeholder="kg" value={s.weight} onChange={(e) => updateSet(exIdx, sIdx, 'weight', e.target.value)} className="h-8 text-xs" />
                        <Input type="number" placeholder="reps" value={s.reps} onChange={(e) => updateSet(exIdx, sIdx, 'reps', e.target.value)} className="h-8 text-xs" />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => saveExercise(exIdx)} disabled={state[exIdx]?.saving}>
                      {state[exIdx]?.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Salvar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="pt-6 pb-8">
              <Button className="w-full h-12 text-base font-bold" onClick={handleFinishSession} disabled={finishing || Object.values(state).every(ex => ex.savedSets === 0)}>
                {finishing ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2" />}
                Finalizar Sessão
              </Button>
            </div>
          </div>
        )}

        {restTimer && (
          <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center">
            <Button variant="ghost" className="absolute top-4 right-4" onClick={() => stopTimer()}><X /></Button>
            <div className="text-4xl font-bold mb-8">{Math.floor(restTimer.remaining / 60)}:{String(restTimer.remaining % 60).padStart(2, '0')}</div>
            <div className="flex gap-2">
              <Button onClick={() => adjustTimer(-15)}>-15s</Button>
              <Button onClick={() => adjustTimer(15)}>+15s</Button>
              <Button onClick={() => stopTimer()}>Pular</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default TrainerLogSheet;
