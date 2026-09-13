import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Dumbbell, Copy, Send, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { buildWhatsAppUrl } from '@/hooks/useNotifications';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import type { ExerciseLog } from '@/lib/weeklyProgression';
import {
  buildExerciseTracking, buildTrackingAudioScript, formatKg, formatSet,
  TRACKING_ACTION_LABEL, type ExerciseTracking, type TrackingAction,
} from '@/lib/workoutDayTracking';

interface Props {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planContent: string | null;
}

const HISTORY_DAYS = 90;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const WorkoutTrackingDialog: React.FC<Props> = ({ studentId, studentName, studentPhone, planContent }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<(ExerciseLog & { session_id?: string | null })[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [actions, setActions] = useState<Record<string, TrackingAction>>({});
  const [loadInputs, setLoadInputs] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'exercicios' | 'audio'>('exercicios');
  const [script, setScript] = useState('');

  const days: ParsedTrainingDay[] = useMemo(() => {
    if (!planContent) return [];
    return parseTrainingSections(planContent)
      .filter((s) => s.type === 'training')
      .flatMap((s) => s.days ?? []);
  }, [planContent]);

  const activeDay = days[dayIndex] ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - HISTORY_DAYS);
      const { data } = await supabase
        .from('exercise_set_logs')
        .select('exercise_name, weight_kg, reps, rir, rpe, set_type, set_number, performed_at, session_id')
        .eq('student_id', studentId)
        .gte('performed_at', since.toISOString())
        .order('performed_at', { ascending: false })
        .limit(2000);
      if (cancelled) return;
      setLogs((data ?? []) as (ExerciseLog & { session_id?: string | null })[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, studentId]);

  useEffect(() => {
    if (open) {
      setStep('exercicios');
      setActions({});
      setLoadInputs({});
      setDayIndex(0);
    }
  }, [open]);

  const tracking: ExerciseTracking[] = useMemo(() => {
    if (!activeDay) return [];
    return buildExerciseTracking(activeDay.exercises.map((e) => e.exercise), logs);
  }, [activeDay, logs]);

  const selections = useMemo(
    () => tracking
      .filter((t) => (actions[t.exerciseName] ?? 'none') !== 'none')
      .map((t) => {
        const raw = loadInputs[t.exerciseName];
        const parsed = raw != null ? Number(String(raw).replace(',', '.')) : NaN;
        return {
          tracking: t,
          action: actions[t.exerciseName],
          nextLoadKg: Number.isFinite(parsed) && parsed > 0 ? parsed : t.suggestedNextLoadKg,
        };
      }),
    [tracking, actions, loadInputs],
  );

  const handlePrepare = () => {
    if (selections.length === 0) {
      toast({ title: 'Marque pelo menos uma orientação', variant: 'destructive' });
      return;
    }
    setScript(buildTrackingAudioScript(studentName, activeDay?.day ?? '', selections));
    setStep('audio');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(script);
    toast({ title: 'Roteiro copiado' });
  };

  const handleWhatsApp = () => {
    if (!studentPhone) {
      toast({ title: 'Aluno sem telefone cadastrado', variant: 'destructive' });
      return;
    }
    // Modo áudio: abre só a conversa, sem texto preenchido.
    window.open(buildWhatsAppUrl(studentPhone, ''), '_blank');
  };

  const setAction = (name: string, action: TrackingAction) =>
    setActions((prev) => ({ ...prev, [name]: action }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Dumbbell className="h-3 w-3 mr-1" />
          Treino de hoje
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {step === 'audio' ? 'Roteiro do áudio' : `Acompanhar treino — ${studentName}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'exercicios' && (
          <div className="space-y-3">
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este aluno não tem plano de treino ativo.</p>
            ) : (
              <>
                <Select value={String(dayIndex)} onValueChange={(v) => setDayIndex(Number(v))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecionar treino" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {days.map((d, i) => (
                      <SelectItem key={`${d.day}-${i}`} value={String(i)}>{d.day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tracking.map((t) => {
                      const action = actions[t.exerciseName] ?? 'none';
                      const bestTxt = formatSet(t.best);
                      const lastTxt = formatSet(t.last);
                      const loadSeries = t.recent
                        .filter((r) => r.best.weightKg > 0)
                        .map((r) => formatKg(r.best.weightKg).replace(' kg', ''));
                      return (
                        <div key={t.exerciseName} className="rounded-md border border-border bg-secondary/20 p-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold leading-tight">{t.exerciseName}</p>
                            {t.last?.rir != null && (
                              <Badge variant="outline" className="text-[10px] shrink-0">RIR {t.last.rir}</Badge>
                            )}
                          </div>

                          {bestTxt ? (
                            <div className="text-[11px] text-muted-foreground space-y-0.5">
                              <p>Melhor: <span className="text-foreground">{bestTxt}</span></p>
                              {lastTxt && (
                                <p>
                                  Última{t.lastDate ? ` (${formatDate(t.lastDate)})` : ''}:{' '}
                                  <span className="text-foreground">{lastTxt}</span>
                                </p>
                              )}
                              {loadSeries.length > 1 && (
                                <p>Últimas cargas: {loadSeries.join(' → ')} kg</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">Sem registros nos últimos {HISTORY_DAYS} dias.</p>
                          )}

                          <div className="flex items-center gap-2">
                            <Select value={action} onValueChange={(v) => setAction(t.exerciseName, v as TrackingAction)}>
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-50">
                                {(Object.keys(TRACKING_ACTION_LABEL) as TrackingAction[]).map((k) => (
                                  <SelectItem key={k} value={k} className="text-xs">
                                    {TRACKING_ACTION_LABEL[k]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {action === 'increase_load' && (
                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-8 w-20 text-xs"
                                  inputMode="decimal"
                                  value={loadInputs[t.exerciseName]
                                    ?? (t.suggestedNextLoadKg != null ? String(t.suggestedNextLoadKg).replace('.', ',') : '')}
                                  onChange={(e) => setLoadInputs((p) => ({ ...p, [t.exerciseName]: e.target.value }))}
                                />
                                <span className="text-[11px] text-muted-foreground">kg</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button className="w-full" onClick={handlePrepare} disabled={loading}>
                  Preparar áudio
                  {selections.length > 0 && ` (${selections.length})`}
                </Button>
              </>
            )}
          </div>
        )}

        {step === 'audio' && (
          <div className="space-y-3">
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[200px] text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('exercicios')}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar roteiro
              </Button>
              <Button size="sm" onClick={handleWhatsApp}>
                <Send className="h-3.5 w-3.5 mr-1" /> Abrir WhatsApp
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O WhatsApp abre só a conversa — o áudio você grava manualmente.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutTrackingDialog;
