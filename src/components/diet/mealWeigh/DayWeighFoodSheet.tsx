import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useHideBottomNav } from '@/hooks/useBottomNavVisibility';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import {
  formatDayWeighLabel, macrosForGrams, matchPlanFood, planFoodToWeighFood, sumWeighedItems,
  type DayFoodWeigh, type UnweighedChoice, type WeighFood,
} from '@/lib/mealWeigh';
import { weighFoodForItem } from '@/lib/mealWeigh/editItems';
import { dayRowRef, editDayRow, removeDayRow, setDayRowChoice, type DayWeighState } from '@/lib/mealWeigh/dayEdit';
import { MacroLine } from './WeighItemEditSheet';

const FOOD_COLUMNS = 'id, name, calories, protein, carbs, fats, portion, portion_size, brand, source';

interface Props {
  /** Nome mostrado da linha do card. */
  name: string;
  weigh: DayFoodWeigh;
  state: DayWeighState;
  saving?: boolean;
  /** Grava o novo registro do dia; resolve true quando salvou. */
  onApply: (next: DayWeighState, message: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Painel de um alimento de uma refeição já registrada no card do dia: trocar
 * alimento (chips do plano + busca), editar gramas, "Não comi"/"Comi sem
 * pesar" (alimentos do plano) e "Apagar item" (fora do plano/escaneados).
 */
const DayWeighFoodSheet: React.FC<Props> = ({ name, weigh, state, saving, onApply, onClose }) => {
  useHideBottomNav(true);
  const ref = useMemo(() => dayRowRef(weigh), [weigh]);
  const first = ref.itemIndexes.length > 0 ? state.items[ref.itemIndexes[0]] : null;
  const rowItems = ref.itemIndexes.map((i) => state.items[i]).filter(Boolean);
  const planFood = ref.planIndex != null ? state.planned.alimentos[ref.planIndex] ?? null : null;

  const [foods, setFoods] = useState<WeighFood[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase.from('foods').select(FOOD_COLUMNS).order('name').then(({ data }) => {
      if (!cancelled) setFoods((data as WeighFood[] | null) ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  const defaultFood = useMemo<WeighFood | null>(
    () => (first ? weighFoodForItem(first, state.planned, foods) : planFoodToWeighFood(planFood, foods)),
    [first, planFood, state.planned, foods],
  );
  const [picked, setPicked] = useState<{ food: WeighFood; planIndex: number | null } | null>(null);
  const food = picked?.food ?? defaultFood;
  const planIndex = picked ? picked.planIndex : ref.planIndex ?? (first?.indice_plano ?? null);
  const startGrams = rowItems.length > 0 ? sumWeighedItems(rowItems).gramas : planFood?.gramas ?? null;
  const [grams, setGrams] = useState(startGrams != null && startGrams > 0 ? String(Math.round(startGrams * 10) / 10) : '');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gramsNum = Number(String(grams).replace(',', '.'));
  const valid = !!food && gramsNum > 0;
  const changed = valid && (!!picked || rowItems.length === 0 || Math.abs(gramsNum - (Number(startGrams) || 0)) > 0.05);
  const macros = valid ? macrosForGrams(food!, gramsNum) : null;
  const results = useMemo(() => (search.trim() ? filterFoodsBySearch(foods, search).slice(0, 25) : []), [foods, search]);
  /** Outros itens do registro já ocupam estes alimentos do plano. */
  const taken = useMemo(() => {
    const out = new Set<number>();
    state.items.forEach((it, i) => { if (!ref.itemIndexes.includes(i) && typeof it.indice_plano === 'number') out.add(it.indice_plano); });
    return out;
  }, [state.items, ref.itemIndexes]);

  const pickPlan = (pi: number) => {
    const f = planFoodToWeighFood(state.planned.alimentos[pi], foods);
    if (!f) { setSearch(state.planned.alimentos[pi]?.alimento ?? ''); return; }
    setPicked({ food: f, planIndex: pi });
    if (!grams && state.planned.alimentos[pi]?.gramas) setGrams(String(state.planned.alimentos[pi].gramas));
    setSearch('');
  };
  const pickBase = (f: WeighFood) => {
    const free = state.planned.alimentos.map((pf, pi) => ({ pf, pi })).filter(({ pi }) => !taken.has(pi));
    const hit = matchPlanFood(f.name, free.map((x) => x.pf));
    setPicked({ food: f, planIndex: hit != null ? free[hit].pi : null });
    setSearch('');
  };

  const isPlanRow = ref.planIndex != null;
  const canDelete = rowItems.length > 0 && (!isPlanRow || weigh.escaneado || weigh.estimado || weigh.status === 'fora_do_plano');
  const choice: UnweighedChoice | null = weigh.status === 'nao_comeu' ? 'nao_comeu' : weigh.status === 'sem_pesar' ? 'comeu_sem_pesar' : null;

  const save = () => { if (valid && changed) void onApply(editDayRow(state, ref, { food: food!, grams: gramsNum, planIndex }), 'Alimento atualizado no seu dia'); };
  const mark = (c: UnweighedChoice) => {
    if (choice === c) return;
    void onApply(setDayRowChoice(state, ref, c), c === 'nao_comeu' ? 'Marcado como "Não comi"' : 'Marcado como "Comi sem pesar"');
  };
  const remove = () => { setConfirmDelete(false); void onApply(removeDayRow(state, ref), 'Item apagado da refeição'); };

  const sheet = (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-background/70" data-testid="day-weigh-food-sheet" data-no-swipe="true">
      <button type="button" aria-label="Fechar edição" className="flex-1" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Editar ${name}`}
        className="max-h-[88dvh] flex flex-col rounded-t-3xl border-t border-border bg-card animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Editar item</p>
            <p className="text-base font-bold truncate">{name}</p>
            <p className="text-[11px] font-semibold text-primary">{formatDayWeighLabel(weigh)}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="h-10 w-10 rounded-full bg-secondary/70 flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
          {isPlanRow && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={`O que aconteceu com ${planFood?.alimento ?? name}`}>
              <Button variant={choice === 'comeu_sem_pesar' ? 'default' : 'outline'} aria-pressed={choice === 'comeu_sem_pesar'}
                disabled={saving} onClick={() => mark('comeu_sem_pesar')}>Comi sem pesar</Button>
              <Button variant={choice === 'nao_comeu' ? 'default' : 'outline'} aria-pressed={choice === 'nao_comeu'}
                disabled={saving} onClick={() => mark('nao_comeu')}>Não comi</Button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rowItems.length > 0 ? 'Alimento' : 'Comi outra quantidade ou outro alimento'}</p>
            <p className="text-sm font-bold" data-testid="day-weigh-edit-food">{food?.name ?? 'Carregando alimentos…'}</p>
            {state.planned.alimentos.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="day-weigh-edit-plan-chips">
                {state.planned.alimentos.map((pf, pi) => {
                  if (taken.has(pi) && pi !== planIndex) return null;
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
            <label htmlFor="day-weigh-edit-grams" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gramas</label>
            <div className="mt-1 flex items-center gap-2">
              <Input id="day-weigh-edit-grams" inputMode="decimal" value={grams}
                onChange={(e) => setGrams(e.target.value.replace(/[^\d.,]/g, ''))}
                className="text-lg font-bold tabular-nums" placeholder="Digite as gramas" />
              <span className="text-sm text-muted-foreground">g</span>
            </div>
            {weigh.estimado && <p className="mt-1 text-[11px] text-muted-foreground">Gramas estimadas pela foto. Corrigir ajuda as próximas estimativas.</p>}
          </div>
          {macros && <MacroLine m={macros} />}
        </div>
        <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          {canDelete && (
            <Button variant="outline" className="gap-1.5 text-destructive" disabled={saving} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Apagar item
            </Button>
          )}
          <Button className="flex-1 gap-1.5 font-semibold" disabled={saving || !changed} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar alteração
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {name}?</AlertDialogTitle>
            <AlertDialogDescription>O item sai da refeição e os totais do dia são recalculados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
};

export default DayWeighFoodSheet;
