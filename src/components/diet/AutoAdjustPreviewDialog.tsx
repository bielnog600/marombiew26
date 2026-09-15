/**
 * FASE 5 / 5.1 + HOTFIX UX — preview EDITÁVEL do ajuste determinístico.
 *
 * O optimizer (Fase 5) permanece intacto: este modal apenas permite ao
 * treinador editar o resultado sugerido antes de aplicar. Todas as edições
 * ocorrem em `workingPlan` local; o plano real só muda no [Aplicar].
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, CheckCircle2, RefreshCw, Replace, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  optimizeDietDay,
  AUTO_ADJUST_MESSAGES,
  type AutoAdjustResult,
} from '@/lib/dietAutoAdjust';
import {
  buildWorkingPlan,
  stripPreviewMeta,
  setPreviewItemQty,
  replacePreviewItemFood,
  removePreviewItem,
  canRemovePreviewItem,
  diffPreviewDay,
  previewDayStatus,
  parsePreviewGrams,
} from '@/lib/dietPreviewEdits';
import type { DayTarget } from '@/lib/dietDayTargets';
import type { FoodRecord } from '@/lib/nutritionEngine';
import CanonicalFoodPickerDialog from './CanonicalFoodPickerDialog';

const line = (m?: { kcal: number; p: number; c: number; g: number } | null) =>
  m
    ? `${Math.round(m.kcal)} kcal · ${Math.round(m.p)}P · ${Math.round(m.c)}C · ${Math.round(m.g)}G`
    : '—';

const gram = (n?: number) =>
  n == null ? '—' : Number.isInteger(n) ? `${n} g` : `${(Math.round(n * 10) / 10).toFixed(1)} g`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: AutoAdjustResult<any> | null;
  dayIndex: number;
  target: DayTarget | null;
  foods: FoodRecord[];
  /** Recebe o plano final (sem metadados de preview) e se está dentro da meta. */
  onApply: (plan: any, withinTolerance: boolean) => void;
}

const AutoAdjustPreviewDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  result,
  dayIndex,
  target,
  foods,
  onApply,
}) => {
  const [working, setWorking] = useState<any | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmOut, setConfirmOut] = useState(false);
  const [infeasibleMsg, setInfeasibleMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ mealIndex: number; itemIndex: number } | null>(null);

  const originalPlan = result?.originalPlan ?? null;

  useEffect(() => {
    if (!open || !result) {
      setWorking(null);
      setDrafts({});
      setConfirmOut(false);
      setInfeasibleMsg(null);
      setPicker(null);
      return;
    }
    const suggested =
      result.feasibleAdjustedPlan ?? result.bestAttemptPlan ?? result.originalPlan;
    setWorking(buildWorkingPlan(suggested, dayIndex));
    setDrafts({});
    setConfirmOut(false);
    setInfeasibleMsg(result.withinTolerance ? null : result.reason ?? AUTO_ADJUST_MESSAGES.infeasible);
  }, [open, result, dayIndex]);

  const status = useMemo(
    () => (working ? previewDayStatus(working, dayIndex, target, foods) : null),
    [working, dayIndex, target, foods],
  );
  const diffs = useMemo(
    () => (working && originalPlan ? diffPreviewDay(originalPlan, working, dayIndex) : []),
    [working, originalPlan, dayIndex],
  );

  const within = !!status?.withinTolerance;
  const day = working?.days?.[dayIndex];

  const commitQty = (mealIndex: number, itemIndex: number, text: string) => {
    const key = `${mealIndex}-${itemIndex}`;
    setDrafts((p) => {
      const copy = { ...p };
      delete copy[key];
      return copy;
    });
    const grams = parsePreviewGrams(text);
    if (grams === null) {
      toast.error('Informe uma quantidade maior que zero.');
      return;
    }
    setConfirmOut(false);
    setWorking((prev: any) =>
      setPreviewItemQty(prev, { dayIndex, mealIndex, itemIndex }, grams, foods),
    );
  };

  const recalc = () => {
    if (!working || !target) return;
    const res = optimizeDietDay<any>({ plan: working, dayIndex, target, foods });
    if (res.status === 'already_within_target') {
      setInfeasibleMsg(null);
      toast.info(AUTO_ADJUST_MESSAGES.already_within_target);
      return;
    }
    if (res.status === 'feasible' && res.feasibleAdjustedPlan) {
      setInfeasibleMsg(null);
      setConfirmOut(false);
      setWorking(buildWorkingPlan(res.feasibleAdjustedPlan, dayIndex));
      return;
    }
    setInfeasibleMsg(
      res.reason ??
        'Não foi possível fechar os macros apenas ajustando as porções restantes.',
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajustes sugeridos (editável)</DialogTitle>
          </DialogHeader>

          {!working || !day ? null : (
            <div className="space-y-3 text-xs">
              {infeasibleMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="font-semibold">{infeasibleMsg}</p>
                </div>
              )}

              <div className="space-y-2">
                {(day.meals ?? []).map((meal: any, mealIndex: number) => (
                  <div key={meal.id ?? mealIndex} className="rounded-lg border border-border p-2">
                    <p className="mb-1 font-semibold text-foreground">{meal.name}</p>
                    <div className="space-y-1">
                      {(meal.items ?? []).map((item: any, itemIndex: number) => {
                        const key = `${mealIndex}-${itemIndex}`;
                        const originalItem =
                          item?.__previewSrcIndex != null
                            ? originalPlan?.days?.[dayIndex]?.meals?.[mealIndex]?.items?.[
                                item.__previewSrcIndex
                              ]
                            : null;
                        const removable = canRemovePreviewItem(working, {
                          dayIndex,
                          mealIndex,
                          itemIndex,
                        });
                        return (
                          <div
                            key={key}
                            className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2 py-1.5"
                          >
                            <span className="min-w-[7rem] flex-1 text-foreground">{item.name}</span>
                            <span className="text-muted-foreground">
                              Atual: {gram(Number(originalItem?.qtyGrams) || undefined)}
                            </span>
                            <Input
                              className="h-7 w-20 text-xs"
                              inputMode="decimal"
                              value={drafts[key] ?? String(item.qtyGrams ?? 0)}
                              onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                              onBlur={(e) => commitQty(mealIndex, itemIndex, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                            <span className="text-muted-foreground">g</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Substituir alimento"
                              onClick={() => setPicker({ mealIndex, itemIndex })}
                            >
                              <Replace className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              disabled={!removable}
                              title={
                                removable
                                  ? 'Remover do preview'
                                  : 'Esta refeição precisa manter pelo menos um alimento.'
                              }
                              onClick={() => {
                                setConfirmOut(false);
                                setWorking((prev: any) =>
                                  removePreviewItem(prev, { dayIndex, mealIndex, itemIndex }, foods),
                                );
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {diffs.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {diffs.map((d, i) => (
                    <p key={`${d.kind}-${i}`} className="text-muted-foreground">
                      <strong className="text-foreground">{d.beforeName ?? d.afterName}</strong>{' '}
                      {d.kind === 'remove' && <>{gram(d.beforeGrams)} → REMOVIDO</>}
                      {d.kind === 'add' && <>ADICIONADO → {gram(d.afterGrams)}</>}
                      {d.kind === 'qty' && (
                        <>
                          {gram(d.beforeGrams)} → {gram(d.afterGrams)}
                        </>
                      )}
                      {d.kind === 'replace' && (
                        <>
                          → {d.afterName} · {gram(d.beforeGrams)} → {gram(d.afterGrams)}
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-1 rounded-lg border border-border p-3 text-muted-foreground">
                <span>
                  ANTES: <strong className="text-foreground">{line(result?.before)}</strong>
                </span>
                <span>
                  PREVIEW ATUAL: <strong className="text-foreground">{line(status?.totals)}</strong>
                </span>
                <span>
                  META: <strong className="text-foreground">{line(target)}</strong>
                </span>
                <span>
                  DIFERENÇA: <strong className="text-foreground">{line(status?.diff)}</strong>
                </span>
              </div>

              {within ? (
                <p className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Dentro da meta
                </p>
              ) : (
                <p className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4" /> Fora da meta após edição
                </p>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="ghost" size="sm" onClick={recalc} disabled={!target}>
              <RefreshCw className="mr-1 h-3 w-3" /> Recalcular sugestões
            </Button>
            {within ? (
              <Button
                size="sm"
                onClick={() => onApply(stripPreviewMeta(working), true)}
                disabled={!working}
              >
                Aplicar ajuste
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-yellow-600 dark:text-yellow-400"
                disabled={!working}
                onClick={() => {
                  if (!confirmOut) {
                    setConfirmOut(true);
                    return;
                  }
                  onApply(stripPreviewMeta(working), false);
                }}
              >
                {confirmOut
                  ? 'O plano continuará fora da meta. Confirmar?'
                  : 'Aplicar mesmo fora da meta'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CanonicalFoodPickerDialog
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        foods={foods}
        title="Substituir alimento"
        onSelect={(food) => {
          if (!picker) return;
          const ref = { dayIndex, mealIndex: picker.mealIndex, itemIndex: picker.itemIndex };
          setConfirmOut(false);
          setWorking((prev: any) => replacePreviewItemFood(prev, ref, food, foods));
          setPicker(null);
        }}
      />
    </>
  );
};

export default AutoAdjustPreviewDialog;
