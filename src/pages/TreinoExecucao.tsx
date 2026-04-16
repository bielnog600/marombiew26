import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { ArrowLeft, Play, Pause, Check, ChevronLeft, ChevronRight, Timer, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { useAuth } from '@/contexts/AuthContext';
import { type ParsedExercise, parseTrainingSections } from '@/lib/trainingResultParser';
import { PHASE_OBJECTIVE, getPhaseByMonthDay, type TrainingPhase } from '@/lib/trainingPhase';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';

interface ExerciseSet {
  reps: string;
  weight: string;
  completed: boolean;
}

interface ExerciseDBData {
  nome: string;
  imagem_url: string | null;
  video_embed: string | null;
  grupo_muscular: string;
}

interface ExerciseMediaMap {
  [key: string]: {
    imageUrl?: string;
    videoEmbed?: string;
    muscleGroup?: string;
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
  const [exerciseDB, setExerciseDB] = useState<ExerciseDBData[]>([]);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(60);
  const [showPlayFallback, setShowPlayFallback] = useState(false);
  const [showingVariation, setShowingVariation] = useState(false);
  const [sessionStartAt] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const [summary, setSummary] = useState<{ duration: number; completed: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Session timer tick
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [sessionStartAt]);

  const formatElapsed = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

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
          const { data: dbEx } = await supabase.from('exercises').select('nome, imagem_url, video_embed, grupo_muscular');
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
                  imageUrl: match.imagem_url || undefined,
                  videoEmbed: match.video_embed || undefined,
                  muscleGroup: match.grupo_muscular || undefined,
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
  const totalSeries = parseInt(exercise?.series || '3') || 3;

  useEffect(() => {
    const loadExercises = async () => {
      const { data } = await supabase.from('exercises').select('nome, imagem_url, video_embed, grupo_muscular');
      if (data) setExerciseDB(data);
    };

    loadExercises();
  }, []);

  const matchedExercise = useMemo(() => {
    if (!exercise) return null;
    const name = exercise.exercise.toUpperCase().trim();

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
    match = exerciseDB.find((e) => name.includes(e.nome.toUpperCase().trim()) || e.nome.toUpperCase().trim().includes(name));
    return match || null;
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
    match = exerciseDB.find((e) => name.includes(e.nome.toUpperCase().trim()) || e.nome.toUpperCase().trim().includes(name));
    return match || null;
  }, [exercise, exerciseDB, exerciseMedia, showingVariation]);

  const activeExercise = showingVariation && matchedVariation ? matchedVariation : matchedExercise;

  useEffect(() => {
    setShowingVariation(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!sets[currentIndex]) {
      setSets((prev) => ({
        ...prev,
        [currentIndex]: Array.from({ length: totalSeries }, () => ({ reps: exercise?.reps || '', weight: '', completed: false })),
      }));
    }
  }, [currentIndex, totalSeries, exercise, sets]);

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
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {exercise.series && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.series} séries</span>}
            {exercise.reps && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.reps} reps</span>}
            {exercise.pause && <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">{exercise.pause} descanso</span>}
            {exercise.rir && <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">RIR {exercise.rir}</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 pb-28">
        {(() => {
          const autoPhase = getPhaseByMonthDay();
          return (
            <p className="text-center text-xs text-muted-foreground px-3 leading-relaxed">
              {PHASE_OBJECTIVE[autoPhase]}
            </p>
          );
        })()}

        <div className="space-y-2">
          <div className="grid grid-cols-[40px_1fr_1fr_48px] gap-2 px-2">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Série</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Reps</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">Carga (kg)</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">✓</span>
          </div>
          {currentSets.map((set, i) => (
            <div key={i} className={`grid grid-cols-[40px_1fr_1fr_48px] gap-2 items-center p-2 rounded-lg transition-colors ${set.completed ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50'}`}>
              <span className="text-sm font-bold text-center text-foreground">{i + 1}</span>
              <Input type="text" value={set.reps} onChange={(e) => updateSet(i, 'reps', e.target.value)} placeholder="10" className="h-9 text-center bg-background/50 border-border/50" disabled={set.completed} />
              <Input type="text" value={set.weight} onChange={(e) => updateSet(i, 'weight', e.target.value)} placeholder="0" className="h-9 text-center bg-background/50 border-border/50" disabled={set.completed} />
              <Button size="icon" variant={set.completed ? 'default' : 'outline'} className="h-9 w-9 mx-auto rounded-full" onClick={() => toggleSetComplete(i)}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ))}
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
            <Button className="flex-1" disabled={isFinishing} onClick={async () => {
              if (isFinishing) return;
              setIsFinishing(true);
              const totalSec = Math.floor((Date.now() - sessionStartAt) / 1000);
              const durationMinutes = Math.max(1, Math.round(totalSec / 60));
              const exercisesCompleted = Object.values(sets).filter(arr => arr?.some(s => s.completed)).length;
              try {
                if (user) {
                  await supabase.from('workout_sessions').insert({
                    student_id: user.id,
                    day_name: dayName,
                    phase: phase ?? null,
                    duration_minutes: durationMinutes,
                    exercises_completed: exercisesCompleted,
                    total_exercises: exercises.length,
                  });
                }
              } catch (e) {
                console.error('Erro salvando sessão:', e);
                toast.error('Erro ao salvar sessão.');
              }
              completeWorkout();
              setSummary({ duration: totalSec, completed: exercisesCompleted });
              setIsFinishing(false);
            }}>
              Finalizar
              <Check className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TreinoExecucao;
