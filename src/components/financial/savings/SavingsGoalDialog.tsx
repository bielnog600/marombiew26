import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Check, Dices, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SavingsGoalsApi } from '@/hooks/useSavingsGoals';
import {
  defaultGoalId, drawUndeposited, formatDayLong, formatDayShort, formatEuro, goalProgress,
  isIsoDay, latestDeposits, localDay, previewGoalChange, savedByMonth,
  type GoalDraft, type SavingsDeposit, type SavingsGoal,
} from '@/lib/savingsGoal';
import SavingsGoalForm from './SavingsGoalForm';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: SavingsGoalsApi;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type Filter = 'todos' | 'faltam' | 'feitos';
type Editor = { valor: number; dep: SavingsDeposit | null; day: string };

const DRAW_KEY = (goalId: string) => `savings-draw:${goalId}`;

function readDraw(goalId: string, today: string): number | null {
  try {
    const raw = localStorage.getItem(DRAW_KEY(goalId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { day: string; valor: number };
    return v.day === today && Number.isInteger(v.valor) ? v.valor : null;
  } catch { return null; }
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Não foi possível guardar.';
}

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl bg-card border border-border/60 p-3 min-w-0">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
    <p className="text-lg font-bold leading-tight truncate">{value}</p>
    {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
  </div>
);

const SavingsGoalDialog: React.FC<Props> = ({ open, onOpenChange, api, selectedId, onSelect }) => {
  const { goals, deposits, saveGoal, addDeposit, changeDepositDate, removeDeposit } = api;
  const today = localDay();
  const defaultYear = useMemo(() => {
    const d = new Date();
    return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
  }, []);

  const goal = goals.find(g => g.id === selectedId) ?? null;
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [filter, setFilter] = useState<Filter>('todos');
  const [drawn, setDrawn] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<SavingsDeposit | null>(null);
  const [pendingChange, setPendingChange] = useState<GoalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (goals.length === 0) setMode('new');
    else if (mode === 'new' && !goal) setMode('view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goals.length]);

  useEffect(() => {
    if (!open || selectedId || goals.length === 0) return;
    const id = defaultGoalId(goals, today);
    if (id) onSelect(id);
  }, [open, selectedId, goals, today, onSelect]);

  const goalDeposits = useMemo(() => deposits.filter(d => d.goal_id === goal?.id), [deposits, goal?.id]);
  const byValue = useMemo(() => new Map(goalDeposits.map(d => [d.valor, d])), [goalDeposits]);
  const progress = useMemo(() => (goal ? goalProgress(goal, goalDeposits, today) : null), [goal, goalDeposits, today]);
  const bars = useMemo(() => (goal ? savedByMonth(goal, goalDeposits) : []), [goal, goalDeposits]);
  const recent = useMemo(() => latestDeposits(goalDeposits, 10), [goalDeposits]);

  useEffect(() => {
    if (!goal) { setDrawn(null); return; }
    const v = readDraw(goal.id, today);
    setDrawn(v != null && v <= goal.max_valor && !byValue.has(v) ? v : null);
  }, [goal, today, byValue]);

  const values = useMemo(() => {
    if (!progress) return [];
    const out: number[] = [];
    for (let v = 1; v <= progress.n; v++) {
      const done = byValue.has(v);
      if (filter === 'todos' || (filter === 'feitos' ? done : !done)) out.push(v);
    }
    return out;
  }, [progress, byValue, filter]);

  const handleDraw = () => {
    if (!goal || !progress) return;
    const v = drawUndeposited(progress.n, byValue.keys());
    if (v == null) { toast.success('Grade completa — não há valores por depositar.'); return; }
    setDrawn(v);
    try { localStorage.setItem(DRAW_KEY(goal.id), JSON.stringify({ day: today, valor: v })); } catch { /* ignore */ }
    if (filter === 'feitos') setFilter('todos');
    requestAnimationFrame(() => {
      gridRef.current?.querySelector(`[data-valor="${v}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const mark = async (valor: number, day = today) => {
    if (!goal) return;
    try {
      await addDeposit(goal.id, valor, day);
      if (drawn === valor) setDrawn(null);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const tapSquare = (valor: number) => {
    const dep = byValue.get(valor);
    if (dep) setConfirmRemove(dep);
    else mark(valor);
  };

  const openEditor = (valor: number) => {
    const dep = byValue.get(valor) ?? goalDeposits.find(d => d.valor === valor) ?? null;
    setEditor({ valor, dep, day: dep?.depositado_em ?? today });
  };

  const saveEditor = async () => {
    if (!editor || !goal) return;
    if (!isIsoDay(editor.day)) { toast.error('Escolhe uma data válida.'); return; }
    try {
      if (editor.dep) await changeDepositDate(editor.dep, editor.day);
      else await addDeposit(goal.id, editor.valor, editor.day);
      setEditor(null);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const doRemove = async () => {
    if (!confirmRemove) return;
    const dep = confirmRemove;
    setConfirmRemove(null);
    setEditor(null);
    try { await removeDeposit(dep); } catch (e) { toast.error(errMsg(e)); }
  };

  const submitGoal = async (draft: GoalDraft) => {
    if (mode === 'edit' && goal) { setPendingChange(draft); return; }
    setSaving(true);
    try {
      const saved = await saveGoal(draft);
      onSelect(saved.id);
      setMode('view');
      toast.success('Meta criada');
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const confirmChange = async () => {
    if (!pendingChange || !goal) return;
    setSaving(true);
    try {
      await saveGoal(pendingChange, goal.id);
      setPendingChange(null);
      setMode('view');
      toast.success('Meta atualizada — depósitos mantidos');
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  const change = pendingChange && goal ? previewGoalChange(goal, pendingChange, goalDeposits, today) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-full h-[100dvh] max-h-[100dvh] sm:h-[92vh] p-0 gap-0 flex flex-col overflow-hidden sm:rounded-2xl [&>button:last-child]:top-[calc(env(safe-area-inset-top)+1rem)]"
      >
        <DialogHeader className="px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] pr-12 border-b border-border/60 space-y-2 text-left">
          <DialogTitle>Meta de depósitos</DialogTitle>
          <DialogDescription className="sr-only">Grade de depósitos de 1 € até N €, cada valor uma vez.</DialogDescription>
          {goals.length > 0 && mode !== 'new' && (
            <div className="flex items-center gap-2">
              <Select value={goal?.id ?? ''} onValueChange={id => { onSelect(id); setMode('view'); setFilter('todos'); }}>
                <SelectTrigger className="flex-1 min-w-0" aria-label="Escolher meta"><SelectValue placeholder="Escolher meta" /></SelectTrigger>
                <SelectContent>
                  {goals.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {goal && mode === 'view' && (
                <Button size="icon" variant="outline" aria-label="Editar meta" onClick={() => setMode('edit')}><Pencil className="h-4 w-4" /></Button>
              )}
              <Button size="icon" variant="outline" aria-label="Nova meta" onClick={() => setMode('new')}><Plus className="h-4 w-4" /></Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] space-y-5">
          {mode !== 'view' || !goal || !progress ? (
            <SavingsGoalForm
              key={mode === 'edit' ? goal?.id : 'new'}
              goal={mode === 'edit' ? goal : null}
              defaultYear={defaultYear}
              saving={saving}
              onCancel={goals.length > 0 ? () => setMode('view') : undefined}
              onSubmit={submitGoal}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Guardado" value={formatEuro(progress.saved)} sub={`${Math.round(progress.savedPct)}% da meta`} />
                <Stat label="Falta" value={formatEuro(progress.remaining)} sub={`${progress.remainingCount} depósitos`} />
                <Stat label="Depósitos feitos" value={`${progress.doneInGrid} de ${progress.n}`} sub={progress.outside.length ? `+${progress.outside.length} fora da grade` : undefined} />
                <Stat label="Média por mês" value={formatEuro(progress.avgPerMonth)} sub={`plano ${formatEuro(progress.planPerMonth)}/mês`} />
              </div>

              <div className="space-y-1.5">
                <div className="relative h-3 rounded-full bg-secondary overflow-visible" aria-label="Progresso da meta">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, progress.savedPct)}%` }} />
                  <div
                    className="absolute -top-1 -bottom-1 w-0.5 bg-foreground"
                    style={{ left: `calc(${progress.expectedPct}% - 1px)` }}
                    title={`Esperado hoje: ${formatEuro(progress.expected)}`}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{formatDayShort(goal.inicio)}</span>
                  <span>esperado hoje: {formatEuro(progress.expected)}</span>
                  <span>{formatDayShort(goal.fim)}</span>
                </div>
              </div>

              <div className={`rounded-xl border p-3 text-sm ${progress.onPace ? 'border-green-500/40 bg-green-500/10' : 'border-orange-500/40 bg-orange-500/10'}`} data-testid="savings-pace">
                <p className={`font-semibold ${progress.onPace ? 'text-green-400' : 'text-orange-400'}`}>
                  {progress.onPace ? 'No ritmo' : `Abaixo do ritmo em ${formatEuro(progress.behindBy)}`}
                </p>
                {progress.remaining > 0 && (
                  <p className="text-muted-foreground">
                    {progress.monthsLeft > 0
                      ? `Para fechar até ${formatDayShort(goal.fim)} precisa de ${formatEuro(progress.neededPerMonth)} por mês nos próximos ${progress.monthsLeft} ${progress.monthsLeft === 1 ? 'mês' : 'meses'}.`
                      : `O período terminou a ${formatDayLong(goal.fim)}; faltam ${formatEuro(progress.remaining)}.`}
                  </p>
                )}
                {progress.remaining === 0 && <p className="text-muted-foreground">Grade completa!</p>}
              </div>

              <div className="space-y-2">
                <Button className="w-full h-11" onClick={handleDraw} disabled={progress.remainingCount === 0}>
                  <Dices className="mr-2 h-4 w-4" /> {drawn ? 'Sortear outro valor' : 'Sortear valor de hoje'}
                </Button>
                {drawn != null && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary/10 p-3" data-testid="savings-drawn">
                    <p className="text-sm">Hoje deposita <span className="text-xl font-bold text-primary">{formatEuro(drawn)}</span></p>
                    <Button size="sm" onClick={() => mark(drawn)}><Check className="mr-1 h-4 w-4" /> Depositei</Button>
                  </div>
                )}
                <ToggleGroup type="single" value={filter} onValueChange={v => v && setFilter(v as Filter)} className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                  <ToggleGroupItem value="todos" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Todos</ToggleGroupItem>
                  <ToggleGroupItem value="faltam" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Faltam</ToggleGroupItem>
                  <ToggleGroupItem value="feitos" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Feitos</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-[11px] text-muted-foreground">Toque marca com a data de hoje · toque longo muda a data.</p>
              </div>

              <div ref={gridRef} className="grid grid-cols-10 gap-1" role="grid" aria-label="Grade de depósitos">
                {values.map(v => (
                  <GridSquare
                    key={v}
                    valor={v}
                    done={byValue.has(v)}
                    drawn={drawn === v}
                    onTap={tapSquare}
                    onLongPress={openEditor}
                  />
                ))}
                {values.length === 0 && (
                  <p className="col-span-10 py-6 text-center text-sm text-muted-foreground">
                    {filter === 'feitos' ? 'Ainda nenhum depósito.' : 'Todos os valores depositados!'}
                  </p>
                )}
              </div>

              {progress.outside.length > 0 && (
                <div className="rounded-xl border border-border/60 p-3 space-y-2" data-testid="savings-outside">
                  <p className="text-sm font-semibold">Depósitos fora da grade</p>
                  <p className="text-xs text-muted-foreground">Valores acima de {formatEuro(progress.n)} feitos antes da mudança da meta. Continuam a contar no total ({formatEuro(progress.outsideSum)}).</p>
                  <div className="flex flex-wrap gap-1.5">
                    {progress.outside.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => openEditor(d.valor)}
                        className="rounded-lg bg-primary/80 text-primary-foreground px-2 py-1 text-xs font-semibold"
                      >
                        {d.valor} € · {formatDayShort(d.depositado_em)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold">Últimos depósitos</p>
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ainda nenhum depósito.</p>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                    {recent.map(d => (
                      <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{formatDayLong(d.depositado_em)}</span>
                        <span className="font-semibold">{formatEuro(d.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Guardado por mês</p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-45} textAnchor="end" height={36} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={44} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--primary) / 0.1)' }}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }}
                        formatter={(v: number) => [formatEuro(v), 'Guardado']}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mudar data / marcar com outra data */}
        <AlertDialog open={!!editor} onOpenChange={o => !o && setEditor(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Depósito de {editor ? formatEuro(editor.valor) : ''}</AlertDialogTitle>
              <AlertDialogDescription>{editor?.dep ? 'Muda a data deste depósito.' : 'Marca como depositado nesta data.'}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="sg-dep-date">Data do depósito</Label>
              <Input id="sg-dep-date" type="date" max={today} value={editor?.day ?? ''} onChange={e => editor && setEditor({ ...editor, day: e.target.value })} />
            </div>
            <AlertDialogFooter className="gap-2">
              {editor?.dep && (
                <Button variant="outline" className="text-destructive" onClick={() => editor.dep && setConfirmRemove(editor.dep)}>Desmarcar</Button>
              )}
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button onClick={saveEditor}>{editor?.dep ? 'Guardar data' : 'Marcar'}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmar desmarcar */}
        <AlertDialog open={!!confirmRemove} onOpenChange={o => !o && setConfirmRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desmarcar {confirmRemove ? formatEuro(confirmRemove.valor) : ''}?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmRemove ? `O depósito de ${formatDayLong(confirmRemove.depositado_em)} sai do total guardado.` : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Manter</AlertDialogCancel>
              <AlertDialogAction onClick={doRemove}>Desmarcar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmar mudança de meta (antes / depois) */}
        <AlertDialog open={!!pendingChange} onOpenChange={o => !o && setPendingChange(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar a meta?</AlertDialogTitle>
              <AlertDialogDescription>Os depósitos já feitos continuam guardados ({change ? formatEuro(change.savedUnchanged) : ''}).</AlertDialogDescription>
            </AlertDialogHeader>
            {change && (
              <table className="w-full text-sm" data-testid="savings-change-preview">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left font-normal py-1"></th>
                    <th className="text-right font-normal py-1">Antes</th>
                    <th className="text-right font-normal py-1">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="py-1">Depósitos (N)</td><td className="text-right">{change.before.n}</td><td className="text-right font-semibold">{change.after.n}</td></tr>
                  <tr><td className="py-1">Total da grade</td><td className="text-right">{formatEuro(change.before.total)}</td><td className="text-right font-semibold">{formatEuro(change.after.total)}</td></tr>
                  <tr><td className="py-1">Média por mês</td><td className="text-right">{formatEuro(change.before.perMonth)}</td><td className="text-right font-semibold">{formatEuro(change.after.perMonth)}</td></tr>
                  <tr><td className="py-1">Falta</td><td className="text-right">{formatEuro(change.before.remaining)}</td><td className="text-right font-semibold">{formatEuro(change.after.remaining)}</td></tr>
                  <tr><td className="py-1">Fora da grade</td><td className="text-right">{change.before.outsideCount}</td><td className="text-right font-semibold">{change.after.outsideCount}{change.after.outsideCount ? ` (${formatEuro(change.after.outsideSum)})` : ''}</td></tr>
                </tbody>
              </table>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
              <Button onClick={confirmChange} disabled={saving}>Confirmar</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

const LONG_PRESS_MS = 500;

const GridSquare = React.memo(function GridSquare({ valor, done, drawn, onTap, onLongPress }: {
  valor: number; done: boolean; drawn: boolean;
  onTap: (v: number) => void; onLongPress: (v: number) => void;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  return (
    <button
      type="button"
      data-valor={valor}
      aria-pressed={done}
      aria-label={`${valor} €${done ? ', depositado' : ''}`}
      onPointerDown={() => {
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => { fired.current = true; onLongPress(valor); }, LONG_PRESS_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={e => { e.preventDefault(); if (!fired.current) { fired.current = true; clear(); onLongPress(valor); } }}
      onClick={() => { if (fired.current) { fired.current = false; return; } onTap(valor); }}
      className={`aspect-square min-w-0 rounded-md text-[11px] sm:text-xs font-semibold tabular-nums select-none [-webkit-touch-callout:none] [touch-action:manipulation] transition-colors
        ${done ? 'bg-primary text-primary-foreground' : 'bg-secondary/70 text-foreground/80 border border-border/60'}
        ${drawn ? 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse' : ''}`}
    >
      {valor}
    </button>
  );
});

export default SavingsGoalDialog;
