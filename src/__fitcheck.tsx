import { createRoot } from 'react-dom/client';
import './index.css';
import { FitSummaryLine } from '@/components/training/FitSummaryLine';
import { typedSetsSummary } from '@/lib/setTypes';
const mk = (n: number) => [{ target_reps: '12-15' }, { target_reps: '10' }, ...Array.from({ length: n }, () => ({ target_reps: '6-8' }))];
createRoot(document.getElementById('r')!).render(
  <div className="p-0 space-y-3">
    {[2, 3, 4, 6, 9].map((n) => (
      <div key={n} className="px-4 pt-0.5 flex flex-wrap items-center justify-center gap-1.5">
        <FitSummaryLine full={typedSetsSummary(mk(n))} compact={typedSetsSummary(mk(n), 'compact')} basePx={14}
          className="basis-full h-8 leading-8 px-2.5 rounded text-center text-foreground bg-secondary/80 font-semibold" testId={`c${n}`} />
        <span className="inline-flex items-center h-8 px-2.5 rounded text-sm text-primary bg-primary/10">RIR 1-2</span>
        <span className="inline-flex items-center h-8 px-2.5 rounded text-sm bg-secondary/80 text-foreground">90s</span>
      </div>
    ))}
  </div>,
);
