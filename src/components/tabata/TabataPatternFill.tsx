import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Repeat, X } from 'lucide-react';
import type { TabataBlock } from '@/lib/tabataParser';
import { defaultPatternNames, fillBlockPattern, patternLetters } from '@/lib/tabataRules';
import { cn } from '@/lib/utils';
import { ExercisePicker } from './ExercisePicker';

interface Props {
  block: TabataBlock;
  onApply: (next: TabataBlock) => void;
}

const SIZES = [2, 3, 4] as const;

/** "Repetir padrão": escolhe 2, 3 ou 4 exercícios e preenche os rounds do bloco em sequência. */
export const TabataPatternFill: React.FC<Props> = ({ block, onApply }) => {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<number>(4);
  const [names, setNames] = useState<string[]>([]);

  const start = () => {
    setNames(defaultPatternNames(block, size));
    setOpen(true);
  };

  const changeSize = (n: number) => {
    setSize(n);
    setNames(prev => Array.from({ length: n }, (_, i) => prev[i] ?? defaultPatternNames(block, n)[i] ?? ''));
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={start} className="gap-1 h-7 text-xs">
        <Repeat className="h-3 w-3" /> Repetir padrão
      </Button>
    );
  }

  const ready = names.length === size && names.every(n => n.trim());
  const rounds = Math.max(1, block.rounds || size);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-2" data-testid="tabata-pattern-fill">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">Repetir padrão</Label>
        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Fechar repetir padrão" onClick={() => setOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label="Quantidade de exercícios do padrão">
        {SIZES.map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={size === n}
            onClick={() => changeSize(n)}
            className={cn(
              'flex-1 h-8 rounded-md border text-xs font-semibold transition-colors',
              size === n ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground',
            )}
          >
            {n} exercícios
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-xs font-bold text-primary">{String.fromCharCode(65 + i)}</span>
            <div className="flex-1">
              <ExercisePicker
                value={name}
                onChange={v => setNames(prev => prev.map((p, j) => (j === i ? v : p)))}
                placeholder={`Exercício ${String.fromCharCode(65 + i)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {rounds} rounds: {patternLetters(size, rounds)} · mantém trabalho e descanso de cada round.
      </p>
      <Button
        size="sm"
        className="w-full h-8"
        disabled={!ready}
        onClick={() => { onApply(fillBlockPattern(block, names)); setOpen(false); }}
      >
        Preencher {rounds} rounds
      </Button>
    </div>
  );
};
