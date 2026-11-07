import { FinalSetRir } from './FinalSetRir';
import { finalWorkingSetIndex } from '@/lib/finalWorkingSetRir';
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dumbbell, Save, Loader2, Check, Timer, Plus, Minus, Trash2, X, Settings2 } from 'lucide-react';
import { findBestExerciseMatch } from '@/lib/exerciseMatcher';
import { ProgressionHintCard } from './ProgressionHintCard';
import MethodBadge from './MethodBadge';
import { ExerciseStructureEditor } from './ExerciseStructureEditor';
import type { ExecutionMethodFields } from '@/lib/workoutExecutionMethods';
import { getRecommendationFor, targetLoadForSet, type ProgressionSnapshot } from '@/lib/sessionProgression';
import { WorkoutSetCard } from './WorkoutSetCard';
import type { useInlineWorkoutRest } from '@/hooks/useInlineWorkoutRest';
import type { MethodSetEntry } from '@/lib/workoutExecutionMethods';
import { ExerciseMediaFrame } from './ExerciseMediaFrame';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { kindToSetType, PLAN_SET_TYPES, SET_TYPE_BADGE_CLASS, SET_TYPE_LABEL, SET_TYPE_TAG, setTypeToKind, type SetPlanKind } from '@/lib/setTypes';
import { setTypeContexts, studentWeightPlaceholder, type PreviousExerciseSet } from '@/lib/studentExerciseLoadPresentation';

interface SetEntry {
  weight: string;
  reps: string;
  completed?: boolean;
  rir?: string;
}

