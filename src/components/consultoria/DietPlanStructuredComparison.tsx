import React from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Minus, Plus, X as XIcon, RefreshCw, ShieldCheck } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  diffDietPlans,
  magnitudeMeta,
  type DietPlanDiff,
  type MealDiff,
} from '@/lib/dietPlanDiff';
import type { DietPlan } from '@/lib/dietSchema';

interface Props {
  current: DietPlan;
  draft: DietPlan;
}

const DeltaPill: React.FC<{ value: number; suffix?: string }> = ({ value, suffix = '' }) => {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const cls =
    value > 0
      ? 'text-emerald-400'
      : value < 0
        ? 'text-amber-400'
        : 'text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', cls)}>
      <Icon className="h-3 w-3" />
      {value > 0 ? '+' : ''}
      {Math.round(value * 10) / 10}
      {suffix}
    </span>
  );
};

const StatBox: React.FC<{
  label: string;
  from: number;
  to: number;
  suffix?: string;
}> = ({ label, from, to, suffix = '' }) => (
  <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="flex items-baseline gap-2 mt-1">
      <span className="text-sm text-muted-foreground line-through">
        {Math.round(from)}
        {suffix}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="text-lg font-semibold">
        {Math.round(to)}
        {suffix}
      </span>
    </div>
    <DeltaPill value={to - from} suffix={suffix} />
  </div>
);

