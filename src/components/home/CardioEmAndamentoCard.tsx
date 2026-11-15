import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCcw, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchExerciseImageByNames, getCachedExerciseImage, CARDIO_IMAGE_BY_MODALITY } from '@/lib/homeHeroImages';
import { STALE_WARMUP_TEXT, cardioSnapshotLabel, resumeStatus, stoppedAgoText, type CardioSnapshot } from '@/lib/cardioResume';
import { shortCardioTitle } from '@/lib/cardioChooser';
import workoutHero from '@/assets/workout-hero.jpg';

interface Props {
  snapshot: CardioSnapshot;
  onDiscard: () => Promise<void> | void;
}

/** "Cardio em andamento" na home — mesmo visual do card do TABATA em andamento. */
const CardioEmAndamentoCard: React.FC<Props> = ({ snapshot, onDiscard }) => {
  const navigate = useNavigate();
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const status = resumeStatus(snapshot, Date.now());
  const modality = snapshot.protocol.modality;

  useEffect(() => {
    let cancelled = false;
    const candidates = CARDIO_IMAGE_BY_MODALITY[modality] ?? ['PASSADEIRA (CORRIDA)'];
    const cached = getCachedExerciseImage(candidates);
    if (cached) setHeroImage(cached);
    fetchExerciseImageByNames(candidates).then((url) => { if (!cancelled) setHeroImage(url); });
    return () => { cancelled = true; };
  }, [modality]);

  const continuar = () => navigate('/cardio-execucao', {
    state: { protocol: snapshot.protocol, planId: snapshot.planId, resumeSnapshot: snapshot },
  });
  const recomecar = async () => {
    // Recomeçar = escolher de novo na tela nova (detalhe da sessão, ou a lista se o retrato é antigo).
    const index = snapshot.protocolIndex;
    await onDiscard();
    navigate(Number.isInteger(index) ? `/cardio/${index}` : '/cardio');
  };
  const descartar = () => {
    if (!window.confirm('Descartar este cardio em andamento? Ele não vai contar como feito.')) return;
    void onDiscard();
  };

  return (
    <Card className="glass-card-solid overflow-hidden ring-2 ring-primary/60 shadow-lg shadow-primary/10" data-testid="home-active-cardio">
      <div className="relative h-40 overflow-hidden">
        <img src={heroImage || workoutHero} alt="Cardio em andamento" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-primary/90 backdrop-blur rounded-full px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Em andamento</span>
        </div>
        <Button
          variant="ghost" size="icon" aria-label="Descartar cardio em andamento" onClick={descartar}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-card/70 text-foreground hover:bg-card"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">Cardio em andamento</p>
          <h3 className="text-base font-bold text-foreground mt-0.5 uppercase truncate">{shortCardioTitle(snapshot.protocol)}</h3>
          <p className="text-xs text-primary font-bold mt-0.5" data-testid="home-active-cardio-where">
            {cardioSnapshotLabel(snapshot)} · parou {stoppedAgoText(status.stoppedMs)}
          </p>
        </div>
      </div>
      <CardContent className="p-3 space-y-2">
        {status.stale && (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">{STALE_WARMUP_TEXT}</p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={continuar}>
            <Play className="h-4 w-4 mr-1" /> Continuar
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => void recomecar()}>
            <RotateCcw className="h-4 w-4 mr-1" /> Recomeçar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CardioEmAndamentoCard;
