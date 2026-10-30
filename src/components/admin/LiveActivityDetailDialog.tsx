import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Radio, Timer, Droplet, UtensilsCrossed, Dumbbell, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getSafeWorkoutDays } from '@/lib/planMigrationUtils';
import { isSameWorkoutDay } from '@/lib/activeWorkoutSession';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { safeVideoSrc } from '@/lib/exerciseVideoSrc';
import { buildActivityDiet, resolveActivityMeals } from '@/lib/adminActivityMeals';
import { activitySetDisplay, activityRepLabel } from '@/lib/adminActivitySets';
import { exerciseProgress, type ActivityHistoryLog } from '@/lib/adminExerciseProgress';
import { buildActivityExercises, type ActivitySet, type ActivityExercise } from '@/lib/adminActivityExercises';
import { createWorkoutLogTransition } from '@/lib/adminWorkoutLogTransition';
import { ExerciseProgressSummary, type ExerciseProgressData } from './ExerciseProgressSummary';
import { diffMealFoods, foodName, sumMeals, type OverrideMeal } from '@/lib/studentDietOverrideDiff';
import { WATER_STEP_ML, ML_PER_KG_REST, TRAINING_DAY_MULTIPLIER, DEFAULT_WATER_GOAL_GLASSES } from '@/hooks/useDailyTracking';

export type ActivityKind = 'workout_start' | 'workout_end' | 'water' | 'meal' | 'workout_done';

export interface ActivityRef {
  kind: ActivityKind;
  studentId: string;
  studentName: string;
  at: string;
  sessionId?: string;
  /** Data (yyyy-mm-dd) do registro diário. */
  date?: string;
  mealIndex?: number;
}

const r0 = (n: number) => Math.round(n || 0);
const num = (v: any) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const INACTIVE_MS = 5 * 60 * 1000;

/* ======================== DIETA ======================== */

interface DayData {
  tracking: { water_glasses: number; water_ml: number | null; meals_completed: number[]; date: string } | null;
  prescribed: Record<number, OverrideMeal[]>;
  student: Record<number, OverrideMeal[]>;
  targets: ReturnType<typeof buildActivityDiet>['targets'];
  weightKg: number | null;
  trainedToday: boolean;
}

