import { useEffect, useState } from 'react';
import { Lock, LockOpen, SlidersHorizontal } from 'lucide-react';
import {
  MACRO_LABEL,
  MACRO_KCAL_PER_G,
  setMacroBasis,
  setMacroGrams,
  setMacroPerKg,
  closingMacroWarning,
  type BodyBasis,
  type MacroConfig,
  type MacroKey,
  type MacroResolution,
} from '@/lib/macroConfig';

interface MacroConfigPanelProps {
  config: MacroConfig;
  body: BodyBasis;
  resolution: MacroResolution;
  closingMacro: MacroKey | null;
  targetKcal: number | null;
  onChange: (next: MacroConfig) => void;
  onClosingMacroChange: (macro: MacroKey) => void;
}

const MACRO_ORDER: MacroKey[] = ['protein', 'carbs', 'fat'];

const fmt = (value: number | null | undefined, decimals = 0) =>
  value == null || !Number.isFinite(value)
    ? ''
    : value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });

const parse = (value: string): number | null => {
  const raw = value.replace(',', '.').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Input decimal com estado textual: preserva exatamente o que foi digitado
 * ("2," / "2.2" / "0,8") e só converte no commit (blur/Enter).
 */
const DecimalInput = ({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  ariaLabel: string;
}) => {
  const [text, setText] = useState<string>(value == null ? '' : String(value).replace('.', ','));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(value == null ? '' : String(value).replace('.', ','));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    onCommit(parse(text));
  };

  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setEditing(true);
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      placeholder="—"
      className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-sm focus:border-primary focus:outline-none"
    />
  );
};

export const MacroConfigPanel = ({
  config,
  body,
  resolution,
  closingMacro,
  targetKcal,
  onChange,
  onClosingMacroChange,
}: MacroConfigPanelProps) => {
  const update = (key: MacroKey, next: MacroConfig[MacroKey]) =>
    onChange({ ...config, [key]: next });

  const grams = resolution.grams;
  const macroKcal = grams
    ? grams.protein * 4 + grams.carbs * 4 + grams.fat * 9
    : null;
  const pct = (key: MacroKey) =>
    grams && macroKcal
      ? Math.round((grams[key === 'protein' ? 'protein' : key === 'carbs' ? 'carbs' : 'fat'] * MACRO_KCAL_PER_G[key] * 100) / macroKcal)
      : null;

  const warning = closingMacroWarning(resolution, body);

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide">Configuração de macros</p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Defina cada macro em g/kg ou em gramas. O macro destravado fecha a meta calórica; nada é
        alterado automaticamente sem a sua autorização.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MACRO_ORDER.map((key) => {
          const setting = config[key];
          const isClosing = resolution.closingMacro === key;
          const finalGrams = grams?.[key];
          return (
            <div key={key} className="rounded-lg border border-border bg-background p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{MACRO_LABEL[key]}</span>
                <button
                  type="button"
                  onClick={() => update(key, { ...setting, locked: !setting.locked })}
                  className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${
                    setting.locked
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {setting.locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  {setting.locked ? 'Travado' : 'Livre'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1">
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">g/kg</span>
                  <DecimalInput
                    ariaLabel={`${MACRO_LABEL[key]} g/kg`}
                    value={setting.perKg}
                    onCommit={(next) => update(key, setMacroPerKg(setting, next, body))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">gramas</span>
                  <DecimalInput
                    ariaLabel={`${MACRO_LABEL[key]} gramas`}
                    value={setting.grams}
                    onCommit={(next) => update(key, setMacroGrams(setting, next, body))}
                  />
                </label>
              </div>

              <div className="flex rounded-md border border-border bg-secondary p-0.5 text-[10px]">
                {(['body_weight', 'lean_mass'] as const).map((basis) => (
                  <button
                    key={basis}
                    type="button"
                    disabled={basis === 'lean_mass' && !body.leanMassKg}
                    onClick={() => update(key, setMacroBasis(setting, basis, body))}
                    className={`flex-1 rounded px-1 py-0.5 transition-colors disabled:opacity-40 ${
                      setting.basis === basis ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {basis === 'body_weight' ? 'Peso corporal' : 'Massa magra'}
                  </button>
                ))}
              </div>

              {finalGrams != null && (
                <p className="text-[10px] text-muted-foreground">
                  Final: <strong className="text-foreground">{fmt(finalGrams, 0)} g</strong>
                  {pct(key) != null && ` · ${pct(key)}%`}
                  {isClosing && ' · fecha as calorias'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {resolution.status === 'needs_closing_macro' && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 space-y-2">
          <p className="text-[11px] font-medium text-amber-700">
            Escolha qual macro deve fechar as calorias.
          </p>
          <div className="flex flex-wrap gap-2">
            {resolution.closingOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onClosingMacroChange(option)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  closingMacro === option
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {MACRO_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      )}

      {(resolution.status === 'infeasible' || resolution.status === 'incomplete') && resolution.message && (
        <p
          className={`rounded-lg border p-2 text-[11px] ${
            resolution.status === 'infeasible'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-600'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
          }`}
        >
          {resolution.message}
        </p>
      )}

      {warning && <p className="text-[11px] text-amber-600">{warning}</p>}

      {resolution.status === 'ok' && grams && (
        <div className="rounded-lg border border-border bg-background p-2 text-[11px] space-y-1">
          <p className="font-semibold">
            Meta: {targetKcal ? `${Math.round(targetKcal).toLocaleString('pt-BR')} kcal` : '—'}
          </p>
          <p className="text-muted-foreground">
            Proteína {fmt(grams.protein)} g · Carboidrato {fmt(grams.carbs)} g · Gordura {fmt(grams.fat)} g
          </p>
          <p className="text-muted-foreground">
            Energia calculada pelos macros: {macroKcal ? Math.round(macroKcal).toLocaleString('pt-BR') : '—'} kcal
            {' · '}P {pct('protein')}% · C {pct('carbs')}% · G {pct('fat')}%
          </p>
          {resolution.closingMacro && (
            <p className="text-primary">
              {MACRO_LABEL[resolution.closingMacro]} calculado para fechar{' '}
              {targetKcal ? Math.round(targetKcal).toLocaleString('pt-BR') : '—'} kcal.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MacroConfigPanel;
