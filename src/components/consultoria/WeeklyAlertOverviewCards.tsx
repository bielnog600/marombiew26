import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertOctagon, TrendingDown, FileQuestion } from 'lucide-react';
import type { StudentWeeklySummary } from '@/hooks/useStudentsWeeklySummary';

type Filter = 'all' | 'atencao' | 'sem_progresso' | 'dados';

interface Props {
  summaries: StudentWeeklySummary[];
  active: Filter;
  onChange: (f: Filter) => void;
}

const WeeklyAlertOverviewCards: React.FC<Props> = ({ summaries, active, onChange }) => {
  const atencao = summaries.filter((s) =>
    ['regressao', 'baixa_aderencia', 'reanalisar'].includes(s.attention)
  ).length;
  const semProg = summaries.filter((s) => s.attention === 'sem_progresso').length;
  const dados = summaries.filter((s) => s.attention === 'dados_insuficientes').length;

  const cards: { key: Filter; label: string; value: number; icon: any; color: string }[] = [
    { key: 'atencao', label: 'Precisam de atenção', value: atencao, icon: AlertOctagon, color: 'text-destructive' },
    { key: 'sem_progresso', label: 'Sem progresso', value: semProg, icon: TrendingDown, color: 'text-amber-500' },
    { key: 'dados', label: 'Dados insuficientes', value: dados, icon: FileQuestion, color: 'text-muted-foreground' },
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
            onClick={() => onChange(isActive ? 'all' : c.key)}
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