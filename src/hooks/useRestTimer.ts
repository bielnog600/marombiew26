import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generate a WAV (PCM 16-bit mono) Blob containing the full countdown audio:
 * mostly silence with short beeps at the last 3,2,1 seconds and a longer beep at 0.
 *
 * We bake the entire sequence into a single HTMLAudioElement playback because
 * iOS Safari/WebKit suspends Web Audio (AudioContext) when the tab goes to
 * background. HTMLMediaElement playback, however, is allowed to continue in
 * background when started from a user gesture — so beeps fire even minimized.
 */
function buildCountdownWav(totalSeconds: number): string {
  const sampleRate = 22050;
  const totalSamples = Math.ceil(totalSeconds * sampleRate) + sampleRate; // +1s tail
  const buffer = new Int16Array(totalSamples);

  const writeBeep = (atSec: number, freq: number, durSec: number, volume = 0.6) => {
    const start = Math.floor(atSec * sampleRate);
    const len = Math.floor(durSec * sampleRate);
    const fade = Math.floor(0.01 * sampleRate);
    for (let i = 0; i < len; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= totalSamples) continue;
      // Fade in/out envelope to avoid clicks
      let env = 1;
      if (i < fade) env = i / fade;
      else if (i > len - fade) env = Math.max(0, (len - i) / fade);
      const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * volume * env;
      buffer[idx] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    }
  };

  // Last 3, 2, 1 seconds: short high beeps. At 0: longer lower beep.
  if (totalSeconds >= 3) writeBeep(totalSeconds - 3, 880, 0.15);
  if (totalSeconds >= 2) writeBeep(totalSeconds - 2, 880, 0.15);
  if (totalSeconds >= 1) writeBeep(totalSeconds - 1, 880, 0.15);
  writeBeep(totalSeconds, 1320, 0.4);

  // Build WAV header
  const dataSize = buffer.length * 2;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(wav, 44);
  const src = new Uint8Array(buffer.buffer);
  bytes.set(src);

  const blob = new Blob([wav], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export function useRestTimer() {
  const [restTimer, setRestTimer] = useState<{ total: number; remaining: number; exIdx: number; startTime: number } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* noop */ }
      try { audioRef.current.removeAttribute('src'); audioRef.current.load(); } catch { /* noop */ }
    }
    if (audioUrlRef.current) {
      try { URL.revokeObjectURL(audioUrlRef.current); } catch { /* noop */ }
      audioUrlRef.current = null;
    }
  }, []);

  const playCountdownAudio = useCallback((seconds: number) => {
    stopAudio();
    if (seconds <= 0) return;
    try {
      const url = buildCountdownWav(seconds);
      audioUrlRef.current = url;
      if (!audioRef.current) {
        const a = new Audio();
        a.preload = 'auto';
        // iOS: keep audio playing when screen locks / app minimized
        (a as any).playsInline = true;
        a.setAttribute('playsinline', 'true');
        a.setAttribute('webkit-playsinline', 'true');
        audioRef.current = a;
      }
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      // play() MUST be invoked synchronously inside the original user gesture
      // for iOS to allow background playback.
      const p = audioRef.current.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* user gesture missing, ignore */ });
    } catch {
      /* noop */
    }
  }, [stopAudio]);

  const startTimer = useCallback((seconds: number, exIdx: number) => {
    setRestTimer({
      total: seconds,
      remaining: seconds,
      exIdx,
      startTime: Date.now()
    });
    playCountdownAudio(seconds);
  }, [playCountdownAudio]);

  const stopTimer = useCallback(() => {
    setRestTimer(null);
    stopAudio();
  }, [stopAudio]);

  const adjustTimer = useCallback((seconds: number) => {
    setRestTimer(prev => {
      if (!prev) return null;
      const newTotal = prev.total + (seconds > 0 ? seconds : 0);
      const newRemaining = Math.max(0, prev.remaining + seconds);
      const elapsedSoFar = (newTotal - newRemaining) * 1000;
      // Re-bake audio for the new remaining time. This still runs inside the
      // click handler that called adjust(), preserving the user-gesture chain.
      playCountdownAudio(newRemaining);
      return {
        ...prev,
        total: newTotal,
        remaining: newRemaining,
        startTime: Date.now() - elapsedSoFar
      };
    });
  }, [playCountdownAudio]);

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
      stopAudio();
      audioRef.current = null;
    };
  }, [stopAudio]);

  return {
    restTimer,
    startTimer,
    stopTimer,
    adjustTimer
  };
}