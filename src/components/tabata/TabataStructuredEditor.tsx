import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown, Timer, TrendingUp } from 'lucide-react';
import type { ParsedTabata, TabataBlock, TabataExercise } from '@/lib/tabataParser';
import { ExercisePicker } from './ExercisePicker';
import { TabataPatternFill } from './TabataPatternFill';
import { changeRoundExercise } from '@/lib/tabataRules';
import {
  TABATA_INTENSITIES, progressionLevels, newWarmupBlock, warmupItemName,
  WARMUP_DEFAULT, type TabataIntensity,
} from '@/lib/tabataProgression';
import { cn } from '@/lib/utils';

interface Props {
  value: ParsedTabata;
  onChange: (next: ParsedTabata) => void;
}

const emptyExercise = (work = 20, rest = 10): TabataExercise => ({
  name: '',
  workSeconds: work,
  restSeconds: rest,
  observation: '',
});

const emptyBlock = (idx: number): TabataBlock => ({
  name: `Bloco ${idx}`,
  format: '8 rounds × 20s / 10s',
  rounds: 8,
  workSeconds: 20,
  restSeconds: 10,
  exercises: [emptyExercise()],
  restAfterBlock: 60,
});

/** Aplica um patch ao bloco mantendo o "Formato" coerente com rounds/tempos. */
const patchBlock = (b: TabataBlock, patch: Partial<TabataBlock>): TabataBlock => {
  const next = { ...b, ...patch };
  if (patch.rounds || patch.workSeconds || patch.restSeconds !== undefined) {
    next.format = `${next.rounds} rounds × ${next.workSeconds}s / ${next.restSeconds}s`;
  }
  return next;
};

