import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Dumbbell, Save, Loader2, ChevronDown, ChevronUp, Calendar, Send, ClipboardList, Plus, Sparkles, Activity, Wand2, Zap, GitCompare, RefreshCw, Users } from 'lucide-react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import TrainingResultCards from '@/components/TrainingResultCards';
import TrainerLogSheet from '@/components/training/TrainerLogSheet';
import DuoTrainerLogSheet from '@/components/training/DuoTrainerLogSheet';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { rebuildTrainingMarkdown } from '@/lib/trainingResultParser';
import AiEditAllDaysDialog from '@/components/training/AiEditAllDaysDialog';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  TRAINING_PHASES,
  PHASE_LABELS,
  PHASE_SHORT_LABELS,
  PHASE_BADGE_CLASS,
  PHASE_DESCRIPTIONS,
  getPhasePreview,
  type TrainingPhase,
} from '@/lib/trainingPhase';

interface StudentTrainingTabProps {
  studentId: string;
}

const StudentTrainingTab: React.FC<StudentTrainingTabProps> = ({ studentId }) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedMarkdowns, setEditedMarkdowns] = useState<Record<string, string>>({});
  const [editedPhases, setEditedPhases] = useState<Record<string, TrainingPhase>>({});
  const [editedStartDates, setEditedStartDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [transferPlan, setTransferPlan] = useState<any | null>(null);
  const [students, setStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [targetStudentId, setTargetStudentId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [trainPlan, setTrainPlan] = useState<any | null>(null);
  const [duoTrainOpen, setDuoTrainOpen] = useState(false);
  const [aiAllDaysOpen, setAiAllDaysOpen] = useState<string | null>(null);
  const editedMarkdownsRef = useRef<Record<string, string>>({});

  const getEffectivePlan = (plan: any) => {
    const hasEditedMarkdown = Object.prototype.hasOwnProperty.call(editedMarkdownsRef.current, plan.id);
    return {
      ...plan,
      conteudo: hasEditedMarkdown ? editedMarkdownsRef.current[plan.id] : plan.conteudo,
      fase: editedPhases[plan.id] ?? plan.fase,
      fase_inicio_data: editedStartDates[plan.id] ?? plan.fase_inicio_data,
    };
  };

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Treino deletado.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    const { data } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });
    setPlans(data ?? []);
  };

  const handleMarkdownChange = (planId: string, newMarkdown: string) => {
    editedMarkdownsRef.current = { ...editedMarkdownsRef.current, [planId]: newMarkdown };
    setEditedMarkdowns(prev => ({ ...prev, [planId]: newMarkdown }));
  };

  const handlePhaseChange = (planId: string, phase: TrainingPhase) => {
    setEditedPhases(prev => ({ ...prev, [planId]: phase }));
  };

  const handleStartDateChange = (planId: string, date: string) => {
    setEditedStartDates(prev => ({ ...prev, [planId]: date }));
  };

  const handleSave = async (planId: string) => {
    const updates: Record<string, any> = {};
    if (editedMarkdowns[planId] !== undefined) updates.conteudo = editedMarkdowns[planId];
    if (editedPhases[planId] !== undefined) updates.fase = editedPhases[planId];
    if (editedStartDates[planId] !== undefined) {
      updates.fase_inicio_data = editedStartDates[planId] || null;
    }
    if (Object.keys(updates).length === 0) return;

    setSaving(planId);
    const { error } = await supabase.from('ai_plans').update(updates).eq('id', planId);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Treino salvo com sucesso!');
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, ...updates } : p));
      setTrainPlan(prev => prev?.id === planId ? { ...prev, ...updates } : prev);
      const nextEditedRef = { ...editedMarkdownsRef.current };
      delete nextEditedRef[planId];
      editedMarkdownsRef.current = nextEditedRef;
      setEditedMarkdowns(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedPhases(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedStartDates(prev => { const c = { ...prev }; delete c[planId]; return c; });
    }
    setSaving(null);
  };

  if (plans.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          Nenhum treino gerado ainda. Use a aba IA para gerar treinos.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {plans.map(plan => {
          const isExpanded = expandedId === plan.id;
          const currentPhase = (editedPhases[plan.id] ?? plan.fase ?? 'semana_1') as TrainingPhase;
          const currentStartDate = editedStartDates[plan.id] ?? plan.fase_inicio_data ?? '';
          const hasChanges =
            editedMarkdowns[plan.id] !== undefined ||
            editedPhases[plan.id] !== undefined ||
            editedStartDates[plan.id] !== undefined;
          const currentMarkdown = editedMarkdowns[plan.id] !== undefined ? editedMarkdowns[plan.id] : plan.conteudo;

          const currentDays: ParsedTrainingDay[] = parseTrainingSections(currentMarkdown || '').flatMap(s => s.days || []);

          return (
            <Card key={plan.id} className="glass-card">
              <CardContent className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : plan.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Dumbbell className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{plan.titulo}</p>
                        {plan.migration_status === 'completed' && (
                          <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase text-emerald-500 border-emerald-500/30">JSON</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PHASE_BADGE_CLASS[currentPhase]}`}>
                          {PHASE_SHORT_LABELS[currentPhase]}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      title="Treinar aluno"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTrainPlan(getEffectivePlan(plan));
                      }}
                    >
                      <ClipboardList className="h-3 w-3" /> Treinar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                      title="Treino Duo (2 alunos)"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDuoTrainOpen(true);
                        setTrainPlan(getEffectivePlan(plan));
                      }}
                    >
                      <Users className="h-3 w-3" /> Duo
                    </Button>
                    <WhatsAppNotifyPlanButton
                      plan={plan}
                      studentId={studentId}
                      onNotified={(planId, notifiedAt, count) =>
                        setPlans(prev => prev.map(p =>
                          p.id === planId ? { ...p, whatsapp_notified_at: notifiedAt, whatsapp_notified_count: count } : p
                        ))
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deletar treino?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(plan.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Deletar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {hasChanges && (
                      <Button
                        size="sm"
                        className="h-7 gap-1 px-3 text-xs"
                        disabled={saving === plan.id}
                        onClick={(e) => { e.stopPropagation(); handleSave(plan.id); }}
                      >
                        {saving === plan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar
                      </Button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    {/* Ações Híbridas - Central de Ação Individual */}
                    <div className="flex flex-wrap gap-2 pb-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-primary/5 border-primary/20"
                        onClick={() => navigate(`/treino-ia/${studentId}?edit=${plan.id}`)}
                      >
                        <Wand2 className="h-3.5 w-3.5 text-primary" />
                        Ajustar com IA
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-orange-500/5 border-orange-500/20 text-orange-600"
                        onClick={() => navigate(`/treino-ia/${studentId}?edit=${plan.id}&mode=adjust`)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Ajuste Rápido
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-blue-500/5 border-blue-500/20 text-blue-600"
                        onClick={() => navigate(`/treino-ia/${studentId}`)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Renovar Bloco
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Fase semanal</Label>
                        <Select value={currentPhase} onValueChange={(v) => handlePhaseChange(plan.id, v as TrainingPhase)}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRAINING_PHASES.map(p => (
                              <SelectItem key={p} value={p}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{PHASE_LABELS[p]}</span>
                                  <span className="text-[10px] text-muted-foreground">{PHASE_DESCRIPTIONS[p]}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Início do ciclo (auto)
                        </Label>
                        <Input
                          type="date"
                          value={currentStartDate}
                          onChange={(e) => handleStartDateChange(plan.id, e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <TrainingResultCards
                      markdown={currentMarkdown}
                      editable={true}
                      trainingOnly={true}
                      onMarkdownChange={(newMd) => handleMarkdownChange(plan.id, newMd)}
                    />

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs rounded-xl"
                        onClick={() => {
                          const existingDays = currentDays;
                          const allDayNames = ['SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO','DOMINGO'];
                          const usedDays = existingDays.map(d => d.day.toUpperCase());
                          const nextDay = allDayNames.find(d => !usedDays.includes(d)) || `TREINO ${String.fromCharCode(65 + existingDays.length)}`;
                          const updatedDays = [...existingDays, {
                            day: nextDay,
                            exercises: [{ exercise: 'Novo exercício', series: '3', series2: '', reps: '8-12', rir: '', pause: '60s', description: '', variation: '' }],
                          }];
                          handleMarkdownChange(plan.id, rebuildTrainingMarkdown(currentMarkdown, updatedDays));
                          toast.success(`${nextDay} adicionado.`);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar dia
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs rounded-xl bg-violet-500/5 border-violet-500/20 text-violet-600"
                        onClick={() => setAiAllDaysOpen(plan.id)}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> IA: Ajuste Geral
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {trainPlan && (
        <TrainerLogSheet
          open={!!trainPlan}
          onOpenChange={(v) => !v && setTrainPlan(null)}
          studentId={studentId}
          days={parseTrainingSections(trainPlan.conteudo || '').flatMap(s => s.days || [])}
          phase={trainPlan.fase}
        />
      )}

      {duoTrainOpen && trainPlan && (
        <DuoTrainerLogSheet
          open={duoTrainOpen}
          onOpenChange={setDuoTrainOpen}
          studentAId={studentId}
          planA={trainPlan}
        />
      )}

      {aiAllDaysOpen && (
        <AiEditAllDaysDialog
          open={!!aiAllDaysOpen}
          onOpenChange={(v) => !v && setAiAllDaysOpen(null)}
          allDays={parseTrainingSections(plans.find(p => p.id === aiAllDaysOpen)?.conteudo || '').flatMap(s => s.days || [])}
          studentId={studentId}
          onApply={(updatedDays) => {
            handleMarkdownChange(aiAllDaysOpen, rebuildTrainingMarkdown(plans.find(p => p.id === aiAllDaysOpen)?.conteudo || '', updatedDays));
            setAiAllDaysOpen(null);
          }}
        />
      )}
    </>
  );
};

export default StudentTrainingTab;
