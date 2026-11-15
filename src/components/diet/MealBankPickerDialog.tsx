import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { FoodIndex } from '@/lib/nutritionEngine';
import {
  MEAL_SLOT_LABEL,
  fitBankMeal,
  eligibleBankMeals,
  normText,
  sumOptionItems,
  type BankMeal,
  type MealSlot,
  type StudentMealContext,
} from '@/lib/mealBank';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bank: BankMeal[];
  index: FoodIndex;
  ctx: StudentMealContext;
  slots: MealSlot[];
  targetKcal: number;
  /** Macros da Opção 1: com eles, a lista mostra o que fica fora da faixa. */
  targetMacros?: { kcal: number; p: number; c: number; g: number };
  excludeCodes?: string[];
  onSelect: (meal: BankMeal) => void;
}

/** "Trocar refeição": banco filtrado pelo horário, com kcal já escalada. */
const MealBankPickerDialog: React.FC<Props> = ({ open, onOpenChange, bank, index, ctx, slots, targetKcal, targetMacros, excludeCodes = [], onSelect }) => {
  const [query, setQuery] = useState('');
  const [allSlots, setAllSlots] = useState(false);

  const rows = useMemo(() => {
    const eligible = new Set(eligibleBankMeals(bank, slots, ctx, index).map((m) => m.code));
    const q = normText(query);
    return bank
      .filter((m) => m.active)
      .filter((m) => (allSlots ? true : eligible.has(m.code)))
      .filter((m) => !q || normText(`${m.code} ${m.name} ${m.tags.join(' ')}`).includes(q))
      .map((m) => {
        const fit = fitBankMeal(m, index, targetMacros ?? targetKcal, { slots, ctx });
        return { meal: m, totals: sumOptionItems(fit.option.items), fits: fit.ok, eligible: eligible.has(m.code), used: excludeCodes.includes(m.code) };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.fits) - Number(a.fits) || a.meal.code.localeCompare(b.meal.code));
  }, [bank, slots, ctx, index, query, allSlots, targetKcal, targetMacros, excludeCodes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trocar refeição</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {slots.map((s) => MEAL_SLOT_LABEL[s]).join(' / ') || 'Horário não identificado'} · gramas ajustadas para ~{Math.round(targetKcal)} kcal
          </p>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome, código ou etiqueta" className="h-8 text-xs" />
          <div className="flex items-center gap-2">
            <Switch id="bank-all-slots" checked={allSlots} onCheckedChange={setAllSlots} />
            <Label htmlFor="bank-all-slots" className="text-xs">Mostrar outros horários e refeições fora da ficha</Label>
          </div>
          {rows.length === 0 && <p className="py-4 text-center text-muted-foreground">Nenhuma refeição do banco para este horário.</p>}
          <div className="space-y-1.5">
            {rows.map(({ meal, totals, fits, eligible, used }) => (
              <button
                key={meal.code}
                type="button"
                onClick={() => onSelect(meal)}
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-left hover:border-primary/60"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{meal.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="text-[9px]">{meal.code}</Badge>
                  <Badge variant="outline" className="text-[9px]">{meal.origin}</Badge>
                  <Badge variant="outline" className="text-[9px]">{MEAL_SLOT_LABEL[meal.slot]}</Badge>
                  {!eligible && <Badge variant="outline" className="border-destructive/50 text-[9px] text-destructive">fora do horário/ficha</Badge>}
                  {used && <Badge variant="outline" className="text-[9px]">já usada no dia</Badge>}
                  {!fits && <Badge variant="outline" className="border-destructive/50 text-[9px] text-destructive">não equivale à Opção 1</Badge>}
                  <span className="ml-auto font-semibold text-primary">{Math.round(totals.kcal)} kcal</span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  P {Math.round(totals.p)} · C {Math.round(totals.c)} · G {Math.round(totals.g)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MealBankPickerDialog;
