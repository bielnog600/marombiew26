import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, Users, Zap, TrendingUp } from 'lucide-react';

export type FollowupFilter = 'hoje' | 'falados' | 'espera' | 'inativos' | 'progressao';

interface WeeklyAlertOverviewCardsProps {
  counts: {
    hoje: number;
    falados: number;
    espera: number;
    inativos: number;
    progressao?: number;
  };
  active: FollowupFilter;
  onChange: (filter: FollowupFilter) => void;
}

const WeeklyAlertOverviewCards: React.FC<WeeklyAlertOverviewCardsProps> = ({ 
  counts, 
  active, 
  onChange 
}) => {
  const cards = [
    { id: 'hoje', label: 'Para falar hoje', icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-500/10', count: counts.hoje },
    { id: 'progressao', label: 'Progressão Semana', icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10', count: counts.progressao || 0 },
    { id: 'falados', label: 'Já falados hoje', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', count: counts.falados },
    { id: 'espera', label: 'Aguardando', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', count: counts.espera },
    { id: 'inativos', label: 'Inativos +3d', icon: Users, color: 'text-destructive', bg: 'bg-destructive/10', count: counts.inativos },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map((card) => {
        const isActive = active === card.id;
        const Icon = card.icon;
        return (
          <Card 
            key={card.id}
            className={`glass-card cursor-pointer transition-all border-2 ${
              isActive ? 'border-primary shadow-lg shadow-primary/10' : 'border-transparent hover:bg-secondary/40'
            }`}
            onClick={() => onChange(card.id)}
          >
            <CardContent className="p-3 flex flex-col items-center text-center gap-2">
              <div className={`p-2 rounded-xl ${card.bg} ${card.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight leading-tight">
                  {card.label}
                </p>
                <p className="text-lg font-bold">
                  {card.count}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WeeklyAlertOverviewCards;
