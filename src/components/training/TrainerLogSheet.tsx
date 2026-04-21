import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, History, Dumbbell, Check, ChevronDown, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  days: ParsedTrainingDay[];
  phase?: string | null;
}

interface SetEntry {
  weight: string;
  reps: string;
}

interface ExerciseState {
  sets: SetEntry[];
  plan: SetPlan[];
  notes: string;
  saving: boolean;
  lastWeight: number | null;
  lastReps: number | null;
  lastDate: string | null;
  savedSets: number; // how many sets already persisted now
  exerciseName: string; // editable name (can override the prescribed one)
}

const splitComposed = (reps: string): [string, string] => {
  const parts = (reps || '').split('+').map((p) => p.trim());
  return [parts[0] || '', parts[1] || parts[0] || ''];
};

interface SetPlan {
  kind: 'recon' | 'work';
  targetReps: string;
}

const buildSetPlan = (series: string, series2: string, reps: string): SetPlan[] => {
  const s1 = parseInt(String(series ?? '') || '0', 10) || 0;
  const s2 = parseInt(String(series2 ?? '') || '0', 10) || 0;
  const [reconReps, workReps] = splitComposed(reps ?? '');
  const plan: SetPlan[] = [];
  if (s1 > 0 && s2 > 0) {
    for (let i = 0; i < s1; i++) plan.push({ kind: 'recon', targetReps: reconReps || reps || '' });
    for (let i = 0; i < s2; i++) plan.push({ kind: 'work', targetReps: workReps || reps || '' });
  } else {
    const total = s2 > 0 ? s2 : (s1 > 0 ? s1 : 3);
    for (let i = 0; i < total; i++) plan.push({ kind: 'work', targetReps: reps || '' });
  }
  return plan;
};

// ===== Local draft persistence (offline-safe) =====
const draftKey = (studentId: string, dayName: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return `trainerlog:${studentId}:${dayName}:${today}`;
};

interface DraftShape {
  sets: Record<number, SetEntry[]>;
  notes: Record<number, string>;
  savedSets: Record<number, number>;
  exerciseNames?: Record<number, string>;
}

const loadDraft = (studentId: string, dayName: string): DraftShape | null => {
  try {
    const raw = localStorage.getItem(draftKey(studentId, dayName));
    return raw ? (JSON.parse(raw) as DraftShape) : null;
  } catch {
    return null;
  }
};

const saveDraft = (studentId: string, dayName: string, state: Record<number, ExerciseState>) => {
  try {
    const draft: DraftShape = { sets: {}, notes: {}, savedSets: {}, exerciseNames: {} };
    Object.entries(state).forEach(([k, v]) => {
      const idx = Number(k);
      draft.sets[idx] = v.sets;
      draft.notes[idx] = v.notes;
      draft.savedSets[idx] = v.savedSets;
      draft.exerciseNames![idx] = v.exerciseName;
    });
    localStorage.setItem(draftKey(studentId, dayName), JSON.stringify(draft));
  } catch {
    // ignore quota errors
  }
};

interface HistoryRow {
  performed_at: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
}

const HistoryPopover: React.FC<{
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
      .ilike('exercise_name', exerciseName)
      .order('performed_at', { ascending: false })
      .limit(40);
    setRows((data as HistoryRow[]) || []);
    setLoading(false);
  };

  // Group by date
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

