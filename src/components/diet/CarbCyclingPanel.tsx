import { Repeat } from 'lucide-react';
import { DecimalInput } from '@/components/diet/MacroConfigPanel';
import {
  CARB_DAY_TYPES,
  CARB_DAY_TYPE_LABEL,
  type CarbCyclingConfig,
  type CarbCyclingMode,
  type CarbDayType,
  type CarbDayTypeResult,
  setCarbTypePerKg,
  setCarbTypeGrams,
  setCarbTypeBasis,
  type WeeklyAverage,
  type BaseComparison,
  FIXED_CLOSING_MACRO_OPTIONS,
} from '@/lib/carbCycling';
import { WEEKDAY_KEYS, type WeekdayKey } from '@/lib/dietDayTargets';
import { MACRO_BASIS_LABEL, type MacroBasis, type BodyBasis } from '@/lib/macroConfig';

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom',
};

interface CarbCyclingPanelProps {
  config: CarbCyclingConfig;
  typeTargets: Record<CarbDayType, CarbDayTypeResult>;
  weeklyAverage: WeeklyAverage | null;
  comparison: BaseComparison | null;
  /** Nome do treino e sugestão inicial por dia (apenas informativo). */
  dayInfo: Partial<Record<WeekdayKey, { workoutLabel: string | null; suggestion: CarbDayType }>>;
  body: BodyBasis;
  onChange: (next: CarbCyclingConfig) => void;
}

const num = (v: number | null | undefined, decimals = 0) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: decimals });

