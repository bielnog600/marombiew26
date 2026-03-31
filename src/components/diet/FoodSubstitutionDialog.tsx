import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ArrowRightLeft, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { ParsedFood } from '@/lib/dietResultParser';

interface FoodSubstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalFood: ParsedFood;
  onSubstitute: (newFood: ParsedFood) => void;
}

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const FoodSubstitutionDialog: React.FC<FoodSubstitutionDialogProps> = ({
  open,
  onOpenChange,
  originalFood,
  onSubstitute,
}) => {
  const [search, setSearch] = useState('');

  const { data: foods = [] } = useQuery({
    queryKey: ['foods-for-substitution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return foods;
    const q = search.toLowerCase();
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, search]);

  const origKcal = parseNum(originalFood.kcal);

  const handleSelect = useCallback(
    (food: typeof foods[number]) => {
      // Calculate portion to match original kcal
      const kcalPer100 = food.calories > 0 ? food.calories / (food.portion_size || 100) : 0;
      let newPortionG: number;
      let newKcal: number;
      let newP: number;
      let newC: number;
      let newG: number;

      if (kcalPer100 > 0 && origKcal > 0) {
        // Scale portion so kcal matches original
        newPortionG = Math.round((origKcal / kcalPer100) * 10) / 10;
        const scale = newPortionG / (food.portion_size || 100);
        newKcal = Math.round(food.calories * scale);
        newP = Math.round(food.protein * scale * 10) / 10;
        newC = Math.round(food.carbs * scale * 10) / 10;
        newG = Math.round(food.fats * scale * 10) / 10;
      } else {
        newPortionG = food.portion_size || 100;
        newKcal = food.calories;
        newP = food.protein;
        newC = food.carbs;
        newG = food.fats;
      }

      onSubstitute({
        food: food.name,
        qty: `${newPortionG} g`,
        kcal: String(newKcal),
        p: String(newP),
        c: String(newC),
        g: String(newG),
        sub: originalFood.sub,
      });
      onOpenChange(false);
      setSearch('');
    },
    [origKcal, onSubstitute, onOpenChange, originalFood.sub],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Substituir alimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Original food info */}
          <div className="rounded-lg bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground mb-1">Alimento atual</p>
            <p className="text-sm font-semibold">{originalFood.food}</p>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{originalFood.qty}</span>
              <span>{originalFood.kcal} kcal</span>
              <span>P:{originalFood.p}</span>
              <span>C:{originalFood.c}</span>
              <span>G:{originalFood.g}</span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar alimento substituto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Food list */}
          <ScrollArea className="h-[280px]">
            <div className="space-y-1 pr-3">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Nenhum alimento encontrado
                </p>
              ) : (
                filtered.map((food) => {
                  const kcalPer100 = food.calories > 0 ? food.calories / (food.portion_size || 100) : 0;
                  const newPortion = kcalPer100 > 0 && origKcal > 0
                    ? Math.round((origKcal / kcalPer100) * 10) / 10
                    : food.portion_size || 100;

                  return (
                    <button
                      key={food.id}
                      onClick={() => handleSelect(food)}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-primary/10 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{food.name}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="text-primary font-medium">{newPortion}g</span>
                          <span>≈{origKcal > 0 ? origKcal : food.calories} kcal</span>
                          <span>P:{food.protein}</span>
                          <span>C:{food.carbs}</span>
                          <span>G:{food.fats}</span>
                        </div>
                      </div>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FoodSubstitutionDialog;
