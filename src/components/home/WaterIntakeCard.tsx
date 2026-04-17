import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Plus, Minus } from 'lucide-react';

interface WaterIntakeCardProps {
  glasses: number;
  goal: number;
  currentMl?: number;
  targetMl?: number;
  onAdd: () => void;
  onRemove: () => void;
}

const formatLiters = (ml: number) => (ml / 1000).toFixed(2).replace(/\.?0+$/, '');

const WaterIntakeCard: React.FC<WaterIntakeCardProps> = ({ glasses, goal, currentMl, targetMl, onAdd, onRemove }) => {
  const percentage = Math.min((glasses / goal) * 100, 100);
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedPct(percentage), 100);
    return () => clearTimeout(timeout);
  }, [percentage]);

  return (
    <Card className="glass-card overflow-hidden relative">
      <CardContent className="p-3 text-center relative z-10">
        <div className="relative mx-auto mb-1 w-10 h-14 rounded-b-lg rounded-t-sm border-2 border-primary/40 overflow-hidden">
          {/* Water fill */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
            style={{ height: `${animatedPct}%` }}
          >
            {/* Wave animation */}
            <div className="absolute inset-0 bg-gradient-to-t from-blue-500/80 to-blue-400/60" />
            <svg
              className="absolute top-0 left-0 w-full"
              viewBox="0 0 40 6"
              preserveAspectRatio="none"
              style={{ transform: 'translateY(-3px)' }}
            >
              <path
                d="M0 3 Q5 0 10 3 Q15 6 20 3 Q25 0 30 3 Q35 6 40 3 V6 H0 Z"
                fill="hsl(210 100% 60% / 0.6)"
              >
                <animate
                  attributeName="d"
                  dur="2s"
                  repeatCount="indefinite"
                  values="
                    M0 3 Q5 0 10 3 Q15 6 20 3 Q25 0 30 3 Q35 6 40 3 V6 H0 Z;
                    M0 3 Q5 6 10 3 Q15 0 20 3 Q25 6 30 3 Q35 0 40 3 V6 H0 Z;
                    M0 3 Q5 0 10 3 Q15 6 20 3 Q25 0 30 3 Q35 6 40 3 V6 H0 Z
                  "
                />
              </path>
            </svg>
          </div>
          {/* Glass icon overlay */}
          <Droplets className="absolute inset-0 m-auto h-4 w-4 text-primary-foreground/70 z-10" />
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="h-5 w-5 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus className="h-3 w-3 text-muted-foreground" />
          </button>
          <p className="text-lg font-bold tabular-nums">{glasses}<span className="text-xs text-muted-foreground">/{goal}</span></p>
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Plus className="h-3 w-3 text-primary" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Água</p>
      </CardContent>
    </Card>
  );
};

export default WaterIntakeCard;
