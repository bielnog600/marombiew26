import React, { useMemo, useState } from 'react';
import { Minus, Plus, Scale, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { filterFoodsBySearch } from '@/lib/foodSearch';
import { macrosForGrams, round1, type WeighFood } from '@/lib/mealWeigh';
import { naturaMacros, naturaPortion, unitGramsFor, unitLabel, type PhotoIdentity, type UnitWeightRow } from '@/lib/foodPhotoScan';
import { MacroLine } from '@/components/diet/mealWeigh/WeighItemEditSheet';

interface Props {
  photo: string;
  identity: PhotoIdentity;
  foods: WeighFood[];
  unitWeights: UnitWeightRow[];
  /** Ações (adicionar à refeição / só consultar) com o alimento e as gramas atuais. */
  actions: (food: WeighFood, grams: number) => React.ReactNode;
}

/** Alimento in natura: peso médio por unidade, unidades (− / +) ou gramas, macros por unidade e por 100 g. */
const NaturaResult: React.FC<Props> = ({ photo, identity, foods, unitWeights, actions }) => {
  const start = useMemo(() => naturaPortion(identity, foods, unitWeights), [identity, foods, unitWeights]);
  const [food, setFood] = useState<WeighFood | null>(start.food);
  const [units, setUnits] = useState(start.units);
  const [grams, setGrams] = useState(String(start.grams));
  const [search, setSearch] = useState('');
  const unitGrams = food ? unitGramsFor(food.id, identity.tamanho, unitWeights) : null;
  const results = useMemo(() => (search.trim() ? filterFoodsBySearch(foods, search).slice(0, 20) : []), [foods, search]);
  const g = Math.max(0, Number(String(grams).replace(',', '.')) || 0);
  const m = food ? naturaMacros(food, unitGrams) : null;

  const setUnitCount = (n: number) => {
    const next = Math.max(1, Math.min(30, n));
    setUnits(next);
    if (unitGrams) setGrams(String(round1(unitGrams * next)));
  };
  const pick = (f: WeighFood) => {
    setFood(f);
    setSearch('');
    const ug = unitGramsFor(f.id, identity.tamanho, unitWeights);
    if (ug && !start.fromScale) setGrams(String(round1(ug * units)));
  };

  return (
    <div className="space-y-4" data-testid="scan-natura">
      <div className="glass-card-solid rounded-2xl p-4 flex gap-4">
        <img src={photo} alt="Foto do alimento" className="h-24 w-24 rounded-xl object-cover bg-secondary" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-bold leading-tight">{food?.name ?? identity.alimento}</p>
          {food && unitGrams ? <p className="text-sm text-primary font-semibold" data-testid="scan-unit-label">{unitLabel(food.name, identity.tamanho, unitGrams)}</p>
            : food ? <p className="text-xs text-muted-foreground">Sem peso médio por unidade para este alimento. Ajuste as gramas.</p>
            : <p className="text-xs text-muted-foreground">A IA viu {identity.alimento}, mas não achei na base. Escolha abaixo.</p>}
          {start.fromScale && <p className="text-xs text-muted-foreground flex items-center gap-1"><Scale className="h-3.5 w-3.5" /> Peso lido na balança: {start.grams} g</p>}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={food ? 'Trocar: buscar na base de alimentos' : 'Buscar na base de alimentos'} aria-label="Buscar alimento" className="pl-9" />
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
          {results.map((f) => (
            <li key={f.id}><button type="button" onClick={() => pick(f)} className="w-full px-3 py-2 text-left text-sm active:bg-primary/10">{f.name}</button></li>
          ))}
        </ul>
      )}

      {food && m && (
        <>
          <div className="glass-card-solid rounded-2xl p-4 space-y-3">
            {unitGrams && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Unidades</span>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Menos uma unidade" onClick={() => setUnitCount(units - 1)} className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                  <span className="w-8 text-center text-lg font-bold tabular-nums" data-testid="scan-units">{units}</span>
                  <button type="button" aria-label="Mais uma unidade" onClick={() => setUnitCount(units + 1)} className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label htmlFor="scan-natura-grams" className="text-sm font-semibold">Gramas</label>
              <Input id="scan-natura-grams" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(/[^\d.,]/g, ''))} className="h-11 w-28 text-base font-bold tabular-nums" />
              <span className="text-sm text-muted-foreground">g</span>
            </div>
            {g > 0 && <MacroLine m={macrosForGrams(food, g)} />}
          </div>
          <div className="glass-card-solid rounded-2xl p-4 space-y-2 text-xs">
            {m.perUnit && <p className="tabular-nums"><span className="font-semibold">1 unidade ({Math.round(unitGrams!)} g):</span> {Math.round(m.perUnit.kcal)} kcal · P {round1(m.perUnit.p)} · C {round1(m.perUnit.c)} · G {round1(m.perUnit.g)}</p>}
            <p className="tabular-nums"><span className="font-semibold">100 g:</span> {Math.round(m.per100.kcal)} kcal · P {round1(m.per100.p)} · C {round1(m.per100.c)} · G {round1(m.per100.g)}</p>
          </div>
          {g > 0 && actions(food, g)}
        </>
      )}
    </div>
  );
};

export default NaturaResult;
