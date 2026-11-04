/**
 * Seção "Ciclo de carboidratos" do editor canônico: marca o nível de cada
 * dia (SEG–DOM), edita os ajustes de cada nível e aplica a partir do dia base.
 */
import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  CARB_CYCLE_WEEKDAYS,
  CARB_LEVEL_LABELS,
  computeLevelTarget,
  readCarbCycleConfig,
  type CarbCycleConfig,
  type CarbLevel,
  type CarbLevelAdjust,
} from '@/lib/dietCarbCycle';
import type { DietPlan } from '@/lib/dietSchema';

const SHORT: Record<string, string> = { seg: 'SEG', ter: 'TER', qua: 'QUA', qui: 'QUI', sex: 'SEX', sab: 'SÁB', dom: 'DOM' };
const LEVELS: Exclude<CarbLevel, 'base'>[] = ['alto', 'medio', 'baixo'];

interface Props {
  plan: DietPlan;
  disabled?: boolean;
  onApply: (config: CarbCycleConfig) => void;
}

const CarbCyclePanel: React.FC<Props> = ({ plan, disabled, onApply }) => {
  const active = (plan.meta as any)?.strategy === 'carb_cycling';
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<CarbCycleConfig>(() => readCarbCycleConfig(plan));
  const base = {
    kcal: Math.round(Number(plan.targets?.kcal) || 0),
    p: Math.round(Number(plan.targets?.p) || 0),
    c: Math.round(Number(plan.targets?.c) || 0),
    g: Math.round(Number(plan.targets?.g) || 0),
  };
  const previews = useMemo(
    () => Object.fromEntries(LEVELS.map((l) => [l, computeLevelTarget(base, config.levels[l])])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, base.kcal, base.p, base.c, base.g],
  );

  const setLevel = (wd: string, level: CarbLevel) =>
    setConfig((c) => ({ ...c, assignments: { ...c.assignments, [wd]: level } }));
  const setAdj = (level: Exclude<CarbLevel, 'base'>, patch: Partial<CarbLevelAdjust>) =>
    setConfig((c) => ({ ...c, levels: { ...c.levels, [level]: { ...c.levels[level], ...patch } } }));
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4 text-xs">
        <button type="button" className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)}>
          <span className="text-sm font-bold">
            Ciclo de carboidratos {active && <span className="ml-1 text-[10px] font-semibold text-primary">ativo</span>}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open && (
          <>
            <p className="text-muted-foreground">
              Base: {base.kcal} kcal · {base.p}P · {base.c}C · {base.g}G. Dias em "Padrão" seguem o cardápio base; nos outros só as fontes de carboidrato mudam.
            </p>
            <div className="grid grid-cols-7 gap-1">
              {CARB_CYCLE_WEEKDAYS.map((wd) => (
                <div key={wd} className="space-y-1 text-center">
                  <div className="text-[10px] font-semibold text-muted-foreground">{SHORT[wd]}</div>
                  <Select value={config.assignments[wd] ?? 'base'} onValueChange={(v) => setLevel(wd, v as CarbLevel)}>
                    <SelectTrigger className="h-8 px-1 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['base', 'alto', 'medio', 'baixo'] as CarbLevel[]).map((l) => (
                        <SelectItem key={l} value={l}>{l === 'base' ? 'Base' : CARB_LEVEL_LABELS[l].replace('Carbo ', '')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {LEVELS.map((l) => {
                const a = config.levels[l];
                const t = previews[l];
                return (
                  <div key={l} className="space-y-1 rounded-md border border-border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold">{CARB_LEVEL_LABELS[l]}</span>
                      <span className="text-muted-foreground">→ {t.kcal} kcal · {t.p}P · {t.c}C · {t.g}G</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Kcal</span>
                        <div className="flex gap-1">
                          <Input className="h-8 text-xs" type="number" value={a.kcalValue}
                            disabled={a.carbMode !== 'auto'}
                            onChange={(e) => setAdj(l, { kcalValue: Number(e.target.value) || 0 })} />
                          <Select value={a.kcalMode} onValueChange={(v) => setAdj(l, { kcalMode: v as any })}>
                            <SelectTrigger className="h-8 w-16 px-1 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pct">%</SelectItem>
                              <SelectItem value="kcal">kcal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Carbo</span>
                        <div className="flex gap-1">
                          <Input className="h-8 text-xs" type="number" value={a.carbValue}
                            disabled={a.carbMode === 'auto'}
                            onChange={(e) => setAdj(l, { carbValue: Number(e.target.value) || 0 })} />
                          <Select value={a.carbMode} onValueChange={(v) => setAdj(l, { carbMode: v as any })}>
                            <SelectTrigger className="h-8 w-16 px-1 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">auto</SelectItem>
                              <SelectItem value="g">g</SelectItem>
                              <SelectItem value="pct">%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Proteína (g)</span>
                        <Input className="h-8 text-xs" type="number" placeholder={String(base.p)} value={a.p ?? ''}
                          onChange={(e) => setAdj(l, { p: numOrNull(e.target.value) })} />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Gordura (g)</span>
                        <Input className="h-8 text-xs" type="number" placeholder={String(base.g)} value={a.g ?? ''}
                          onChange={(e) => setAdj(l, { g: numOrNull(e.target.value) })} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              "auto": a diferença de kcal vem toda do carboidrato. Com carbo em g ou %, a kcal é recalculada pelos macros. Reaplicar recria os dias a partir do cardápio base (ajustes feitos à mão nos dias do ciclo são refeitos).
            </p>
            <Button size="sm" className="w-full" disabled={disabled} onClick={() => onApply(config)}>
              <RefreshCw className="mr-1 h-3 w-3" /> Aplicar ciclo de carboidratos
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CarbCyclePanel;
