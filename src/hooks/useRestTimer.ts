import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Rest-timer countdown beeps via Web Audio API.
 *
 * Importante (iOS): usamos Web Audio em vez de HTMLAudioElement de propósito.
 * HTMLAudio no iOS assume a sessão de áudio "playback" e PAUSA a música que o
 * usuário está ouvindo (Spotify/Apple Music). Web Audio usa a sessão "ambient",
 * que MISTURA com a música — a contrapartida é que o iOS suspende o
 * AudioContext quando o app vai pro background, então beeps com tela
 * bloqueada/app minimizado não são garantidos no Safari iOS.
 */
export function useRestTimer() {
  const [restTimer, setRestTimer] = useState<{ total: number; remaining: number; exIdx: number; startTime: number } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);

  const getAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return null;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      return ctx;
    } catch { return null; }
  }, []);

  const clearScheduledBeeps = useCallback(() => {
    for (const { osc, gain } of scheduledNodesRef.current) {
      try { osc.stop(); } catch { /* noop */ }
      try { osc.disconnect(); } catch { /* noop */ }
      try { gain.disconnect(); } catch { /* noop */ }
    }
    scheduledNodesRef.current = [];
  }, []);

  const scheduleBeep = useCallback((ctx: AudioContext, atTime: number, freq: number, durSec: number, volume = 0.25) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, atTime);
    gain.gain.setValueAtTime(0.0001, atTime);
    gain.gain.exponentialRampToValueAtTime(volume, atTime + 0.01);
    gain.gain.setValueAtTime(volume, atTime + durSec - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, atTime + durSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(atTime);
    osc.stop(atTime + durSec + 0.05);
    scheduledNodesRef.current.push({ osc, gain });
  }, []);

  const scheduleCountdownBeeps = useCallback((seconds: number) => {
    clearScheduledBeeps();
    if (seconds <= 0) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (seconds >= 3) scheduleBeep(ctx, now + (seconds - 3), 880, 0.12);
    if (seconds >= 2) scheduleBeep(ctx, now + (seconds - 2), 880, 0.12);
    if (seconds >= 1) scheduleBeep(ctx, now + (seconds - 1), 880, 0.12);
    scheduleBeep(ctx, now + seconds, 1320, 0.35, 0.3);
  }, [clearScheduledBeeps, getAudioCtx, scheduleBeep]);

  const startTimer = useCallback((seconds: number, exIdx: number) => {
    setRestTimer({
      total: seconds,
      remaining: seconds,
      exIdx,
      startTime: Date.now()
    });
    scheduleCountdownBeeps(seconds);
  }, [scheduleCountdownBeeps]);

  const stopTimer = useCallback(() => {
    setRestTimer(null);
    clearScheduledBeeps();
  }, [clearScheduledBeeps]);

  const adjustTimer = useCallback((seconds: number) => {
    setRestTimer(prev => {
      if (!prev) return null;
      const newTotal = prev.total + (seconds > 0 ? seconds : 0);
      const newRemaining = Math.max(0, prev.remaining + seconds);
      const elapsedSoFar = (newTotal - newRemaining) * 1000;
      scheduleCountdownBeeps(newRemaining);
      return {
        ...prev,
        total: newTotal,
        remaining: newRemaining,
        startTime: Date.now() - elapsedSoFar
      };
    });
  }, [scheduleCountdownBeeps]);

  useEffect(() => {
    if (!restTimer || restTimer.remaining <= -60) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - restTimer.startTime) / 1000);
      const remaining = restTimer.total - elapsed;
      setRestTimer(prev => {
        if (!prev || prev.remaining === remaining) return prev;
        return { ...prev, remaining };
      });
      if (remaining <= -60 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [restTimer?.startTime, restTimer?.total]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && restTimer) {
        const elapsed = Math.floor((Date.now() - restTimer.startTime) / 1000);
        const remaining = Math.max(0, restTimer.total - elapsed);
        setRestTimer(prev => prev ? { ...prev, remaining } : null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [restTimer]);

  useEffect(() => {
    return () => {
      clearScheduledBeeps();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* noop */ }
        audioCtxRef.current = null;
      }
    };
  }, [clearScheduledBeeps]);

  return {
    restTimer,
    startTimer,
    stopTimer,
    adjustTimer
  };
}