import { useState, useEffect, useCallback, useRef } from 'react';

export function useRestTimer() {
  const [restTimer, setRestTimer] = useState<{ total: number; remaining: number; exIdx: number; startTime: number } | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startTimer = useCallback((seconds: number, exIdx: number) => {
    setRestTimer({
      total: seconds,
      remaining: seconds,
      exIdx,
      startTime: Date.now()
    });
  }, []);

  const stopTimer = useCallback(() => {
    setRestTimer(null);
  }, []);

  const adjustTimer = useCallback((seconds: number) => {
    setRestTimer(prev => {
      if (!prev) return null;
      const newTotal = prev.total + (seconds > 0 ? seconds : 0);
      const newRemaining = Math.max(0, prev.remaining + seconds);
      // We adjust the startTime to maintain consistency with the new remaining time
      const elapsedSoFar = (newTotal - newRemaining) * 1000;
      return {
        ...prev,
        total: newTotal,
        remaining: newRemaining,
        startTime: Date.now() - elapsedSoFar
      };
    });
  }, []);

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

  return {
    restTimer,
    startTimer,
    stopTimer,
    adjustTimer
  };
}
