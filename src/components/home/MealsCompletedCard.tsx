import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { UtensilsCrossed } from 'lucide-react';

interface MealsCompletedCardProps {
  completed: number;
  total: number;
}

const MealsCompletedCard: React.FC<MealsCompletedCardProps> = ({ completed, total }) => {
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <Card className="glass-card">
      <CardContent className="p-3 text-center">
        <UtensilsCrossed className="h-5 w-5 text-chart-4 mx-auto mb-1" />
        {/* Mini progress ring */}
        <div className="relative mx-auto w-10 h-10 mb-1">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18" cy="18" r="14"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="3"
            />
            <circle
              cx="18" cy="18" r="14"
              fill="none"
              stroke="hsl(var(--chart-4))"
              strokeWidth="3"
              strokeDasharray={`${pct * 0.88} 88`}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
            {completed}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Refeições</p>
      </CardContent>
    </Card>
  );
};

export default MealsCompletedCard;
