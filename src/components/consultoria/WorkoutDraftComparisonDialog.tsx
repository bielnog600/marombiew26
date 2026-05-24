import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Trash2, Loader2, Save, GitCompare, Dumbbell, ArrowRight, Activity, TrendingUp } from 'lucide-react';
import { compareWorkoutVersions, WorkoutDataJSON, validateWorkoutJSON } from '@/lib/planMigrationUtils';

interface WorkoutPlanLite {
  id: string;
  titulo: string;
  conteudo: string;
  conteudo_json?: any;
  migration_status?: any;
  version: number;
  draft_source?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: WorkoutPlanLite | null;
  draft: WorkoutPlanLite | null;
  rationale: string | null;
  busy: boolean;
  onPublish: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}

function summarize(content: string) {
  const lines = content.split('\n').filter(l => l.trim());
  const exerciseLines = lines.filter(l => /\|/.test(l) && !/^[-=]+$/.test(l));
  const distinctExercises = new Set<string>();
  for (const l of exerciseLines) {
    const cells = l.split('|').map(c => c.trim()).filter(Boolean);
    // Heuristic: "EXERCÍCIO" is typically the 2nd or 3rd cell
    const candidate = cells.find(c => /^[A-ZÁÊÔÇ]/.test(c) && c.length > 2 && !/^(SÉRIE|REPETIÇÕES|TREINO|RIR|PAUSA|VARIAÇÃO|DESCRIÇÃO)/i.test(c));
    if (candidate) distinctExercises.add(candidate.toUpperCase());
  }
  return {
    chars: content.length,
    distinctExercises: distinctExercises.size,
    exerciseSet: distinctExercises,
  };
}

const WorkoutDraftComparisonDialog: React.FC<Props> = ({ open, onOpenChange, current, draft, rationale, busy, onPublish, onKeep, onDiscard }) => {
  const comparison = useMemo(() => {
    if (!current || !draft) return null;
    
    // Attempt to get structured data
    const v1 = current.conteudo_json && current.migration_status === 'completed' 
      ? (current.conteudo_json as unknown as WorkoutDataJSON)
      : validateWorkoutJSON(current.conteudo).data;
      
    const v2 = draft.conteudo_json && draft.migration_status === 'completed'
      ? (draft.conteudo_json as unknown as WorkoutDataJSON)
      : validateWorkoutJSON(draft.conteudo).data;

    if (!v1 || !v2) return null;

    return {
      v1,
      v2,
      diff: compareWorkoutVersions(v1, v2)
    };
  }, [current, draft]);

  if (!current || !draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Comparar versões do treino
          </DialogTitle>
          <DialogDescription>
            Versão atual <Badge variant="outline">v{current.version}</Badge> vs Rascunho <Badge variant="outline">v{draft.version}</Badge>
            {draft.draft_source && <Badge variant="outline" className="ml-2 text-[10px]">{draft.draft_source}</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2 min-h-0 space-y-6 py-4 scrollbar-thin scrollbar-thumb-primary/10 hover:scrollbar-thumb-primary/20 touch-pan-y">
          {rationale && (
            <div className="rounded-md bg-violet-500/5 border border-violet-500/20 p-3 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-violet-500 font-medium mb-1">Justificativa da IA</p>
              <p className="text-foreground/90">{rationale}</p>
            </div>
          )}

          {comparison ? (
            <div className="space-y-6">
              {/* KPIs de Mudança Estruturada */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard 
                  label="Exercícios" 
                  value={`${comparison.v2.days.flatMap(d => d.exercises).length}`} 
                  sub={`${comparison.diff.addedExercises.length} novos, ${comparison.diff.removedExercises.length} remov.`}
                />
                <StatCard 
                  label="Volume (Séries)" 
                  value={`${Math.round(comparison.diff.volumeChange)}%`} 
                  sub={comparison.diff.volumeChange > 0 ? 'Aumento de volume' : comparison.diff.volumeChange < 0 ? 'Redução (Deload)' : 'Volume mantido'}
                  trend={comparison.diff.volumeChange > 0 ? 'up' : 'down'}
                />
                <StatCard 
                  label="Divisão" 
                  value={comparison.diff.divisionChanged ? 'Alterada' : 'Mantida'} 
                  sub={`${comparison.v2.days.length} sessões/sem`}
                />
                <StatCard 
                  label="Frequência" 
                  value={`${comparison.v2.metadata.frequency || comparison.v2.days.length}x`} 
                  sub="Dias por semana"
                />
              </div>

              {/* Lista de Mudanças Detalhada */}
              {(comparison.diff.addedExercises.length > 0 || comparison.diff.removedExercises.length > 0) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" />
                    Mudanças na Grade de Exercícios
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {comparison.diff.addedExercises.length > 0 && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase text-emerald-500 mb-2">Entram (+{comparison.diff.addedExercises.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {comparison.diff.addedExercises.map(ex => (
                            <Badge key={ex} variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                              {ex}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {comparison.diff.removedExercises.length > 0 && (
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
                        <p className="text-[10px] font-bold uppercase text-orange-500 mb-2">Saem (-{comparison.diff.removedExercises.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {comparison.diff.removedExercises.map(ex => (
                            <Badge key={ex} variant="secondary" className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">
                              {ex}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Caracteres atual" value={String(current.conteudo.length)} />
              <Stat label="Caracteres rascunho" value={String(draft.conteudo.length)} />
              <Stat label="Diferença" value={`${draft.conteudo.length - current.conteudo.length}`} />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 bg-background/40 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-border/50 text-[10px] font-bold uppercase tracking-wider bg-muted/30">Versão Atual (v{current.version})</div>
              <div className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto scrollbar-hide">{current.conteudo}</div>
            </div>
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 flex flex-col overflow-hidden shadow-inner">
              <div className="px-3 py-2 border-b border-violet-500/30 text-[10px] font-bold uppercase tracking-wider bg-violet-500/10 text-violet-600">Proposta (v{draft.version})</div>
              <div className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto scrollbar-hide">{draft.conteudo}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-border/50">
          <Button variant="outline" onClick={onDiscard} disabled={busy} className="rounded-xl">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Descartar
          </Button>
          <Button variant="outline" className="text-emerald-500 border-emerald-500/30 rounded-xl" onClick={onKeep} disabled={busy}>
            <Check className="h-3 w-3" />
            Manter Atual
          </Button>
          <Button onClick={onPublish} disabled={busy} className="rounded-xl bg-primary shadow-lg shadow-primary/20">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Publicar Treino
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const StatCard: React.FC<{ label: string, value: string, sub: string, trend?: 'up' | 'down' }> = ({ label, value, sub, trend }) => (
  <div className="rounded-2xl bg-secondary/40 p-4 border border-border/50 flex flex-col gap-1">
    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">{label}</p>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-black text-foreground">{value}</span>
      {trend && (
        trend === 'up' ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingUp className="h-4 w-4 text-orange-500 rotate-180" />
      )}
    </div>
    <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>
  </div>
);

// Stat already defined above


export default WorkoutDraftComparisonDialog;