export const CarbCyclingPanel = ({
  config,
  typeTargets,
  weeklyAverage,
  comparison,
  dayInfo,
  body,
  onChange,
}: CarbCyclingPanelProps) => {
  const setMode = (mode: CarbCyclingMode) => onChange({ ...config, mode });

  const updateType = (type: CarbDayType, patch: Partial<CarbCyclingConfig['types'][CarbDayType]>) =>
    onChange({ ...config, types: { ...config.types, [type]: { ...config.types[type], ...patch } } });

  const replaceType = (type: CarbDayType, next: CarbCyclingConfig['types'][CarbDayType]) =>
    onChange({ ...config, types: { ...config.types, [type]: next } });

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide">Carb cycling</p>
        </div>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            aria-label="Usar carb cycling"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          />
          Usar carb cycling
        </label>
      </div>

      {!config.enabled ? (
        <p className="text-[10px] text-muted-foreground">
          Desativado — todos os dias usam a meta base da configuração de macros.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            {(['variable_calories', 'fixed_calories'] as CarbCyclingMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  config.mode === mode
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {mode === 'variable_calories' ? 'Calorias variáveis' : 'Calorias fixas'}
              </button>
            ))}
          </div>

          {config.mode === 'fixed_calories' && (
            <div className="rounded-lg border border-border bg-background p-2">
              <p className="text-[10px] text-muted-foreground">Macro que fecha as calorias</p>
              <div className="mt-1 flex gap-2">
                {FIXED_CLOSING_MACRO_OPTIONS.map((macro) => (
                  <button
                    key={macro}
                    type="button"
                    onClick={() => onChange({ ...config, fixedClosingMacro: macro })}
                    className={`rounded-md border px-2 py-1 text-[11px] ${
                      config.fixedClosingMacro === macro
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {macro === 'protein' ? 'Proteína' : 'Gordura'}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                O carboidrato já é definido por LOW/MEDIUM/HIGH e não pode fechar as calorias.
              </p>
              {!config.fixedClosingMacro && (
                <p className="mt-1 text-[10px] text-amber-600">
                  Escolha qual macro deve fechar as calorias nos dias do ciclo.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {CARB_DAY_TYPES.map((type) => {
              const cfg = config.types[type];
              const result = typeTargets[type];
              return (
                <div key={type} className="rounded-lg border border-border bg-background p-2 space-y-2">
                  <p className="text-[11px] font-bold text-primary">{CARB_DAY_TYPE_LABEL[type]}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <label className="block">
                      <span className="block text-[10px] text-muted-foreground">Carbo g/kg</span>
                      <DecimalInput
                        ariaLabel={`Carboidrato ${CARB_DAY_TYPE_LABEL[type]} g/kg`}
                        value={cfg.carbsPerKg}
                        onCommit={(v) => replaceType(type, setCarbTypePerKg(cfg, v, body))}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] text-muted-foreground">Carbo g</span>
                      <DecimalInput
                        ariaLabel={`Carboidrato ${CARB_DAY_TYPE_LABEL[type]} gramas`}
                        value={cfg.carbGrams ?? result?.target?.c ?? null}
                        onCommit={(v) => replaceType(type, setCarbTypeGrams(cfg, v, body))}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[10px] text-muted-foreground">Base</span>
                    <select
                      aria-label={`Base do carboidrato ${CARB_DAY_TYPE_LABEL[type]}`}
                      value={cfg.carbBasis}
                      onChange={(e) => replaceType(type, setCarbTypeBasis(cfg, e.target.value as MacroBasis, body))}
                      className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-xs"
                    >
                      <option value="body_weight">{MACRO_BASIS_LABEL.body_weight}</option>
                      <option value="lean_mass" disabled={!body.leanMassKg}>
                        {MACRO_BASIS_LABEL.lean_mass}
                        {body.leanMassKg ? '' : ' (indisponível)'}
                      </option>
                    </select>
                  </label>
                  {config.mode === 'fixed_calories' && (
                    <label className="block">
                      <span className="block text-[10px] text-muted-foreground">Meta kcal (opcional)</span>
                      <DecimalInput
                        ariaLabel={`Meta calórica ${CARB_DAY_TYPE_LABEL[type]}`}
                        value={cfg.targetKcal ?? null}
                        onCommit={(v) => updateType(type, { targetKcal: v })}
                      />
                    </label>
                  )}
                  {result?.target ? (
                    <p className="text-[10px] text-muted-foreground">
                      C: {num(result.target.c)} g · P: {num(result.target.p)} g · G: {num(result.target.g)} g
                      <strong className="block text-foreground">Total: {num(result.target.kcal)} kcal</strong>
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-600">{result?.message ?? 'Configuração incompleta.'}</p>
                  )}
                  {result?.warning && <p className="text-[10px] text-amber-600">{result.warning}</p>}
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Semana</p>
            {WEEKDAY_KEYS.map((wd) => {
              const info = dayInfo[wd];
              return (
                <div key={wd} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium">{WEEKDAY_LABEL[wd]}</span>
                    <span className="ml-2 truncate text-[10px] text-muted-foreground">
                      {info?.workoutLabel || 'Sem treino registrado'}
                      {info ? ` · Sugestão inicial: ${CARB_DAY_TYPE_LABEL[info.suggestion]}` : ''}
                    </span>
                  </div>
                  <select
                    aria-label={`Tipo de dia ${WEEKDAY_LABEL[wd]}`}
                    value={config.assignments[wd]}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        assignments: { ...config.assignments, [wd]: e.target.value as CarbDayType },
                        manual: { ...config.manual, [wd]: true },
                      })
                    }
                    className="rounded-md border border-border bg-secondary px-2 py-1 text-[11px]"
                  >
                    {CARB_DAY_TYPES.map((t) => (
                      <option key={t} value={t}>{CARB_DAY_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {weeklyAverage && (
            <div className="rounded-lg border border-border bg-background p-2 text-[11px] text-muted-foreground">
              <p className="text-[10px] font-semibold uppercase">
                {weeklyAverage.complete ? 'Média semanal' : 'Semana incompleta'}
              </p>
              {!weeklyAverage.complete && (
                <p className="text-amber-600">{weeklyAverage.incompleteMessage}</p>
              )}
              <p>
                <strong className="text-foreground">
                  {weeklyAverage.complete ? `${num(weeklyAverage.average.kcal)} kcal/dia` : '—'}
                </strong>
                {weeklyAverage.complete ? ` · ${num(weeklyAverage.weeklyKcal)} kcal/semana` : ''}
              </p>
              <p>
                P: {num(weeklyAverage.average.p)} g · C: {num(weeklyAverage.average.c)} g · G:{' '}
                {num(weeklyAverage.average.g)} g
              </p>
              {comparison && (
                <p>
                  Meta base: {num(comparison.baseKcal)} kcal · Diferença média:{' '}
                  {comparison.diffPerDay > 0 ? '+' : ''}{num(comparison.diffPerDay)} kcal/dia (
                  {comparison.diffWeek > 0 ? '+' : ''}{num(comparison.diffWeek)} kcal/semana)
                </p>
              )}
              {comparison?.warning && (
                <p className="text-amber-600">{comparison.warning}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CarbCyclingPanel;