interface BlockCardProps {
  block: TabataBlock;
  onChange: (next: TabataBlock) => void;
  onRemove: () => void;
  onMove?: (dir: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  warmup?: boolean;
}

const IntensityPicker: React.FC<{ value?: TabataIntensity; onChange: (v: TabataIntensity | undefined) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="space-y-1">
    <Label className="text-[10px] uppercase text-muted-foreground">Intensidade</Label>
    <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label={`Intensidade do ${label}`}>
      {TABATA_INTENSITIES.map(i => (
        <button
          key={i.value}
          type="button"
          role="radio"
          aria-checked={value === i.value}
          onClick={() => onChange(value === i.value ? undefined : i.value)}
          className={cn(
            'h-8 px-2.5 rounded-md border text-xs font-semibold transition-colors',
            value === i.value ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground',
          )}
        >
          {i.label} <span className="font-normal opacity-80">{i.rpe}</span>
        </button>
      ))}
    </div>
  </div>
);

const BlockCard: React.FC<BlockCardProps> = ({ block: b, onChange, onRemove, onMove, canMoveUp, canMoveDown, warmup }) => {
  const update = (patch: Partial<TabataBlock>) => onChange(patchBlock(b, patch));
  const updateExercise = (eIdx: number, patch: Partial<TabataExercise>) => {
    const exercises = [...b.exercises];
    exercises[eIdx] = { ...exercises[eIdx], ...patch };
    onChange({ ...b, exercises });
  };
  const addExercise = () => update({ exercises: [...b.exercises, emptyExercise(b.workSeconds, b.restSeconds)] });
  const removeExercise = (eIdx: number) => update({ exercises: b.exercises.filter((_, i) => i !== eIdx) });
  const label = warmup ? 'Bloco 0 — Aquecimento' : b.name;

  return (
    <Card className={cn('glass-card', warmup ? 'border-secondary' : 'border-primary/20')} data-testid={warmup ? 'tabata-warmup-block' : undefined}>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          {warmup && <Timer className="h-4 w-4 text-primary shrink-0" />}
          <Input value={b.name} onChange={e => update({ name: e.target.value })} className="font-bold" aria-label={warmup ? 'Nome do aquecimento' : 'Nome do bloco'} />
          {onMove && (
            <>
              <Button size="icon" variant="ghost" onClick={() => onMove(-1)} disabled={!canMoveUp}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onMove(1)} disabled={!canMoveDown}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" onClick={onRemove} className="text-destructive" aria-label={warmup ? 'Remover bloco de aquecimento' : 'Remover bloco'}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <IntensityPicker value={b.intensity} onChange={v => update({ intensity: v })} label={label} />

        <div className="grid grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Rounds</Label>
            <Input type="number" min={1} value={b.rounds}
              onChange={e => update({ rounds: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Trabalho (s)</Label>
            <Input type="number" min={1} value={b.workSeconds}
              onChange={e => update({ workSeconds: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">{warmup ? 'Transição (s)' : 'Descanso (s)'}</Label>
            <Input type="number" min={0} value={b.restSeconds}
              onChange={e => update({ restSeconds: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Pós-bloco (s)</Label>
            <Input type="number" min={0} value={b.restAfterBlock}
              onChange={e => update({ restAfterBlock: Number(e.target.value) || 0 })} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Exercícios</Label>
            <Button size="sm" variant="ghost" onClick={addExercise} className="gap-1 h-7">
              <Plus className="h-3 w-3" /> Exercício
            </Button>
          </div>
          {!warmup && (
            <TabataPatternFill
              block={b}
              onApply={next => onChange(next.rounds === b.rounds && b.format
                ? next
                : { ...next, format: `${next.rounds} rounds × ${next.workSeconds}s / ${next.restSeconds}s` })}
            />
          )}
          {b.exercises.map((ex, eIdx) => (
            <div key={eIdx} className="rounded-lg border border-border bg-card/50 p-2 space-y-2">
              <div className="flex gap-2 items-start">
                <span className="text-xs text-muted-foreground pt-2 w-5">{eIdx + 1}.</span>
                <div className="flex-1">
                  <ExercisePicker
                    value={ex.name}
                    onChange={name => updateExercise(eIdx, changeRoundExercise(ex, name))}
                  />
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeExercise(eIdx)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 pl-7">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Trab. (s)</Label>
                  <Input type="number" min={1} value={ex.workSeconds}
                    onChange={e => updateExercise(eIdx, { workSeconds: Number(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">{warmup ? 'Trans. (s)' : 'Desc. (s)'}</Label>
                  <Input type="number" min={0} value={ex.restSeconds}
                    onChange={e => updateExercise(eIdx, { restSeconds: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Obs.</Label>
                  <Input value={ex.observation || ''}
                    onChange={e => updateExercise(eIdx, { observation: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export const TabataStructuredEditor: React.FC<Props> = ({ value, onChange }) => {
  const update = (patch: Partial<ParsedTabata>) => onChange({ ...value, ...patch });

  const setBlock = (idx: number, next: TabataBlock) => {
    const blocks = [...value.blocks];
    blocks[idx] = next;
    onChange({ ...value, blocks });
  };

  const addBlock = () => onChange({ ...value, blocks: [...value.blocks, emptyBlock(value.blocks.length + 1)] });
  const removeBlock = (idx: number) => onChange({ ...value, blocks: value.blocks.filter((_, i) => i !== idx) });
  const moveBlock = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.blocks.length) return;
    const blocks = [...value.blocks];
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    onChange({ ...value, blocks });
  };

  /** Moderado → Forte → Máximo nos blocos, na ordem atual. */
  const applyProgression = () => {
    const levels = progressionLevels(value.blocks.length);
    onChange({ ...value, blocks: value.blocks.map((b, i) => ({ ...b, intensity: levels[i] })) });
  };

  // Lista de texto → Bloco 0 cronometrado (40s / 20s de transição), com os mesmos exercícios.
  const toWarmupBlock = () => {
    onChange({ ...value, warmupBlock: newWarmupBlock(value.warmup.map(warmupItemName).filter(Boolean)) });
  };

  // Remover o Bloco 0 volta para a lista de texto com os exercícios dele.
  const removeWarmupBlock = () => {
    const wb = value.warmupBlock;
    const names = (wb?.exercises ?? []).map(e => e.name.trim()).filter(Boolean);
    const unique = names.filter((n, i) => names.indexOf(n) === i);
    onChange({ ...value, warmupBlock: null, warmup: unique.map(n => `${n} — ${wb?.workSeconds ?? WARMUP_DEFAULT.work}s`) });
  };

  const listToText = (arr: string[]) => arr.join('\n');
  const textToList = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Título</Label>
            <Input value={value.title} onChange={e => update({ title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Duração</Label>
              <Input value={value.duration} onChange={e => update({ duration: e.target.value })} placeholder="20 min" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nível</Label>
              <Input value={value.level} onChange={e => update({ level: e.target.value })} placeholder="Intermediário" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Objetivo</Label>
              <Input value={value.objective} onChange={e => update({ objective: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {value.warmupBlock ? (
        <BlockCard block={value.warmupBlock} warmup onChange={next => update({ warmupBlock: next })} onRemove={removeWarmupBlock} />
      ) : (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Aquecimento (1 item por linha)</Label>
            <Textarea
              value={listToText(value.warmup)}
              onChange={e => update({ warmup: textToList(e.target.value) })}
              className="min-h-[80px]"
            />
            <Button size="sm" variant="outline" onClick={toWarmupBlock} className="gap-1 w-full">
              <Timer className="h-3.5 w-3.5" /> Transformar em bloco cronometrado
            </Button>
            <p className="text-[11px] text-muted-foreground">
              No Player, esta lista já roda como Bloco 0 (1 min por exercício). Transformar permite ajustar tempos e transição.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs uppercase text-muted-foreground">Blocos</Label>
          <div className="flex gap-2">
            {value.blocks.length > 0 && (
              <Button size="sm" variant="outline" onClick={applyProgression} className="gap-1">
                <TrendingUp className="h-3 w-3" /> Aplicar progressão
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={addBlock} className="gap-1">
              <Plus className="h-3 w-3" /> Bloco
            </Button>
          </div>
        </div>

        {value.blocks.map((b, bIdx) => (
          <BlockCard
            key={bIdx}
            block={b}
            onChange={next => setBlock(bIdx, next)}
            onRemove={() => removeBlock(bIdx)}
            onMove={dir => moveBlock(bIdx, dir)}
            canMoveUp={bIdx > 0}
            canMoveDown={bIdx < value.blocks.length - 1}
          />
        ))}
      </div>

      <Card className="glass-card">
        <CardContent className="p-4 space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Desaquecimento (1 item por linha)</Label>
          <Textarea
            value={listToText(value.cooldown)}
            onChange={e => update({ cooldown: textToList(e.target.value) })}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>
    </div>
  );
};
