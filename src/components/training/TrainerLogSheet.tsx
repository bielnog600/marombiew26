import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, History, Dumbbell, Check, ChevronDown, Pencil, Timer, X, Play, Plus, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedTrainingDay, ParsedExercise } from '@/lib/trainingResultParser';
import { useRestTimer } from '@/hooks/useRestTimer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ExerciseLogCard from './ExerciseLogCard';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
import AiEditExerciseDialog, { type AiEditAction } from './AiEditExerciseDialog';
import { applyActionsToDay } from './AiEditAllDaysDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  calendarEventId?: string | null;
}

export const TrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentId, days, phase }) => {
  const { user } = useAuth();
  const { active, close, cancel, finish, patchState } = useAdminTrainerSession();
  const [state, setState] = useState<Record<number, ExerciseState>>({});
  const [loading, setLoading] = useState(true);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [exercisesList, setExercisesList] = useState<{ id: string; nome: string; grupo_muscular: string; imagem_url?: string | null }[]>([]);
  const [currentExercises, setCurrentExercises] = useState<ParsedExercise[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const { restTimer, startTimer: setRestTimer, stopTimer, adjustTimer } = useRestTimer();

  const session = {
    id: active?.id ?? null,
    startedAt: active?.startedAtReal ?? null,
    calendarEventId: (active && active.calendarEventIds[studentId]) || null,
  };
  const [now, setNow] = useState(() => Date.now());
  const startedMs = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const durationSeconds = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
    if (!open) stopTimer();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [open]);

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
  const persist = (nextState: Record<number, ExerciseState>, nextExercises?: ParsedExercise[]) => {
    if (!day) return;
    saveDraft(studentId, day.day, daySignature, nextState, nextExercises ?? currentExercises);
  };

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
      const draft = loadDraft(studentId, day.day, daySignature);
      const baseExercises: ParsedExercise[] = draft?.exercises && draft.exercises.length > 0
        ? draft.exercises
        : day.exercises;
      baseExercises.forEach((ex, i) => {
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
      if (draft) {
        Object.keys(initial).forEach((k) => {
          const idx = Number(k);
          if (draft.plans?.[idx]) {
            initial[idx].plan = draft.plans[idx];
            // Ensure sets matches plan length
            if (initial[idx].sets.length !== draft.plans[idx].length) {
              initial[idx].sets = draft.plans[idx].map(
                (_, i) => initial[idx].sets[i] || { weight: '', reps: '' },
              );
            }
          }
          if (draft.sets?.[idx]) initial[idx].sets = initial[idx].sets.map((s, i) => draft.sets[idx][i] || s);
          if (draft.notes?.[idx]) initial[idx].notes = draft.notes[idx];
          if (draft.savedSets?.[idx]) initial[idx].savedSets = draft.savedSets[idx];
          if (draft.exerciseNames?.[idx]) initial[idx].exerciseName = draft.exerciseNames[idx];
        });
      }
      await Promise.all(
        baseExercises.map(async (ex, i) => {
          const name = initial[i]?.exerciseName || ex.exercise;
          if (!name) return;
          const { data } = await supabase
            .from('exercise_set_logs')
            .select('weight_kg, reps, performed_at')
            .eq('student_id', studentId)
            .ilike('exercise_name', normalizeExName(name))
            .order('performed_at', { ascending: false })
            .limit(1);
          if (data?.[0]) {
            initial[i].lastWeight = data[0].weight_kg;
            initial[i].lastReps = data[0].reps;
            initial[i].lastDate = data[0].performed_at;
          }
        })
      );
      setCurrentExercises(baseExercises);
      setState(initial);
      setLoading(false);
    })();
  }, [open, day?.day, daySignature, studentId]);

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetEntry, value: string) => {
    setState((prev) => {
      const copy = { ...prev };
      copy[exIdx].sets[setIdx][field] = value;
      saveDraft(studentId, day.day, daySignature, copy, currentExercises);
      return { ...copy };
    });
  };

  const updateNotes = (exIdx: number, value: string) => {
    setState((prev) => {
      const next = { ...prev, [exIdx]: { ...prev[exIdx], notes: value } };
      saveDraft(studentId, day.day, daySignature, next, currentExercises);
      return next;
    });
  };

  const updateExerciseName = (exIdx: number, name: string) => {
    setState((prev) => {
      const next = { ...prev, [exIdx]: { ...prev[exIdx], exerciseName: name } };
      const newExercises = currentExercises.map((e, i) => i === exIdx ? { ...e, exercise: name } : e);
      setCurrentExercises(newExercises);
      saveDraft(studentId, day.day, daySignature, next, newExercises);
      return next;
    });
  };

  const addSet = (exIdx: number) => {
    setState((prev) => {
      const cur = prev[exIdx];
      if (!cur) return prev;
      const lastPlan = cur.plan[cur.plan.length - 1];
      const newPlan: SetPlan[] = [...cur.plan, { kind: 'work', targetReps: lastPlan?.targetReps || '' }];
      const newSets: SetEntry[] = [...cur.sets, { weight: '', reps: '' }];
      const next = { ...prev, [exIdx]: { ...cur, plan: newPlan, sets: newSets } };
      saveDraft(studentId, day.day, daySignature, next, currentExercises);
      return next;
    });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setState((prev) => {
      const cur = prev[exIdx];
      if (!cur || cur.sets.length <= 1) return prev;
      const newPlan = cur.plan.filter((_, i) => i !== setIdx);
      const newSets = cur.sets.filter((_, i) => i !== setIdx);
      const next = { ...prev, [exIdx]: { ...cur, plan: newPlan, sets: newSets } };
      saveDraft(studentId, day.day, daySignature, next, currentExercises);
      return next;
    });
  };

  const removeExercise = (exIdx: number) => {
    const newExercises = currentExercises.filter((_, i) => i !== exIdx);
    const newState: Record<number, ExerciseState> = {};
    currentExercises.forEach((_, i) => {
      if (i < exIdx) newState[i] = state[i];
      else if (i > exIdx) newState[i - 1] = state[i];
    });
    setCurrentExercises(newExercises);
    setState(newState);
    saveDraft(studentId, day.day, daySignature, newState, newExercises);
  };

  const addExercise = () => {
    const newEx: ParsedExercise = {
      exercise: '',
      series: '3',
      series2: '',
      reps: '8-12',
      rir: '',
      pause: '60s',
      description: '',
      variation: '',
    };
    const newExercises = [...currentExercises, newEx];
    const newIdx = newExercises.length - 1;
    const plan = buildSetPlan(newEx.series, newEx.series2, newEx.reps);
    const newState = {
      ...state,
      [newIdx]: {
        sets: plan.map(() => ({ weight: '', reps: '' })),
        plan,
        notes: '',
        saving: false,
        lastWeight: null,
        lastReps: null,
        lastDate: null,
        savedSets: 0,
        exerciseName: '',
      },
    };
    setCurrentExercises(newExercises);
    setState(newState);
    saveDraft(studentId, day.day, daySignature, newState, newExercises);
  };

  const applyAiActions = (actions: AiEditAction[]) => {
    if (!day) return;
    const fakeDay = { ...day, exercises: currentExercises };
    const updated = applyActionsToDay(fakeDay, actions);
    const newExercises = updated.exercises;
    const newState: Record<number, ExerciseState> = {};
    newExercises.forEach((ex, i) => {
      // Try to preserve sets if same name at same idx
      const prev = state[i];
      const sameName = prev && (prev.exerciseName || '').trim().toUpperCase() === (ex.exercise || '').trim().toUpperCase();
      if (sameName) {
        newState[i] = { ...prev, exerciseName: ex.exercise || prev.exerciseName };
      } else {
        const plan = buildSetPlan(ex.series, ex.series2, ex.reps);
        newState[i] = {
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
      }
    });
    setCurrentExercises(newExercises);
    setState(newState);
    saveDraft(studentId, day.day, daySignature, newState, newExercises);
    toast.success('Alterações da IA aplicadas');
  };

  const saveExercise = async (exIdx: number) => {
    const ex = currentExercises[exIdx];
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
      saveDraft(studentId, day.day, daySignature, next, currentExercises);
      return next;
    });

    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Série(s) registrada(s)');
  };

  const handleFinishSession = async () => {
    if (!session.startedAt || !active) return;
    setFinishing(true);
    try {
      const exercisesCompleted = Object.values(state).filter(ex => ex.savedSets > 0).length;
      await finish({
        [studentId]: {
          exercisesCompleted,
          totalExercises: currentExercises.length,
        },
      });
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
            <div className="flex items-center gap-2">
              {session.startedAt && (
                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                  <Timer className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-sm font-mono font-bold text-primary">{formatDuration(durationSeconds)}</span>
                </div>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive">
                    Cancelar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar sessão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A sessão será marcada como abandonada e não contará como treino concluído. As séries já salvas no histórico permanecem.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={cancelling}
                      onClick={async () => {
                        setCancelling(true);
                        try {
                          await cancel();
                          if (day) localStorage.removeItem(draftKey(studentId, day.day, daySignature));
                        } finally {
                          setCancelling(false);
                        }
                      }}
                    >
                      Cancelar sessão
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              Editar treino com IA
            </Button>
            {currentExercises.map((ex, exIdx) => state[exIdx] ? (
              <ExerciseLogCard
                key={exIdx}
                exIdx={exIdx}
                ex={ex}
                st={state[exIdx]}
                exercisesList={exercisesList}
                studentId={studentId}
                onUpdateSet={updateSet}
                onUpdateNotes={updateNotes}
                onSaveExercise={saveExercise}
                onStartRestTimer={setRestTimer}
                onExerciseNameChange={(name) => updateExerciseName(exIdx, name)}
                onAddSet={addSet}
                onRemoveSet={removeSet}
                onRemoveExercise={removeExercise}
                ExerciseNamePicker={ExerciseNamePicker}
                HistoryPopover={HistoryPopover}
                parsePauseSeconds={parsePauseSeconds}
              />
            ) : null)}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 h-10 border-dashed border-primary/40 text-primary hover:bg-primary/10"
              onClick={addExercise}
            >
              <Plus className="h-4 w-4" />
              Adicionar exercício
            </Button>
            <div className="pt-6 pb-8">
              <Button className="w-full h-12 text-base font-bold" onClick={handleFinishSession} disabled={finishing || Object.values(state).every(ex => ex.savedSets === 0)}>
                {finishing ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2" />}
                Finalizar Sessão
              </Button>
            </div>
          </div>
        )}

        {day && (
          <AiEditExerciseDialog
            open={aiOpen}
            onOpenChange={setAiOpen}
            dayName={day.day}
            currentExercises={currentExercises}
            exerciseCatalog={exercisesList.map((e) => ({ nome: e.nome, grupo_muscular: e.grupo_muscular, imagem_url: e.imagem_url }))}
            studentId={studentId}
            onApply={applyAiActions}
          />
        )}

        {restTimer && (
          <div
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => stopTimer()}
              className="absolute top-4 right-4 p-2 rounded-full bg-secondary hover:bg-secondary/80"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6 font-semibold">
              Descanso
            </p>
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--secondary))" strokeWidth="6" />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 46}
                  strokeDashoffset={
                    2 * Math.PI * 46 * (1 - (restTimer.total > 0 ? restTimer.remaining / restTimer.total : 0))
                  }
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              {restTimer.remaining > 0 ? (
                <span className="text-4xl font-bold tabular-nums">
                  {Math.floor(restTimer.remaining / 60)}:
                  {String(restTimer.remaining % 60).padStart(2, '0')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRestTimer(restTimer.total, restTimer.exIdx)}
                  className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
                  aria-label="Reiniciar descanso"
                >
                  <Play className="h-8 w-8 text-primary ml-1" />
                </button>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => adjustTimer(-15)}>-15s</Button>
              <Button variant="outline" size="sm" onClick={() => adjustTimer(15)}>+15s</Button>
              <Button size="sm" onClick={() => stopTimer()}>Pular</Button>
            </div>

            {/* Campos de registro de séries do exercício atual */}
            {(() => {
              const timerExIdx = restTimer.exIdx;
              const timerSt = state[timerExIdx];
              const timerEx = day?.exercises[timerExIdx];
              if (!timerSt || !timerEx) return null;
              return (
                <div className="mt-6 w-full max-w-sm px-4 space-y-2">
                  <p className="text-[11px] font-semibold text-center text-muted-foreground truncate">
                    {timerSt.exerciseName || timerEx.exercise}
                  </p>
                  <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                    {timerSt.sets.map((s, setIdx) => {
                      const p = timerSt.plan?.[setIdx] ?? { kind: 'work' as const, targetReps: '' };
                      const isRecon = p?.kind === 'recon';
                      return (
                        <div key={setIdx} className="grid grid-cols-[60px_1fr_1fr] items-center gap-2">
                          <span
                            className={`text-[9px] font-bold text-center px-1 py-0.5 rounded ${
                              isRecon
                                ? 'bg-primary/15 text-primary border border-primary/30'
                                : 'bg-secondary text-foreground'
                            }`}
                          >
                            {isRecon ? `REC #${setIdx + 1}` : `#${setIdx + 1}`}
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            placeholder="kg"
                            value={s.weight}
                            onChange={(e) => updateSet(timerExIdx, setIdx, 'weight', e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            inputMode="numeric"
                            placeholder={p?.targetReps ? `${p.targetReps}` : 'reps'}
                            value={s.reps}
                            onChange={(e) => updateSet(timerExIdx, setIdx, 'reps', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default TrainerLogSheet;
