import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus, RotateCcw, Search, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { macrosForGrams, matchPlanFood, planFoodToWeighFood, type PlannedMeal, type WeighFood, type WeighedItem } from '@/lib/mealWeigh';
import {
  ESTIMATED_WARNING, PLATE_TARE_QUESTION, applyPlateTotal, blankPlateRow, buildEstimatedItems, formatPlateRange,
  freePlanIndexesForRow, plateFoodTotal, plateNeedsTareQuestion, plateRowRange, plateRowValid, resolvePlateRows,
  suggestedPlateGrams, type PlateAiResult, type PlateRow, type PlateTareAnswer,
} from '@/lib/mealWeigh/plateEstimate';
import { MacroLine } from './WeighItemEditSheet';

/** Selo dos itens com gramas estimadas pela foto (diferente de "Pesado"). */
export const EstimatedBadge: React.FC = () => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/60 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
    <Sparkles className="h-3 w-3" /> Estimado
  </span>
);

interface Props {
  header: React.ReactNode;
  photo: string;
  ai: PlateAiResult;
  planned: PlannedMeal;
  /** Itens já registrados na refeição (pesagem incremental). */
  existing: WeighedItem[];
  foods: WeighFood[];
  onRetake: () => void;
  onConfirm: (items: WeighedItem[]) => void;
}

const gramsOf = (r: PlateRow) => Number(String(r.grams).replace(',', '.')) || 0;

