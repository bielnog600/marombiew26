import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RotateCcw, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { parseTabata } from '@/lib/tabataParser';
import { fetchExerciseImageByNames, getCachedExerciseImage, TABATA_FALLBACK_IMAGES } from '@/lib/homeHeroImages';
import {
  STALE_WARMUP_TEXT, resumeStatus, snapshotLabel, stoppedAgoText, type TabataSnapshot,
} from '@/lib/tabataResume';
import workoutHero from '@/assets/workout-hero.jpg';

interface Props {
  snapshot: TabataSnapshot;
  /** Fecha a sessão como abandonada (o card some). */
  onDiscard: () => Promise<void> | void;
}

/** "TABATA em andamento" na home — mesmo visual do card de continuar treino da musculação. */
const TabataEmAndamentoCard: React.FC<Props> = ({ snapshot, onDiscard }) => {
  const navigate = useNavigate();
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const status = resumeStatus(snapshot, Date.now());

  useEffect(() => {
    let cancelled = false;
    const candidates = [snapshot.exerciseName, ...TABATA_FALLBACK_IMAGES].filter(Boolean);
    const cached = getCachedExerciseImage(candidates);
    if (cached) setHeroImage(cached);
    fetchExerciseImageByNames(candidates).then((url) => { if (!cancelled) setHeroImage(url); });
    return () => { cancelled = true; };
  }, [snapshot.exerciseName]);

  const plan = () => parseTabata(snapshot.markdown);

  const continuar = () => {
    navigate('/tabata-execucao', { state: { tabata: plan(), planId: snapshot.planId, resumeSnapshot: snapshot } });
  };
  const recomecar = async () => {
    const tabata = plan();
    await onDiscard();
    navigate('/tabata-execucao', { state: { tabata, planId: snapshot.planId } });
  };
  const descartar = () => {
    if (!window.confirm('Descartar este TABATA em andamento? Ele não vai contar como feito.')) return;
    void onDiscard();
  };

  return (
    <Card className="glass-card-solid overflow-hidden ring-2 ring-primary/60 shadow-lg shadow-primary/10" data-testid="home-active-tabata">
      <div className="relative h-40 overflow-hidden">
        <img src={heroImage || workoutHero} alt="TABATA em andamento" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-primary/90 backdrop-blur rounded-full px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Em andamento</span>
        </div>
        <Button
          variant="ghost" size="icon" aria-label="Descartar TABATA em andamento" onClick={descartar}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-card/70 text-foreground hover:bg-card"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">TABATA em andamento</p>
          <h3 className="text-base font-bold text-foreground mt-0.5 uppercase truncate">{snapshot.title || 'TABATA'}</h3>
          <p className="text-xs text-primary font-bold mt-0.5" data-testid="home-active-tabata-where">
            {snapshotLabel(snapshot)} · parou {stoppedAgoText(status.stoppedMs)}
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

export default TabataEmAndamentoCard;
