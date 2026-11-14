import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  X, Play, Pause, SkipForward, RotateCcw, Volume2, VolumeX, Share2, Check, Flame, Droplets, Square, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedTabata } from '@/lib/tabataParser';
import { TabataSummaryShare } from '@/components/tabata/TabataSummaryShare';
import {
  tabataPlayerSteps, resolveWarmupBlock, warmupTotalSeconds, formatWarmupClock, type TabataPlayerStep,
} from '@/lib/tabataProgression';
import {
  PREP_SECONDS, blockIntensities, clock, elapsedSeconds, estimateKcal, headerStepIndex, intensityChipText,
  intensityTone, pauseAfter, phaseTone, progressSegments, roundLabel, sessionCounts, stepIntensity,
  toneColor, totalSeconds, transitionChip, workPhrase, REST_CHIP,
  type PlayerPhase,
} from '@/lib/tabataPlayerView';
import {
  COUNTDOWN_VOICE_AT, countdownMode, createCuePlanner, momentCandidates, pickVariation, voiceBank,
  type PhaseCue, type TabataMoment,
} from '@/lib/tabataVoiceCues';
import { createTabataVoice, type TabataVoice } from '@/lib/tabataVoicePlayer';
import { saveTabataSession } from '@/lib/tabataSessionApi';
import {
  PhaseChip, RoundDots, RpePicker, SegmentedProgress, TimerRing,
} from '@/components/tabata/player/TabataPlayerParts';
import logoMarombiew from '@/assets/logo_marombiew.png';

