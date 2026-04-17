import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, SkipForward, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedTabata, TabataBlock, TabataExercise } from '@/lib/tabataParser';

type Phase = 'idle' | 'prep' | 'work' | 'rest' | 'block_rest' | 'done';

interface Step {
  blockIndex: number;
  exerciseIndex: number;
  block: TabataBlock;
  exercise: TabataExercise;
}

const PREP_SECONDS = 10;

const TabataExecucao: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tabata = (location.state as any)?.tabata as ParsedTabata | undefined;

  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const steps: Step[] = useMemo(() => {
    if (!tabata) return [];
    const list: Step[] = [];
    tabata.blocks.forEach((block, blockIndex) => {
      block.exercises.forEach((exercise, exerciseIndex) => {
        list.push({ blockIndex, exerciseIndex, block, exercise });
      });
    });
    return list;
  }, [tabata]);

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;

  const beep = (frequency: number, duration: number) => {
    if (muted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) { /* silent */ }
  };

  // Tick
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') return;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, phase]);

  // Phase transitions when seconds hit 0
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || secondsLeft > 0) return;

    if (phase === 'prep') {
      beep(880, 0.3);
      setPhase('work');
      setSecondsLeft(currentStep.exercise.workSeconds);
      return;
    }

    if (phase === 'work') {
      const isLastInBlock = currentStep.exerciseIndex === currentStep.block.exercises.length - 1;
      const isLastStep = stepIndex === totalSteps - 1;

      if (isLastStep) {
        beep(1320, 0.6);
        setPhase('done');
        return;
      }

      if (isLastInBlock) {
        beep(660, 0.5);
        setPhase('block_rest');
        setSecondsLeft(currentStep.block.restAfterBlock);
      } else {
        beep(440, 0.3);
        setPhase('rest');
        setSecondsLeft(currentStep.exercise.restSeconds);
      }
      return;
    }

    if (phase === 'rest' || phase === 'block_rest') {
      beep(880, 0.3);
      const nextIndex = stepIndex + 1;
      setStepIndex(nextIndex);
      setPhase('work');
      setSecondsLeft(steps[nextIndex].exercise.workSeconds);
      return;
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown beeps in last 3 seconds
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || paused) return;
    if (secondsLeft > 0 && secondsLeft <= 3) beep(660, 0.15);
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!steps.length) return;
    setStepIndex(0);
    setPhase('prep');
    setSecondsLeft(PREP_SECONDS);
    setPaused(false);
  };

  const skip = () => {
    setSecondsLeft(0);
  };

  const restart = () => {
    setPhase('idle');
    setStepIndex(0);
    setSecondsLeft(PREP_SECONDS);
    setPaused(false);
  };

  if (!tabata) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground mb-4">Nenhum TABATA carregado.</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const phaseLabel = {
    idle: 'PRONTO?',
    prep: 'PREPARE-SE',
    work: 'TRABALHE!',
    rest: 'DESCANSE',
    block_rest: 'DESCANSO DO BLOCO',
    done: 'CONCLUÍDO!',
  }[phase];

  const phaseColor = {
    idle: 'from-primary/20 to-primary/5',
    prep: 'from-yellow-500/30 to-yellow-500/5',
    work: 'from-red-500/40 to-red-500/10',
    rest: 'from-green-500/30 to-green-500/5',
    block_rest: 'from-blue-500/30 to-blue-500/5',
    done: 'from-primary/30 to-primary/5',
  }[phase];

  const overallProgress = totalSteps > 0 ? ((stepIndex + (phase === 'work' ? 0.5 : phase === 'rest' || phase === 'block_rest' ? 1 : 0)) / totalSteps) * 100 : 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-gradient-to-br transition-colors duration-500",
        phaseColor
      )}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm -z-10" />

      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <X className="h-5 w-5" />
        </Button>
        <div className="text-center flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{tabata.title}</p>
          {phase !== 'idle' && phase !== 'done' && currentStep && (
            <p className="text-xs font-semibold mt-0.5">
              Bloco {currentStep.blockIndex + 1} • Ex. {currentStep.exerciseIndex + 1}/{currentStep.block.exercises.length}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMuted(m => !m)}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="px-4">
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Main timer */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">{phaseLabel}</p>

        {phase === 'idle' && (
          <>
            <h1 className="text-4xl font-black mb-3">{tabata.title}</h1>
            <p className="text-sm text-muted-foreground mb-2">{tabata.duration} • {tabata.type}</p>
            <p className="text-xs text-muted-foreground mb-8 max-w-sm">{tabata.objective}</p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{tabata.blocks.length} blocos • {totalSteps} exercícios</p>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <h1 className="text-5xl font-black mb-3 text-primary">🎉</h1>
            <h2 className="text-2xl font-bold mb-2">TABATA Concluído!</h2>
            <p className="text-sm text-muted-foreground mb-8">Mandou bem!</p>
          </>
        )}

        {(phase === 'prep' || phase === 'work' || phase === 'rest' || phase === 'block_rest') && currentStep && (
          <>
            <div className={cn(
              "text-[8rem] sm:text-[10rem] font-black leading-none tabular-nums mb-4 transition-colors",
              phase === 'work' && 'text-red-500',
              phase === 'rest' && 'text-green-500',
              phase === 'block_rest' && 'text-blue-500',
              phase === 'prep' && 'text-yellow-500',
            )}>
              {secondsLeft}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 uppercase">
              {phase === 'work' || phase === 'prep' ? currentStep.exercise.name : (phase === 'block_rest' ? 'Descanso entre blocos' : 'Próximo: ' + (steps[stepIndex + 1]?.exercise.name || 'Fim'))}
            </h2>
            {currentStep.exercise.observation && phase === 'work' && (
              <p className="text-xs text-muted-foreground max-w-sm mt-2">{currentStep.exercise.observation}</p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 flex items-center justify-center gap-4">
        {phase === 'idle' && (
          <Button size="lg" onClick={start} className="gap-2 px-8 h-14 text-base font-bold">
            <Play className="h-5 w-5" /> Iniciar
          </Button>
        )}

        {phase === 'done' && (
          <>
            <Button variant="outline" size="lg" onClick={restart} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Repetir
            </Button>
            <Button size="lg" onClick={() => navigate(-1)} className="gap-2 font-bold">
              Voltar
            </Button>
          </>
        )}

        {phase !== 'idle' && phase !== 'done' && (
          <>
            <Button variant="outline" size="icon" onClick={() => setPaused(p => !p)} className="h-14 w-14">
              {paused ? <Play className="h-6 w-6" /> : <Pause className="h-6 w-6" />}
            </Button>
            <Button variant="outline" size="icon" onClick={skip} className="h-14 w-14">
              <SkipForward className="h-6 w-6" />
            </Button>
            <Button variant="ghost" size="icon" onClick={restart} className="h-14 w-14">
              <RotateCcw className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default TabataExecucao;
