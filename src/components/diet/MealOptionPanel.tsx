/**
 * Editor das opções 2 e 3 (Banco de refeições) dentro do "Ajuste de porções".
 * A opção 1 continua sendo a refeição do plano, editada pelo bloco de sempre.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Replace, Trash2 } from 'lucide-react';
import type { FoodIndex, FoodRecord } from '@/lib/nutritionEngine';
import { recomputeOptionItem, sumOptionItems, type MealOption } from '@/lib/mealBank';
import CanonicalFoodPickerDialog from './CanonicalFoodPickerDialog';
import CanonicalFoodSubstitutionDialog from './CanonicalFoodSubstitutionDialog';

interface Props {
  option: MealOption;
  optionNumber: number;
  planKcal: number;
  foods: FoodRecord[];
  index: FoodIndex;
  studentId?: string | null;
  objective?: string | null;
  dietPhase?: string | null;
  mealName?: string | null;
  mealTime?: string | null;
  workoutTime?: string | null;
  onChange: (option: MealOption) => void;
  onSwap: () => void;
}

const parseGrams = (text: string): number | null => {
  const n = Number(String(text ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

const MealOptionPanel: React.FC<Props> = ({ option, optionNumber, planKcal, foods, index, studentId, objective, dietPhase, mealName, mealTime, workoutTime, onChange, onSwap }) => {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);

  const totals = sumOptionItems(option.items);
  const diff = Math.round(totals.kcal - planKcal);

  const update = (items: MealOption['items']) =>
    onChange({ ...option, items: items.map((it) => recomputeOptionItem(it, index)) });

  const commit = (i: number, text: string) => {
    setDrafts((p) => { const c = { ...p }; delete c[i]; return c; });
    const g = parseGrams(text);
    if (g === null) return;
    update(option.items.map((it, j) => (j === i ? { ...it, qtyGrams: g } : it)));
  };

  return (
    <div className="space-y-2" data-testid={`meal-option-panel-${optionNumber}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-foreground">
          {option.name}
          {option.bankCode && <span className="ml-1 font-normal text-muted-foreground">({option.bankCode})</span>}
        </p>
        <span className="text-muted-foreground">
          {Math.round(totals.kcal)} kcal · {Math.round(totals.p)}P · {Math.round(totals.c)}C · {Math.round(totals.g)}G ·{' '}
          <strong className={Math.abs(diff) <= planKcal * 0.1 ? 'text-foreground' : 'text-destructive'}>
            {diff >= 0 ? '+' : ''}{diff} kcal vs Opção 1
          </strong>
        </span>
      </div>
      <div className="space-y-1">
        {option.items.map((item, i) => (
          <div key={`${item.foodId ?? item.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs">
            <span className="min-w-[8rem] flex-1 text-foreground">
              <button
                type="button"
                className="min-h-[32px] rounded px-1 py-1 text-left underline-offset-2 hover:bg-primary/10 hover:underline"
                aria-label={`Substituir ${item.name}`}
                onClick={() => setReplacing(i)}
              >
                {item.name}
              </button>
            </span>
            <Input
              className="h-7 w-20 text-xs"
              inputMode="decimal"
              aria-label={`Gramas de ${item.name}`}
              value={drafts[i] ?? String(item.qtyGrams)}
              onChange={(e) => setDrafts((p) => ({ ...p, [i]: e.target.value }))}
              onBlur={(e) => commit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
            <span className="text-muted-foreground">g</span>
            <span className="w-40 text-right text-muted-foreground">
              {Math.round(item.macros.kcal)} kcal · {fmt1(item.macros.p)}P · {fmt1(item.macros.c)}C · {fmt1(item.macros.g)}G
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remover ${item.name}`}
              onClick={() => update(option.items.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      {option.prep && <p className="text-[11px] text-muted-foreground"><strong>Como preparar:</strong> {option.prep}</p>}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar alimento
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onSwap}>
          <Replace className="mr-1 h-3 w-3" /> Trocar refeição
        </Button>
      </div>

      <CanonicalFoodPickerDialog
        open={adding}
        onOpenChange={setAdding}
        foods={foods}
        title="Adicionar alimento"
        onSelect={(food) => {
          setAdding(false);
          update([...option.items, { foodId: food.id, name: food.name, qtyGrams: 100, macros: { kcal: 0, p: 0, c: 0, g: 0 } }]);
        }}
      />
      {replacing !== null && option.items[replacing] && (
        <CanonicalFoodSubstitutionDialog
          open
          onOpenChange={(o) => !o && setReplacing(null)}
          foods={foods}
          currentName={option.items[replacing].name}
          currentQtyGrams={option.items[replacing].qtyGrams}
          currentMacros={option.items[replacing].macros}
          mealTotals={totals}
          dayTotals={null}
          dayTarget={null}
          studentId={studentId}
          objective={objective}
          dietPhase={dietPhase}
          mealName={mealName}
          mealTime={mealTime}
          workoutTime={workoutTime}
          onSelect={(food, qty) => {
            const at = replacing;
            setReplacing(null);
            update(option.items.map((it, j) => (j === at ? { foodId: food.id, name: food.name, qtyGrams: qty, macros: it.macros } : it)));
          }}
          onSelectCombination={(items) => {
            const at = replacing;
            setReplacing(null);
            update(option.items.flatMap((it, j) => j === at
              ? items.map((item) => ({ foodId: item.food.id, name: item.food.name, qtyGrams: item.qtyGrams, macros: item.macros }))
              : [it]));
          }}
        />
      )}
    </div>
  );
};

export default MealOptionPanel;
