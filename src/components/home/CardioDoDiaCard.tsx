import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { HeartPulse, Play, Bike, Activity, Footprints, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  parseCardioPayload,
  pickProtocolForToday,
  isWeeklyPlan,
  MODALITY_LABEL,
  STRUCTURE_LABEL,
  totalCardioDurationSec,
  formatDurationFromSec,
  type CardioModality,
} from '@/lib/cardioParser';
import { fetchExerciseImageByNames, getCachedExerciseImage, CARDIO_IMAGE_BY_MODALITY } from '@/lib/homeHeroImages';
import workoutHero from '@/assets/workout-hero.jpg';

interface CardioDoDiaCardProps {
  conteudo: string;
  planId?: string | null;
}

const MODALITY_ICON: Record<CardioModality, React.ComponentType<any>> = {
  passadeira: Footprints,
  bike: Bike,
  eliptica: Activity,
  escada: TrendingUp,
};

const CardioDoDiaCard: React.FC<CardioDoDiaCardProps> = ({ conteudo, planId = null }) => {
  const navigate = useNavigate();
  const payload = parseCardioPayload(conteudo);
  const dailyProtocol = payload ? pickProtocolForToday(payload) : null;
  const [heroImage, setHeroImage] = useState<string | null>(null);
  // O cardio em andamento aparece no card "Cardio em andamento" (home), não aqui.
  const protocol = dailyProtocol;

  const modality = protocol?.modality;
  useEffect(() => {
    if (!modality) return;
    let cancelled = false;
    const candidates = CARDIO_IMAGE_BY_MODALITY[modality] ?? ['PASSADEIRA (CORRIDA)'];
    const cached = getCachedExerciseImage(candidates);
    if (cached) setHeroImage(cached);
    fetchExerciseImageByNames(candidates).then((url) => {
      if (!cancelled) setHeroImage(url);
    });
    return () => { cancelled = true; };
  }, [modality]);

  if (!protocol) return null;

  const Icon = MODALITY_ICON[protocol.modality] || HeartPulse;
  const totalSec = totalCardioDurationSec(protocol);
  const sessionsCount = payload && isWeeklyPlan(payload) ? payload.protocols.length : 0;

  const handleClick = () => {
    navigate('/cardio-execucao', { state: { protocol, planId } });
  };

  return (
    <Card
      className="glass-card-solid overflow-hidden cursor-pointer group border-primary/20"
      onClick={handleClick}
    >
      <div className="relative h-40 overflow-hidden">
        <img
          src={heroImage || workoutHero}
          alt="Cardio do dia"
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Cardio do Dia</p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                {MODALITY_LABEL[protocol.modality]}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                {STRUCTURE_LABEL[protocol.structure]}
              </span>
            </div>
            <h3 className="text-sm font-bold uppercase truncate pr-6">
              {protocol.title}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDurationFromSec(totalSec)}
                {sessionsCount > 0 ? ` • ${sessionsCount} sessões/sem` : ` • ${protocol.frequencyPerWeek}x/sem`}
                {protocol.targetZoneSummary ? ` • ${protocol.targetZoneSummary}` : ''}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform">
            <Play className="h-4 w-4 text-primary-foreground ml-0.5" />
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CardioDoDiaCard;
