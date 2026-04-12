import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Timer, Play, Pause, RotateCcw, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type ParsedExercise } from '@/lib/trainingResultParser';

interface ExerciseSet {
  reps: string;
  weight: string;
  completed: boolean;
}

const TreinoExecucao = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { exercises = [], dayName = 'Treino' } = (location.state as { exercises: ParsedExercise[]; dayName: string }) || {};

  const [currentIndex, setCurrentIndex] = useState(0);
  const [sets, setSets] = useState<Record<number, ExerciseSet[]>>({});
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [restMode, setRestMode] = useState(false);

  const exercise = exercises[currentIndex];
  const totalSeries = parseInt(exercise?.series || '3') || 3;

  // Initialize sets for current exercise
  useEffect(() => {
    if (!sets[currentIndex]) {
      setSets(prev => ({
        ...prev,
        [currentIndex]: Array.from({ length: totalSeries }, () => ({
          reps: exercise?.reps || '',
          weight: '',
          completed: false,
        })),
      }));
    }
  }, [currentIndex, totalSeries]);

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive) {
      interval = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    if (restMode && !timerActive) {
      setTimerSeconds(0);
    }
    setTimerActive(!timerActive);
    setRestMode(true);
  };

  const resetTimer = () => {
    setTimerActive(false);
    setTimerSeconds(0);
    setRestMode(false);
  };

  const updateSet = (setIndex: number, field: 'reps' | 'weight', value: string) => {
    setSets(prev => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], [field]: value };
      return { ...prev, [currentIndex]: current };
    });
  };

  const toggleSetComplete = (setIndex: number) => {
    setSets(prev => {
      const current = [...(prev[currentIndex] || [])];
      current[setIndex] = { ...current[setIndex], completed: !current[setIndex].completed };
      return { ...prev, [currentIndex]: current };
    });
    // Start rest timer automatically
    resetTimer();
    setRestMode(true);
    setTimerActive(true);
  };

  const currentSets = sets[currentIndex] || [];

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

  // Video placeholder search term based on exercise name
  const exerciseName = exercise.exercise.toLowerCase();
  const videoSearchTerm = encodeURIComponent(exerciseName + ' exercise gym');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Video / Visual Area */}
      <div className="relative w-full aspect-video bg-secondary/30 overflow-hidden">
        <img
          src={`https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg`}
          alt={exercise.exercise}
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 h-10 w-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>

        {/* Exercise counter */}
        <div className="absolute top-4 right-4 z-10 bg-background/80 backdrop-blur rounded-full px-3 py-1">
          <span className="text-xs font-medium text-foreground">
            {currentIndex + 1}/{exercises.length}
          </span>
        </div>

        {/* Exercise info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">{dayName}</p>
          <h1 className="text-xl font-bold text-foreground leading-tight">{exercise.exercise}</h1>
          {exercise.description && (
            <p className="text-xs text-muted-foreground mt-1">{exercise.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2">
            {exercise.series && (
              <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">
                {exercise.series} séries
              </span>
            )}
            {exercise.reps && (
              <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">
                {exercise.reps} reps
              </span>
            )}
            {exercise.pause && (
              <span className="text-xs text-foreground bg-secondary/80 px-2 py-1 rounded">
                {exercise.pause} descanso
              </span>
            )}
            {exercise.rir && (
              <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                RIR {exercise.rir}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 pb-28">
        {/* Timer */}
        <div className="flex items-center justify-center gap-3">
          <div className={`text-3xl font-mono font-bold tabular-nums ${restMode && timerActive ? 'text-primary' : 'text-foreground'}`}>
            {formatTime(timerSeconds)}
          </div>
          <div className="flex gap-2">
            <Button
              size="icon"
              variant={timerActive ? 'default' : 'outline'}
              className="h-10 w-10 rounded-full"
              onClick={toggleTimer}
            >
              {timerActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-full"
              onClick={resetTimer}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sets table */}
        <div className="space-y-2">
          <div className="grid grid-cols-[40px_1fr_1fr_48px] gap-2 px-1">
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Série</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Reps</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold">Carga (kg)</span>
            <span className="text-[10px] uppercase text-muted-foreground font-semibold text-center">✓</span>
          </div>
          {currentSets.map((set, i) => (
            <div
              key={i}
              className={`grid grid-cols-[40px_1fr_1fr_48px] gap-2 items-center p-2 rounded-lg transition-colors ${
                set.completed ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50'
              }`}
            >
              <span className="text-sm font-bold text-center text-foreground">{i + 1}</span>
              <Input
                type="text"
                value={set.reps}
                onChange={(e) => updateSet(i, 'reps', e.target.value)}
                placeholder="10"
                className="h-9 text-center bg-background/50 border-border/50"
                disabled={set.completed}
              />
              <Input
                type="text"
                value={set.weight}
                onChange={(e) => updateSet(i, 'weight', e.target.value)}
                placeholder="0"
                className="h-9 text-center bg-background/50 border-border/50"
                disabled={set.completed}
              />
              <Button
                size="icon"
                variant={set.completed ? 'default' : 'outline'}
                className="h-9 w-9 mx-auto rounded-full"
                onClick={() => toggleSetComplete(i)}
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {exercise.variation && (
          <p className="text-xs text-muted-foreground bg-secondary/30 p-3 rounded-lg">
            <span className="font-semibold text-foreground">Variação:</span> {exercise.variation}
          </p>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border p-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setCurrentIndex(Math.max(0, currentIndex - 1));
              resetTimer();
            }}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          {currentIndex < exercises.length - 1 ? (
            <Button
              className="flex-1"
              onClick={() => {
                setCurrentIndex(currentIndex + 1);
                resetTimer();
              }}
            >
              Próximo
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={() => navigate(-1)}
            >
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
