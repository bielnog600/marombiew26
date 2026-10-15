import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Pencil, Save, Undo2, UserRound, History, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import StudentMealCard from './StudentMealCard';
import { diffDay, sumMeals, hasOverrideGroups, type FoodChange, type OverrideMeal } from '@/lib/studentDietOverrideDiff';
import { cn } from '@/lib/utils';

interface Props {
  planId: string;
  studentId: string;
  children: React.ReactNode;
}

const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const r = (n: number) => Math.round(n || 0);

const ACTION_LABEL: Record<string, string> = {
  aluno_editou: 'Aluno alterou',
  aluno_restaurou: 'Aluno voltou ao original',
  aluno_ajustou_porcoes: 'Aluno ajustou porções (Ajustar Dieta)',
  aluno_desfez_ajuste: 'Aluno desfez o ajuste de porções',
  treinador_editou: 'Treinador corrigiu',
  treinador_descartou: 'Treinador descartou alterações',
};

const ChangeLine: React.FC<{ c: FoodChange }> = ({ c }) => {
  const label = (x?: any) => `${x?.name ?? ''}${x?.qty ? ` · ${x.qty}` : ''}`;
  if (c.kind === 'same') return <li className="text-xs text-muted-foreground">{label(c.after)}</li>;
  const map = {
    qty: { tag: 'Porção', cls: 'text-primary', text: `${c.before?.name}: ${c.before?.qty || '—'} → ${c.after?.qty || '—'}` },
    replaced: { tag: 'Trocado', cls: 'text-primary', text: `${label(c.before)} → ${label(c.after)}` },
    added: { tag: 'Adicionado', cls: 'text-chart-2', text: label(c.after) },
    removed: { tag: 'Removido', cls: 'text-destructive', text: label(c.before) },
  } as const;
  const m = map[c.kind];
  return (
    <li className="text-xs flex gap-2">
      <span className={cn('font-semibold shrink-0', m.cls)}>{m.tag}</span>
      <span className={cn('text-foreground', c.kind === 'removed' && 'line-through opacity-70')}>{m.text}</span>
    </li>
  );
};

