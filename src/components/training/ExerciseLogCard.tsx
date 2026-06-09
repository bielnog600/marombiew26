import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dumbbell, Save, Loader2, Check, Timer, Plus, Minus, Trash2, X } from 'lucide-react';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';

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
  ExerciseNamePicker: React.FC<any>;
  HistoryPopover: React.FC<any>;
  parsePauseSeconds: (raw?: string | null) => number;
}

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
  ExerciseNamePicker,
  HistoryPopover,
  parsePauseSeconds,
}) => {
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