const MealRow: React.FC<{ meal: MealDiff }> = ({ meal }) => {
  const badgeCls =
    meal.status === 'added'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : meal.status === 'removed'
        ? 'bg-red-500/10 text-red-400 border-red-500/30'
        : meal.status === 'modified'
          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
          : 'bg-muted text-muted-foreground border-border/40';
  const badgeLabel =
    meal.status === 'added'
      ? 'Refeição nova'
      : meal.status === 'removed'
        ? 'Refeição removida'
        : meal.status === 'modified'
          ? 'Modificada'
          : 'Igual';

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] uppercase tracking-wide border rounded-full px-2 py-0.5', badgeCls)}>
            {badgeLabel}
          </span>
          <p className="text-sm font-medium">{meal.name}</p>
          {meal.time && <span className="text-xs text-muted-foreground">{meal.time}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground line-through">
            {Math.round(meal.totalsCurrent.kcal)} kcal
          </span>
          <ArrowRight className="h-3 w-3" />
          <span className="font-medium">{Math.round(meal.totalsDraft.kcal)} kcal</span>
          <DeltaPill value={meal.kcalDelta} />
        </div>
      </div>

      {/* macros line for the meal */}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>
          P {Math.round(meal.totalsCurrent.p)}→{Math.round(meal.totalsDraft.p)}g{' '}
          <DeltaPill value={meal.macroDeltas.p} suffix="g" />
        </span>
        <span>
          C {Math.round(meal.totalsCurrent.c)}→{Math.round(meal.totalsDraft.c)}g{' '}
          <DeltaPill value={meal.macroDeltas.c} suffix="g" />
        </span>
        <span>
          G {Math.round(meal.totalsCurrent.g)}→{Math.round(meal.totalsDraft.g)}g{' '}
          <DeltaPill value={meal.macroDeltas.g} suffix="g" />
        </span>
      </div>

      {(meal.itemsAdded.length > 0 || meal.itemsRemoved.length > 0 || meal.itemsChanged.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-2 text-xs pt-1">
          {meal.itemsRemoved.length > 0 && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2">
              <p className="text-[10px] uppercase tracking-wide text-red-400 mb-1 flex items-center gap-1">
                <XIcon className="h-3 w-3" /> Removidos ({meal.itemsRemoved.length})
              </p>
              <ul className="space-y-0.5">
                {meal.itemsRemoved.map((it, i) => (
                  <li key={i} className="truncate line-through text-muted-foreground">
                    {it.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meal.itemsAdded.length > 0 && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 mb-1 flex items-center gap-1">
                <Plus className="h-3 w-3" /> Adicionados ({meal.itemsAdded.length})
              </p>
              <ul className="space-y-0.5">
                {meal.itemsAdded.map((it, i) => (
                  <li key={i} className="truncate">
                    {it.name}
                    {it.portionLabel ? (
                      <span className="text-muted-foreground"> · {it.portionLabel}</span>
                    ) : it.qtyGrams ? (
                      <span className="text-muted-foreground"> · {Math.round(it.qtyGrams)}g</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meal.itemsChanged.length > 0 && (
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2">
              <p className="text-[10px] uppercase tracking-wide text-blue-400 mb-1 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Alterados ({meal.itemsChanged.length})
              </p>
              <ul className="space-y-0.5">
                {meal.itemsChanged.map((ch, i) => {
                  const fromQty = ch.from.portionLabel ?? (ch.from.qtyGrams ? `${Math.round(ch.from.qtyGrams)}g` : '');
                  const toQty = ch.to.portionLabel ?? (ch.to.qtyGrams ? `${Math.round(ch.to.qtyGrams)}g` : '');
                  return (
                    <li key={i} className="truncate">
                      <span className="font-medium">{ch.to.name}</span>
                      {fromQty && toQty && fromQty !== toQty && (
                        <span className="text-muted-foreground"> · {fromQty} → {toQty}</span>
                      )}
                      {ch.kcalDelta !== 0 && (
                        <span className="ml-1">
                          <DeltaPill value={ch.kcalDelta} />
                        </span>
                      )}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({ch.reason === 'both' ? 'porção + macros' : ch.reason === 'portion' ? 'porção' : 'macros'})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {meal.status === 'modified' &&
        meal.itemsAdded.length === 0 &&
        meal.itemsRemoved.length === 0 &&
        meal.itemsChanged.length === 0 && (
          <p className="text-xs text-muted-foreground">Apenas ajustes finos de totais.</p>
        )}
    </div>
  );
};

const DietPlanStructuredComparison: React.FC<Props> = ({ current, draft }) => {
  const diff = React.useMemo<DietPlanDiff>(() => diffDietPlans(current, draft), [current, draft]);
  const mag = magnitudeMeta[diff.magnitude];

  return (
    <div className="space-y-6">
      {/* Cabeçalho — magnitude + preservação */}
      <section className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', mag.className)}>
              {mag.label}
            </span>
            <span className="text-xs text-muted-foreground">{mag.description}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Preservação estrutural</span>
            <span className="font-semibold">{diff.structurePreservationPct}%</span>
          </div>
        </div>
        <Progress value={diff.structurePreservationPct} className="h-1.5" />
        {diff.magnitudeReasons.length > 0 && (
          <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc pl-4">
            {diff.magnitudeReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="rounded-md border border-border/40 bg-background/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Refeições</p>
            <p className="text-sm font-medium">
              {diff.mealsUnchanged} iguais · {diff.mealsModified} mod.
            </p>
            <p className="text-[10px] text-muted-foreground">
              +{diff.mealsAdded} / -{diff.mealsRemoved}
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Itens</p>
            <p className="text-sm font-medium">
              {diff.itemsTotalCurrent} → {diff.itemsTotalDraft}
            </p>
            <p className="text-[10px] text-muted-foreground">
              +{diff.itemsAdded} / -{diff.itemsRemoved} · ~{diff.itemsChanged}
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Δ Calorias</p>
            <p className="text-sm font-medium flex items-center gap-1">
              {Math.round(Math.abs(diff.kcalDelta))} kcal
              <DeltaPill value={diff.kcalDelta} />
            </p>
          </div>
          <div className="rounded-md border border-border/40 bg-background/40 p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Δ Macros (g)</p>
            <p className="text-[11px] flex flex-wrap gap-2">
              <span>P <DeltaPill value={diff.macroDeltas.p} suffix="g" /></span>
              <span>C <DeltaPill value={diff.macroDeltas.c} suffix="g" /></span>
              <span>G <DeltaPill value={diff.macroDeltas.g} suffix="g" /></span>
            </p>
          </div>
        </div>
      </section>

      {/* Totais do dia */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Total do dia
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label="Kcal" from={diff.totalsCurrent.kcal} to={diff.totalsDraft.kcal} />
          <StatBox label="Proteína" from={diff.totalsCurrent.p} to={diff.totalsDraft.p} suffix="g" />
          <StatBox label="Carbo" from={diff.totalsCurrent.c} to={diff.totalsDraft.c} suffix="g" />
          <StatBox label="Gordura" from={diff.totalsCurrent.g} to={diff.totalsDraft.g} suffix="g" />
        </div>
      </section>

      {/* Diffs por dia / refeição */}
      {diff.dayDiffs.map((day, di) => (
        <section key={di} className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {diff.dayDiffs.length > 1 ? `Dia ${di + 1} · ${day.label}` : `Mudanças por refeição`}
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground line-through">
                {Math.round(day.totalsCurrent.kcal)} kcal
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">{Math.round(day.totalsDraft.kcal)} kcal</span>
              <DeltaPill value={day.kcalDelta} />
            </div>
          </div>
          <div className="space-y-2">
            {day.meals.map((meal, mi) => (
              <MealRow key={mi} meal={meal} />
            ))}
          </div>
        </section>
      ))}

      {(current.meta.rationale || draft.meta.rationale) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Decisão da IA
          </h3>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
            {draft.meta.decision && (
              <Badge variant="outline" className="text-[10px]">
                {draft.meta.decision}
              </Badge>
            )}
            <p>{draft.meta.rationale ?? current.meta.rationale}</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default DietPlanStructuredComparison;