import React, { useEffect, useState } from 'react';
import { Dumbbell, Pencil, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { ParsedTrainingDay, ParsedExercise } from '@/lib/trainingResultParser';
import { supabase } from '@/integrations/supabase/client';

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

const TrainingDayCard: React.FC<TrainingDayCardProps> = ({ day, index, onCopy, editable, onDayChange }) => {
  const surface = DAY_SURFACES[index % DAY_SURFACES.length];
  const [editing, setEditing] = useState(false);
  const [localExercises, setLocalExercises] = useState<ParsedExercise[]>(day.exercises);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);

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
                  <TableCell className="px-3 py-2 font-medium align-top">
                    {editing ? (
                      <ExerciseCombobox
                        value={ex.exercise}
                        options={exerciseOptions}
                        onChange={(val) => handleFieldChange(exIndex, 'exercise', val)}
                      />
                    ) : ex.exercise}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">
                    {editing ? <Input value={ex.series} onChange={e => handleFieldChange(exIndex, 'series', e.target.value)} className="h-7 text-xs w-14 text-center" /> : (ex.series || '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">
                    {editing ? <Input value={ex.series2} onChange={e => handleFieldChange(exIndex, 'series2', e.target.value)} className="h-7 text-xs w-14 text-center" /> : (ex.series2 || '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">
                    {editing ? <Input value={ex.reps} onChange={e => handleFieldChange(exIndex, 'reps', e.target.value)} className="h-7 text-xs w-14 text-center" /> : (ex.reps || '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">
                    {editing ? <Input value={ex.rir} onChange={e => handleFieldChange(exIndex, 'rir', e.target.value)} className="h-7 text-xs w-14 text-center" /> : (ex.rir || '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">
                    {editing ? <Input value={ex.pause} onChange={e => handleFieldChange(exIndex, 'pause', e.target.value)} className="h-7 text-xs w-16 text-center" /> : (ex.pause || '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2 align-top text-muted-foreground hidden sm:table-cell max-w-[200px]">
                    {ex.description || '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2 align-top text-muted-foreground">
                    {editing ? (
                      <ExerciseCombobox
                        value={ex.variation}
                        options={exerciseOptions}
                        onChange={(val) => handleFieldChange(exIndex, 'variation', val)}
                      />
                    ) : (ex.variation || '—')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

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
