import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatFoodComparison, formatSwapLine, formatUnweighedLine, isEstimatedItem, supersededWeighLogIds, type FoodComparison, type UnweighedEntry, type WeighedItem } from '@/lib/mealWeigh';

interface WeighLog {
  id: string;
  log_date: string;
  meal_name: string;
  meal_time: string | null;
  meal_index: number | null;
  items: WeighedItem[] | null;
  unweighed: UnweighedEntry[] | null;
  total_kcal: number;
  total_p: number;
  total_c: number;
  total_g: number;
  planned: { kcal?: number; p?: number; c?: number; g?: number; comparacao?: FoodComparison[] } | null;
  created_at: string;
}

const n = (v: unknown) => Math.round(Number(v) || 0);
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return y && m && day ? `${day}/${m}/${y}` : d;
};

/** Lista "Refeições pesadas" na ficha do aluno (somente leitura). */
export default function StudentMealWeighLogs({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<WeighLog[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('meal_weigh_logs')
      .select('id, log_date, meal_name, meal_time, meal_index, items, unweighed, total_kcal, total_p, total_c, total_g, planned, created_at')
      .eq('student_id', studentId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { if (!cancelled) setRows((data as unknown as WeighLog[] | null) ?? []); });
    return () => { cancelled = true; };
  }, [studentId]);

  return (
    <Card className="glass-card" data-testid="student-meal-weigh-logs">
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-2"><Scale className="h-4 w-4 text-primary" /> Refeições pesadas</h3>
        {rows === null ? (
          <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma refeição pesada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {(() => { const superseded = supersededWeighLogIds(rows as any); return rows.map((r) => {
              const planned = r.planned ?? {};
              const diff = n(r.total_kcal) - n(planned.kcal);
              const expanded = open === r.id;
              return (
                <li key={r.id} className="rounded-xl border border-border bg-secondary/40">
                  <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="w-full p-3 text-left flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{r.meal_time ? `${r.meal_time} · ` : ''}{r.meal_name || 'Refeição'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(r.log_date)} · {(r.items ?? []).length} itens
                        {superseded.has(r.id) && <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">substituída por nova pesagem</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0 text-xs tabular-nums">
                      <p><span className="font-bold text-primary">{n(r.total_kcal)}</span> / {n(planned.kcal)} kcal</p>
                      <p className={diff > 0 ? 'text-primary' : 'text-muted-foreground'}>{diff > 0 ? '+' : ''}{diff} kcal</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 mt-0.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && (
                    <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-2 text-xs">
                      <p className="tabular-nums">
                        {(r.items ?? []).some(isEstimatedItem) ? 'Consumido' : 'Pesado'}: P {n(r.total_p)} · C {n(r.total_c)} · G {n(r.total_g)} g
                        <span className="text-muted-foreground"> · Previsto: P {n(planned.p)} · C {n(planned.c)} · G {n(planned.g)} g</span>
                      </p>
                      <ul className="space-y-0.5">
                        {(r.items ?? []).map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {it.alimento}
                              {isEstimatedItem(it) ? <span className="ml-1 rounded-full border border-dashed border-primary/60 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Estimado</span>
                                : <span className="ml-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">Pesado</span>}
                              {it.editado_pelo_aluno ? <span className="text-muted-foreground"> · corrigido</span> : null}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {isEstimatedItem(it) ? '~' : ''}{n(it.gramas)} g
                              {isEstimatedItem(it) && it.faixa_gramas ? <span className="text-muted-foreground"> ({it.faixa_gramas[0]}–{it.faixa_gramas[1]})</span> : null}
                              {' '}· {n(it.kcal)} kcal
                            </span>
                          </li>
                        ))}
                      </ul>
                      {(planned.comparacao ?? []).length > 0 && (
                        <div className="text-muted-foreground space-y-0.5">
                          {(planned.comparacao ?? []).map((c, i) => <p key={i}>{formatFoodComparison(c)}</p>)}
                        </div>
                      )}
                      {(r.items ?? []).some((it) => formatSwapLine(it)) && (
                        <div className="space-y-0.5" data-testid="meal-weigh-swaps">
                          {(r.items ?? []).map((it, i) => {
                            const line = formatSwapLine(it);
                            return line ? <p key={i} className="font-semibold text-primary">{line}</p> : null;
                          })}
                        </div>
                      )}
                      {(r.unweighed ?? []).length > 0 && (
                        <div className="text-muted-foreground space-y-0.5">
                          {(r.unweighed ?? []).map((u) => <p key={u.indice_plano}>{formatUnweighedLine(u)}</p>)}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            }); })()}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
