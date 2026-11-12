import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Gauge, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import {
  CORRECTION_SOURCE_LABEL, calibrationFactor, correctionDiffPercent, estimateErrorByWeek, factorPercent, samplesFromCorrections,
  type CorrectionRecord, type CorrectionSource, type FactorScope,
} from '@/lib/mealWeigh/calibration';
import { loadCalibrationEnabled, saveCalibrationEnabled } from '@/components/diet/mealWeigh/calibrationApi';

interface Row extends CorrectionRecord {
  id: string;
  food_name: string;
  fonte: CorrectionSource;
}

const db = supabase as any;
const COLS = 'id, student_id, food_key, food_name, estimated_g, adjusted_g, real_g, fonte, created_at';
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { timeZone: 'Europe/Lisbon' });
};
const fmtWeek = (ymd: string) => { const [, m, d] = ymd.split('-'); return `${d}/${m}`; };
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
const SCOPE_LABEL: Record<FactorScope, string> = {
  aluno_alimento: 'histórico do aluno neste alimento',
  aluno: 'histórico do aluno (todos os alimentos)',
  alimento: 'todos os alunos neste alimento',
  nenhum: 'poucas correções — sem ajuste',
};

/**
 * "Calibração das estimativas": correções (estimado → real), fator atual por
 * alimento e erro médio antes × depois do ajuste. Com `studentId`, só aquele
 * aluno (ficha); sem, todos (tela geral). O admin apaga correções erradas e
 * liga/desliga a calibração para todos.
 */