type Phase = PlayerPhase;
type Step = TabataPlayerStep;

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
const hlsUrlFor = (embed: string | null | undefined) => {
  const id = extractStreamVideoId(embed);
  return id ? `https://customer-vqfal80lir76xyf0.cloudflarestream.com/${id}/manifest/video.m3u8` : null;
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

const cleanName = (s: string | undefined) => (s || '').replace(/\*+/g, '').trim();
const cleanObs = (s: string | undefined) => {
  const t = cleanName(s);
  return t && t !== '...' && t !== '-' ? t : '';
};

/** Exercícios do bloco sem repetir (A-B-C-D). */
const uniqueExercises = (block: Step['block']) => {
  const seen = new Set<string>();
  return block.exercises.filter(ex => {
    const k = normalizeName(ex.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const TabataExecucao: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state as any) || {};
  const tabata = navState.tabata as ParsedTabata | undefined;
  const planId = (navState.planId as string | undefined) ?? null;
  const isPreview = navState.preview === true;

  const [phase, setPhase] = useState<Phase>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PREP_SECONDS);
  const [fraction, setFraction] = useState(1);
  const [phaseStartTime, setPhaseStartTime] = useState<number>(Date.now());
  const [phaseTotalSeconds, setPhaseTotalSeconds] = useState<number>(PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaMap, setMediaMap] = useState<Record<string, { videoEmbed?: string | null; imageUrl?: string | null }>>({});
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null);
  const [sessionDurationSec, setSessionDurationSec] = useState<number>(0);
  const [showShare, setShowShare] = useState(false);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [endedEarly, setEndedEarly] = useState(false);
  /** Onde o roteiro parou ao encerrar antes do fim (topo do resumo). */
  const [endElapsed, setEndElapsed] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const htmlBeepsRef = useRef<Record<string, HTMLAudioElement[]>>({});
  const htmlBeepCursorRef = useRef<Record<string, number>>({});
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
  const pausedAtRef = useRef<number | null>(null);
  const totalPauseMsRef = useRef(0);
  const doneStepsRef = useRef<Set<number>>(new Set());
  /** Sobe a cada fase nova: cada fala toca uma vez por fase. */
  const phaseSeqRef = useRef(0);
  const firedCuesRef = useRef<Set<string>>(new Set());
  /** true = a contagem gravada cobre a contagem desta fase (sem bipes). */
  const voiceCountdownRef = useRef(false);
  /** true = tocou o "3, 2, 1…" separado: a largada sorteada toca quando o exercício começar. */
  const splitCountdownRef = useRef(false);
  const voiceRef = useRef<TabataVoice | null>(null);
  /** Sorteia o que é falado em cada fase (descanso/respira espaçados). */
  const cuePlannerRef = useRef(createCuePlanner());
  const phaseCuesRef = useRef<PhaseCue[]>([]);
  /** Última fala de cada momento, para não repetir a mesma duas vezes seguidas. */
  const lastVoiceRef = useRef<Partial<Record<TabataMoment, string>>>({});

  useEffect(() => {
    phaseRef.current = phase;
    stepIndexRef.current = stepIndex;
    pausedRef.current = paused;
    mutedRef.current = muted;
    phaseStartTimeRef.current = phaseStartTime;
    phaseTotalSecondsRef.current = phaseTotalSeconds;
  }, [phase, stepIndex, paused, muted, phaseStartTime, phaseTotalSeconds]);

  // Voz do Fabiew: baixa só as falas do TABATA (aprovadas na tela de voz).
  useEffect(() => {
    try {
      const v = createTabataVoice();
      voiceRef.current = v;
      void v.preload().catch(() => { /* sem voz: bipes */ });
    } catch { voiceRef.current = null; }
    return () => { voiceRef.current?.stop(); };
  }, []);

  // Freeze the total session duration once TABATA is done
  useEffect(() => {
    if (phase === 'done' && sessionStartMs) {
      const pausedMs = totalPauseMsRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
      setSessionDurationSec(Math.max(1, Math.round((Date.now() - sessionStartMs - pausedMs) / 1000)));
    }
  }, [phase, sessionStartMs]);

  const steps: Step[] = useMemo(() => tabataPlayerSteps(tabata), [tabata]);
  const warmupBlock = useMemo(() => (tabata ? resolveWarmupBlock(tabata) : null), [tabata]);
  const levels = useMemo(() => blockIntensities(tabata), [tabata]);
  const planTotal = useMemo(() => totalSeconds(steps), [steps]);

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

  // Descanso e transição já carregam (e tocam) o vídeo do próximo exercício.
  const displayStep = isResting && nextStep ? nextStep : currentStep;
  const displayMedia = useMemo(
    () => displayStep ? findMedia(displayStep.exercise.name) : null,
    [displayStep, findMedia]
  );

  const hlsUrl = hlsUrlFor(displayMedia?.videoEmbed);
  const fallbackImage = displayMedia?.imageUrl || null;
  const showVideoArea = phase === 'prep' || phase === 'work' || phase === 'rest' || phase === 'block_rest';

  // Foto do exercício seguinte em cache, para nunca abrir tela preta.
  useEffect(() => {
    const upcoming = steps[stepIndex + 1] ?? null;
    const img = upcoming ? findMedia(upcoming.exercise.name)?.imageUrl : null;
    if (img && typeof Image !== 'undefined') { const i = new Image(); i.src = img; }
  }, [stepIndex, steps, findMedia]);

  useEffect(() => { setVideoReady(false); }, [hlsUrl]);

  // Mount HLS video when applicable
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideoArea || !hlsUrl) return;

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
    const onPlaying = () => setVideoReady(true);
    video.addEventListener('loadedmetadata', disableAudioTracks);
    video.addEventListener('playing', onPlaying);

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
        video.removeEventListener('playing', onPlaying);
      };
    }

    if (Hls.isSupported()) {
      // Começa na qualidade mais leve: o vídeo aparece rápido e sobe a qualidade depois.
      const hls = new Hls({ autoStartLoad: true, startLevel: 0, enableWorker: true, lowLatencyMode: false, maxBufferLength: 10 });
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
        video.removeEventListener('playing', onPlaying);
        hls.destroy();
        hlsRef.current = null;
      };
    }
    return () => { video.removeEventListener('playing', onPlaying); };
  }, [hlsUrl, showVideoArea]);

  // Pausado: o vídeo para junto.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else v.play().catch(() => {});
  }, [paused]);

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

  const createBeepDataUri = (frequency: number, durationSec: number, volume = 0.32) => {
    const sampleRate = 44100;
    const samples = Math.max(1, Math.floor(sampleRate * durationSec));
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const fadeIn = Math.min(1, i / Math.max(1, sampleRate * 0.01));
      const fadeOut = Math.min(1, (samples - i) / Math.max(1, sampleRate * 0.035));
      const envelope = Math.min(fadeIn, fadeOut);
      const sample = Math.sin(2 * Math.PI * frequency * t) * volume * envelope;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
    }

    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:audio/wav;base64,${window.btoa(binary)}`;
  };

  const ensureHtmlBeeps = () => {
    if (typeof window === 'undefined') return;
    if (htmlBeepsRef.current.countdown?.length && htmlBeepsRef.current.transition?.length) return;
    try {
      const countdownSrc = createBeepDataUri(880, 0.14, 0.34);
      const transitionSrc = createBeepDataUri(1320, 0.36, 0.36);
      htmlBeepsRef.current = {
        countdown: Array.from({ length: 4 }, () => {
          const audio = new Audio(countdownSrc);
          audio.preload = 'auto';
          audio.setAttribute('playsinline', '');
          return audio;
        }),
        transition: Array.from({ length: 3 }, () => {
          const audio = new Audio(transitionSrc);
          audio.preload = 'auto';
          audio.setAttribute('playsinline', '');
          return audio;
        }),
      };
      htmlBeepCursorRef.current = { countdown: 0, transition: 0 };
    } catch { /* sem <audio> */ }
  };

  const unlockHtmlBeeps = () => {
    ensureHtmlBeeps();
    Object.values(htmlBeepsRef.current).flat().forEach(audio => {
      try {
        audio.muted = true;
        audio.currentTime = 0;
        const promise = audio.play();
        if (promise) {
          promise.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          }).catch(() => {
            audio.muted = false;
          });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }
      } catch {
        audio.muted = false;
      }
    });
  };

  const playHtmlBeep = (kind: 'countdown' | 'transition') => {
    if (mutedRef.current) return false;
    ensureHtmlBeeps();
    const pool = htmlBeepsRef.current[kind];
    if (!pool?.length) return false;
    const cursor = htmlBeepCursorRef.current[kind] ?? 0;
    const audio = pool[cursor % pool.length];
    htmlBeepCursorRef.current[kind] = cursor + 1;
    try {
      audio.pause();
      audio.muted = false;
      audio.volume = kind === 'transition' ? 0.95 : 0.9;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* Web Audio fallback still runs */ });
      return true;
    } catch {
      return false;
    }
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

  const beep = (frequency: number, duration: number, volume = 0.25, kind: 'countdown' | 'transition' = frequency >= 1000 ? 'transition' : 'countdown') => {
    if (mutedRef.current) return;
    playHtmlBeep(kind);
    const ctx = getAudioContext();
    if (!ctx) return;
    scheduleAudioBeep(ctx, ctx.currentTime + 0.01, frequency, duration, volume, false);
  };

  const clearScheduledBeeps = () => {
    scheduledBeepTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    scheduledBeepTimeoutsRef.current = [];
    stopScheduledAudioNodes();
  };

  const currentBank = () => voiceBank(voiceRef.current?.readyKeys() ?? []);
  const voiceCoversCountdown = (forPhase: Phase, seconds: number) =>
    !mutedRef.current
    && (forPhase === 'prep' || forPhase === 'rest' || forPhase === 'block_rest')
    && seconds >= COUNTDOWN_VOICE_AT
    && phaseCuesRef.current.some(c => c.moment === 'contagem')
    && countdownMode(currentBank()) !== 'beep';

  // Pré-agenda o 3-2-1 do mesmo jeito do descanso da musculação, direto no
  // relógio do Web Audio, com timer JS apenas como fallback visual/operacional.
  // Antes de um exercício, o "3, 2, 1… bora!" gravado substitui os bipes.
  const scheduleCountdownFor = (seconds: number, forPhase: Phase = phaseRef.current) => {
    clearScheduledBeeps();
    lastBeepedSecondRef.current = -1;
    voiceCountdownRef.current = voiceCoversCountdown(forPhase, seconds);
    if (mutedRef.current || seconds <= 0 || voiceCountdownRef.current) return;
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
          playHtmlBeep('countdown');
          if (!scheduledOnAudioClock) beep(880, 0.12, 0.28, 'countdown');
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified Tick & Sync based on wall-clock time
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') {
      return;
    }

    const sync = () => {
      const elapsedMs = Math.max(0, Date.now() - phaseStartTime);
      const elapsed = Math.floor(elapsedMs / 1000);
      const remaining = Math.max(0, phaseTotalSeconds - elapsed);
      setSecondsLeft(remaining);
      setFraction(phaseTotalSeconds > 0 ? Math.max(0, 1 - elapsedMs / (phaseTotalSeconds * 1000)) : 0);
    };

    sync();
    const id = setInterval(sync, 200);

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

  const startPhase = (newPhase: Phase, secs: number) => {
    const now = Date.now();
    phaseRef.current = newPhase;
    phaseStartTimeRef.current = now;
    phaseTotalSecondsRef.current = secs;
    phaseSeqRef.current += 1;
    phaseCuesRef.current = cuePlannerRef.current.plan(newPhase, secs);
    if (newPhase !== 'work') splitCountdownRef.current = false;
    setPhase(newPhase);
    setPhaseTotalSeconds(secs);
    setSecondsLeft(secs);
    setFraction(1);
    setPhaseStartTime(now);
    scheduleCountdownFor(secs, newPhase);
  };

  const markDone = (i: number) => {
    if (doneStepsRef.current.has(i)) return;
    doneStepsRef.current.add(i);
    setDoneSteps([...doneStepsRef.current]);
  };

  const finish = (early = false) => {
    if (early) {
      const left = Math.max(0, phaseTotalSecondsRef.current - Math.floor((Date.now() - phaseStartTimeRef.current) / 1000));
      setEndElapsed(elapsedSeconds(steps, phaseRef.current, stepIndexRef.current, pausedRef.current ? secondsLeft : left));
    } else {
      setEndElapsed(null);
    }
    clearScheduledBeeps();
    voiceRef.current?.stop();
    if (pausedAtRef.current) {
      totalPauseMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    pausedRef.current = false;
    setPaused(false);
    setEndedEarly(early);
    startPhase('done', 0);
  };

  const transitionToNextPhase = (sourcePhase = phaseRef.current, sourceStepIndex = stepIndexRef.current) => {
    if (!steps.length || sourcePhase === 'idle' || sourcePhase === 'done') return;

    const step = steps[sourceStepIndex];
    if (!step) {
      beep(1320, 0.35, 0.3, 'transition');
      finish();
      return;
    }

    if (sourcePhase === 'prep') {
      beep(1320, 0.35, 0.3, 'transition');
      startPhase('work', step.exercise.workSeconds);
      return;
    }

    if (sourcePhase === 'work') {
      markDone(sourceStepIndex);
      const isLastInBlock = step.exerciseIndex === step.block.exercises.length - 1;
      const isLastStep = sourceStepIndex === totalSteps - 1;

      if (isLastStep) {
        beep(1320, 0.35, 0.3, 'transition');
        finish();
        return;
      }

      const pause = pauseAfter(steps, sourceStepIndex);
      if (pause <= 0) {
        // Sem pausa (ex.: aquecimento antigo, 1 min seguido): vai direto ao próximo exercício.
        transitionToNextPhase('rest', sourceStepIndex);
        return;
      }
      beep(1320, 0.35, 0.3, 'transition');
      startPhase(isLastInBlock ? 'block_rest' : 'rest', pause);
      return;
    }

    if (sourcePhase === 'rest' || sourcePhase === 'block_rest') {
      const nextIndex = sourceStepIndex + 1;
      const next = steps[nextIndex];
      if (!next) {
        beep(1320, 0.35, 0.3, 'transition');
        finish();
        return;
      }
      beep(1320, 0.35, 0.3, 'transition');
      stepIndexRef.current = nextIndex;
      setStepIndex(nextIndex);
      startPhase('work', next.exercise.workSeconds);
    }
  };

  // Phase transitions when seconds hit 0
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || secondsLeft > 0 || paused) return;
    if (phaseRef.current !== phase || stepIndexRef.current !== stepIndex) return;
    transitionToNextPhase(phase, stepIndex);
  }, [secondsLeft, phase, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Bipes 3-2-1 a partir de agora (o áudio gravado não tocou). */
  const fallbackCountdownBeeps = (fromSecond: number) => {
    voiceCountdownRef.current = false;
    const seq = phaseSeqRef.current;
    for (let s = Math.min(3, fromSecond); s >= 1; s--) {
      const delay = (Math.min(3, fromSecond) - s) * 1000;
      const id = window.setTimeout(() => {
        if (seq !== phaseSeqRef.current || pausedRef.current || mutedRef.current) return;
        if (lastBeepedSecondRef.current === s) return;
        lastBeepedSecondRef.current = s;
        beep(880, 0.12, 0.28, 'countdown');
      }, delay);
      scheduledBeepTimeoutsRef.current.push(id);
    }
  };

  // Falas do Fabiew nos momentos sorteados da fase (uma vez cada); som desligado = nada.
  // Nunca sobrepõe: com uma fala tocando, a próxima é pulada (a contagem cai no bipe).
  useEffect(() => {
    if (paused || mutedRef.current) return;
    const cue = phaseCuesRef.current.find(c => c.at === secondsLeft);
    if (!cue) return;
    const id = `${phaseSeqRef.current}:${cue.moment}`;
    if (firedCuesRef.current.has(id)) return;
    firedCuesRef.current.add(id);
    const voice = voiceRef.current;
    const bank = currentBank();
    const isCountdown = cue.moment === 'contagem';
    if (cue.moment === 'largada' && !splitCountdownRef.current) return;
    const from = stepIntensity(steps[stepIndexRef.current], levels);
    const to = stepIntensity(steps[stepIndexRef.current + 1], levels);
    const key = pickVariation(momentCandidates(bank, cue.moment, { from, to }), lastVoiceRef.current[cue.moment]);
    if (!voice || !key) {
      if (isCountdown && voiceCountdownRef.current) fallbackCountdownBeeps(secondsLeft);
      return;
    }
    if (isCountdown && voice.busy()) { fallbackCountdownBeeps(secondsLeft); return; }
    lastVoiceRef.current[cue.moment] = key;
    if (isCountdown) splitCountdownRef.current = countdownMode(bank) === 'split';
    if (cue.moment === 'largada') splitCountdownRef.current = false;
    const job = cue.moment === 'largada' ? voice.playNext(key, 1200) : voice.play(key);
    const seq = phaseSeqRef.current;
    job.catch(() => {
      if (isCountdown && seq === phaseSeqRef.current) {
        splitCountdownRef.current = false;
        fallbackCountdownBeeps(Math.max(1, secondsLeft - 1));
      }
    });
  }, [secondsLeft, phase, paused, phaseTotalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown beeps are pre-scheduled via native timers at each phase start
  // (scheduleCountdownFor). Kept as a defensive fallback in case scheduling
  // fails or gets cleared unexpectedly.
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || paused || voiceCountdownRef.current) return;
    if (secondsLeft > 0 && secondsLeft <= 3) {
      if (lastBeepedSecondRef.current !== secondsLeft) {
        lastBeepedSecondRef.current = secondsLeft;
        beep(660, 0.15, 0.25, 'countdown');
      }
    } else if (secondsLeft > 3) {
      lastBeepedSecondRef.current = -1;
    }
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari/iOS unlock: must be called synchronously inside a user gesture.
  const unlockAudio = (forceSound = false) => {
    try { voiceRef.current?.unlock(); } catch { /* noop */ }
    try {
      unlockHtmlBeeps();
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      primeAudioContext(ctx);
      audioUnlockedRef.current = true;
      if (forceSound && !mutedRef.current) {
        playHtmlBeep('countdown');
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
    unlockAudio(false);
    const now = Date.now();
    setSessionStartMs(now);
    setSessionDurationSec(0);
    doneStepsRef.current = new Set();
    setDoneSteps([]);
    totalPauseMsRef.current = 0;
    pausedAtRef.current = null;
    setEndedEarly(false);
    setEndElapsed(null);
    setRpe(null);
    setSaved(false);
    stepIndexRef.current = 0;
    pausedRef.current = false;
    setStepIndex(0);
    setPaused(false);
    startPhase('prep', PREP_SECONDS);
  };

  const skip = () => {
    unlockAudio();
    clearScheduledBeeps();
    voiceRef.current?.stop();
    if (pausedRef.current) resume();
    transitionToNextPhase(phaseRef.current, stepIndexRef.current);
  };

  /** Recomeça a rodada (ou o descanso) atual do zero. */
  const restartRound = () => {
    unlockAudio();
    voiceRef.current?.stop();
    if (pausedAtRef.current) {
      totalPauseMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    pausedRef.current = false;
    setPaused(false);
    const p = phaseRef.current;
    if (p === 'idle' || p === 'done') return;
    startPhase(p, phaseTotalSecondsRef.current);
  };

  const restartAll = () => {
    clearScheduledBeeps();
    voiceRef.current?.stop();
    phaseRef.current = 'idle';
    pausedRef.current = false;
    setPhase('idle');
    setStepIndex(0);
    setSecondsLeft(PREP_SECONDS);
    setPhaseTotalSeconds(PREP_SECONDS);
    setPhaseStartTime(Date.now());
    setPaused(false);
    setSessionStartMs(null);
    setSessionDurationSec(0);
    setShowShare(false);
  };

  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    pausedAtRef.current = Date.now();
    clearScheduledBeeps();
    voiceRef.current?.stop();
    setPaused(true);
  };

  /** Retoma de onde parou: o relógio da fase anda o tempo da pausa para frente. */
  function resume() {
    if (!pausedRef.current) return;
    const pausedFor = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
    totalPauseMsRef.current += pausedFor;
    pausedAtRef.current = null;
    const startAt = phaseStartTimeRef.current + pausedFor;
    phaseStartTimeRef.current = startAt;
    pausedRef.current = false;
    setPhaseStartTime(startAt);
    setPaused(false);
    const remaining = Math.max(0, phaseTotalSecondsRef.current - Math.floor((Date.now() - startAt) / 1000));
    scheduleCountdownFor(remaining, phaseRef.current);
  }

  const togglePause = () => {
    unlockAudio();
    if (pausedRef.current) resume(); else pause();
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
        scheduleCountdownFor(remaining, phase);
      }
    } else {
      clearScheduledBeeps();
      voiceRef.current?.stop();
    }
  };

  const counts = useMemo(() => sessionCounts(steps, doneSteps), [steps, doneSteps]);
  const kcal = useMemo(() => estimateKcal(steps, doneSteps, levels, sessionDurationSec), [steps, doneSteps, levels, sessionDurationSec]);

  const handleSave = useCallback(async () => {
    if (!tabata || !rpe || saving || saved) return;
    setSaving(true);
    try {
      await saveTabataSession({
        planId,
        name: tabata.title || 'TABATA',
        startedAt: new Date(sessionStartMs ?? Date.now()),
        durationSeconds: sessionDurationSec,
        pauseMs: totalPauseMsRef.current,
        rounds: counts.rounds,
        totalRounds: counts.totalRounds,
        blocks: counts.blocks,
        totalBlocks: counts.totalBlocks,
        kcal,
        rpe,
        endedEarly,
      });
      setSaved(true);
      toast.success('Enviado ao Fabiew!');
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }, [tabata, rpe, saving, saved, planId, sessionStartMs, sessionDurationSec, counts, kcal, endedEarly]);

  if (!tabata) {
    return (
      <div className="fixed inset-0 bg-tabata-bg flex flex-col items-center justify-center p-4">
        <p className="text-tabata-soft mb-4">Nenhum TABATA carregado.</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const running = phase !== 'idle' && phase !== 'done';
  const headerStep = steps[headerStepIndex(phase, stepIndex, totalSteps)];
  const tone = phaseTone(phase, steps, stepIndex, levels);
  const elapsed = phase === 'done' && endElapsed != null ? endElapsed : elapsedSeconds(steps, phase, stepIndex, secondsLeft);
  const segments = progressSegments(steps, levels, elapsed);
  const level = stepIntensity(currentStep, levels);
  const nextLevel = stepIntensity(nextStep ?? undefined, levels);
  const mainBlocks = tabata.blocks;
  const warmupSec = warmupBlock ? warmupTotalSeconds(warmupBlock) : 0;
  const warmupMinutes = warmupSec % 60 === 0 ? String(warmupSec / 60) : formatWarmupClock(warmupSec);
  const exercisesPerBlock = mainBlocks.length ? uniqueExercises(mainBlocks[0]).length : 0;

  // ───────── Peças da tela ─────────

  const header = (
    <header className="shrink-0 px-3 pt-2 pb-2 space-y-2" style={{ background: 'hsl(var(--tabata-bg))' }}>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => navigate(-1)} className="h-10 w-10 rounded-full text-foreground hover:bg-tabata-panel hover:text-foreground">
          <X className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          {running && headerStep ? (
            <p className="text-sm font-black tracking-wide truncate" data-testid="tabata-player-block" style={{ color: toneColor(tone) }}>
              {roundLabel(headerStep)}
            </p>
          ) : (
            <p className="text-[11px] uppercase tracking-widest text-tabata-soft truncate">{tabata.title}</p>
          )}
        </div>
        <Button
          variant="ghost" size="icon" aria-label={muted ? 'Ligar som' : 'Desligar som'}
          onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={toggleMute}
          className="h-10 w-10 rounded-full text-foreground hover:bg-tabata-panel hover:text-foreground"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
      </div>
      <SegmentedProgress segments={segments} />
      <div className="flex items-center justify-between text-[11px] tabular-nums text-tabata-soft" data-testid="tabata-total-time">
        <span>Total <span className="font-bold text-foreground">{clock(elapsed)}</span> / {clock(planTotal)}</span>
        <span>Faltam <span className="font-bold text-foreground">{clock(planTotal - elapsed)}</span></span>
      </div>
    </header>
  );

  const videoArea = (
    <div className="relative shrink-0 overflow-hidden" style={{ height: '44dvh', background: 'hsl(var(--tabata-panel))' }} data-testid="tabata-video-area">
      {fallbackImage && (
        <img key={fallbackImage} src={fallbackImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {!fallbackImage && !hlsUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Flame className="h-16 w-16" style={{ color: toneColor(tone, 0.5) }} />
        </div>
      )}
      {hlsUrl && (
        <video
          key={hlsUrl}
          ref={videoRef}
          poster={fallbackImage || undefined}
          className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', videoReady ? 'opacity-100' : 'opacity-0')}
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
        />
      )}
      {hlsUrl && !videoReady && !fallbackImage && (
        <Loader2 className="absolute left-1/2 top-1/2 -ml-4 -mt-4 h-8 w-8 animate-spin text-tabata-soft" />
      )}
      {phase === 'rest' && (
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${toneColor('rest', 0.12)}, ${toneColor('rest', 0.32)})` }} />
      )}
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(to top, hsl(var(--tabata-panel)), transparent)' }} />
    </div>
  );

  const nameOf = (s: Step | null | undefined) => cleanName(s?.exercise.name).toUpperCase();

  const workPanel = currentStep && (
    <>
      <PhaseChip tone={tone} testId="tabata-player-intensity">
        {phase === 'prep' ? `Fique pronto · ${intensityChipText(level)}` : intensityChipText(level)}
      </PhaseChip>
      <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: toneColor(tone) }} data-testid="tabata-phrase">
        {phase === 'prep' ? 'TÁ PREPARADO?' : workPhrase(level, stepIndex)}
      </p>
      <TimerRing seconds={secondsLeft} fraction={fraction} tone={tone} size={124} />
      <div className="w-full text-center space-y-1">
        <h2 className="text-xl font-black leading-tight line-clamp-2" data-testid="tabata-exercise-name">{nameOf(currentStep)}</h2>
        {cleanObs(currentStep.exercise.observation) && (
          <p className="text-[13px] leading-snug text-tabata-soft line-clamp-2">{cleanObs(currentStep.exercise.observation)}</p>
        )}
      </div>
      <RoundDots total={currentStep.block.exercises.length} current={currentStep.exerciseIndex} tone={tone} includeCurrent={phase !== 'prep'} />
    </>
  );

  const restPanel = (
    <>
      <PhaseChip tone="rest" testId="tabata-player-intensity">{REST_CHIP}</PhaseChip>
      <TimerRing seconds={secondsLeft} fraction={fraction} tone="rest" size={112} caption="descanso" />
      {nextStep && (
        <div className="w-full flex items-center gap-3 rounded-2xl p-2.5" style={{ background: 'hsl(var(--tabata-bg))', boxShadow: 'inset 0 0 0 1px hsl(var(--tabata-border))' }} data-testid="tabata-next-card">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" style={{ background: 'hsl(var(--tabata-panel))' }}>
            {nextMedia?.imageUrl
              ? <img src={nextMedia.imageUrl} alt="" className="h-full w-full object-cover" />
              : <div className="h-full w-full flex items-center justify-center font-black" style={{ color: toneColor('rest') }}>→</div>}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: toneColor('rest') }}>
              A seguir · {nextStep.isWarmup ? `${nextStep.exerciseIndex + 1}/${nextStep.block.exercises.length}` : `Rodada ${nextStep.exerciseIndex + 1}/${nextStep.block.exercises.length}`}
            </p>
            <p className="text-sm font-black leading-tight truncate">{nameOf(nextStep)}</p>
            {cleanObs(nextStep.exercise.observation) && (
              <p className="text-[11px] text-tabata-soft truncate">{cleanObs(nextStep.exercise.observation)}</p>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] uppercase tracking-widest text-tabata-soft">Bipe nos últimos 3s</p>
    </>
  );

  const transitionOverlay = phase === 'block_rest' && currentStep && nextStep && (() => {
    const nextTone = intensityTone(nextLevel);
    const list = uniqueExercises(nextStep.block);
    const nb = nextStep.block;
    return (
      <div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-5 text-center animate-fade-in"
        style={{
          backgroundColor: 'hsl(var(--tabata-bg))',
          backgroundImage: `radial-gradient(circle at 50% 30%, ${toneColor(nextTone, 0.28)}, transparent 70%)`,
        }}
        data-testid="tabata-block-transition"
      >
        <p className="text-xs font-black uppercase tracking-[0.2em] text-tabata-soft">
          {currentStep.isWarmup ? 'Aquecimento concluído ✓' : `Bloco ${currentStep.blockNumber} concluído ✓`}
        </p>
        <h2 className="text-4xl font-black" style={{ color: toneColor(nextTone) }}>BLOCO {nextStep.blockNumber}</h2>
        <PhaseChip tone={nextTone}>{transitionChip(stepIntensity(currentStep, levels), nextLevel)}</PhaseChip>
        <TimerRing seconds={secondsLeft} fraction={fraction} tone={nextTone} size={116} testId="tabata-transition-ring" />
        <ol className="w-full max-w-xs space-y-1.5 text-left">
          {list.map((ex, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: 'hsl(var(--tabata-panel))', boxShadow: 'inset 0 0 0 1px hsl(var(--tabata-border))' }}>
              <span className="w-5 text-sm font-black" style={{ color: toneColor(nextTone) }}>{String.fromCharCode(65 + i)}</span>
              <span className="text-[13px] font-bold truncate">{nameOf({ exercise: ex } as Step)}</span>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-1.5 text-[11px] text-tabata-soft">
          {nb.exercises.length} rodadas · {nb.exercises[0]?.workSeconds ?? nb.workSeconds}s / {nb.exercises[0]?.restSeconds ?? nb.restSeconds}s · <Droplets className="h-3 w-3" /> bebe água
        </p>
      </div>
    );
  })();

  const pauseOverlay = paused && running && (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-6 text-center backdrop-blur-md" style={{ background: 'hsl(var(--tabata-bg) / 0.78)' }} data-testid="tabata-paused">
      <p className="text-xs font-black tracking-[0.2em]" style={{ color: toneColor(tone) }}>{roundLabel(headerStep)}</p>
      <h2 className="text-4xl font-black tracking-wide">PAUSADO</h2>
      <p className="text-sm text-tabata-soft">
        {phase === 'work'
          ? <>Faltam <span className="font-bold text-foreground">{secondsLeft}s</span> de {nameOf(currentStep)}</>
          : phase === 'prep'
            ? <>Faltam <span className="font-bold text-foreground">{secondsLeft}s</span> para começar</>
            : <>Faltam <span className="font-bold text-foreground">{secondsLeft}s</span> de descanso</>}
      </p>
      <div className="mt-2 w-full max-w-xs space-y-2">
        <Button onClick={togglePause} onPointerDown={armAudioFromGesture} className="h-12 w-full rounded-2xl font-black uppercase bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90">
          <Play className="h-5 w-5 fill-current" /> Continuar
        </Button>
        <Button variant="outline" onClick={restartRound} onPointerDown={armAudioFromGesture} className="h-11 w-full rounded-2xl font-bold border-tabata-border bg-tabata-panel">
          <RotateCcw className="h-4 w-4" /> Reiniciar rodada
        </Button>
        <Button variant="outline" onClick={() => finish(true)} className="h-11 w-full rounded-2xl font-bold border-destructive/50 bg-tabata-panel text-destructive hover:text-destructive">
          <Square className="h-4 w-4 fill-current" /> Encerrar treino
        </Button>
      </div>
    </div>
  );

  const idleContent = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-4 space-y-3" data-testid="tabata-pre-screen">
      <div className="text-center space-y-1 pt-2">
        <h1 className="text-2xl font-black leading-tight">{tabata.title}</h1>
        <p className="text-[12px] text-tabata-soft">
          {warmupBlock ? `Aquecimento ${warmupMinutes} min + ` : ''}{mainBlocks.length} bloco{mainBlocks.length === 1 ? '' : 's'}
          {exercisesPerBlock ? ` · ${exercisesPerBlock} exercícios cada` : ''}
        </p>
        <p className="text-[11px] text-tabata-soft">Total {clock(planTotal)}</p>
      </div>
      {[...(warmupBlock ? [warmupBlock] : []), ...mainBlocks].map((block, listIndex) => {
        const bi = warmupBlock ? listIndex - 1 : listIndex;
        const isWarm = bi < 0;
        const lv = isWarm ? 'leve' : levels[bi];
        const t = intensityTone(lv);
        const list = uniqueExercises(block);
        const work = list[0]?.workSeconds ?? block.workSeconds;
        const rest = list[0]?.restSeconds ?? block.restSeconds;
        return (
          <div key={listIndex} className="rounded-2xl p-3" style={{ background: 'hsl(var(--tabata-panel))', boxShadow: `inset 0 0 0 1px hsl(var(--tabata-border)), inset 3px 0 0 ${toneColor(t)}` }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: toneColor(t) }}>
                {isWarm ? 'Bloco 0 — Aquecimento' : `Bloco ${bi + 1}`}
              </p>
              <PhaseChip tone={t}>{intensityChipText(lv)}</PhaseChip>
            </div>
            <p className="mb-2 text-[11px] text-tabata-soft">
              {isWarm ? `${block.exercises.length} exercícios` : `${block.exercises.length} rodadas`} · {work}s / {rest > 0 ? `${rest}s` : 'sem pausa'}
            </p>
            <div className="space-y-1.5">
              {list.map((ex, ei) => {
                const img = findMedia(ex.name)?.imageUrl;
                return (
                  <div key={ei} className="flex items-center gap-2">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--tabata-bg))' }}>
                      {img ? <img src={img} alt="" className="h-full w-full object-cover" />
                        : <span className="text-[11px] font-black" style={{ color: toneColor(t) }}>{isWarm ? ei + 1 : String.fromCharCode(65 + ei)}</span>}
                    </div>
                    <p className="flex-1 text-[12px] font-semibold leading-tight">{cleanName(ex.name)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const statCard = (label: string, value: string) => (
    <div className="rounded-2xl p-3 text-center" style={{ background: 'hsl(var(--tabata-panel))', boxShadow: 'inset 0 0 0 1px hsl(var(--tabata-border))' }}>
      <p className="text-[10px] uppercase tracking-widest text-tabata-soft">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
    </div>
  );

  const doneContent = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4 space-y-4" data-testid="tabata-done">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-black">{endedEarly ? 'TABATA encerrado' : '🔥 TABATA concluído'}</h1>
        <p className="text-[12px] text-tabata-soft">{tabata.title}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {statCard('Tempo', clock(sessionDurationSec))}
        {statCard('Rodadas', `${counts.rounds}/${counts.totalRounds}`)}
        {statCard('Blocos', `${counts.blocks}/${counts.totalBlocks}`)}
        {statCard('kcal estimadas', `~${kcal}`)}
      </div>
      <div className="rounded-2xl p-3 space-y-2" style={{ background: 'hsl(var(--tabata-panel))', boxShadow: 'inset 0 0 0 1px hsl(var(--tabata-border))' }}>
        <p className="text-sm font-black text-center">Quão pesado foi?</p>
        <RpePicker value={rpe} onChange={setRpe} disabled={saved || saving} />
      </div>
      {isPreview && <p className="text-center text-[11px] text-tabata-soft">Pré-visualização: nada é salvo.</p>}
      <div className="flex justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowShare(true)} className="rounded-xl border-tabata-border bg-tabata-panel">
          <Share2 className="h-4 w-4" /> Compartilhar
        </Button>
        <Button variant="outline" size="sm" onClick={restartAll} className="rounded-xl border-tabata-border bg-tabata-panel">
          <RotateCcw className="h-4 w-4" /> Repetir
        </Button>
      </div>
    </div>
  );

  // Rodapé sempre com a mesma altura: botões nunca mudam de lugar entre as fases.
  const footer = (
    <footer className="shrink-0 h-24 px-6 flex items-center justify-center gap-6" style={{ background: 'hsl(var(--tabata-bg))' }}>
      {phase === 'idle' && (
        <Button
          size="lg" onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={start}
          className="h-14 w-full max-w-sm rounded-2xl text-lg font-black uppercase tracking-wider bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
        >
          <Play className="!h-6 !w-6 fill-current" /> Iniciar
        </Button>
      )}
      {phase === 'done' && (
        isPreview || saved ? (
          <Button size="lg" onClick={() => navigate(-1)} className="h-14 w-full max-w-sm rounded-2xl font-black uppercase bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90">
            {saved ? <><Check className="h-5 w-5" /> Enviado · Voltar</> : 'Voltar'}
          </Button>
        ) : (
          <Button
            size="lg" onClick={handleSave} disabled={!rpe || saving}
            className="h-14 w-full max-w-sm rounded-2xl font-black uppercase bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {rpe ? 'Salvar e enviar ao Fabiew' : 'Escolha o RPE para salvar'}
          </Button>
        )
      )}
      {running && (
        <>
          <Button
            variant="ghost" size="icon" aria-label="Reiniciar rodada"
            onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={restartRound}
            className="h-14 w-14 rounded-full border border-tabata-border bg-tabata-panel text-foreground hover:bg-tabata-panel hover:text-foreground active:scale-95"
          >
            <RotateCcw className="!h-5 !w-5" />
          </Button>
          <Button
            size="icon" aria-label={paused ? 'Retomar' : 'Pausar'}
            onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={togglePause}
            className="h-[72px] w-[72px] rounded-full bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
          >
            {paused ? <Play className="!h-8 !w-8 fill-current ml-1" /> : <Pause className="!h-8 !w-8 fill-current" />}
          </Button>
          <Button
            variant="ghost" size="icon" aria-label="Avançar"
            onPointerDown={armAudioFromGesture} onTouchStart={armAudioFromGesture} onClick={skip}
            className="h-14 w-14 rounded-full border border-tabata-border bg-tabata-panel text-foreground hover:bg-tabata-panel hover:text-foreground active:scale-95"
          >
            <SkipForward className="!h-6 !w-6 fill-current" />
          </Button>
        </>
      )}
    </footer>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-foreground"
      style={{
        background: 'hsl(var(--tabata-bg))',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col min-h-0">
        {header}
        {running ? (
          <div className="relative flex flex-1 min-h-0 flex-col">
            {videoArea}
            <section
              className="relative -mt-3 flex flex-1 min-h-0 flex-col items-center justify-evenly gap-1.5 rounded-t-3xl px-4 pt-3 pb-1 overflow-hidden"
              style={{ background: 'hsl(var(--tabata-panel))', boxShadow: 'inset 0 1px 0 hsl(var(--tabata-border))' }}
            >
              <img src={logoMarombiew} alt="Marombiew" className="absolute right-3 top-2 h-4 w-auto opacity-60" />
              {phase === 'rest' ? restPanel : workPanel}
            </section>
            {transitionOverlay}
            {pauseOverlay}
          </div>
        ) : phase === 'idle' ? idleContent : doneContent}
        {footer}
      </div>

      {showShare && (
        <TabataSummaryShare
          title={tabata.title || 'Treino TABATA'}
          durationSeconds={sessionDurationSec}
          blocksCount={tabata.blocks.length}
          exercises={steps.filter(s => !s.isWarmup).map((s) => {
            const media = findMedia(s.exercise.name);
            return { name: s.exercise.name, imageUrl: media?.imageUrl || null };
          })}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
};

export default TabataExecucao;
