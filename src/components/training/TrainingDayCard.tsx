import React from 'react';
import { Dumbbell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ParsedTrainingDay } from '@/lib/trainingResultParser';

const DAY_SURFACES = [
  'bg-gradient-to-br from-primary/12 to-accent/8 border-primary/25',
  'bg-gradient-to-br from-secondary to-accent/10 border-border',
  'bg-gradient-to-br from-accent/12 to-primary/8 border-accent/25',
];

const sanitizeForTsv = (value: string) => value.replace(/"/g, 'seg');

const buildDayCopyText = (day: ParsedTrainingDay) => {
  const rows = day.exercises.map(
    (ex) =>
      [day.day, ex.exercise, ex.series || '—', ex.reps || '—', ex.rir || '—', sanitizeForTsv(ex.pause || '—'), ex.description || '—', ex.variation || '—'].join('\t'),
  );
  return rows.join('\n');
};

interface TrainingDayCardProps {
  day: ParsedTrainingDay;
  index: number;
  onCopy: (text: string, label?: string) => React.ReactNode;
}

const TrainingDayCard: React.FC<TrainingDayCardProps> = ({ day, index, onCopy }) => {
  const surface = DAY_SURFACES[index % DAY_SURFACES.length];

  return (
    <Card className={`overflow-hidden border ${surface}`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">{day.day}</h4>
            <span className="text-xs text-muted-foreground">({day.exercises.length} exercícios)</span>
          </div>
          {onCopy(buildDayCopyText(day))}
        </div>

        <div className="px-2 py-2 overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3">Treino do Dia</TableHead>
                <TableHead className="h-9 px-3">Exercício</TableHead>
                <TableHead className="h-9 px-3 text-center">Séries</TableHead>
                <TableHead className="h-9 px-3 text-center">Reps</TableHead>
                <TableHead className="h-9 px-3 text-center">RIR</TableHead>
                <TableHead className="h-9 px-3 text-center">Pausa</TableHead>
                <TableHead className="h-9 px-3 hidden sm:table-cell">Descrição</TableHead>
                <TableHead className="h-9 px-3">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {day.exercises.map((ex, exIndex) => (
                <TableRow key={`${day.day}-${ex.exercise}-${exIndex}`}>
                  <TableCell className="px-3 py-2 font-semibold text-primary align-top whitespace-nowrap">{day.day}</TableCell>
                  <TableCell className="px-3 py-2 font-medium align-top">{ex.exercise}</TableCell>
                  <TableCell className="px-3 py-2 text-center align-top">{ex.series || '—'}</TableCell>
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
