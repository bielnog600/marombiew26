import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { 
  BarChart3, Activity, Target, CheckCircle2, AlertTriangle, 
  HelpCircle, ChevronRight, Info, AlertCircle 
} from 'lucide-react';
import { useProgressionTelemetry } from '@/hooks/useProgressionTelemetry';
import { 
  type ProgressionExecutionOutcome, 
  type TelemetryAlignmentStatus,
  type TelemetryTargetStatus,
  sameLoad
} from '@/lib/progressionTelemetry';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  studentId: string;
}

const ALIGNMENT_LABELS: Record<TelemetryAlignmentStatus, string> = {
  matched: 'Seguiu sugestão',
  partial: 'Parcial',
  different: 'Diferente',
  no_execution: 'Pularam',
  not_evaluable: 'Sem dados'
};

const TARGET_LABELS: Record<TelemetryTargetStatus, string> = {
  achieved: 'Meta atingida',
  partially_achieved: 'Meta parcial',
  not_achieved: 'Meta não atingida',
  not_evaluable: 'Sem meta'
};

const ALIGNMENT_COLORS: Record<TelemetryAlignmentStatus, string> = {
  matched: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  partial: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  different: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  no_execution: 'text-muted-foreground bg-muted border-transparent',
  not_evaluable: 'text-muted-foreground bg-muted border-transparent'
};

const TARGET_COLORS: Record<TelemetryTargetStatus, string> = {
  achieved: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  partially_achieved: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  not_achieved: 'text-rose-400 bg-rose-400/5 border-rose-400/10',
  not_evaluable: 'text-muted-foreground bg-muted border-transparent'
};

const REASON_MAP: Record<string, string> = {
  'load_increased_less_than_recommended': 'Carga subiu menos que o sugerido',
  'qualitative_load_not_increased': 'Carga não aumentou (sugestão qualitativa)',
  'incomplete_load_evidence': 'Dados de carga incompletos na sessão',
  'missing_current_load': 'Sem histórico de carga base para comparar',
  'missing_load_for_alignment': 'Carga não registrada no log',
  'missing_reps_for_target_evaluation': 'Reps não registradas no log',
  'fewer_working_sets_than_target': 'Fez menos séries de trabalho que o alvo',
  'deload_excluded_from_progression_kpi': 'Semana de Deload (KPI neutro)'
};

const ACTION_MAP: Record<string, string> = {
  'increase_load': 'Aumentar carga',
  'increase_reps': 'Aumentar reps',
  'maintain': 'Manter',
  'reduce_load': 'Reduzir carga',
  'manual_increment_required': 'Incremento manual'
};

