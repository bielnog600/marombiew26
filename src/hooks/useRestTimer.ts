import { useState, useEffect, useCallback, useRef } from 'react';

type ScheduledBeep = { osc: OscillatorNode; gain: GainNode };

function getAudioCtx(ref: { current: AudioContext | null }): AudioContext | null {
  try {
    if (!ref.current) {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return null;
      ref.current = new Ctx();
    }
    if (ref.current.state === 'suspended') {
      void ref.current.resume();
    }
    return ref.current;
  } catch {
    return null;
  }
}

function scheduleBeep(ctx: AudioContext, when: number, freq: number, duration: number, volume = 0.25): ScheduledBeep {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + 0.01);
  gain.gain.linearRampToValueAtTime(0, when + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.05);
  return { osc, gain };
}

export function useRestTimer() {
  const [restTimer, setRestTimer] = useState<{ total: number; remaining: number; exIdx: number; startTime: number } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scheduledBeepsRef = useRef<ScheduledBeep[]>([]);

  const clearScheduledBeeps = useCallback(() => {
    scheduledBeepsRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.cancelScheduledValues(0); } catch { /* noop */ }
      try { osc.stop(); } catch { /* noop */ }
      try { osc.disconnect(); } catch { /* noop */ }
      try { gain.disconnect(); } catch { /* noop */ }
    });
    scheduledBeepsRef.current = [];
  }, []);

  const scheduleCountdownBeeps = useCallback((secondsFromNow: number) => {
    const ctx = getAudioCtx(audioCtxRef);
    if (!ctx) return;
    clearScheduledBeeps();
    const now = ctx.currentTime;
    const offsets = [
      { at: secondsFromNow - 3, freq: 880, dur: 0.12 },
      { at: secondsFromNow - 2, freq: 880, dur: 0.12 },
      { at: secondsFromNow - 1, freq: 880, dur: 0.12 },
      { at: secondsFromNow,     freq: 1320, dur: 0.35 },
    ];
    offsets.forEach(({ at, freq, dur }) => {
      if (at <= 0.05) return;
      scheduledBeepsRef.current.push(scheduleBeep(ctx, now + at, freq, dur));
    });
  }, [clearScheduledBeeps]);

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
      // We adjust the startTime to maintain consistency with the new remaining time
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
    if (!restTimer || restTimer.remaining <= -60) { // Keep alive for a bit after 0 for negative counting if needed, or stop at 0
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - restTimer.startTime) / 1000);
      const remaining = restTimer.total - elapsed;
      
      setRestTimer(prev => {
        if (!prev || prev.remaining === remaining) return prev;
        // Stop at a reasonable negative limit if we want to show "overdue" time, 
        // or just stop at 0 if preferred. The overlay handles negative time.
        return { ...prev, remaining };
      });

      if (remaining <= -60 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(tick, 200); // More frequent updates for smoothness
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [restTimer?.startTime, restTimer?.total]); // Removed restTimer?.remaining from dependencies

  // Handle visibility change to sync timer
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
        try { void audioCtxRef.current.close(); } catch { /* noop */ }
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
