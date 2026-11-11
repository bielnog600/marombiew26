import React from 'react';
import { Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { PHRASE_FILTERS, PHRASE_FILTER_LABELS, type PhraseFilter } from '@/lib/coachVoice/voiceTabs';

interface Props {
  tab: string;
  approved: number;
  total: number;
  filter: PhraseFilter;
  onFilter(f: PhraseFilter): void;
  /** Falas sem áudio que o botão gera. */
  pending: number;
  generateLabel?: string;
  generateTestId?: string;
  /** Esconde o botão de gerar (ex.: falas com nome desligadas). */
  hideGenerate?: boolean;
  disabled: boolean;
  bulk: { done: number; total: number } | null;
  bulkError: string | null;
  onGenerate(): void;
  onStop(): void;
}

/** Cabeçalho de cada aba: contador, filtro rápido e "Gerar sem áudio desta aba". */
const VoiceTabToolbar: React.FC<Props> = (p) => (
  <div className="glass-card rounded-2xl border border-border/60 p-3 space-y-3" data-testid={`coach-voice-toolbar-${p.tab}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm" data-testid={`coach-voice-tab-counter-${p.tab}`}>
        <span className="font-bold text-primary">{p.approved}</span> de {p.total} aprovadas
      </span>
      {!p.hideGenerate && (p.bulk ? (
        <Button size="sm" variant="outline" onClick={p.onStop}><Square className="h-4 w-4 mr-1.5" /> Parar</Button>
      ) : (
        <Button size="sm" onClick={p.onGenerate} disabled={p.disabled || !p.pending} data-testid={p.generateTestId ?? `coach-voice-generate-tab-${p.tab}`}>
          <Sparkles className="h-4 w-4 mr-1.5" /> {p.generateLabel ?? 'Gerar sem áudio desta aba'} ({p.pending})
        </Button>
      ))}
    </div>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar falas">
      {PHRASE_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={p.filter === f}
          onClick={() => p.onFilter(f)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            p.filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground',
          )}
        >
          {PHRASE_FILTER_LABELS[f]}
        </button>
      ))}
    </div>
    {p.bulk && (
      <div className="space-y-1">
        <Progress value={(p.bulk.done / p.bulk.total) * 100} />
        <p className="text-xs text-muted-foreground">Gerando {Math.min(p.bulk.done + 1, p.bulk.total)} de {p.bulk.total}…</p>
      </div>
    )}
    {p.bulkError && <p className="text-sm text-destructive" role="alert">{p.bulkError}</p>}
  </div>
);

export default VoiceTabToolbar;
