import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Trash2, Loader2, Save, GitCompare } from 'lucide-react';

interface WorkoutPlanLite {
  id: string;
  titulo: string;
  conteudo: string;
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
  if (!current || !draft) return null;
  const a = summarize(current.conteudo);
  const b = summarize(draft.conteudo);
  const added = Array.from(b.exerciseSet).filter(x => !a.exerciseSet.has(x));
  const removed = Array.from(a.exerciseSet).filter(x => !b.exerciseSet.has(x));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
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

        {rationale && (
          <div className="rounded-md bg-violet-500/5 border border-violet-500/20 p-3 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-violet-500 font-medium mb-1">Justificativa da IA</p>
            <p className="text-foreground/90">{rationale}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Exercícios atual" value={String(a.distinctExercises)} />
          <Stat label="Exercícios rascunho" value={String(b.distinctExercises)} />
          <Stat label="Δ exercícios" value={`${added.length > 0 ? '+' : ''}${b.distinctExercises - a.distinctExercises}`} />
        </div>

        {(added.length > 0 || removed.length > 0) && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-500 mb-1">Adicionados ({added.length})</p>
              <p className="text-foreground/90 line-clamp-4">{added.slice(0, 12).join(', ') || '—'}</p>
            </div>
            <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3">
              <p className="text-[11px] uppercase tracking-wide text-orange-500 mb-1">Removidos ({removed.length})</p>
              <p className="text-foreground/90 line-clamp-4">{removed.slice(0, 12).join(', ') || '—'}</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 flex-1 overflow-hidden min-h-[300px]">
          <div className="rounded-md border border-border/50 bg-background/40 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/50 text-xs font-medium">Treino atual (v{current.version})</div>
            <ScrollArea className="flex-1 p-3 text-xs whitespace-pre-wrap font-mono">{current.conteudo}</ScrollArea>
          </div>
          <div className="rounded-md border border-violet-500/30 bg-violet-500/5 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-violet-500/30 text-xs font-medium">Rascunho v{draft.version}</div>
            <ScrollArea className="flex-1 p-3 text-xs whitespace-pre-wrap font-mono">{draft.conteudo}</ScrollArea>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border/50">
          <Button variant="outline" onClick={onDiscard} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Descartar rascunho
          </Button>
          <Button variant="outline" className="text-emerald-500 border-emerald-500/30" onClick={onKeep} disabled={busy}>
            <Check className="h-3 w-3" />
            Manter atual
          </Button>
          <Button onClick={onPublish} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Publicar nova versão
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md bg-secondary/40 p-2 border border-border/50">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold">{value}</p>
  </div>
);

export default WorkoutDraftComparisonDialog;