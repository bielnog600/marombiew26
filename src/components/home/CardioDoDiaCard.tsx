import React from 'react';
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

interface CardioDoDiaCardProps {
  conteudo: string;
}

const MODALITY_ICON: Record<CardioModality, React.ComponentType<any>> = {
  passadeira: Footprints,
  bike: Bike,
  eliptica: Activity,
  escada: TrendingUp,
};

const CardioDoDiaCard: React.FC<CardioDoDiaCardProps> = ({ conteudo }) => {
  const navigate = useNavigate();
  const payload = parseCardioPayload(conteudo);
  const protocol = payload ? pickProtocolForToday(payload) : null;
  if (!protocol) return null;

  const Icon = MODALITY_ICON[protocol.modality] || HeartPulse;
  const totalSec = totalCardioDurationSec(protocol);
  const sessionsCount = payload && isWeeklyPlan(payload) ? payload.protocols.length : 0;

  return (
    <Card
      className="glass-card overflow-hidden cursor-pointer group border-primary/20"
      onClick={() => navigate('/cardio-execucao', { state: { protocol } })}
    >
      <div className="relative p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Cardio do Dia</p>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                {MODALITY_LABEL[protocol.modality]}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                {STRUCTURE_LABEL[protocol.structure]}
              </span>
            </div>
            <h3 className="text-sm font-bold uppercase truncate">{protocol.title}</h3>
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
