import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  X, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, HeartPulse, Flag, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { calcKarvonenZones } from '@/components/KarvonenZones';
import {
  parseCardioProtocol, MODALITY_LABEL, STRUCTURE_LABEL, formatDurationFromSec,
  type CardioProtocol, type CardioBlock,
} from '@/lib/cardioParser';
import { mmss } from '@/lib/cardioIntervals';
import { toneColor, type PhaseTone } from '@/lib/tabataPlayerView';
import { PhaseChip } from '@/components/tabata/player/TabataPlayerParts';
import {
  CARDIO_PREP_SECONDS, NEXT_CARD_SECONDS, blockParams, blockTag, blockTone, cardioElapsed, cardioSegments,
  estimateCardioKcal, nextPhaseText, phaseCountLabel, phaseToneFor, totalBlocksSeconds,
  type CardioPhase,
} from '@/lib/cardioPlayerView';
import { createPlayerBeeper, type PlayerBeeper } from '@/lib/playerBeeper';
import {
  RESUME_COUNTDOWN_SECONDS, STALE_WARMUP_TEXT, activeSeconds, buildCardioSnapshot, cardioSnapshotLabel,
  cardioSnapshotMatches, clearLocalCardioSnapshot, isCardioSnapshot, readLocalCardioSnapshot, restoredPhaseStart,
  restoredSecondsLeft, resumeStatus, stoppedAgoText, writeLocalCardioSnapshot,
  type CardioSnapshot, type PauseReason,
} from '@/lib/cardioResume';
import {
  abandonCardioSession, closeOtherActiveCardio, discardActiveCardio, findActiveCardio, loadStudentWeightKg,
  saveCardioFinish, saveCardioProgress,
} from '@/lib/cardioSessionApi';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import CardioFinishScreen, { type CardioFinishValues } from '@/components/cardio/CardioFinishScreen';

type ResumeOffer = { snapshot: CardioSnapshot; stale: boolean; restore: boolean };

/** Anel grande da fase com o tempo restante (mm:ss) no centro. */
const CardioRing: React.FC<{ seconds: number; fraction: number; tone: PhaseTone; caption?: React.ReactNode }> = ({
  seconds, fraction, tone, caption,
}) => {
  const size = 236;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  const last3 = seconds > 0 && seconds <= 3;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="cardio-ring">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--tabata-border))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneColor(tone)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-black tabular-nums leading-none text-[64px]', last3 && 'animate-tabata-pulse')}
          style={{ color: toneColor(tone) }}
          data-testid="cardio-ring-time"
        >
          {mmss(seconds)}
        </span>
        {caption && <span className="mt-2 text-[11px] tabular-nums text-tabata-soft">{caption}</span>}
      </div>
    </div>
  );
};

