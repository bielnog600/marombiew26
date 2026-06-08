import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsProps {
  todayCount: number;
  nextEvent: string;
  nextStudent: string;
  pendingCount: number;
  cancelledCount: number;
}

export const AgendaStats: React.FC<StatsProps> = ({ todayCount, nextEvent, nextStudent, pendingCount, cancelledCount }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="bg-card border-border/50">
        <CardContent className="px-2 py-1.5 text-center">
          <p className="text-base font-bold text-primary leading-tight">{todayCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium leading-tight">Hoje</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="px-2 py-1.5 text-center">
          <p className="text-xs font-bold text-foreground truncate leading-tight">{nextEvent}</p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">{nextStudent}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="px-2 py-1.5 text-center">
          <p className="text-base font-bold text-amber-500 leading-tight">{pendingCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium leading-tight">Pendentes</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="px-2 py-1.5 text-center">
          <p className="text-base font-bold text-red-400 leading-tight">{cancelledCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium leading-tight">Cancelados</p>
        </CardContent>
      </Card>
    </div>
  );
};