export default function EstimateCalibrationPanel({ studentId }: { studentId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [foodRows, setFoodRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const load = useCallback(async () => {
    let q = db.from('estimate_corrections').select(COLS).order('created_at', { ascending: false }).limit(500);
    if (studentId) q = q.eq('student_id', studentId);
    const { data } = await q;
    const list = ((data ?? []) as Row[]);
    setRows(list);
    if (studentId) {
      // Nível "alimento, todos os alunos" precisa das correções dos outros alunos nesses alimentos.
      const keys = [...new Set(list.map((r) => r.food_key))].slice(0, 100);
      if (keys.length) {
        const { data: all } = await db.from('estimate_corrections').select(COLS).in('food_key', keys).order('created_at', { ascending: false }).limit(1000);
        setFoodRows((all ?? []) as Row[]);
      } else setFoodRows([]);
    } else {
      setFoodRows(list);
      const ids = [...new Set(list.map((r) => r.student_id))];
      if (ids.length) {
        const { data: profs } = await db.from('profiles').select('user_id, nome').in('user_id', ids);
        setNames(Object.fromEntries(((profs ?? []) as { user_id: string; nome: string }[]).map((p) => [p.user_id, p.nome])));
      }
    }
  }, [studentId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadCalibrationEnabled().then(setEnabled); }, []);

  const toggle = async (on: boolean) => {
    setEnabled(on);
    const ok = await saveCalibrationEnabled(on);
    if (!ok) { setEnabled(!on); toast.error('Não foi possível salvar.'); return; }
    toast.success(on ? 'Calibração ligada para todos os alunos' : 'Calibração desligada para todos os alunos');
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await db.from('estimate_corrections').delete().eq('id', toDelete.id);
    setToDelete(null);
    if (error) { toast.error('Não foi possível apagar: ' + error.message); return; }
    toast.success('Correção apagada');
    void load();
  };

  const weekly = useMemo(() => estimateErrorByWeek(rows ?? []), [rows]);
  const factors = useMemo(() => {
    const samples = samplesFromCorrections([...foodRows, ...(rows ?? []).filter((r) => !foodRows.some((f) => f.id === r.id))], studentId ?? null);
    const byKey = new Map<string, { name: string; n: number }>();
    for (const r of rows ?? []) {
      const cur = byKey.get(r.food_key);
      byKey.set(r.food_key, { name: cur?.name ?? r.food_name, n: (cur?.n ?? 0) + 1 });
    }
    return [...byKey.entries()]
      .map(([key, v]) => ({ key, ...v, f: calibrationFactor(key, samples) }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [rows, foodRows, studentId]);

  return (
    <Card className="glass-card" data-testid="estimate-calibration-panel">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> Calibração das estimativas</h3>
            <p className="text-xs text-muted-foreground">Gramas do "Prato pronto" ajustadas pelas correções (aluno, admin e balança).</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold shrink-0">
            Usar calibração
            <Switch checked={enabled ?? true} disabled={enabled === null} onCheckedChange={toggle} aria-label="Usar calibração" />
          </label>
        </div>

        {rows === null ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma correção ainda. Elas aparecem quando as gramas de um alimento estimado são mudadas ou pesadas na balança.</p>
        ) : (
          <>
            <section className="space-y-1.5" data-testid="calibration-weekly-error">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Erro médio por semana</p>
              <div className="rounded-xl border border-border divide-y divide-border/50 text-xs">
                <div className="grid grid-cols-4 gap-2 px-3 py-1.5 text-muted-foreground"><span>Semana</span><span className="text-right">Correções</span><span className="text-right">Antes do ajuste</span><span className="text-right">Depois do ajuste</span></div>
                {weekly.map((w) => (
                  <div key={w.weekStart} className="grid grid-cols-4 gap-2 px-3 py-1.5 tabular-nums">
                    <span>{fmtWeek(w.weekStart)}</span><span className="text-right">{w.n}</span>
                    <span className="text-right">{w.before}%</span>
                    <span className={`text-right font-semibold ${w.after < w.before ? 'text-primary' : ''}`}>{w.after}%</span>
                  </div>
                ))}
                {weekly.length === 0 && <p className="px-3 py-2 text-muted-foreground">Sem correções nas últimas 8 semanas.</p>}
              </div>
            </section>

            <section className="space-y-1.5" data-testid="calibration-factors">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fator atual por alimento</p>
              <ul className="rounded-xl border border-border divide-y divide-border/50 text-xs">
                {factors.map((f) => (
                  <li key={f.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0 truncate">{f.name} <span className="text-muted-foreground">· {f.n} {f.n === 1 ? 'correção' : 'correções'}</span></span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-semibold">{f.f.scope === 'nenhum' ? '×1' : `×${f.f.factor.toFixed(2).replace('.', ',')} (${signed(factorPercent(f.f.factor))})`}</span>
                      <span className="block text-[10px] text-muted-foreground">{SCOPE_LABEL[f.f.scope]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1.5" data-testid="calibration-corrections">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Correções</p>
              <ul className="space-y-1.5">
                {rows.map((r) => {
                  const diff = correctionDiffPercent(r.estimated_g, r.real_g);
                  return (
                    <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs" data-testid="calibration-correction">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.food_name}</p>
                        <p className="text-muted-foreground tabular-nums">
                          {Math.round(Number(r.estimated_g))} → {Math.round(Number(r.real_g))} g · <span className={diff !== 0 ? 'text-primary font-semibold' : ''}>{signed(diff)}</span>
                          {' '}· {CORRECTION_SOURCE_LABEL[r.fonte] ?? r.fonte} · {fmtDate(r.created_at)}
                          {!studentId && names[r.student_id] ? ` · ${names[r.student_id]}` : ''}
                        </p>
                      </div>
                      <button type="button" aria-label={`Apagar correção de ${r.food_name}`} onClick={() => setToDelete(r)}
                        className="h-8 w-8 shrink-0 rounded-full bg-secondary/70 flex items-center justify-center text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </CardContent>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta correção?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${toDelete.food_name}: ${Math.round(Number(toDelete.estimated_g))} → ${Math.round(Number(toDelete.real_g))} g. ` : ''}
              Ela deixa de contar no ajuste das próximas estimativas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