const useStudentDay = (studentId: string, date: string) => {
  const [data, setData] = useState<DayData | null>(null);

  useEffect(() => {
    let alive = true;
    const loadTracking = async () => {
      const { data: t } = await supabase.from('daily_tracking')
        .select('water_glasses, water_ml, meals_completed, date').eq('student_id', studentId).eq('date', date).maybeSingle();
      return t ? { ...t, meals_completed: Array.isArray(t.meals_completed) ? (t.meals_completed as number[]) : [] } : null;
    };
    const load = async () => {
      const [tracking, { data: dieta }, { data: assess }, { data: sess }] = await Promise.all([
        loadTracking(),
        supabase.from('ai_plans').select('id, conteudo, conteudo_json, protocols, is_draft')
          .eq('student_id', studentId).eq('tipo', 'dieta').eq('is_draft', false)
          .order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
          .limit(1).maybeSingle(),
        supabase.from('assessments').select('id').eq('student_id', studentId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('workout_sessions').select('id').eq('student_id', studentId).gte('started_at', `${date}T00:00:00`).limit(1),
      ]);
      let weightKg: number | null = null;
      if (assess?.id) {
        const { data: a } = await supabase.from('anthropometrics').select('peso').eq('assessment_id', assess.id).maybeSingle();
        weightKg = a?.peso ? Number(a.peso) : null;
      }
      const { data: ov } = dieta ? await supabase.from('student_diet_overrides').select('groups, substitutions').eq('plan_id', dieta.id).maybeSingle() : { data: null };
      const diet = buildActivityDiet(dieta, ov);
      if (alive) setData({ tracking, ...diet, weightKg, trainedToday: (sess ?? []).length > 0 });
    };
    void load();

    const ch = supabase.channel(`activity-day-${studentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_tracking', filter: `student_id=eq.${studentId}` }, async () => {
        const tracking = await loadTracking();
        if (alive) setData((prev) => (prev ? { ...prev, tracking } : prev));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_diet_overrides', filter: `student_id=eq.${studentId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_plans', filter: `student_id=eq.${studentId}` }, () => { void load(); })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [studentId, date]);

  return data;
};

const MacroLine: React.FC<{ t: { kcal: number; p: number; c: number; g: number }; className?: string }> = ({ t, className }) => (
  <span className={className}>{r0(t.kcal)} kcal · P {r0(t.p)} C {r0(t.c)} G {r0(t.g)}</span>
);

const MealView: React.FC<{ a: ActivityRef }> = ({ a }) => {
  const date = a.date || a.at.slice(0, 10);
  const d = useStudentDay(a.studentId, date);
  if (!d) return <Skeleton className="h-40 w-full" />;
  const keys = d.tracking?.meals_completed ?? [];
  if (keys.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma refeição registrada neste dia.</p>;
  const { day: gi, ordered, consumed, target, doneCount } = resolveActivityMeals(d, keys, date, a.mealIndex);
  const dayStudent = d.student[gi] ?? [];
  const dayPrescribed = d.prescribed[gi] ?? [];

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
        <p className="font-semibold text-foreground">Total do dia até agora × meta</p>
        <p><strong>{r0(consumed.kcal)} kcal</strong> / {r0(target.kcal)} kcal <span className="text-muted-foreground">({doneCount}/{dayPrescribed.length} refeições)</span></p>
        <p className="text-muted-foreground">P {r0(consumed.p)}/{r0(target.p)} g · C {r0(consumed.c)}/{r0(target.c)} g · G {r0(consumed.g)}/{r0(target.g)} g</p>
      </div>
      {ordered.map((mi, pos) => {
        const meal = dayStudent[mi];
        if (!meal) return null;
        const pres = dayPrescribed[mi];
        const changes = diffMealFoods(pres?.foods ?? [], meal.foods ?? []);
        const mt = sumMeals([meal]);
        const pt = sumMeals(pres ? [pres] : []);
        const diff = mt.kcal - pt.kcal;
        return (
          <div key={mi} className={cn('rounded-xl border p-3 space-y-2', pos === 0 ? 'border-primary/50 bg-primary/5' : 'border-border')}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{meal.time ? `${meal.time} · ` : ''}{meal.name || `Refeição ${mi + 1}`}</p>
              {pos === 0 && <Badge className="text-[9px]">Último registro · {hhmm(a.at)}</Badge>}
            </div>
            <ul className="space-y-1">
              {(meal.foods ?? []).map((f, fi) => (
                <li key={fi} className="text-xs flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                  <span className="min-w-0 break-words">{foodName(f) || 'Alimento'} <span className="text-muted-foreground">· {f.qty || '—'}</span></span>
                  <MacroLine className="text-muted-foreground shrink-0" t={{ kcal: num(f.kcal), p: num(f.p), c: num(f.c), g: num(f.g) }} />
                </li>
              ))}
            </ul>
            <p className="text-xs border-t border-border/50 pt-1.5">Total: <MacroLine t={mt} className="font-semibold" /></p>
            {pres && (
              <div className="text-[11px] space-y-0.5">
                <p className="text-muted-foreground">
                  Prescrito: <MacroLine t={pt} />{' '}
                  <span className={cn(Math.abs(diff) <= 50 ? 'text-chart-2' : 'text-destructive')}>({diff >= 0 ? '+' : ''}{r0(diff)} kcal)</span>
                </p>
                {changes.filter((c) => c.kind !== 'same').map((c, ci) => (
                  <p key={ci} className="text-primary">
                    {c.kind === 'qty' && `Porção: ${foodName(c.before)} ${c.before?.qty} → ${c.after?.qty}`}
                    {c.kind === 'replaced' && `Trocado: ${foodName(c.before)} ${c.before?.qty ?? ''} → ${foodName(c.after)} ${c.after?.qty ?? ''}`}
                    {c.kind === 'added' && `A mais: ${foodName(c.after)} ${c.after?.qty ?? ''}`}
                    {c.kind === 'removed' && <span className="text-destructive">Não comeu: {foodName(c.before)} {c.before?.qty ?? ''}</span>}
                  </p>
                ))}
                {changes.every((c) => c.kind === 'same') && <p className="text-chart-2">Igual ao prescrito.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const WaterView: React.FC<{ a: ActivityRef; addedGlasses?: number }> = ({ a, addedGlasses }) => {
  const date = a.date || a.at.slice(0, 10);
  const d = useStudentDay(a.studentId, date);
  if (!d) return <Skeleton className="h-24 w-full" />;
  const glasses = d.tracking?.water_glasses ?? 0;
  const goalGlasses = d.weightKg
    ? Math.max(6, Math.round((d.weightKg * ML_PER_KG_REST * (d.trainedToday ? TRAINING_DAY_MULTIPLIER : 1)) / WATER_STEP_ML))
    : DEFAULT_WATER_GOAL_GLASSES;
  const ml = d.tracking?.water_ml ?? glasses * WATER_STEP_ML;
  const goal = goalGlasses * WATER_STEP_ML;
  const pct = Math.min(100, Math.round((ml / goal) * 100));
  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="rounded-xl border border-border bg-secondary/30 p-3">
        <p className="text-xs text-muted-foreground">Registro das {hhmm(a.at)}</p>
        <p className="text-lg font-bold">+{(addedGlasses ?? 1) * WATER_STEP_ML} ml</p>
      </div>
      <div className="rounded-xl border border-border p-3 space-y-2">
        <p className="text-sm"><strong>{(ml / 1000).toFixed(2).replace('.', ',')} L</strong> de {(goal / 1000).toFixed(2).replace('.', ',')} L hoje ({pct}%)</p>
        <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="text-[11px] text-muted-foreground">{glasses} copo{glasses === 1 ? '' : 's'} de 250 ml{d.trainedToday ? ' · meta de dia de treino' : ''}{!d.weightKg ? ' · meta padrão (sem peso na avaliação)' : ''}</p>
      </div>
    </div>
  );
};

/* ======================== TREINO ======================== */

type LiveSet = ActivitySet;
interface ExView extends ActivityExercise {
  media?: { embed?: string | null; image?: string | null };
}

const useWorkoutSession = (sessionId: string, studentId: string) => {
  const [session, setSession] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [planDay, setPlanDay] = useState<any[] | null>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [previous, setPrevious] = useState<{ session: any; logs: any[] } | null>(null);

  useEffect(() => {
    let alive = true;
    let logRequest = 0;
    const transition = createWorkoutLogTransition(setSession, () => { void loadLogs(); });
    const loadLogs = async () => {
      const request = ++logRequest;
      const { data, error } = await supabase.from('exercise_set_logs')
        .select('exercise_name, exercise_slot_id, set_number, reps, weight_kg, rpe, rir, set_type, sub_records, performed_at')
        .eq('session_id', sessionId).order('performed_at', { ascending: true });
      if (alive && request === logRequest && !error && transition.receiveLogs((data ?? []).length)) setLogs(data ?? []);
    };
    (async () => {
      const { data: s } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!alive || !s) return;
      transition.receiveSession(s);
      void loadLogs();
      const planQ = supabase.from('ai_plans').select('id, conteudo, conteudo_json, migration_status, tipo');
      const { data: plan } = s.plan_id
        ? await planQ.eq('id', s.plan_id).maybeSingle()
        : await planQ.eq('student_id', studentId).eq('tipo', 'treino').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (plan) {
        const { days } = getSafeWorkoutDays({ ...(plan as any), tipo: 'treino' });
        const day = days.find((d: any) => isSameWorkoutDay(d.day, s.day_name || '')) ?? null;
        if (alive) setPlanDay(day?.exercises ?? []);
      } else if (alive) setPlanDay([]);
      const { data: ex } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed');
      if (alive) setMedia(ex ?? []);
      if (s.day_name) {
        const { data: prev } = await supabase.from('workout_sessions').select('*')
          .eq('student_id', studentId).eq('status', 'completed').eq('day_name', s.day_name)
          .lt('started_at', s.started_at || s.created_at).order('started_at', { ascending: false }).limit(1).maybeSingle();
        if (prev) {
          const { data: pl } = await supabase.from('exercise_set_logs').select('exercise_name, reps, weight_kg, sub_records, set_type').eq('session_id', prev.id);
          if (alive) setPrevious({ session: prev, logs: pl ?? [] });
        }
      }
    })();
    const ch = supabase.channel(`activity-ws-${sessionId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workout_sessions', filter: `id=eq.${sessionId}` }, (p) => {
        if (!alive) return;
        transition.receiveSession(p.new);
        if ((p.new as any).status !== 'in_progress') void loadLogs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercise_set_logs', filter: `session_id=eq.${sessionId}` }, () => { void loadLogs(); })
      .subscribe();
    return () => { alive = false; transition.dispose(); supabase.removeChannel(ch); };
  }, [sessionId, studentId]);

  return { session, logs, planDay, media, previous };
};

const buildExercises = (session: any, logs: any[], planDay: any[] | null, media: any[]): ExView[] => {
  const mediaOf = (name: string) => {
    const m = media.length ? findBestExerciseMatch(name.toUpperCase().trim(), media as any) : null;
    return m ? { embed: (m as any).video_embed, image: (m as any).imagem_url } : undefined;
  };

  return buildActivityExercises(session, logs, planDay).map(ex => ({ ...ex, media: mediaOf(ex.name) }));
};

const setVolume = (s: LiveSet) => {
  const parts = s.subRecords?.length ? s.subRecords.filter((x) => x.completed !== false) : [s];
  return parts.reduce((acc, x) => acc + num(x.weight) * num(x.reps), 0);
};

const elapsed = (from: string, to: number) => {
  const sec = Math.max(0, Math.floor((to - new Date(from).getTime()) / 1000));
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const ExerciseSlide: React.FC<{ ex: ExView; index: number; total: number; isCurrent: boolean; progress: ExerciseProgressData; historyLoading: boolean; historyError: string | null }> = ({ ex, index, total, isCurrent, progress, historyLoading, historyError }) => {
  const p = ex.plan ?? {};
  const videoSrc = safeVideoSrc(ex.media?.embed);
  const pause = p.restSeconds ? `${p.restSeconds}s` : p.pause;
  return (
    <div className="w-full min-w-0 basis-full shrink-0 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Exercício {index + 1}/{total}</p>
        {isCurrent && <Badge className="text-[9px] gap-1"><Radio className="h-3 w-3" /> Atual</Badge>}
      </div>
      <p className="font-semibold leading-tight">{ex.name}</p>
      {ex.variationOf && <p className="text-[11px] text-muted-foreground">variação de {ex.variationOf}</p>}
      {(ex.media?.embed || ex.media?.image) && (
        <div className="relative w-full max-w-full aspect-video max-h-[40dvh] overflow-hidden rounded-md bg-muted">
          {videoSrc ? <iframe src={videoSrc} title={`Vídeo ${ex.name}`} className="absolute inset-0 h-full w-full max-w-full border-0" allow="autoplay; fullscreen" />
            : ex.media.image ? <img src={ex.media.image} alt={ex.name} className="absolute inset-0 h-full w-full max-w-full object-contain" loading="lazy" decoding="async" /> : null}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Badge variant="outline">{ex.planned} {ex.planned === 1 ? 'série' : 'séries'}</Badge>
        {p.reps && <Badge variant="outline">{activityRepLabel(p.reps)}</Badge>}
        {p.rir && <Badge variant="outline">RIR {p.rir}</Badge>}
        {pause && <Badge variant="outline">Pausa {pause}</Badge>}
        {ex.method && <Badge variant="outline" className="border-primary/50 text-primary">{ex.method}</Badge>}
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2rem_1fr_1fr_3rem] text-[10px] uppercase text-muted-foreground bg-secondary/40 px-2 py-1">
          <span>#</span><span>Carga</span><span>Reps</span><span className="text-right">RPE/RIR</span>
        </div>
        {Array.from({ length: Math.max(ex.planned, ex.sets.length) }).map((_, si) => {
          const s = ex.sets[si];
          const row = activitySetDisplay(s, p.reps);
          const done = row.done;
          return (
            <div key={si} className={cn('px-2 py-1.5 text-sm border-t border-border/50', !done && 'text-muted-foreground/60')}>
              <div className="grid grid-cols-[2rem_1fr_1fr_3rem]">
                <span>{si + 1}</span>
                <span>{row.weight}</span>
                <span>{row.reps}</span>
                <span className="text-right text-xs">{row.effort}</span>
              </div>
              {row.target && <p className="pl-8 text-[10px] text-muted-foreground">meta {row.target}</p>}
              {done && (s?.subRecords?.length ?? 0) > 1 && (
                <p className="text-[10px] text-muted-foreground pl-8">
                  {s?.subRecords?.map((x, i) => `${x.label || (i === 0 ? 'Principal' : `Parte ${i}`)} ${x.weight ?? '—'}kg×${x.reps ?? '—'}`).join(' · ')}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <ExerciseProgressSummary data={progress} loading={historyLoading} error={historyError} />
    </div>
  );
};

const WorkoutView: React.FC<{ a: ActivityRef }> = ({ a }) => {
  const { session, logs, planDay, media, previous } = useWorkoutSession(a.sessionId ?? '', a.studentId);
  const [now, setNow] = useState(Date.now());
  const [viewIdx, setViewIdx] = useState<number | null>(null); // null = seguindo o ao vivo
  const touchX = useRef<number | null>(null);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const exercises = useMemo(() => buildExercises(session, logs, planDay, media), [session, logs, planDay, media]);
  const [history, setHistory] = useState<ActivityHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const exerciseNamesKey = JSON.stringify(exercises.map(e => e.name).sort());
  const startedAt = session?.started_at_real || session?.started_at;
  useEffect(() => {
    if (!startedAt || planDay == null) return;
    let alive = true;
    setHistoryLoading(true); setHistoryError(null); setHistory([]);
    const load = async () => {
      try {
        const names: string[] = JSON.parse(exerciseNamesKey);
        const all: ActivityHistoryLog[] = [];
        if (names.length) {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from('exercise_set_logs')
              .select('exercise_name, session_id, performed_at, set_number, weight_kg, reps, set_type, sub_records')
              .eq('student_id', a.studentId).in('exercise_name', names).lt('performed_at', startedAt)
              .order('performed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 999);
            if (error) throw error;
            all.push(...(data ?? []) as ActivityHistoryLog[]);
            if (!alive || (data ?? []).length < 1000) break;
          }
        }
        if (alive) setHistory(all);
      } catch (error) {
        if (alive) setHistoryError(error instanceof Error ? error.message : 'Não foi possível carregar.');
      } finally { if (alive) setHistoryLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [a.studentId, startedAt, exerciseNamesKey, planDay == null]);
  const progress = exercises.map(e => exerciseProgress(e.name, e.sets, history, a.sessionId ?? '', startedAt ?? '', e.plan));
  if (!session || planDay == null) return <Skeleton className="h-64 w-full" />;

  const status: string = session.status;
  const lastActive = session.last_active_at ? new Date(session.last_active_at).getTime() : 0;
  const state = status === 'completed' ? 'Finalizado'
    : status === 'in_progress' ? (now - lastActive > INACTIVE_MS ? 'Pausado' : 'Ao vivo')
    : 'Encerrado';
  const live = status === 'in_progress';
  const liveIdx = Math.min(Math.max(0, Number(session.session_state?.currentIndex) || 0), Math.max(0, exercises.length - 1));
  const idx = viewIdx ?? (live ? liveIdx : 0);
  const started = session.started_at_real || session.started_at;
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const totalSets = exercises.reduce((n, e) => n + Math.max(e.planned, e.sets.length), 0);
  const doneEx = exercises.filter((e) => e.sets.some((s) => s.completed)).length;
  const volume = exercises.reduce((v, e) => v + e.sets.filter((s) => s.completed).reduce((x, s) => x + setVolume(s), 0), 0);
  const go = (n: number) => {
    const next = Math.max(0, Math.min(exercises.length - 1, n));
    setViewIdx(live && next === liveIdx ? null : next);
  };

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{session.day_name || 'Treino'}</p>
          <p className="text-[11px] text-muted-foreground">Início {hhmm(started)}</p>
        </div>
        <Badge variant="outline" className={cn('gap-1 shrink-0',
          state === 'Ao vivo' && 'border-emerald-500/50 text-emerald-500',
          state === 'Pausado' && 'border-amber-500/50 text-amber-500',
          state === 'Finalizado' && 'border-primary/50 text-primary')}>
          {state === 'Ao vivo' && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
          {state}
        </Badge>
      </div>

      <div className="grid w-full min-w-0 grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/40 p-2">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Timer className="h-3 w-3" />Tempo</p>
          <p className="font-bold tabular-nums">
            {live ? elapsed(started, now) : session.duration_minutes != null ? `${session.duration_minutes} min` : started && session.completed_at ? elapsed(started, new Date(session.completed_at).getTime()) : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2">
          <p className="text-[10px] text-muted-foreground">Exercícios</p>
          <p className="font-bold">{live ? `${liveIdx + 1}/${exercises.length}` : `${doneEx}/${exercises.length}`}</p>
        </div>
        <div className="rounded-lg bg-secondary/40 p-2">
          <p className="text-[10px] text-muted-foreground">Séries</p>
          <p className="font-bold">{doneSets}/{totalSets}</p>
        </div>
      </div>

      {(
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
          <p>Volume total: <strong>{r0(Number(session.total_volume_kg) || volume).toLocaleString('pt-BR')} kg</strong>{session.avg_rpe != null && <> · RPE médio <strong>{session.avg_rpe}</strong></>}</p>
          {previous ? (() => {
            const pv = Number(previous.session.total_volume_kg) || previous.logs.reduce((s, l) => s + num(l.weight_kg) * num(l.reps), 0);
            const cur = Number(session.total_volume_kg) || volume;
            const dv = cur - pv;
            return (
              <p className="text-muted-foreground">
                Sessão anterior ({new Date(previous.session.started_at).toLocaleDateString('pt-BR')}): {r0(pv).toLocaleString('pt-BR')} kg
                {previous.session.duration_minutes != null && ` · ${previous.session.duration_minutes} min`}
                {previous.session.avg_rpe != null && ` · RPE ${previous.session.avg_rpe}`}{' '}
                <span className={dv >= 0 ? 'text-chart-2' : 'text-destructive'}>({dv >= 0 ? '+' : ''}{r0(dv).toLocaleString('pt-BR')} kg)</span>
              </p>
            );
          })() : <p className="text-muted-foreground">Sem sessão equivalente anterior; comparação por exercício abaixo.</p>}
          {!historyLoading && !historyError && <p className="pt-1 font-semibold">↑ {progress.filter(p => p.status === 'up').length} progrediram · = {progress.filter(p => p.status === 'same').length} mantiveram · ↓ {progress.filter(p => p.status === 'down').length} caíram</p>}
        </div>
      )}

      {exercises.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem exercícios registrados.</p>
      ) : (
        <>
          <div className="flex w-full min-w-0 items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={idx === 0} onClick={() => go(idx - 1)} aria-label="Exercício anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 flex justify-center gap-1 overflow-hidden">
              {exercises.map((e, i) => (
                <Button key={i} variant="ghost" onClick={() => go(i)} aria-label={`Ver ${e.name}`}
                  className={cn('h-1.5 min-w-0 rounded-full p-0 transition-all', i === idx ? 'w-5 bg-primary' : e.sets.some((s) => s.completed) ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted-foreground/30')} />
              ))}
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={idx >= exercises.length - 1} onClick={() => go(idx + 1)} aria-label="Próximo exercício">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {live && viewIdx != null && (
            <Button size="sm" variant="secondary" className="w-full h-8 text-xs gap-1.5" onClick={() => setViewIdx(null)}>
              <Radio className="h-3.5 w-3.5 text-emerald-500" /> Voltar para o ao vivo
            </Button>
          )}
          <div
            className="w-full min-w-0 max-w-full overflow-hidden"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
            }}
          >
            <div className="flex w-full min-w-0 transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${idx * 100}%)` }}>
              {exercises.map((e, i) => (
                <ExerciseSlide key={i} ex={e} index={i} total={exercises.length} isCurrent={live && i === liveIdx} progress={progress[i]} historyLoading={historyLoading} historyError={historyError} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/** "Marcou treino concluído" sem sessão vinculada: usa a sessão do dia. */
const WorkoutDoneResolver: React.FC<{ a: ActivityRef }> = ({ a }) => {
  const [sid, setSid] = useState<string | null | undefined>(a.sessionId);
  useEffect(() => {
    if (a.sessionId) return;
    const date = a.date || a.at.slice(0, 10);
    supabase.from('workout_sessions').select('id').eq('student_id', a.studentId)
      .gte('started_at', `${date}T00:00:00`).order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setSid(data?.id ?? null));
  }, [a]);
  if (sid === undefined) return <Skeleton className="h-40 w-full" />;
  if (!sid) return <p className="text-sm text-muted-foreground">O treino foi marcado como concluído sem sessão registrada no app.</p>;
  return <WorkoutView a={{ ...a, sessionId: sid }} />;
};

/* ======================== DIALOG ======================== */

const TITLE: Record<ActivityKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  workout_start: { label: 'Treino', icon: Dumbbell },
  workout_end: { label: 'Resumo do treino', icon: Dumbbell },
  workout_done: { label: 'Resumo do treino', icon: Dumbbell },
  water: { label: 'Água', icon: Droplet },
  meal: { label: 'Refeição registrada', icon: UtensilsCrossed },
};

const LiveActivityDetailDialog: React.FC<{ activity: (ActivityRef & { addedGlasses?: number }) | null; onClose: () => void }> = ({ activity, onClose }) => {
  const meta = activity ? TITLE[activity.kind] : null;
  const Icon = meta?.icon ?? Dumbbell;
  return (
    <Dialog open={!!activity} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-hidden p-4 pt-[max(1rem,env(safe-area-inset-top))] [&>button:last-child]:hidden sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-2xl sm:p-6">
        <DialogHeader className="min-w-0 shrink-0 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-primary" />
            {meta?.label}
          </DialogTitle>
          <DialogDescription>{activity?.studentName}</DialogDescription>
        </DialogHeader>
        {/* Fechamento próprio: fica abaixo da safe area do iPhone (barra de status) e com área de toque de 44px. */}
        <DialogClose
          aria-label="Fechar"
          className="absolute z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border/50 bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-opacity hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))',
            right: 'max(0.75rem, calc(env(safe-area-inset-right) + 0.5rem))',
          }}
        >
          <X className="h-5 w-5" />
        </DialogClose>
        <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {activity && (
          activity.kind === 'meal' ? <MealView a={activity} />
          : activity.kind === 'water' ? <WaterView a={activity} addedGlasses={activity.addedGlasses} />
          : activity.kind === 'workout_done' ? <WorkoutDoneResolver a={activity} />
          : activity.sessionId ? <WorkoutView key={activity.sessionId} a={activity} />
          : <p className="text-sm text-muted-foreground">Sessão não encontrada.</p>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveActivityDetailDialog;
