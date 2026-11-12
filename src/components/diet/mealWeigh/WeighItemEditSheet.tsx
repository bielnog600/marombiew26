import React, { useMemo, useState } from 'react';
import { ImageOff, Save, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { macrosForGrams, matchPlanFood, planFoodToWeighFood, round1, type PlannedMeal, type WeighFood, type WeighedItem } from '@/lib/mealWeigh';
import { takenPlanIndexes, weighFoodForItem, type WeighItemChange } from '@/lib/mealWeigh/editItems';

export const MacroLine: React.FC<{ m: { kcal: number; p: number; c: number; g: number }; className?: string }> = ({ m, className }) => (
  <div className={`grid grid-cols-4 gap-1 text-center ${className ?? ''}`}>
    {([['kcal', Math.round(m.kcal), ''], ['P', round1(m.p), ' g'], ['C', round1(m.c), ' g'], ['G', round1(m.g), ' g']] as const).map(([k, v, u]) => (
      <div key={k} className="rounded-lg bg-secondary/60 px-1 py-1.5">
        <p className="text-[10px] uppercase text-muted-foreground">{k}</p>
        <p className="text-sm font-bold tabular-nums">{v}{u}</p>
      </div>
    ))}
  </div>
);

interface Props {
  item: WeighedItem;
  index: number;
  items: WeighedItem[];
  /** Foto do item ('' = não guardada, ex.: pesagem já salva). */
  photo: string | null;
  planned: PlannedMeal;
  foods: WeighFood[];
  onSave: (change: WeighItemChange) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Painel do item pesado: trocar alimento, editar gramas, ver a foto, salvar ou apagar. */
const WeighItemEditSheet: React.FC<Props> = ({ item, index, items, photo, planned, foods, onSave, onDelete, onClose }) => {
  const [food, setFood] = useState<WeighFood>(() => weighFoodForItem(item, planned, foods));
  const [planIndex, setPlanIndex] = useState<number | null>(item.indice_plano ?? null);
  const [grams, setGrams] = useState(String(item.gramas ?? ''));
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const taken = useMemo(() => takenPlanIndexes(items, index), [items, index]);

  const gramsNum = Number(String(grams).replace(',', '.'));
  const valid = gramsNum > 0;
  const macros = valid ? macrosForGrams(food, gramsNum) : null;
  const results = useMemo(() => (search.trim() ? filterFoodsBySearch(foods, search).slice(0, 25) : []), [foods, search]);

  const pickPlan = (pi: number) => {
    const pf = planned.alimentos[pi];
    const f = planFoodToWeighFood(pf, foods);
    if (!f) { setSearch(pf?.alimento ?? ''); return; }
    setFood(f);
    setPlanIndex(pi);
    setSearch('');
  };
  const pickBase = (f: WeighFood) => {
    const free = planned.alimentos.map((pf, pi) => ({ pf, pi })).filter(({ pi }) => !taken.has(pi));
    const hit = matchPlanFood(f.name, free.map((x) => x.pf));
    setFood(f);
    setPlanIndex(hit != null ? free[hit].pi : null);
    setSearch('');
  };

  return (
    <div className="absolute inset-0 z-[75] flex flex-col justify-end bg-background/70" data-testid="meal-weigh-edit-sheet">
      <button type="button" aria-label="Fechar edição" className="flex-1" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Editar ${item.alimento}`}
        className="max-h-[88dvh] flex flex-col rounded-t-3xl border-t border-border bg-card animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Editar item</p>
            <p className="text-base font-bold truncate">{item.alimento} · {Math.round(item.gramas)} g</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="h-10 w-10 rounded-full bg-secondary/70 flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
          {photo ? (
            <img src={photo} alt={`Foto de ${item.alimento}`} className="h-40 w-full rounded-2xl object-cover border border-border" />
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/30 px-3 py-2.5 text-xs text-muted-foreground">
              <ImageOff className="h-4 w-4 shrink-0" /> A foto deste item não fica guardada.
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Alimento</p>
            <p className="text-sm font-bold" data-testid="meal-weigh-edit-food">{food.name}</p>
            {planned.alimentos.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="meal-weigh-edit-plan-chips">
                {planned.alimentos.map((pf, pi) => {
                  const active = planIndex === pi;
                  return (
                    <button key={pi} type="button" onClick={() => pickPlan(pi)} aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary/60'}`}>
                      {pf.alimento}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Trocar: buscar na base de alimentos" aria-label="Buscar alimento" className="pl-9" />
            </div>
            {results.length > 0 && (
              <ul className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                {results.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => pickBase(f)} className="w-full px-3 py-2 text-left text-sm active:bg-primary/10">
                      {f.name}{f.brand ? <span className="text-muted-foreground"> · {f.brand}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="meal-weigh-edit-grams" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gramas</label>
            <div className="mt-1 flex items-center gap-2">
              <Input id="meal-weigh-edit-grams" inputMode="decimal" value={grams}
                onChange={(e) => setGrams(e.target.value.replace(/[^\d.,]/g, ''))}
                className="text-lg font-bold tabular-nums" placeholder="Digite as gramas" />
              <span className="text-sm text-muted-foreground">g</span>
            </div>
            {item.gramas_lidas != null && <p className="mt-1 text-[11px] text-muted-foreground">Lido no visor: {item.gramas_lidas} g</p>}
          </div>
          {macros ? <MacroLine m={macros} /> : <p className="text-xs text-muted-foreground">Digite as gramas para ver os macros.</p>}
        </div>
        <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <Button variant="outline" className="gap-1.5 text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Apagar item
          </Button>
          <Button className="flex-1 gap-1.5 font-semibold" disabled={!valid} onClick={() => onSave({ food, grams: gramsNum, planIndex })}>
            <Save className="h-4 w-4" /> Salvar alteração
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {item.alimento}?</AlertDialogTitle>
            <AlertDialogDescription>O item sai da refeição e os totais são recalculados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WeighItemEditSheet;
