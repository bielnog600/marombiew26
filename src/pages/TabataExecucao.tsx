import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { X, Play, Pause, SkipForward, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedTabata, TabataBlock, TabataExercise } from '@/lib/tabataParser';

type Phase = 'idle' | 'prep' | 'work' | 'rest' | 'block_rest' | 'done';

interface Step {
  blockIndex: number;
  exerciseIndex: number;
  block: TabataBlock;
  exercise: TabataExercise;
}

const PREP_SECONDS = 10;

const extractStreamVideoId = (embed: string | null | undefined): string | null => {
  if (!embed) return null;
  const match = embed.match(/cloudflarestream\.com\/([a-f0-9]{32})\//);
  return match ? match[1] : null;
};

const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'em', 'na', 'no', 'a', 'o', 'e', 'para', 'pra']);

// Equipment markers — if one side has a marker the other doesn't, names are NOT compatible
const EQUIPMENT_MARKERS = ['barra', 'halter', 'halteres', 'maquina', 'smith', 'hack', 'polia', 'cabo',
  'cadeira', 'mesa', 'graviton', 'peck', 'crossover', 'kettlebell', 'bola', 'elastico', 'corda',
  'caixa', 'caixote', 'step', 'banco', 'solo'];

const normalizeName = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const tokenize = (s: string) =>
  normalizeName(s).split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t));

const equipmentOf = (s: string) => {
  const tokens = new Set(tokenize(s));
  return new Set(EQUIPMENT_MARKERS.filter(m => tokens.has(m)));
};

