import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, CheckCircle2, Clock } from 'lucide-react';

export type FollowupFilter = 'hoje' | 'falados' | 'espera';

interface Props {
  counts: { hoje: number; falados: number; espera: number };
  active: FollowupFilter;
  onChange: (f: FollowupFilter) => void;
}

const WeeklyAlertOverviewCards: React.FC<Props> = ({ counts, active, onChange }) => {
  const cards: { key: FollowupFilter; label: string; value: number; icon: any; color: string }[] = [
    { key: 'hoje', label: 'Para falar hoje', value: counts.hoje, icon: MessageCircle, color: 'text-primary' },
    { key: 'falados', label: 'Já falados', value: counts.falados, icon: CheckCircle2, color: 'text-emerald-500' },
    { key: 'espera', label: 'Voltam depois', value: counts.espera, icon: Clock, color: 'text-amber-500' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => {
        const isActive = active === c.key;
        return (
          <Card
            key={c.key}
            className={`cursor-pointer transition-all border ${
              isActive ? 'border-primary bg-primary/10 shadow-md shadow-primary/10' : 'glass-card hover:bg-secondary/50'
            }`}
            onClick={() => onChange(c.key)}
          >
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className={`rounded-lg p-1.5 bg-secondary ${c.color}`}>
                <c.icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground leading-tight uppercase truncate">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WeeklyAlertOverviewCards;
