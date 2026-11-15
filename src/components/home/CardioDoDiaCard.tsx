import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Check, ChevronRight, HeartPulse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { MODALITY_LABEL } from '@/lib/cardioParser';
import { optionStatuses, optionsSubtitle } from '@/lib/cardioChooser';
import { useCardioChoice } from '@/hooks/useCardioChoice';

interface CardioDoDiaCardProps {
  conteudo: string;
  planId?: string | null;
}

/** Card "Cardio" da home: o aluno escolhe qual cardio fazer na tela /cardio. */
const CardioDoDiaCard: React.FC<CardioDoDiaCardProps> = ({ conteudo, planId = null }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const data = useCardioChoice(user?.id, { conteudo, planId });
  const statuses = useMemo(() => optionStatuses(data.options, data.sessions, data.planId), [data.options, data.sessions, data.planId]);

  if (!data.options.length) return null;

  return (
    <Card
      role="button" tabIndex={0} data-testid="home-cardio-card"
      className="glass-card-solid cursor-pointer border-primary/20 p-4 min-h-[10rem] flex flex-col justify-between gap-4"
      onClick={() => navigate('/cardio', { state: { conteudo, planId: data.planId } })}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate('/cardio', { state: { conteudo, planId: data.planId } }); }}
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
          <HeartPulse className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black leading-tight">Cardio</h3>
          <p className="text-xs text-muted-foreground">{optionsSubtitle(data.options.length)}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.options.map((p, i) => {
          const done = !!statuses[i]?.weekSession;
          return (
            <span
              key={i} data-done={done ? 'true' : 'false'}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border',
                done ? 'bg-tabata-rest/15 border-tabata-rest/40 text-tabata-rest' : 'bg-secondary border-border text-foreground',
              )}
            >
              {done && <Check className="h-3 w-3" strokeWidth={3} />}
              {MODALITY_LABEL[p.modality]}
            </span>
          );
        })}
      </div>
    </Card>
  );
};

export default CardioDoDiaCard;
