import { useLayoutEffect, useRef, useState } from 'react';
import { chooseSummaryFit, type SummaryFit } from '@/lib/fitSummaryLine';
import { cn } from '@/lib/utils';

interface Props {
  full: string;
  compact: string;
  /** Tamanho base (px) quando há espaço. */
  basePx?: number;
  minPx?: number;
  className?: string;
  testId?: string;
}

/**
 * Resumo de séries sempre em UMA linha: reduz a fonte até caber (mín. ~11px)
 * e, se ainda não couber, usa a forma compacta. Nunca quebra nem corta.
 */
export function FitSummaryLine({ full, compact, basePx = 14, minPx = 11, className, testId }: Props) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const compactRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<SummaryFit>({ variant: 'full', px: basePx });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const cs = window.getComputedStyle(box);
      const avail = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (avail <= 0) return;
      const next = chooseSummaryFit(avail, fullRef.current?.offsetWidth ?? 0, compactRef.current?.offsetWidth ?? 0, basePx, minPx);
      setFit((prev) => (prev.variant === next.variant && prev.px === next.px ? prev : next));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [full, compact, basePx, minPx]);

  const text = fit.variant === 'compact' ? compact : full;
  return (
    <span
      ref={boxRef}
      className={cn('relative block w-full min-w-0 whitespace-nowrap', className)}
      data-testid={testId}
      data-variant={fit.variant}
      title={full}
    >
      <span style={{ fontSize: `${fit.px}px` }}>{text}</span>
      {/* medidores invisíveis no tamanho base */}
      <span aria-hidden className="pointer-events-none invisible absolute inset-0 overflow-hidden">
        <span ref={fullRef} className="absolute left-0 top-0 whitespace-nowrap" style={{ fontSize: `${basePx}px` }}>{full}</span>
        <span ref={compactRef} className="absolute left-0 top-0 whitespace-nowrap" style={{ fontSize: `${basePx}px` }}>{compact}</span>
      </span>
    </span>
  );
}