const CardioExecucao: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const navState = (location.state as any) || {};
  const planId: string | null = navState.planId ?? null;
  const isPreview = navState.preview === true;
  /** Pré-visualização do admin: nada é salvo nem pausa ao sair. */
  const persistEnabled = !isPreview;
  const navResume = isCardioSnapshot(navState.resumeSnapshot) ? (navState.resumeSnapshot as CardioSnapshot) : null;

  const navProtocol = useMemo<CardioProtocol | null>(() => {
    const p = navState.protocol as CardioProtocol | undefined;
    if (p && Array.isArray(p.blocks) && p.blocks.length) return p;
    if (navState.conteudo) return parseCardioProtocol(navState.conteudo);
    if (navResume) return navResume.protocol;
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sem protocolo na navegação (ex.: abriu direto): retoma o que ficou salvo no aparelho. */
  const [localOffer] = useState<CardioSnapshot | null>(() => (!navProtocol && persistEnabled ? readLocalCardioSnapshot(null) : null));
  const [protocolOverride, setProtocolOverride] = useState<CardioProtocol | null>(localOffer?.protocol ?? null);
  const protocol = protocolOverride ?? navProtocol;
  const blocks = useMemo(() => protocol?.blocks ?? [], [protocol]);
  const protocolRef = useRef(protocol);
  protocolRef.current = protocol;

  const [phase, setPhase] = useState<CardioPhase>('idle');
  const [blockIndex, setBlockIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(CARDIO_PREP_SECONDS);
  const [fraction, setFraction] = useState(1);
  const [phaseStartTime, setPhaseStartTime] = useState(Date.now());
  const [phaseTotalSeconds, setPhaseTotalSeconds] = useState(CARDIO_PREP_SECONDS);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [doneBlocks, setDoneBlocks] = useState<number[]>([]);
  const [resumeOffer, setResumeOffer] = useState<ResumeOffer | null>(
    localOffer ? { snapshot: localOffer, stale: resumeStatus(localOffer, Date.now()).stale, restore: true } : null,
  );
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishInfo, setFinishInfo] = useState<{ durationSec: number; completed: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [weightKg, setWeightKg] = useState<number | null>(null);

  const phaseRef = useRef<CardioPhase>('idle');
  const blockIndexRef = useRef(0);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const phaseStartRef = useRef(Date.now());
  const phaseTotalRef = useRef(CARDIO_PREP_SECONDS);
  const pausedAtRef = useRef<number | null>(null);
  const totalPauseMsRef = useRef(0);
  const doneRef = useRef<Set<number>>(new Set());
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const studentIdRef = useRef<string | null>(null);
  const uidPromiseRef = useRef<Promise<string | null> | null>(null);
  const awayRef = useRef<{ at: number } | null>(null);
  const resumeTimersRef = useRef<number[]>([]);
  const lastRemoteSaveRef = useRef(0);
  const beeperRef = useRef<PlayerBeeper | null>(null);
  const lastBeepedRef = useRef(-1);
  mutedRef.current = muted;

  // ───────── Zonas Karvonen do aluno (bpm de cada fase) ─────────
  const [hrZones, setHrZones] = useState<Array<{ zona: string; min: number; max: number }>>([]);
  const [fcMaxEst, setFcMaxEst] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('hr_zones').select('zonas_karvonen, fcmax_estimada, fc_repouso')
        .eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const z = (data?.zonas_karvonen as any[]) || [];
      if (Array.isArray(z) && z.length) {
        setHrZones(z.map((it: any) => ({ zona: String(it.zona || '').toUpperCase(), min: it.min, max: it.max })));
        if (data?.fcmax_estimada) setFcMaxEst(data.fcmax_estimada);
        return;
      }
      try {
        const { data: prof } = await supabase.from('students_profile').select('data_nascimento').eq('user_id', user.id).maybeSingle();
        let fcRepouso: number | null = null;
        const { data: aval } = await supabase.from('assessments').select('id')
          .eq('student_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (aval?.id) {
          const { data: v } = await supabase.from('vitals').select('fc_repouso').eq('assessment_id', aval.id).maybeSingle();
          if (v?.fc_repouso) fcRepouso = v.fc_repouso;
        }
        if (prof?.data_nascimento) {
          const age = Math.floor((Date.now() - new Date(prof.data_nascimento).getTime()) / (365.25 * 24 * 3600 * 1000));
          if (fcRepouso) {
            const { fcMax, zones } = calcKarvonenZones(age, fcRepouso, 'tanaka');
            setHrZones(zones.map(zz => ({ zona: zz.zona, min: zz.min, max: zz.max })));
            setFcMaxEst(fcMax);
          } else {
            const fcMax = 220 - age;
            const PCTS = [['Z1', 0.5, 0.6], ['Z2', 0.6, 0.7], ['Z3', 0.7, 0.8], ['Z4', 0.8, 0.9], ['Z5', 0.9, 1]] as const;
            setHrZones(PCTS.map(([zona, lo, hi]) => ({ zona, min: Math.round(fcMax * lo), max: Math.round(fcMax * hi) })));
            setFcMaxEst(fcMax);
          }
        }
      } catch { /* sem zonas */ }
    })();
  }, [user]);

  const resolveBpmRange = (block: CardioBlock | undefined): string | null => {
    if (!block) return null;
    if (block.targetHrRange && /\d/.test(block.targetHrRange)) return block.targetHrRange;
    const src = `${block.targetZone || ''} ${block.name || ''}`.toLowerCase();
    const m = src.match(/z(?:ona)?\s*([1-5])/);
    if (m) {
      const zone = hrZones.find(z => z.zona === `Z${m[1]}`);
      if (zone?.min != null && zone?.max != null) return `${zone.min}-${zone.max} bpm`;
    }
    const p = src.match(/(\d{2,3})\s*%?\s*[-–a]\s*(\d{2,3})\s*%/);
    if (p && fcMaxEst) return `${Math.round((parseInt(p[1]) / 100) * fcMaxEst)}-${Math.round((parseInt(p[2]) / 100) * fcMaxEst)} bpm`;
    const key = ({ leve: 'Z2', moderada: 'Z3', forte: 'Z4', maxima: 'Z5' } as Record<string, string>)[block.intensityLabel];
    const zone = key ? hrZones.find(z => z.zona === key) : null;
    return zone?.min != null && zone?.max != null ? `${zone.min}-${zone.max} bpm` : null;
  };

  // ───────── Som: só bipes (3-2-1 e troca de fase). As falas gravadas ficam só no TABATA. ─────────
  useEffect(() => {
    beeperRef.current = createPlayerBeeper(() => mutedRef.current);
    return () => { beeperRef.current?.dispose(); };
  }, []);
  const beep = (kind: 'countdown' | 'transition') => beeperRef.current?.beep(kind);
  const unlockAudio = () => { beeperRef.current?.unlock(); };

  useEffect(() => {
    if (!persistEnabled) return;
    uidPromiseRef.current = (async () => {
      try {
        const r = await supabase.auth.getUser();
        const id = r?.data?.user?.id ?? null;
        if (id) studentIdRef.current = id;
        return id;
      } catch { return null; }
    })();
  }, [persistEnabled]);

  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    void loadStudentWeightKg(user.id).then(w => { if (!off) setWeightKg(w); });
    return () => { off = true; };
  }, [user?.id]);

  // ───────── Relógio (pelo horário real; pausar congela) ─────────
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') return;
    const sync = () => {
      const ms = Math.max(0, Date.now() - phaseStartTime);
      setSecondsLeft(Math.max(0, phaseTotalSeconds - Math.floor(ms / 1000)));
      setFraction(phaseTotalSeconds > 0 ? Math.max(0, 1 - ms / (phaseTotalSeconds * 1000)) : 0);
    };
    sync();
    const id = setInterval(sync, 200);
    const onVis = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [paused, phase, phaseStartTime, phaseTotalSeconds]);

  const startPhase = (next: 'prep' | 'block', index: number, secs: number) => {
    const now = Date.now();
    const list = protocolRef.current?.blocks ?? [];
    phaseRef.current = next;
    blockIndexRef.current = index;
    phaseStartRef.current = now;
    phaseTotalRef.current = secs;
    lastBeepedRef.current = -1;
    setPhase(next);
    setBlockIndex(index);
    setPhaseTotalSeconds(secs);
    setSecondsLeft(secs);
    setFraction(1);
    setPhaseStartTime(now);
  };

  const markDone = (i: number) => {
    if (doneRef.current.has(i)) return;
    doneRef.current.add(i);
    setDoneBlocks([...doneRef.current]);
  };

  const sessionDuration = () => {
    const now = Date.now();
    const pause = totalPauseMsRef.current + (pausedAtRef.current ? now - pausedAtRef.current : 0);
    return activeSeconds(sessionStartRef.current ?? now, pause, now);
  };

  const finishSession = () => {
    clearResumeTimers();
    setResumeCount(null);
    if (pausedAtRef.current) { totalPauseMsRef.current += Date.now() - pausedAtRef.current; pausedAtRef.current = null; }
    const durationSec = Math.max(1, sessionDuration());
    pausedRef.current = false;
    setPaused(false);
    phaseRef.current = 'done';
    setPhase('done');
    setConfirmFinish(false);
    setFinishInfo({ durationSec, completed: doneRef.current.size });
    const sid = sessionIdRef.current;
    const uid = studentIdRef.current;
    const p = protocolRef.current;
    if (persistEnabled && sid) {
      clearLocalCardioSnapshot(sid);
      // Já fica como concluída; o "Concluir cardio" completa a mesma linha com os detalhes.
      if (uid && p) {
        void saveCardioFinish({
          planId, name: p.title, startedAt: new Date(sessionStartRef.current ?? Date.now()),
          durationSeconds: durationSec, pauseMs: totalPauseMsRef.current, completedBlocks: doneRef.current.size,
          totalBlocks: p.blocks.length, modality: p.modality,
          kcal: estimateCardioKcal({ modality: p.modality, protocol: p, durationSec, weightKg }),
          endedEarly: doneRef.current.size < p.blocks.length,
        }, sid).catch(() => { /* offline: o Concluir tenta de novo */ });
      }
    }
  };

  const goNext = (from = phaseRef.current, index = blockIndexRef.current) => {
    const list = protocolRef.current?.blocks ?? [];
    if (!list.length || from === 'idle' || from === 'done') return;
    if (from === 'prep') { beep('transition'); startPhase('block', 0, list[0].durationSec); return; }
    markDone(index);
    if (index >= list.length - 1) { beep('transition'); finishSession(); return; }
    beep('transition');
    startPhase('block', index + 1, list[index + 1].durationSec);
  };

  // Fim da fase
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || paused || secondsLeft > 0) return;
    if (phaseRef.current !== phase || blockIndexRef.current !== blockIndex) return;
    goNext(phase, blockIndex);
  }, [secondsLeft, phase, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bipes 3-2-1 no fim de cada fase
  useEffect(() => {
    if (paused || phase === 'idle' || phase === 'done') return;
    const s = secondsLeft;
    if (s >= 1 && s <= 3 && lastBeepedRef.current !== s) {
      lastBeepedRef.current = s;
      beep('countdown');
    }
  }, [secondsLeft, phase, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───────── Controles ─────────
  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    pausedAtRef.current = Date.now();
    setPaused(true);
  };
  function resume() {
    if (!pausedRef.current) return;
    const pausedFor = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
    totalPauseMsRef.current += pausedFor;
    pausedAtRef.current = null;
    phaseStartRef.current += pausedFor;
    pausedRef.current = false;
    setPhaseStartTime(phaseStartRef.current);
    setPaused(false);
  }

  const start = () => {
    if (!blocks.length || phaseRef.current !== 'idle') return;
    unlockAudio();
    const now = Date.now();
    sessionStartRef.current = now;
    clearResumeTimers();
    setResumeCount(null);
    setResumeOffer(null);
    awayRef.current = null;
    lastRemoteSaveRef.current = 0;
    doneRef.current = new Set();
    setDoneBlocks([]);
    totalPauseMsRef.current = 0;
    pausedAtRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setFinishInfo(null);
    if (persistEnabled) {
      const sid = crypto.randomUUID();
      sessionIdRef.current = sid;
      void (async () => {
        const uid = await (uidPromiseRef.current ?? Promise.resolve(studentIdRef.current));
        if (uid) await closeOtherActiveCardio(uid, sid);
      })();
    }
    startPhase('prep', 0, CARDIO_PREP_SECONDS);
  };

  const togglePause = () => {
    unlockAudio();
    awayRef.current = null;
    if (pausedRef.current) { resume(); persist('away', 'in_progress', true); }
    else { pause(); persist('manual', 'paused', true); }
  };

  const skipNext = () => {
    unlockAudio();
    if (pausedRef.current) resume();
    goNext();
  };

  const skipPrev = () => {
    unlockAudio();
    if (pausedRef.current) resume();
    const p = phaseRef.current;
    const i = blockIndexRef.current;
    const list = protocolRef.current?.blocks ?? [];
    if (p === 'block' && i > 0) {
      doneRef.current.delete(i - 1);
      doneRef.current.delete(i);
      setDoneBlocks([...doneRef.current]);
      startPhase('block', i - 1, list[i - 1].durationSec);
    } else if (p === 'block') startPhase('block', 0, list[0].durationSec);
    else if (p === 'prep') startPhase('prep', 0, CARDIO_PREP_SECONDS);
  };

  const toggleMute = () => {
    const willUnmute = muted;
    mutedRef.current = !muted;
    setMuted(!muted);
    if (willUnmute) unlockAudio();
  };

  // ───────── Cardio em andamento: pausa ao sair e retomada ─────────
  const currentSnapshot = (reason: PauseReason, now = Date.now()): CardioSnapshot | null => {
    const sid = sessionIdRef.current;
    const uid = studentIdRef.current;
    const p = protocolRef.current;
    if (!persistEnabled || !sid || !uid || !p) return null;
    const pausedAt = pausedAtRef.current ?? now;
    return buildCardioSnapshot({
      sessionId: sid, studentId: uid, planId, protocol: p, phase: phaseRef.current, blockIndex: blockIndexRef.current,
      remainingMs: phaseTotalRef.current * 1000 - (pausedAt - phaseStartRef.current),
      phaseTotalSeconds: phaseTotalRef.current, startedAt: sessionStartRef.current ?? now,
      totalPauseMs: totalPauseMsRef.current, doneBlocks: doneRef.current, pausedAt, reason,
    }, now);
  };

  function persist(reason: PauseReason, status: 'in_progress' | 'paused', remote: boolean | 'throttle') {
    if (!persistEnabled) return;
    if (!studentIdRef.current) {
      void uidPromiseRef.current?.then(uid => { if (uid) persist(reason, status, remote); });
      return;
    }
    const snap = currentSnapshot(reason);
    if (!snap) return;
    writeLocalCardioSnapshot(snap);
    if (!remote) return;
    const now = Date.now();
    if (remote === 'throttle' && now - lastRemoteSaveRef.current < 20_000) return;
    lastRemoteSaveRef.current = now;
    void saveCardioProgress(snap, status);
  }

  function clearResumeTimers() {
    resumeTimersRef.current.forEach(t => window.clearTimeout(t));
    resumeTimersRef.current = [];
  }

  /** 3, 2, 1 com bipes e segue de onde parou (sem fala). */
  function runResumeCountdown(withLead: boolean) {
    clearResumeTimers();
    setResumeOffer(null);
    awayRef.current = null;
    let lead = 0;
    if (withLead) { lead = 600; setResumeCount(0); }
    const at = (ms: number, fn: () => void) => { resumeTimersRef.current.push(window.setTimeout(fn, ms)); };
    for (let i = 0; i < RESUME_COUNTDOWN_SECONDS; i++) {
      const n = RESUME_COUNTDOWN_SECONDS - i;
      const tick = () => { setResumeCount(n); beep('countdown'); };
      if (lead + i * 1000 === 0) tick(); else at(lead + i * 1000, tick);
    }
    at(lead + RESUME_COUNTDOWN_SECONDS * 1000, () => {
      resumeTimersRef.current = [];
      setResumeCount(null);
      beep('transition');
      resume();
      persist('away', 'in_progress', true);
    });
  }

  const restoreSnapshot = (snap: CardioSnapshot): boolean => {
    const p = snap.protocol;
    if (!p?.blocks?.length || snap.blockIndex >= p.blocks.length) return false;
    if (p !== navProtocol) setProtocolOverride(p);
    protocolRef.current = p;
    clearResumeTimers();
    sessionIdRef.current = snap.sessionId;
    if (!studentIdRef.current) studentIdRef.current = snap.studentId;
    sessionStartRef.current = snap.startedAt;
    doneRef.current = new Set(snap.doneBlocks);
    setDoneBlocks([...doneRef.current]);
    totalPauseMsRef.current = snap.totalPauseMs;
    pausedAtRef.current = snap.pausedAt;
    setFinishInfo(null);
    const startAt = restoredPhaseStart(snap);
    phaseRef.current = snap.phase;
    blockIndexRef.current = snap.blockIndex;
    phaseStartRef.current = startAt;
    phaseTotalRef.current = snap.phaseTotalSeconds;
    lastRemoteSaveRef.current = 0;
    pausedRef.current = true;
    setPhase(snap.phase);
    setBlockIndex(snap.blockIndex);
    setPhaseTotalSeconds(snap.phaseTotalSeconds);
    setSecondsLeft(restoredSecondsLeft(snap));
    setFraction(snap.phaseTotalSeconds > 0 ? snap.remainingMs / (snap.phaseTotalSeconds * 1000) : 0);
    setPhaseStartTime(startAt);
    setPaused(true);
    return true;
  };

  const resetToIdle = () => {
    clearResumeTimers();
    setResumeCount(null);
    setResumeOffer(null);
    awayRef.current = null;
    pausedAtRef.current = null;
    sessionIdRef.current = null;
    pausedRef.current = false;
    phaseRef.current = 'idle';
    setPaused(false);
    setPhase('idle');
    setBlockIndex(0);
    setSecondsLeft(CARDIO_PREP_SECONDS);
    setPhaseTotalSeconds(CARDIO_PREP_SECONDS);
  };

  const continueFromOffer = () => {
    const offer = resumeOffer;
    if (!offer) return;
    unlockAudio();
    if (offer.restore && !restoreSnapshot(offer.snapshot)) {
      setResumeOffer(null);
      void discardActiveCardio(offer.snapshot);
      toast.error('Não deu para retomar esse cardio. Comece de novo.');
      return;
    }
    runResumeCountdown(true);
  };
  const restartFromOffer = () => {
    const offer = resumeOffer;
    if (!offer) return;
    unlockAudio();
    if (offer.restore) { setProtocolOverride(offer.snapshot.protocol); protocolRef.current = offer.snapshot.protocol; }
    clearLocalCardioSnapshot(offer.snapshot.sessionId);
    void abandonCardioSession(offer.snapshot.sessionId);
    resetToIdle();
    start();
  };
  const discardFromOffer = () => {
    const offer = resumeOffer;
    if (!offer) return;
    void discardActiveCardio(offer.snapshot);
    resetToIdle();
    if (!navProtocol) navigate(-1);
  };

  const handleHidden = () => {
    if (!persistEnabled) return;
    const p = phaseRef.current;
    if (p === 'idle' || p === 'done') return;
    const counting = resumeTimersRef.current.length > 0;
    if (counting) { clearResumeTimers(); setResumeCount(null); }
    if (!pausedRef.current || counting || awayRef.current) {
      if (!pausedRef.current) pause();
      awayRef.current = { at: Date.now() };
      persist('away', 'paused', true);
    } else {
      persist('manual', 'paused', true);
    }
  };

  const handleVisible = () => {
    if (!persistEnabled || document.visibilityState === 'hidden') return;
    const away = awayRef.current;
    if (!away) return;
    awayRef.current = null;
    if (!pausedRef.current) return;
    const now = Date.now();
    const st = resumeStatus({ pausedAt: pausedAtRef.current ?? away.at, reason: 'away' }, now, { awayMs: now - away.at });
    if (st.kind === 'quick') { runResumeCountdown(false); return; }
    const snap = currentSnapshot('away', now);
    if (st.kind === 'expired' || !snap) {
      if (sessionIdRef.current) void discardActiveCardio({ sessionId: sessionIdRef.current });
      resetToIdle();
      if (st.kind === 'expired') toast.info('Esse cardio ficou parado mais de 24 h e foi encerrado.');
      return;
    }
    setResumeOffer({ snapshot: snap, stale: st.stale, restore: false });
  };

  const lifecycleRef = useRef({ hidden: handleHidden, visible: handleVisible });
  lifecycleRef.current = { hidden: handleHidden, visible: handleVisible };
  useEffect(() => {
    if (!persistEnabled) return;
    const onVisibility = () => (document.visibilityState === 'hidden' ? lifecycleRef.current.hidden() : lifecycleRef.current.visible());
    const onHide = () => lifecycleRef.current.hidden();
    const onShow = () => lifecycleRef.current.visible();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pageshow', onShow);
      lifecycleRef.current.hidden();
      clearResumeTimers();
    };
  }, [persistEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retomada vinda da home no iPhone: o primeiro toque libera o som.
  const unlockRef = useRef(unlockAudio);
  unlockRef.current = unlockAudio;
  useEffect(() => {
    const onTap = () => unlockRef.current();
    document.addEventListener('pointerdown', onTap, { once: true, capture: true });
    return () => document.removeEventListener('pointerdown', onTap, { capture: true });
  }, []);

  // Abriu: retoma direto (Continuar da home) ou oferece o card se este cardio está em andamento.
  useEffect(() => {
    if (!persistEnabled || !navProtocol) return;
    if (navResume) {
      if (restoreSnapshot(navResume)) { unlockAudio(); runResumeCountdown(true); }
      return;
    }
    let off = false;
    (async () => {
      const uid = await (uidPromiseRef.current ?? Promise.resolve(null));
      if (!uid || off) return;
      const found = await findActiveCardio(uid);
      if (off || !found || phaseRef.current !== 'idle') return;
      if (!cardioSnapshotMatches(found, planId, navProtocol)) return;
      setResumeOffer({ snapshot: found, stale: resumeStatus(found, Date.now()).stale, restore: true });
    })();
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rodando: grava o ponto a cada fase (aparelho sempre; banco no máximo a cada 20 s).
  useEffect(() => {
    if (!persistEnabled || paused || phase === 'idle' || phase === 'done') return;
    persist('away', 'in_progress', 'throttle');
  }, [phase, blockIndex, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  useScreenWakeLock((phase === 'prep' || phase === 'block') && (!paused || resumeCount !== null));

  const handleFinishSubmit = useCallback(async (v: CardioFinishValues) => {
    const p = protocolRef.current;
    if (!p || saving) return;
    if (!persistEnabled) { toast.info('Pré-visualização: nada foi salvo.'); navigate(-1); return; }
    setSaving(true);
    try {
      await saveCardioFinish({
        planId, name: p.title, startedAt: new Date(sessionStartRef.current ?? Date.now() - v.durationSec * 1000),
        durationSeconds: v.durationSec, pauseMs: totalPauseMsRef.current, completedBlocks: doneRef.current.size,
        totalBlocks: p.blocks.length, modality: v.modality, kcal: v.kcal, rpe: v.rpe, rating: v.rating,
        distanceKm: v.distanceKm, avgHeartRate: v.avgHeartRate, notes: v.notes,
        endedEarly: doneRef.current.size < p.blocks.length, durationEdited: v.durationEdited,
      }, sessionIdRef.current);
      toast.success('Cardio salvo! O Fabiew já consegue ver.');
      navigate(-1);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? `Não foi possível salvar: ${e.message}` : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }, [saving, persistEnabled, planId, navigate]);

  // ───────── Tela ─────────
  if (!protocol) {
    return (
      <div className="fixed inset-0 bg-tabata-bg flex flex-col items-center justify-center p-4">
        <p className="text-tabata-soft mb-4">Nenhum cardio carregado.</p>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  if (phase === 'done' && finishInfo) {
    return (
      <CardioFinishScreen
        protocol={protocol}
        durationSec={finishInfo.durationSec}
        completedBlocks={finishInfo.completed}
        totalBlocks={blocks.length}
        weightKg={weightKg}
        preview={!persistEnabled}
        saving={saving}
        onSubmit={(v) => void handleFinishSubmit(v)}
        onClose={() => navigate(-1)}
      />
    );
  }

  const running = phase === 'prep' || phase === 'block';
  const current = phase === 'block' ? blocks[blockIndex] : undefined;
  const next = phase === 'prep' ? blocks[0] : blocks[blockIndex + 1];
  const tone = phaseToneFor(phase, current);
  const planTotal = totalBlocksSeconds(blocks);
  const elapsed = cardioElapsed(blocks, phase, blockIndex, secondsLeft);
  const segments = cardioSegments(blocks, elapsed);
  const params = blockParams(current, protocol.modality);
  const bpm = resolveBpmRange(current);
  const showNext = running && !!next && (phase === 'prep' || secondsLeft <= NEXT_CARD_SECONDS);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-tabata-bg text-foreground overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      data-testid="cardio-player"
    >
      <header className="shrink-0 px-3 pt-2 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => navigate(-1)} className="h-10 w-10 rounded-full hover:bg-tabata-panel">
            <X className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-[11px] uppercase tracking-widest text-tabata-soft truncate">{protocol.title}</p>
            {running && (
              <p className="text-sm font-black" data-testid="cardio-phase-count">
                {phase === 'prep' ? 'Prepare-se' : phaseCountLabel(blockIndex, blocks.length)}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label={muted ? 'Ligar som' : 'Silenciar'} onClick={toggleMute} className="h-10 w-10 rounded-full hover:bg-tabata-panel">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        </div>
        <div className="flex gap-[3px] h-2" data-testid="cardio-segments" aria-label="Fases do cardio">
          {segments.map(s => (
            <div
              key={s.index}
              data-tone={s.tone}
              className={cn('relative overflow-hidden rounded-full', s.hard ? 'h-2' : 'h-1.5 self-end')}
              style={{ flexGrow: Math.max(1, s.seconds), flexBasis: 0, background: toneColor(s.tone, 0.2) }}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${s.fill * 100}%`, background: toneColor(s.tone), transition: 'width 0.3s linear' }} />
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {phase === 'idle' && (
          <div className="mx-auto w-full max-w-md space-y-4 pt-4" data-testid="cardio-pre-screen">
            <h1 className="text-3xl font-black text-center">{protocol.title}</h1>
            <div className="flex flex-wrap justify-center gap-2">
              <PhaseChip tone="warmup">{MODALITY_LABEL[protocol.modality]}</PhaseChip>
              <PhaseChip tone="moderado">{STRUCTURE_LABEL[protocol.structure] ?? protocol.structure}</PhaseChip>
              <PhaseChip tone="rest">{formatDurationFromSec(planTotal)}</PhaseChip>
            </div>
            {protocol.objective && <p className="text-center text-xs text-tabata-soft">{protocol.objective}</p>}
            {protocol.targetZoneSummary && (
              <p className="text-sm text-tabata-brand font-bold flex items-center justify-center gap-1">
                <HeartPulse className="h-4 w-4" /> {protocol.targetZoneSummary}
              </p>
            )}
            <div className="rounded-2xl bg-tabata-panel border border-tabata-border p-3 space-y-1.5">
              {blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: toneColor(blockTone(b)) }} />
                  <span className="font-semibold truncate flex-1">{i + 1}. {b.name}</span>
                  <span className="text-[10px] text-tabata-soft truncate max-w-[40%]">{nextPhaseText(b, protocol.modality).split(' · ').slice(1, -1).join(' · ')}</span>
                  <span className="font-mono tabular-nums text-tabata-soft">{mmss(b.durationSec)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {running && (
          <div className="mx-auto w-full max-w-md flex flex-col items-center gap-4 pt-3">
            <CardioRing
              seconds={secondsLeft}
              fraction={fraction}
              tone={tone}
              caption={paused
                ? <span className="font-bold uppercase tracking-widest" style={{ color: toneColor(tone) }}>Pausado</span>
                : <>Tempo total: {mmss(elapsed)} / {mmss(planTotal)}</>}
            />

            <div className="w-full rounded-2xl bg-tabata-panel border border-tabata-border p-4 space-y-3" data-testid="cardio-phase-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight" data-testid="cardio-phase-name">
                    {phase === 'prep' ? 'Prepare-se' : current?.name}
                  </p>
                  <p className="text-[12px] text-tabata-soft mt-0.5">
                    {phase === 'prep' ? `Começa em ${secondsLeft}s` : `${mmss(current?.durationSec ?? 0)} · ${phaseCountLabel(blockIndex, blocks.length)}`}
                    {current?.notes ? ` · ${current.notes}` : ''}
                  </p>
                </div>
                {current && <PhaseChip tone={tone} testId="cardio-intensity-tag">{blockTag(current)}</PhaseChip>}
              </div>

              {params.length > 0 && (
                <div className={cn('grid gap-2', params.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')} data-testid="cardio-params">
                  {params.map(p => (
                    <div key={p.label} className="rounded-xl bg-tabata-bg px-3 py-2.5 text-center">
                      <p className="text-[10px] uppercase tracking-wider text-tabata-soft">{p.label}</p>
                      <p className="font-black tabular-nums leading-tight">
                        <span className="text-3xl" style={{ color: toneColor(tone) }}>{p.value}</span>
                        {p.unit && <span className="ml-1 text-sm text-tabata-soft">{p.unit}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {current?.targetZone && (
                <p className="flex items-center justify-center gap-2 font-black" data-testid="cardio-zone">
                  <HeartPulse className="h-5 w-5" style={{ color: toneColor(tone) }} />
                  <span className="text-lg">{current.targetZone}{bpm ? ` · ${bpm}` : ''}</span>
                </p>
              )}
            </div>

            {showNext && next && (
              <div
                className="w-full flex items-center gap-3 rounded-2xl p-3"
                style={{ background: toneColor(blockTone(next), 0.1), boxShadow: `inset 0 0 0 1px ${toneColor(blockTone(next), 0.35)}` }}
                data-testid="cardio-next-card"
              >
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: toneColor(blockTone(next)) }} />
                <p className="flex-1 min-w-0 text-sm font-bold truncate">Próximo: {nextPhaseText(next, protocol.modality)}</p>
                {secondsLeft <= 3 && secondsLeft > 0 && (
                  <span className="text-2xl font-black tabular-nums animate-tabata-pulse" style={{ color: toneColor(blockTone(next)) }}>{secondsLeft}</span>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="shrink-0 px-6 pb-3 pt-2 space-y-2">
        {phase === 'idle' ? (
          <Button
            size="lg" onClick={start} onPointerDown={unlockAudio}
            className="h-14 w-full rounded-2xl text-lg font-black uppercase tracking-wider bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90"
          >
            <Play className="!h-6 !w-6 fill-current mr-2" /> Iniciar
          </Button>
        ) : running && (
          <>
            <div className="flex items-center justify-center gap-6">
              <Button variant="ghost" size="icon" aria-label="Fase anterior" onClick={skipPrev}
                className="h-14 w-14 rounded-full border border-tabata-border bg-tabata-panel hover:bg-tabata-panel active:scale-95">
                <SkipBack className="!h-6 !w-6 fill-current" />
              </Button>
              <Button size="icon" aria-label={paused ? 'Retomar' : 'Pausar'} onClick={togglePause}
                className="h-[76px] w-[76px] rounded-full bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90 active:scale-95">
                {paused ? <Play className="!h-8 !w-8 fill-current ml-1" /> : <Pause className="!h-8 !w-8 fill-current" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Próxima fase" onClick={skipNext}
                className="h-14 w-14 rounded-full border border-tabata-border bg-tabata-panel hover:bg-tabata-panel active:scale-95">
                <SkipForward className="!h-6 !w-6 fill-current" />
              </Button>
            </div>
            <button type="button" onClick={() => setConfirmFinish(true)} className="mx-auto flex items-center gap-1.5 text-[13px] font-semibold text-tabata-soft underline-offset-4 hover:underline">
              <Flag className="h-3.5 w-3.5" /> Finalizar sessão
            </button>
          </>
        )}
      </footer>

      {confirmFinish && (
        <div className="absolute inset-0 z-40 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'hsl(var(--tabata-bg) / 0.8)' }} data-testid="cardio-confirm-finish">
          <div className="w-full max-w-sm rounded-2xl bg-tabata-panel border border-tabata-border p-5 space-y-3 text-center">
            <p className="text-lg font-black">Finalizar o cardio agora?</p>
            <p className="text-sm text-tabata-soft">{doneBlocks.length} de {blocks.length} fases feitas.</p>
            <Button onClick={finishSession} className="h-12 w-full rounded-2xl font-black uppercase bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90">
              Finalizar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmFinish(false)} className="h-10 w-full rounded-2xl text-tabata-soft">
              Continuar o cardio
            </Button>
          </div>
        </div>
      )}

      {resumeOffer && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-md" style={{ background: 'hsl(var(--tabata-bg) / 0.9)' }} data-testid="cardio-resume-offer">
          <div className="w-full max-w-sm rounded-2xl bg-tabata-panel border border-tabata-border p-5 space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tabata-brand px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-tabata-bg">
              <span className="h-1.5 w-1.5 rounded-full bg-tabata-bg animate-pulse" /> Em andamento
            </span>
            <p className="text-lg font-black leading-tight">Cardio em andamento — {resumeOffer.snapshot.title}</p>
            <p className="text-[12px] text-tabata-soft">
              {cardioSnapshotLabel(resumeOffer.snapshot)} · parou {stoppedAgoText(Math.max(0, Date.now() - resumeOffer.snapshot.pausedAt))}
            </p>
            {resumeOffer.stale && <p className="rounded-lg bg-tabata-brand/10 px-3 py-2 text-xs font-semibold text-tabata-brand">{STALE_WARMUP_TEXT}</p>}
            <Button onPointerDown={unlockAudio} onClick={continueFromOffer} className="h-12 w-full rounded-2xl font-black uppercase bg-tabata-brand text-tabata-bg hover:bg-tabata-brand/90">
              <Play className="h-4 w-4 mr-1 fill-current" /> Continuar
            </Button>
            <Button variant="outline" onPointerDown={unlockAudio} onClick={restartFromOffer} className="h-11 w-full rounded-2xl font-bold border-tabata-border bg-tabata-panel">
              <RotateCcw className="h-4 w-4 mr-1" /> Recomeçar
            </Button>
            <Button variant="ghost" onClick={discardFromOffer} className="h-10 w-full rounded-2xl text-[13px] font-semibold text-tabata-soft hover:bg-transparent hover:text-destructive">
              Descartar
            </Button>
          </div>
        </div>
      )}

      {resumeCount !== null && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 backdrop-blur-sm" style={{ background: 'hsl(var(--tabata-bg) / 0.82)' }} data-testid="cardio-resume-countdown">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-tabata-soft">Continuando</p>
          <p className="text-8xl font-black tabular-nums text-tabata-brand">{resumeCount > 0 ? resumeCount : '…'}</p>
        </div>
      )}
    </div>
  );
};

export default CardioExecucao;
