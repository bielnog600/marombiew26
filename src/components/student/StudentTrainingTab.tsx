import React, { useEffect, useRef, useState, useMemo } from 'react';
import PeriodizationCard from '@/components/training/PeriodizationCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Dumbbell, Save, Loader2, ChevronDown, ChevronUp, Calendar, Send, ClipboardList, Plus, Sparkles, Activity, Wand2, Zap, GitCompare, RefreshCw, Users, Settings2, Weight, BarChart3 } from 'lucide-react';
import { Trash2, Copy, User } from 'lucide-react';
import { BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import TrainingResultCards from '@/components/TrainingResultCards';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { rebuildTrainingMarkdown } from '@/lib/trainingResultParser';
import { saveWorkoutPlanFromMarkdown, saveWorkoutPlanJSON } from '@/lib/workoutPlanRepo';
import {
  normalizeWorkoutPlan,
  workoutPlanToParsedDays,
  newId,
  type WorkoutPlan,
} from '@/lib/workoutSchema';
import { workoutPlanToMarkdown } from '@/lib/workoutMarkdownSerializer';
import { applyParsedDayToPlan } from '@/lib/workoutPlanEdit';
import {
  recordWorkoutPrescriptionEdit,
  type PrescriptionContextInput,
} from '@/lib/prescriptionEdits';
import AiEditAllDaysDialog from '@/components/training/AiEditAllDaysDialog';
import TemplatesDialog from '@/components/training/TemplatesDialog';
import LoadIncrementsDialog from '@/components/training/LoadIncrementsDialog';
import WeeklyAdherenceBanner from '@/components/training/WeeklyAdherenceBanner';
import { useWeeklyTraining } from '@/hooks/useWeeklyTraining';
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
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
import { ProgressionAnalyticsCard } from '@/components/training/ProgressionAnalyticsCard';

interface StudentTrainingTabProps {
  studentId: string;
}

const StudentTrainingTab: React.FC<StudentTrainingTabProps> = ({ studentId }) => {
  const navigate = useNavigate();
  const adminSession = useAdminTrainerSession();
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
  const [trainModeChoice, setTrainModeChoice] = useState<any | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [aiAllDaysOpen, setAiAllDaysOpen] = useState<string | null>(null);
  const [templatesFor, setTemplatesFor] = useState<any | null>(null);
  const [incrementsFor, setIncrementsFor] = useState<string[] | null>(null);
  const editedMarkdownsRef = useRef<Record<string, string>>({});
  const [starting, setStarting] = useState(false);

  /**
   * Etapa 2C — edição JSON-first na aba do aluno.
   * `editedPlans` guarda o WorkoutPlan v2 em edição; `baselinePlansRef` guarda
   * o ÚLTIMO estado persistido (BEFORE do diff), atualizado após cada save.
   */
  const [editedPlans, setEditedPlans] = useState<Record<string, WorkoutPlan>>({});
  const baselinePlansRef = useRef<Record<string, WorkoutPlan>>({});
  const aiAssistedRef = useRef<Record<string, boolean>>({});

  const getBaselinePlan = (plan: any): WorkoutPlan | null => {
    const cached = baselinePlansRef.current[plan.id];
    if (cached) return cached;
    const normalized = normalizeWorkoutPlan(plan?.conteudo_json);
    if (normalized) baselinePlansRef.current[plan.id] = normalized;
    return normalized;
  };

  /** Plano v2 atualmente exibido (editado se houver, senão o persistido). */
  const getCurrentPlanV2 = (plan: any): WorkoutPlan | null =>
    editedPlans[plan.id] ?? getBaselinePlan(plan);

  const handleWorkoutPlanChange = (planId: string, next: WorkoutPlan) => {
    setEditedPlans((prev) => ({ ...prev, [planId]: next }));
  };

  const markAiAssisted = (planId: string) => {
    aiAssistedRef.current = { ...aiAssistedRef.current, [planId]: true };
  };

  /** Contexto congelado no save. Nada é inferido — sem evidência vira null. */
  const buildEditContext = (plan: any): PrescriptionContextInput => ({
    objective: null,
    level: null,
    daysPerWeek: null,
    priorityMuscles: [],
    periodization: {
      model: plan?.periodization_model ?? null,
      block_type: plan?.block_type ?? null,
      block_number: plan?.block_number ?? null,
      week: plan?.week_number ?? null,
      volume_target: null,
    },
    restrictions: { status: null, explicit_restrictions: [], pain_flags: [] },
    recovery: { recent_rpe: null, adherence: null, data_quality: null },
    sessionContext: { day_id: null, day_name: null, session_role: 'unknown' },
  });


  const [studentName, setStudentName] = useState<string>('');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('nome').eq('user_id', studentId).maybeSingle();
      if (data?.nome) setStudentName(data.nome);
    })();
  }, [studentId]);

  const todayDayName = (plan: any): string | null => {
    const days = parseTrainingSections(plan?.conteudo || '').flatMap((s) => s.days || []);
    const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const today = weekdays[new Date().getDay()];
    const found = days.find((d) => d.day.toLowerCase().includes(today));
    return (found || days[0])?.day || null;
  };

  const handleStartTrain = async (mode: 'individual' | 'duo', plan: any) => {
    const eff = getEffectivePlan(plan);
    const existing = adminSession.active;
    if (existing) {
      const sameStudent = existing.students[0]?.id === studentId;
      if (sameStudent) {
        adminSession.open();
        return;
      }
      toast.error(`Finalize ou cancele a sessão de ${existing.students[0]?.nome || 'outro aluno'} antes de iniciar outra.`);
      adminSession.open();
      return;
    }
    setStarting(true);
    try {
      await adminSession.start({
        mode,
        students: [
          {
            id: studentId,
            nome: studentName || 'Aluno',
            planId: eff.id,
            dayName: todayDayName(eff),
            phase: resolveCurrentTrainingPhase(eff).phase,
          },
        ],
      });
    } catch (e: any) {
      toast.error('Erro ao iniciar sessão: ' + (e?.message || e));
    } finally {
      setStarting(false);
    }
  };

  const getEffectivePlan = (plan: any) => {
    const editedPlan = editedPlans[plan.id];
    const hasEditedMarkdown = Object.prototype.hasOwnProperty.call(editedMarkdownsRef.current, plan.id);
    return {
      ...plan,
      conteudo: editedPlan
        ? workoutPlanToMarkdown(editedPlan)
        : hasEditedMarkdown
          ? editedMarkdownsRef.current[plan.id]
          : plan.conteudo,
      conteudo_json: editedPlan ?? plan.conteudo_json,
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

  const handleDuplicate = async (plan: any) => {
    setDuplicatingId(plan.id);
    try {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const todayLabel = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const effective = getEffectivePlan(plan);
      const { id, created_at, updated_at, whatsapp_notified_at, whatsapp_notified_count, ...rest } = effective;
      const baseTitle = (plan.titulo || 'Treino').replace(/\s*\(c[óo]pia.*\)\s*$/i, '').trim();
      const newPlan = {
        ...rest,
        titulo: `${baseTitle} (cópia ${todayLabel})`,
        fase_inicio_data: todayStr,
        is_draft: false,
        whatsapp_notified_at: null,
        whatsapp_notified_count: 0,
      };
      const { data, error } = await supabase.from('ai_plans').insert(newPlan).select('*').single();
      if (error) throw error;
      toast.success('Treino duplicado.');
      setPlans(prev => [data, ...prev]);
      setExpandedId(data.id);
    } catch (e: any) {
      toast.error('Erro ao duplicar: ' + (e?.message || e));
    } finally {
      setDuplicatingId(null);
    }
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
    // Recarregar do banco redefine os baselines (BEFORE) para o estado persistido.
    baselinePlansRef.current = {};
    setEditedPlans({});
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
    const planRow = plans.find((p) => p.id === planId);
    const jsonChanged = editedPlans[planId] !== undefined;
    const markdownChanged = editedMarkdowns[planId] !== undefined;
    const phaseChanged = editedPhases[planId] !== undefined;
    const startDateChanged = editedStartDates[planId] !== undefined;
    if (!jsonChanged && !markdownChanged && !phaseChanged && !startDateChanged) return;

    setSaving(planId);

    const extras: { fase?: string | null; fase_inicio_data?: string | null } = {};
    if (phaseChanged) extras.fase = editedPhases[planId];
    if (startDateChanged) extras.fase_inicio_data = editedStartDates[planId] || null;

    try {
      let appliedUpdates: Record<string, any> = { ...extras };

      if (jsonChanged) {
        // JSON-first: o WorkoutPlan v2 é a fonte de verdade; markdown é derivado.
        const after = editedPlans[planId];
        const before = baselinePlansRef.current[planId] ?? normalizeWorkoutPlan(planRow?.conteudo_json);
        const result = await saveWorkoutPlanJSON(planId, after, extras);
        if (result.success !== true) {
          toast.error('Erro ao salvar: ' + (result as { error: string }).error);
          setSaving(null);
          return;
        }
        toast.success('Treino salvo com sucesso!');
        appliedUpdates = {
          ...appliedUpdates,
          conteudo: result.markdown,
          conteudo_json: result.json,
          migration_status: 'completed',
        };
        // Captura SOMENTE após persistência bem-sucedida.
        await recordWorkoutPrescriptionEdit({
          before,
          after: result.json,
          studentId,
          planId,
          source: 'manual_plan_editor',
          actionOrigin: aiAssistedRef.current[planId] ? 'ai_assisted' : 'manual',
          planVersion: planRow?.version ?? null,
          context: buildEditContext(planRow),
        });
        // Novo baseline: o próximo save compara contra o último estado salvo.
        baselinePlansRef.current = { ...baselinePlansRef.current, [planId]: result.json };
        aiAssistedRef.current = { ...aiAssistedRef.current, [planId]: false };
      } else if (markdownChanged) {
        // Legacy (sem JSON v2 confiável): ids são regenerados, então NÃO capturamos diff.
        const result = await saveWorkoutPlanFromMarkdown(planId, editedMarkdowns[planId], extras);
        if (!result.success) {
          // Markdown was saved, but JSON couldn't be regenerated.
          toast.warning('Treino salvo, mas a estrutura JSON não pôde ser regenerada. JSON anterior preservado.');
          appliedUpdates = {
            ...appliedUpdates,
            conteudo: editedMarkdowns[planId],
            migration_status: 'manual_fix_needed',
          };
        } else {
          toast.success('Treino salvo com sucesso!');
          appliedUpdates = {
            ...appliedUpdates,
            conteudo: editedMarkdowns[planId],
            conteudo_json: result.json,
            migration_status: 'completed',
          };
          // Após conversão para v2, o novo JSON vira baseline das próximas edições.
          baselinePlansRef.current = { ...baselinePlansRef.current, [planId]: result.json };
        }
      } else {
        // Somente fase / data do ciclo: nenhuma alteração de prescrição, nenhum registro.
        const { error } = await supabase.from('ai_plans').update(extras).eq('id', planId);
        if (error) {
          toast.error('Erro ao salvar: ' + error.message);
          setSaving(null);
          return;
        }
        toast.success('Treino salvo com sucesso!');
      }

      setPlans(prev => prev.map(p => p.id === planId ? { ...p, ...appliedUpdates } : p));
      const nextEditedRef = { ...editedMarkdownsRef.current };
      delete nextEditedRef[planId];
      editedMarkdownsRef.current = nextEditedRef;
      setEditedPlans(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedMarkdowns(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedPhases(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedStartDates(prev => { const c = { ...prev }; delete c[planId]; return c; });

    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message || e));
    } finally {
      setSaving(null);
    }
  };

  const normalizeDayName = (value: string) =>
    value
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/-FEIRA/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

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
        <ProgressionAnalyticsCard studentId={studentId} />
        {plans.map(plan => {
          const isExpanded = expandedId === plan.id;
          const currentPhase = (editedPhases[plan.id] ?? plan.fase ?? 'semana_1') as TrainingPhase;
          const currentStartDate = editedStartDates[plan.id] ?? plan.fase_inicio_data ?? '';
          const planV2 = getCurrentPlanV2(plan);
          const hasChanges =
            editedPlans[plan.id] !== undefined ||
            editedMarkdowns[plan.id] !== undefined ||
            editedPhases[plan.id] !== undefined ||
            editedStartDates[plan.id] !== undefined;
          const currentMarkdown = editedPlans[plan.id]
            ? workoutPlanToMarkdown(editedPlans[plan.id])
            : editedMarkdowns[plan.id] !== undefined
              ? editedMarkdowns[plan.id]
              : plan.conteudo;

          const currentDays: ParsedTrainingDay[] = planV2
            ? workoutPlanToParsedDays(planV2)
            : parseTrainingSections(currentMarkdown || '').flatMap(s => s.days || []);


          return (
            <React.Fragment key={plan.id}>
            <PeriodizationCard plan={plan} variant="admin" />
            <Card className="glass-card">
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
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      title="Incremento de carga"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIncrementsFor(currentDays.flatMap((d) => (d.exercises || []).map((ex: any) => ex.exercise)).filter(Boolean));
                      }}
                    >
                      <Weight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      title="Treinar aluno"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTrainModeChoice(getEffectivePlan(plan));
                      }}
                    >
                      <ClipboardList className="h-3 w-3" /> Treinar
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
                    <PlanAdherence
                      planId={plan.id}
                      studentId={studentId}
                      conteudo={currentMarkdown}
                      fase={(editedPhases[plan.id] ?? plan.fase) as TrainingPhase}
                      faseInicioData={currentStartDate || null}
                      cycleDays={plan.cycle_days ?? null}
                    />

                    {/* Ações Híbridas - Central de Ação Individual */}
                    <div className="flex flex-wrap gap-2 pb-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-violet-600/10 border-violet-600/20 text-violet-700 hover:bg-violet-600/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAiAllDaysOpen(plan.id);
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        IA: Ajuste Geral
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs rounded-xl bg-blue-500/5 border-blue-500/20 text-blue-600"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const header = `Treino atual${studentName ? ` de ${studentName}` : ''}${plan.titulo ? ` — ${plan.titulo}` : ''}\n\n`;
                            await navigator.clipboard.writeText(header + (currentMarkdown || ''));
                            toast.success('Treino copiado. Cole no ChatGPT para analisar.');
                          } catch {
                            toast.error('Não foi possível copiar.');
                          }
                        }}
                        title="Copiar treino completo para colar no ChatGPT"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar treino
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs rounded-xl bg-emerald-500/5 border-emerald-500/20 text-emerald-600"
                        disabled={duplicatingId === plan.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(plan);
                        }}
                      >
                        {duplicatingId === plan.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs rounded-xl bg-amber-500/5 border-amber-500/20 text-amber-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplatesFor(getEffectivePlan(plan));
                        }}
                      >
                        <BookMarked className="h-3.5 w-3.5" />
                        Templates
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
                      workoutPlan={planV2}
                      onWorkoutPlanChange={planV2 ? (next) => handleWorkoutPlanChange(plan.id, next) : undefined}
                      onAiAssistedEdit={() => markAiAssisted(plan.id)}
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
                          const usedDays = existingDays.map(d => normalizeDayName(d.day));
                          const nextDay = allDayNames.find(d => !usedDays.includes(normalizeDayName(d))) || `TREINO ${String.fromCharCode(65 + existingDays.length)}`;
                          if (planV2) {
                            handleWorkoutPlanChange(plan.id, {
                              ...planV2,
                              days: [
                                ...planV2.days,
                                {
                                  id: newId('day'),
                                  day: nextDay,
                                  exercises: [{
                                    id: newId('ex'),
                                    exercise: 'Novo exercício',
                                    series: '3',
                                    series2: '',
                                    reps: '8-12',
                                    rir: '',
                                    pause: '60s',
                                    restSeconds: 60,
                                    description: '',
                                    variation: '',
                                  }],
                                },
                              ],
                            });
                            toast.success(`${nextDay} adicionado.`);
                            return;
                          }
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
                    </div>

                  </div>
                )}
              </CardContent>
            </Card>
            </React.Fragment>
          );
        })}
      </div>

      {incrementsFor && (
        <LoadIncrementsDialog
          open={!!incrementsFor}
          onOpenChange={(v) => { if (!v) setIncrementsFor(null); }}
          studentId={studentId}
          exerciseNames={incrementsFor}
        />
      )}

      <Dialog open={!!trainModeChoice} onOpenChange={(v) => !v && setTrainModeChoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Como deseja treinar?</DialogTitle>
            <DialogDescription>Escolha o modo de execução do treino.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <button
              type="button"
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card hover:bg-accent transition-colors p-5 text-center"
              onClick={() => {
                const p = trainModeChoice;
                setTrainModeChoice(null);
                handleStartTrain('individual', p);
              }}
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-sm">Sozinho</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Treino individual</p>
              </div>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 transition-colors p-5 text-center"
              onClick={() => {
                const p = trainModeChoice;
                setTrainModeChoice(null);
                handleStartTrain('duo', p);
              }}
            >
              <div className="h-12 w-12 rounded-full bg-violet-500/15 text-violet-600 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-sm">Duo</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Treinar com outro aluno</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

        {aiAllDaysOpen && (
          <AiEditAllDaysDialog
            open={!!aiAllDaysOpen}
            onOpenChange={(v) => !v && setAiAllDaysOpen(null)}
            allDays={(() => {
              const row = plans.find(p => p.id === aiAllDaysOpen);
              const v2 = row ? getCurrentPlanV2(row) : null;
              return v2
                ? workoutPlanToParsedDays(v2)
                : parseTrainingSections(row?.conteudo || '').flatMap(s => s.days || []);
            })()}
            studentId={studentId}
            onApply={(updatedDays) => {
              const planId = aiAllDaysOpen;
              const row = plans.find(p => p.id === planId);
              const v2 = row ? getCurrentPlanV2(row) : null;
              if (v2) {
                // Edição assistida por IA sobre o JSON v2 (ids preservados).
                let next = v2;
                updatedDays.forEach((day, index) => {
                  next = applyParsedDayToPlan(next, day, index);
                });
                markAiAssisted(planId);
                handleWorkoutPlanChange(planId, next);
              } else {
                handleMarkdownChange(planId, rebuildTrainingMarkdown(row?.conteudo || '', updatedDays));
              }
              setAiAllDaysOpen(null);
            }}

            mobilityCount={plans.find(p => p.id === aiAllDaysOpen)?.mobility_count}
            mainExercisesCount={plans.find(p => p.id === aiAllDaysOpen)?.main_exercises_count}
            onStructureChange={async (mobility, main) => {
              const { error } = await supabase
                .from('ai_plans')
                .update({ 
                  mobility_count: mobility, 
                  main_exercises_count: main 
                })
                .eq('id', aiAllDaysOpen);
              
              if (!error) {
                setPlans(prev => prev.map(p => 
                  p.id === aiAllDaysOpen 
                    ? { ...p, mobility_count: mobility, main_exercises_count: main } 
                    : p
                ));
              }
            }}
          />
        )}

        {templatesFor && (
          <TemplatesDialog
            open={!!templatesFor}
            onOpenChange={(v) => !v && setTemplatesFor(null)}
            plan={templatesFor}
            studentId={studentId}
            onApplyTemplate={async (tpl) => {
              const planId = templatesFor.id;
              const updates: Record<string, any> = {
                conteudo: tpl.conteudo,
                conteudo_json: tpl.conteudo_json ?? null,
              };
              if (tpl.fase) updates.fase = tpl.fase;
              if (tpl.mobility_count != null) updates.mobility_count = tpl.mobility_count;
              if (tpl.main_exercises_count != null) updates.main_exercises_count = tpl.main_exercises_count;
              const { error } = await supabase.from('ai_plans').update(updates).eq('id', planId);
              if (error) throw error;
              setPlans(prev => prev.map(p => p.id === planId ? { ...p, ...updates } : p));
              // Aplicar template NÃO é preferência do professor: nada é capturado.
              // Apenas limpamos as edições locais e redefinimos o baseline.
              const nextRef = { ...editedMarkdownsRef.current };
              delete nextRef[planId];
              editedMarkdownsRef.current = nextRef;
              setEditedMarkdowns(prev => { const c = { ...prev }; delete c[planId]; return c; });
              setEditedPlans(prev => { const c = { ...prev }; delete c[planId]; return c; });
              const tplJson = normalizeWorkoutPlan(tpl.conteudo_json);
              const nextBaselines = { ...baselinePlansRef.current };
              if (tplJson) nextBaselines[planId] = tplJson; else delete nextBaselines[planId];
              baselinePlansRef.current = nextBaselines;

            }}
          />
        )}
    </>
  );
};

export default StudentTrainingTab;

const PlanAdherence: React.FC<{
  planId: string;
  studentId: string;
  conteudo: string;
  fase?: TrainingPhase | null;
  faseInicioData?: string | null;
  cycleDays?: number | null;
}> = ({ planId, studentId, conteudo, fase, faseInicioData, cycleDays }) => {
  // Admin consome exatamente a mesma fonte/decisão que o aluno:
  // fase resolvida pela timeline (fase_inicio_data), fallback plan.fase.
  const phase = resolveCurrentTrainingPhase({
    id: planId,
    fase: fase ?? null,
    fase_inicio_data: faseInicioData ?? null,
    cycle_days: cycleDays ?? null,
  }).phase;
  const { report, resolution, loading } = useWeeklyTraining(
    {
      id: planId,
      student_id: studentId,
      conteudo,
      fase_inicio_data: faseInicioData ?? null,
      cycle_days: cycleDays ?? null,
    },
    phase,
  );
  return <WeeklyAdherenceBanner report={report} loading={loading} progression={resolution} />;
};

