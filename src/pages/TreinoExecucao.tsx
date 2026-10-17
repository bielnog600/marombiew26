import { MethodSetRows } from '@/components/training/MethodSetRows';
import { WorkoutGroupTabs } from '@/components/training/WorkoutGroupTabs';
import { useWorkoutGroupFlow, type GroupPause } from '@/hooks/useWorkoutGroupFlow';
import { exerciseBlocks, seriesMethod, methodOnSet, methodLogFields, subRecordVolume, type MethodSetEntry } from '@/lib/workoutExecutionMethods';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { ArrowLeft, Play, Pause, Check, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ForgottenWorkoutDialog from '@/components/training/ForgottenWorkoutDialog';
import { decideWorkoutStart, isSessionForgotten, isSameWorkoutDay, shouldShowWorkoutLoading, workoutDayLabel } from '@/lib/activeWorkoutSession';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveWorkoutSession } from '@/hooks/useActiveWorkoutSession';
import { type ParsedExercise, parseTrainingSections } from '@/lib/trainingResultParser';
import { buildSetPlan, buildPlanSummary, type PlannedSet } from '@/lib/setPlanBuilder';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { PHASE_SHORT_LABELS, getPhaseByMonthDay, type TrainingPhase } from '@/lib/trainingPhase';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { getSafeWorkoutDays, trackPlanAccess } from '@/lib/planMigrationUtils';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';
import { PhaseInfoSheet } from '@/components/training/PhaseInfoSheet';
import { MachineAdjustSheet } from '@/components/training/MachineAdjustSheet';
import { ExerciseLoadHistorySheet } from '@/components/training/ExerciseLoadHistorySheet';
import { SessionRpeDialog } from '@/components/training/SessionRpeDialog';
import ExerciseVideoCapture from '@/components/training/ExerciseVideoCapture';
import { Settings2, Info, BarChart3, Timer, Camera, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { methodExplanation } from '@/lib/workoutExecutionMethods';
import { fetchWithCache, getCached, setCache } from '@/lib/offlineCache';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useSessionProgression } from '@/hooks/useSessionProgression';
import { getRecommendationFor, type ProgressionSnapshot } from '@/lib/sessionProgression';
import { StudentWeightInput } from '@/components/training/StudentWeightInput';
import { StudentLoadSummaryCard } from '@/components/training/StudentLoadSummaryCard';
import { lastWorkSetLine, studentSuggestionLine, studentWeightPlaceholder, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';
import MethodBadge from '@/components/training/MethodBadge';
import { parsePauseSeconds } from '@/components/training/TrainerLogSheetUtils';


import {
  resolveStaleWorkoutSessionsThrottled,
  cancelWorkoutSession,
  finishWorkoutSessionWithRecorded,
} from '@/lib/workoutSessionResolution';

const normalizeExName = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();

const VARIATION_PREF_KEY = 'mw_exercise_variation_pref';
const VARIATION_PREF_FIELD = '__preferred_variation';

const normalizeExerciseKey = (exerciseName: string) => exerciseName.toUpperCase().trim();

const loadVariationPref = (userId: string | undefined, exerciseName: string): boolean => {
  if (!userId || !exerciseName) return false;
  try {
    const raw = localStorage.getItem(`${VARIATION_PREF_KEY}:${userId}`);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return !!map[normalizeExerciseKey(exerciseName)];
  } catch {
    return false;
  }
};

const saveVariationPref = (userId: string | undefined, exerciseName: string, value: boolean) => {
  if (!userId || !exerciseName) return;
  try {
    const key = `${VARIATION_PREF_KEY}:${userId}`;
    const raw = localStorage.getItem(key);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[normalizeExerciseKey(exerciseName)] = value;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

interface ExerciseSet extends MethodSetEntry {
  reps: string;
  weight: string;
  completed: boolean;
  /**
   * RIR (reps na reserva) informado pelo aluno para ESTA série.
   * Totalmente opcional: nunca bloqueia o registro da série. Vazio => null.
   */
  rir?: string;
}


interface ExerciseDBData {
  id?: string;
  nome: string;
  imagem_url: string | null;
  video_embed: string | null;
  grupo_muscular: string;
  ajustes?: string[] | null;
}

interface ExerciseMediaMap {
  [key: string]: {
    id?: string;
    imageUrl?: string;
    videoEmbed?: string;
    muscleGroup?: string;
    ajustes?: string[] | null;
  };
}

const extractStreamVideoId = (embed: string | null | undefined): string | null => {
  if (!embed) return null;
  // Aceita tanto o domínio antigo (customer-*.cloudflarestream.com/<uid>/...)
  // quanto o iframe novo do Direct Creator Upload (iframe.videodelivery.net/<uid>).
  const patterns = [
    /cloudflarestream\.com\/([a-f0-9]{32})/i,
    /videodelivery\.net\/([a-f0-9]{32})/i,
    /cloudflarestream\.com\/([a-f0-9]{32})\/iframe/i,
  ];
  for (const re of patterns) {
    const m = embed.match(re);
    if (m) return m[1];
  }
  return null;
};

/** Card flutuante compacto de descanso: tempo restante, +15s e Pular. Vibra ao zerar. */
const RestTimerOverlay = ({ timeLeft, totalSeconds, onClose, onAddTime }: { timeLeft: number; totalSeconds: number; onClose: () => void; onAddTime: (secs: number) => void }) => {
  useEffect(() => {
    if (timeLeft === 0 && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }, [timeLeft]);

  const safeTime = Math.max(timeLeft, 0);
  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, safeTime / totalSeconds)) : 0;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm animate-fade-in" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }} data-testid="rest-timer-card">
      <div className="rounded-xl border border-primary/40 bg-card/95 backdrop-blur shadow-xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Descanso</span>
          <span className={`text-2xl font-mono font-bold tabular-nums ${timeLeft < 0 ? 'text-destructive' : 'text-primary'}`}>
            {timeLeft < 0 ? '+' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => onAddTime(15)}>+15s</Button>
          <Button variant="ghost" size="sm" className="flex-1 h-9" onClick={onClose}>Pular</Button>
        </div>
      </div>
    </div>
  );
};

const TreinoExecucaoInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { completeWorkout } = useDailyTracking();
  const { session: activeSession, refresh: refreshActiveSession, clear: clearActiveSession, setLocal: setLocalActiveSession } = useActiveWorkoutSession();
  const stateData = location.state as {
    exercises?: ParsedExercise[];
    dayName?: string;
    exerciseMedia?: ExerciseMediaMap;
    phase?: TrainingPhase;
    planId?: string | null;
  } | null;

  const [loadedExercises, setLoadedExercises] = useState<ParsedExercise[]>(stateData?.exercises || []);
  const [loadedDayName, setLoadedDayName] = useState(stateData?.dayName || 'Treino');
  const [loadedMedia, setLoadedMedia] = useState<ExerciseMediaMap>(stateData?.exerciseMedia || {});
  const [phase, setPhase] = useState<TrainingPhase | null>(stateData?.phase || null);
  const [sessionPlanId, setSessionPlanId] = useState<string | null>(stateData?.planId || null);
  // Item 4: Flag explícita para aguardar o contexto do treino antes de criar uma nova sessão
  const workoutContextReady = stateData?.exercises ? true : false;
  const [contextReady, setContextReady] = useState(workoutContextReady);
  // Plano/sessão/dia ainda carregando (retomada ou link direto): bloqueia o
  // estado vazio até tudo terminar de carregar.
  const [planLoading, setPlanLoading] = useState(!stateData?.exercises);

  const exercises = loadedExercises;
  const dayName = loadedDayName;
  const exerciseMedia = loadedMedia;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sets, setSets] = useState<Record<number, ExerciseSet[]>>({});
  // Cache of last performed values per exercise name (from previous sessions)
  const [lastLogsByExercise, setLastLogsByExercise] = useState<Record<string, PreviousExerciseSet[]>>({});
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  useEffect(() => {
    document.body.classList.add('student-workout-open');
    return () => document.body.classList.remove('student-workout-open');
  }, []);
  const [loadedLogsForIndex, setLoadedLogsForIndex] = useState<Set<number>>(new Set());
  const [exerciseDB, setExerciseDB] = useState<ExerciseDBData[]>([]);
  const { restTimer, startTimer: startRestTimer, stopTimer: stopRestTimer, adjustTimer: adjustRestTimer } = useRestTimer();
  const [showPlayFallback, setShowPlayFallback] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showingVariation, setShowingVariation] = useState(false);
  const [variationPrefs, setVariationPrefs] = useState<Record<string, boolean>>({});
  // Sessão persistida: started_at vem do banco (ou agora se ainda não existe)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartAt, setSessionStartAt] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showSessionRpe, setShowSessionRpe] = useState(false);
  const [summary, setSummary] = useState<{ duration: number; completed: number } | null>(null);
  const [showPhaseInfo, setShowPhaseInfo] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showVideoCapture, setShowVideoCapture] = useState(false);
  const [showLoadHistory, setShowLoadHistory] = useState(false);
  // Snapshot consultivo de progressão restaurado do session_state (retomada).
  const [restoredSnapshot, setRestoredSnapshot] = useState<ProgressionSnapshot | null>(null);
  // Item 7: Flag para impedir que a fase seja sobrescrita na retomada
  const resumedSessionRef = useRef(false);
  const currentPhase = phase ?? getPhaseByMonthDay();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const zoomVideoRef = useRef<HTMLVideoElement | null>(null);
  const zoomHlsRef = useRef<Hls | null>(null);

  // Combined Session timer tick & visibility sync
  useEffect(() => {
    const sync = () => setElapsedSeconds(Math.floor((Date.now() - sessionStartAt) / 1000));
    
    sync();
    const id = setInterval(sync, 1000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        sync();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [sessionStartAt]);

  // Diálogos de sessão: outro dia em andamento ou sessão esquecida (> 6 h).
  const [sessionConflict, setSessionConflict] = useState<{ id: string; message: string; dayName: string | null } | null>(null);
  const [forgottenSession, setForgottenSession] = useState<{ id: string; day_name: string | null; started_at: string } | null>(null);
  const [sessionDialogBusy, setSessionDialogBusy] = useState(false);

  // Cria ou retoma a sessão em andamento (de QUALQUER dia do plano). A sessão
  // in_progress no banco é a fonte de verdade: nunca é encerrada sozinha aqui.
  const sessionInitRef = useRef(false);
  const sessionInitRunningRef = useRef(false);
  useEffect(() => {
    if (!user || sessionInitRef.current || sessionInitRunningRef.current) return;
    sessionInitRunningRef.current = true;
    (async () => {
      try {
      const applyState = (state: any, existingSession?: any) => {
        if (state?.currentIndex != null) {
          // O índice é limitado ao tamanho do treino quando os exercícios carregarem.
          setCurrentIndex(Math.max(0, state.currentIndex));
        }
        if (state?.sets) {
          setSets(state.sets);
          const idxs = new Set<number>(Object.keys(state.sets).map((k) => Number(k)));
          setLoadedLogsForIndex(idxs);
        }
        // Retomada: reaproveita o snapshot já calculado (nunca recalcula).
        if (state?.progressionRecommendations) {
          setRestoredSnapshot(state.progressionRecommendations as ProgressionSnapshot);
        }
        // Regra 22: Fase e PlanId congelados na retomada
        if (existingSession?.phase) setPhase(existingSession.phase as TrainingPhase);
        if (existingSession?.plan_id) setSessionPlanId(existingSession.plan_id);
        resumedSessionRef.current = true;
      };
      // Dia pedido explicitamente (veio da prévia/lista). Sem state = retomar.
      const requestedDay = stateData?.dayName ?? null;

      // 0. Fecha só sessões abandonadas há muito tempo (resolução de segundo plano).
      await resolveStaleWorkoutSessionsThrottled(user.id, true);

      // 1. Verifica se já existe sessão em andamento
      const { data: existing, error: existingError } = await supabase
        .from('workout_sessions')
        .select('id, started_at, created_at, last_active_at, day_name, phase, session_state, plan_id')
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const resume = (row: any, state: any) => {
        setSessionId(row.id);
        setSessionStartAt(new Date(row.started_at).getTime());
        if (row.day_name) setLoadedDayName((cur) => (stateData?.dayName ? cur : row.day_name));
        applyState(state, row);
        setLocalActiveSession({
          id: row.id,
          student_id: user.id,
          plan_id: row.plan_id,
          day_name: row.day_name,
          phase: row.phase,
          started_at: row.started_at,
          last_active_at: row.last_active_at ?? null,
          session_state: state,
        });
        sessionInitRef.current = true;
      };

      if (existing && existing.started_at) {
        if (isSessionForgotten(existing as any)) {
          setForgottenSession({ id: existing.id, day_name: existing.day_name, started_at: existing.started_at });
          sessionInitRef.current = true;
          return;
        }
        const decision = decideWorkoutStart(existing as any, requestedDay);
        if (decision.kind === 'conflict') {
          setSessionConflict({ id: existing.id, message: decision.message, dayName: existing.day_name });
          sessionInitRef.current = true;
          return;
        }
        // Rascunho local da mesma sessão tem prioridade (pode ter edições não enviadas).
        const state = (activeSession?.id === existing.id ? activeSession.session_state : null) ?? existing.session_state;
        resume(existing, state);
        return;
      }

      // Offline: retoma pelo rascunho local da sessão.
      if (existingError && activeSession?.id && activeSession.started_at) {
        const decision = decideWorkoutStart(activeSession as any, requestedDay);
        if (decision.kind !== 'conflict' && !isSessionForgotten(activeSession as any)) {
          resume(activeSession, activeSession.session_state);
          return;
        }
      }

      // 2. Cria nova sessão em andamento - APENAS se o contexto estiver pronto (Regra 4)
      if (!contextReady) return;
      sessionInitRef.current = true;

      const startedAtIso = new Date().toISOString();
      const { data: newSession, error: createSessionError } = await supabase
        .from('workout_sessions')
        .insert({
          student_id: user.id,
          day_name: dayName,
          plan_id: sessionPlanId,
          phase: phase ?? null,
          status: 'in_progress',
          started_at: startedAtIso,
          last_active_at: startedAtIso,
          duration_minutes: 0,
          exercises_completed: 0,
          total_exercises: exercises.length,
        })
        .select('id, started_at')
        .single();

      if (!createSessionError && newSession) {
        setSessionId(newSession.id);
        setSessionStartAt(new Date(newSession.started_at).getTime());
        setLocalActiveSession({
          id: newSession.id,
          student_id: user.id,
          plan_id: sessionPlanId,
          day_name: dayName,
          phase: phase ?? null,
          started_at: newSession.started_at,
          last_active_at: newSession.started_at,
          session_state: null,
        });

        await supabase.from('student_events').insert({
          student_id: user.id,
          event_type: 'workout_started',
          metadata: { day_name: dayName ?? null, session_id: newSession.id },
        });
      }
      } finally {
        sessionInitRunningRef.current = false;
      }
    })();
  }, [user, dayName, phase, exercises.length, setLocalActiveSession, activeSession, contextReady, sessionPlanId]);

  // Limita o exercício retomado ao tamanho do treino assim que ele carrega.
  useEffect(() => {
    if (exercises.length === 0) return;
    setCurrentIndex((i) => Math.min(Math.max(0, i), exercises.length - 1));
  }, [exercises.length]);

  const handleContinueOtherSession = () => {
    // Remonta a tela sem "state": retoma a sessão aberta (dia dela).
    setSessionConflict(null);
    navigate('/treino-execucao', { replace: true });
  };

  const handleEndOtherAndStart = async () => {
    if (!sessionConflict) return;
    setSessionDialogBusy(true);
    await cancelWorkoutSession(sessionConflict.id);
    clearActiveSession();
    setSessionDialogBusy(false);
    setSessionConflict(null);
    navigate('/treino-execucao', { replace: true, state: location.state });
  };

  const handleForgottenChoice = async (choice: 'finish' | 'cancel') => {
    if (!forgottenSession) return;
    setSessionDialogBusy(true);
    if (choice === 'finish') await finishWorkoutSessionWithRecorded(forgottenSession.id);
    else await cancelWorkoutSession(forgottenSession.id);
    clearActiveSession();
    setSessionDialogBusy(false);
    setForgottenSession(null);
    toast.success(choice === 'finish' ? 'Treino finalizado com o que foi registrado.' : 'Treino cancelado.');
    if (stateData?.exercises) navigate('/treino-execucao', { replace: true, state: location.state });
    else navigate('/minha-area', { replace: true });
  };

  const sessionDialogs = (
    <>
      <AlertDialog open={!!sessionConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Treino em andamento</AlertDialogTitle>
            <AlertDialogDescription>{sessionConflict?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sessionDialogBusy} onClick={handleEndOtherAndStart}>
              Encerrar e começar o de {workoutDayLabel(stateData?.dayName, 'short')}
            </AlertDialogCancel>
            <AlertDialogAction disabled={sessionDialogBusy} onClick={handleContinueOtherSession}>
              Continuar o de {workoutDayLabel(sessionConflict?.dayName, 'short')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ForgottenWorkoutDialog
        session={forgottenSession}
        busy={sessionDialogBusy}
        onFinish={() => handleForgottenChoice('finish')}
        onCancel={() => handleForgottenChoice('cancel')}
      />
    </>
  );

  // Recomendações consultivas da sessão (congeladas no início; nunca
  // recalculadas durante o treino e nunca gravadas em exercise_set_logs).
  const { snapshot: progressionSnapshot } = useSessionProgression({
    studentId: user?.id ?? null,
    sessionId,
    exercises,
    phase: phase ?? null,
    planId: sessionPlanId,
    restoredSnapshot,
  });

  // Metadados do treino gravados no session_state: permitem classificar e
  // recuperar as séries mesmo quando o aluno não finaliza manualmente.
  const [groupPause, setGroupPause] = useState<GroupPause | null>(null);
  const groupFlow = useWorkoutGroupFlow(exercises, currentIndex, setCurrentIndex, groupPause, setGroupPause);
  useEffect(() => {
    const restored = activeSession?.session_state as { groupPause?: GroupPause } | undefined;
    if (restored?.groupPause) setGroupPause(restored.groupPause);
  }, [activeSession?.id]);
  const sessionMeta = useMemo(() => ({
    groupPause,
    exerciseSlotIds: exercises.map(ex => ex.id),
    executionMethods: exercises.map(ex => seriesMethod(ex)),
    exerciseNames: exercises.map((ex: any) => ex?.exercise || ''),
    plannedSets: exercises.map((ex: any) =>
      buildSetPlan(ex?.series, ex?.series2, ex?.reps, ex?.setScheme).length || 3,
    ),
    /** Tipo estrutural planejado de cada série (recognition | work). */
    plannedSetTypes: exercises.map((ex: any) =>
      buildSetPlan(ex?.series, ex?.series2, ex?.reps, ex?.setScheme).map((p) => p.type),
    ),
    ...(progressionSnapshot ? { progressionRecommendations: progressionSnapshot } : {}),
  }), [exercises, progressionSnapshot, groupPause]);


  const formatElapsed = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const syncLocalActiveSession = useCallback((nextSets: Record<number, ExerciseSet[]>, nextIndex: number, targetSessionId = sessionId, targetStartedAt = sessionStartAt) => {
    if (!targetSessionId || !user) return;
    setLocalActiveSession({
      id: targetSessionId,
      student_id: user.id,
      plan_id: sessionPlanId,
      day_name: dayName,
      phase: phase ?? null,
      started_at: new Date(targetStartedAt).toISOString(),
      session_state: { sets: nextSets, currentIndex: nextIndex, ...sessionMeta },
    });
  }, [sessionId, sessionStartAt, user, setLocalActiveSession, dayName, phase, sessionMeta]);

  useEffect(() => {
    syncLocalActiveSession(sets, currentIndex);
  }, [sets, currentIndex, syncLocalActiveSession]);

  // Auto-save de progresso (sets + currentIndex) na sessão em andamento — debounced
  useEffect(() => {
    if (!sessionId) return;
    const t = setTimeout(() => {
      supabase
        .from('workout_sessions')
        .update({ session_state: { sets, currentIndex, ...sessionMeta } as any, last_active_at: new Date().toISOString() })
        .eq('id', sessionId)
        .then(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [sets, currentIndex, sessionId, sessionMeta]);

  // Flush imediato ao backgrounded/fechar app — evita perder reps/cargas digitadas
  // que ainda não foram persistidas pelo debounce.
  useEffect(() => {
    if (!sessionId) return;
    const flush = () => {
      supabase
        .from('workout_sessions')
        .update({ session_state: { sets, currentIndex, ...sessionMeta } as any })
        .eq('id', sessionId)
        .then(() => {});
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [sets, currentIndex, sessionId, sessionMeta]);


  // Auto-load training plan from DB when accessed directly (no state)
  useEffect(() => {
    if (loadedExercises.length > 0 || !user) {
      setPlanLoading(false);
      return;
    }
    const loadPlan = async () => {
      // Usa o mesmo cache offline da lista de treinos: se estiver sem internet,
      // o plano vem do IndexedDB em vez de falhar.
      const { data: plans } = await fetchWithCache(`plans:treino:all:${user.id}`, async () => {
        const { data } = await supabase
          .from('ai_plans')
          .select('id, conteudo, conteudo_json, migration_status, fase, fase_inicio_data')
          .eq('student_id', user.id)
          .eq('tipo', 'treino')
          .order('created_at', { ascending: false });
        return data;
      });
      const treino = Array.isArray(plans) ? plans[0] : null;
      if (treino) {
        // Bug 2: Definir PlanId ao carregar diretamente
        setSessionPlanId(treino.id);

        // Fase da sessão vem da FONTE CENTRAL (timeline do plano), nunca de
        // um cálculo local — garante paridade com weeklyTraining e com o admin.
        if (!resumedSessionRef.current) {
          setPhase(resolveCurrentTrainingPhase({
            id: treino.id,
            fase: (treino as any).fase ?? null,
            fase_inicio_data: (treino as any).fase_inicio_data ?? null,
          }).phase);
        }
        const { days: allDays, isFromJSON } = getSafeWorkoutDays({ ...treino, tipo: 'treino' });
        trackPlanAccess({ ...treino, tipo: 'treino' }, isFromJSON);
        if (allDays.length > 0) {
          // Se há uma sessão em andamento, prioriza o day_name dela
          // (evita carregar o treino "de hoje" quando a sessão foi iniciada
          // ontem à noite e o usuário reabre o app no dia seguinte).
          let today = null as (typeof allDays)[number] | null;
          let activeDayName = activeSession?.day_name?.trim();
          // Fonte de verdade: sessão in_progress no banco (de qualquer dia).
          try {
            const { data: openSession } = await supabase
              .from('workout_sessions')
              .select('day_name')
              .eq('student_id', user.id)
              .eq('status', 'in_progress')
              .order('started_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (openSession?.day_name) activeDayName = openSession.day_name.trim();
          } catch { /* offline: usa o rascunho local */ }
          if (activeDayName) {
            today = allDays.find((d) => isSameWorkoutDay(d.day, activeDayName)) ?? null;
          }
          if (!today) {
            const todayIndex = (new Date().getDay() + 6) % 7 % allDays.length;
            today = allDays[todayIndex];
          }
          setLoadedExercises(today.exercises);
          setLoadedDayName(today.day);
          setContextReady(true);

          // Load exercise media
          const names = today.exercises
            .flatMap((e) => [e.exercise, e.variation])
            .map((name) => name?.toUpperCase().trim())
            .filter(Boolean) as string[];
          const uniqueNames = [...new Set(names)];
          const { data: dbEx } = await fetchWithCache('exercises:all', async () => {
            const { data } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed, grupo_muscular, ajustes');
            return data;
          });
          if (dbEx) {
            const mediaMap: ExerciseMediaMap = {};
            for (const name of uniqueNames) {
              const match = findBestExerciseMatch(name, dbEx);
              if (match) {
                mediaMap[name] = {
                  id: match.id,
                  imageUrl: match.imagem_url || undefined,
                  videoEmbed: match.video_embed || undefined,
                  muscleGroup: match.grupo_muscular || undefined,
                  ajustes: match.ajustes ?? null,
                };
              }
            }
            setLoadedMedia(mediaMap);
          }
          return;
        }
      }

      // Último recurso offline: retoma o treino salvo da última execução.
      const lastWorkout = await getCached<{ exercises: ParsedExercise[]; dayName: string; media: ExerciseMediaMap; phase: TrainingPhase | null; planId: string | null }>(
        `workout:last:${user.id}`,
      );
      if (lastWorkout?.exercises?.length) {
        setLoadedExercises(lastWorkout.exercises);
        setLoadedDayName(lastWorkout.dayName || 'Treino');
        setLoadedMedia(lastWorkout.media || {});
        if (lastWorkout.phase) setPhase(lastWorkout.phase);
        if (lastWorkout.planId) setSessionPlanId(lastWorkout.planId);
        setContextReady(true);
      }
    };
    loadPlan().finally(() => setPlanLoading(false));
  }, [user, loadedExercises.length, activeSession?.day_name]);

  // Guarda o treino atual para permitir retomar totalmente offline.
  useEffect(() => {
    if (!user || loadedExercises.length === 0) return;
    setCache(`workout:last:${user.id}`, {
      exercises: loadedExercises,
      dayName: loadedDayName,
      media: loadedMedia,
      phase: phase ?? null,
      planId: sessionPlanId,
    });
  }, [user, loadedExercises, loadedDayName, loadedMedia, phase]);

  const exercise = exercises[currentIndex];
  const setPlan: PlannedSet[] = useMemo(
    () => (exercise ? buildSetPlan(exercise.series, exercise.series2, exercise.reps, exercise.setScheme) : []),
    [exercise],
  );
  const totalSeries = setPlan.length || 3;

  useEffect(() => {
    const loadExercises = async () => {
      const { data: dbData } = await fetchWithCache('exercises:all', async () => {
        const { data } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed, grupo_muscular, ajustes');
        return data;
      });
      if (dbData) setExerciseDB(dbData as ExerciseDBData[]);
    };

    loadExercises();
  }, []);

  const matchedExercise = useMemo(() => {
    if (!exercise) return null;
    const name = exercise.exercise.toUpperCase().trim();

    if (exerciseMedia[name]) {
      return {
        id: exerciseMedia[name].id,
        nome: name,
        imagem_url: exerciseMedia[name].imageUrl ?? null,
        video_embed: exerciseMedia[name].videoEmbed ?? null,
        grupo_muscular: exerciseMedia[name].muscleGroup ?? '',
        ajustes: exerciseMedia[name].ajustes ?? null,
      } as ExerciseDBData;
    }

    if (!exerciseDB.length) return null;
    let match = exerciseDB.find((e) => e.nome.toUpperCase().trim() === name);
    if (match) return match;
    // Prefer the most-specific (longest) partial match to avoid e.g. "ESCADA" matching "PRANCHA ESCADA"
    const partials = exerciseDB
      .filter((e) => {
        const n = e.nome.toUpperCase().trim();
        return name.includes(n) || n.includes(name);
      })
      .sort((a, b) => b.nome.trim().length - a.nome.trim().length);
    return partials[0] || null;
  }, [exercise, exerciseDB, exerciseMedia]);

  const matchedVariation = useMemo(() => {
    if (!exercise?.variation || !showingVariation) return null;
    const name = exercise.variation.toUpperCase().trim();

    if (exerciseMedia[name]) {
      return {
        id: exerciseMedia[name].id,
        nome: name,
        imagem_url: exerciseMedia[name].imageUrl ?? null,
        video_embed: exerciseMedia[name].videoEmbed ?? null,
        grupo_muscular: exerciseMedia[name].muscleGroup ?? '',
        ajustes: exerciseMedia[name].ajustes ?? null,
      } as ExerciseDBData;
    }

    if (!exerciseDB.length) return null;
    let match = exerciseDB.find((e) => e.nome.toUpperCase().trim() === name);
    if (match) return match;
    const partials = exerciseDB
      .filter((e) => {
        const n = e.nome.toUpperCase().trim();
        return name.includes(n) || n.includes(name);
      })
      .sort((a, b) => b.nome.trim().length - a.nome.trim().length);
    return partials[0] || null;
  }, [exercise, exerciseDB, exerciseMedia, showingVariation]);

  const activeExercise = showingVariation && matchedVariation ? matchedVariation : matchedExercise;
  const selectedExerciseName = showingVariation && exercise?.variation ? exercise.variation : exercise?.exercise || '';
  const currentVariationPref = exercise ? variationPrefs[normalizeExerciseKey(exercise.exercise)] : undefined;

  // Carrega a preferência de variação salva por exercício ao trocar de exercício
  useEffect(() => {
    if (!exercise) return;
    const cacheKey = normalizeExerciseKey(exercise.exercise);
    const localPref = loadVariationPref(user?.id, exercise.exercise);
    setShowingVariation(currentVariationPref ?? localPref);

    if (!user || !matchedExercise?.id) return;

    let cancelled = false;

    supabase
      .from('student_exercise_adjustments')
      .select('valores')
      .eq('student_id', user.id)
      .eq('exercise_id', matchedExercise.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const stored = (data?.valores as Record<string, any> | null) ?? {};
        const backendPref = typeof stored[VARIATION_PREF_FIELD] === 'boolean'
          ? stored[VARIATION_PREF_FIELD]
          : localPref;
        setVariationPrefs((prev) => (prev[cacheKey] === backendPref ? prev : { ...prev, [cacheKey]: backendPref }));
        setShowingVariation(backendPref);
      });

    return () => {
      cancelled = true;
    };
  }, [exercise, user, matchedExercise?.id, currentVariationPref]);

  // Persiste a escolha sempre que mudar
  const toggleVariation = async () => {
    if (!exercise) return;
    const next = !showingVariation;
    const cacheKey = normalizeExerciseKey(exercise.exercise);
    setShowingVariation(next);
    setVariationPrefs((prev) => ({ ...prev, [cacheKey]: next }));
    saveVariationPref(user?.id, exercise.exercise, next);

    if (!user || !matchedExercise?.id) return;

    const { data: existing } = await supabase
      .from('student_exercise_adjustments')
      .select('valores')
      .eq('student_id', user.id)
      .eq('exercise_id', matchedExercise.id)
      .maybeSingle();

    const payload = {
      ...((existing?.valores as Record<string, any> | null) ?? {}),
      [VARIATION_PREF_FIELD]: next,
    };

    const { error } = await supabase
      .from('student_exercise_adjustments')
      .upsert(
        { student_id: user.id, exercise_id: matchedExercise.id, valores: payload },
        { onConflict: 'student_id,exercise_id' }
      );

    if (error) {
      setShowingVariation(!next);
      setVariationPrefs((prev) => ({ ...prev, [cacheKey]: !next }));
      saveVariationPref(user?.id, exercise.exercise, !next);
      toast.error('Não foi possível salvar a troca de exercício.');
      return;
    }

    toast.success(next ? 'Variação salva para este exercício.' : 'Exercício original restaurado.');
  };

  useEffect(() => {
    if (!exercise || !user || !sessionId) return;

    const exName = selectedExerciseName;
    const cached = lastLogsByExercise[exName.toUpperCase().trim()];

    const buildEmpty = (): ExerciseSet[] =>
      setPlan.length > 0
        ? setPlan.map((p) => ({ reps: p.reps || exercise?.reps || '', weight: '', completed: false }))
        : Array.from({ length: totalSeries }, () => ({ reps: exercise?.reps || '', weight: '', completed: false }));

    const applyPrefill = (prevSets: PreviousExerciseSet[] | undefined) => {
      const base = buildEmpty();
      if (!prevSets || prevSets.length === 0) return base;
      return base.map((s, i) => {
        const prev = prevSets.find((row) => row.set_number === i + 1);
        if (!prev) return s;
        return {
          reps: prev.reps != null ? String(prev.reps) : s.reps,
          weight: '',
          completed: false,
        };
      });
    };

    const ensureSets = (prefill?: PreviousExerciseSet[]) => {
      setSets((prev) => {
        if (prev[currentIndex]) return prev;
        return { ...prev, [currentIndex]: applyPrefill(prefill) };
      });
      setLoadedLogsForIndex((prev) => {
        const next = new Set(prev);
        next.add(currentIndex);
        return next;
      });
    };

    if (cached) {
      ensureSets(cached);
      return;
    }

    // Fetch last session logs for this exercise
    (async () => {
      const { data: lastSession } = await supabase
        .from('exercise_set_logs')
        .select('session_id, performed_at')
        .eq('student_id', user.id)
        .neq('session_id', sessionId)
        .ilike('exercise_name', normalizeExName(exName))
        .order('performed_at', { ascending: false })
        .limit(1);

      if (!lastSession || lastSession.length === 0) {
        setLastLogsByExercise((prev) => ({ ...prev, [exName.toUpperCase().trim()]: [] }));
        ensureSets();
        return;
      }

      const previousSessionId = lastSession[0].session_id;
      const { data: rows } = await supabase
        .from('exercise_set_logs')
        .select('set_number, reps, weight_kg, set_type, performed_at')
        .eq('student_id', user.id)
        .ilike('exercise_name', normalizeExName(exName))
        .eq('session_id', previousSessionId)
        .order('set_number', { ascending: true });

      const prefill: PreviousExerciseSet[] = rows || [];

      setLastLogsByExercise((prev) => ({ ...prev, [exName.toUpperCase().trim()]: prefill }));
      ensureSets(prefill);
    })();
  }, [currentIndex, totalSeries, exercise, user, lastLogsByExercise, sessionId, selectedExerciseName]);

  const updateSet = (setIndex: number, field: 'reps' | 'weight' | 'rir', value: string) => {
    setSets((prev) => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], [field]: value };
      const next = { ...prev, [currentIndex]: current };
      // syncLocalActiveSession já será disparado pelo useEffect que observa `sets`,
      // mas chamamos aqui também para garantir gravação síncrona em localStorage
      // antes que o app possa ser fechado/backgrounded.
      syncLocalActiveSession(next, currentIndex);
      return next;
    });
  };
  const toggleSetComplete = (setIndex: number) => {
    const parsePauseSeconds = (raw?: string | null): number => {
      if (!raw) return 60;
      const s = String(raw).trim().toLowerCase();
      const match = s.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 60;
    };

    setSets((prev) => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], completed: !current[setIndex].completed };
      const next = { ...prev, [currentIndex]: current };
      syncLocalActiveSession(next, currentIndex);
      // Persist imediatamente para não perder a série marcada se o app fechar
      // antes do auto-save debounced disparar.
      if (sessionId) {
        supabase
          .from('workout_sessions')
          .update({
            session_state: { sets: next, currentIndex, ...sessionMeta } as any,
            last_active_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
          .then(() => {});
      }
      return next;
    });
    const secs = parsePauseSeconds(exercise?.pause);
    const current = [...(sets[currentIndex] || [])];
    current[setIndex] = { ...current[setIndex], completed: !current[setIndex]?.completed };
    if (!groupFlow.complete(setIndex, { ...sets, [currentIndex]: current }, parsePauseSeconds(exercises[groupFlow.indices[1]]?.pause))) startRestTimer(secs, currentIndex);
  };

  const changeMethodSet = (index: number, entry: MethodSetEntry) => {
    const updated = [...(sets[currentIndex] ?? [])];
    updated[index] = { ...entry, completed: !!entry.completed };
    const next = { ...sets, [currentIndex]: updated };
    setSets(next); syncLocalActiveSession(next, currentIndex);
    if (sessionId) void supabase.from('workout_sessions').update({ session_state: { sets: next, currentIndex, ...sessionMeta } as any, last_active_at: new Date().toISOString() }).eq('id', sessionId).then(() => {});
  };
  const completeMethodSet = (index: number, entry: MethodSetEntry) => {
    const updated = [...(sets[currentIndex] ?? [])]; updated[index] = { ...entry, completed: true };
    const next = { ...sets, [currentIndex]: updated };
    setSets(next); syncLocalActiveSession(next, currentIndex);
    const rest = parsePauseSeconds(exercises[groupFlow.indices[1]]?.pause ?? exercise?.pause);
    if (!groupFlow.complete(index, next, rest)) startRestTimer(rest, currentIndex);
  };
  const currentSets = sets[currentIndex] || [];
  const previousSets = lastLogsByExercise[selectedExerciseName.toUpperCase().trim()] ?? [];
  const recommendation = getRecommendationFor(progressionSnapshot, selectedExerciseName);
  const loadTarget = { kg: exercise?.targetLoadKg, note: exercise?.targetLoadNote, perSet: exercise?.targetLoadPerSet };
  const previousLine = lastWorkSetLine(previousSets, setPlan.map((set) => set.type));
  const suggestionLine = studentSuggestionLine(loadTarget, recommendation, exercise?.reps ?? '');

  const streamVideoId = extractStreamVideoId(activeExercise?.video_embed);
  const imageUrl = activeExercise?.imagem_url;
  const hlsUrl = streamVideoId ? `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${streamVideoId}/manifest/video.m3u8` : null;
  const posterUrl = streamVideoId ? `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${streamVideoId}/thumbnails/thumbnail.jpg?height=600` : imageUrl || undefined;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    setShowPlayFallback(false);
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.volume = 0;
    (video as any).disableRemotePlayback = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('disableRemotePlayback', '');
    // iOS: silence/disable embedded audio track so it doesn't steal the
    // audio session from Spotify/Apple Music playing in the background.
    const disableAudioTracks = () => {
      const tracks = (video as any).audioTracks;
      if (tracks && tracks.length) {
        for (let i = 0; i < tracks.length; i++) {
          try { tracks[i].enabled = false; } catch { /* noop */ }
        }
      }
    };
    video.addEventListener('loadedmetadata', disableAudioTracks);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      const tryPlay = () => {
        video.play().catch(() => setShowPlayFallback(true));
      };
      video.addEventListener('loadedmetadata', tryPlay, { once: true });
      return () => video.removeEventListener('loadedmetadata', tryPlay);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => setShowPlayFallback(true));
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setShowPlayFallback(true);
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    setShowPlayFallback(true);
  }, [hlsUrl, currentIndex]);

  const handleManualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().then(() => setShowPlayFallback(false)).catch(() => setShowPlayFallback(true));
  };

  // Player do modo ampliado (tela cheia)
  useEffect(() => {
    if (!zoomOpen || !hlsUrl) return;
    const video = zoomVideoRef.current;
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.play().catch(() => {});
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, enableWorker: true });
      zoomHlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      return () => {
        hls.destroy();
        zoomHlsRef.current = null;
      };
    }
  }, [zoomOpen, hlsUrl]);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomOpen]);

  if (shouldShowWorkoutLoading(planLoading, !!exercise)) {
    return (
      <div className="student-workout-screen bg-background flex items-center justify-center">
        {sessionDialogs}
        <div className="w-full max-w-sm space-y-3 px-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (!exercise) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="student-workout-screen bg-background flex items-center justify-center">
        {sessionDialogs}
        <div className="text-center space-y-4 px-6 max-w-sm">
          {isOffline ? (
            <>
              <p className="font-semibold text-foreground">Você está sem internet</p>
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar o treino agora. Assim que a conexão voltar, ele aparece automaticamente — seus registros feitos offline são salvos e sincronizados depois.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Nenhum exercício encontrado.</p>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>Tentar novamente</Button>
            <Button onClick={() => navigate(-1)}>Voltar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="student-workout-screen bg-background flex flex-col" data-testid="student-workout-screen">
      {sessionDialogs}
      {zoomOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          {hlsUrl ? (
            <video
              ref={zoomVideoRef}
              className="max-h-full max-w-full w-full h-full object-contain"
              muted
              autoPlay
              loop
              playsInline
              controls
              poster={posterUrl}
            />
          ) : imageUrl ? (
            <img src={imageUrl} alt={selectedExerciseName} className="max-h-full max-w-full object-contain" />
          ) : null}
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Fechar"
            className="fixed right-4 z-[110] h-12 w-12 rounded-full bg-background/90 backdrop-blur border border-border/60 flex items-center justify-center shadow-lg touch-manipulation"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
          >
            <X className="h-6 w-6 text-foreground" />
          </button>
        </div>
      )}
      {restTimer && (
        <RestTimerOverlay
          timeLeft={restTimer.remaining}
          totalSeconds={restTimer.total}
          onClose={stopRestTimer}
          onAddTime={adjustRestTimer}
        />
      )}
      <PhaseInfoSheet open={showPhaseInfo} onOpenChange={setShowPhaseInfo} phase={currentPhase} />
      {matchedExercise?.id && user && (
        <MachineAdjustSheet
          open={showAdjust}
          onOpenChange={setShowAdjust}
          exerciseId={activeExercise?.id || matchedExercise.id}
          exerciseName={selectedExerciseName}
          studentId={user.id}
          fields={activeExercise?.ajustes ?? matchedExercise.ajustes ?? []}
        />
      )}
      {user && exercise && (
        <ExerciseLoadHistorySheet
          open={showLoadHistory}
          onOpenChange={setShowLoadHistory}
          studentId={user.id}
          exerciseName={selectedExerciseName}
        />
      )}
      {summary && (
        <WorkoutSummaryShare
          dayName={dayName}
          durationSeconds={summary.duration}
          exercisesCompleted={summary.completed}
          totalExercises={exercises.length}
          phase={phase}
          onClose={() => { setSummary(null); navigate('/minha-area'); }}
        />
      )}

      <div className="student-workout-media relative w-full shrink-0 bg-secondary/30 overflow-hidden" data-testid="workout-header">
        {hlsUrl ? (
          <>
            <video
              key={streamVideoId ?? currentIndex}
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none"
              muted
              autoPlay
              loop
              playsInline
              preload="auto"
              poster={posterUrl}
            />
            {showPlayFallback && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/35">
                <Button onClick={handleManualPlay} size="lg" className="rounded-full h-14 px-6 font-bold">
                  <Play className="h-5 w-5 mr-2" />
                  Reproduzir vídeo
                </Button>
              </div>
            )}
          </>
        ) : imageUrl ? (
          <img src={imageUrl} alt={selectedExerciseName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Sem mídia disponível</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />

        <Button variant="ghost" size="icon" aria-label="Voltar para o início" onClick={() => navigate('/minha-area')} className="absolute top-4 left-4 z-30 h-10 w-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Button>

        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <span className="bg-background/80 backdrop-blur rounded-full px-2.5 py-1 text-xs font-mono font-semibold text-primary tabular-nums flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedSeconds)}
          </span>
          <span className="bg-background/80 backdrop-blur rounded-full px-3 py-1 text-xs font-medium text-foreground">{(() => { const blocks = exerciseBlocks(exercises); const bi = blocks.findIndex(b => b.indices.includes(currentIndex)); return `${bi + 1}/${blocks.length}`; })()}</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 z-30">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest text-primary font-semibold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{activeExercise?.grupo_muscular || dayName}</p>
              </div>
              <h1 className="text-xl font-bold text-foreground leading-tight" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>{selectedExerciseName}</h1>
              {exercise.description && <>
                <p className="text-xs text-foreground/90 mt-1 line-clamp-3">{exercise.description}</p>
                <Button variant="link" className="h-auto p-0 text-xs text-primary" onClick={() => setDescriptionOpen(true)}>Ver mais</Button>
              </>}
            </div>
            <div className="relative z-10 shrink-0 mt-1 flex flex-col items-end gap-1.5">
              {exercise.variation && (
                <button
                  type="button"
                  onClick={toggleVariation}
                  className={`touch-manipulation rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur transition-colors ${showingVariation ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-foreground border border-border/50'}`}
                >
                  {showingVariation ? 'Original' : 'Variação'}
                </button>
              )}
              {(hlsUrl || imageUrl) && (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label="Ampliar vídeo"
                  className="touch-manipulation rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur bg-background/80 text-foreground border border-border/50 flex items-center gap-1"
                >
                  <Maximize2 className="h-3 w-3" />
                  Zoom
                </button>
              )}
            </div>
          </div>
          {(() => {
            const isReal = (v?: string | null) => {
              if (!v) return false;
              const t = v.trim();
              return t.length > 0 && !['-', '—', '–', 'n/a', 'na'].includes(t.toLowerCase());
            };

            // Extrai 1 ou 2 números de uma string (ex: "8", "8-10", "8 a 10", "8 - 10 reps").
            const extractRange = (raw: string): { a: number; b: number } | null => {
              const nums = raw.match(/\d+/g);
              if (!nums || nums.length === 0) return null;
              const a = parseInt(nums[0], 10);
              const b = nums[1] ? parseInt(nums[1], 10) : a;
              return { a: Math.min(a, b), b: Math.max(a, b) };
            };

            // RIR válido: 1 número (0–5) ou faixa pequena tipo 1-3, sem palavras estranhas.
            const parseRir = (raw: string): string | null => {
              const r = extractRange(raw);
              if (!r) return null;
              // Se o maior valor for >= 5, não é RIR — é faixa de reps mal-rotulada.
              if (r.b >= 5) return null;
              return r.a === r.b ? `RIR ${r.a}` : `RIR ${r.a}–${r.b}`;
            };

            // Reps: aceita "10", "8-10", "8 a 10" → "10 reps" / "8–10 reps".
            // Se vier em segundos ("15s", "30 seg"), preserva o sufixo de tempo.
            const parseReps = (raw: string): string | null => {
              const r = extractRange(raw);
              if (!r) return null;
              const isTime = /\b\d+\s*(s|seg|segundos?)\b|\d+["']/i.test(raw);
              const unit = isTime ? 's' : ' reps';
              return r.a === r.b ? `${r.a}${unit}` : `${r.a}–${r.b}${unit}`;
            };

            const isPerSet = exercise.setScheme?.mode === 'per_set' && setPlan.length > 0;
            const repsLabel = !isPerSet && isReal(exercise.reps) ? parseReps(exercise.reps) : null;
            // RIR só aparece se for realmente RIR (números baixos). Caso contrário ocultamos.
            const rirLabel = isReal(exercise.rir) ? parseRir(exercise.rir) : null;
            const isComposed = setPlan.some((p) => p.type === 'recognition') && setPlan.some((p) => p.type === 'work');
            const summary = isPerSet
              ? setPlan.map((set) => set.reps).filter(Boolean).join(' / ')
              : isComposed ? buildPlanSummary(setPlan) : null;

            return (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {summary
                  ? <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded font-semibold">{summary}</span>
                  : isReal(exercise.series) && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.series} séries</span>}
                {!summary && repsLabel && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{repsLabel}</span>}
                {rirLabel && <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">{rirLabel}</span>}
                {isReal(exercise.pause) && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.pause} descanso</span>}
                {(exercise as { method?: { slug: string; params?: Record<string, string | number> } }).method?.slug && (
                  <MethodBadge
                    method={(exercise as { method?: { slug: string; params?: Record<string, string | number> } }).method}
                    dayExercises={exercises}
                    className="py-1"
                  />
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {groupFlow.indices.length === 2 && <div className="shrink-0 px-4 pt-2"><WorkoutGroupTabs exercises={exercises} indices={groupFlow.indices} currentIndex={currentIndex} sets={sets} onSelect={setCurrentIndex} /></div>}
      {groupFlow.pause && <div className="shrink-0 px-4 py-2 flex items-center justify-between border-y border-primary/30 text-primary text-sm"><span>{groupFlow.pause.label} · {groupFlow.remaining}s</span><Button variant="ghost" size="sm" onClick={groupFlow.skip}>Pular</Button></div>}
      <div className="shrink-0 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPhaseInfo(true)}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/15 transition-colors whitespace-nowrap"
          >
            <Info className="h-3 w-3" />
            {PHASE_SHORT_LABELS[currentPhase]}
          </button>
          {user && exercise && (
            <button
              type="button"
              onClick={() => setShowLoadHistory(true)}
              className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent/25 transition-colors whitespace-nowrap"
            >
              <BarChart3 className="h-3 w-3" />
              Cargas
            </button>
          )}
          {matchedExercise?.id && user && (
            <button
              type="button"
              onClick={() => setShowAdjust(true)}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/70 border border-border/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
            >
              <Settings2 className="h-3 w-3" />
              Ajuste
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={() => setShowVideoCapture(true)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
            >
              <Camera className="h-3 w-3" />
              Execução
            </button>
          )}
        </div>

      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3" data-testid="workout-set-list">
        <div className="space-y-2">
          <div className="grid grid-cols-[36px_1fr_1fr_44px] gap-1.5 px-2">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Série</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Reps</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Carga</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">✓</span>
          </div>
          {(() => {
            const nextPendingIndex = currentSets.findIndex((s) => !s.completed);
            return currentSets.map((set, i) => {
            const planned = setPlan[i];
            const isRecognition = planned?.type === 'recognition';
            if (groupFlow.indices.length === 2 || methodOnSet(exercise, i, currentSets.length, isRecognition)) return <MethodSetRows key={i} exercise={exercise} set={set} index={i} count={currentSets.length} recognition={isRecognition} disabled={!!groupFlow.pause || (groupFlow.indices.length === 2 && !set.completed && groupFlow.indices.some(idx => sets[idx]?.slice(0, i).some(prior => !prior.completed)))} targetReps={planned?.reps} weightPlaceholder={studentWeightPlaceholder(i + 1, previousSets, loadTarget, recommendation)} onChange={entry => changeMethodSet(i, entry)} onComplete={entry => completeMethodSet(i, entry)} />;
            const isNextPending = i === nextPendingIndex;
            return (
              <div key={i} className={`rounded-lg transition-colors ${set.completed ? 'bg-primary/10 border border-primary/30' : isRecognition ? 'bg-accent/10 border border-accent/30' : 'bg-secondary/50'}`}>
                <div className="grid grid-cols-[36px_1fr_1fr_44px] gap-1.5 items-center p-2">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-sm font-bold text-center text-foreground leading-none">{i + 1}</span>
                    {isRecognition && <span className="text-[8px] uppercase tracking-wider text-accent font-semibold mt-0.5">Rec</span>}
                  </div>
                  <Input type="text" inputMode="numeric" value={set.reps} onChange={(e) => updateSet(i, 'reps', e.target.value)} placeholder={planned?.reps || '10'} className="h-9 text-center bg-background/50 border-border/50" disabled={set.completed} />
                  <StudentWeightInput setNumber={i + 1} value={set.weight} onChange={(value) => updateSet(i, 'weight', value)} placeholder={studentWeightPlaceholder(i + 1, previousSets, loadTarget, recommendation)} disabled={set.completed} />
                  <Button size="icon" aria-label={`Confirmar série ${i + 1}`} variant={set.completed ? 'default' : 'outline'} className={`h-9 w-9 mx-auto rounded-full ${isNextPending ? 'animate-pulse-glow' : ''}`} onClick={() => toggleSetComplete(i)}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
                {/* RIR opcional — só em séries de trabalho e só depois de concluir.
                    Um toque registra, outro toque limpa. Nunca obrigatório. */}
                {!isRecognition && set.completed && (
                  <div className="flex items-center gap-1.5 px-2 pb-2 -mt-0.5 flex-wrap">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                      RIR (opcional)
                    </span>
                    {['0', '1', '2', '3', '4'].map((v) => {
                      const active = (set.rir ?? '') === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => updateSet(i, 'rir', active ? '' : v)}
                          className={`h-6 min-w-[26px] px-1.5 rounded-md text-[11px] font-bold border transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background/40 text-muted-foreground border-border/50'
                          }`}
                        >
                          {v === '4' ? '4+' : v}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );

            });
          })()}
        </div>
        <StudentLoadSummaryCard previousLine={previousLine} suggestionLine={suggestionLine} perSet={loadTarget.perSet} />
      </div>

      <Dialog open={descriptionOpen} onOpenChange={setDescriptionOpen}>
        <DialogContent className="max-w-md max-h-[80dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedExerciseName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{exercise.description}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={showVideoCapture} onOpenChange={setShowVideoCapture}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-primary" />
              Vídeo de execução
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Grave um clipe curto (até 30s) do exercício{' '}
            <span className="font-semibold text-foreground">{selectedExerciseName}</span>{' '}
            para o Fabiew revisar.
          </p>
          {user && (
            <ExerciseVideoCapture
              studentId={user.id}
              sessionId={sessionId}
              exerciseName={selectedExerciseName}
              exerciseId={activeExercise?.id ?? matchedExercise?.id ?? null}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="student-workout-footer shrink-0 z-50 bg-background/95 backdrop-blur border-t border-border p-3" data-testid="workout-footer">
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { const blocks = exerciseBlocks(exercises); const i = blocks.findIndex(b => b.indices.includes(currentIndex)); setCurrentIndex(blocks[Math.max(0, i - 1)].indices[0]); }} disabled={exerciseBlocks(exercises)[0]?.indices.includes(currentIndex)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          {!exerciseBlocks(exercises).at(-1)?.indices.includes(currentIndex) ? (
            <Button className="flex-1" onClick={() => { const blocks = exerciseBlocks(exercises); const i = blocks.findIndex(b => b.indices.includes(currentIndex)); setCurrentIndex(blocks[Math.min(blocks.length - 1, i + 1)].indices[0]); }}>
              Próximo
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="flex-1" disabled={isFinishing} onClick={() => setShowSessionRpe(true)}>
              Finalizar
              <Check className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      <SessionRpeDialog
        open={showSessionRpe}
        onOpenChange={(open) => {
          if (!isFinishing) setShowSessionRpe(open);
        }}
        isSaving={isFinishing}
        onConfirm={async (sessionRpe) => {
          if (isFinishing) return;
          setIsFinishing(true);

          const totalSec = Math.floor((Date.now() - sessionStartAt) / 1000);
          const durationMinutes = Math.max(1, Math.round(totalSec / 60));
          const exercisesCompleted = Object.values(sets).filter(arr => arr?.some(s => s.completed)).length;

          let totalVolumeKg = 0;
          let totalSets = 0;
          const setLogRows: any[] = [];

          if (user) {
            Object.entries(sets).forEach(([exIdxStr, arr]) => {
              const exIdx = Number(exIdxStr);
              const ex = exercises[exIdx];
              if (!ex) return;
               const useVariation = variationPrefs[normalizeExerciseKey(ex.exercise)] ?? loadVariationPref(user?.id, ex.exercise);
               const exName = useVariation && ex.variation ? ex.variation : (ex.exercise || '');
              const muscle = exerciseDB.find((d) => d.nome.toLowerCase() === exName.toLowerCase())?.grupo_muscular || null;
              // Tipo estrutural da série vem do plano (reconhecimento vs trabalho).
              const plannedTypes = buildSetPlan(ex?.series, ex?.series2, ex?.reps, ex?.setScheme).map((p) => p.type);
              arr.forEach((s, i) => {
                if (!s.completed && !s.subRecords?.some(part => part.completed)) return;
                const reps = parseInt(s.reps) || 0;
                const weight = parseFloat(s.weight.replace(',', '.')) || 0;
                const rirRaw = (s.rir ?? '').trim();
                const rirNum = rirRaw === '' ? null : Number(rirRaw);
                totalSets += 1;
                totalVolumeKg += s.subRecords?.length ? subRecordVolume(s) : reps * weight;
                setLogRows.push({
                  ...methodLogFields(ex, s),
                  student_id: user.id,
                  exercise_name: normalizeExName(exName),
                  muscle_group: muscle,
                  set_number: i + 1,
                  reps: reps || null,
                  weight_kg: weight || null,
                  rpe: null,
                  // RIR é opcional: ausência grava null (desconhecido), nunca 0.
                  rir: rirNum != null && Number.isFinite(rirNum) ? rirNum : null,
                  set_type: plannedTypes[i] === 'recognition' ? 'recognition' : 'work',
                  phase: phase ?? null,
                  day_name: dayName,
                });
              });
            });

          }

          try {
            if (user) {
              let finalSessionId = sessionId;

              if (finalSessionId) {
                // Atualiza a sessão em andamento existente para completed
                await supabase
                  .from('workout_sessions')
                  .update({
                    status: 'completed',
                    completion_source: 'manual',
                    completed_at: new Date().toISOString(),
                    last_active_at: new Date().toISOString(),
                    duration_minutes: durationMinutes,
                    exercises_completed: exercisesCompleted,
                    total_exercises: exercises.length,
                    avg_rpe: sessionRpe,
                    total_volume_kg: totalVolumeKg || null,
                    total_sets: totalSets,
                    session_state: {
                      progressionRecommendations: progressionSnapshot ?? restoredSnapshot ?? activeSession?.session_state?.progressionRecommendations ?? null
                    } as any,
                  })
                  .eq('id', finalSessionId);
              } else {
                // Fallback: cria nova já completada (não havia sessão em andamento)
                const finalSnapshot = progressionSnapshot ?? restoredSnapshot ?? activeSession?.session_state?.progressionRecommendations ?? null;
                
                const { data: sessionRow } = await supabase
                  .from('workout_sessions')
                  .insert({
                    student_id: user.id,
                    plan_id: sessionPlanId,
                    day_name: dayName,
                    phase: phase ?? null,
                    status: 'completed',
                    completion_source: 'manual',
                    completed_at: new Date().toISOString(),
                    duration_minutes: durationMinutes,
                    exercises_completed: exercisesCompleted,
                    total_exercises: exercises.length,
                    avg_rpe: sessionRpe,
                    total_volume_kg: totalVolumeKg || null,
                    total_sets: totalSets,
                    session_state: {
                      progressionRecommendations: finalSnapshot
                    } as any,
                  })
                  .select('id')
                  .single();
                finalSessionId = sessionRow?.id ?? null;
              }

              if (setLogRows.length > 0 && finalSessionId) {
                const { writeWithFallback } = await import('@/lib/offlineQueue');
                await writeWithFallback({
                  table: 'exercise_set_logs',
                  op: 'upsert',
                  onConflict: 'session_id,student_id,exercise_name,set_number',
                  payload: setLogRows.map((r) => ({ ...r, session_id: finalSessionId })),
                });
                await writeWithFallback({
                  table: 'student_events',
                  op: 'insert',
                  payload: {
                    student_id: user.id,
                    event_type: 'workout_load_logged',
                    metadata: { sets: setLogRows.length, session_id: finalSessionId },
                  },
                });
              }
              {
                const { writeWithFallback } = await import('@/lib/offlineQueue');
                await writeWithFallback({
                  table: 'student_events',
                  op: 'insert',
                  payload: {
                    student_id: user.id,
                    event_type: 'workout_completed',
                    metadata: {
                      day_name: dayName,
                      duration_minutes: durationMinutes,
                      exercises_completed: exercisesCompleted,
                      session_rpe: sessionRpe,
                    },
                  },
                });
              }

              // Push aos admins (best-effort) — endpoint dedicado valida a sessão do próprio aluno
              try {
                supabase.functions.invoke('notify-workout-completed', {
                  body: { session_id: finalSessionId ?? undefined },
                }).catch(() => {});
              } catch {}

              clearActiveSession();
            }
          } catch (e) {
            console.error('Erro salvando sessão:', e);
            toast.error('Erro ao salvar sessão.');
          }


          completeWorkout();
          setShowSessionRpe(false);
          setSummary({ duration: totalSec, completed: exercisesCompleted });
          setIsFinishing(false);
        }}
      />
    </div>
  );
};

/** Remonta a tela a cada navegação (ex.: "Continuar" o treino de outro dia). */
const TreinoExecucao = () => {
  const location = useLocation();
  return <TreinoExecucaoInner key={location.key} />;
};

export default TreinoExecucao;
