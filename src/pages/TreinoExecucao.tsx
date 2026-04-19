import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { ArrowLeft, Play, Pause, Check, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveWorkoutSession } from '@/hooks/useActiveWorkoutSession';
import { type ParsedExercise, parseTrainingSections } from '@/lib/trainingResultParser';
import { buildSetPlan, buildPlanSummary, type PlannedSet } from '@/lib/setPlanBuilder';
import { PHASE_SHORT_LABELS, getPhaseByMonthDay, type TrainingPhase } from '@/lib/trainingPhase';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';
import { PhaseInfoSheet } from '@/components/training/PhaseInfoSheet';
import { MachineAdjustSheet } from '@/components/training/MachineAdjustSheet';
import { ExerciseLoadHistorySheet } from '@/components/training/ExerciseLoadHistorySheet';
import { SessionRpeDialog } from '@/components/training/SessionRpeDialog';
import { Settings2, Info, BarChart3 } from 'lucide-react';

interface ExerciseSet {
  reps: string;
  weight: string;
  completed: boolean;
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
  const match = embed.match(/cloudflarestream\.com\/([a-f0-9]{32})\//);
  return match ? match[1] : null;
};

const RestTimerOverlay = ({ totalSeconds, onClose }: { totalSeconds: number; onClose: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (timeLeft === 0 && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }, [timeLeft]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const safeTime = Math.max(timeLeft, 0);
  const dashOffset = circumference * (1 - safeTime / totalSeconds);
  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;

  return (
    <div className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in">
      <button onClick={onClose} className="absolute z-[110] h-12 w-12 rounded-full bg-destructive flex items-center justify-center shadow-lg"
        style={{ top: 'calc(env(safe-area-inset-top, 16px) + 8px)', right: '16px' }}>
        <X className="h-6 w-6 text-destructive-foreground" />
      </button>

      <p className="text-sm uppercase tracking-widest text-muted-foreground mb-8 font-semibold">Descanso</p>

      <div className="relative w-48 h-48">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-mono font-bold tabular-nums ${timeLeft < 0 ? 'text-destructive' : 'text-foreground'}`}>
            {timeLeft < 0 ? '+' : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-10">
        <Button size="lg" variant="outline" className="rounded-full h-14 w-14" onClick={() => setIsRunning(!isRunning)}>
          {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </Button>
        <Button size="lg" className="rounded-full h-14 px-8 bg-primary text-primary-foreground font-bold" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </div>
  );
};

const TreinoExecucao = () => {
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
  } | null;

  const [loadedExercises, setLoadedExercises] = useState<ParsedExercise[]>(stateData?.exercises || []);
  const [loadedDayName, setLoadedDayName] = useState(stateData?.dayName || 'Treino');
  const [loadedMedia, setLoadedMedia] = useState<ExerciseMediaMap>(stateData?.exerciseMedia || {});
  const [phase, setPhase] = useState<TrainingPhase | null>(stateData?.phase || null);

  const exercises = loadedExercises;
  const dayName = loadedDayName;
  const exerciseMedia = loadedMedia;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sets, setSets] = useState<Record<number, ExerciseSet[]>>({});
  // Cache of last performed values per exercise name (from previous sessions)
  const [lastLogsByExercise, setLastLogsByExercise] = useState<Record<string, ExerciseSet[]>>({});
  const [loadedLogsForIndex, setLoadedLogsForIndex] = useState<Set<number>>(new Set());
  const [exerciseDB, setExerciseDB] = useState<ExerciseDBData[]>([]);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(60);
  const [showPlayFallback, setShowPlayFallback] = useState(false);
  const [showingVariation, setShowingVariation] = useState(false);
  // Sessão persistida: started_at vem do banco (ou agora se ainda não existe)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartAt, setSessionStartAt] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showSessionRpe, setShowSessionRpe] = useState(false);
  const [summary, setSummary] = useState<{ duration: number; completed: number } | null>(null);
  const [showPhaseInfo, setShowPhaseInfo] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showLoadHistory, setShowLoadHistory] = useState(false);
  const currentPhase = phase ?? getPhaseByMonthDay();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Session timer tick — recalcula sempre a partir de started_at (real)
  useEffect(() => {
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - sessionStartAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartAt]);

  // Recalcula tempo quando a aba volta a ficar visível (cronômetro continua mesmo com app fechado)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartAt) / 1000));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sessionStartAt]);

  // Cria ou retoma sessão em andamento ao montar (uma vez)
  const sessionInitRef = useRef(false);
  useEffect(() => {
    if (!user || sessionInitRef.current) return;
    sessionInitRef.current = true;
    (async () => {
      // 1. Verifica se já existe sessão em andamento
      const { data: existing } = await supabase
        .from('workout_sessions')
        .select('id, started_at, day_name, phase, session_state')
        .eq('student_id', user.id)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && existing.started_at) {
        const age = Date.now() - new Date(existing.started_at).getTime();
        if (age <= 12 * 60 * 60 * 1000) {
          setSessionId(existing.id);
          setSessionStartAt(new Date(existing.started_at).getTime());
          // Restaura estado se houver
          const state = existing.session_state as any;
          if (state?.currentIndex != null) setCurrentIndex(state.currentIndex);
          if (state?.sets) {
            setSets(state.sets);
            const idxs = new Set<number>(Object.keys(state.sets).map((k) => Number(k)));
            setLoadedLogsForIndex(idxs);
          }
          setLocalActiveSession({
            id: existing.id,
            student_id: user.id,
            day_name: existing.day_name,
            phase: existing.phase,
            started_at: existing.started_at,
            session_state: existing.session_state,
          });
          return;
        } else {
          // Auto-abandona sessão muito antiga
          await supabase.from('workout_sessions').update({ status: 'abandoned' }).eq('id', existing.id);
        }
      }

      // 2. Cria nova sessão em andamento
      const startedAtIso = new Date().toISOString();
      const { data: newSession, error } = await supabase
        .from('workout_sessions')
        .insert({
          student_id: user.id,
          day_name: dayName,
          phase: phase ?? null,
          status: 'in_progress',
          started_at: startedAtIso,
          duration_minutes: 0,
          exercises_completed: 0,
          total_exercises: exercises.length,
        })
        .select('id, started_at')
        .single();

      if (!error && newSession) {
        setSessionId(newSession.id);
        setSessionStartAt(new Date(newSession.started_at).getTime());
        setLocalActiveSession({
          id: newSession.id,
          student_id: user.id,
          day_name: dayName,
          phase: phase ?? null,
          started_at: newSession.started_at,
          session_state: null,
        });

        await supabase.from('student_events').insert({
          student_id: user.id,
          event_type: 'workout_started',
          metadata: { day_name: dayName ?? null, session_id: newSession.id },
        });
      }
    })();
  }, [user, dayName, phase, exercises.length, setLocalActiveSession]);

  const formatElapsed = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // Auto-save de progresso (sets + currentIndex) na sessão em andamento — debounced
  useEffect(() => {
    if (!sessionId) return;
    const t = setTimeout(() => {
      supabase
        .from('workout_sessions')
        .update({ session_state: { sets, currentIndex } as any })
        .eq('id', sessionId)
        .then(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [sets, currentIndex, sessionId]);


  // Auto-load training plan from DB when accessed directly (no state)
  useEffect(() => {
    if (loadedExercises.length > 0 || !user) return;
    const loadPlan = async () => {
      const { data: treino } = await supabase
        .from('ai_plans')
        .select('conteudo, fase')
        .eq('student_id', user.id)
        .eq('tipo', 'treino')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (treino) {
        if (treino.fase) setPhase(treino.fase as TrainingPhase);
        const sections = parseTrainingSections(treino.conteudo);
        const allDays = sections.flatMap(s => s.days ?? []);
        if (allDays.length > 0) {
          const todayIndex = (new Date().getDay() + 6) % 7 % allDays.length;
          const today = allDays[todayIndex];
          setLoadedExercises(today.exercises);
          setLoadedDayName(today.day);

          // Load exercise media
          const names = today.exercises
            .flatMap((e) => [e.exercise, e.variation])
            .map((name) => name?.toUpperCase().trim())
            .filter(Boolean) as string[];
          const uniqueNames = [...new Set(names)];
          const { data: dbEx } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed, grupo_muscular, ajustes');
          if (dbEx) {
            const mediaMap: ExerciseMediaMap = {};
            for (const name of uniqueNames) {
              const match = dbEx.find(e =>
                e.nome.toUpperCase().trim() === name ||
                name.includes(e.nome.toUpperCase().trim()) ||
                e.nome.toUpperCase().trim().includes(name)
              );
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
        }
      }
    };
    loadPlan();
  }, [user, loadedExercises.length]);

  const exercise = exercises[currentIndex];
  const setPlan: PlannedSet[] = useMemo(
    () => (exercise ? buildSetPlan(exercise.series, exercise.series2, exercise.reps) : []),
    [exercise],
  );
  const totalSeries = setPlan.length || 3;

  useEffect(() => {
    const loadExercises = async () => {
      const { data } = await supabase.from('exercises').select('id, nome, imagem_url, video_embed, grupo_muscular, ajustes');
      if (data) setExerciseDB(data as ExerciseDBData[]);
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
        nome: name,
        imagem_url: exerciseMedia[name].imageUrl ?? null,
        video_embed: exerciseMedia[name].videoEmbed ?? null,
        grupo_muscular: exerciseMedia[name].muscleGroup ?? '',
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

  useEffect(() => {
    setShowingVariation(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!exercise || !user) return;
    if (loadedLogsForIndex.has(currentIndex)) return;

    const exName = exercise.exercise;
    const cached = lastLogsByExercise[exName.toUpperCase().trim()];

    const buildEmpty = (): ExerciseSet[] =>
      setPlan.length > 0
        ? setPlan.map((p) => ({ reps: p.reps || exercise?.reps || '', weight: '', completed: false }))
        : Array.from({ length: totalSeries }, () => ({ reps: exercise?.reps || '', weight: '', completed: false }));

    const applyPrefill = (prevSets: ExerciseSet[] | undefined) => {
      const base = buildEmpty();
      if (!prevSets || prevSets.length === 0) return base;
      return base.map((s, i) => {
        const prev = prevSets[i];
        if (!prev) return s;
        return {
          reps: prev.reps || s.reps,
          weight: prev.weight || '',
          completed: false,
        };
      });
    };

    const ensureSets = (prefill?: ExerciseSet[]) => {
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
        .ilike('exercise_name', exName)
        .order('performed_at', { ascending: false })
        .limit(1);

      if (!lastSession || lastSession.length === 0) {
        ensureSets();
        return;
      }

      const sessionId = lastSession[0].session_id;
      const { data: rows } = await supabase
        .from('exercise_set_logs')
        .select('set_number, reps, weight_kg, rpe')
        .eq('student_id', user.id)
        .ilike('exercise_name', exName)
        .eq('session_id', sessionId)
        .order('set_number', { ascending: true });

      const prefill: ExerciseSet[] = (rows || []).map((r) => ({
        reps: r.reps != null ? String(r.reps) : '',
        weight: r.weight_kg != null ? String(r.weight_kg) : '',
        rpe: r.rpe != null ? String(r.rpe) : '',
        completed: false,
      }));

      setLastLogsByExercise((prev) => ({ ...prev, [exName.toUpperCase().trim()]: prefill }));
      ensureSets(prefill);
    })();
  }, [currentIndex, totalSeries, exercise, user, lastLogsByExercise, loadedLogsForIndex]);

  useEffect(() => {
    if (exercise?.pause) {
      const match = exercise.pause.match(/(\d+)/);
      if (match) setRestDuration(parseInt(match[1], 10));
    }
  }, [exercise]);

  const updateSet = (setIndex: number, field: 'reps' | 'weight', value: string) => {
    setSets((prev) => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], [field]: value };
      return { ...prev, [currentIndex]: current };
    });
  };
  const toggleSetComplete = (setIndex: number) => {
    setSets((prev) => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], completed: !current[setIndex].completed };
      return { ...prev, [currentIndex]: current };
    });
    setShowRestTimer(true);
  };

  const currentSets = sets[currentIndex] || [];

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
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

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

  if (!exercise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Nenhum exercício encontrado.</p>
          <Button onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showRestTimer && <RestTimerOverlay totalSeconds={restDuration} onClose={() => setShowRestTimer(false)} />}
      <PhaseInfoSheet open={showPhaseInfo} onOpenChange={setShowPhaseInfo} phase={currentPhase} />
      {matchedExercise?.id && user && (
        <MachineAdjustSheet
          open={showAdjust}
          onOpenChange={setShowAdjust}
          exerciseId={matchedExercise.id}
          exerciseName={exercise?.exercise || ''}
          studentId={user.id}
          fields={matchedExercise.ajustes ?? []}
        />
      )}
      {user && exercise && (
        <ExerciseLoadHistorySheet
          open={showLoadHistory}
          onOpenChange={setShowLoadHistory}
          studentId={user.id}
          exerciseName={exercise.exercise}
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

      <div className="relative w-full bg-secondary/30 overflow-hidden" style={{ aspectRatio: '16/11' }}>
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
          <img src={imageUrl} alt={exercise.exercise} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Sem mídia disponível</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />

        <button onClick={() => navigate('/minha-area')} className="absolute top-4 left-4 z-30 h-10 w-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>

        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <span className="bg-background/80 backdrop-blur rounded-full px-2.5 py-1 text-xs font-mono font-semibold text-primary tabular-nums flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatElapsed(elapsedSeconds)}
          </span>
          <span className="bg-background/80 backdrop-blur rounded-full px-3 py-1 text-xs font-medium text-foreground">{currentIndex + 1}/{exercises.length}</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 z-30">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest text-primary font-semibold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{activeExercise?.grupo_muscular || dayName}</p>
              </div>
              <h1 className="text-xl font-bold text-foreground leading-tight" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>{showingVariation && exercise.variation ? exercise.variation : exercise.exercise}</h1>
              {exercise.description && <p className="text-xs text-foreground/90 mt-1" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{exercise.description}</p>}
            </div>
            {exercise.variation && (
              <button
                type="button"
                onClick={() => setShowingVariation(!showingVariation)}
                className={`relative z-10 shrink-0 mt-1 touch-manipulation rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur transition-colors ${showingVariation ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-foreground border border-border/50'}`}
              >
                {showingVariation ? 'Original' : 'Variação'}
              </button>
            )}
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

            const repsLabel = isReal(exercise.reps) ? parseReps(exercise.reps) : null;
            // RIR só aparece se for realmente RIR (números baixos). Caso contrário ocultamos.
            const rirLabel = isReal(exercise.rir) ? parseRir(exercise.rir) : null;
            const isComposed = setPlan.some((p) => p.type === 'recognition') && setPlan.some((p) => p.type === 'work');
            const summary = isComposed ? buildPlanSummary(setPlan) : null;

            return (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {summary
                  ? <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded font-semibold">{summary}</span>
                  : isReal(exercise.series) && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.series} séries</span>}
                {!summary && repsLabel && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{repsLabel}</span>}
                {rirLabel && <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">{rirLabel}</span>}
                {isReal(exercise.pause) && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.pause} descanso</span>}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 pb-28">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPhaseInfo(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/15 transition-colors"
          >
            <Info className="h-3 w-3" />
            {PHASE_SHORT_LABELS[currentPhase]}
          </button>
          {user && exercise && (
            <button
              type="button"
              onClick={() => setShowLoadHistory(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-accent/25 transition-colors"
            >
              <BarChart3 className="h-3 w-3" />
              Cargas
            </button>
          )}
          {matchedExercise?.id && user && (
            <button
              type="button"
              onClick={() => setShowAdjust(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-secondary transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              Ajuste
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[36px_1fr_1fr_44px] gap-1.5 px-2">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Série</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Reps</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Carga</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">✓</span>
          </div>
          {currentSets.map((set, i) => {
            const planned = setPlan[i];
            const isRecognition = planned?.type === 'recognition';
            return (
              <div key={i} className={`grid grid-cols-[36px_1fr_1fr_44px] gap-1.5 items-center p-2 rounded-lg transition-colors ${set.completed ? 'bg-primary/10 border border-primary/30' : isRecognition ? 'bg-accent/10 border border-accent/30' : 'bg-secondary/50'}`}>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-sm font-bold text-center text-foreground leading-none">{i + 1}</span>
                  {isRecognition && <span className="text-[8px] uppercase tracking-wider text-accent font-semibold mt-0.5">Rec</span>}
                </div>
                <Input type="text" inputMode="numeric" value={set.reps} onChange={(e) => updateSet(i, 'reps', e.target.value)} placeholder={planned?.reps || '10'} className="h-9 text-center bg-background/50 border-border/50" disabled={set.completed} />
                <Input type="text" inputMode="decimal" value={set.weight} onChange={(e) => updateSet(i, 'weight', e.target.value)} placeholder="0" className="h-9 text-center bg-background/50 border-border/50" disabled={set.completed} />
                <Button size="icon" variant={set.completed ? 'default' : 'outline'} className="h-9 w-9 mx-auto rounded-full" onClick={() => toggleSetComplete(i)}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          {currentIndex < exercises.length - 1 ? (
            <Button className="flex-1" onClick={() => setCurrentIndex(currentIndex + 1)}>
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
              const exName = ex.exercise || '';
              const muscle = exerciseDB.find((d) => d.nome.toLowerCase() === exName.toLowerCase())?.grupo_muscular || null;
              arr.forEach((s, i) => {
                if (!s.completed) return;
                const reps = parseInt(s.reps) || 0;
                const weight = parseFloat(s.weight.replace(',', '.')) || 0;
                totalSets += 1;
                totalVolumeKg += reps * weight;
                setLogRows.push({
                  student_id: user.id,
                  exercise_name: exName,
                  muscle_group: muscle,
                  set_number: i + 1,
                  reps: reps || null,
                  weight_kg: weight || null,
                  rpe: null,
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
                    completed_at: new Date().toISOString(),
                    duration_minutes: durationMinutes,
                    exercises_completed: exercisesCompleted,
                    total_exercises: exercises.length,
                    avg_rpe: sessionRpe,
                    total_volume_kg: totalVolumeKg || null,
                    total_sets: totalSets,
                    session_state: null,
                  })
                  .eq('id', finalSessionId);
              } else {
                // Fallback: cria nova já completada (não havia sessão em andamento)
                const { data: sessionRow } = await supabase
                  .from('workout_sessions')
                  .insert({
                    student_id: user.id,
                    day_name: dayName,
                    phase: phase ?? null,
                    status: 'completed',
                    duration_minutes: durationMinutes,
                    exercises_completed: exercisesCompleted,
                    total_exercises: exercises.length,
                    avg_rpe: sessionRpe,
                    total_volume_kg: totalVolumeKg || null,
                    total_sets: totalSets,
                  })
                  .select('id')
                  .single();
                finalSessionId = sessionRow?.id ?? null;
              }

              if (setLogRows.length > 0 && finalSessionId) {
                await supabase
                  .from('exercise_set_logs')
                  .insert(setLogRows.map((r) => ({ ...r, session_id: finalSessionId })));
                await supabase.from('student_events').insert({
                  student_id: user.id,
                  event_type: 'workout_load_logged',
                  metadata: { sets: setLogRows.length, session_id: finalSessionId },
                });
              }
              await supabase.from('student_events').insert({
                student_id: user.id,
                event_type: 'workout_completed',
                metadata: {
                  day_name: dayName,
                  duration_minutes: durationMinutes,
                  exercises_completed: exercisesCompleted,
                  session_rpe: sessionRpe,
                },
              });

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

export default TreinoExecucao;
