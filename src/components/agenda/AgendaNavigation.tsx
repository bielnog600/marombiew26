import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  viewMode: 'day' | 'week' | 'month';
  currentDate: Date;
  onViewModeChange: (m: 'day' | 'week' | 'month') => void;
  onNavigate: (dir: number) => void;
  onGoToToday: () => void;
}

export const AgendaNavigation: React.FC<Props> = ({ viewMode, currentDate, onViewModeChange, onNavigate, onGoToToday }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 w-full bg-secondary/20 p-1 rounded-lg">
        {(['day', 'week', 'month'] as const).map(m => (
          <Button
            key={m}
            size="sm"
            variant={viewMode === m ? 'default' : 'ghost'}
            onClick={() => onViewModeChange(m)}
            className="capitalize flex-1 h-8 text-xs font-medium"
          >
            {m === 'day' ? 'Dia' : m === 'week' ? 'Semana' : 'Mês'}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => onNavigate(-1)} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onGoToToday} className="h-8 text-xs font-medium">
            Hoje
          </Button>
          <Button size="icon" variant="outline" onClick={() => onNavigate(1)} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-bold text-foreground">
          {format(currentDate, "EEE, dd 'de' MMMM", { locale: ptBR })}
        </span>
      </div>
    </div>
  );
};
