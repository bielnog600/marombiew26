import React from 'react';
import { Droplets, Minus } from 'lucide-react';

interface HydrationCardProps {
  currentMl: number;
  targetMl: number;
  onAdd: (ml: number) => void;
  onRemove: () => void;
}

const HydrationCard: React.FC<HydrationCardProps> = ({ currentMl, targetMl, onAdd, onRemove }) => {
  const pct = targetMl > 0 ? Math.min((currentMl / targetMl) * 100, 100) : 0;
  const [pulse, setPulse] = React.useState(false);

  const handleAdd = (ml: number) => {
    onAdd(ml);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 350);
  };

  const formatMl = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(1).replace('.', ',')} L` : `${ml} ml`);

  return (
    <div className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-chart-2/15 transition-transform duration-300 ${
              pulse ? 'scale-110' : 'scale-100'
            }`}
          >
            <Droplets className="h-4 w-4 text-chart-2" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Hidratação</p>
            <p className="text-[11px] text-muted-foreground">
              {formatMl(currentMl)} / {formatMl(targetMl)} · {Math.round(pct)}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover água"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleAdd(100)}
            className="h-8 rounded-full bg-chart-2/15 px-3 text-xs font-semibold text-chart-2 transition-colors hover:bg-chart-2/25"
          >
            +100 ml
          </button>
          <button
            type="button"
            onClick={() => handleAdd(250)}
            className="h-8 rounded-full bg-chart-2 px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            +250 ml
          </button>
        </div>
      </div>

      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-background/70">
        <div
          className="diet-bar-shine relative h-full overflow-hidden rounded-full bg-gradient-to-r from-chart-2/70 to-chart-2 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default HydrationCard;
