import React, { useEffect, useState } from 'react';
import { Dumbbell, Pencil, Check, ChevronsUpDown, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ParsedTrainingDay, ParsedExercise } from '@/lib/trainingResultParser';
import { supabase } from '@/integrations/supabase/client';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ===== Quick-pick options for structured editing =====
const REC_SERIES_OPTS = ['1', '2'];
const REC_REPS_OPTS = ['8', '10', '12', '15', '20'];
const WORK_SERIES_OPTS = ['1', '2', '3', '4', '5'];
const WORK_REPS_OPTS = ['6', '8', '10', '12', '15', '6-8', '8-10', '8-12', '10-12', '12-15'];
const RIR_OPTS = ['', '0', '1', '2', '3', '1-2', '2-3'];
const PAUSE_OPTS = ['10s', '15s', '30s', '45s', '60s', '90s', '120s', '180s'];

type StructureMode = 'standard' | 'recognition';

const isCompositeReps = (reps: string) => reps.includes('+');

const detectMode = (ex: ParsedExercise): StructureMode => {
  const s1 = parseInt(ex.series || '0', 10) || 0;
  const s2 = parseInt(ex.series2 || '0', 10) || 0;
  if (s1 > 0 && s2 > 0) return 'recognition';
  if (isCompositeReps(ex.reps || '')) return 'recognition';
  return 'standard';
};

const splitComposed = (reps: string): [string, string] => {
  const parts = (reps || '').split('+').map((p) => p.trim());
  return [parts[0] || '', parts[1] || parts[0] || ''];
};

interface QuickSelectProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (val: string) => void;
  width?: string;
}

