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
  const [phaseStartTime, setPhaseStartTime] = useState<number>(Date.now());
  const [phaseTotalSeconds, setPhaseTotalSeconds] = useState<number>(PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaMap, setMediaMap] = useState<Record<string, { videoEmbed?: string | null; imageUrl?: string | null }>>({});
  const [phraseKey, setPhraseKey] = useState<number>(0);
  const [phrase, setPhrase] = useState<string>('');

  const isIOSAudioSafeMode = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledBeepTimeoutsRef = useRef<number[]>([]);
  const scheduledAudioNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode; cancelable: boolean }[]>([]);
  const audioUnlockedRef = useRef(false);
  const lastBeepedSecondRef = useRef<number>(-1);
  const phaseRef = useRef<Phase>(phase);
  const stepIndexRef = useRef(stepIndex);
  const pausedRef = useRef(paused);
  const mutedRef = useRef(muted);
  const phaseStartTimeRef = useRef(phaseStartTime);
  const phaseTotalSecondsRef = useRef(phaseTotalSeconds);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  type WakeLockSentinelLike = { released: boolean; release: () => Promise<void>; addEventListener: (ev: string, cb: () => void) => void };
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wakeLockDesiredRef = useRef(false);
  const wakeLockRequestTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    stepIndexRef.current = stepIndex;
    pausedRef.current = paused;
    mutedRef.current = muted;
    phaseStartTimeRef.current = phaseStartTime;
    phaseTotalSecondsRef.current = phaseTotalSeconds;
  }, [phase, stepIndex, paused, muted, phaseStartTime, phaseTotalSeconds]);

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

  // Sorteia uma nova frase sempre que a fase ou o exercício mudar
  useEffect(() => {
    const PHRASES_MAP: Record<Phase, string[]> = {
      idle: ['PRONTO?'],
      prep: ['PREPARE-SE', 'POSICIONE-SE', 'FIQUE PRONTO', 'AJUSTE A POSTURA', 'RESPIRE E CONCENTRE'],
      work: ['VAI COM TUDO!', 'FORÇA TOTAL!', 'NÃO PARE!', 'ACELERA!', 'DÁ TUDO DE SI!'],
      rest: ['RESPIRE FUNDO', 'DESCANSE AGORA', 'RECUPERE-SE', 'INSPIRE… EXPIRE', 'RELAXA E VOLTA'],
      block_rest: ['PAUSA ESTRATÉGICA', 'RESPIRE FUNDO', 'QUASE LÁ!', 'RECUPERE O FÔLEGO'],
      done: ['CONCLUÍDO!'],
    };
    const list = PHRASES_MAP[phase] || [phase];
    const pick = list[Math.floor(Math.random() * list.length)];
    setPhrase(pick);
    setPhraseKey(k => k + 1);
  }, [phase, stepIndex]);

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
  const rawHlsUrl = streamVideoId ? `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${streamVideoId}/manifest/video.m3u8` : null;
  const hlsUrl = rawHlsUrl;
  const fallbackImage = displayMedia?.imageUrl || null;
  const hasMediaBg = !!hlsUrl || !!fallbackImage;
  const showVideoBg = (phase === 'prep' || phase === 'work' || phase === 'rest' || phase === 'block_rest') && hasMediaBg;

  // Mount HLS video when applicable
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideoBg || !hlsUrl) return;

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
      video.preload = 'auto';
      try { video.load(); } catch { /* noop */ }
      const tryPlay = () => {
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        disableAudioTracks();
        video.play().catch(() => {});
      };
      video.addEventListener('loadedmetadata', tryPlay);
      video.addEventListener('loadeddata', tryPlay);
      video.addEventListener('canplay', tryPlay);
      return () => {
        video.removeEventListener('loadedmetadata', tryPlay);
        video.removeEventListener('loadeddata', tryPlay);
        video.removeEventListener('canplay', tryPlay);
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      const tryPlay = () => {
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        disableAudioTracks();
        video.play().catch(() => {});
      };
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.LEVEL_LOADED, tryPlay);
      hls.on(Hls.Events.FRAG_LOADED, tryPlay);
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data?.fatal) {
          try { hls.startLoad(); } catch { /* noop */ }
        }
      });
      video.addEventListener('loadeddata', tryPlay);
      video.addEventListener('canplay', tryPlay);
      return () => {
        video.removeEventListener('loadeddata', tryPlay);
        video.removeEventListener('canplay', tryPlay);
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [hlsUrl, showVideoBg]);

  const stopScheduledAudioNodes = (onlyCancelable = true) => {
    const keepAlive: { osc: OscillatorNode; gain: GainNode; cancelable: boolean }[] = [];
    scheduledAudioNodesRef.current.forEach(({ osc, gain, cancelable }) => {
      if (onlyCancelable && !cancelable) {
        keepAlive.push({ osc, gain, cancelable });
        return;
      }
      try { osc.stop(); } catch { /* noop */ }
      try { osc.disconnect(); } catch { /* noop */ }
      try { gain.disconnect(); } catch { /* noop */ }
    });
    scheduledAudioNodesRef.current = keepAlive;
  };

  // Mesmo mecanismo do cronômetro de descanso da musculação: Web Audio simples,
  // sem HTMLAudioElement, para misturar com música no iPhone e evitar bloqueios.
  const getAudioContext = () => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextCtor) return null;
        audioCtxRef.current = new AudioContextCtor();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      return ctx;
    } catch {
      return null;
    }
  };

  const primeAudioContext = (ctx: AudioContext) => {
    try {
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      source.connect(ctx.destination);
      source.start(0);
      source.onended = () => {
        try { source.disconnect(); } catch { /* noop */ }
      };
    } catch { /* noop */ }
  };

  const scheduleAudioBeep = (ctx: AudioContext, atTime: number, freq: number, durSec: number, volume = 0.25, cancelable = true) => {
    try {
      const safeAtTime = Math.max(atTime, ctx.currentTime + 0.01);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, safeAtTime);
      gain.gain.setValueAtTime(0.0001, safeAtTime);
      gain.gain.exponentialRampToValueAtTime(volume, safeAtTime + 0.01);
      gain.gain.setValueAtTime(volume, safeAtTime + Math.max(0.02, durSec - 0.02));
      gain.gain.exponentialRampToValueAtTime(0.0001, safeAtTime + durSec);
      osc.connect(gain).connect(ctx.destination);
      osc.start(safeAtTime);
      osc.stop(safeAtTime + durSec + 0.05);
      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch { /* noop */ }
        scheduledAudioNodesRef.current = scheduledAudioNodesRef.current.filter(node => node.osc !== osc);
      };
      scheduledAudioNodesRef.current.push({ osc, gain, cancelable });
      return true;
    } catch {
      return false;
    }
  };

  const beep = (frequency: number, duration: number, volume = 0.25) => {
    if (mutedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    scheduleAudioBeep(ctx, ctx.currentTime + 0.01, frequency, duration, volume, false);
  };

  const clearScheduledBeeps = () => {
    scheduledBeepTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    scheduledBeepTimeoutsRef.current = [];
    stopScheduledAudioNodes();
  };

  // Pré-agenda o 3-2-1 do mesmo jeito do descanso da musculação, direto no
  // relógio do Web Audio, com timer JS apenas como fallback visual/operacional.
  const scheduleCountdownFor = (seconds: number) => {
    clearScheduledBeeps();
    lastBeepedSecondRef.current = -1;
    if (mutedRef.current || seconds <= 0) return;
    const ctx = getAudioContext();
    const now = ctx?.currentTime ?? 0;

    const scheduleSecond = (remainingSecond: 3 | 2 | 1) => {
      if (seconds < remainingSecond) return;
      const delaySeconds = Math.max(0, seconds - remainingSecond);
      const delayMs = Math.round(delaySeconds * 1000);
      const scheduledOnAudioClock = ctx ? scheduleAudioBeep(ctx, now + delaySeconds, 880, 0.12, 0.28, true) : false;
      const timeoutId = window.setTimeout(() => {
        if (mutedRef.current || pausedRef.current) return;
        if (phaseRef.current === 'idle' || phaseRef.current === 'done') return;
        if (lastBeepedSecondRef.current !== remainingSecond) {
          lastBeepedSecondRef.current = remainingSecond;
          if (!scheduledOnAudioClock) beep(880, 0.12, 0.28);
        }
        scheduledBeepTimeoutsRef.current = scheduledBeepTimeoutsRef.current.filter(id => id !== timeoutId);
      }, delayMs);
      scheduledBeepTimeoutsRef.current.push(timeoutId);
    };

    scheduleSecond(3);
    scheduleSecond(2);
    scheduleSecond(1);
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
      clearScheduledBeeps();
      stopScheduledAudioNodes(false);
      try { audioCtxRef.current?.close(); } catch { /* noop */ }
      audioCtxRef.current = null;
    };
  }, []);

  // Unified Tick & Sync based on wall-clock time
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') {
      return;
    }
    
    const sync = () => {
      const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
      const remaining = Math.max(0, phaseTotalSeconds - elapsed);
      setSecondsLeft(remaining);
    };

    sync();
    const id = setInterval(sync, 200); // More frequent for smoother UI

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [paused, phase, phaseStartTime, phaseTotalSeconds]);

  // Screen Wake Lock: precisa ser solicitado dentro do gesto do usuário (start).
  const acquireWakeLock = async () => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      const s = await nav.wakeLock.request('screen');
      wakeLockRef.current = s;
      s.addEventListener('release', () => {
        if (wakeLockRef.current === s) wakeLockRef.current = null;
      });
    } catch { /* ignore */ }
  };

  const releaseWakeLock = () => {
    wakeLockDesiredRef.current = false;
    if (wakeLockRequestTimeoutRef.current !== null) {
      window.clearTimeout(wakeLockRequestTimeoutRef.current);
      wakeLockRequestTimeoutRef.current = null;
    }
    const s = wakeLockRef.current;
    wakeLockRef.current = null;
    if (s && !s.released) s.release().catch(() => {});
  };

  const requestWakeLockAfterAudioStarts = () => {
    // No iPhone, o Wake Lock nativo está silenciando o Web Audio.
    // Mantemos os beeps funcionando e deixamos o vídeo de fundo ajudar a tela a ficar ativa.
    if (isIOSAudioSafeMode) return;
    wakeLockDesiredRef.current = true;
    if (wakeLockRequestTimeoutRef.current !== null) {
      window.clearTimeout(wakeLockRequestTimeoutRef.current);
    }
    // No iPhone, pedir o Wake Lock no mesmo instante do desbloqueio de áudio
    // pode fazer o Web Audio silenciar. Primeiro armamos/tocamos os beeps,
    // depois mantemos a tela ligada.
    wakeLockRequestTimeoutRef.current = window.setTimeout(() => {
      wakeLockRequestTimeoutRef.current = null;
      if (wakeLockDesiredRef.current) void acquireWakeLock();
    }, 650);
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockDesiredRef.current && !wakeLockRef.current) {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      releaseWakeLock();
    };
  }, []);

  useEffect(() => {
    if (phase === 'done' || phase === 'idle') releaseWakeLock();
  }, [phase]);


  const startPhase = (newPhase: Phase, secs: number) => {
    const now = Date.now();
    phaseRef.current = newPhase;
    phaseStartTimeRef.current = now;
    phaseTotalSecondsRef.current = secs;
    setPhase(newPhase);
    setPhaseTotalSeconds(secs);
    setSecondsLeft(secs);
    setPhaseStartTime(now);
    scheduleCountdownFor(secs);
  };

  const transitionToNextPhase = (sourcePhase = phaseRef.current, sourceStepIndex = stepIndexRef.current) => {
    if (!steps.length || sourcePhase === 'idle' || sourcePhase === 'done') return;

    const step = steps[sourceStepIndex];
    if (!step) {
      beep(1320, 0.35, 0.3);
      startPhase('done', 0);
      return;
    }

    if (sourcePhase === 'prep') {
      beep(1320, 0.35, 0.3);
      startPhase('work', step.exercise.workSeconds);
      return;
    }

    if (sourcePhase === 'work') {
      const isLastInBlock = step.exerciseIndex === step.block.exercises.length - 1;
      const isLastStep = sourceStepIndex === totalSteps - 1;

      if (isLastStep) {
        beep(1320, 0.35, 0.3);
        startPhase('done', 0);
        return;
      }

      if (isLastInBlock) {
        beep(1320, 0.35, 0.3);
        startPhase('block_rest', step.block.restAfterBlock);
      } else {
        beep(1320, 0.35, 0.3);
        startPhase('rest', step.exercise.restSeconds);
      }
      return;
    }

    if (sourcePhase === 'rest' || sourcePhase === 'block_rest') {
      const nextIndex = sourceStepIndex + 1;
      const next = steps[nextIndex];
      if (!next) {
        beep(1320, 0.35, 0.3);
        startPhase('done', 0);
        return;
      }
      beep(1320, 0.35, 0.3);
      stepIndexRef.current = nextIndex;
      setStepIndex(nextIndex);
      startPhase('work', next.exercise.workSeconds);
    }
  };

  // Phase transitions when seconds hit 0
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || secondsLeft > 0) return;
    if (phaseRef.current !== phase || stepIndexRef.current !== stepIndex) return;
    transitionToNextPhase(phase, stepIndex);
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown beeps are pre-scheduled via native timers at each phase start
  // (scheduleCountdownFor). Kept as a defensive fallback in case scheduling
  // fails or gets cleared unexpectedly.
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || paused) return;
    if (secondsLeft > 0 && secondsLeft <= 3) {
      if (lastBeepedSecondRef.current !== secondsLeft) {
        lastBeepedSecondRef.current = secondsLeft;
        beep(660, 0.15);
      }
    } else if (secondsLeft > 3) {
      lastBeepedSecondRef.current = -1;
    }
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari/iOS unlock: must be called synchronously inside a user gesture.
  // Igual ao descanso da musculação: cria/resume Web Audio no toque do usuário.
  const unlockAudio = (forceSound = false) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      primeAudioContext(ctx);
      audioUnlockedRef.current = true;
      if (forceSound && !mutedRef.current) {
        scheduleAudioBeep(ctx, ctx.currentTime + 0.02, 880, 0.16, 0.35, false);
      }
    } catch {
      /* ignore */
    }
  };

  const armAudioFromGesture = () => {
    unlockAudio(false);
  };

  const start = () => {
    if (!steps.length) return;
    if (phaseRef.current !== 'idle') return;
    // No iOS, criar o AudioContext exatamente no clique evita o contexto ficar
    // preso/suspenso por eventos anteriores como pointerdown/touchstart.
    unlockAudio(true);
    const now = Date.now();
    phaseRef.current = 'prep';
    stepIndexRef.current = 0;
    pausedRef.current = false;
    phaseStartTimeRef.current = now;
    phaseTotalSecondsRef.current = PREP_SECONDS;
    setStepIndex(0);
    setPhase('prep');
    setPhaseTotalSeconds(PREP_SECONDS);
    setSecondsLeft(PREP_SECONDS);
    setPhaseStartTime(now);
    setPaused(false);
    scheduleCountdownFor(PREP_SECONDS);
    requestWakeLockAfterAudioStarts();
  };

  const skip = () => {
    unlockAudio();
    clearScheduledBeeps();
    transitionToNextPhase(phaseRef.current, stepIndexRef.current);
  };

  const restart = () => {
    clearScheduledBeeps();
    releaseWakeLock();
    phaseRef.current = 'idle';
    pausedRef.current = false;
    setPhase('idle');
    setStepIndex(0);
    setSecondsLeft(PREP_SECONDS);
    setPhaseTotalSeconds(PREP_SECONDS);
    setPhaseStartTime(Date.now());
    setPaused(false);
  };

  const togglePause = () => {
    unlockAudio();
    setPaused(p => {
      const next = !p;
      pausedRef.current = next;
      if (next) {
        clearScheduledBeeps();
      } else {
        // On resume, reschedule countdown based on remaining time.
        const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
        const remaining = Math.max(0, phaseTotalSeconds - elapsed);
        scheduleCountdownFor(remaining);
      }
      return next;
    });
  };

  const toggleMute = () => {
    const willUnmute = muted;
    mutedRef.current = !muted;
    setMuted(!muted);
    if (willUnmute) {
      unlockAudio(true);
      if (!paused && phase !== 'idle' && phase !== 'done') {
        const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
        const remaining = Math.max(0, phaseTotalSeconds - elapsed);
        scheduleCountdownFor(remaining);
      }
    } else {
      clearScheduledBeeps();
    }
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
    rest: 'DESCANSE!',
    block_rest: 'DESCANSO DO BLOCO',
    done: 'CONCLUÍDO!',
  }[phase];

  const phraseColorClass =
    phase === 'work' ? 'text-red-400'
    : phase === 'rest' ? 'text-emerald-300'
    : phase === 'block_rest' ? 'text-sky-300'
    : phase === 'prep' ? 'text-amber-300'
    : 'text-primary';

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
              key={hlsUrl}
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover animate-fade-in"
              muted
              playsInline
              loop
              autoPlay
              preload="auto"
            />
          ) : fallbackImage ? (
            <img
              key={fallbackImage}
              src={fallbackImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover animate-fade-in"
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
        <Button variant="ghost" size="icon" onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={toggleMute}>
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
        {phase !== 'idle' && phase !== 'done' && (
          <div
            key={`phrase-${phase}-${phraseKey}`}
            className="mb-4 sm:mb-6 animate-phrase-zoom"
          >
            <p
              className={cn(
                'font-black uppercase tracking-[0.05em] leading-none',
                'text-4xl sm:text-6xl md:text-7xl',
                'bg-clip-text text-transparent bg-[linear-gradient(110deg,currentColor_25%,rgba(255,255,255,0.95)_45%,currentColor_65%)] bg-[length:200%_100%] animate-shine',
                phraseColorClass,
              )}
              style={{
                textShadow: '0 4px 24px rgba(0,0,0,0.55), 0 0 40px currentColor',
                WebkitTextStroke: '1px rgba(0,0,0,0.15)',
              }}
            >
              {phrase}
            </p>
          </div>
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
                    ? '0 3px 14px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.7), 0 0 25px currentColor'
                    : '0 3px 16px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.65), 0 0 24px rgba(0,0,0,0.5)',
                ...(secondsLeft > 0 && secondsLeft <= 3
                  ? { WebkitTextStroke: '2px currentColor' }
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
              <div className="mt-6 flex items-center gap-4 bg-card/85 backdrop-blur-md border-2 border-primary/40 rounded-3xl p-5 pr-7 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] max-w-md w-[92%] animate-fade-in">
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-muted overflow-hidden shrink-0 ring-2 ring-primary/50">
                  {nextMedia?.imageUrl ? (
                    <img src={nextMedia.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-primary font-black text-3xl">→</div>
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-widest text-primary font-black">A seguir</p>
                  <p className="text-lg sm:text-xl font-black leading-tight line-clamp-2 mt-1">
                    {nextStep.exercise.name.replace(/\*+/g, '').trim()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5 font-semibold">
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
            onPointerDown={armAudioFromGesture}
            onTouchStart={armAudioFromGesture}
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
              onPointerDown={armAudioFromGesture}
              onTouchStart={armAudioFromGesture}
              onClick={restart}
              aria-label="Reiniciar"
              className="h-14 w-14 rounded-full backdrop-blur-md bg-background/40 border border-border/40 hover:bg-background/60 active:scale-90 transition-all"
            >
              <RotateCcw className="!h-5 !w-5" />
            </Button>
            <Button
              size="icon"
              onPointerDown={armAudioFromGesture}
              onTouchStart={armAudioFromGesture}
              onClick={togglePause}
              aria-label={paused ? 'Retomar' : 'Pausar'}
              className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_10px_40px_-4px_hsl(var(--primary)/0.7)] hover:shadow-[0_14px_48px_-4px_hsl(var(--primary)/0.9)] hover:scale-105 active:scale-95 transition-all border-2 border-primary-foreground/10"
            >
              {paused ? <Play className="!h-8 !w-8 fill-current ml-1" /> : <Pause className="!h-8 !w-8 fill-current" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onPointerDown={armAudioFromGesture}
              onTouchStart={armAudioFromGesture}
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