const StudentDietOverridePanel: React.FC<Props> = ({ planId, studentId, children }) => {
  const [row, setRow] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState<'trainer' | 'student'>('trainer');
  const [groupKey, setGroupKey] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OverrideMeal[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: ev }] = await Promise.all([
      supabase.from('student_diet_overrides').select('*').eq('plan_id', planId).maybeSingle(),
      supabase.from('student_diet_override_events').select('id, actor_role, action, created_at')
        .eq('plan_id', planId).order('created_at', { ascending: false }).limit(10),
    ]);
    setRow(data ?? null);
    setEvents(ev ?? []);
  }, [planId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel(`admin-diet-override-${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_diet_overrides', filter: `plan_id=eq.${planId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [planId, load]);

  const groups: Record<string, any> = (row?.groups as any) ?? {};
  const keys = useMemo(() => Object.keys(groups).sort((a, b) => Number(a) - Number(b)), [groups]);
  const active = keys.includes(groupKey) ? groupKey : keys[0];
  const g = active != null ? groups[active] : null;

  if (!row || !hasOverrideGroups(groups)) return <>{children}</>;

  const studentMeals: OverrideMeal[] = editing ? draft : (g?.student ?? []);
  const prescribed: OverrideMeal[] = g?.prescribed ?? [];
  const diff = diffDay(prescribed, studentMeals);
  const totals = sumMeals(studentMeals);
  const target = sumMeals(prescribed);
  const dayName = (k: string) => groups[k]?.label || WEEK[Number(k)] || `Dia ${Number(k) + 1}`;

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(g?.student ?? [])));
    setEditing(true);
  };

  const save = async () => {
    if (active == null) return;
    setSaving(true);
    const subs = { ...((row.substitutions as any) ?? {}) };
    Object.keys(subs).forEach((k) => { if (k.startsWith(`${active}-`)) delete subs[k]; });
    draft.forEach((m, mi) => { subs[`${active}-${mi}`] = m.foods ?? []; });
    const meta = { ...((row.edited_meta as any) ?? {}), [active]: Math.max(0, draft.length - 1) };
    const nextGroups = { ...groups, [active]: { ...g, student: draft } };
    const { error } = await supabase.from('student_diet_overrides')
      .update({ substitutions: subs, edited_meta: meta, groups: nextGroups })
      .eq('plan_id', planId);
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar a versão do aluno.'); return; }
    toast.success('Versão do aluno atualizada no app dele.');
    setEditing(false);
    load();
  };

  const discard = async () => {
    const { error } = await supabase.from('student_diet_overrides')
      .update({ substitutions: {}, edited_meta: {}, groups: {} })
      .eq('plan_id', planId);
    if (error) { toast.error('Não foi possível descartar.'); return; }
    toast.success('Alterações descartadas. O aluno volta a ver a versão publicada.');
    setView('trainer');
    load();
  };

  const kcalDiff = totals.kcal - target.kcal;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
          <UserRound className="h-3 w-3" />
          Alterada pelo {row.updated_by_role === 'treinador' ? 'treinador (correção)' : 'aluno'} · {fmtDate(row.updated_at)}
        </Badge>
      </div>
      <Tabs value={view} onValueChange={(v) => { setView(v as any); setEditing(false); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="trainer">Versão do treinador</TabsTrigger>
          <TabsTrigger value="student">Versão do aluno</TabsTrigger>
        </TabsList>
        <TabsContent value="trainer" className="mt-3">{children}</TabsContent>
        <TabsContent value="student" className="mt-3 space-y-3">
          {keys.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1">
              {keys.map((k) => (
                <Button key={k} size="sm" variant={k === active ? 'default' : 'outline'} className="h-7 text-xs shrink-0"
                  onClick={() => { setGroupKey(k); setEditing(false); }}>
                  {dayName(k)}
                </Button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Dias alterados pelo aluno: {keys.map(dayName).join(', ')}. Os demais seguem a versão do treinador.
          </p>

          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Total do dia ({dayName(active)}) × meta</p>
            <p>
              <strong>{r(totals.kcal)} kcal</strong> / {r(target.kcal)} kcal{' '}
              <span className={cn(Math.abs(kcalDiff) <= 50 ? 'text-chart-2' : 'text-destructive')}>
                ({kcalDiff >= 0 ? '+' : ''}{r(kcalDiff)})
              </span>
            </p>
            <p className="text-muted-foreground">
              P {r(totals.p)}/{r(target.p)} g · C {r(totals.c)}/{r(target.c)} g · G {r(totals.g)}/{r(target.g)} g
            </p>
          </div>

          {editing ? (
            <div className="space-y-2.5">
              {draft.map((meal, i) => (
                <StudentMealCard
                  key={`ovr-${active}-${i}`}
                  meal={meal as any}
                  expanded={expanded === i}
                  onToggleExpand={() => setExpanded((p) => (p === i ? null : i))}
                  onFoodsChange={(foods) => setDraft((prev) => prev.map((m, mi) => (mi === i ? { ...m, foods } : m)))}
                  moveTargets={draft.map((m, mi) => ({ index: mi, name: m.name ?? '' })).filter((t) => t.index !== i)}
                  onMoveFood={(food, ti) => setDraft((prev) => prev.map((m, mi) =>
                    mi === i ? { ...m, foods: (m.foods ?? []).filter((x) => x !== food) }
                      : mi === ti ? { ...m, foods: [...(m.foods ?? []), food] } : m))}
                />
              ))}
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar versão do aluno
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {diff.map((m, i) => (
                <div key={i} className={cn('rounded-xl border p-3', m.changed ? 'border-primary/40 bg-primary/5' : 'border-border')}>
                  <p className="text-sm font-semibold mb-1">
                    {m.time ? `${m.time} · ` : ''}{m.name}
                    {m.changed && <span className="ml-2 text-[10px] font-semibold text-primary uppercase">alterada</span>}
                  </p>
                  <ul className="space-y-0.5">{m.changes.map((c, ci) => <ChangeLine key={ci} c={c} />)}</ul>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar versão do aluno
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40">
                      <Undo2 className="h-3.5 w-3.5" /> Descartar alterações do aluno
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Descartar alterações do aluno?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A dieta no app do aluno volta para a versão publicada por você, em todos os dias. O histórico fica guardado.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={discard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Descartar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-1"><History className="h-3.5 w-3.5" /> Histórico</p>
              <ul className="space-y-0.5">
                {events.map((e) => (
                  <li key={e.id} className="text-[11px] text-muted-foreground">
                    {fmtDate(e.created_at)} — {ACTION_LABEL[e.action] ?? e.action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentDietOverridePanel;
