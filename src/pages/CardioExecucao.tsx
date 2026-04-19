import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, SkipForward, RotateCcw, Volume2, VolumeX, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseCardioProtocol,
  MODALITY_LABEL,
  STRUCTURE_LABEL,
  totalCardioDurationSec,
  formatDurationFromSec,
  type CardioProtocol,
  type CardioBlock,
  type CardioModality,
} from '@/lib/cardioParser';

type Phase = 'idle' | 'prep' | 'block' | 'done';

const PREP_SECONDS = 10;

const CardioExecucao: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const stateProtocol = (location.state as any)?.protocol as CardioProtocol | undefined;
  const protocol = useMemo(() => {
    if (stateProtocol && Array.isArray(stateProtocol.blocks)) return stateProtocol;
    // Try parse if string was passed
    const raw = (location.state as any)?.conteudo;
    return raw ? parseCardioProtocol(raw) : null;
  }, [stateProtocol, location.state]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [blockIndex, setBlockIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const blocks = protocol?.blocks || [];
  const totalBlocks = blocks.length;
  const currentBlock: CardioBlock | undefined = blocks[blockIndex];

  const beep = (frequency: number, duration: number) => {
    if (muted) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    const recover = () => {
      const ctx = audioCtxRef.current;
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', recover);
    window.addEventListener('focus', recover);
    return () => {
      document.removeEventListener('visibilitychange', recover);
      window.removeEventListener('focus', recover);
    };
  }, []);

  // Tick
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') return;
    const id = setInterval(() => setSecondsLeft(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [paused, phase]);

  // Phase transitions
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || secondsLeft > 0) return;

    if (phase === 'prep') {
      beep(880, 0.3);
      setPhase('block');
      setSecondsLeft(blocks[0].durationSec);
      return;
    }

    if (phase === 'block') {
      const isLast = blockIndex === totalBlocks - 1;
      if (isLast) {
        beep(1320, 0.6);
        setPhase('done');
        return;
      }
      beep(660, 0.4);
      const nextIdx = blockIndex + 1;
      setBlockIndex(nextIdx);
      setSecondsLeft(blocks[nextIdx].durationSec);
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown beeps
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || paused) return;
    if (secondsLeft > 0 && secondsLeft <= 3) beep(660, 0.15);
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlockAudio = () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* ignore */ }
  };

  const start = () => {
    if (!blocks.length) return;
    unlockAudio();
    setBlockIndex(0);
    setPhase('prep');
    setSecondsLeft(PREP_SECONDS);
    setPaused(false);
  };

  const skip = () => {
    unlockAudio();
    setSecondsLeft(0);
  };

  const restart = () => {
    setPhase('idle');
    setBlockIndex(0);
    setSecondsLeft(PREP_SECONDS);
    setPaused(false);
  };

  if (!protocol) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground mb-4">Nenhum cardio carregado.</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const totalSec = totalCardioDurationSec(protocol);

  const phaseLabel = {
    idle: 'PRONTO?',
    prep: 'PREPARE-SE',
    block: currentBlock?.name?.toUpperCase() || 'BLOCO',
    done: 'CONCLUÍDO!',
  }[phase];

  const phaseColor = {
    idle: 'from-primary/20 to-primary/5',
    prep: 'from-yellow-500/30 to-yellow-500/5',
    block: currentBlock?.intensityLabel === 'maxima'
      ? 'from-red-500/40 to-red-500/10'
      : currentBlock?.intensityLabel === 'forte'
      ? 'from-orange-500/30 to-orange-500/10'
      : currentBlock?.intensityLabel === 'moderada'
      ? 'from-blue-500/30 to-blue-500/5'
      : 'from-green-500/30 to-green-500/5',
    done: 'from-primary/30 to-primary/5',
  }[phase];

  // Overall progress: sum elapsed seconds across blocks
  const elapsedSec = blocks.slice(0, blockIndex).reduce((s, b) => s + b.durationSec, 0)
    + (phase === 'block' && currentBlock ? currentBlock.durationSec - secondsLeft : 0);
  const overallProgress = totalSec > 0 ? Math.min(100, (elapsedSec / totalSec) * 100) : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-gradient-to-br transition-colors duration-500',
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
        <div className="text-center flex-1 min-w-0 px-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{protocol.title}</p>
          {phase === 'block' && currentBlock && (
            <p className="text-xs font-semibold mt-0.5">
              Etapa {blockIndex + 1}/{totalBlocks}
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
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center overflow-y-auto">
        <p className="text-sm uppercase tracking-[0.3em] text-foreground mb-3">{phaseLabel}</p>

        {phase === 'idle' && (
          <div className="w-full max-w-md space-y-4">
            <h1 className="text-3xl sm:text-4xl font-black">{protocol.title}</h1>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary">
                {MODALITY_LABEL[protocol.modality]}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
                {STRUCTURE_LABEL[protocol.structure]}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-secondary">
                {formatDurationFromSec(totalSec)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{protocol.objective}</p>
            {protocol.targetZoneSummary && (
              <p className="text-sm text-primary font-bold flex items-center justify-center gap-1">
                <HeartPulse className="h-4 w-4" /> {protocol.targetZoneSummary}
              </p>
            )}

            {/* Blocks preview */}
            <div className="text-left bg-card/60 backdrop-blur-sm border border-border/40 rounded-xl p-3 max-h-[40vh] overflow-y-auto space-y-1.5">
              {blocks.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <span className="font-semibold truncate">{i + 1}. {b.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.targetZone && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        {b.targetZone}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatDurationFromSec(b.durationSec)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(phase === 'prep' || phase === 'block') && currentBlock && (
          <div className="w-full max-w-md space-y-4">
            <div className="text-7xl sm:text-8xl font-black font-mono tabular-nums leading-none">
              {formatTime(secondsLeft)}
            </div>

            {phase === 'block' && (
              <>
                <BlockParametersDisplay block={currentBlock} modality={protocol.modality} />
                {currentBlock.targetZone && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <HeartPulse className="h-7 w-7 text-primary" />
                    <span className="text-2xl sm:text-3xl font-black text-primary tracking-tight">
                      {currentBlock.targetZone}
                      {currentBlock.targetHrRange ? ` • ${currentBlock.targetHrRange}` : ''}
                    </span>
                  </div>
                )}
                {currentBlock.notes && (
                  <p className="text-xs text-muted-foreground italic">{currentBlock.notes}</p>
                )}
              </>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-primary">PARABÉNS!</h2>
            <p className="text-sm text-muted-foreground">Cardio concluído. {formatDurationFromSec(totalSec)} de esforço.</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 pb-8 flex items-center justify-center gap-4">
        {phase === 'idle' && (
          <Button
            size="lg"
            onClick={start}
            className="gap-3 px-12 h-16 text-lg font-black uppercase tracking-wider rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_8px_32px_-4px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_40px_-4px_hsl(var(--primary)/0.8)] hover:scale-[1.03] active:scale-95 transition-all"
          >
            <Play className="!h-6 !w-6 fill-current" /> Iniciar
          </Button>
        )}

        {phase === 'done' && (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={restart}
              className="gap-2 h-14 px-6 rounded-2xl font-bold border-2 backdrop-blur-md bg-background/60"
            >
              <RotateCcw className="!h-5 !w-5" /> Repetir
            </Button>
            <Button
              size="lg"
              onClick={() => navigate(-1)}
              className="gap-2 h-14 px-8 font-black uppercase tracking-wider rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_8px_32px_-4px_hsl(var(--primary)/0.6)]"
            >
              Voltar
            </Button>
          </>
        )}

        {phase !== 'idle' && phase !== 'done' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={restart}
              aria-label="Reiniciar"
              className="h-14 w-14 rounded-full backdrop-blur-md bg-background/40 border border-border/40 hover:bg-background/60 active:scale-90 transition-all"
            >
              <RotateCcw className="!h-5 !w-5" />
            </Button>
            <Button
              size="icon"
              onClick={() => setPaused(p => !p)}
              aria-label={paused ? 'Retomar' : 'Pausar'}
              className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_10px_40px_-4px_hsl(var(--primary)/0.7)] hover:shadow-[0_14px_48px_-4px_hsl(var(--primary)/0.9)] hover:scale-105 active:scale-95 transition-all border-2 border-primary-foreground/10"
            >
              {paused ? <Play className="!h-8 !w-8 fill-current ml-1" /> : <Pause className="!h-8 !w-8 fill-current" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={skip}
              aria-label="Avançar"
              className="h-14 w-14 rounded-full backdrop-blur-md bg-background/40 border border-border/40 hover:bg-background/60 active:scale-90 transition-all"
            >
              <SkipForward className="!h-6 !w-6 fill-current" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const BlockParametersDisplay: React.FC<{ block: CardioBlock; modality: CardioModality }> = ({ block, modality }) => {
  const items: { label: string; value: string }[] = [];
  if (modality === 'passadeira') {
    if (block.speedKmh != null) items.push({ label: 'Velocidade', value: `${block.speedKmh} km/h` });
    if (block.inclinePct != null) items.push({ label: 'Inclinação', value: `${block.inclinePct}%` });
  } else if (modality === 'bike') {
    if (block.cadenceRpm != null) items.push({ label: 'Cadência', value: `${block.cadenceRpm} rpm` });
    if (block.resistanceLevel != null) items.push({ label: 'Carga', value: `Nível ${block.resistanceLevel}` });
    if (block.bikePosition) items.push({
      label: 'Posição',
      value: block.bikePosition === 'em_pe' ? 'Em pé' : block.bikePosition === 'sentado' ? 'Sentado' : 'Alternado',
    });
  } else if (modality === 'eliptica') {
    if (block.cadenceRpm != null) items.push({ label: 'Cadência', value: `${block.cadenceRpm} spm` });
    if (block.resistanceLevel != null) items.push({ label: 'Resistência', value: `Nível ${block.resistanceLevel}` });
  } else if (modality === 'escada') {
    if (block.stepsPerMin != null) items.push({ label: 'Ritmo', value: `${block.stepsPerMin} d/min` });
    if (block.resistanceLevel != null) items.push({ label: 'Nível', value: `${block.resistanceLevel}` });
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground capitalize">
        Intensidade {block.intensityLabel}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg bg-secondary/60 backdrop-blur p-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{it.label}</p>
          <p className="text-base font-bold">{it.value}</p>
        </div>
      ))}
    </div>
  );
};

export default CardioExecucao;
