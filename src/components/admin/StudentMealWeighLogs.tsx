import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Pencil, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { adminCorrectEstimatedItem } from '@/lib/mealWeigh/calibration';
import { saveEstimateCorrections } from '@/components/diet/mealWeigh/calibrationApi';
import { formatFoodComparison, formatSwapLine, formatUnweighedLine, isEstimatedItem, isScannedItem, supersededWeighLogIds, type FoodComparison, type UnweighedEntry, type WeighedItem } from '@/lib/mealWeigh';

interface WeighLog {
  id: string;
  log_date: string;
  meal_name: string;
  meal_time: string | null;
  meal_index: number | null;
  diet_plan_id: string | null;
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

/**
 * Lista "Refeições pesadas" na ficha do aluno. O admin pode corrigir as gramas
 * de um item estimado da pesagem que vale no dia: grava um registro novo (o
 * mais recente vale) e a correção entra na calibração como fonte 'admin'.
 */
export default function StudentMealWeighLogs({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<WeighLog[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ logId: string; index: number; grams: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => supabase
    .from('meal_weigh_logs')
    .select('id, log_date, meal_name, meal_time, meal_index, diet_plan_id, items, unweighed, total_kcal, total_p, total_c, total_g, planned, created_at')
    .eq('student_id', studentId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30)
    .then(({ data }) => (data as unknown as WeighLog[] | null) ?? []), [studentId]);
  useEffect(() => {
    let cancelled = false;
    load().then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
  }, [load]);

  const saveAdminGrams = async (log: WeighLog) => {
    if (!editing) return;
    const grams = Number(String(editing.grams).replace(',', '.'));
    const edit = adminCorrectEstimatedItem(log as any, studentId, editing.index, grams);
    if (!edit) { toast.error('Digite as gramas.'); return; }
    setSaving(true);
    const { data: saved, error } = await supabase.from('meal_weigh_logs').insert({
      student_id: studentId,
      log_date: log.log_date,
      diet_plan_id: log.diet_plan_id,
      meal_index: log.meal_index,
      meal_name: log.meal_name || '',
      meal_time: log.meal_time,
      items: edit.items as any,
      unweighed: edit.unweighed as any,
      total_kcal: edit.totals.kcal,
      total_p: edit.totals.p,
      total_c: edit.totals.c,
      total_g: edit.totals.g,
      planned: edit.planned as any,
    }).select('id').single();
    if (error) { setSaving(false); toast.error('Não foi possível salvar: ' + error.message); return; }
    if (edit.correction) await saveEstimateCorrections(studentId, [{ ...edit.correction, meal_log_id: (saved as any)?.id ?? null }], [], { asAdmin: true });
    setSaving(false);
    setEditing(null);
    toast.success('Gramas corrigidas — a refeição do aluno foi atualizada');
    const next = await load();
    setRows(next);
    if (next[0]) setOpen(next.find((r) => r.log_date === log.log_date && r.meal_index === log.meal_index)?.id ?? null);
  };

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
                        {(r.items ?? []).some((it) => isEstimatedItem(it) || isScannedItem(it)) ? 'Consumido' : 'Pesado'}: P {n(r.total_p)} · C {n(r.total_c)} · G {n(r.total_g)} g
                        <span className="text-muted-foreground"> · Previsto: P {n(planned.p)} · C {n(planned.c)} · G {n(planned.g)} g</span>
                      </p>
                      <ul className="space-y-0.5">
                        {(r.items ?? []).map((it, i) => (
                          <li key={i} className="space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {it.alimento}
                              {isScannedItem(it) ? <span className="ml-1 rounded-full border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Escaneado</span>
                                : isEstimatedItem(it) ? <span className="ml-1 rounded-full border border-dashed border-primary/60 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Estimado</span>
                                : <span className="ml-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">Pesado</span>}
                              {it.editado_pelo_aluno ? <span className="text-muted-foreground"> · corrigido</span> : null}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {isEstimatedItem(it) ? '~' : ''}{n(it.gramas)} g
                              {isEstimatedItem(it) && it.faixa_gramas ? <span className="text-muted-foreground"> ({it.faixa_gramas[0]}–{it.faixa_gramas[1]})</span> : null}
                              {' '}· {n(it.kcal)} kcal
                              {isEstimatedItem(it) && !superseded.has(r.id) && (
                                <button type="button" aria-label={`Corrigir gramas de ${it.alimento}`}
                                  onClick={() => setEditing({ logId: r.id, index: i, grams: String(n(it.gramas)) })}
                                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary align-middle text-muted-foreground">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          </div>
                          {isEstimatedItem(it) && it.gramas_estimadas != null && Math.round(Number(it.gramas_estimadas)) !== n(it.gramas) && (
                            <p className="text-[11px] text-muted-foreground">IA estimou {n(it.gramas_estimadas)} g{it.corrigido_por_admin ? ' · corrigido pelo admin' : ''}</p>
                          )}
                          {editing?.logId === r.id && editing.index === i && (
                            <div className="flex items-center gap-2" data-testid="admin-estimate-edit">
                              <Input inputMode="decimal" aria-label={`Gramas corretas de ${it.alimento}`} value={editing.grams} className="h-8 w-24 tabular-nums"
                                onChange={(e) => setEditing({ ...editing, grams: e.target.value.replace(/[^\d.,]/g, '') })} />
                              <span className="text-muted-foreground">g</span>
                              <Button size="sm" className="h-8" disabled={saving} onClick={() => saveAdminGrams(r)}>Salvar</Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancelar</Button>
                            </div>
                          )}
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
