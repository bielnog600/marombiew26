import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface WeeklyRoutineCardProps {
  trainingDaysCount: number;
  completedToday: boolean;
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const WeeklyRoutineCard: React.FC<WeeklyRoutineCardProps> = ({ trainingDaysCount, completedToday }) => {
  const today = new Date().getDay();

  return (
    <Card className="glass-card">
      <CardContent className="p-3 text-center">
        <Calendar className="h-5 w-5 text-primary mx-auto mb-1" />
        <div className="flex justify-center gap-[3px] mb-1">
          {WEEKDAYS.map((d, i) => {
            const isToday = i === today;
            const isTrainingDay = i > 0 && i <= trainingDaysCount;
            return (
              <div
                key={i}
                className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-semibold transition-all duration-300 ${
                  isToday && completedToday
                    ? 'bg-green-500 text-white scale-110 ring-1 ring-green-400/50'
                    : isToday
                    ? 'bg-primary text-primary-foreground scale-110 ring-1 ring-primary/50'
                    : isTrainingDay
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {d}
              </div>
            );
          })}
        </div>
        <p className="text-lg font-bold">{trainingDaysCount}<span className="text-xs text-muted-foreground">/7</span></p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {completedToday ? '✓ Feito!' : 'Semana'}
        </p>
      </CardContent>
    </Card>
  );
};

export default WeeklyRoutineCard;