const TabataExecucao: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tabata = (location.state as any)?.tabata as ParsedTabata | undefined;

  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaMap, setMediaMap] = useState<Record<string, { videoEmbed?: string | null; imageUrl?: string | null }>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

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

  // Load exercise media from DB and fuzzy-match by name
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('exercises').select('nome, imagem_url, video_embed');
      if (cancelled || !data) return;
      const map: Record<string, { videoEmbed?: string | null; imageUrl?: string | null }> = {};
      data.forEach((row: any) => {
        map[normalizeName(row.nome)] = { videoEmbed: row.video_embed, imageUrl: row.imagem_url };
      });
      setMediaMap(map);
    })();
    return () => { cancelled = true; };
  }, []);

  const findMedia = useMemo(() => {
    return (exName: string) => {
      if (!exName || !Object.keys(mediaMap).length) return null;
      const key = normalizeName(exName);
      if (mediaMap[key]) return mediaMap[key];

      const queryTokens = tokenize(exName);
      if (!queryTokens.length) return null;
      const queryEquip = equipmentOf(exName);

      let best: { score: number; key: string; matches: number } | null = null;
      for (const candidateKey of Object.keys(mediaMap)) {
        const candTokens = candidateKey.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t));
        if (!candTokens.length) continue;

        const candEquip = equipmentOf(candidateKey);
        if (queryEquip.size > 0 || candEquip.size > 0) {
          const equipMatches = [...queryEquip].some(e => candEquip.has(e));
          const equipDiffers = (queryEquip.size > 0 && candEquip.size > 0 && !equipMatches) ||
            (queryEquip.size === 0 && candEquip.size > 0) ||
            (queryEquip.size > 0 && candEquip.size === 0);
          if (equipDiffers) continue;
        }

        const matches = queryTokens.filter(t => candTokens.some(c => c === t)).length;
        if (!matches) continue;
        const score = matches / Math.max(queryTokens.length, candTokens.length);
        if (!best || score > best.score) best = { score, key: candidateKey, matches };
      }

      return best && best.matches >= 1 && best.score >= 0.3 ? mediaMap[best.key] : null;
    };
  }, [mediaMap]);

  const isResting = phase === 'rest' || phase === 'block_rest';

  const nextStep = isResting ? steps[stepIndex + 1] : null;
  const nextMedia = nextStep ? findMedia(nextStep.exercise.name) : null;

  // Durante descanso, antecipa a mídia do próximo exercício
  const displayStep = isResting && nextStep ? nextStep : currentStep;
  const displayMedia = useMemo(
    () => displayStep ? findMedia(displayStep.exercise.name) : null,
    [displayStep, findMedia]
  );

  const streamVideoId = extractStreamVideoId(displayMedia?.videoEmbed);
  const hlsUrl = streamVideoId ? `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${streamVideoId}/manifest/video.m3u8` : null;
  const fallbackImage = !streamVideoId && displayMedia?.imageUrl ? displayMedia.imageUrl : null;
  const hasMediaBg = !!hlsUrl || !!fallbackImage;
  const showVideoBg = (phase === 'prep' || phase === 'work' || phase === 'rest' || phase === 'block_rest') && hasMediaBg;

  // Mount HLS video when applicable
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideoBg || !hlsUrl) return;

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      const tryPlay = () => video.play().catch(() => {});
      video.addEventListener('loadedmetadata', tryPlay, { once: true });
      return () => video.removeEventListener('loadedmetadata', tryPlay);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [hlsUrl, showVideoBg]);

  const beep = (frequency: number, duration: number) => {
    if (muted) return;
    try {
      // Recreate context if it was closed/interrupted (e.g. iOS headphone disconnect)
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      // iOS Safari suspends the context on audio route changes — resume it
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { /* ignore */ });
      }
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
    } catch {
      // Context might be in a bad state — drop it so next beep recreates it
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
  };

  // iOS Safari: resume/recreate audio context when tab returns to foreground
  // or when audio route changes (headphones plugged/unplugged)
  useEffect(() => {
    const recover = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => { /* ignore */ });
      }
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
        "fixed inset-0 z-50 flex flex-col transition-colors duration-500",
        showVideoBg ? "bg-black" : cn("bg-gradient-to-br", phaseColor)
      )}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background video or image fallback */}
      {showVideoBg && (
        <div className="absolute inset-0 -z-10 overflow-hidden bg-black">
          {hlsUrl ? (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : fallbackImage ? (
            <img
              src={fallbackImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}
          {/* Subtle gradients only at top/bottom for header/controls legibility — no blur */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/85 to-transparent" />
        </div>
      )}

      {/* Fallback background blur when no video */}
      {!showVideoBg && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm -z-10" />
      )}

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
        {phase !== 'work' && (
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">{phaseLabel}</p>
        )}

        {phase === 'idle' && (
          <>
            <h1 className="text-3xl sm:text-4xl font-black mb-2">{tabata.title}</h1>
            <p className="text-sm text-muted-foreground mb-1">{tabata.duration} • {tabata.type}</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-sm">{tabata.objective}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">
              {tabata.blocks.length} blocos • {totalSteps} exercícios
            </p>

            {/* Exercise preview — agrupado por bloco, sem repetir exercícios */}
            <div className="w-full max-w-md max-h-[48vh] overflow-y-auto pr-1 space-y-3">
              {tabata.blocks.map((block, bi) => {
                const seen = new Set<string>();
                const uniqueExercises = block.exercises.filter(ex => {
                  const k = normalizeName(ex.name);
                  if (seen.has(k)) return false;
                  seen.add(k);
                  return true;
                });
                const estimatedRounds = uniqueExercises.length > 0
                  ? Math.max(block.rounds || 1, Math.round(block.exercises.length / uniqueExercises.length))
                  : block.rounds;
                const work = uniqueExercises[0]?.workSeconds ?? block.workSeconds;
                const rest = uniqueExercises[0]?.restSeconds ?? block.restSeconds;

                return (
                  <div key={bi} className="text-left bg-card/60 backdrop-blur-sm border border-border/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-widest text-primary font-bold">
                        Bloco {bi + 1}
                      </p>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {estimatedRounds}x rodadas
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      {uniqueExercises.length} exercício{uniqueExercises.length > 1 ? 's' : ''} • {work}s trabalho • {rest}s descanso
                    </p>
                    <div className="space-y-1.5">
                      {uniqueExercises.map((ex, ei) => {
                        const media = findMedia(ex.name);
                        const img = media?.imageUrl;
                        return (
                          <div key={ei} className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                              {img ? (
                                <img src={img} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-muted-foreground font-bold">{ei + 1}</span>
                              )}
                            </div>
                            <p className="text-[12px] font-medium leading-tight flex-1">
                              {ex.name.replace(/\*+/g, '').trim()}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
            <div
              className={cn(
                "text-[8rem] sm:text-[10rem] font-black leading-none tabular-nums mb-4 transition-all",
                phase === 'work' && 'text-red-500',
                phase === 'rest' && 'text-green-500',
                phase === 'block_rest' && 'text-blue-500',
                phase === 'prep' && 'text-yellow-500',
                secondsLeft > 0 && secondsLeft <= 3 && 'animate-pulse scale-110',
              )}
              style={{
                textShadow:
                  secondsLeft > 0 && secondsLeft <= 3
                    ? '0 2px 8px rgba(0,0,0,0.7), 0 0 20px currentColor'
                    : '0 2px 10px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)',
                ...(secondsLeft > 0 && secondsLeft <= 3
                  ? { WebkitTextStroke: '2px currentColor' }
                  : {}),
              }}
                ...(secondsLeft > 0 && secondsLeft <= 3
                  ? { WebkitTextStroke: '3px currentColor' }
                  : {}),
              }}
            >
              {secondsLeft}
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
              {(phase === 'block_rest'
                ? (nextStep ? `Prepare-se: ${nextStep.exercise.name}` : 'Descanso entre blocos')
                : phase === 'rest'
                  ? (nextStep ? nextStep.exercise.name : 'Próximo exercício')
                  : currentStep.exercise.name
              ).replace(/\*+/g, '').trim()}
            </h2>
            {currentStep.exercise.observation && phase === 'work' && (
              <p className="text-xs text-muted-foreground max-w-sm mt-2">{currentStep.exercise.observation}</p>
            )}

            {/* Next exercise preview during rest */}
            {(phase === 'rest' || phase === 'block_rest') && nextStep && (
              <div className="mt-4 flex items-center gap-3 bg-card/70 backdrop-blur-md border border-primary/30 rounded-2xl p-3 pr-5 shadow-lg max-w-sm animate-fade-in">
                <div className="h-16 w-16 rounded-xl bg-muted overflow-hidden shrink-0 ring-2 ring-primary/40">
                  {nextMedia?.imageUrl ? (
                    <img src={nextMedia.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-primary font-black text-xl">→</div>
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-primary font-bold">A seguir</p>
                  <p className="text-sm font-bold leading-tight line-clamp-2">
                    {nextStep.exercise.name.replace(/\*+/g, '').trim()}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {nextStep.exercise.workSeconds}s de execução
                  </p>
                </div>
              </div>
            )}
          </>
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

export default TabataExecucao;
