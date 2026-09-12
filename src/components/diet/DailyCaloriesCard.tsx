import React from 'react';
import { Beef, Wheat, Droplet } from 'lucide-react';

interface MacroValue {
  current: number;
  target: number;
}

interface DailyCaloriesCardProps {
  consumed: number;
  target: number;
  protein: MacroValue;
  carbs: MacroValue;
  fats: MacroValue;
}

const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

const MacroPill: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: MacroValue;
  colorClass: string;
  trackClass: string;
}> = ({ label, icon, value, colorClass, trackClass }) => {
  const pct = value.target > 0 ? Math.min((value.current / value.target) * 100, 100) : 0;
  return (
    <div className="flex-1 rounded-xl bg-background/50 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className={colorClass}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold text-foreground">
        {round(value.current)}
        <span className="text-[11px] font-medium text-muted-foreground">/{round(value.target)}g</span>
      </p>
      <div className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${trackClass}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const DailyCaloriesCard: React.FC<DailyCaloriesCardProps> = ({ consumed, target, protein, carbs, fats }) => {
  const safeTarget = target > 0 ? target : 0;
  const pct = safeTarget > 0 ? Math.min((consumed / safeTarget) * 100, 100) : 0;
  const remaining = Math.max(safeTarget - consumed, 0);

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-secondary/50 to-background p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-[86px] w-[86px] shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              strokeWidth="7"
              className="stroke-border/60"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              className="stroke-primary transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold leading-none text-foreground">{Math.round(pct)}%</span>
            <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">consumido</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Calorias de hoje</p>
          <p className="mt-0.5 text-xl font-bold text-foreground">
            {round(consumed)}
            <span className="text-sm font-medium text-muted-foreground"> / {round(safeTarget)} kcal</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold text-primary">
            {remaining > 0 ? `Restam ${round(remaining)} kcal` : 'Meta atingida'}
          </p>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-background/70">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)] transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <MacroPill
          label="Proteína"
          icon={<Beef className="h-3.5 w-3.5" />}
          value={protein}
          colorClass="text-chart-2"
          trackClass="bg-chart-2/15"
        />
        <MacroPill
          label="Carbo"
          icon={<Wheat className="h-3.5 w-3.5" />}
          value={carbs}
          colorClass="text-chart-3"
          trackClass="bg-chart-3/15"
        />
        <MacroPill
          label="Gordura"
          icon={<Droplet className="h-3.5 w-3.5" />}
          value={fats}
          colorClass="text-chart-5"
          trackClass="bg-chart-5/15"
        />
      </div>
    </div>
  );
};

export default DailyCaloriesCard;
