import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  describePlan, formatEuro, goalFromMonthly, planForGoal, validateGoalDraft, yearPeriod,
  type GoalDraft, type SavingsGoal,
} from '@/lib/savingsGoal';

type Props = {
  goal?: SavingsGoal | null;
  defaultYear: number;
  saving?: boolean;
  onCancel?: () => void;
  onSubmit: (draft: GoalDraft) => void;
};

const SavingsGoalForm: React.FC<Props> = ({ goal, defaultYear, saving, onCancel, onSubmit }) => {
  const initialYear = goal ? Number(goal.inicio.slice(0, 4)) : defaultYear;
  const initialCustom = goal
    ? !(goal.inicio === yearPeriod(initialYear).inicio && goal.fim === yearPeriod(initialYear).fim)
    : false;
  const [nome, setNome] = useState(goal?.nome ?? `Meta ${defaultYear}`);
  const [meta, setMeta] = useState(goal ? String(goal.meta_valor) : '');
  const [year, setYear] = useState(String(initialYear));
  const [custom, setCustom] = useState(initialCustom);
  const [inicio, setInicio] = useState(goal?.inicio ?? yearPeriod(defaultYear).inicio);
  const [fim, setFim] = useState(goal?.fim ?? yearPeriod(defaultYear).fim);
  const [mensal, setMensal] = useState('');
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => {
    if (custom) return { inicio, fim };
    const y = Number(year);
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? yearPeriod(y) : { inicio, fim };
  }, [custom, year, inicio, fim]);

  const metaNum = Number(meta.replace(/\./g, '').replace(',', '.'));
  const validPeriod = period.inicio <= period.fim;
  const plan = metaNum >= 1 && validPeriod ? planForGoal(metaNum, period.inicio, period.fim) : null;
  const mensalNum = Number(mensal.replace(/\./g, '').replace(',', '.'));
  const fromMonthly = mensalNum >= 1 && validPeriod ? goalFromMonthly(mensalNum, period.inicio, period.fim) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const draft: GoalDraft = { nome, meta_valor: metaNum, inicio: period.inicio, fim: period.fim };
    const err = validateGoalDraft(draft);
    setError(err);
    if (!err) onSubmit(draft);
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Configuração da meta">
      <div className="space-y-1.5">
        <Label htmlFor="sg-nome">Nome</Label>
        <Input id="sg-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Meta 2027" maxLength={60} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sg-meta">Valor da meta (€)</Label>
          <Input id="sg-meta" inputMode="numeric" value={meta} onChange={e => setMeta(e.target.value)} placeholder="40000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sg-ano">Ano</Label>
          <Input id="sg-ano" inputMode="numeric" value={year} disabled={custom} onChange={e => setYear(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
        <Label htmlFor="sg-custom" className="text-sm">Datas personalizadas</Label>
        <Switch
          id="sg-custom"
          checked={custom}
          onCheckedChange={v => {
            setCustom(v);
            if (v) { setInicio(period.inicio); setFim(period.fim); }
          }}
        />
      </div>
      {custom ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sg-inicio">Início</Label>
            <Input id="sg-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-fim">Fim</Label>
            <Input id="sg-fim" type="date" value={fim} onChange={e => setFim(e.target.value)} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">De 01/01 a 31/12 de {year}.</p>
      )}

      <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm" data-testid="savings-plan-line">
        {plan ? describePlan(plan) : 'Indica o valor da meta para ver a grade.'}
      </div>

      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        <Label htmlFor="sg-mensal" className="text-sm">Quanto consigo guardar por mês</Label>
        <div className="flex gap-2">
          <Input id="sg-mensal" inputMode="numeric" value={mensal} onChange={e => setMensal(e.target.value)} placeholder="1000" />
          <Button
            type="button"
            variant="secondary"
            disabled={!fromMonthly}
            onClick={() => fromMonthly && setMeta(String(fromMonthly.meta))}
          >
            Usar
          </Button>
        </div>
        {fromMonthly && (
          <p className="text-xs text-muted-foreground">
            Meta ~{formatEuro(fromMonthly.meta)} → N = {fromMonthly.n} (total {formatEuro(fromMonthly.total)})
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" disabled={saving}>{goal ? 'Guardar alterações' : 'Criar meta'}</Button>
      </div>
    </form>
  );
};

export default SavingsGoalForm;
