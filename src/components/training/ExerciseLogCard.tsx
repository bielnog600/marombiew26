import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dumbbell, Save, Loader2, Check, Timer, Plus, Minus, Trash2, X, Settings2 } from 'lucide-react';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { ExercisePicker } from '@/components/tabata/ExercisePicker';

interface SetEntry {
  weight: string;
  reps: string;
}

interface SetPlan {
  kind: 'recon' | 'work';
  targetReps: string;
}

interface ExerciseState {
  sets: SetEntry[];
  plan: SetPlan[];
  notes: string;
  saving: boolean;
  lastWeight: number | null;
  lastReps: number | null;
  lastDate: string | null;
  savedSets: number;
  exerciseName: string;
}

interface Props {
  exIdx: number;
  ex: any;
  st: ExerciseState;
  exercisesList: any[];
  studentId: string;
  onUpdateSet: (exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => void;
  onUpdateNotes: (exIdx: number, value: string) => void;
  onSaveExercise: (exIdx: number) => void;
  onStartRestTimer: (secs: number, exIdx: number) => void;
  onExerciseNameChange: (name: string) => void;
  onAddSet?: (exIdx: number) => void;
  onRemoveSet?: (exIdx: number, setIdx: number) => void;
  onRemoveExercise?: (exIdx: number) => void;
  onUpdateMeta?: (patch: {
    pause?: string;
    variation?: string;
    reps?: string;
    rir?: string;
    series?: string;
    series2?: string;
    setScheme?: any;
  }) => void;
  ExerciseNamePicker: React.FC<any>;
  HistoryPopover: React.FC<any>;
  parsePauseSeconds: (raw?: string | null) => number;
}

type StructureMode = 'standard' | 'recognition' | 'per_set';

const detectMode = (ex: any): StructureMode => {
  if (ex?.setScheme?.mode === 'per_set') return 'per_set';
  const s1 = parseInt(String(ex?.series ?? '0'), 10) || 0;
  const s2 = parseInt(String(ex?.series2 ?? '0'), 10) || 0;
  if (s1 > 0 && s2 > 0) return 'recognition';
  if (String(ex?.reps || '').includes('+')) return 'recognition';
  return 'standard';
};

const ExerciseLogCard: React.FC<Props> = ({
  exIdx,
  ex,
  st,
  exercisesList,
  studentId,
  onUpdateSet,
  onUpdateNotes,
  onSaveExercise,
  onStartRestTimer,
  onExerciseNameChange,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onUpdateMeta,
  ExerciseNamePicker,
  HistoryPopover,
  parsePauseSeconds,
}) => {
  const [editOpen, setEditOpen] = useState(false);
  const mode: StructureMode = detectMode(ex);

  const perSetSets: Array<{ set_number: number; set_type: 'work' | 'recognition'; target_reps: string }> =
    mode === 'per_set' && ex?.setScheme?.sets
      ? ex.setScheme.sets
      : (st.plan || []).map((p, i) => ({
          set_number: i + 1,
          set_type: p.kind === 'recon' ? 'recognition' : 'work',
          target_reps: p.targetReps || '',
        }));

  const commitPerSet = (next: typeof perSetSets) => {
    if (!onUpdateMeta) return;
    const renumbered = next.map((s, i) => ({ ...s, set_number: i + 1 }));
    onUpdateMeta({ setScheme: { mode: 'per_set', sets: renumbered } });
  };

  const changeMode = (next: StructureMode) => {
    if (!onUpdateMeta || next === mode) return;
    if (next === 'standard') {
      const [a] = String(ex.reps || '').split('+').map((p) => p.trim());
      onUpdateMeta({
        setScheme: undefined,
        series: String(st.plan?.length || parseInt(ex.series || '3', 10) || 3),
        series2: '',
        reps: a || ex.reps || '',
      });
    } else if (next === 'recognition') {
      const workCount = String(st.plan?.filter((p) => p.kind === 'work').length || 3);
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
      // per_set — semear a partir do plano atual
      commitPerSet(perSetSets);
    }
  };

  const updatePerSetReps = (idx: number, value: string) => {
    const next = perSetSets.map((s, i) => (i === idx ? { ...s, target_reps: value } : s));
    commitPerSet(next);
  };
  const togglePerSetType = (idx: number) => {
    const next = perSetSets.map((s, i) =>
      i === idx
        ? { ...s, set_type: (s.set_type === 'work' ? 'recognition' : 'work') as 'work' | 'recognition' }
        : s,
    );
    commitPerSet(next);
  };
  const addPerSetSlot = () => {
    const last = perSetSets[perSetSets.length - 1];
    commitPerSet([
      ...perSetSets,
      { set_number: perSetSets.length + 1, set_type: 'work', target_reps: last?.target_reps || '' },
    ]);
  };
  const removePerSetSlot = (idx: number) => {
    if (perSetSets.length <= 1) return;
    commitPerSet(perSetSets.filter((_, i) => i !== idx));
  };

  return (
    <Card className="border-border/60">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {(() => {
              const m = st.exerciseName ? findBestExerciseMatch(st.exerciseName, exercisesList as any) : undefined;
              const url = (m as any)?.imagem_url as string | null | undefined;
              return url ? (
                <img
                  src={url}
                  alt={st.exerciseName}
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-md object-cover border border-border/40 bg-muted/40"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-md bg-muted/40 flex items-center justify-center border border-border/40">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })()}
            <div className="min-w-0 flex-1">
              <ExerciseNamePicker
                value={st.exerciseName}
                options={exercisesList}
                original={ex.exercise || ''}
                onChange={onExerciseNameChange}
              />
              <p className="text-[10px] text-muted-foreground">
                Prescrição: {ex.series2 || ex.series} séries × {ex.reps || '—'}
                {ex.rir && ` · RIR ${ex.rir}`}
                {ex.pause && ` · pausa ${ex.pause}`}
              </p>
            </div>
          </div>
          {st.exerciseName && (
            <HistoryPopover studentId={studentId} exerciseName={st.exerciseName} last={st} />
          )}
          {onRemoveExercise && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onRemoveExercise(exIdx)}
            aria-label="Remover exercício"
            title="Remover exercício"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => {
              const secs = parsePauseSeconds(ex.pause);
              onStartRestTimer(secs, exIdx);
            }}
          >
            <Timer className="h-3 w-3" />
            Cronômetro de descanso{ex.pause ? ` · ${ex.pause}` : ''}
          </Button>
            {onUpdateMeta && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-primary"
                onClick={() => setEditOpen((v) => !v)}
              >
                <Settings2 className="h-3 w-3" />
                {editOpen ? 'Fechar edição' : 'Editar'}
              </Button>
            )}
          </div>
          {onUpdateMeta && editOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border/50 bg-secondary/30 p-2">
              <div className="space-y-1">
                <label className="text-[9px] uppercase text-muted-foreground font-semibold">Reps alvo</label>
                <Input
                  defaultValue={ex.reps || ''}
                  onBlur={(e) => onUpdateMeta({ reps: e.target.value })}
                  className="h-7 text-xs"
                  placeholder="8-12"
                />
              </div>
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
              <p className="col-span-2 text-[9px] text-muted-foreground">
                Para mudar a quantidade de séries, use os botões + / × na lista abaixo.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {st.sets.map((s, setIdx) => {
            const p = st.plan?.[setIdx] ?? { kind: 'work' as const, targetReps: '' };
            const isRecon = p?.kind === 'recon';
            return (
              <div key={setIdx} className="grid grid-cols-[68px_1fr_1fr_28px] items-center gap-2">
                <span
                  className={`text-[9px] font-bold text-center px-1 py-0.5 rounded ${
                    isRecon
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-secondary text-foreground'
                  }`}
                  title={isRecon ? 'Reconhecimento' : 'Trabalho'}
                >
                  {isRecon ? `REC #${setIdx + 1}` : `#${setIdx + 1}`}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="kg"
                  value={s.weight}
                  onChange={(e) => onUpdateSet(exIdx, setIdx, 'weight', e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={p?.targetReps ? `${p.targetReps}` : 'reps'}
                  value={s.reps}
                  onChange={(e) => onUpdateSet(exIdx, setIdx, 'reps', e.target.value)}
                  className="h-8 text-xs"
                />
                {onRemoveSet ? (
                <button
                  type="button"
                  onClick={() => onRemoveSet(exIdx, setIdx)}
                  disabled={st.sets.length <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Remover série"
                  title="Remover série"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                ) : <span />}
              </div>
            );
          })}
          {onAddSet && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-full gap-1 text-[10px] text-muted-foreground hover:text-primary border border-dashed border-border/50"
            onClick={() => onAddSet(exIdx)}
          >
            <Plus className="h-3 w-3" /> Adicionar série
          </Button>
          )}
        </div>

        <Textarea
          placeholder="Observações (técnica, progressão, dor...)"
          value={st.notes}
          onChange={(e) => onUpdateNotes(exIdx, e.target.value.slice(0, 500))}
          className="text-xs min-h-[50px]"
          maxLength={500}
        />

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {st.savedSets > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Check className="h-3 w-3" /> {st.savedSets} série(s) salvas
              </span>
            )}
          </span>
          <Button
            size="sm"
            className="h-7 gap-1 px-3 text-xs"
            disabled={st.saving}
            onClick={() => onSaveExercise(exIdx)}
          >
            {st.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExerciseLogCard;
