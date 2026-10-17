import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InlineRestState, RestCompletion } from '@/hooks/useInlineWorkoutRest';

export const formatRestTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
export interface SetRestPresentation {
  rest?: InlineRestState | null;
  completion?: RestCompletion | null;
  exIdx: number;
  next?: boolean;
  onAdd?: (seconds: number) => void;
  onSkip?: () => void;
}

export function WorkoutSetCard({ index, children, rest, completion, exIdx, next, onAdd, onSkip, className = '' }: SetRestPresentation & { index: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const resting = rest?.exIdx === exIdx && rest.setIndex === index && rest.remaining > 0;
  const pulsing = completion?.exIdx === exIdx && completion.setIndex === index;
  useEffect(() => {
    if (next && completion?.exIdx === exIdx) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [next, completion?.id, exIdx]);
  return (
    <div ref={ref} data-workout-set={`${exIdx}:${index}`} data-resting={resting || undefined} data-testid="workout-set-card"
      className={`relative isolate rounded-lg border transition-colors ${resting ? 'border-primary' : next ? 'border-primary/40' : 'border-border/50'} ${pulsing ? 'workout-rest-pulse' : ''} ${className}`}>
      {resting && <div className="workout-rest-fill absolute inset-0 -z-10 rounded-[inherit] pointer-events-none" style={{ transform: `scaleX(${Math.max(0, Math.min(1, rest.remaining / Math.max(1, rest.total)))})` }} />}
      {children}
      {resting && <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1" data-testid="inline-rest">
        <div className="min-w-0"><span className="text-[10px] font-bold text-primary">DESCANSO</span><span role="timer" className="ml-2 text-2xl font-bold text-primary tabular-nums">{formatRestTime(rest.remaining)}</span></div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="outline" className="h-11 rounded-full border-primary/60 bg-background/40 px-3 text-xs text-primary" onClick={() => onAdd?.(15)}>+15s</Button>
          <Button variant="outline" className="h-11 rounded-full border-primary/60 bg-background/40 px-3 text-xs text-primary" onClick={() => onSkip?.()}>Pular</Button>
        </div>
      </div>}
    </div>
  );
}

/** Detect actual visibility below the fixed video, not just intersection with the viewport. */
export function RestOffscreenIndicator({ rest, onReveal, footer = false }: { rest: InlineRestState | null; onReveal?: () => void; footer?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const reveal = () => {
    onReveal?.();
    window.setTimeout(() => document.querySelector(`[data-workout-set="${rest?.exIdx}:${rest?.setIndex}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  };
  useEffect(() => {
    if (!rest) { setHidden(false); return; }
    const check = () => {
      const el = document.querySelector(`[data-workout-set="${rest.exIdx}:${rest.setIndex}"]`);
      const rect = el?.getBoundingClientRect();
      const headerBottom = document.querySelector('[data-testid="workout-header"]')?.getBoundingClientRect().bottom ?? 0;
      const footerTop = document.querySelector('[data-testid="workout-footer"]')?.getBoundingClientRect().top ?? window.innerHeight;
      let top = Math.max(0, headerBottom), bottom = footerTop;
      let parent = el?.parentElement;
      while (parent) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
          const bounds = parent.getBoundingClientRect();
          top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
        }
        parent = parent.parentElement;
      }
      setHidden(!rect || rect.bottom <= top || rect.top >= bottom);
    };
    check();
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    const id = window.setInterval(check, 300);
    return () => { window.removeEventListener('scroll', check, true); window.removeEventListener('resize', check); window.clearInterval(id); };
  }, [rest?.exIdx, rest?.setIndex, !!rest]);
  if (!rest || !hidden || rest.remaining <= 0) return null;
  return <Button variant="ghost" onClick={reveal} className={`${footer ? 'absolute bottom-full left-0 w-full' : 'fixed bottom-3 left-1/2 -translate-x-1/2 max-w-[90%]'} z-50 h-9 rounded-none border-t border-primary/30 bg-background/95 text-primary text-xs gap-2`} aria-label={`Voltar ao descanso da série ${rest.setIndex + 1}`}><Timer className="h-3.5 w-3.5" />{formatRestTime(rest.remaining)} · Série {rest.setIndex + 1}</Button>;
}