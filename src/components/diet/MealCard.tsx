import React from 'react';
import { Clock, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ParsedMeal } from '@/lib/dietResultParser';

const MEAL_SURFACES = [
  'bg-gradient-to-br from-primary/12 to-accent/8 border-primary/25',
  'bg-gradient-to-br from-secondary to-accent/10 border-border',
  'bg-gradient-to-br from-accent/12 to-primary/8 border-accent/25',
];

const buildMealCopyText = (meal: ParsedMeal) => `${meal.name}${meal.time ? ` (${meal.time})` : ''}:\n${meal.foods
  .map(
    (food) =>
      `• ${food.food} - ${food.qty}${food.kcal ? ` | ${food.kcal} kcal` : ''}${food.p ? ` | P:${food.p}` : ''}${food.c ? ` | C:${food.c}` : ''}${food.g ? ` | G:${food.g}` : ''}`,
  )
  .join('\n')}`;

interface MealCardProps {
  meal: ParsedMeal;
  index: number;
  onCopy: (text: string, label?: string) => React.ReactNode;
}

const MealCard: React.FC<MealCardProps> = ({ meal, index, onCopy }) => {
  const surface = MEAL_SURFACES[index % MEAL_SURFACES.length];

  return (
    <Card className={`overflow-hidden border ${surface}`}>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-sm">{meal.name}</h4>
            {meal.time && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {meal.time}
              </span>
            )}
          </div>
          {onCopy(buildMealCopyText(meal))}
        </div>

        <div className="px-2 py-2">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3">Alimento</TableHead>
                <TableHead className="h-9 px-3">Porção (g)</TableHead>
                <TableHead className="h-9 px-3 text-right">Kcal</TableHead>
                <TableHead className="h-9 px-3 text-right">P</TableHead>
                <TableHead className="h-9 px-3 text-right">C</TableHead>
                <TableHead className="h-9 px-3 text-right">G</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meal.foods.map((food, foodIndex) => (
                <TableRow key={`${meal.name}-${food.food}-${foodIndex}`}>
                  <TableCell className="px-3 py-2 font-medium align-top">{food.food}</TableCell>
                  <TableCell className="px-3 py-2 align-top text-muted-foreground">{food.qty || '—'}</TableCell>
                  <TableCell className="px-3 py-2 text-right align-top">{food.kcal || '—'}</TableCell>
                  <TableCell className="px-3 py-2 text-right align-top">{food.p || '—'}</TableCell>
                  <TableCell className="px-3 py-2 text-right align-top">{food.c || '—'}</TableCell>
                  <TableCell className="px-3 py-2 text-right align-top">{food.g || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-background/60 px-4 py-3">
          <span className="text-xs font-semibold tracking-wide text-foreground">Total da refeição</span>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-foreground">
            <span>{meal.totalKcal || '—'}</span>
            <span>P: {meal.totalP || '—'}</span>
            <span>C: {meal.totalC || '—'}</span>
            <span>G: {meal.totalG || '—'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MealCard;