interface SetPlan {
  kind: SetPlanKind;
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
  onUpdateSet: (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rir', value: string) => void;
  onUpdateNotes: (exIdx: number, value: string) => void;
  onSaveExercise: (exIdx: number) => void;
  onStartRestTimer: (secs: number, exIdx: number) => void;
  onExerciseNameChange: (name: string) => void;
  onAddSet?: (exIdx: number) => void;
  onRemoveSet?: (exIdx: number, setIdx: number) => void;
  /** Troca o tipo da série na sessão (Aquecimento/Preparatória/Reconhecimento/Trabalho). */
  onChangeSetType?: (exIdx: number, setIdx: number, kind: SetPlanKind) => void;
  onRemoveExercise?: (exIdx: number) => void;
  onUpdateMeta?: (patch: ExecutionMethodFields & {
    method?: import('@/lib/trainingResultParser').ParsedExercise['method'];
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
  progressionSnapshot?: ProgressionSnapshot | null;
  /** Exercícios do dia — usados para nomear o par de bi-set/tri-set no badge. */
  dayExercises?: any[];
  inlineRest?: ReturnType<typeof useInlineWorkoutRest>;
  onCompleteSet?: (exIdx: number, setIdx: number, entry: MethodSetEntry) => void;
  /** Quando presente (exercício com método), substitui a lista de séries simples. */
  methodBody?: React.ReactNode;
  /** Ação extra no painel Editar (ex.: "Agrupar com…" no Modo Treino admin). */
  groupAction?: React.ReactNode;
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
  onChangeSetType,
  onRemoveExercise,
  onUpdateMeta,
  ExerciseNamePicker,
  HistoryPopover,
  parsePauseSeconds,
  progressionSnapshot,
  dayExercises,
  inlineRest,
  onCompleteSet,
  methodBody,
  groupAction,
}) => {
  const [editOpen, setEditOpen] = useState(false);

  const recommendation = getRecommendationFor(progressionSnapshot ?? null, st.exerciseName || ex.exercise);
  // Carga sugerida por tipo: trabalho = sugestão; aquecimento ~50% e preparatória ~85% dela.
  const typeCtx = setTypeContexts((st.plan || []).map((p) => kindToSetType(p.kind)), st.exerciseName || ex.exercise);
  const lastWork: PreviousExerciseSet[] = st.lastWeight != null && st.lastWeight > 0
    ? [{ set_number: 0, weight_kg: st.lastWeight, reps: st.lastReps, set_type: 'work', performed_at: st.lastDate ?? '' }]
    : [];
  const loadPlaceholder = (setIdx: number) => {
    const v = studentWeightPlaceholder(setIdx + 1, lastWork, { kg: ex?.targetLoadKg ?? null, perSet: ex?.targetLoadPerSet ?? null }, recommendation, typeCtx[setIdx] ?? { type: 'work' });
    return v === 'kg' ? 'kg' : `${v} kg`;
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
                Prescrição: {(() => { const n = parseInt(String(ex.series2 || ex.series || ''), 10); return n > 0 ? n : (st.sets?.length || 3); })()} séries{ex.reps ? ` × ${ex.reps}` : ''}
                {ex.rir && ` · RIR ${ex.rir}`}
                {ex.pause && ` · pausa ${ex.pause}`}
              </p>
              {ex?.method?.slug && (
                <div className="mt-1">
                  <MethodBadge method={ex.method} dayExercises={dayExercises} />
                </div>
              )}
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

        {(() => {
          const m = st.exerciseName ? findBestExerciseMatch(st.exerciseName, exercisesList as any) : undefined;
          return (
            <ExerciseMediaFrame
              embed={(m as any)?.video_embed}
              imageUrl={(m as any)?.imagem_url}
              alt={st.exerciseName || ex.exercise || 'exercício'}
            />
          );
        })()}

        <div className="space-y-2">
          {(recommendation || ex?.targetLoadKg || ex?.targetLoadPerSet) && (
            <ProgressionHintCard
              recommendation={recommendation}
              targetLoad={{ kg: ex?.targetLoadKg ?? null, note: ex?.targetLoadNote ?? null, perSet: ex?.targetLoadPerSet ?? null }}
              variant="compact"
            />
          )}
          
          <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => {
              const secs = parsePauseSeconds(ex.pause);
              if (inlineRest) inlineRest.start(secs, exIdx, Math.max(0, st.sets.findIndex(s => !s.completed)));
              else onStartRestTimer(secs, exIdx);
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
            <div className="mt-2 space-y-2 rounded-md border border-border/50 bg-secondary/30 p-2">
              <ExerciseStructureEditor ex={ex} plan={st.plan || []} onUpdateMeta={onUpdateMeta} />
              {groupAction}
            </div>
          )}
        </div>

        {methodBody ? methodBody : <div className="space-y-1.5">
          {st.sets.map((s, setIdx) => {
            const p = st.plan?.[setIdx] ?? { kind: 'work' as const, targetReps: '' };
            const sType = kindToSetType(p?.kind);
            const tagClass = sType !== 'work' ? SET_TYPE_BADGE_CLASS[sType] : 'bg-secondary text-foreground';
            const tagText = sType !== 'work' ? `${SET_TYPE_TAG[sType]} #${setIdx + 1}` : `#${setIdx + 1}`;
            return (
              <WorkoutSetCard key={setIdx} index={setIdx} exIdx={exIdx} rest={inlineRest?.rest} completion={inlineRest?.completion} next={!!inlineRest && !inlineRest.rest && setIdx === st.sets.findIndex(s => !s.completed)} onAdd={inlineRest?.adjust} onSkip={() => inlineRest?.skip()} done={!!s.completed} className="bg-secondary/30">
              <div className={`grid ${inlineRest ? 'grid-cols-[48px_1fr_1fr_44px_28px]' : 'grid-cols-[68px_1fr_1fr_28px]'} items-center gap-1.5 p-2`}>
                {onChangeSetType ? (
                  <Select value={sType} onValueChange={(v) => onChangeSetType(exIdx, setIdx, setTypeToKind(v))}>
                    <SelectTrigger
                      aria-label={`Tipo da série ${setIdx + 1}: ${SET_TYPE_LABEL[sType]}`}
                      title={`${SET_TYPE_LABEL[sType]} — toque para mudar`}
                      className={`h-auto min-h-7 w-full justify-center gap-0.5 px-1 py-0.5 text-[9px] font-bold rounded [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:shrink-0 ${tagClass}`}
                    >
                      <span className="flex flex-col items-center leading-tight">
                        {tagText}
                        {inlineRest && !inlineRest.rest && setIdx === st.sets.findIndex(s => !s.completed) && <span className="block text-primary text-[8px]">AGORA</span>}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_SET_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{SET_TYPE_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                <span
                  className={`text-[9px] font-bold text-center px-1 py-0.5 rounded ${tagClass}`}
                  title={SET_TYPE_LABEL[sType]}
                >
                  {tagText}
                  {inlineRest && !inlineRest.rest && setIdx === st.sets.findIndex(s => !s.completed) && <span className="block text-primary text-[8px]">AGORA</span>}
                </span>
                )}
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={loadPlaceholder(setIdx)}
                  value={s.weight}
                  onChange={(e) => onUpdateSet(exIdx, setIdx, 'weight', e.target.value)}
                  disabled={!!inlineRest && s.completed}
                  className={inlineRest ? 'h-11 min-w-0 text-base text-center' : 'h-8 text-xs'}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={p?.targetReps ? `${p.targetReps}` : 'reps'}
                  value={s.reps}
                  onChange={(e) => onUpdateSet(exIdx, setIdx, 'reps', e.target.value)}
                  disabled={!!inlineRest && s.completed}
                  className={inlineRest ? 'h-11 min-w-0 text-base text-center' : 'h-8 text-xs'}
                />
                {inlineRest && <Button size="icon" variant="outline" className={`h-11 w-11 ${s.completed ? 'bg-chart-3/15 border-chart-3/50 text-chart-3 hover:bg-chart-3/20 hover:text-chart-3' : ''}`} aria-label={`Confirmar série ${setIdx + 1}`} disabled={!!s.completed || !(Number(s.reps) > 0)} onClick={() => {
                  onCompleteSet?.(exIdx, setIdx, { ...s, completed: true });
                  inlineRest.start(parsePauseSeconds(ex.pause), exIdx, setIdx);
                }}><Check className="h-4 w-4" /></Button>}
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
              {setIdx === finalWorkingSetIndex(st.sets.map((_, i) => st.plan?.[i]?.kind ?? "work")) && (s.completed || (!inlineRest && Number(s.reps) > 0)) && <FinalSetRir value={s.rir} onChange={v => onUpdateSet(exIdx, setIdx, "rir", v)} />}
              </WorkoutSetCard>
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
        </div>}

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
