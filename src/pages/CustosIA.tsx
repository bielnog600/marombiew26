import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, CalendarRange, Coins, TrendingUp, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  attributedStudent, dayKey, formatMoney, periodRange, premiumMargin, projectMonth, summarizeAiUsage, usdToEur,
  type AiUsageRow, type PeriodKind,
} from '@/lib/aiCosts';
import { loadEurRate, loadUsageSince, saveEurRate } from '@/components/admin/aiCosts/aiCostsApi';
import AiPriceTable from '@/components/admin/aiCosts/AiPriceTable';

const db = supabase as any;
const ALL = 'todos';
const PERIODS: { key: PeriodKind; label: string }[] = [
  { key: 'hoje', label: 'Hoje' }, { key: '7d', label: '7 dias' }, { key: 'mes', label: 'Mês' }, { key: 'custom', label: 'Personalizado' },
];

const Stat = ({ icon: Icon, label, usd, rate, sub }: { icon: any; label: string; usd: number | null; rate: number; sub?: string }) => (
  <Card className="glass-card">
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums">{usd == null ? '—' : formatMoney(usd, 'USD')}</p>
          {usd != null && <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(usdToEur(usd, rate), 'EUR')}</p>}
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

/** "Custos de IA": what each AI feature costs, per use and per student, to price the plans. */
export default function CustosIA() {
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState<PeriodKind>('mes');
  const today = dayKey(new Date());
  const [custom, setCustom] = useState({ from: today, to: today });
  const student = params.get('aluno') ?? ALL;
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);
  const [students, setStudents] = useState<{ id: string; nome: string; premium: boolean }[]>([]);
  const [rate, setRate] = useState<number>(0);
  const [rateDraft, setRateDraft] = useState('');
  const [priceEur, setPriceEur] = useState('15');
  const [now] = useState(() => new Date());

  const range = useMemo(() => periodRange(period, now, custom), [period, now, custom]);
  const loadFrom = useMemo(() => {
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    return range.from < month ? range.from : month;
  }, [range.from, now]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    loadUsageSince(loadFrom).then((list) => { if (!cancelled) setRows(list); })
      .catch(() => { if (!cancelled) { setRows([]); toast.error('Não foi possível carregar os custos.'); } });
    return () => { cancelled = true; };
  }, [loadFrom]);

  useEffect(() => {
    loadEurRate().then((r) => { setRate(r); setRateDraft(String(r).replace('.', ',')); });
    (async () => {
      const { data: sp } = await db.from('students_profile').select('user_id, premium_scale, premium_camera');
      const ids = ((sp ?? []) as any[]).map((s) => s.user_id);
      const { data: profs } = ids.length ? await db.from('profiles').select('user_id, nome').in('user_id', ids) : { data: [] };
      const names = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.nome as string]));
      setStudents(((sp ?? []) as any[]).map((s) => ({ id: s.user_id, nome: names.get(s.user_id) || 'Aluno', premium: !!(s.premium_scale || s.premium_camera) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')));
    })();
  }, []);

  const nameOf = useMemo(() => new Map(students.map((s) => [s.id, s.nome])), [students]);
  const premiumIds = useMemo(() => students.filter((s) => s.premium).map((s) => s.id), [students]);
  const scoped = useMemo(() => (rows ?? []).filter((r) => student === ALL || attributedStudent(r) === student), [rows, student]);
  const summary = useMemo(() => summarizeAiUsage(scoped, { ...range, premiumIds: student === ALL ? premiumIds : premiumIds.filter((id) => id === student) }), [scoped, range, premiumIds, student]);
  const projection = useMemo(() => projectMonth(scoped, now), [scoped, now]);
  const margin = premiumMargin(Number(priceEur.replace(',', '.')), summary.avgPerPremiumStudentMonthUsd ?? 0, rate);

  const setStudent = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === ALL) next.delete('aluno'); else next.set('aluno', v);
    setParams(next, { replace: true });
  };
  const saveRate = async () => {
    const n = Number(rateDraft.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { toast.error('Taxa inválida.'); return; }
    if (await saveEurRate(n)) { setRate(n); toast.success('Taxa salva.'); } else toast.error('Não foi possível salvar a taxa.');
  };

  return (
    <AppLayout title="Custos de IA">
      <div className="space-y-4 animate-fade-in pb-6">
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
              {PERIODS.map((p) => (
                <Button key={p.key} size="sm" variant={period === p.key ? 'default' : 'outline'} onClick={() => setPeriod(p.key)} aria-pressed={period === p.key}>
                  {p.label}
                </Button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <Input type="date" className="h-9 w-auto" value={custom.from} max={today} aria-label="De" onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <span className="text-muted-foreground">até</span>
                <Input type="date" className="h-9 w-auto" value={custom.to} max={today} aria-label="Até" onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </div>
            )}
            <Select value={student} onValueChange={setStudent}>
              <SelectTrigger className="h-9 w-full sm:w-72" aria-label="Aluno"><SelectValue placeholder="Todos os alunos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os alunos</SelectItem>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}{s.premium ? ' · Premium' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {!rows ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ai-cost-cards">
              <Stat icon={Coins} label="Gasto no período" usd={summary.totalUsd} rate={rate}
                sub={`${summary.uses} usos · ${summary.calls} chamadas${summary.errors ? ` · ${summary.errors} com erro` : ''}`} />
              <Stat icon={TrendingUp} label="Projeção do mês" usd={projection.projectedUsd} rate={rate}
                sub={`${formatMoney(projection.spentUsd, 'USD')} em ${projection.elapsedDays} de ${projection.daysInMonth} dias`} />
              <Stat icon={Users} label="Médio por aluno ativo / mês" usd={summary.activeStudents ? summary.avgPerActiveStudentMonthUsd : null} rate={rate}
                sub={`${summary.activeStudents} aluno(s) com uso no período`} />
              <Stat icon={Users} label="Médio por aluno Premium / mês" usd={summary.avgPerPremiumStudentMonthUsd} rate={rate}
                sub={`${summary.premiumStudents} aluno(s) Premium`} />
            </div>
            {summary.unpricedCalls > 0 && (
              <p className="text-xs text-primary">{summary.unpricedCalls} chamada(s) de um modelo sem preço na tabela abaixo — contam como 0 até você cadastrar o preço.</p>
            )}

            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="font-semibold mb-3">Gasto por dia</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.daily.map((d) => ({ ...d, label: d.day.slice(8, 10) + '/' + d.day.slice(5, 7) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={48} />
                      <Tooltip formatter={(v: number) => [`${formatMoney(v, 'USD')} · ${formatMoney(usdToEur(v, rate), 'EUR')}`, 'Gasto']}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Bar dataKey="costUsd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="font-semibold mb-3">Por funcionalidade</p>
                {summary.byFeature.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum uso de IA no período.</p> : (
                  <div className="space-y-2" data-testid="ai-cost-features">
                    {summary.byFeature.map((f) => (
                      <div key={f.feature} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/50 pb-2 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{f.label}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {f.uses} {f.uses === 1 ? f.unit : `${f.unit}s`} · médio {formatMoney(f.avgPerUseUsd, 'USD')} ({formatMoney(usdToEur(f.avgPerUseUsd, rate), 'EUR')}) por {f.unit}
                          </p>
                        </div>
                        <p className="text-sm font-semibold tabular-nums">{formatMoney(f.costUsd, 'USD')} <span className="text-xs font-normal text-muted-foreground">{formatMoney(usdToEur(f.costUsd, rate), 'EUR')}</span></p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {student === ALL && (
              <Card className="glass-card">
                <CardContent className="p-4">
                  <p className="font-semibold mb-1">Alunos por gasto</p>
                  <p className="text-xs text-muted-foreground mb-3">Inclui o que o aluno usou e o que você gerou para ele.</p>
                  {summary.byStudent.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aluno com uso no período.</p> : (
                    <div className="space-y-1.5">
                      {summary.byStudent.slice(0, 15).map((s, i) => (
                        <button key={s.studentId} type="button" onClick={() => setStudent(s.studentId)}
                          className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-secondary">
                          <span className="text-sm min-w-0 truncate"><span className="text-muted-foreground tabular-nums mr-2">{i + 1}.</span>{nameOf.get(s.studentId) ?? 'Aluno'}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{s.uses} usos · <span className="text-foreground font-medium">{formatMoney(s.costUsd, 'USD')}</span> · {formatMoney(usdToEur(s.costUsd, rate), 'EUR')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /><p className="font-semibold">Calculadora de margem</p></div>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  Se cobrar
                  <Input inputMode="decimal" className="h-9 w-24" value={priceEur} onChange={(e) => setPriceEur(e.target.value)} aria-label="Preço por aluno premium (€/mês)" />
                  € por mês por aluno Premium:
                </label>
                <div className="text-sm space-y-1" data-testid="ai-cost-margin">
                  <p>Custo médio de IA por aluno Premium: <strong className="tabular-nums">{formatMoney(margin.costEur, 'EUR')}</strong> / mês</p>
                  <p>Margem: <strong className={`tabular-nums ${margin.marginEur < 0 ? 'text-destructive' : 'text-primary'}`}>{formatMoney(margin.marginEur, 'EUR')}</strong>{margin.marginPct != null && <span className="text-muted-foreground"> ({Math.round(margin.marginPct)}%)</span>}</p>
                  {summary.avgPerPremiumStudentMonthUsd == null && <p className="text-xs text-muted-foreground">Nenhum aluno Premium ainda — o custo fica 0.</p>}
                  <p className="text-xs text-muted-foreground">Média do período escolhido, levada a 30 dias. Só o custo de IA; não inclui outros custos.</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="glass-card">
          <CardContent className="p-4 flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">1 US$ em euros</span>
              <Input inputMode="decimal" className="h-9 w-28" value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} aria-label="Taxa do dólar em euros" />
            </label>
            <Button size="sm" variant="outline" className="h-9" onClick={saveRate}>Salvar taxa</Button>
            <p className="text-xs text-muted-foreground basis-full">Taxa de referência do BCE em 12/11/2026 já preenchida; ajuste quando quiser.</p>
          </CardContent>
        </Card>

        <AiPriceTable />
      </div>
    </AppLayout>
  );
}
