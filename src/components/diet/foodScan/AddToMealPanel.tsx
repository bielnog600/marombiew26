import React, { useState } from 'react';
import { Check, Eye, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScanApplyChoice from '@/components/diet/mealWeigh/ScanApplyChoice';
import { readScanApplyPref, writeScanApplyPref, type ScanApplyMode } from '@/lib/mealWeigh/scanApply';

export interface ScanMealOption { name: string; time?: string | null }

interface Props {
  meals: ScanMealOption[];
  /** Refeição do horário atual. */
  suggested: number;
  /** Ex.: "120 g · 107 kcal". */
  summary: string;
  disabled?: boolean;
  /** Refeição com alimentos do plano ou já registrada: pergunta Substituir / Adicionar / Revisar. */
  needsChoice?: (mealIndex: number) => boolean;
  onAdd: (mealIndex: number, mode: ScanApplyMode) => Promise<boolean>;
  onConsult: () => void;
}

const prefStorage = () => (typeof window !== 'undefined' ? window.localStorage : null);

/** "Adicionar a uma refeição" (entra no registro do dia com o selo "Escaneado") ou "Só consultar". */
const AddToMealPanel: React.FC<Props> = ({ meals, suggested, summary, disabled, needsChoice, onAdd, onConsult }) => {
  const [meal, setMeal] = useState(suggested >= 0 ? suggested : 0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [asking, setAsking] = useState(false);
  const run = async (mode: ScanApplyMode) => {
    setSaving(true);
    const ok = await onAdd(meal, mode).catch(() => false);
    setSaving(false);
    if (ok) { setDone(true); setAsking(false); }
  };
  const add = () => {
    if (needsChoice?.(meal)) { setAsking(true); return; }
    void run('add');
  };
  const confirm = (mode: ScanApplyMode) => {
    writeScanApplyPref(prefStorage(), mode);
    void run(mode);
  };
  return (
    <div className="glass-card-solid rounded-2xl p-4 space-y-3" data-testid="scan-add-to-meal">
      <p className="text-sm font-semibold">Adicionar a uma refeição</p>
      {meals.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem refeições no plano de hoje.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Refeição">
          {meals.map((m, i) => (
            <button key={i} type="button" aria-pressed={meal === i} onClick={() => { setMeal(i); setDone(false); setAsking(false); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${meal === i ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary/60'}`}>
              {m.time ? `${m.time} · ` : ''}{m.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground tabular-nums">{summary}</p>
      {asking ? (
        <ScanApplyChoice initial={readScanApplyPref(prefStorage())} busy={saving} onConfirm={confirm} onCancel={() => setAsking(false)} />
      ) : (
        <Button className="h-12 w-full gap-1.5 font-semibold" disabled={disabled || saving || meals.length === 0} onClick={add}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {done ? 'Adicionado · adicionar de novo' : 'Adicionar à refeição'}
        </Button>
      )}
      <Button variant="outline" className="h-11 w-full gap-1.5" onClick={onConsult}>
        <Eye className="h-4 w-4" /> Só consultar
      </Button>
    </div>
  );
};

export default AddToMealPanel;
