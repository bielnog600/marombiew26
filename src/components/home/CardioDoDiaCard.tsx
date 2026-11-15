import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Check, ChevronRight, HeartPulse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { MODALITY_LABEL } from '@/lib/cardioParser';
import { optionStatuses, optionsSubtitle } from '@/lib/cardioChooser';
import { useCardioChoice } from '@/hooks/useCardioChoice';
import cardioHero from '@/assets/cardio-hero.jpg';

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

  const open = () => navigate('/cardio', { state: { conteudo, planId: data.planId } });

  // Mesmo padrão do card do TABATA ao lado no carrossel: foto, gradiente escuro e textos embaixo.
  return (
    <Card
      role="button" tabIndex={0} data-testid="home-cardio-card"
      className="glass-card-solid overflow-hidden cursor-pointer group border-primary/20"
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="hero-card-media h-40">
        <img
          src={cardioHero}
          alt="Cardio"
          width={1024}
          height={512}
          loading="eager"
          decoding="async"
          className="hero-card-img"
        />
        <div className="hero-card-gradient absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <HeartPulse className="h-3.5 w-3.5 text-primary shrink-0" />
              {data.options.map((p, i) => {
                const done = !!statuses[i]?.weekSession;
                return (
                  <span
                    key={i} data-done={done ? 'true' : 'false'}
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                      done ? 'bg-tabata-rest/20 border-tabata-rest/50 text-tabata-rest' : 'bg-secondary/80 border-border text-foreground',
                    )}
                  >
                    {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    {MODALITY_LABEL[p.modality]}
                  </span>
                );
              })}
            </div>
            <h3 className="text-sm font-bold uppercase truncate">Cardio</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{optionsSubtitle(data.options.length)}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform">
            <ChevronRight className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CardioDoDiaCard;
