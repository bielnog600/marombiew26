import React, { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ParsedFood } from '@/lib/dietResultParser';
import type { DietTargets } from '@/lib/dietSchema';
import { foodRecordFromRow, type FoodRecord, type FoodRow } from '@/lib/nutritionEngine';
import { macrosForFoodQty, type SubstitutionCombinationItem } from '@/lib/canonicalFoodSubstitution';
import { buildFoodIndex } from '@/lib/nutritionEngine';
import CanonicalFoodSubstitutionDialog from './CanonicalFoodSubstitutionDialog';

interface FoodSubstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalFood: ParsedFood;
  /** Um alimento ou todos os itens de uma combinação substituem o original. */
  onSubstitute: (newFood: ParsedFood | ParsedFood[]) => void;
  mealTotals?: { kcal: number; p: number; c: number; g: number };
  /** Mantido no contrato das telas existentes; a meta não bloqueia a troca. */
  targets?: DietTargets | null;
  studentId?: string | null;
  dietPhase?: string | null;
  mealName?: string | null;
  mealTime?: string | null;
}

const parseNum = (v?: string) => {
  if (!v) return 0;
  const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const roundedQty = (grams: number) => String(Math.round(grams * 10) / 10);

/** Adapter ParsedFood → o mesmo diálogo/motor canônico usado pelo admin. */
const FoodSubstitutionDialog: React.FC<FoodSubstitutionDialogProps> = ({
  open,
  onOpenChange,
  originalFood,
  onSubstitute,
  mealTotals,
  studentId,
  dietPhase,
  mealName,
  mealTime,
}) => {
  const { data: rows = [] } = useQuery({
    queryKey: ['foods-for-substitution'],
    queryFn: async () => {
      const { data, error } = await supabase.from('foods').select('*').order('name');
      if (error) throw error;
      return (data || []) as FoodRow[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const foods = useMemo(() => rows.map(foodRecordFromRow), [rows]);
  const index = useMemo(() => buildFoodIndex(foods), [foods]);
  const currentMacros = useMemo(() => ({
    kcal: parseNum(originalFood.kcal),
    p: parseNum(originalFood.p),
    c: parseNum(originalFood.c),
    g: parseNum(originalFood.g),
  }), [originalFood.kcal, originalFood.p, originalFood.c, originalFood.g]);

  const toParsedFood = useCallback((food: FoodRecord, qtyGrams: number): ParsedFood => {
    const macros = macrosForFoodQty(food.id, qtyGrams, index);
    return {
      food: food.name,
      // A quantidade persistida continua em gramas para edição/rebalanceamento;
      // a apresentação "2 ovos (100 g)" aparece nas opções calculadas.
      qty: `${roundedQty(qtyGrams)} g`,
      kcal: String(Math.round(macros.kcal)),
      p: String(Math.round(macros.p * 10) / 10),
      c: String(Math.round(macros.c * 10) / 10),
      g: String(Math.round(macros.g * 10) / 10),
      sub: originalFood.sub,
    };
  }, [index, originalFood.sub]);

  const selectCombination = useCallback((items: SubstitutionCombinationItem[]) => {
    onSubstitute(items.map((item) => toParsedFood(item.food, item.qtyGrams)));
  }, [onSubstitute, toParsedFood]);

  return (
    <CanonicalFoodSubstitutionDialog
      open={open}
      onOpenChange={onOpenChange}
      foods={foods}
      currentName={originalFood.food}
      currentQtyGrams={parseNum(originalFood.qty)}
      currentMacros={currentMacros}
      mealTotals={mealTotals}
      studentId={studentId}
      dietPhase={dietPhase}
      mealName={mealName ?? originalFood.food}
      mealTime={mealTime}
      onSelect={(food, qty) => onSubstitute(toParsedFood(food, qty))}
      onSelectCombination={selectCombination}
    />
  );
};

export default FoodSubstitutionDialog;