export const ProgressionAnalyticsCard: React.FC<Props> = ({ studentId }) => {
  const { summary, results, loading } = useProgressionTelemetry({ studentId, days: 30 });
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.sessionsWithSnapshot === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Coletando dados de progressão</p>
          <p className="text-[10px] mt-1">
            As métricas aparecerão após os próximos treinos concluídos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <>
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            Progressão · Sugestão x execução
          </CardTitle>
          <Badge variant="outline" className="text-[9px] h-4 font-normal">
            Últimos 30 dias
          </Badge>
        </CardHeader>
        <CardContent className="p-4 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatItem 
              label="Alinhamento" 
              value={pct(summary.alignmentRate)} 
              sub="Exato"
              icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            />
            <StatItem 
              label="Alinhamento Total/Parcial" 
              value={pct(summary.fullOrPartialAlignmentRate)} 
              sub="Flexível"
              icon={<Activity className="h-3 w-3 text-blue-500" />}
            />
            <StatItem 
              label="Alvos atingidos" 
              value={pct(summary.targetAchievementRate)} 
              sub="Reps"
              icon={<Target className="h-3 w-3 text-amber-500" />}
            />
            <StatItem 
              label="Cobertura" 
              value={pct(summary.executionCoverage)} 
              sub="Registrado"
              icon={<HelpCircle className="h-3 w-3 text-muted-foreground" />}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-primary/10">
            <span className="text-[10px] text-muted-foreground">
              {summary.evaluableRecommendations} sugestões avaliáveis em {summary.sessionsWithSnapshot} treinos
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-[10px] gap-1 hover:bg-primary/10"
              onClick={() => setDetailsOpen(true)}
            >
              Ver detalhes <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-lg">Auditoria de Telemetria</SheetTitle>
            <SheetDescription>
              Comparativo entre o sugerido pelo motor de progressão e o executado.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6 pb-12">
            {results.filter(r => r.status === 'available').map((res, i) => (
              <div key={res.sessionId} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-muted/50 border-transparent">
                      {new Date(res.completedAt).toLocaleDateString('pt-BR')}
                    </Badge>
                    {res.phase && (
                      <Badge variant="secondary" className="text-[9px] uppercase tracking-wider font-bold h-4">
                        {res.phase.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Via: {res.executedBy === 'coach' ? 'Personal' : 'App Aluno'}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {res.outcomes.map((out, j) => (
                    <OutcomeRow key={j} outcome={out} />
                  ))}
                </div>
                {i < results.length - 1 && <div className="h-px bg-border/50 my-6" />}
              </div>
            ))}
            
            {results.filter(r => r.status === 'available').length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhum treino auditado disponível.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const OutcomeRow = ({ outcome }: { outcome: ProgressionExecutionOutcome }) => {
  const isNoExec = outcome.alignmentStatus === 'no_execution';
  const isNotEval = outcome.alignmentStatus === 'not_evaluable';

  return (
    <div className="p-3 rounded-xl border bg-card/50 space-y-3 relative overflow-hidden">
      {/* Indicador lateral de status */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        outcome.alignmentStatus === 'matched' ? 'bg-emerald-500/50' : 
        outcome.alignmentStatus === 'partial' ? 'bg-amber-500/50' :
        outcome.alignmentStatus === 'different' ? 'bg-rose-500/50' : 'bg-muted'
      }`} />

      <div className="flex items-start justify-between gap-2 ml-1">
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold uppercase tracking-tight truncate">
            {outcome.exerciseName}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[9px] px-1 h-3.5 bg-muted/30 border-transparent text-muted-foreground uppercase font-bold">
              {outcome.recommendationAction ? ACTION_MAP[outcome.recommendationAction] || outcome.recommendationAction : 'Sem ação'}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${ALIGNMENT_COLORS[outcome.alignmentStatus]}`} variant="outline">
            {ALIGNMENT_LABELS[outcome.alignmentStatus]}
          </Badge>
          {!isNoExec && !isNotEval && (
            <Badge className={`text-[9px] px-1.5 py-0 h-4 border ${TARGET_COLORS[outcome.targetStatus]}`} variant="outline">
              {TARGET_LABELS[outcome.targetStatus]}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-1 ml-1 border-t border-muted/50 mt-2">
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Sugestão</p>
          <div className="text-xs font-medium flex items-center gap-1">
             <span>
               {outcome.recommendedLoadKg != null ? (
                 outcome.recommendedLoadKg === 0 ? 'Bodyweight' : `${outcome.recommendedLoadKg.toString().replace('.', ',')} kg`
               ) : 'Carga base'}
             </span>
             <span className="text-muted-foreground">·</span>
             <span className="text-primary/80">
               {outcome.recommendedTargetReps || (outcome.recommendedRepRange ? `${outcome.recommendedRepRange.min}-${outcome.recommendedRepRange.max}` : '?')} reps
             </span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Executado</p>
          <div className="text-xs font-medium">
            {isNoExec ? (
              <span className="text-muted-foreground italic text-[10px]">Pularam exercício</span>
            ) : outcome.mixedWorkingLoads ? (
              <span className="text-[10px]">{outcome.executedWorkingSets.map(s => s.weightKg).join('/')} kg</span>
            ) : (
              <span>{outcome.executedPrimaryLoadKg != null ? (outcome.executedPrimaryLoadKg === 0 ? 'BW' : `${outcome.executedPrimaryLoadKg.toString().replace('.', ',')} kg`) : '? kg'}</span>
            )}
            {!isNoExec && (
              <span className="text-muted-foreground ml-1 text-[10px]">
                ({outcome.executedReps.join('/')} reps)
              </span>
            )}
          </div>
        </div>
      </div>
      
      {outcome.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 ml-1">
          {outcome.reasons.map((r, i) => (
            <span key={i} className="text-[9px] text-rose-500/80 bg-rose-500/5 px-1.5 py-0.5 rounded flex items-center gap-1 border border-rose-500/10">
              <AlertCircle className="h-2.5 w-2.5" /> {REASON_MAP[r] || r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const StatItem = ({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) => (
  <div className="p-2 rounded-xl border bg-card/40">
    <div className="flex items-center gap-1.5 mb-0.5">
      {icon}
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</span>
    </div>
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-bold tabular-nums">{value}</span>
      <span className="text-[9px] text-muted-foreground">{sub}</span>
    </div>
  </div>
);
