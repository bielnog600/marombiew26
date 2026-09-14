import { Flame } from 'lucide-react';
import {
  ENERGY_FORMULA_LABEL,
  type EnergyFormula,
  type EnergyFormulaResult,
} from '@/lib/energyFormula';

interface EnergyCalculationPanelProps {
  selection: EnergyFormulaResult | null;
  tdee: number | null;
  targetKcal: number | null;
  activityFactor: number | null;
  activityLabel?: string | null;
  strategyPercent?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  ageYears?: number | null;
  bodyFatPct?: number | null;
  leanMassKg?: number | null;
  leanMassInfo?: string | null;
  missing?: string[];
  onSelectFormula: (formula: EnergyFormula | null) => void;
}

const kcal = (value?: number | null) =>
  value == null ? '—' : `${Math.round(value).toLocaleString('pt-BR')} kcal`;

const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string | null }) => (
  <div className="rounded-lg border border-border bg-background p-2">
    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="block text-sm font-bold text-primary">{value}</span>
    {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
  </div>
);

export const EnergyCalculationPanel = ({
  selection,
  tdee,
  targetKcal,
  activityFactor,
  activityLabel,
  strategyPercent,
  weightKg,
  heightCm,
  ageYears,
  bodyFatPct,
  leanMassKg,
  leanMassInfo,
  missing = [],
  onSelectFormula,
}: EnergyCalculationPanelProps) => {
  const alternatives = selection
    ? (Object.entries(selection.alternatives) as Array<[EnergyFormula, number]>)
    : [];

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide">Cálculo energético</p>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-[11px] font-medium text-amber-700">
            Faltam dados para o cálculo: {missing.join(', ')}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric
          label="Fórmula"
          value={selection ? ENERGY_FORMULA_LABEL[selection.formula].split(' (')[0] : '—'}
          hint={selection?.manual ? 'Escolha manual' : 'Seleção automática'}
        />
        <Metric label="TMB" value={kcal(selection?.bmr)} />
        <Metric
          label="GET"
          value={kcal(tdee)}
          hint={activityFactor ? `Fator ${activityFactor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}` : null}
        />
        <Metric
          label="Meta calórica"
          value={kcal(targetKcal)}
          hint={strategyPercent != null ? `${strategyPercent > 0 ? '+' : ''}${strategyPercent}% da estratégia` : null}
        />
      </div>

      {selection && (
        <p className="text-[11px] text-muted-foreground">{selection.reason}</p>
      )}

      {selection?.warnings.map((warning) => (
        <p key={warning} className="text-[11px] text-amber-600">{warning}</p>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground">
        <span>Peso: <strong className="text-foreground">{weightKg ? `${weightKg} kg` : '—'}</strong></span>
        <span>
          Massa magra:{' '}
          <strong className="text-foreground">{leanMassKg ? `${leanMassKg} kg` : '—'}</strong>
          {leanMassInfo && <em className="block not-italic text-[10px]">{leanMassInfo}</em>}
        </span>
        <span>Gordura: <strong className="text-foreground">{bodyFatPct != null ? `${bodyFatPct}%` : '—'}</strong></span>
        <span>Altura: <strong className="text-foreground">{heightCm ? `${heightCm} cm` : '—'}</strong></span>
        <span>Idade: <strong className="text-foreground">{ageYears ?? '—'}</strong></span>
        <span>Atividade: <strong className="text-foreground">{activityLabel ?? '—'}</strong></span>
      </div>

      {alternatives.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Fórmulas disponíveis (toque para usar)
          </p>
          <div className="flex flex-wrap gap-2">
            {alternatives.map(([formula, value]) => {
              const active = selection?.formula === formula;
              return (
                <button
                  key={formula}
                  type="button"
                  onClick={() => onSelectFormula(active && selection?.manual ? null : formula)}
                  className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {ENERGY_FORMULA_LABEL[formula].split(' (')[0]}: {value.toLocaleString('pt-BR')} kcal
                </button>
              );
            })}
          </div>
          {selection?.manual && (
            <button
              type="button"
              onClick={() => onSelectFormula(null)}
              className="text-[10px] text-primary underline"
            >
              Voltar à seleção automática
            </button>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Medicamentos, hormônios e termogênicos entram como contexto do aluno e não alteram TMB, GET
        nem a meta calórica.
      </p>
    </div>
  );
};

export default EnergyCalculationPanel;
