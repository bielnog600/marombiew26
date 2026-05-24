import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, RefreshCw, Check, FileEdit, FileText, AlertTriangle, ChevronDown, ChevronUp, Loader2, GitCompare, Wand2, Dumbbell, BarChart3, Clock, Filter, Trash2, TrendingUp, TrendingDown, Minus, Activity, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import WorkoutDraftComparisonDialog from './WorkoutDraftComparisonDialog';
import WhatsAppDataRequestButton from './WhatsAppDataRequestButton';
import { cn } from '@/lib/utils';

type CycleStatus =
  | 'em_dia'
  | 'pre_renovacao'
  | 'aguardando_dados'
  | 'renovacao_sugerida'
  | 'rascunho_gerado'
  | 'pronto_revisar'
  | 'renovado'
  | 'vencido';

type SuggestedAction = 'manter' | 'ajustar' | 'trocar_exercicios' | 'deload' | 'renovar_bloco' | 'solicitar_dados';
type DecisionType = SuggestedAction;

interface PlanRow {
  id: string;
  student_id: string;
  titulo: string;
  conteudo: string;
  created_at: string;
  cycle_days: number;
  cycle_status: CycleStatus;
  renewal_mode: 'manual' | 'semi_auto' | 'auto';
  version: number;
  is_draft: boolean;
  parent_plan_id: string | null;
  last_analysis_at: string | null;
  fase: string | null;
  student_name?: string;
  student_phone?: string | null;
  draft_source?: string | null;
  draft_reason?: string | null;
}

interface AnalysisRow {
  id: string;
  plan_id: string;
  days_remaining: number;
  adherence_score: number | null;
  session_frequency: number | null;
  completion_rate: number | null;
  load_progression: string | null;
  reps_progression: string | null;
  volume_trend: string | null;
  avg_rpe: number | null;
  fatigue_signal: string | null;
  monotony_risk: string | null;
  data_quality: string;
  suggested_action: SuggestedAction;
  decision_type?: DecisionType;
  priority?: 'baixa' | 'media' | 'alta';
  confidence_score?: number;
  summary_reason?: string;
  volume_analysis?: {
    muscle_groups: Array<{
      name: string;
      total_sets: number;
      avg_sets_per_week: number;
      volume_total: number;
      load_trend: string;
    }>;
    avg_rpe: number | null;
    avg_duration?: number | null;
    has_long_sessions?: boolean;
    fatigue_signal: string | null;
  };
  frequency_adjustment_data?: {
    suggest_reduction: boolean;
    reason_category: string;
    justification: string;
  };
  alternatives_considered?: string[];
  rationale: string;
  created_at: string;
}

