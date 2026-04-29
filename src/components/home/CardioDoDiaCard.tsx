import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { HeartPulse, Play, Bike, Activity, Footprints, TrendingUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { useActiveCardioSession, computeRemainingSec } from '@/hooks/useActiveCardioSession';

interface CardioDoDiaCardProps {
  conteudo: string;
}

const MODALITY_ICON: Record<CardioModality, React.ComponentType<any>> = {
  passadeira: Footprints,
  bike: Bike,
  eliptica: Activity,
  escada: TrendingUp,
};

const formatMMSS = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(m)}:${pad(s)}`;
};

const CardioDoDiaCard: React.FC<CardioDoDiaCardProps> = ({ conteudo }) => {
  const navigate = useNavigate();
  const payload = parseCardioPayload(conteudo);
  const dailyProtocol = payload ? pickProtocolForToday(payload) : null;
  const { session: activeSession, clear: clearActiveSession } = useActiveCardioSession();

  // If there is an active session, show that protocol; otherwise the daily one
  const protocol = activeSession?.protocol ?? dailyProtocol;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  if (!protocol) return null;

  const Icon = MODALITY_ICON[protocol.modality] || HeartPulse;
  const totalSec = totalCardioDurationSec(protocol);
  const sessionsCount = payload && isWeeklyPlan(payload) ? payload.protocols.length : 0;

  // Active session computed values
  const isActive = !!activeSession;
  const remainingSec = activeSession ? computeRemainingSec(activeSession) : 0;
  const currentBlock = activeSession?.protocol.blocks?.[activeSession.blockIndex];
  const totalBlocks = activeSession?.protocol.blocks?.length ?? 0;
  const phaseLabel = activeSession?.phase === 'prep'
    ? 'PREPARE-SE'
    : currentBlock?.name?.toUpperCase() || 'EM ANDAMENTO';

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Cancelar o cardio em andamento? O progresso será descartado.')) return;
    clearActiveSession();
    toast.success('Cardio cancelado.');
  };

  const handleClick = () => {
    // Resume active session if exists, otherwise start daily protocol
    navigate('/cardio-execucao', { state: { protocol } });
  };

  return (
    <Card
      className={`glass-card overflow-hidden cursor-pointer group border-primary/20 ${isActive ? 'ring-2 ring-primary/60 shadow-lg shadow-primary/10' : ''}`}
      onClick={handleClick}
    >
      <div className="relative p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        {isActive && (
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancelar cardio em andamento"
            className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/90 text-primary-foreground">
                  <span className="h-1 w-1 rounded-full bg-primary-foreground animate-pulse" />
                  Em andamento
                </span>
              ) : (
                <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Cardio do Dia</p>
              )}
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                {MODALITY_LABEL[protocol.modality]}
              </span>
              {!isActive && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-border bg-secondary text-muted-foreground">
                  {STRUCTURE_LABEL[protocol.structure]}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold uppercase truncate pr-6">
              {isActive ? phaseLabel : protocol.title}
            </h3>
            {isActive ? (
              <p className="text-[11px] text-primary font-mono font-bold mt-0.5 tabular-nums">
                ⏱ {formatMMSS(remainingSec)}
                {activeSession?.phase === 'block' && totalBlocks > 0 && (
                  <span className="text-muted-foreground font-sans font-normal ml-2">
                    Etapa {activeSession.blockIndex + 1}/{totalBlocks}
                  </span>
                )}
                {activeSession?.paused && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-yellow-500">Pausado</span>
                )}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDurationFromSec(totalSec)}
                {sessionsCount > 0 ? ` • ${sessionsCount} sessões/sem` : ` • ${protocol.frequencyPerWeek}x/sem`}
                {protocol.targetZoneSummary ? ` • ${protocol.targetZoneSummary}` : ''}
              </p>
            )}
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
