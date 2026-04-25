import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, RefreshCw, Check, FileEdit, FileText, AlertTriangle, ChevronDown, ChevronUp, Loader2, GitCompare, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DietDraftComparisonDialog from './DietDraftComparisonDialog';
import WhatsAppDataRequestButton from './WhatsAppDataRequestButton';

type CycleStatus =
  | 'em_dia'
  | 'pre_renovacao'
  | 'aguardando_dados'
  | 'renovacao_sugerida'
  | 'rascunho_gerado'
  | 'renovado';

type SuggestedAction = 'manter' | 'ajustar' | 'gerar_nova' | 'solicitar_dados';

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
  meal_log_frequency: number | null;
  weight_trend: string | null;
  data_quality: string;
  suggested_action: SuggestedAction;
  rationale: string;
  created_at: string;
}

const statusMeta: Record<CycleStatus, { label: string; cls: string }> = {
  em_dia: { label: 'Em dia', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  pre_renovacao: { label: 'Pré-renovação', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  aguardando_dados: { label: 'Aguardando dados', cls: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
  renovacao_sugerida: { label: 'Renovação sugerida', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  rascunho_gerado: { label: 'Rascunho gerado', cls: 'bg-violet-500/10 text-violet-500 border-violet-500/30' },
  renovado: { label: 'Renovado', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
};

const actionMeta: Record<SuggestedAction, { label: string; cls: string }> = {
  manter: { label: 'Manter plano', cls: 'text-emerald-500' },
  ajustar: { label: 'Ajustar plano', cls: 'text-blue-500' },
  gerar_nova: { label: 'Gerar nova dieta', cls: 'text-violet-500' },
  solicitar_dados: { label: 'Solicitar dados', cls: 'text-orange-500' },
};

function daysRemaining(plan: PlanRow): number {
  const elapsed = differenceInDays(new Date(), new Date(plan.created_at));
  return (plan.cycle_days ?? 45) - elapsed;
}

const DietRenewalPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisRow>>({});
  const [drafts, setDrafts] = useState<Record<string, PlanRow>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [compareFor, setCompareFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // 1. Active diet plans (not drafts)
    const { data: planRows } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('tipo', 'dieta')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

    const planList = (planRows ?? []) as PlanRow[];

    // 2. Filter to those near renewal (<=15 days remaining) OR with non-default status
    const focus = planList.filter((p) => daysRemaining(p) <= 15 || p.cycle_status !== 'em_dia');

    // 3. Fetch student names
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

    // 4. Latest analysis per plan
    const planIds = focus.map((p) => p.id);
    if (planIds.length) {
      const { data: analysisRows } = await supabase
        .from('diet_renewal_analysis')
        .select('*')
        .in('plan_id', planIds)
        .order('created_at', { ascending: false });
      const map: Record<string, AnalysisRow> = {};
      (analysisRows ?? []).forEach((a: any) => {
        if (!map[a.plan_id]) map[a.plan_id] = a;
      });
      setAnalyses(map);

      // 5. Drafts (is_draft=true) whose parent is one of these plans
      const { data: draftRows } = await supabase
        .from('ai_plans')
        .select('*')
        .eq('tipo', 'dieta')
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
    const { data, error } = await supabase.functions.invoke('diet-renewal-analyzer', { body });
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
      toast.success('Plano mantido. Ciclo reiniciado.');
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
      toast.success(r?.reused ? 'Rascunho existente carregado.' : 'Rascunho gerado pela IA.');
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
      toast.success('Nova versão publicada.');
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

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Renovação Inteligente de Dietas
          <Badge variant="outline" className="ml-2 text-[10px]">IA</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          A IA analisa aderência, peso, registros e objetivo para sugerir manter, ajustar ou renovar a dieta quando faltam ≤ 15 dias.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma dieta na janela de pré-renovação no momento.</p>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => {
              const remaining = daysRemaining(plan);
              const status = plan.cycle_status;
              const meta = statusMeta[status];
              const analysis = analyses[plan.id];
              const draft = drafts[plan.id];
              const isExpanded = expanded === plan.id;
              return (
                <Card key={plan.id} className="bg-secondary/30 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{plan.student_name}</p>
                          <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                            {meta.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">v{plan.version}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{plan.titulo}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className={remaining <= 0 ? 'text-destructive font-medium' : remaining <= 15 ? 'text-amber-500 font-medium' : 'text-muted-foreground'}>
                            {remaining > 0 ? `${remaining}d restantes` : `Vencido há ${Math.abs(remaining)}d`}
                          </span>
                          {analysis && (
                            <span className={`font-medium ${actionMeta[analysis.suggested_action].cls}`}>
                              IA sugere: {actionMeta[analysis.suggested_action].label}
                            </span>
                          )}
                          {plan.last_analysis_at && (
                            <span className="text-muted-foreground">
                              Última análise: {format(new Date(plan.last_analysis_at), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
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
                      <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                        {analysis ? (
                          <div className="space-y-2 text-xs">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <Metric label="Aderência" value={analysis.adherence_score != null ? `${Math.round((analysis.adherence_score) * 100)}%` : '—'} />
                              <Metric label="Registro refeições" value={analysis.meal_log_frequency != null ? `${Math.round((analysis.meal_log_frequency) * 100)}%` : '—'} />
                              <Metric label="Peso" value={analysis.weight_trend ?? '—'} />
                              <Metric label="Qualidade dados" value={analysis.data_quality} />
                            </div>
                            <div className="rounded-md bg-background/40 p-3 border border-border/50">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Justificativa da IA</p>
                              <p className="text-sm text-foreground/90">{analysis.rationale}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs">
                              Ainda não há análise para este plano. Clique em <strong>Analisar com IA</strong> para gerar.
                            </p>
                          </div>
                        )}

                        {draft && (
                          <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Wand2 className="h-4 w-4 text-violet-500" />
                                <p className="text-sm font-medium">Rascunho v{draft.version} pronto</p>
                                <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-500 border-violet-500/30">
                                  {draft.draft_source === 'auto' ? 'auto' : 'manual'}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(draft.created_at), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            {draft.draft_reason && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{draft.draft_reason}</p>
                            )}
                            <Button
                              size="sm"
                              variant="default"
                              disabled={busy === plan.id}
                              onClick={() => setCompareFor(plan.id)}
                            >
                              <GitCompare className="h-3 w-3" />
                              Comparar e publicar
                            </Button>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === plan.id}
                            onClick={() => handleAnalyze(plan.id)}
                          >
                            {busy === plan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            {analysis ? 'Reanalisar' : 'Analisar com IA'}
                          </Button>
                          <WhatsAppDataRequestButton
                            phone={plan.student_phone}
                            studentName={plan.student_name}
                            planType="dieta"
                            rationale={analysis?.rationale}
                            dataQuality={analysis?.data_quality}
                            suggestedAction={analysis?.suggested_action}
                            missingItems={analysis ? [
                              analysis.meal_log_frequency == null || (analysis.meal_log_frequency ?? 0) < 0.4 ? 'Registro das refeições do dia (ao menos 4x/semana)' : null,
                              analysis.weight_trend == null || analysis.weight_trend === 'sem_dados' ? 'Pesagem semanal atualizada' : null,
                              analysis.adherence_score == null || (analysis.adherence_score ?? 0) < 0.4 ? 'Marcar refeições concluídas no app' : null,
                            ].filter(Boolean) as string[] : []}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-500 border-emerald-500/30"
                            disabled={busy === plan.id}
                            onClick={() => handleKeep(plan.id)}
                          >
                            <Check className="h-3 w-3" />
                            Manter plano
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === plan.id}
                            onClick={() => toast.info('Use a aba Dieta IA para ajustar e salve para versionar.')}
                          >
                            <FileEdit className="h-3 w-3" />
                            Ajustar plano
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === plan.id || !!draft}
                            onClick={() => handleGenerateDraft(plan.id)}
                          >
                            {busy === plan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                            {draft ? 'Rascunho gerado' : 'Gerar rascunho'}
                          </Button>
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

      <DietDraftComparisonDialog
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

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md bg-background/40 p-2 border border-border/50">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
);

export default DietRenewalPanel;