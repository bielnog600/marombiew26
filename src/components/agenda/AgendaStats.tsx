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
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{todayCount}</p>
          <p className="text-xs text-muted-foreground font-medium">Hoje</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="p-3 text-center">
          <p className="text-sm font-bold text-foreground truncate">{nextEvent}</p>
          <p className="text-xs text-muted-foreground truncate">{nextStudent}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
          <p className="text-xs text-muted-foreground font-medium">Pendentes</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{cancelledCount}</p>
          <p className="text-xs text-muted-foreground font-medium">Cancelados</p>
        </CardContent>
      </Card>
    </div>
  );
};