/** Revisão do "Prato pronto": cada alimento identificado, trocável, com gramas estimadas editáveis. */
const PlateReview: React.FC<Props> = ({ header, photo, ai, planned, existing, foods, onRetake, onConfirm }) => {
  const needsTare = plateNeedsTareQuestion(ai);
  const [answer, setAnswer] = useState<PlateTareAnswer | null>(null);
  const [plateGrams, setPlateGrams] = useState(() => String(suggestedPlateGrams(ai)));
  const [rows, setRows] = useState<PlateRow[]>(() => applyPlateTotal(resolvePlateRows(ai, foods, planned, existing), plateFoodTotal(ai, null)));
  const [searchRow, setSearchRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [added, setAdded] = useState(0);
  const total = plateFoodTotal(ai, answer);
  const results = useMemo(() => (search.trim() ? filterFoodsBySearch(foods, search).slice(0, 20) : []), [foods, search]);

  const redistribute = (next: PlateRow[], t: number | null = total) => setRows(applyPlateTotal(next, t));
  const answerTare = (a: PlateTareAnswer) => { setAnswer(a); redistribute(rows, plateFoodTotal(ai, a)); };
  const updateRow = (i: number, patch: Partial<PlateRow>, rebalance = false) => {
    const next = rows.map((r, k) => (k === i ? { ...r, ...patch } : r));
    if (rebalance) redistribute(next); else setRows(next);
  };
  const pickFood = (i: number, food: WeighFood, planIndex: number | null) => {
    updateRow(i, { food, planIndex, foodEdited: true });
    setSearchRow(null);
    setSearch('');
  };
  const pickBase = (i: number, food: WeighFood) => {
    const free = freePlanIndexesForRow(planned, existing, rows, i);
    const hit = matchPlanFood(food.name, free.map((pi) => planned.alimentos[pi]));
    pickFood(i, food, hit != null ? free[hit] : null);
  };
  const pickPlan = (i: number, pi: number) => {
    const f = planFoodToWeighFood(planned.alimentos[pi], foods);
    if (!f) { setSearchRow(rows[i].key); setSearch(planned.alimentos[pi]?.alimento ?? ''); return; }
    pickFood(i, f, pi);
  };
  const removeRow = (i: number) => redistribute(rows.filter((_, k) => k !== i));
  const addRow = () => {
    const row = blankPlateRow(`novo-${added + 1}`);
    setAdded((n) => n + 1);
    setRows([...rows, row]);
    setSearchRow(row.key);
    setSearch('');
  };

  const tarePending = needsTare && !answer;
  const canConfirm = rows.length > 0 && rows.every(plateRowValid) && !tarePending;
  const sum = rows.reduce((a, r) => a + gramsOf(r), 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3" data-testid="meal-weigh-plate-review">
        <img src={photo} alt="Foto do prato" className="h-40 w-full rounded-2xl object-cover border border-border" />
        <div role="note" className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 text-xs flex gap-2" data-testid="meal-weigh-estimated-warning">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" /> <p>{ESTIMATED_WARNING}</p>
        </div>

        {ai.peso_total_lido != null && (
          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm space-y-2" data-testid="meal-weigh-plate-total">
            <p><span className="font-semibold">Balança: {Math.round(ai.peso_total_lido)} g no visor</span>
              {total != null && <span className="text-muted-foreground"> · {Math.round(total)} g de comida divididos entre os alimentos</span>}
            </p>
            {needsTare && (
              <div role="alert" className="space-y-2" data-testid="meal-weigh-plate-tare">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> {PLATE_TARE_QUESTION}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={answer?.kind === 'zerada' ? 'default' : 'outline'} aria-pressed={answer?.kind === 'zerada'}
                    onClick={() => answerTare({ kind: 'zerada' })}>Sim, estava zerada</Button>
                  <Button size="sm" variant={answer?.kind === 'com_prato' ? 'default' : 'outline'} aria-pressed={answer?.kind === 'com_prato'}
                    onClick={() => answerTare({ kind: 'com_prato', pratoGramas: Number(plateGrams) || 0 })}>Não, o prato estava junto</Button>
                </div>
                {answer?.kind === 'com_prato' && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="meal-weigh-plate-grams" className="text-xs text-muted-foreground">Peso do prato</label>
                    <Input id="meal-weigh-plate-grams" inputMode="decimal" value={plateGrams} className="h-9 w-24 tabular-nums"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.,]/g, '');
                        setPlateGrams(v);
                        answerTare({ kind: 'com_prato', pratoGramas: Number(v.replace(',', '.')) || 0 });
                      }} />
                    <span className="text-xs text-muted-foreground">g</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <ul className="space-y-2" data-testid="meal-weigh-plate-rows">
          {rows.map((r, i) => {
            const name = r.food?.name ?? (r.aiName || 'Novo alimento');
            const freePlan = freePlanIndexesForRow(planned, existing, rows, i).filter((pi) => pi !== r.planIndex);
            const range = plateRowRange(r);
            const g = gramsOf(r);
            const macros = r.food && g > 0 ? macrosForGrams(r.food, g) : null;
            const open = searchRow === r.key;
            return (
              <li key={r.key} className="rounded-2xl border border-border bg-secondary/30 p-3 space-y-2" data-testid="plate-row" aria-label={name}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold">{r.food ? r.food.name : r.aiName ? `A IA viu ${r.aiName}` : 'Escolha o alimento'}</p>
                      <EstimatedBadge />
                    </div>
                    {r.aiName && g > 0 && <p className="text-[11px] text-muted-foreground tabular-nums">{formatPlateRange(g, range)}</p>}
                    {!r.food && <p className="text-[11px] text-primary">Escolha o alimento abaixo.</p>}
                  </div>
                  <button type="button" aria-label={`Apagar ${name}`} onClick={() => removeRow(i)}
                    className="h-9 w-9 shrink-0 rounded-full bg-secondary/70 flex items-center justify-center text-muted-foreground active:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {freePlan.map((pi) => (
                    <button key={`p${pi}`} type="button" onClick={() => pickPlan(i, pi)}
                      className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {planned.alimentos[pi].alimento}
                    </button>
                  ))}
                  {r.alternatives.filter((f) => f.id !== r.food?.id).map((f) => (
                    <button key={f.id} type="button" onClick={() => pickBase(i, f)}
                      className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px]">{f.name}</button>
                  ))}
                  <button type="button" onClick={() => { setSearchRow(open ? null : r.key); setSearch(''); }} aria-expanded={open}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px]">
                    <Search className="h-3 w-3" /> Buscar
                  </button>
                </div>
                {open && (
                  <div className="space-y-1.5">
                    <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na base de alimentos" aria-label="Buscar alimento" />
                    {results.length > 0 && (
                      <ul className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                        {results.map((f) => (
                          <li key={f.id}><button type="button" onClick={() => pickBase(i, f)} className="w-full px-3 py-2 text-left text-sm active:bg-primary/10">{f.name}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input inputMode="decimal" value={r.grams} aria-label={`Gramas de ${name}`} placeholder="Gramas" className="h-10 w-28 text-base font-bold tabular-nums"
                    onChange={(e) => updateRow(i, { grams: e.target.value.replace(/[^\d.,]/g, ''), gramsEdited: true })}
                    onBlur={() => { if (total != null) redistribute(rows); }} />
                  <span className="text-sm text-muted-foreground">g</span>
                </div>
                {macros && <MacroLine m={macros} />}
              </li>
            );
          })}
        </ul>
        <Button variant="outline" className="w-full gap-1.5" onClick={addRow}>
          <Plus className="h-4 w-4" /> Adicionar alimento que faltou
        </Button>
        <p className="text-center text-xs text-muted-foreground tabular-nums">Total estimado: {Math.round(sum)} g</p>
      </div>
      <div className="border-t border-border px-4 pt-3 flex gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <Button variant="outline" className="gap-1.5" onClick={onRetake}><RotateCcw className="h-4 w-4" /> Tirar de novo</Button>
        <Button className="flex-1 gap-1.5 font-semibold" disabled={!canConfirm} onClick={() => onConfirm(buildEstimatedItems(rows))}>
          <Check className="h-4 w-4" /> Confirmar prato
        </Button>
      </div>
    </div>
  );
};

export default PlateReview;
