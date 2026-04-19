import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Share2, Download, Check, Clock, Flame, Calendar, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PHASE_LABELS, type TrainingPhase } from '@/lib/trainingPhase';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import logoMarombiew from '@/assets/logo_marombiew.png';

interface WorkoutSummaryShareProps {
  dayName: string;
  durationSeconds: number;
  exercisesCompleted: number;
  totalExercises: number;
  phase: TrainingPhase | null;
  onClose: () => void;
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const formatDuration = (totalSec: number) => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const formatDateBR = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export const WorkoutSummaryShare: React.FC<WorkoutSummaryShareProps> = ({
  dayName,
  durationSeconds,
  exercisesCompleted,
  totalExercises,
  phase,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [weekDays, setWeekDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const { user } = useAuth();
  const today = new Date();

  useEffect(() => {
    if (!user) return;
    const { start, end } = getWeekRange();
    supabase
      .from('daily_tracking')
      .select('date')
      .eq('student_id', user.id)
      .eq('workout_completed', true)
      .gte('date', start)
      .lte('date', end)
      .then(({ data }) => {
        const days = [false, false, false, false, false, false, false];
        // Mark today as completed (treino acabou de ser concluído)
        days[today.getDay()] = true;
        (data ?? []).forEach((row) => {
          // date string YYYY-MM-DD — parse to local weekday
          const [y, m, d] = row.date.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          days[dt.getDay()] = true;
        });
        setWeekDays(days);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const generateImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#0F1115',
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error('Falha ao gerar imagem');
      const file = new File([blob], `marombiew-treino-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Meu treino MAROMBIEW',
          text: `Acabei de finalizar ${dayName} em ${formatDuration(durationSeconds)}! 💪`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Imagem baixada!');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao compartilhar.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownload = async () => {
    setIsSharing(true);
    try {
      const blob = await generateImage();
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marombiew-treino-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Imagem baixada!');
    } catch {
      toast.error('Erro ao baixar.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col animate-fade-in overflow-y-auto">
      <div className="flex-1 p-4 flex flex-col items-center gap-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)' }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Treino Concluído!</h2>
          <p className="text-sm text-muted-foreground mt-1">Compartilhe seu resultado</p>
        </div>

        {/* Shareable card — 9:16 ratio for stories */}
        <div className="w-full max-w-[360px]">
          <div
            ref={cardRef}
            className="relative w-full overflow-hidden rounded-3xl"
            style={{
              aspectRatio: '9/16',
              background: 'linear-gradient(160deg, #0F1115 0%, #171A21 50%, #0F1115 100%)',
            }}
          >
            {/* Yellow glow */}
            <div
              className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20"
              style={{ background: '#FFC400' }}
            />
            <div
              className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full blur-3xl opacity-10"
              style={{ background: '#FFC400' }}
            />

            {/* Grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(#FFC400 1px, transparent 1px), linear-gradient(90deg, #FFC400 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />

            <div className="relative h-full flex flex-col justify-between p-6">
              {/* Header — centered logo */}
              <div className="flex flex-col items-center gap-2">
                <img
                  src={logoMarombiew}
                  alt="MAROMBIEW"
                  crossOrigin="anonymous"
                  className="h-24 w-auto object-contain"
                />
                {phase && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                    style={{ background: 'rgba(255,196,0,0.15)', color: '#FFC400', border: '1px solid rgba(255,196,0,0.3)' }}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                )}
              </div>

              {/* Center — main number */}
              <div className="flex flex-col items-center text-center">
                <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Tempo Total
                </p>
                <div
                  className="font-mono font-black tabular-nums leading-none"
                  style={{ color: '#FFC400', fontSize: '64px', textShadow: '0 0 40px rgba(255,196,0,0.4)' }}
                >
                  {formatDuration(durationSeconds)}
                </div>
                <h1
                  className="text-2xl font-black mt-6 leading-tight px-2"
                  style={{ color: '#FFFFFF' }}
                >
                  {dayName.toUpperCase()}
                </h1>
                <div
                  className="h-[2px] w-12 mt-4"
                  style={{ background: '#FFC400' }}
                />
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="rounded-2xl p-3 flex flex-col items-center"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <Flame className="h-5 w-5 mb-1" style={{ color: '#FFC400' }} />
                    <span className="text-xl font-black" style={{ color: '#FFFFFF' }}>
                      {exercisesCompleted}/{totalExercises}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Exercícios
                    </span>
                  </div>
                  <div
                    className="rounded-2xl p-3 flex flex-col items-center"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <Clock className="h-5 w-5 mb-1" style={{ color: '#FFC400' }} />
                    <span className="text-xl font-black" style={{ color: '#FFFFFF' }}>
                      {Math.max(1, Math.round(durationSeconds / 60))} min
                    </span>
                    <span className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Duração
                    </span>
                  </div>
                </div>

                {/* Weekday frequency row */}
                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-[9px] uppercase tracking-widest text-center mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Frequência da semana
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {/* Mon-first: indexes into weekDays which is Sun=0..Sat=6 */}
                    {[
                      { label: 'S', idx: 1 },
                      { label: 'T', idx: 2 },
                      { label: 'Q', idx: 3 },
                      { label: 'Q', idx: 4 },
                      { label: 'S', idx: 5 },
                      { label: 'S', idx: 6 },
                      { label: 'D', idx: 0 },
                    ].map((d, i) => {
                      const done = weekDays[d.idx];
                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div
                            className="h-7 w-7 rounded-full flex items-center justify-center"
                            style={{
                              background: done ? '#FFC400' : 'transparent',
                              border: done ? 'none' : '1.5px solid rgba(255,255,255,0.25)',
                            }}
                          >
                            {done && <Check className="h-4 w-4" style={{ color: '#0F1115' }} strokeWidth={3} />}
                          </div>
                          <span className="text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                            {d.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <Calendar className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {formatDateBR(today)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-[360px] space-y-2">
          <Button
            onClick={handleShare}
            disabled={isSharing}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-bold gap-2"
          >
            <Share2 className="h-5 w-5" />
            {isSharing ? 'Gerando...' : 'Compartilhar resultado'}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isSharing}
            variant="outline"
            className="w-full h-11 rounded-xl gap-2"
          >
            <Download className="h-4 w-4" />
            Baixar imagem
          </Button>
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full h-11 rounded-xl gap-2 text-muted-foreground"
          >
            <Check className="h-4 w-4" />
            Concluir
          </Button>
        </div>
      </div>
    </div>
  );
};
