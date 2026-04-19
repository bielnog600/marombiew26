import React, { useState, useCallback } from 'react';
import { Clock, UtensilsCrossed, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedFood, ParsedMeal } from '@/lib/dietResultParser';
import FoodSubstitutionDialog from './FoodSubstitutionDialog';

const MEAL_SURFACES = [
  'bg-gradient-to-br from-primary/12 to-accent/8 border-primary/25',
  'bg-gradient-to-br from-secondary to-accent/10 border-border',
  'bg-gradient-to-br from-accent/12 to-primary/8 border-accent/25',
];

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number, suffix = '') => {
  if (!Number.isFinite(v) || v <= 0) return '—';
  const r = Math.round(v * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return suffix ? `${s}${suffix}` : s;
};

const buildMealCopyText = (meal: ParsedMeal) =>
  `${meal.name}${meal.time ? ` (${meal.time})` : ''}:\n${meal.foods
    .map(
      (food) =>
        `• ${food.food} - ${food.qty}${food.kcal ? ` | ${food.kcal} kcal` : ''}${food.p ? ` | P:${food.p}` : ''}${food.c ? ` | C:${food.c}` : ''}${food.g ? ` | G:${food.g}` : ''}`,
    )
    .join('\n')}`;

interface MealCardProps {
  meal: ParsedMeal;
  index: number;
  onCopy: (text: string, label?: string) => React.ReactNode;
  isCompleted?: boolean;
  onToggleComplete?: () => void;
  hideSubstitutions?: boolean;
}

const MealCard: React.FC<MealCardProps> = ({ meal: initialMeal, index, onCopy, isCompleted, onToggleComplete, hideSubstitutions }) => {
  const [foods, setFoods] = useState<ParsedFood[]>(initialMeal.foods);
  const [selectedFoodIndex, setSelectedFoodIndex] = useState<number | null>(null);

  const surface = MEAL_SURFACES[index % MEAL_SURFACES.length];
  const hasSubs = !hideSubstitutions && foods.some((f) => f.sub);

  // Recalculate totals from current foods
  const totalKcal = foods.reduce((s, f) => s + parseNum(f.kcal), 0);
  const totalP = foods.reduce((s, f) => s + parseNum(f.p), 0);
  const totalC = foods.reduce((s, f) => s + parseNum(f.c), 0);
  const totalG = foods.reduce((s, f) => s + parseNum(f.g), 0);

  const meal: ParsedMeal = {
    ...initialMeal,
    foods,
    totalKcal: fmt(totalKcal, ' kcal'),
    totalP: fmt(totalP),
    totalC: fmt(totalC),
    totalG: fmt(totalG),
  };

  const handleSubstitute = (newFood: ParsedFood) => {
    if (selectedFoodIndex === null) return;
    setFoods((prev) => {
      const updated = [...prev];
      updated[selectedFoodIndex] = newFood;
      return updated;
    });
  };

  // Parse sub text like "1) Batata-doce (150g); 2) Inhame (140g); 3) Mandioca (120g)"
  const parseSubItems = (sub: string) => {
    return sub.split(/;\s*/).map((item) => {
      const cleaned = item.replace(/^\d+\)\s*/, '').trim();
      const match = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (match) return { name: match[1].trim(), portion: match[2].trim() };
      return { name: cleaned, portion: '' };
    }).filter((i) => i.name);
  };

  const handleQuickSwap = useCallback(async (foodIndex: number, subName: string, subPortion: string) => {
    const original = foods[foodIndex];
    const origKcalVal = parseNum(original.kcal);

    // Try to find in DB
    const { data } = await supabase
      .from('foods')
      .select('*')
      .ilike('name', `%${subName}%`)
      .limit(1);

    if (data && data.length > 0) {
      const dbFood = data[0];
      const kcalPer100 = dbFood.calories > 0 ? dbFood.calories / (dbFood.portion_size || 100) : 0;
      let newPortionG: number, newKcal: number, newP: number, newC: number, newG: number;

      if (kcalPer100 > 0 && origKcalVal > 0) {
        newPortionG = Math.round((origKcalVal / kcalPer100) * 10) / 10;
        const scale = newPortionG / (dbFood.portion_size || 100);
        newKcal = Math.round(dbFood.calories * scale);
        newP = Math.round(dbFood.protein * scale * 10) / 10;
        newC = Math.round(dbFood.carbs * scale * 10) / 10;
        newG = Math.round(dbFood.fats * scale * 10) / 10;
      } else {
        newPortionG = dbFood.portion_size || 100;
        newKcal = dbFood.calories;
        newP = dbFood.protein;
        newC = dbFood.carbs;
        newG = dbFood.fats;
      }

      setFoods((prev) => {
        const updated = [...prev];
        updated[foodIndex] = {
          food: dbFood.name,
          qty: `${newPortionG} g`,
          kcal: String(newKcal),
          p: String(newP),
          c: String(newC),
          g: String(newG),
          sub: original.sub,
        };
        return updated;
      });
      toast.success(`Substituído por ${dbFood.name}`);
    } else {
      // Not found in DB, just swap name/portion
      setFoods((prev) => {
        const updated = [...prev];
        updated[foodIndex] = {
          ...original,
          food: subName,
          qty: subPortion || original.qty,
        };
        return updated;
      });
      toast.success(`Substituído por ${subName}`);
    }
  }, [foods]);

  return (
    <>
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
                  {hasSubs && <TableHead className="h-9 px-3">Substituição</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {foods.map((food, foodIndex) => (
                  <TableRow key={`${meal.name}-${food.food}-${foodIndex}`}>
                    <TableCell
                      className="px-3 py-2 font-medium align-top cursor-pointer hover:text-primary hover:underline transition-colors"
                      onClick={() => setSelectedFoodIndex(foodIndex)}
                      title="Clique para substituir"
                    >
                      {food.food}
                    </TableCell>
                    <TableCell className="px-3 py-2 align-top text-muted-foreground">{food.qty || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-right align-top">{food.kcal || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-right align-top">{food.p || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-right align-top">{food.c || '—'}</TableCell>
                    <TableCell className="px-3 py-2 text-right align-top">{food.g || '—'}</TableCell>
                    {hasSubs && (
                      <TableCell className="px-3 py-2 align-top">
                        {food.sub ? (
                          <div className="flex flex-col gap-0.5">
                            {parseSubItems(food.sub).map((item, si) => (
                              <button
                                key={si}
                                onClick={() => handleQuickSwap(foodIndex, item.name, item.portion)}
                                className="text-left text-muted-foreground italic hover:text-primary hover:underline transition-colors text-xs"
                                title={`Trocar por ${item.name}`}
                              >
                                {item.name} {item.portion && <span className="text-primary/70">({item.portion})</span>}
                              </button>
                            ))}
                          </div>
                        ) : '—'}
                      </TableCell>
                    )}
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

          {onToggleComplete && (
            <button
              type="button"
              onClick={onToggleComplete}
              className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all duration-300 ${
                isCompleted
                  ? 'bg-green-500/15 text-green-500'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Check className={`h-4 w-4 ${isCompleted ? '' : 'opacity-40'}`} />
              {isCompleted ? 'Refeição concluída ✓' : 'Registrar refeição'}
            </button>
          )}
        </CardContent>
      </Card>

      {selectedFoodIndex !== null && (
        <FoodSubstitutionDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedFoodIndex(null);
          }}
          originalFood={foods[selectedFoodIndex]}
          onSubstitute={handleSubstitute}
        />
      )}
    </>
  );
};

export default MealCard;
