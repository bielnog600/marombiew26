import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { ParsedTabata, TabataBlock, TabataExercise } from '@/lib/tabataParser';
import { ExercisePicker } from './ExercisePicker';

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

export const TabataStructuredEditor: React.FC<Props> = ({ value, onChange }) => {
  const update = (patch: Partial<ParsedTabata>) => onChange({ ...value, ...patch });

  const updateBlock = (idx: number, patch: Partial<TabataBlock>) => {
    const blocks = [...value.blocks];
    blocks[idx] = { ...blocks[idx], ...patch };
    if (patch.rounds || patch.workSeconds || patch.restSeconds) {
      const b = blocks[idx];
      blocks[idx].format = `${b.rounds} rounds × ${b.workSeconds}s / ${b.restSeconds}s`;
    }
    onChange({ ...value, blocks });
  };

  const updateExercise = (bIdx: number, eIdx: number, patch: Partial<TabataExercise>) => {
    const blocks = [...value.blocks];
    const exercises = [...blocks[bIdx].exercises];
    exercises[eIdx] = { ...exercises[eIdx], ...patch };
    blocks[bIdx] = { ...blocks[bIdx], exercises };
    onChange({ ...value, blocks });
  };

  const addBlock = () => {
    const blocks = [...value.blocks, emptyBlock(value.blocks.length + 1)];
    onChange({ ...value, blocks });
  };

  const removeBlock = (idx: number) => {
    const blocks = value.blocks.filter((_, i) => i !== idx);
    onChange({ ...value, blocks });
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.blocks.length) return;
    const blocks = [...value.blocks];
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    onChange({ ...value, blocks });
  };

  const addExercise = (bIdx: number) => {
    const b = value.blocks[bIdx];
    const exercises = [...b.exercises, emptyExercise(b.workSeconds, b.restSeconds)];
    updateBlock(bIdx, { exercises });
  };

  const removeExercise = (bIdx: number, eIdx: number) => {
    const exercises = value.blocks[bIdx].exercises.filter((_, i) => i !== eIdx);
    updateBlock(bIdx, { exercises });
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

      <Card className="glass-card">
        <CardContent className="p-4 space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Aquecimento (1 item por linha)</Label>
          <Textarea
            value={listToText(value.warmup)}
            onChange={e => update({ warmup: textToList(e.target.value) })}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase text-muted-foreground">Blocos</Label>
          <Button size="sm" variant="outline" onClick={addBlock} className="gap-1">
            <Plus className="h-3 w-3" /> Bloco
          </Button>
        </div>

        {value.blocks.map((b, bIdx) => (
          <Card key={bIdx} className="glass-card border-primary/20">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={b.name}
                  onChange={e => updateBlock(bIdx, { name: e.target.value })}
                  className="font-bold"
                />
                <Button size="icon" variant="ghost" onClick={() => moveBlock(bIdx, -1)} disabled={bIdx === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => moveBlock(bIdx, 1)} disabled={bIdx === value.blocks.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeBlock(bIdx)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Rounds</Label>
                  <Input type="number" min={1} value={b.rounds}
                    onChange={e => updateBlock(bIdx, { rounds: Number(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Trabalho (s)</Label>
                  <Input type="number" min={1} value={b.workSeconds}
                    onChange={e => updateBlock(bIdx, { workSeconds: Number(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Descanso (s)</Label>
                  <Input type="number" min={0} value={b.restSeconds}
                    onChange={e => updateBlock(bIdx, { restSeconds: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase text-muted-foreground">Pós-bloco (s)</Label>
                  <Input type="number" min={0} value={b.restAfterBlock}
                    onChange={e => updateBlock(bIdx, { restAfterBlock: Number(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase text-muted-foreground">Exercícios</Label>
                  <Button size="sm" variant="ghost" onClick={() => addExercise(bIdx)} className="gap-1 h-7">
                    <Plus className="h-3 w-3" /> Exercício
                  </Button>
                </div>
                {b.exercises.map((ex, eIdx) => (
                  <div key={eIdx} className="rounded-lg border border-border bg-card/50 p-2 space-y-2">
                    <div className="flex gap-2 items-start">
                      <span className="text-xs text-muted-foreground pt-2 w-5">{eIdx + 1}.</span>
                      <div className="flex-1">
                        <ExercisePicker
                          value={ex.name}
                          onChange={name => updateExercise(bIdx, eIdx, { name })}
                        />
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeExercise(bIdx, eIdx)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pl-7">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Trab. (s)</Label>
                        <Input type="number" min={1} value={ex.workSeconds}
                          onChange={e => updateExercise(bIdx, eIdx, { workSeconds: Number(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Desc. (s)</Label>
                        <Input type="number" min={0} value={ex.restSeconds}
                          onChange={e => updateExercise(bIdx, eIdx, { restSeconds: Number(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Obs.</Label>
                        <Input value={ex.observation || ''}
                          onChange={e => updateExercise(bIdx, eIdx, { observation: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
