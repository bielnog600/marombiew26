import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dumbbell, Clock } from 'lucide-react';
import type { TrainingContext } from '@/lib/dietSchema';

interface Props {
  context?: TrainingContext | null;
  className?: string;
}

const PERIOD_LABEL: Record<string, string> = {
  manha: 'manhã',
  tarde: 'tarde',
  noite: 'noite',
};

const WEEKDAY_LABEL: Record<string, string> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui',
  sex: 'Sex', sab: 'Sáb', dom: 'Dom',
};

const LOAD_LABEL: Record<string, string> = {
  rest: 'Off',
  upper: 'Superiores',
  lower: 'Inferiores',
  full: 'Full',
  push: 'Push',
  pull: 'Pull',
  legs: 'Pernas',
  cardio: 'Cardio',
  tabata: 'Tabata',
  corrida: 'Corrida',
  mixed: 'Misto',
};

const TrainingContextSummary: React.FC<Props> = ({ context, className }) => {
  if (!context) return null;
  const { splitType, weeklySessions, defaultTime, daysOfWeek, summary } = context;
  const days = daysOfWeek
    ? Object.entries(daysOfWeek).filter(([, v]) => !!v)
    : [];
  const hasAny = splitType || weeklySessions != null || defaultTime || days.length > 0 || summary;
  if (!hasAny) return null;

  return (
    <Card className={`border-primary/20 bg-primary/5 ${className ?? ''}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <Dumbbell className="h-4 w-4" />
          Contexto de treino lido pela IA
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {splitType && (
            <span className="rounded-full bg-background/70 px-2 py-0.5 border border-border/60">
              Split: <strong>{splitType}</strong>
            </span>
          )}
          {typeof weeklySessions === 'number' && (
            <span className="rounded-full bg-background/70 px-2 py-0.5 border border-border/60">
              {weeklySessions}x/semana
            </span>
          )}
          {defaultTime && (
            <span className="rounded-full bg-background/70 px-2 py-0.5 border border-border/60 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {PERIOD_LABEL[defaultTime] || defaultTime}
            </span>
          )}
        </div>
        {days.length > 0 && (
          <div className="grid grid-cols-7 gap-1 text-[10px]">
            {(['seg','ter','qua','qui','sex','sab','dom'] as const).map((wd) => {
              const load = daysOfWeek?.[wd];
              const label = load ? (LOAD_LABEL[load.type] || load.type) : '—';
              const isRest = !load || load.type === 'rest';
              return (
                <div
                  key={wd}
                  className={`rounded-md px-1 py-1 text-center border ${
                    isRest
                      ? 'border-border/40 bg-background/40 text-muted-foreground'
                      : 'border-primary/30 bg-primary/10 text-foreground'
                  }`}
                  title={load?.notes || ''}
                >
                  <div className="font-semibold">{WEEKDAY_LABEL[wd]}</div>
                  <div className="truncate">{label}</div>
                </div>
              );
            })}
          </div>
        )}
        {summary && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">{summary}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default TrainingContextSummary;