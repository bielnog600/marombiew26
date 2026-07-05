import React, { useEffect, useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Dumbbell, Check, Timer, X, Users, UserPlus, Play, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { useRestTimer } from '@/hooks/useRestTimer';
import ExerciseLogCard from './ExerciseLogCard';
import type { ParsedExercise } from '@/lib/trainingResultParser';
import { 
  ExerciseNamePicker, 
  HistoryPopover, 
} from './TrainerLogSheet';
import {
  normalizeExName, 
  buildSetPlan, 
  makeDaySignature, 
  loadDraft, 
  saveDraft, 
  draftKey,
  parsePauseSeconds
} from './TrainerLogSheetUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentAId: string;
  planA: any;
}

interface StudentSessionState {
  studentId: string;
  nome: string;
  days: ParsedTrainingDay[];
  activeDayIdx: number;
  state: Record<number, any>;
  plan: any;
  loading: boolean;
}

export const DuoTrainerLogSheet: React.FC<Props> = ({ open, onOpenChange, studentAId, planA }) => {
  const { user } = useAuth();
  const { active, finish, cancel, setPairedStudent } = useAdminTrainerSession();
  const [studentA, setStudentA] = useState<StudentSessionState | null>(null);
  const [studentB, setStudentB] = useState<StudentSessionState | null>(null);
  const [allStudents, setAllStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [selectingStudentB, setSelectingStudentB] = useState(false);
  const [studentBQuery, setStudentBQuery] = useState('');
  const [exercisesList, setExercisesList] = useState<any[]>([]);
  const { restTimer, startTimer: setRestTimer, stopTimer, adjustTimer } = useRestTimer();
  const sessionId = active?.id || '';
  const sessionStartedAt = active?.startedAtReal || new Date().toISOString();
  const [now, setNow] = useState(() => Date.now());
  const durationSeconds = Math.max(0, Math.floor((now - new Date(sessionStartedAt).getTime()) / 1000));
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Timer interval
  useEffect(() => {
    if (!open) return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [open]);

  // Load exercises list
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from('exercises').select('id, nome, grupo_muscular, imagem_url').order('nome');
      if (data) setExercisesList(data);
      
      const { data: students } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .neq('user_id', studentAId);
      if (students) setAllStudents(students);
      
      // Get last paired student for studentA
      const { data: lastSession } = await supabase
        .from('workout_sessions')
        .select('paired_student_id')
        .eq('student_id', studentAId)
        .eq('session_mode', 'duo')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (lastSession?.[0]?.paired_student_id) {
        const pairedId = lastSession[0].paired_student_id;
        const student = students?.find(s => s.user_id === pairedId);
        if (student) {
          loadStudentData(pairedId, student.nome, 'B');
        }
      }
    })();
  }, [open, studentAId]);

  // Load student A data
  useEffect(() => {
    if (open && planA && !studentA) {
      (async () => {
        const { data: profile } = await supabase.from('profiles').select('nome').eq('user_id', studentAId).single();
        const days = parseTrainingSections(planA.conteudo || '').flatMap(s => s.days || []);
        
        // Find best day for today
        const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
        const today = weekdays[new Date().getDay()];
        const idx = days.findIndex((d) => d.day.toLowerCase().includes(today));
        const activeIdx = idx >= 0 ? idx : 0;
        
        setStudentA({
          studentId: studentAId,
          nome: profile?.nome || 'Aluno A',
          days,
          activeDayIdx: activeIdx,
          state: {},
          plan: planA,
          loading: true
        });
      })();
    }
  }, [open, planA]);

  const loadStudentData = async (studentId: string, nome: string, slot: 'A' | 'B') => {
    const { data: plans } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (!plans?.[0]) {
      toast.error(`Nenhum treino encontrado para ${nome}`);
      return;
    }
    
    const plan = plans[0];
    const days = parseTrainingSections(plan.conteudo || '').flatMap(s => s.days || []);
    const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const today = weekdays[new Date().getDay()];
    const idx = days.findIndex((d) => d.day.toLowerCase().includes(today));
    const activeIdx = idx >= 0 ? idx : 0;

    const data: StudentSessionState = {
      studentId,
      nome,
      days,
      activeDayIdx: activeIdx,
      state: {},
      plan,
      loading: true
    };

    if (slot === 'A') {
      setStudentA(data);
    } else {
      setStudentB(data);
      try {
        await setPairedStudent({
          id: studentId,
          nome,
          planId: plan.id,
          dayName: days[activeIdx]?.day || null,
          phase: plan.fase || null,
        });
      } catch (e) {
        console.error('setPairedStudent failed', e);
      }
    }
  };

  // Initialize/Hydrate state when student data is loaded or day changes
  useEffect(() => {
    const hydrate = async (st: StudentSessionState, setSt: React.Dispatch<React.SetStateAction<StudentSessionState | null>>) => {
      if (!st.loading) return;
      const day = st.days[st.activeDayIdx];
      if (!day) return;
      
      const daySignature = makeDaySignature(day);
      const initial: Record<number, any> = {};
      
      day.exercises.forEach((ex, i) => {
        const setPlan = buildSetPlan(ex.series, ex.series2, ex.reps);
        initial[i] = {
          sets: setPlan.map(() => ({ weight: '', reps: '' })),
          plan: setPlan,
          notes: '',
          saving: false,
          lastWeight: null,
          lastReps: null,
          lastDate: null,
          savedSets: 0,
          exerciseName: ex.exercise || '',
        };
      });

      const draft = loadDraft(st.studentId, day.day, daySignature);
      if (draft) {
        Object.keys(initial).forEach((k) => {
          const idx = Number(k);
          if (draft.sets?.[idx]) initial[idx].sets = initial[idx].sets.map((s: any, i: number) => draft.sets[idx][i] || s);
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
            .eq('student_id', st.studentId)
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

      setSt(prev => prev ? { ...prev, state: initial, loading: false } : null);
    };

    if (studentA?.loading) hydrate(studentA, setStudentA);
    if (studentB?.loading) hydrate(studentB, setStudentB);
  }, [studentA?.loading, studentB?.loading, studentA?.activeDayIdx, studentB?.activeDayIdx]);

  const updateSet = (slot: 'A' | 'B', exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    const setFn = slot === 'A' ? setStudentA : setStudentB;
    setFn(prev => {
      if (!prev) return null;
      const nextState = { ...prev.state };
      nextState[exIdx].sets[setIdx][field] = value;
      saveDraft(prev.studentId, prev.days[prev.activeDayIdx].day, makeDaySignature(prev.days[prev.activeDayIdx]), nextState);
      return { ...prev, state: nextState };
    });
  };

  const updateNotes = (slot: 'A' | 'B', exIdx: number, value: string) => {
    const setFn = slot === 'A' ? setStudentA : setStudentB;
    setFn(prev => {
      if (!prev) return null;
      const nextState = { ...prev.state };
      nextState[exIdx].notes = value;
      saveDraft(prev.studentId, prev.days[prev.activeDayIdx].day, makeDaySignature(prev.days[prev.activeDayIdx]), nextState);
      return { ...prev, state: nextState };
    });
  };

  const saveExercise = async (slot: 'A' | 'B', exIdx: number) => {
    // handled below
  }
  // helper wrappers
  const mutateSlot = (
    slot: 'A' | 'B',
    mutator: (st: StudentSessionState) => StudentSessionState,
  ) => {
    const setFn = slot === 'A' ? setStudentA : setStudentB;
    setFn((prev) => (prev ? mutator(prev) : prev));
  };

  const persistSlot = (st: StudentSessionState) => {
    const day = st.days[st.activeDayIdx];
    if (!day) return;
    saveDraft(st.studentId, day.day, makeDaySignature(day), st.state);
  };

  const addSet = (slot: 'A' | 'B', exIdx: number) => {
    mutateSlot(slot, (prev) => {
      const cur = prev.state[exIdx];
      if (!cur) return prev;
      const lastPlan = cur.plan[cur.plan.length - 1];
      const newPlan = [...cur.plan, { kind: 'work', targetReps: lastPlan?.targetReps || '' }];
      const newSets = [...cur.sets, { weight: '', reps: '' }];
      const nextState = { ...prev.state, [exIdx]: { ...cur, plan: newPlan, sets: newSets } };
      const next = { ...prev, state: nextState };
      persistSlot(next);
      return next;
    });
  };

  const removeSet = (slot: 'A' | 'B', exIdx: number, setIdx: number) => {
    mutateSlot(slot, (prev) => {
      const cur = prev.state[exIdx];
      if (!cur || cur.sets.length <= 1) return prev;
      const newPlan = cur.plan.filter((_: any, i: number) => i !== setIdx);
      const newSets = cur.sets.filter((_: any, i: number) => i !== setIdx);
      const nextState = { ...prev.state, [exIdx]: { ...cur, plan: newPlan, sets: newSets } };
      const next = { ...prev, state: nextState };
      persistSlot(next);
      return next;
    });
  };

  const removeExercise = (slot: 'A' | 'B', exIdx: number) => {
    mutateSlot(slot, (prev) => {
      const day = prev.days[prev.activeDayIdx];
      const newExercises = day.exercises.filter((_, i) => i !== exIdx);
      const newState: Record<number, any> = {};
      day.exercises.forEach((_, i) => {
        if (i < exIdx) newState[i] = prev.state[i];
        else if (i > exIdx) newState[i - 1] = prev.state[i];
      });
      const newDays = prev.days.map((d, i) => (i === prev.activeDayIdx ? { ...d, exercises: newExercises } : d));
      const next = { ...prev, days: newDays, state: newState };
      persistSlot(next);
      return next;
    });
  };

  const updateExerciseMeta = (
    slot: 'A' | 'B',
    exIdx: number,
    patch: Partial<Pick<ParsedExercise, 'pause' | 'variation' | 'reps' | 'rir'>>,
  ) => {
    mutateSlot(slot, (prev) => {
      const day = prev.days[prev.activeDayIdx];
      const newExercises = day.exercises.map((e, i) => (i === exIdx ? { ...e, ...patch } : e));
      let nextState = prev.state;
      if (patch.reps !== undefined) {
        const ex = newExercises[exIdx];
        const newPlan = buildSetPlan(ex.series, ex.series2, ex.reps);
        const cur = prev.state[exIdx];
        if (cur) {
          const sets = newPlan.map((_, i) => cur.sets[i] ?? { weight: '', reps: '' });
          nextState = { ...prev.state, [exIdx]: { ...cur, plan: newPlan, sets } };
        }
      }
      const newDays = prev.days.map((d, i) => (i === prev.activeDayIdx ? { ...d, exercises: newExercises } : d));
      const next = { ...prev, days: newDays, state: nextState };
      persistSlot(next);
      return next;
    });
  };

  const addExercise = (slot: 'A' | 'B') => {
    mutateSlot(slot, (prev) => {
      const day = prev.days[prev.activeDayIdx];
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
      const newExercises = [...day.exercises, newEx];
      const newIdx = newExercises.length - 1;
      const plan = buildSetPlan(newEx.series, newEx.series2, newEx.reps);
      const nextState = {
        ...prev.state,
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
      const newDays = prev.days.map((d, i) => (i === prev.activeDayIdx ? { ...d, exercises: newExercises } : d));
      const next = { ...prev, days: newDays, state: nextState };
      persistSlot(next);
      return next;
    });
  };

  const saveExerciseImpl = async (slot: 'A' | 'B', exIdx: number) => {
    const st = slot === 'A' ? studentA : studentB;
    const setFn = slot === 'A' ? setStudentA : setStudentB;
    if (!st) return;
    
    const day = st.days[st.activeDayIdx];
    const ex = day.exercises[exIdx];
    const exState = st.state[exIdx];
    const exerciseName = (exState.exerciseName || ex.exercise || '').trim();

    const validSets = exState.sets
      .map((s: any, idx: number) => ({ idx, weight: parseFloat(s.weight), reps: parseInt(s.reps, 10) }))
      .filter((s: any) => !Number.isNaN(s.weight) || !Number.isNaN(s.reps));

    if (validSets.length === 0) {
      toast.error('Preencha ao menos uma série');
      return;
    }

    setFn(prev => {
      if (!prev) return null;
      return { ...prev, state: { ...prev.state, [exIdx]: { ...prev.state[exIdx], saving: true } } };
    });

    const rows = validSets.map((s: any) => ({
      student_id: st.studentId,
      session_id: sessionId,
      exercise_name: normalizeExName(exerciseName),
      set_number: s.idx + 1,
      weight_kg: Number.isNaN(s.weight) ? null : s.weight,
      reps: Number.isNaN(s.reps) ? null : s.reps,
      day_name: day.day,
      phase: st.plan.fase || null,
      performed_at: new Date().toISOString(),
      source: 'admin',
    }));

    const { error } = await supabase.from('exercise_set_logs').insert(rows);

    setFn(prev => {
      if (!prev) return null;
      const cur = prev.state[exIdx];
      const savedIdx = new Set(validSets.map((s: any) => s.idx));
      const nextSets = cur.sets.map((s: any, i: number) => (savedIdx.has(i) ? { weight: '', reps: '' } : s));
      const nextState = { 
        ...prev.state, 
        [exIdx]: { ...cur, saving: false, sets: nextSets, savedSets: cur.savedSets + rows.length } 
      };
      saveDraft(prev.studentId, day.day, makeDaySignature(day), nextState);
      return { ...prev, state: nextState };
    });

    if (error) toast.error('Erro ao salvar série: ' + error.message);
    else toast.success(`Série(s) salva(s) para ${st.nome}`);
  };

  const handleFinishDuoSession = async () => {
    setFinishing(true);
    try {
      const totals: Record<string, { exercisesCompleted: number; totalExercises: number }> = {};
      const cleanup: Array<() => void> = [];
      [studentA, studentB].forEach((st) => {
        if (!st) return;
        const day = st.days[st.activeDayIdx];
        totals[st.studentId] = {
          exercisesCompleted: Object.values(st.state).filter((ex: any) => ex.savedSets > 0).length,
          totalExercises: day?.exercises.length || 0,
        };
        if (day) {
          cleanup.push(() =>
            localStorage.removeItem(draftKey(st.studentId, day.day, makeDaySignature(day))),
          );
        }
      });
      await finish(totals);
      cleanup.forEach((fn) => fn());
    } catch (err: any) {
      toast.error('Erro ao finalizar: ' + err.message);
    } finally {
      setFinishing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[95vw] overflow-y-auto p-0">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b bg-background sticky top-0 z-20 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SheetTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-500" />
                Treino Duo
              </SheetTitle>
              <div className="flex items-center gap-2 px-3 py-1 bg-violet-500/10 rounded-full border border-violet-500/20">
                <Timer className="h-4 w-4 text-violet-500 animate-pulse" />
                <span className="text-sm font-mono font-bold text-violet-500">
                  {formatDuration(durationSeconds)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive">
                    Cancelar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar sessão duo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A sessão será marcada como abandonada. Não vai concluir aulas na Agenda nem descontar créditos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={cancelling}
                      onClick={async () => {
                        setCancelling(true);
                        try { await cancel(); } finally { setCancelling(false); }
                      }}
                    >
                      Cancelar sessão
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button 
                size="sm" 
                onClick={handleFinishDuoSession} 
                disabled={finishing}
                className="h-8 bg-violet-600 hover:bg-violet-700"
              >
                {finishing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                Finalizar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-x">
            {/* Aluno A */}
            <div className="p-4 space-y-4">
              {studentA ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">A</div>
                      <div>
                        <p className="font-bold text-sm">{studentA.nome}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{studentA.days[studentA.activeDayIdx]?.day}</p>
                      </div>
                    </div>
                    {studentA.days.length > 1 && (
                      <select 
                        className="bg-transparent text-xs border-none focus:ring-0 cursor-pointer"
                        value={studentA.activeDayIdx}
                        onChange={(e) => setStudentA(p => p ? { ...p, activeDayIdx: parseInt(e.target.value), loading: true } : null)}
                      >
                        {studentA.days.map((d, i) => <option key={i} value={i}>{d.day}</option>)}
                      </select>
                    )}
                  </div>
                  {studentA.loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
                  ) : (
                    <div className="space-y-3">
                      {studentA.days[studentA.activeDayIdx].exercises.map((ex, i) => (
                        <ExerciseLogCard
                          key={i}
                          exIdx={i}
                          ex={ex}
                          st={studentA.state[i]}
                          exercisesList={exercisesList}
                          studentId={studentA.studentId}
                          onUpdateSet={(idx, sIdx, f, v) => updateSet('A', idx, sIdx, f, v)}
                          onUpdateNotes={(idx, v) => updateNotes('A', idx, v)}
                          onSaveExercise={(idx) => saveExercise('A', idx)}
                          onStartRestTimer={setRestTimer}
                          onExerciseNameChange={(name) => setStudentA(p => {
                            if (!p) return null;
                            const ns = { ...p.state, [i]: { ...p.state[i], exerciseName: name } };
                            saveDraft(p.studentId, p.days[p.activeDayIdx].day, makeDaySignature(p.days[p.activeDayIdx]), ns);
                            return { ...p, state: ns };
                          })}
                          ExerciseNamePicker={ExerciseNamePicker}
                          HistoryPopover={HistoryPopover}
                          parsePauseSeconds={parsePauseSeconds}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="animate-spin mb-2" />
                  <p>Carregando Aluno A...</p>
                </div>
              )}
            </div>

            {/* Aluno B */}
            <div className="p-4 space-y-4 bg-muted/10">
              {studentB ? (
                <div className="space-y-4">
                   <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center font-bold text-violet-600">B</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{studentB.nome}</p>
                          <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { setStudentB(null); setPairedStudent(null).catch(() => undefined); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{studentB.days[studentB.activeDayIdx]?.day}</p>
                      </div>
                    </div>
                    {studentB.days.length > 1 && (
                      <select 
                        className="bg-transparent text-xs border-none focus:ring-0 cursor-pointer"
                        value={studentB.activeDayIdx}
                        onChange={(e) => setStudentB(p => p ? { ...p, activeDayIdx: parseInt(e.target.value), loading: true } : null)}
                      >
                        {studentB.days.map((d, i) => <option key={i} value={i}>{d.day}</option>)}
                      </select>
                    )}
                  </div>
                  {studentB.loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
                  ) : (
                    <div className="space-y-3">
                      {studentB.days[studentB.activeDayIdx].exercises.map((ex, i) => (
                        <ExerciseLogCard
                          key={i}
                          exIdx={i}
                          ex={ex}
                          st={studentB.state[i]}
                          exercisesList={exercisesList}
                          studentId={studentB.studentId}
                          onUpdateSet={(idx, sIdx, f, v) => updateSet('B', idx, sIdx, f, v)}
                          onUpdateNotes={(idx, v) => updateNotes('B', idx, v)}
                          onSaveExercise={(idx) => saveExercise('B', idx)}
                          onStartRestTimer={setRestTimer}
                          onExerciseNameChange={(name) => setStudentB(p => {
                            if (!p) return null;
                            const ns = { ...p.state, [i]: { ...p.state[i], exerciseName: name } };
                            saveDraft(p.studentId, p.days[p.activeDayIdx].day, makeDaySignature(p.days[p.activeDayIdx]), ns);
                            return { ...p, state: ns };
                          })}
                          ExerciseNamePicker={ExerciseNamePicker}
                          HistoryPopover={HistoryPopover}
                          parsePauseSeconds={(p) => 60}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-muted rounded-xl">
                  <UserPlus className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium mb-4">Selecione o segundo aluno</p>
                  <div className="w-full max-w-xs space-y-2">
                    <Input
                      placeholder="Buscar aluno..."
                      className="h-9"
                      value={studentBQuery}
                      onChange={(e) => setStudentBQuery(e.target.value)}
                    />
                    <div className="max-h-48 overflow-y-auto border rounded-lg bg-background">
                      {allStudents
                        .filter((s) => {
                          const q = studentBQuery.trim().toLowerCase();
                          if (!q) return true;
                          return (s.nome || '').toLowerCase().includes(q);
                        })
                        .map((s) => (
                          <button
                            key={s.user_id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onClick={() => loadStudentData(s.user_id, s.nome, 'B')}
                          >
                            {s.nome}
                          </button>
                        ))}
                      {allStudents.filter((s) =>
                        (s.nome || '').toLowerCase().includes(studentBQuery.trim().toLowerCase()),
                      ).length === 0 && (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                          Nenhum aluno encontrado.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rest timer modal */}
        {restTimer && (
          <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center">
            {/* Same rest timer UI as TrainerLogSheet */}
            <Button variant="ghost" className="absolute top-4 right-4" onClick={() => stopTimer()}><X /></Button>
            <div className="text-4xl font-bold mb-8">
              {Math.floor(restTimer.remaining / 60)}:{String(restTimer.remaining % 60).padStart(2, '0')}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => adjustTimer(-15)}>-15s</Button>
              <Button onClick={() => adjustTimer(15)}>+15s</Button>
              <Button variant="default" onClick={() => stopTimer()}>Pular</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DuoTrainerLogSheet;
