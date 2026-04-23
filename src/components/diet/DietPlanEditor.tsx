import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Sliders, AlertTriangle, Clock, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { parseSections, type ParsedFood, type ParsedMeal } from '@/lib/dietResultParser';
import { computeDayTotals, scaleMealsToTarget } from '@/lib/dietMarkdownSerializer';
import FoodSubstitutionDialog from './FoodSubstitutionDialog';

interface DietPlanEditorProps {
  markdown: string;
  onMealsChange: (meals: ParsedMeal[]) => void;
}

const num = (v?: string) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: number) => Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1);

/** Extract every meal across all meal sections from the markdown. */
const extractMeals = (markdown: string): ParsedMeal[] => {
  const sections = parseSections(markdown);
  const out: ParsedMeal[] = [];
  for (const s of sections) {
    if (s.type === 'meal' && s.meals) out.push(...s.meals);
  }
  return out;
};

const DietPlanEditor: React.FC<DietPlanEditorProps> = ({ markdown, onMealsChange }) => {
  const initialMeals = useMemo(() => extractMeals(markdown), [markdown]);
  const [meals, setMeals] = useState<ParsedMeal[]>(initialMeals);
  const [target, setTarget] = useState<number>(() => Math.round(computeDayTotals(initialMeals).kcal));
  const [subTarget, setSubTarget] = useState<{ mealIdx: number; foodIdx: number } | null>(null);
  const [addingForMeal, setAddingForMeal] = useState<number | null>(null);

  // Reset when source markdown changes
  useEffect(() => {
    const fresh = extractMeals(markdown);
    setMeals(fresh);
    setTarget(Math.round(computeDayTotals(fresh).kcal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown]);

  // Notify parent
  useEffect(() => { onMealsChange(meals); }, [meals, onMealsChange]);

  const totals = useMemo(() => computeDayTotals(meals), [meals]);
  const diff = totals.kcal - target;
  const overTarget = diff > 25;          // tolerance ±25 kcal
  const underTarget = diff < -25;
  const offTarget = overTarget || underTarget;

  const updateMeals = useCallback((updater: (prev: ParsedMeal[]) => ParsedMeal[]) => {
    setMeals((prev) => updater(prev));
  }, []);

  const removeFood = (mealIdx: number, foodIdx: number) => {
    updateMeals((prev) => prev.map((m, mi) => mi !== mealIdx ? m : { ...m, foods: m.foods.filter((_, fi) => fi !== foodIdx) }));
  };

  const handleSubstitute = (newFood: ParsedFood) => {
    if (!subTarget) return;
    const { mealIdx, foodIdx } = subTarget;
    updateMeals((prev) => prev.map((m, mi) => mi !== mealIdx ? m : {
      ...m,
      foods: m.foods.map((f, fi) => fi === foodIdx ? { ...newFood, sub: f.sub } : f),
    }));
    setSubTarget(null);
  };

  const handleAddFood = (mealIdx: number, food: ParsedFood) => {
    updateMeals((prev) => prev.map((m, mi) => mi !== mealIdx ? m : { ...m, foods: [...m.foods, food] }));
    setAddingForMeal(null);
  };

  const handleAdjustPortions = () => {
    setMeals((prev) => scaleMealsToTarget(prev, target));
    toast.success(`Porções ajustadas para ${target} kcal`);
  };

  if (meals.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhuma refeição reconhecida nesta dieta para edição visual.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Target / totals banner */}
      <Card className={`border ${offTarget ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Sliders className="h-4 w-4 text-primary" />
              Meta diária
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
                className="h-8 w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">kcal</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Kcal atual</div>
              <div className={`font-bold ${offTarget ? 'text-destructive' : 'text-foreground'}`}>{fmt(totals.kcal)}</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Proteína</div>
              <div className="font-bold">{fmt(totals.p)} g</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Carbo</div>
              <div className="font-bold">{fmt(totals.c)} g</div>
            </div>
            <div className="rounded bg-background/60 p-1.5">
              <div className="text-[10px] text-muted-foreground">Gordura</div>
              <div className="font-bold">{fmt(totals.g)} g</div>
            </div>
          </div>
          {offTarget && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-destructive/10 p-2">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>
                  {overTarget ? `Ultrapassou em ${fmt(diff)} kcal` : `Faltam ${fmt(-diff)} kcal`} para a meta.
                </span>
              </div>
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleAdjustPortions}>
                <Sliders className="h-3 w-3 mr-1" /> Ajustar porções
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meals */}
      {meals.map((meal, mealIdx) => (
        <Card key={`${meal.name}-${mealIdx}`} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
                {meal.name}
                {meal.time && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-normal">
                    <Clock className="h-3 w-3" /> {meal.time}
                  </span>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAddingForMeal(mealIdx)}>
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>

            <div className="px-1 py-1">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2">Alimento</TableHead>
                    <TableHead className="h-8 px-2">Qtd</TableHead>
                    <TableHead className="h-8 px-2 text-right">Kcal</TableHead>
                    <TableHead className="h-8 px-2 text-right">P</TableHead>
                    <TableHead className="h-8 px-2 text-right">C</TableHead>
                    <TableHead className="h-8 px-2 text-right">G</TableHead>
                    <TableHead className="h-8 px-2 w-[40px] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meal.foods.map((food, foodIdx) => (
                    <TableRow key={`${food.food}-${foodIdx}`}>
                      <TableCell
                        className="px-2 py-1.5 font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                        onClick={() => setSubTarget({ mealIdx, foodIdx })}
                        title="Clique para substituir"
                      >
                        {food.food}
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-muted-foreground">{food.qty || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.kcal || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.p || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.c || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">{food.g || '—'}</TableCell>
                      <TableCell className="px-2 py-1.5 text-right">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" title="Remover" onClick={() => removeFood(mealIdx, foodIdx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {meal.foods.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Sem alimentos. Use “Adicionar”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Substitute dialog */}
      {subTarget && (
        <FoodSubstitutionDialog
          open={true}
          onOpenChange={(open) => { if (!open) setSubTarget(null); }}
          originalFood={meals[subTarget.mealIdx].foods[subTarget.foodIdx]}
          onSubstitute={handleSubstitute}
        />
      )}

      {/* Add-food picker */}
      {addingForMeal !== null && (
        <AddFoodPicker
          open={true}
          onOpenChange={(open) => { if (!open) setAddingForMeal(null); }}
          onAdd={(food) => handleAddFood(addingForMeal, food)}
        />
      )}
    </div>
  );
};

/* ---------------- Add-food picker ---------------- */

interface AddFoodPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (food: ParsedFood) => void;
}

const AddFoodPicker: React.FC<AddFoodPickerProps> = ({ open, onOpenChange, onAdd }) => {
  const [search, setSearch] = useState('');
  const [portion, setPortion] = useState<number>(100);

  const { data: foods = [] } = useQuery({
    queryKey: ['foods-add-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return foods.slice(0, 25);
    return foods.filter((f: any) => f.name.toLowerCase().includes(q)).slice(0, 25);
  }, [foods, search]);

  const handlePick = (dbFood: any) => {
    const base = dbFood.portion_size || 100;
    const scale = portion / base;
    onAdd({
      food: dbFood.name,
      qty: `${portion} g`,
      kcal: fmt(num(String(dbFood.calories)) * scale),
      p: fmt(num(String(dbFood.protein)) * scale),
      c: fmt(num(String(dbFood.carbs)) * scale),
      g: fmt(num(String(dbFood.fats)) * scale),
    });
    setSearch('');
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3 ${open ? '' : 'hidden'}`}
      onClick={() => onOpenChange(false)}
    >
      <Card className="w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-3 space-y-2 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Adicionar alimento</h4>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Buscar alimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={portion}
                onChange={(e) => setPortion(Number(e.target.value) || 0)}
                className="h-9 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">g</span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum alimento encontrado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((f: any) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="w-full text-left py-2 px-2 hover:bg-muted/50 rounded text-xs flex justify-between gap-2"
                      onClick={() => handlePick(f)}
                    >
                      <span className="font-medium truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {f.calories}kcal / {f.portion_size}g
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DietPlanEditor;