const statusMeta: Record<CycleStatus, { label: string; cls: string }> = {
  em_dia: { label: 'Em dia', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  pre_renovacao: { label: 'Pré-renovação', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  aguardando_dados: { label: 'Aguardando dados', cls: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
  renovacao_sugerida: { label: 'Ajuste sugerido', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  rascunho_gerado: { label: 'Rascunho gerado', cls: 'bg-violet-500/10 text-violet-500 border-violet-500/30' },
  pronto_revisar: { label: 'Pronto para revisar', cls: 'bg-primary/10 text-primary border-primary/30' },
  renovado: { label: 'Renovado', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  vencido: { label: 'Vencido', cls: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const actionMeta: Record<SuggestedAction, { label: string; cls: string }> = {
  manter: { label: 'Manter treino', cls: 'text-emerald-500' },
  ajustar: { label: 'Ajustar treino', cls: 'text-blue-500' },
  trocar_exercicios: { label: 'Trocar exercícios', cls: 'text-orange-500' },
  deload: { label: 'Aplicar Deload', cls: 'text-amber-500' },
  renovar_bloco: { label: 'Renovar Bloco', cls: 'text-violet-500' },
  solicitar_dados: { label: 'Solicitar dados', cls: 'text-orange-500' },
};

function daysRemaining(plan: PlanRow): number {
  const elapsed = differenceInDays(new Date(), new Date(plan.created_at));
  return (plan.cycle_days ?? 45) - elapsed;
}

const WorkoutRenewalPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisRow>>({});
  const [drafts, setDrafts] = useState<Record<string, PlanRow>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('todos');

  const load = async () => {
    setLoading(true);
    const { data: planRows } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

    const planList = (planRows ?? []) as PlanRow[];
    
    // 2. Only show the LATEST plan for each student if it's near renewal or has attention status
    const studentLatestPlan = new Map<string, PlanRow>();
    planList.forEach(p => {
      if (!studentLatestPlan.has(p.student_id)) {
        studentLatestPlan.set(p.student_id, p);
      }
    });

    const focus = Array.from(studentLatestPlan.values()).filter((p) => 
      (daysRemaining(p) <= 15 || p.cycle_status !== 'em_dia') && 
      p.cycle_status !== 'renovado'
    );

    const studentIds = Array.from(new Set(focus.map((p) => p.student_id)));
    const { data: profiles } = studentIds.length
      ? await supabase.from('profiles').select('user_id, nome, telefone').in('user_id', studentIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    focus.forEach((p) => {
      const prof = profileMap.get(p.student_id);
      p.student_name = prof?.nome ?? 'Aluno';
      p.student_phone = prof?.telefone ?? null;
    });

    const planIds = focus.map((p) => p.id);
    if (planIds.length) {
      const { data: analysisRows } = await supabase
        .from('workout_renewal_analysis')
        .select('*')
        .in('plan_id', planIds)
        .order('created_at', { ascending: false });
      const map: Record<string, AnalysisRow> = {};
      (analysisRows ?? []).forEach((a: any) => {
        if (!map[a.plan_id]) map[a.plan_id] = a;
      });
      setAnalyses(map);

      const { data: draftRows } = await supabase
        .from('ai_plans')
        .select('*')
        .eq('tipo', 'treino')
        .eq('is_draft', true)
        .in('parent_plan_id', planIds);
      const draftMap: Record<string, PlanRow> = {};
      (draftRows ?? []).forEach((d: any) => {
        if (d.parent_plan_id) draftMap[d.parent_plan_id] = d as PlanRow;
      });
      setDrafts(draftMap);
    } else {
      setAnalyses({});
      setDrafts({});
    }

    setPlans(focus);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const callRenewal = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('workout-renewal-analyzer', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleAnalyze = async (planId: string) => {
    setBusy(planId);
    try {
      await callRenewal({ action: 'analyze', plan_id: planId });
      toast.success('Análise gerada pela IA');
      await load();
    } catch (e: any) {
      toast.error('Erro: ' + (e.message ?? 'desconhecido'));
    } finally {
      setBusy(null);
    }
  };

  const handleKeep = async (planId: string) => {
    setBusy(planId);
    try {
      await callRenewal({ action: 'apply_action', plan_id: planId, user_action: 'manter' });
      toast.success('Treino mantido. Ciclo reiniciado.');
      await load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateDraft = async (planId: string) => {
    setBusy(planId);
    try {
      const r = await callRenewal({ action: 'generate_draft', plan_id: planId, source: 'manual' });
      toast.success(r?.reused ? 'Rascunho existente carregado.' : 'Rascunho de treino gerado pela IA.');
      await load();
      setCompareFor(planId);
    } catch (e: any) {
      toast.error('Erro ao gerar rascunho: ' + (e.message ?? 'desconhecido'));
    } finally {
      setBusy(null);
    }
  };

  const handlePublishDraft = async (planId: string) => {
    const draft = drafts[planId];
    if (!draft) return;
    setBusy(planId);
    try {
      await callRenewal({ action: 'apply_action', user_action: 'publish_draft', plan_id: planId, draft_id: draft.id });
      toast.success('Nova versão do treino publicada.');
      setCompareFor(null);
      await load();
    } catch (e: any) {
      toast.error('Erro ao publicar: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleDiscardDraft = async (planId: string) => {
    const draft = drafts[planId];
    if (!draft) return;
    setBusy(planId);
    try {
      await callRenewal({ action: 'discard_draft', draft_id: draft.id });
      toast.success('Rascunho descartado.');
      setCompareFor(null);
      await load();
    } catch (e: any) {
      toast.error('Erro ao descartar: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  const filteredPlans = useMemo(() => {
    let list = [...plans].map(p => {
      const remaining = daysRemaining(p);
      const analysis = analyses[p.id];
      const draft = drafts[p.id];
      
      let effectiveStatus = p.cycle_status;
      if (remaining <= 0 && p.cycle_status !== 'renovado') {
        effectiveStatus = 'vencido';
      } else if (draft && p.cycle_status !== 'renovado') {
        effectiveStatus = 'pronto_revisar';
      }

      let priorityScore = 0;
      if (effectiveStatus === 'vencido') priorityScore += 1000;
      if (remaining <= 5) priorityScore += 500;
      if (analysis?.priority === 'alta') priorityScore += 300;
      if (effectiveStatus === 'pronto_revisar') priorityScore += 200;
      
      return { ...p, effectiveStatus, remaining, priorityScore };
    });

    list.sort((a, b) => b.priorityScore - a.priorityScore);

    if (filter !== 'todos') {
      return list.filter(p => {
        const analysis = analyses[p.id];
        const draft = drafts[p.id];
        switch(filter) {
          case 'solicitar_dados': return analysis?.decision_type === 'solicitar_dados';
          case 'manter': return analysis?.decision_type === 'manter';
          case 'ajustar': return analysis?.decision_type === 'ajustar';
          case 'renovar': return analysis?.decision_type === 'renovar_bloco';
          case 'deload': return analysis?.decision_type === 'deload';
          case 'vencidos': return p.effectiveStatus === 'vencido';
          default: return true;
        }
      });
    }
    return list;
  }, [plans, analyses, drafts, filter]);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Renovação Inteligente de Treinos
              <Badge variant="outline" className="ml-2 text-[10px]">IA</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Priorização automática por vencimento, performance e volume.
            </p>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            {(['todos', 'solicitar_dados', 'renovar', 'deload', 'vencidos'] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-[10px] px-2 whitespace-nowrap"
                onClick={() => setFilter(f)}
              >
                {f === 'todos' ? 'Todos' : 
                 f === 'solicitar_dados' ? 'Solicitar Dados' :
                 f === 'renovar' ? 'Renovar Bloco' :
                 f === 'deload' ? 'Deload' : 'Vencidos'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum treino na janela de pré-renovação no momento.</p>
        ) : (
          <div className="space-y-3">
            {filteredPlans.map((plan: any) => {
              const remaining = plan.remaining;
              const status = plan.effectiveStatus;
              const meta = statusMeta[status as CycleStatus] || statusMeta.em_dia;
              const analysis = analyses[plan.id];
              const draft = drafts[plan.id];
              const isExpanded = expanded === plan.id;
              const priorityColor = analysis?.priority === 'alta' ? 'text-destructive' : analysis?.priority === 'media' ? 'text-amber-500' : 'text-emerald-500';

              return (
                <Card key={plan.id} className={cn("bg-secondary/30 border-border/50 transition-all hover:bg-secondary/40", analysis?.priority === 'alta' && "border-destructive/30")}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Dumbbell className="h-4 w-4 text-blue-500 shrink-0" />
                          <p className="font-semibold text-sm truncate">{plan.student_name}</p>
                          <Badge variant="outline" className={cn("text-[9px] font-bold uppercase", meta.cls)}>
                            {meta.label}
                          </Badge>
                          {analysis?.priority && (
                            <Badge variant="secondary" className={cn("text-[9px] uppercase font-bold", priorityColor)}>
                              Prioridade {analysis.priority}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">v{plan.version}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{plan.titulo}</p>
                          {analysis?.summary_reason && (
                            <span className="text-[10px] bg-blue-500/5 text-blue-600 px-1.5 py-0.5 rounded border border-blue-500/20 italic">
                              "{analysis.summary_reason}"
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] sm:text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className={cn("h-3 w-3", remaining <= 5 ? "text-destructive" : "text-muted-foreground")} />
                            <span className={remaining <= 0 ? 'text-destructive font-bold' : remaining <= 15 ? 'text-amber-500 font-medium' : 'text-muted-foreground'}>
                              {remaining > 0 ? `${remaining}d restantes` : `Vencido há ${Math.abs(remaining)}d`}
                            </span>
                          </div>
                          
                          {analysis && (
                            <div className="flex items-center gap-2 border-l border-border/50 pl-3">
                              <span className={cn("font-bold flex items-center gap-1", actionMeta[analysis.suggested_action]?.cls)}>
                                <Zap className="h-3 w-3" />
                                Sugestão IA: {actionMeta[analysis.suggested_action]?.label || analysis.suggested_action}
                              </span>
                              
                              {analysis.confidence_score !== undefined && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <BarChart3 className="h-3 w-3" />
                                  <span>{Math.round(analysis.confidence_score * 100)}% confiança</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setExpanded(isExpanded ? null : plan.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
                        {analysis ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <Metric label="Aderência" value={analysis.adherence_score != null ? `${Math.round(analysis.adherence_score * 100)}%` : '—'} trend={analysis.adherence_score && analysis.adherence_score > 0.7 ? 'up' : 'down'} />
                              <Metric label="Frequência" value={analysis.session_frequency != null ? `${analysis.session_frequency.toFixed(1)}/sem` : '—'} />
                              <Metric label="Conclusão" value={analysis.completion_rate != null ? `${Math.round(analysis.completion_rate * 100)}%` : '—'} />
                               <Metric label="RPE Médio" value={analysis.avg_rpe != null ? String(analysis.avg_rpe) : '—'} />
                               <Metric label="Duração Média" value={analysis.volume_analysis?.avg_duration != null ? `${analysis.volume_analysis.avg_duration}m` : '—'} trend={analysis.volume_analysis?.has_long_sessions ? 'down' : undefined} />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <Metric label="Carga" value={analysis.load_progression ?? '—'} trend={analysis.load_progression === 'subindo' ? 'up' : analysis.load_progression === 'descendo' ? 'down' : 'stable'} />
                              <Metric label="Reps" value={analysis.reps_progression ?? '—'} />
                              <Metric label="Volume" value={analysis.volume_trend ?? '—'} trend={analysis.volume_trend === 'subindo' ? 'up' : 'stable'} />
                              <Metric label="Fadiga" value={analysis.fatigue_signal ?? '—'} />
                            </div>

                            {analysis.volume_analysis?.muscle_groups && analysis.volume_analysis.muscle_groups.length > 0 && (
                              <div className="rounded-md border border-border/50 bg-secondary/10 p-3">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2 flex items-center gap-1">
                                  <Activity className="h-3 w-3" /> Análise por Grupo Muscular
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {analysis.volume_analysis.muscle_groups.map((mg, i) => (
                                    <div key={i} className="space-y-1">
                                      <p className="text-[10px] font-medium truncate">{mg.name}</p>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">{mg.avg_sets_per_week} sets/sem</span>
                                        {mg.load_trend === 'subindo' && <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {analysis.frequency_adjustment_data && (
                              <div className={cn(
                                "rounded-md border p-3 space-y-2",
                                analysis.frequency_adjustment_data.suggest_reduction 
                                  ? "bg-orange-500/5 border-orange-500/20" 
                                  : "bg-emerald-500/5 border-emerald-500/20"
                              )}>
                                <div className="flex items-center gap-2">
                                  {analysis.frequency_adjustment_data.suggest_reduction ? (
                                    <TrendingDown className="h-4 w-4 text-orange-500" />
                                  ) : (
                                    <Check className="h-4 w-4 text-emerald-500" />
                                  )}
                                  <p className="text-xs font-bold uppercase tracking-wider">
                                    Frequência: {analysis.frequency_adjustment_data.suggest_reduction ? 'Redução Sugerida' : 'Manter Dias Atuais'}
                                  </p>
                                  <Badge variant="outline" className="text-[9px] ml-auto">
                                    {analysis.frequency_adjustment_data.reason_category.replace('_', ' ')}
                                  </Badge>
                                </div>
                                <p className="text-xs text-foreground/80 leading-snug">{analysis.frequency_adjustment_data.justification}</p>
                                
                                {analysis.alternatives_considered && analysis.alternatives_considered.length > 0 && (
                                  <div className="pt-2 border-t border-border/20">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Alternativas avaliadas antes de reduzir dias:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {analysis.alternatives_considered.map((alt, i) => (
                                        <Badge key={i} variant="outline" className="text-[9px] py-0 border-border/50">{alt}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="rounded-md bg-background/40 p-3 border border-border/50 space-y-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-bold">Diagnóstico & Sugestão</p>
                              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{analysis.rationale}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs">
                              Ainda não há análise para este treino. Clique em <strong>Analisar com IA</strong> para gerar recomendações baseadas no logbook.
                            </p>
                          </div>
                        )}

                        {draft && (
                          <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-4 space-y-3 animate-pulse-subtle">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4 text-violet-500" />
                                <p className="text-sm font-bold text-violet-700 dark:text-violet-300">Rascunho v{draft.version} Pronto para Revisão</p>
                                <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-500 border-violet-500/30 uppercase">
                                  {draft.draft_source === 'auto' ? 'Automático' : 'Manual'}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                Gerado em {format(new Date(draft.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-violet-600 hover:bg-violet-700 text-white"
                                disabled={busy === plan.id}
                                onClick={() => setCompareFor(plan.id)}
                              >
                                <GitCompare className="h-3.5 w-3.5 mr-1.5" />
                                Comparar & Publicar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-violet-500/30 text-violet-600 hover:bg-violet-500/5"
                                onClick={() => handleDiscardDraft(plan.id)}
                                disabled={busy === plan.id}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Descartar
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-primary/5 border-primary/20 h-9"
                            disabled={busy === plan.id}
                            onClick={() => handleAnalyze(plan.id)}
                          >
                            {busy === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">{analysis ? 'Reanalisar' : 'Analisar com IA'}</span>
                          </Button>

                          <WhatsAppDataRequestButton
                            phone={plan.student_phone}
                            studentName={plan.student_name}
                            planType="treino"
                            rationale={analysis?.rationale}
                            dataQuality={analysis?.data_quality}
                            suggestedAction={analysis?.suggested_action}
                            missingItems={analysis ? [
                              analysis.session_frequency == null || (analysis.session_frequency ?? 0) < 2 ? 'Frequência de treinos' : null,
                              analysis.completion_rate == null || (analysis.completion_rate ?? 0) < 0.5 ? 'Marcar exercícios feitos' : null,
                              analysis.avg_rpe == null ? 'Registrar RPE' : null,
                              analysis.load_progression == null || analysis.load_progression === 'sem_dados' ? 'Registrar cargas' : null,
                            ].filter(Boolean) as string[] : []}
                          />

                          {!draft && analysis && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 border-emerald-500/30 h-9"
                                disabled={busy === plan.id}
                                onClick={() => handleKeep(plan.id)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span className="ml-1.5">Manter</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-500/30 h-9"
                                disabled={busy === plan.id}
                                onClick={() => handleGenerateDraft(plan.id)}
                              >
                                <Wand2 className="h-3.5 w-3.5" />
                                <span className="ml-1.5">Ajustar/Renovar</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      <WorkoutDraftComparisonDialog
        open={!!compareFor}
        onOpenChange={(v) => !v && setCompareFor(null)}
        current={compareFor ? plans.find((p) => p.id === compareFor) ?? null : null}
        draft={compareFor ? drafts[compareFor] ?? null : null}
        rationale={compareFor ? analyses[compareFor]?.rationale ?? null : null}
        busy={busy === compareFor}
        onPublish={() => compareFor && handlePublishDraft(compareFor)}
        onKeep={() => compareFor && handleKeep(compareFor)}
        onDiscard={() => compareFor && handleDiscardDraft(compareFor)}
      />
    </Card>
  );
};

const Metric: React.FC<{ label: string; value: string; trend?: 'up' | 'down' | 'stable' }> = ({ label, value, trend }) => (
  <div className="rounded-md bg-background/40 p-2 border border-border/50">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="flex items-center gap-1">
      <p className="text-sm font-medium">{value}</p>
      {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
      {trend === 'down' && <TrendingDown className="h-3 w-3 text-destructive" />}
      {trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
    </div>
  </div>
);

export default WorkoutRenewalPanel;