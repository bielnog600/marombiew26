import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, History, Dumbbell, Check } from 'lucide-react';
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

export const TrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentId, days, phase }) => {
  const [state, setState] = useState<Record<number, ExerciseState>>({});
  const [loading, setLoading] = useState(false);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const day = days[activeDayIdx] || null;

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
          sets: plan.map((p) => ({ weight: '', reps: '' })),
          plan,
          notes: '',
          saving: false,
          lastWeight: null,
          lastReps: null,
          lastDate: null,
          savedSets: 0,
        };
      });
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
      return copy;
    });
  };

  const updateNotes = (exIdx: number, value: string) => {
    setState((prev) => ({ ...prev, [exIdx]: { ...prev[exIdx], notes: value } }));
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

    setState((prev) => ({
      ...prev,
      [exIdx]: {
        ...prev[exIdx],
        saving: false,
        savedSets: prev[exIdx].savedSets + rows.length,
      },
    }));

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
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
                        <p className="font-semibold text-sm truncate">{ex.exercise || 'Sem nome'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Prescrição: {ex.series2 || ex.series} séries × {ex.reps || '—'}
                          {ex.rir && ` · RIR ${ex.rir}`}
                          {ex.pause && ` · pausa ${ex.pause}`}
                        </p>
                      </div>
                      {st.lastWeight !== null && (
                        <div className="text-right shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5">
                          <History className="h-3 w-3" />
                          <span>
                            Última: <strong className="text-foreground">{st.lastWeight ?? '—'}kg × {st.lastReps ?? '—'}</strong>
                            {st.lastDate && ` · ${format(new Date(st.lastDate), 'dd/MM', { locale: ptBR })}`}
                          </span>
                        </div>
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