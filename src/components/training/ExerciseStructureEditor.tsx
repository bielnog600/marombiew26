import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { ExercisePicker } from '@/components/tabata/ExercisePicker';
import { WorkoutMethodEditor } from './WorkoutMethodEditor';
import type { ParsedExercise } from '@/lib/trainingResultParser';

type StructureMode = 'standard' | 'recognition' | 'per_set';

const detectMode = (ex: any): StructureMode => {
  if (ex?.setScheme?.mode === 'per_set') return 'per_set';
  const s1 = parseInt(String(ex?.series ?? '0'), 10) || 0;
  const s2 = parseInt(String(ex?.series2 ?? '0'), 10) || 0;
  if (s1 > 0 && s2 > 0) return 'recognition';
  if (String(ex?.reps || '').includes('+')) return 'recognition';
  return 'standard';
};

/**
 * Painel de edição da prescrição de UM exercício (modo de séries, método,
 * reps, descanso, RIR, variação). Compartilhado entre o ExerciseLogCard e o
 * editor de grupo do Modo Treino admin — não altera registro de séries.
 */
export function ExerciseStructureEditor({ ex, plan, onUpdateMeta }: {
  ex: ParsedExercise;
  plan: { kind: 'recon' | 'work'; targetReps: string }[];
  onUpdateMeta: (patch: any) => void;
}) {
  const mode: StructureMode = detectMode(ex);

  const perSetSets: Array<{ set_number: number; set_type: 'work' | 'recognition'; target_reps: string }> =
    mode === 'per_set' && ex?.setScheme?.sets
      ? ex.setScheme.sets
      : (plan || []).map((p, i) => ({
          set_number: i + 1,
          set_type: p.kind === 'recon' ? 'recognition' : 'work',
          target_reps: p.targetReps || '',
        }));

  const commitPerSet = (next: typeof perSetSets) => {
    const renumbered = next.map((s, i) => ({ ...s, set_number: i + 1 }));
    onUpdateMeta({ setScheme: { mode: 'per_set', sets: renumbered } });
  };

  const changeMode = (next: StructureMode) => {
    if (next === mode) return;
    if (next === 'standard') {
      const [a] = String(ex.reps || '').split('+').map((p) => p.trim());
      onUpdateMeta({
        setScheme: undefined,
        series: String(plan?.length || parseInt(ex.series || '3', 10) || 3),
        series2: '',
        reps: a || ex.reps || '',
      });
    } else if (next === 'recognition') {
      const workCount = String(plan?.filter((p) => p.kind === 'work').length || 3);
      const [a, b] = String(ex.reps || '').split('+').map((p) => p.trim());
      const recReps = a || '12';
      const workReps = b || a || '8-10';
      onUpdateMeta({
        setScheme: undefined,
        series: '1',
        series2: workCount,
        reps: `${recReps} + ${workReps}`,
      });
    } else {
      commitPerSet(perSetSets);
    }
  };

  const updatePerSetReps = (idx: number, value: string) => {
    commitPerSet(perSetSets.map((s, i) => (i === idx ? { ...s, target_reps: value } : s)));
  };
  const togglePerSetType = (idx: number) => {
    commitPerSet(perSetSets.map((s, i) =>
      i === idx ? { ...s, set_type: (s.set_type === 'work' ? 'recognition' : 'work') as 'work' | 'recognition' } : s));
  };
  const addPerSetSlot = () => {
    const last = perSetSets[perSetSets.length - 1];
    commitPerSet([...perSetSets, { set_number: perSetSets.length + 1, set_type: 'work', target_reps: last?.target_reps || '' }]);
  };
  const removePerSetSlot = (idx: number) => {
    if (perSetSets.length <= 1) return;
    commitPerSet(perSetSets.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[9px] uppercase text-muted-foreground font-semibold">Modo de séries</label>
        <Select value={mode} onValueChange={(v) => changeMode(v as StructureMode)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard" className="text-xs">Padrão</SelectItem>
            <SelectItem value="recognition" className="text-xs">Reconhecimento + trabalho</SelectItem>
            <SelectItem value="per_set" className="text-xs">Repetições por série</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <WorkoutMethodEditor exercise={ex} onChange={onUpdateMeta} />
      {mode === 'per_set' ? (
        <div className="space-y-1.5">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">
            Reps por série
          </label>
          {perSetSets.map((s, i) => (
            <div key={i} className="grid grid-cols-[56px_1fr_28px_28px] items-center gap-1.5">
              <button
                type="button"
                onClick={() => togglePerSetType(i)}
                className={`text-[9px] font-bold text-center px-1 py-1 rounded ${
                  s.set_type === 'recognition'
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-secondary text-foreground border border-border/50'
                }`}
                title={s.set_type === 'recognition' ? 'Reconhecimento' : 'Trabalho'}
              >
                {s.set_type === 'recognition' ? `REC #${i + 1}` : `#${i + 1}`}
              </button>
              <Input
                key={`${i}-${s.target_reps}`}
                defaultValue={s.target_reps}
                onBlur={(e) => updatePerSetReps(i, e.target.value)}
                placeholder="ex.: 12"
                className="h-7 text-xs"
              />
              <button
                type="button"
                onClick={() => removePerSetSlot(i)}
                disabled={perSetSets.length <= 1}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Remover série"
                title="Remover série"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full gap-1 text-[10px] text-muted-foreground hover:text-primary border border-dashed border-border/50"
            onClick={addPerSetSlot}
          >
            <Plus className="h-3 w-3" /> Adicionar série
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">
            {mode === 'recognition' ? 'Reps (reconhecimento + trabalho)' : 'Reps alvo'}
          </label>
          <Input
            key={ex.reps || ''}
            defaultValue={ex.reps || ''}
            onBlur={(e) => onUpdateMeta({ reps: e.target.value })}
            className="h-7 text-xs"
            placeholder={mode === 'recognition' ? '12 + 8-10' : '8-12'}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">Descanso</label>
          <Input
            defaultValue={ex.pause || ''}
            onBlur={(e) => onUpdateMeta({ pause: e.target.value })}
            className="h-7 text-xs"
            placeholder="60s ou 1:30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">RIR</label>
          <Input
            defaultValue={ex.rir || ''}
            onBlur={(e) => onUpdateMeta({ rir: e.target.value })}
            className="h-7 text-xs"
            placeholder="1-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase text-muted-foreground font-semibold">Variação</label>
          <ExercisePicker
            value={ex.variation || ''}
            onChange={(name) => onUpdateMeta({ variation: name })}
            placeholder="Selecionar variação"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground">
        {mode === 'per_set'
          ? 'Neste modo, use "Adicionar série" acima para controlar a quantidade.'
          : 'Para mudar a quantidade de séries, use os botões + / × na lista abaixo.'}
      </p>
    </div>
  );
}
