/**
 * FASE 5.1 — seletor canônico de alimento (por ID real da base).
 * Sem IA, sem fuzzy match: a busca é apenas um filtro de texto na lista e o
 * retorno é sempre um FoodRecord com id real.
 */
import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { FoodRecord } from '@/lib/nutritionEngine';
import { filterFoodsBySearch } from '@/lib/foodSearch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: FoodRecord[];
  title?: string;
  onSelect: (food: FoodRecord) => void;
}

const CanonicalFoodPickerDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  foods,
  title = 'Escolher alimento',
  onSelect,
}) => {
  const [term, setTerm] = useState('');

  const filtered = useMemo(
    () => filterFoodsBySearch(foods, term).slice(0, 80),
    [foods, term],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Buscar na base de alimentos..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">Nenhum alimento encontrado.</p>
          ) : (
            filtered.map((f) => {
              const origin = [f.brand, f.source].filter((v) => String(v ?? '').trim()).join(' · ');
              return (
                <Button
                  key={f.id}
                  variant="ghost"
                  className="h-auto w-full justify-between gap-3 px-2 py-1.5 text-left text-xs"
                  onClick={() => {
                    onSelect(f);
                    onOpenChange(false);
                    setTerm('');
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-foreground">{f.name}</span>
                    {origin && (
                      <span className="truncate text-[10px] text-muted-foreground">{origin}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {Math.round(f.calories)} kcal / {f.portion_size || 100}g
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CanonicalFoodPickerDialog;
