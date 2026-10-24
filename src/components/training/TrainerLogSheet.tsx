import React, { useEffect, useState } from 'react';
import { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import { RestOffscreenIndicator } from './WorkoutSetCard';
import { MethodExerciseCard } from './MethodExerciseCard';
import { exerciseBlocks, exerciseSetCount, groupExercisesByIndex, matchSetCount, methodLogFields, seriesMethod, ungroupExercises, validateGroups, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import type { GroupPause } from '@/hooks/useWorkoutGroupFlow';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, History, Dumbbell, Check, ChevronDown, Pencil, Timer, X, Play, Plus, Sparkles, GripVertical, ListOrdered, Link2, Settings2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { CSS } from '@dnd-kit/utilities';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { tokenMatchScore } from '@/lib/fuzzyMatch';
import type { ParsedTrainingDay, ParsedExercise } from '@/lib/trainingResultParser';
import { useRestTimer } from '@/hooks/useRestTimer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ExerciseLogCard from './ExerciseLogCard';
import TrainingWeekCard, { type TrainingWeekPlanMeta } from './TrainingWeekCard';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionProgression } from '@/hooks/useSessionProgression';
import { readProgressionSnapshot } from '@/lib/sessionProgression';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
import AiEditExerciseDialog, { type AiEditAction } from './AiEditExerciseDialog';
import { applyActionsToDay } from './AiEditAllDaysDialog';
import { normalizeWorkoutPlan, newId, parsedDaysToWorkoutPlan, type WorkoutPlan } from '@/lib/workoutSchema';
import { GroupEditPanel } from './GroupEditPanel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { workoutPlanToMarkdown } from '@/lib/workoutMarkdownSerializer';
import { persistSessionDayEditsToPlan } from '@/lib/sessionPlanPersistence';
import {
  buildExerciseUids,
  makeExerciseUid,
  reorderExercisesByUid,
} from '@/lib/sessionExerciseOrder';


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
  options: { id: string; nome: string; grupo_muscular: string; imagem_url?: string | null }[];
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
      <PopoverContent
        align="start"
        className="w-[min(92vw,22rem)] p-0"
        onOpenAutoFocus={(e) => {
          // keep focus available for typing on mobile
        }}
      >
        <Command filter={tokenMatchScore}>
          <CommandInput placeholder="Digite o nome do exercício..." autoFocus />
          <CommandList
            className="max-h-[60vh] overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
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
                  className="gap-2"
                >
                  <Check className={`h-3 w-3 shrink-0 ${value === opt.nome ? 'opacity-100' : 'opacity-0'}`} />
                  {opt.imagem_url ? (
                    <img
                      src={opt.imagem_url}
                      alt=""
                      loading="lazy"
                      className="h-9 w-9 rounded object-cover bg-muted shrink-0 border border-border/40"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted shrink-0 flex items-center justify-center">
                      <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{opt.nome}</p>
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

  // O cache é por exercício: se o nome mudar (troca ou reordenação), descarta.
  useEffect(() => {
    setRows(null);
  }, [exerciseName, studentId]);

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

/** Sensores compartilhados de drag-and-drop (individual e Duo). */
export const useExerciseDndSensors = () =>
  useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

export const SortableExerciseRow: React.FC<{

  id: string;
  position: number;
  children: React.ReactNode;
}> = ({ id, position, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : undefined,
    position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-center gap-1.5 px-1">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          {...attributes}
          {...listeners}
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[10px] font-bold text-muted-foreground uppercase">#{position}</span>
      </div>
      {children}
    </div>
  );
};


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  days: ParsedTrainingDay[];
  phase?: string | null;
  initialDayName?: string | null;
  planId?: string | null;
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

export const TrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentId, days, phase, initialDayName, planId }) => {
  const { user } = useAuth();
  const { active, close, cancel, finish, patchState, patchSessionState } = useAdminTrainerSession();
  const [state, setState] = useState<Record<number, ExerciseState>>({});
  const [loading, setLoading] = useState(true);
  const resolveInitialDayIdx = React.useCallback(() => {
    if (!days || days.length === 0) return 0;
    const target = (initialDayName || '').toLowerCase().trim();
    if (target) {
      const exact = days.findIndex((d) => d.day.toLowerCase().trim() === target);
      if (exact >= 0) return exact;
      const partial = days.findIndex((d) => d.day.toLowerCase().includes(target) || target.includes(d.day.toLowerCase()));
      if (partial >= 0) return partial;
    }
    const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const today = weekdays[new Date().getDay()];
    const todayAlt = today === 'terça' ? 'terca' : today === 'sábado' ? 'sabado' : today;
    const todayIdx = days.findIndex((d) => {
      const s = d.day.toLowerCase();
      return s.includes(today) || s.includes(todayAlt);
    });
    return todayIdx >= 0 ? todayIdx : 0;
  }, [days, initialDayName]);
  const [activeDayIdx, setActiveDayIdx] = useState<number>(resolveInitialDayIdx);
  const initialDaySyncedRef = React.useRef(false);
  useEffect(() => {
    if (!open) { initialDaySyncedRef.current = false; return; }
    if (initialDaySyncedRef.current) return;
    if (!days || days.length === 0) return;
    setActiveDayIdx(resolveInitialDayIdx());
    initialDaySyncedRef.current = true;
  }, [open, days, resolveInitialDayIdx]);
  const [exercisesList, setExercisesList] = useState<{ id: string; nome: string; grupo_muscular: string; imagem_url?: string | null; video_embed?: string | null }[]>([]);
  const [currentExercises, setCurrentExercises] = useState<ParsedExercise[]>([]);
  // Identidade estável por exercício (key React + id do sortable)
  const [exerciseUids, setExerciseUids] = useState<string[]>([]);

  const [aiOpen, setAiOpen] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  // Edições de método/grupo feitas na sessão, ainda não gravadas no plano.
  const [structureDirty, setStructureDirty] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [groupingAIdx, setGroupingAIdx] = useState<number | null>(null);
  const [groupPick, setGroupPick] = useState<{ bIdx: number; type: 'biset' | 'superset' } | null>(null);
  const [groupEditOpen, setGroupEditOpen] = useState<string | null>(null);
  const dndSensors = useExerciseDndSensors();

  const { restTimer, startTimer: setRestTimer, stopTimer, adjustTimer, setTimerExerciseIndex } = useRestTimer();
  const inlineRest = useInlineWorkoutRest(active?.id ? `mw_inline_rest:admin:${active.id}:${studentId}` : undefined);

  const student = active?.students.find(s => s.id === studentId);
  // Semana ajustada no card da semana durante esta sessão (vence a do início).
  const [faseAjustada, setFaseAjustada] = useState<string | null>(null);
  const effectivePhase = (faseAjustada as any) || (student?.phase as any) || phase || null;
  const effectivePlanId = student?.planId || planId || null;

  // Plano da sessão: semana do ciclo (card) e início do plano (histórico sem plan_id).
  const [planMeta, setPlanMeta] = useState<(TrainingWeekPlanMeta & { published_at?: string | null; created_at?: string | null }) | null>(null);
  useEffect(() => {
    if (!effectivePlanId) { setPlanMeta(null); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('ai_plans')
        .select('id, fase, fase_inicio_data, published_at, created_at')
        .eq('id', effectivePlanId)
        .maybeSingle();
      if (!cancel) setPlanMeta((data as any) ?? null);
    })();
    return () => { cancel = true; };
  }, [effectivePlanId]);

  // Todos os exercícios do plano: a sugestão já nasce pronta para qualquer dia.
  const allPlanExercises = React.useMemo(() => (days || []).flatMap((d) => d.exercises || []), [days]);

  const { snapshot } = useSessionProgression({
    studentId,
    sessionId: active?.id ?? null,
    exercises: currentExercises,
    allExercises: allPlanExercises,
    phase: effectivePhase,
    planId: effectivePlanId,
    planStartedAt: planMeta?.published_at ?? planMeta?.created_at ?? null,
    restoredSnapshot: readProgressionSnapshot(active?.sessionState)
  });

  // Salvar snapshot no session_state para retomada/offline. Regrava quando ele
  // é completado (troca de dia, exercício novo) ou recalculado (semana ajustada).
  useEffect(() => {
    if (!active?.id || !snapshot) return;
    const existing = readProgressionSnapshot(active.sessionState);
    const mudou =
      !existing ||
      existing.updatedAt !== snapshot.updatedAt ||
      existing.phase !== snapshot.phase ||
      (existing.coveredKeys?.length ?? -1) !== (snapshot.coveredKeys?.length ?? -1);
    if (mudou) {
      patchSessionState((prev: any) => ({
        ...prev,
        progressionRecommendations: snapshot
      }));
    }
  }, [active?.id, snapshot, patchSessionState, active?.sessionState]);

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
      const { data } = await supabase.from('exercises').select('id, nome, grupo_muscular, imagem_url, video_embed').order('nome');
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
      const persisted = active?.sessionState?.methodExecution?.[studentId]?.[day.day];
      const draft = persisted ?? loadDraft(studentId, day.day, daySignature);
      const baseExercises: ParsedExercise[] = draft?.exercises && draft.exercises.length > 0
        ? draft.exercises
        : day.exercises;
      baseExercises.forEach((ex, i) => {
        const plan = buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme);
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
            .select('weight_kg, reps, performed_at, session_id, set_type')
            .eq('student_id', studentId)
            .ilike('exercise_name', normalizeExName(name))
            .order('performed_at', { ascending: false })
            .limit(30);
          // Última sessão do exercício → maior carga das séries de trabalho
          // (antes vinha a primeira linha, às vezes o reconhecimento).
          const linhas = (data as any[]) || [];
          if (linhas.length > 0) {
            const sessaoDe = (r: any) => r.session_id || String(r.performed_at).slice(0, 10);
            const ultima = sessaoDe(linhas[0]);
            const daSessao = linhas.filter((r) => sessaoDe(r) === ultima);
            const trabalho = daSessao.filter((r) => r.set_type !== 'recognition' && r.set_type !== 'warmup');
            const pool = trabalho.length > 0 ? trabalho : daSessao;
            const melhor = pool.reduce((a, b) => (Number(b.weight_kg) || 0) > (Number(a.weight_kg) || 0) ? b : a, pool[0]);
            initial[i].lastWeight = melhor.weight_kg;
            initial[i].lastReps = melhor.reps;
            initial[i].lastDate = melhor.performed_at;
          }
        })
      );
      setCurrentExercises(baseExercises);
      setExerciseUids(buildExerciseUids(baseExercises.length));
      setOrderDirty(false);

      setState(initial);
      setLoading(false);
    })();
  }, [open, day?.day, daySignature, studentId]);

  const updateSet = (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setState((prev) => {
      const copy = { ...prev };
      copy[exIdx].sets[setIdx][field] = value;
      saveDraft(studentId, day.day, daySignature, copy, currentExercises);
      return { ...copy };
    });
  };

  const changeMethodSet = (exIdx: number, setIdx: number, entry: MethodSetEntry) => {
    setState(prev => {
      const current = prev[exIdx];
      if (!current) return prev;
      const sets = current.sets.map((set, i) => i === setIdx ? entry : set);
      const next = { ...prev, [exIdx]: { ...current, sets } };
      saveDraft(studentId, day.day, daySignature, next, currentExercises);
      return next;
    });
    const ex = currentExercises[exIdx];
    if (ex && session.id && entry.subRecords?.some(part => part.completed)) {
      void import('@/lib/offlineQueue').then(({ writeWithFallback }) => writeWithFallback({ table: 'exercise_set_logs', op: 'upsert', onConflict: 'session_id,student_id,exercise_name,set_number', payload: { ...methodLogFields(ex, entry), student_id: studentId, session_id: session.id, exercise_name: normalizeExName(ex.exercise), set_number: setIdx + 1, weight_kg: Number(entry.weight.replace(',', '.')) || null, reps: Number(entry.reps) || null, set_type: state[exIdx]?.plan[setIdx]?.kind === 'recon' ? 'recognition' : 'work', day_name: day.day, phase: effectivePhase, source: 'admin' } }));
    }
  };
  const saveMethodSet = async (exIdx: number, setIdx: number, entry: MethodSetEntry) => {
    changeMethodSet(exIdx, setIdx, entry);
    const ex = currentExercises[exIdx];
    if (!ex || !session.id) return;
    const { writeWithFallback } = await import('@/lib/offlineQueue');
    const result = await writeWithFallback({ table: 'exercise_set_logs', op: 'upsert', onConflict: 'session_id,student_id,exercise_name,set_number', payload: {
      ...methodLogFields(ex, entry), student_id: studentId, session_id: session.id,
      exercise_name: normalizeExName(ex.exercise), set_number: setIdx + 1,
      weight_kg: Number(entry.weight.replace(',', '.')) || null, reps: Number(entry.reps) || null,
      set_type: state[exIdx]?.plan[setIdx]?.kind === 'recon' ? 'recognition' : 'work',
      day_name: day.day, phase: effectivePhase, source: 'admin', performed_at: new Date().toISOString(),
    } });
    if (result.queued) toast.info('Registro guardado para sincronizar quando a conexão voltar.');
    setState(prev => ({ ...prev, [exIdx]: { ...prev[exIdx], savedSets: prev[exIdx].sets.filter(set => set.completed).length } }));
  };
  useEffect(() => {
    if (!day || loading) return;
    const form = { sets: Object.fromEntries(Object.entries(state).map(([i, ex]) => [i, ex.sets])), plans: Object.fromEntries(Object.entries(state).map(([i, ex]) => [i, ex.plan])), savedSets: Object.fromEntries(Object.entries(state).map(([i, ex]) => [i, ex.savedSets])), exercises: currentExercises };
    patchSessionState((prev: any) => ({ ...prev, methodExecution: { ...prev.methodExecution, [studentId]: { ...prev.methodExecution?.[studentId], [day.day]: form } } }));
  }, [state, currentExercises, loading, day?.day, studentId, patchSessionState]);
  const saveMethodPause = (blockId: string, pause: GroupPause | null) => patchSessionState((prev: any) => ({ ...prev, methodPauses: { ...prev.methodPauses, [studentId]: { ...prev.methodPauses?.[studentId], [blockId]: pause } } }));

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
    setExerciseUids((prev) => prev.filter((_, i) => i !== exIdx));
    setState(newState);
    saveDraft(studentId, day.day, daySignature, newState, newExercises);
  };

  // Reordenação por drag-and-drop: exercício + estado (séries, cargas, notas,
  // logs salvos) + identidade (uid) são movidos JUNTOS. Os dados seguem o
  // exercício, nunca a posição.
  const handleReorderEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;

    const currentUid = restTimer ? exerciseUids[restTimer.exIdx] : null;
    const inlineUid = inlineRest.rest ? exerciseUids[inlineRest.rest.exIdx] : null;
    const res = reorderExercisesByUid(
      currentExercises,
      state,
      exerciseUids,
      String(dragged.id),
      String(over.id),
    );
    if (!res) return;

    setCurrentExercises(res.exercises);
    setState(res.states);
    setExerciseUids(res.uids);
    setOrderDirty(true);
    if (inlineUid) {
      const index = res.uids.indexOf(inlineUid);
      if (index >= 0) inlineRest.reindex(index);
      else inlineRest.cancel();
    }
    // Mantém o exercício atual (timer) apontando para a mesma identidade.
    if (currentUid) {
      const nextIdx = res.uids.indexOf(currentUid);
      if (nextIdx >= 0) setTimerExerciseIndex(nextIdx);
      else stopTimer();
    }
    saveDraft(studentId, day.day, daySignature, res.states, res.exercises);
  };


  const saveOrderToPlan = async () => {
    if (!day) return;
    if (!effectivePlanId) {
      toast.error('Plano ativo não encontrado para salvar a sequência');
      return;
    }
    setSavingOrder(true);
    try {
      const res = await persistSessionDayEditsToPlan({
        planId: effectivePlanId,
        dayName: day.day,
        dayIndex: days.findIndex((d) => d.day === day.day),
        exercises: currentExercises,
        states: state,
        fallbackDays: days,
        studentId,
      });
      if (res.success === false) {
        toast.error('Não foi possível salvar a sequência: ' + res.error);
      } else if (res.updated) {
        setOrderDirty(false);
        toast.success('Sequência salva no treino do aluno');
      } else {
        toast.error('Sequência não salva: ' + (res as { reason: string }).reason);
      }
    } catch (e: any) {
      toast.error('Erro ao salvar sequência: ' + (e?.message || 'desconhecido'));
    } finally {
      setSavingOrder(false);
    }
  };



  const updateExerciseMeta = (exIdx: number, patch: Partial<ParsedExercise>) => {
    const affectsPlan =
      patch.reps !== undefined ||
      patch.series !== undefined ||
      patch.series2 !== undefined ||
      patch.setScheme !== undefined;
    // Atualizações funcionais: duas chamadas seguidas (ex.: A e B do grupo) não
    // pisam uma na outra. Se o plano de séries muda, reconstrói preservando as
    // séries já preenchidas/concluídas.
    setCurrentExercises((prevExercises) => {
      const newExercises = prevExercises.map((e, i) => (i === exIdx ? { ...e, ...patch } : e));
      setState((prevState) => {
        let next = prevState;
        if (affectsPlan) {
          const ex = newExercises[exIdx];
          const prev = prevState[exIdx];
          if (prev) {
            const newPlan = buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme);
            const sets = newPlan.map((_, i) => prev.sets[i] ?? { weight: '', reps: '' });
            next = { ...prevState, [exIdx]: { ...prev, plan: newPlan, sets } };
          }
        }
        saveDraft(studentId, day.day, daySignature, next, newExercises);
        return next;
      });
      return newExercises;
    });
    if (['metodo', 'metodo_params', 'method', 'grupo_id', 'tipo_grupo', 'ordem_grupo', 'pausa_grupo_s'].some((k) => k in patch)) {
      setStructureDirty(true);
    }
  };

  // Agrupa A (card onde o admin tocou "Agrupar com…") com o par escolhido.
  // Se o número de séries for diferente, o B é ajustado para o do A antes de
  // agrupar, preservando as séries já registradas de ambos.
  const confirmGroup = () => {
    if (groupingAIdx === null || !groupPick || !day) return;
    const aIdx = groupingAIdx;
    const { bIdx, type } = groupPick;
    const label = type === 'biset' ? 'Bi-set' : 'Superset';
    const countA = exerciseSetCount(currentExercises[aIdx]);
    const adjusted = exerciseSetCount(currentExercises[bIdx]) !== countA;
    const exs = currentExercises.map((e) => ({ ...e }));
    if (adjusted) exs[bIdx] = { ...exs[bIdx], ...matchSetCount(exs[bIdx], countA) };
    const res = groupExercisesByIndex(exs, aIdx, bIdx, type, newId('grp'));
    if (!res) {
      toast.error('Não foi possível agrupar esses exercícios.');
      return;
    }
    const groupError = validateGroups(res.exercises);
    if (groupError) {
      toast.error(groupError);
      return;
    }
    const newState: Record<number, ExerciseState> = {};
    res.orderMap.forEach((oldIdx, newIdx) => {
      newState[newIdx] = state[oldIdx];
    });
    if (adjusted) {
      const bNewIdx = res.orderMap.indexOf(bIdx);
      const prev = newState[bNewIdx];
      if (prev) {
        const plan = buildSetPlan(exs[bIdx].series, exs[bIdx].series2, exs[bIdx].reps, exs[bIdx].setScheme);
        newState[bNewIdx] = { ...prev, plan, sets: plan.map((_, i) => prev.sets[i] ?? { weight: '', reps: '' }) };
      }
    }
    setCurrentExercises(res.exercises);
    setExerciseUids(res.orderMap.map((oldIdx) => exerciseUids[oldIdx]));
    setState(newState);
    saveDraft(studentId, day.day, daySignature, newState, res.exercises);
    setStructureDirty(true);
    setGroupingAIdx(null);
    setGroupPick(null);
    toast.success(adjusted ? `${label} criado — B ajustado para ${countA} séries.` : `${label} criado.`);
  };

  const ungroup = (groupId: string) => {
    if (!day) return;
    const next = ungroupExercises(currentExercises, groupId);
    setCurrentExercises(next);
    saveDraft(studentId, day.day, daySignature, state, next);
    setStructureDirty(true);
    setGroupEditOpen(null);
    toast.success('Grupo desfeito.');
  };

  // Grava as edições de método/grupo da sessão no plano do aluno (ai_plans).
  const saveStructureToPlan = async () => {
    if (!day) return;
    const groupError = validateGroups(currentExercises);
    if (groupError) {
      toast.error('Não foi possível salvar: ' + groupError);
      return;
    }
    if (!effectivePlanId) {
      toast.error('Plano ativo não encontrado para salvar');
      return;
    }
    setSavingStructure(true);
    try {
      const res = await persistSessionDayEditsToPlan({
        planId: effectivePlanId,
        dayName: day.day,
        dayIndex: days.findIndex((d) => d.day === day.day),
        exercises: currentExercises,
        states: state,
        fallbackDays: days,
        studentId,
      });
      if (res.success === false) {
        toast.error('Não foi possível salvar no plano: ' + res.error);
      } else if (res.updated) {
        setStructureDirty(false);
        setOrderDirty(false);
        toast.success('Alterações salvas no treino do aluno');
      } else {
        toast.error('Alterações não salvas: ' + (res as { reason: string }).reason);
      }
    } catch (e: any) {
      toast.error('Erro ao salvar no plano: ' + (e?.message || 'desconhecido'));
    } finally {
      setSavingStructure(false);
    }
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
    const plan = buildSetPlan(newEx.series, newEx.series2, newEx.reps, newEx.setScheme);
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
    setExerciseUids((prev) => [...prev, makeExerciseUid()]);
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
        const plan = buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme);
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
    setExerciseUids((prev) => buildExerciseUids(newExercises.length, prev));
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

    const rows = validSets.map((s) => {
      const p = st.plan?.[s.idx];
      return {
        ...methodLogFields(ex, st.sets[s.idx]),
        student_id: studentId,
        session_id: session.id,
        exercise_name: normalizeExName(exerciseName),
        set_number: s.idx + 1,
        weight_kg: Number.isNaN(s.weight) ? null : s.weight,
        reps: Number.isNaN(s.reps) ? null : s.reps,
        set_type: p?.kind === 'recon' ? 'recognition' : 'work',
        day_name: day.day,
        phase: effectivePhase,
        performed_at: new Date().toISOString(),
        source: 'admin',
      };
    });

    const { error } = await supabase.from('exercise_set_logs').upsert(rows, { onConflict: 'session_id,student_id,exercise_name,set_number' });

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
      // Persistir edições feitas na sessão de volta ao plano (admin e aluno veem depois)
      if (effectivePlanId && day) {
        try {
          const res = await persistSessionDayEditsToPlan({
            planId: effectivePlanId,
            dayName: day.day,
            dayIndex: days.findIndex((d) => d.day === day.day),
            exercises: currentExercises,
            states: state,
            fallbackDays: days,
            studentId,
          });
          if (res.success === false) {
            toast.error('Treino finalizado, mas as edições não foram salvas no plano: ' + res.error);
          } else if (res.updated) {
            toast.success('Edições salvas no treino do aluno');
          }
        } catch (e: any) {
          console.warn('[TrainerLogSheet] falha ao salvar edições no plano', e);
          toast.error('Treino finalizado, mas as edições não foram salvas no plano');
        }
      }
      const exercisesCompleted = Object.values(state).filter(ex => ex.savedSets > 0).length;
      inlineRest.cancel();
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
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v && orderDirty) {
          const keep = window.confirm(
            'Você alterou a sequência do treino. Deseja salvar antes de sair?\n\nOK = Salvar · Cancelar = Descartar',
          );
          if (keep) {
            void saveOrderToPlan();
            return;
          }
        }
        onOpenChange(v);
      }}
    >
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
                          inlineRest.cancel();
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

        <TrainingWeekCard
          plan={planMeta}
          sessionPhase={effectivePhase}
          sessionId={active?.id ?? null}
          onPhaseChange={(nova, atualizado) => {
            setFaseAjustada(nova);
            setPlanMeta((prev) => (prev ? { ...prev, ...atualizado } : prev));
          }}
        />

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
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5" />
                Arraste para alterar a sequência
              </p>
              {orderDirty && (
                <span className="text-[10px] font-bold uppercase bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-px">
                  Sequência modificada
                </span>
              )}
            </div>
            {orderDirty && (
              <Button
                type="button"
                className="w-full gap-2"
                onClick={saveOrderToPlan}
                disabled={savingOrder}
              >
                {savingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar nova sequência
              </Button>
            )}
            {structureDirty && (
              <Button
                type="button"
                className="w-full gap-2"
                onClick={saveStructureToPlan}
                disabled={savingStructure}
              >
                {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar no plano do aluno
              </Button>
            )}
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleReorderEnd}>
              <SortableContext
                items={exerciseUids}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {exerciseBlocks(currentExercises).map(block => {
                    const exIdx = block.indices[0], ex = currentExercises[exIdx];
                    if (!state[exIdx] || !exerciseUids[exIdx]) return null;
                    const sharedMethodProps = { exercises: currentExercises, indices: block.indices, sets: Object.fromEntries(Object.entries(state).map(([i, st]) => [i, st.sets])), onChange: changeMethodSet, onComplete: saveMethodSet, media: exercisesList, snapshot, studentId, inlineRest, savedPause: active?.sessionState?.methodPauses?.[studentId]?.[block.id], onPauseChange: (pause: GroupPause | null) => saveMethodPause(block.id, pause) };
                    if (block.indices.length === 2) return <MethodExerciseCard key={block.id} {...sharedMethodProps}
                      headerActions={<Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary" onClick={() => setGroupEditOpen(groupEditOpen === block.id ? null : block.id)}><Settings2 className="h-3 w-3" />{groupEditOpen === block.id ? 'Fechar edição' : 'Editar grupo'}</Button>}
                      editPanel={groupEditOpen === block.id ? <GroupEditPanel exercises={currentExercises} indices={block.indices} planOf={(idx) => state[idx]?.plan ?? []} onPatch={(idx, patch) => updateExerciseMeta(idx, patch)} onUngroup={() => ungroup(block.id)} /> : undefined} />;
                    const methodCard = seriesMethod(ex) !== 'nenhum' ? <MethodExerciseCard key={block.id} embedded {...sharedMethodProps} /> : null;
                    return (
                    <SortableExerciseRow key={exerciseUids[exIdx]} id={exerciseUids[exIdx]} position={exIdx + 1}>

                      <ExerciseLogCard
                        exIdx={exIdx}
                        ex={ex}
                        st={state[exIdx]}
                        exercisesList={exercisesList}
                        studentId={studentId}
                        onUpdateSet={updateSet}
                        onUpdateNotes={updateNotes}
                        onSaveExercise={saveExercise}
                        onStartRestTimer={setRestTimer}
                        inlineRest={inlineRest}
                        onCompleteSet={saveMethodSet}
                        onExerciseNameChange={(name) => updateExerciseName(exIdx, name)}
                        onAddSet={addSet}
                        onRemoveSet={removeSet}
                        onRemoveExercise={removeExercise}
                        onUpdateMeta={(patch) => updateExerciseMeta(exIdx, patch)}
                        ExerciseNamePicker={ExerciseNamePicker}
                        HistoryPopover={HistoryPopover}
                        parsePauseSeconds={parsePauseSeconds}
                        progressionSnapshot={snapshot}
                        dayExercises={currentExercises}
                        methodBody={methodCard ?? undefined}
                      />
                    </SortableExerciseRow>
                  ); })}
                </div>
              </SortableContext>
            </DndContext>

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

        <RestOffscreenIndicator rest={inlineRest.rest} />
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
              const timerEx = currentExercises[timerExIdx];
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