const QuickSelect: React.FC<QuickSelectProps> = ({ value, options, placeholder, onChange, width = 'w-[88px]' }) => (
  <Select value={value || '__empty__'} onValueChange={(v) => onChange(v === '__empty__' ? '' : v)}>
    <SelectTrigger className={`h-7 text-xs ${width} px-2`}>
      <SelectValue placeholder={placeholder || '—'} />
    </SelectTrigger>
    <SelectContent>
      {options.map((opt) => (
        <SelectItem key={opt || '__empty__'} value={opt || '__empty__'} className="text-xs">
          {opt || '— vazio —'}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const DAY_SURFACES = [
  'bg-gradient-to-br from-primary/12 to-accent/8 border-primary/25',
  'bg-gradient-to-br from-secondary to-accent/10 border-border',
  'bg-gradient-to-br from-accent/12 to-primary/8 border-accent/25',
];

const sanitizeForTsv = (value: string) => value.replace(/"/g, 'seg');

const buildDayCopyText = (day: ParsedTrainingDay) => {
  const rows = day.exercises.map(
    (ex) =>
      [day.day, ex.exercise, ex.series || '—', ex.series2 || '—', ex.reps || '—', ex.rir || '—', sanitizeForTsv(ex.pause || '—'), ex.description || '—', ex.variation || '—'].join('\t'),
  );
  return rows.join('\n');
};

interface TrainingDayCardProps {
  day: ParsedTrainingDay;
  index: number;
  onCopy: (text: string, label?: string) => React.ReactNode;
  editable?: boolean;
  onDayChange?: (updatedDay: ParsedTrainingDay) => void;
}

interface ExerciseOption {
  nome: string;
  grupo_muscular: string;
}

const ExerciseCombobox: React.FC<{
  value: string;
  options: ExerciseOption[];
  onChange: (val: string) => void;
}> = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-7 w-full min-w-[140px] justify-between text-xs font-normal px-2"
        >
          <span className="truncate">{value || 'Selecionar...'}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar exercício..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-xs">Nenhum encontrado</CommandEmpty>
            <CommandGroup className="max-h-[200px] overflow-y-auto">
              {options.map((opt) => (
                <CommandItem
                  key={opt.nome}
                  value={opt.nome}
                  onSelect={() => {
                    onChange(opt.nome);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <span className="flex-1">{opt.nome}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{opt.grupo_muscular}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const emptyExercise = (): ParsedExercise => ({
  exercise: '',
  series: '3',
  series2: '',
  reps: '8-12',
  rir: '',
  pause: '60s',
  description: '',
  variation: '',
});

const SortableExerciseItem: React.FC<{ id: string; position: number; onRemove: () => void; children: React.ReactNode }> = ({ id, position, onRemove, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 -mt-1 -mx-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Arrastar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-bold text-muted-foreground uppercase">#{position}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {children}
    </div>
  );
};

const TrainingDayCard: React.FC<TrainingDayCardProps> = ({ day, index, onCopy, editable, onDayChange }) => {
  const surface = DAY_SURFACES[index % DAY_SURFACES.length];
  const [editing, setEditing] = useState(false);
  const [localExercises, setLocalExercises] = useState<ParsedExercise[]>(day.exercises);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (editing && exerciseOptions.length === 0) {
      supabase
        .from('exercises')
        .select('nome, grupo_muscular')
        .order('nome')
        .then(({ data }) => {
          if (data) setExerciseOptions(data);
        });
    }
  }, [editing, exerciseOptions.length]);

  const handleFieldChange = (exIndex: number, field: keyof ParsedExercise, value: string) => {
    setLocalExercises(prev => {
      const copy = [...prev];
      copy[exIndex] = { ...copy[exIndex], [field]: value };
      return copy;
    });
  };

  const addExercise = () => {
    setLocalExercises(prev => [...prev, emptyExercise()]);
  };

  const removeExercise = (exIndex: number) => {
    setLocalExercises(prev => prev.filter((_, i) => i !== exIndex));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalExercises(prev => {
      const oldIndex = parseInt(String(active.id), 10);
      const newIndex = parseInt(String(over.id), 10);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const commitEdits = () => {
    setEditing(false);
    if (onDayChange) {
      onDayChange({ ...day, exercises: localExercises });
    }
  };

  const startEditing = () => {
    setLocalExercises(day.exercises);
    setEditing(true);
  };

  const displayExercises = editing ? localExercises : day.exercises;

  // Handlers for structured fields
  const setMode = (exIndex: number, mode: StructureMode) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      const ex = { ...copy[exIndex] };
      if (mode === 'standard') {
        // Collapse: keep work portion only
        const [, workReps] = splitComposed(ex.reps || '');
        const s2 = parseInt(ex.series2 || '0', 10) || 0;
        if (s2 > 0) ex.series = String(s2);
        ex.series2 = '';
        ex.reps = workReps || ex.reps || '';
      } else {
        // Expand to recognition + work
        if (!ex.series2 || parseInt(ex.series2, 10) <= 0) {
          ex.series2 = ex.series && parseInt(ex.series, 10) > 0 ? ex.series : '3';
          ex.series = '1';
        }
        if (!isCompositeReps(ex.reps || '')) {
          const r = ex.reps || '8-10';
          ex.reps = `12 + ${r}`;
        }
      }
      copy[exIndex] = ex;
      return copy;
    });
  };

  const setRecSeries = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      copy[exIndex] = { ...copy[exIndex], series: val };
      return copy;
    });
  };
  const setWorkSeries = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      copy[exIndex] = { ...copy[exIndex], series2: val };
      return copy;
    });
  };
  const setStandardSeries = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      copy[exIndex] = { ...copy[exIndex], series: val, series2: '' };
      return copy;
    });
  };
  const setRecReps = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      const [, w] = splitComposed(copy[exIndex].reps || '');
      copy[exIndex] = { ...copy[exIndex], reps: `${val} + ${w || '8-10'}` };
      return copy;
    });
  };
  const setWorkReps = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      const [r] = splitComposed(copy[exIndex].reps || '');
      copy[exIndex] = { ...copy[exIndex], reps: `${r || '12'} + ${val}` };
      return copy;
    });
  };
  const setStandardReps = (exIndex: number, val: string) => {
    setLocalExercises((prev) => {
      const copy = [...prev];
      copy[exIndex] = { ...copy[exIndex], reps: val };
      return copy;
    });
  };

  return (
    <Card className={`overflow-hidden border ${surface}`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">{day.day}</h4>
            <span className="text-xs text-muted-foreground">({day.exercises.length} exercícios)</span>
          </div>
          <div className="flex items-center gap-1">
            {editable && !editing && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={startEditing}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            )}
            {editing && (
              <Button variant="default" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={commitEdits}>
                <Check className="h-3 w-3" /> Confirmar
              </Button>
            )}
            {onCopy(buildDayCopyText(day))}
          </div>
        </div>

        {editing ? (
          // ===== EDIT MODE: structured cards per exercise =====
          <div className="space-y-3 p-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayExercises.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
                {displayExercises.map((ex, exIndex) => {
                  const mode = detectMode(ex);
                  const [recReps, workReps] = splitComposed(ex.reps || '');
                  return (
                    <SortableExerciseItem key={`edit-${day.day}-${exIndex}`} id={String(exIndex)} position={exIndex + 1} onRemove={() => removeExercise(exIndex)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[180px]">
                          <ExerciseCombobox
                            value={ex.exercise}
                            options={exerciseOptions}
                            onChange={(val) => handleFieldChange(exIndex, 'exercise', val)}
                          />
                        </div>
                        <Select value={mode} onValueChange={(v) => setMode(exIndex, v as StructureMode)}>
                          <SelectTrigger className="h-7 text-xs w-[210px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard" className="text-xs">Padrão</SelectItem>
                            <SelectItem value="recognition" className="text-xs">Reconhecimento + trabalho</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {mode === 'standard' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Séries</label>
                            <QuickSelect value={ex.series} options={WORK_SERIES_OPTS} onChange={(v) => setStandardSeries(exIndex, v)} />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Reps</label>
                            <QuickSelect value={ex.reps} options={WORK_REPS_OPTS} onChange={(v) => setStandardReps(exIndex, v)} />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">RIR</label>
                            <QuickSelect value={ex.rir} options={RIR_OPTS} onChange={(v) => handleFieldChange(exIndex, 'rir', v)} />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pausa</label>
                            <QuickSelect value={ex.pause} options={PAUSE_OPTS} onChange={(v) => handleFieldChange(exIndex, 'pause', v)} />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md border border-dashed border-primary/30 p-2 space-y-1">
                              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Reconhecimento</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="space-y-0.5">
                                  <label className="text-[9px] text-muted-foreground uppercase">Séries</label>
                                  <QuickSelect value={ex.series} options={REC_SERIES_OPTS} onChange={(v) => setRecSeries(exIndex, v)} width="w-full" />
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[9px] text-muted-foreground uppercase">Reps</label>
                                  <QuickSelect value={recReps} options={REC_REPS_OPTS} onChange={(v) => setRecReps(exIndex, v)} width="w-full" />
                                </div>
                              </div>
                            </div>
                            <div className="rounded-md border border-dashed border-accent/40 p-2 space-y-1">
                              <p className="text-[10px] font-bold text-accent-foreground uppercase tracking-wider">Trabalho</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="space-y-0.5">
                                  <label className="text-[9px] text-muted-foreground uppercase">Séries</label>
                                  <QuickSelect value={ex.series2} options={WORK_SERIES_OPTS} onChange={(v) => setWorkSeries(exIndex, v)} width="w-full" />
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[9px] text-muted-foreground uppercase">Reps</label>
                                  <QuickSelect value={workReps} options={WORK_REPS_OPTS} onChange={(v) => setWorkReps(exIndex, v)} width="w-full" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">RIR (trabalho)</label>
                              <QuickSelect value={ex.rir} options={RIR_OPTS} onChange={(v) => handleFieldChange(exIndex, 'rir', v)} width="w-full" />
                            </div>
                            <div className="space-y-0.5">
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Pausa</label>
                              <QuickSelect value={ex.pause} options={PAUSE_OPTS} onChange={(v) => handleFieldChange(exIndex, 'pause', v)} width="w-full" />
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Resumo: <span className="font-mono text-foreground">{ex.series || '?'}x{recReps || '?'} + {ex.series2 || '?'}x{workReps || '?'}</span>
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">Variação</label>
                        <div className="flex-1">
                          <ExerciseCombobox
                            value={ex.variation}
                            options={exerciseOptions}
                            onChange={(val) => handleFieldChange(exIndex, 'variation', val)}
                          />
                        </div>
                      </div>
                    </SortableExerciseItem>
                  );
                })}
              </SortableContext>
            </DndContext>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={addExercise}>
              <Plus className="h-3 w-3" /> Adicionar exercício
            </Button>
          </div>
        ) : (
          // ===== READ MODE: original table =====
          <div className="px-2 py-2 overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 px-3">Treino do Dia</TableHead>
                  <TableHead className="h-9 px-3">Exercício</TableHead>
                  <TableHead className="h-9 px-3 text-center">Séries</TableHead>
                  <TableHead className="h-9 px-3 text-center">Séries 2</TableHead>
                  <TableHead className="h-9 px-3 text-center">Reps</TableHead>
                  <TableHead className="h-9 px-3 text-center">RIR</TableHead>
                  <TableHead className="h-9 px-3 text-center">Pausa</TableHead>
                  <TableHead className="h-9 px-3 hidden sm:table-cell">Descrição</TableHead>
                  <TableHead className="h-9 px-3">Variação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayExercises.map((ex, exIndex) => (
                  <TableRow key={`${day.day}-${ex.exercise}-${exIndex}`}>
                    <TableCell className="px-3 py-2 font-semibold text-primary align-top whitespace-nowrap">{day.day}</TableCell>
                    <TableCell className="px-3 py-2 font-medium align-top">{ex.exercise}</TableCell>
                    <TableCell className="px-3 py-2 text-center align-top">{ex.series || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-center align-top">{ex.series2 || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-center align-top">{ex.reps || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-center align-top">{ex.rir || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-center align-top">{ex.pause || '—'}</TableCell>
                    <TableCell className="px-3 py-2 align-top text-muted-foreground hidden sm:table-cell max-w-[200px]">
                      {ex.description || '—'}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top text-muted-foreground">{ex.variation || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/60 bg-background/60 px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            Total: {day.exercises.length} exercícios
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrainingDayCard;