export const TrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentId, days, phase }) => {
  const [state, setState] = useState<Record<number, ExerciseState>>({});
  const [loading, setLoading] = useState(false);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [exercisesList, setExercisesList] = useState<{ id: string; nome: string; grupo_muscular: string }[]>([]);
  const day = days[activeDayIdx] || null;

  // Load exercises catalog once when sheet opens
  useEffect(() => {
    if (!open || exercisesList.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from('exercises')
        .select('id, nome, grupo_muscular')
        .order('nome', { ascending: true });
      if (data) setExercisesList(data);
    })();
  }, [open, exercisesList.length]);

  // Auto-select today's weekday on open
  useEffect(() => {
    if (!open || days.length === 0) return;
    const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const today = weekdays[new Date().getDay()];
    const idx = days.findIndex((d) => d.day.toLowerCase().includes(today));
    setActiveDayIdx(idx >= 0 ? idx : 0);
  }, [open, days.length]);

  useEffect(() => {
    if (!open || !day) return;
    setLoading(true);
    setState({});
    (async () => {
      const initial: Record<number, ExerciseState> = {};
      // Init empty
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
      // Hydrate from local draft (offline-safe)
      const draft = loadDraft(studentId, day.day);
      if (draft) {
        Object.keys(initial).forEach((k) => {
          const idx = Number(k);
          const draftSets = draft.sets?.[idx];
          if (draftSets && Array.isArray(draftSets)) {
            // Match length of plan; pad/truncate
            initial[idx].sets = initial[idx].sets.map((s, i) => draftSets[i] || s);
          }
          if (typeof draft.notes?.[idx] === 'string') initial[idx].notes = draft.notes[idx];
          if (typeof draft.savedSets?.[idx] === 'number') initial[idx].savedSets = draft.savedSets[idx];
          const draftName = draft.exerciseNames?.[idx];
          if (typeof draftName === 'string' && draftName.trim()) initial[idx].exerciseName = draftName;
        });
      }
      // Fetch last log per exercise (latest by performed_at)
      await Promise.all(
        day.exercises.map(async (ex, i) => {
          if (!ex.exercise) return;
          const { data } = await supabase
            .from('exercise_set_logs')
            .select('weight_kg, reps, performed_at')
            .eq('student_id', studentId)
            .ilike('exercise_name', ex.exercise)
            .order('performed_at', { ascending: false })
            .limit(1);
          if (data && data[0]) {
            initial[i].lastWeight = data[0].weight_kg;
            initial[i].lastReps = data[0].reps;
            initial[i].lastDate = data[0].performed_at;
          }
        }),
      );
      setState(initial);
      setLoading(false);
    })();
  }, [open, day?.day, studentId]);

  if (!day) return null;

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetEntry, value: string) => {
    setState((prev) => {
      const copy = { ...prev };
      const ex = { ...copy[exIdx] };
      ex.sets = [...ex.sets];
      ex.sets[setIdx] = { ...ex.sets[setIdx], [field]: value };
      copy[exIdx] = ex;
      if (day) saveDraft(studentId, day.day, copy);
      return copy;
    });
  };

  const updateNotes = (exIdx: number, value: string) => {
    setState((prev) => {
      const next = { ...prev, [exIdx]: { ...prev[exIdx], notes: value } };
      if (day) saveDraft(studentId, day.day, next);
      return next;
    });
  };

  const saveExercise = async (exIdx: number) => {
    const ex = day.exercises[exIdx];
    const st = state[exIdx];
    if (!ex || !st) return;

    const validSets = st.sets
      .map((s, idx) => ({ idx, weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
      .filter((s) => !Number.isNaN(s.weight) || !Number.isNaN(s.reps));

    if (validSets.length === 0) {
      toast.error('Preencha ao menos uma série (carga ou reps)');
      return;
    }

    setState((prev) => ({ ...prev, [exIdx]: { ...prev[exIdx], saving: true } }));

    const rows = validSets.map((s) => ({
      student_id: studentId,
      exercise_name: ex.exercise,
      set_number: s.idx + 1,
      weight_kg: Number.isNaN(s.weight) ? null : s.weight,
      reps: Number.isNaN(s.reps) ? null : s.reps,
      day_name: day.day,
      phase: phase || null,
      performed_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('exercise_set_logs').insert(rows);

    setState((prev) => {
      const cur = prev[exIdx];
      let nextSets = cur.sets;
      let nextSavedSets = cur.savedSets;
      if (!error) {
        // Clear only the inputs that were just persisted
        const savedIdx = new Set(validSets.map((s) => s.idx));
        nextSets = cur.sets.map((s, i) => (savedIdx.has(i) ? { weight: '', reps: '' } : s));
        nextSavedSets = cur.savedSets + rows.length;
      }
      const next = {
        ...prev,
        [exIdx]: { ...cur, saving: false, sets: nextSets, savedSets: nextSavedSets },
      };
      if (day) saveDraft(studentId, day.day, next);
      return next;
    });

    if (error) {
      toast.error('Salvo localmente. Sem conexão? Será re-enviado quando você tentar de novo. (' + error.message + ')');
    } else {
      toast.success(`${rows.length} série(s) registrada(s) — ${ex.exercise}`);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Modo Treino
          </SheetTitle>
          <SheetDescription>
            Registre carga, reps e observações de cada exercício enquanto treina o aluno.
          </SheetDescription>
        </SheetHeader>

        {days.length > 1 && (
          <div className="flex flex-wrap gap-1.5 p-2 mt-3 rounded-lg bg-secondary/40 border border-border/40">
            {days.map((d, i) => (
              <Button
                key={`${d.day}-${i}`}
                size="sm"
                variant={activeDayIdx === i ? 'default' : 'ghost'}
                className="h-7 px-3 text-xs"
                onClick={() => setActiveDayIdx(i)}
              >
                {d.day}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {day.exercises.map((ex, exIdx) => {
              const st = state[exIdx];
              if (!st) return null;
              return (
                <Card key={exIdx} className="border-border/60">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <ExerciseNamePicker
                          value={st.exerciseName}
                          options={exercisesList}
                          original={ex.exercise || ''}
                          onChange={(name) => {
                            setState((prev) => {
                              const next = { ...prev, [exIdx]: { ...prev[exIdx], exerciseName: name } };
                              if (day) saveDraft(studentId, day.day, next);
                              return next;
                            });
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Prescrição: {ex.series2 || ex.series} séries × {ex.reps || '—'}
                          {ex.rir && ` · RIR ${ex.rir}`}
                          {ex.pause && ` · pausa ${ex.pause}`}
                        </p>
                      </div>
                      {st.exerciseName && (
                        <HistoryPopover studentId={studentId} exerciseName={st.exerciseName} last={st} />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {st.sets.map((s, setIdx) => {
                        const p = st.plan?.[setIdx] ?? { kind: 'work' as const, targetReps: '' };
                        const isRecon = p?.kind === 'recon';
                        return (
                          <div key={setIdx} className="grid grid-cols-[68px_1fr_1fr] items-center gap-2">
                            <span
                              className={`text-[9px] font-bold text-center px-1 py-0.5 rounded ${
                                isRecon
                                  ? 'bg-primary/15 text-primary border border-primary/30'
                                  : 'bg-secondary text-foreground'
                              }`}
                              title={isRecon ? 'Reconhecimento' : 'Trabalho'}
                            >
                              {isRecon ? `REC #${setIdx + 1}` : `#${setIdx + 1}`}
                            </span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              placeholder="kg"
                              value={s.weight}
                              onChange={(e) => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Input
                              type="number"
                              inputMode="numeric"
                              placeholder={p?.targetReps ? `${p.targetReps}` : 'reps'}
                              value={s.reps}
                              onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <Textarea
                      placeholder="Observações (técnica, progressão, dor...)"
                      value={st.notes}
                      onChange={(e) => updateNotes(exIdx, e.target.value.slice(0, 500))}
                      className="text-xs min-h-[50px]"
                      maxLength={500}
                    />

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {st.savedSets > 0 && (
                          <span className="flex items-center gap-1 text-primary">
                            <Check className="h-3 w-3" /> {st.savedSets} série(s) salvas
                          </span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-3 text-xs"
                        disabled={st.saving}
                        onClick={() => saveExercise(exIdx)}
                      >
                        {st.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default TrainerLogSheet;