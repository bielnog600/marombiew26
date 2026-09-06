import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useFinancialSummary, usePayments, useClassPackages, useBillingPlans,
  PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PACKAGE_STATUS_LABELS, PACKAGE_STATUS_COLORS,
  Payment, ClassPackage, StudentBillingPlan, updatePayment, generateRecurringCharges,
  useNextClasses,
} from '@/hooks/useFinancial';
import PaymentDialog from '@/components/financial/PaymentDialog';
import PackageDialog from '@/components/financial/PackageDialog';
import BillingPlanDialog from '@/components/financial/BillingPlanDialog';
import {
  formatMoney, formatMoneyByCurrency, effectivePaymentStatus, monthKey, monthLabel,
  recentMonthKeys, monthRange, isDueSoon, daysUntilDue,
  BILLING_SERVICE_LABELS, BILLING_PLAN_STATUS_LABELS, BILLING_PLAN_STATUS_COLORS,
  planIsDueInMonth, planDueDateForMonth, packageIsRelevantInMonth, paymentVisibleInMonth,
  receivedByStudentInMonth, formatNextClassLabel,
} from '@/lib/financial';
import {
  Plus, DollarSign, Clock, AlertTriangle, Users, CalendarDays,
  Package, TrendingUp, Search, Check, MessageCircle, RefreshCw, Copy, Repeat, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';

const SummaryCard = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color?: string }) => (
  <Card className="glass-card">
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color || 'bg-primary/20 text-primary'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const Financeiro: React.FC = () => {
  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const monthOptions = useMemo(() => recentMonthKeys(today, 12), [today]);

  const { summary, loading: summaryLoading, refetch: refetchSummary } = useFinancialSummary(selectedMonth);
  const { payments, loading: paymentsLoading, refetch: refetchPayments } = usePayments();
  const { packages, loading: packagesLoading, refetch: refetchPackages } = useClassPackages();
  const { plans, loading: plansLoading, refetch: refetchPlans } = useBillingPlans();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editPackage, setEditPackage] = useState<ClassPackage | null>(null);
  const [editPlan, setEditPlan] = useState<StudentBillingPlan | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [generating, setGenerating] = useState(false);

  const refetchAll = () => { refetchSummary(); refetchPayments(); refetchPackages(); refetchPlans(); };

  const range = useMemo(() => monthRange(selectedMonth), [selectedMonth]);

  /** Pagamentos do mês: reference_month → due_date → paid_at → created_at (fallback). */
  const monthPayments = useMemo(
    () => payments.filter(p => paymentVisibleInMonth(p as any, selectedMonth)),
    [payments, selectedMonth],
  );

  const monthPackages = useMemo(
    () => packages.filter(pkg => packageIsRelevantInMonth(pkg, selectedMonth)),
    [packages, selectedMonth],
  );

  const nextClassStudentIds = useMemo(
    () => monthPackages.filter(p => p.status === 'ativo' && p.remaining_classes > 0).map(p => p.student_id),
    [monthPackages],
  );
  const nextClasses = useNextClasses(nextClassStudentIds);

  const receivedByStudent = useMemo(
    () => receivedByStudentInMonth(payments as any, packages as any, selectedMonth),
    [payments, packages, selectedMonth],
  );

  const filteredPayments = useMemo(() => {
    let result = monthPayments;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(p => p.student_name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter(p => effectivePaymentStatus(p, today) === statusFilter);
    return result;
  }, [monthPayments, searchFilter, statusFilter, today]);

  const handleMarkPaid = async (p: Payment) => {
    try {
      await updatePayment(p.id, { status: 'pago', paid_at: new Date().toISOString() } as any);
      toast.success('Marcado como pago');
      refetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const created = await generateRecurringCharges(selectedMonth);
      toast.success(created > 0
        ? `${created} cobrança(s) criada(s) para ${monthLabel(selectedMonth)}`
        : `Nenhuma cobrança nova — ${monthLabel(selectedMonth)} já estava em dia`);
      refetchAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleWhatsAppRenewal = (name: string, remaining: number) => {
    const msg = encodeURIComponent(`Olá ${name}, o teu pacote está quase a terminar. Restam ${remaining} aulas. Queres que eu já deixe a renovação organizada?`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const handleWhatsAppPayment = (p: Payment) => {
    const msg = encodeURIComponent(`Olá ${p.student_name}, estou a organizar os pagamentos e consta aqui o valor de ${formatMoney(p.amount, p.currency)} por regularizar. Consegues confirmar, por favor?`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const pendingPlansThisMonth = useMemo(() => plans.filter(pl =>
    planIsDueInMonth(pl, selectedMonth)
    && !payments.some(p => p.billing_plan_id === pl.id && p.reference_month === selectedMonth),
  ), [plans, payments, selectedMonth]);

  return (
    <AppLayout title="Financeiro">
      <div className="space-y-6 animate-fade-in">
        {/* Month selector */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={refetchAll}><RefreshCw className="h-4 w-4" /></Button>
          <p className="text-xs text-muted-foreground">Valores em euros e reais são somados separadamente.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summaryLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
            <>
              <SummaryCard icon={DollarSign} label={`Recebido em ${monthLabel(selectedMonth)}`} value={formatMoneyByCurrency(summary.received)} color="bg-green-500/20 text-green-400" />
              <SummaryCard icon={Clock} label="A receber" value={formatMoneyByCurrency(summary.toReceive)} sub={`${formatMoneyByCurrency(summary.dueSoon)} vence em 7 dias`} color="bg-yellow-500/20 text-yellow-400" />
              <SummaryCard icon={AlertTriangle} label="Vencidos" value={formatMoneyByCurrency(summary.overdue)} color="bg-red-500/20 text-red-400" />
              <SummaryCard icon={TrendingUp} label="Total previsto" value={formatMoneyByCurrency(summary.expectedTotal)} color="bg-blue-500/20 text-blue-400" />
              <SummaryCard icon={Repeat} label="Planos recorrentes" value={String(summary.recurringActive)} sub={`${formatMoneyByCurrency(summary.recurringExpected)}/mês`} color="bg-purple-500/20 text-purple-300" />
              <SummaryCard icon={Check} label="Aulas realizadas no mês" value={String(summary.classesThisMonth)} sub={`${summary.totalClassesUsed} no total`} />
              <SummaryCard icon={CalendarDays} label="Aulas restantes" value={summary.balanceIsCurrent ? String(summary.remainingClasses) : '—'} sub={summary.balanceIsCurrent ? undefined : 'Saldo histórico não disponível'} color="bg-blue-500/20 text-blue-400" />
              <SummaryCard icon={Package} label="Pacotes ativos" value={String(summary.activePackagesCount)} sub={`${summary.packagesEnding} a acabar`} color="bg-green-500/20 text-green-400" />
              <SummaryCard icon={CalendarDays} label="Aulas vendidas" value={String(summary.totalClassesSold)} />
              <SummaryCard icon={Package} label="Pacotes esgotados" value={String(summary.exhaustedPackages)} color="bg-red-500/20 text-red-400" />
              <SummaryCard icon={Users} label="Alunos em atraso" value={String(summary.studentsOverdue)} color="bg-red-500/20 text-red-300" />
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setEditPayment(null); setShowPaymentDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Novo Pagamento</Button>
          <Button variant="outline" onClick={() => { setEditPackage(null); setShowPackageDialog(true); }}><Package className="mr-2 h-4 w-4" /> Novo Pacote</Button>
          <Button variant="outline" onClick={() => { setEditPlan(null); setShowPlanDialog(true); }}><Repeat className="mr-2 h-4 w-4" /> Novo Plano Recorrente</Button>
          <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
            <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} /> Gerar cobranças do mês
          </Button>
        </div>

        <Tabs defaultValue="pagamentos">
          <TabsList className="bg-secondary">
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            <TabsTrigger value="recorrentes">Recorrentes</TabsTrigger>
            <TabsTrigger value="aulas">Aulas Restantes</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          </TabsList>

          {/* PAYMENTS TAB */}
          <TabsContent value="pagamentos" className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar aluno..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {paymentsLoading ? <Skeleton className="h-40" /> : filteredPayments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum pagamento em {monthLabel(selectedMonth)}</p>
            ) : (
              <div className="space-y-2">
                {filteredPayments.map(p => {
                  const status = effectivePaymentStatus(p, today);
                  const dueIn = daysUntilDue(p.due_date, today);
                  return (
                    <Card key={p.id} className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { setEditPayment(p); setShowPaymentDialog(true); }}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{p.student_name}</span>
                              <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[status] || ''}`}>
                                {PAYMENT_STATUS_LABELS[status] || status}
                              </Badge>
                              {p.billing_plan_id && (
                                <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">Recorrente</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {PAYMENT_TYPE_LABELS[p.type] || p.type} — {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                            </p>
                            {p.due_date && (
                              <p className={`text-xs ${status === 'vencido' ? 'text-red-400' : isDueSoon(p.due_date, today) ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                Vencimento: {p.due_date}
                                {dueIn !== null && status !== 'pago' && (dueIn < 0 ? ` — ${Math.abs(dueIn)} dia(s) em atraso` : ` — em ${dueIn} dia(s)`)}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-lg">{formatMoney(p.amount, p.currency)}</p>
                            <div className="flex gap-1 mt-1">
                              {status !== 'pago' && status !== 'cancelado' && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleMarkPaid(p); }}>
                                    <Check className="h-3 w-3 mr-1" /> Pago
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleWhatsAppPayment(p); }}>
                                    <MessageCircle className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* RECURRING TAB */}
          <TabsContent value="recorrentes" className="space-y-3">
            {pendingPlansThisMonth.length > 0 && (
              <Card className="glass-card border-yellow-500/30">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {pendingPlansThisMonth.length} plano(s) sem cobrança em {monthLabel(selectedMonth)}
                    </p>
                    <p className="text-xs text-muted-foreground">Gerar cobranças não duplica o que já existe.</p>
                  </div>
                  <Button size="sm" onClick={handleGenerate} disabled={generating}>Gerar</Button>
                </CardContent>
              </Card>
            )}

            {plansLoading ? <Skeleton className="h-40" /> : plans.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum plano recorrente criado</p>
            ) : plans.map(pl => {
              const charged = payments.find(p => p.billing_plan_id === pl.id && p.reference_month === selectedMonth);
              return (
                <Card key={pl.id} className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { setEditPlan(pl); setShowPlanDialog(true); }}>
                  <CardContent className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{pl.student_name}</span>
                        <Badge variant="outline" className={`text-xs ${BILLING_PLAN_STATUS_COLORS[pl.status]}`}>
                          {BILLING_PLAN_STATUS_LABELS[pl.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {BILLING_SERVICE_LABELS[pl.service_type] || pl.service_type} — vence dia {pl.due_day}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {planIsDueInMonth(pl, selectedMonth)
                          ? charged
                            ? `Cobrança de ${monthLabel(selectedMonth)} criada (${PAYMENT_STATUS_LABELS[effectivePaymentStatus(charged, today)]})`
                            : `Sem cobrança em ${monthLabel(selectedMonth)} — vencimento ${planDueDateForMonth(pl, selectedMonth)}`
                          : `Não vigente em ${monthLabel(selectedMonth)}`}
                      </p>
                    </div>
                    <p className="font-bold text-lg shrink-0">{formatMoney(pl.amount, pl.currency)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* REMAINING CLASSES TAB */}
          <TabsContent value="aulas" className="space-y-2">
            {packagesLoading ? <Skeleton className="h-40" /> : monthPackages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum pacote vigente em {monthLabel(selectedMonth)}</p>
            ) : (
              [...monthPackages].sort((a, b) => {
                const order: Record<string, number> = { ativo: 0, esgotado: 1, expirado: 2, pausado: 3, cancelado: 4, renovado: 5 };
                return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.remaining_classes - b.remaining_classes;
              }).map(pkg => (
                <Card key={pkg.id} className={`glass-card ${pkg.remaining_classes <= 2 && pkg.status === 'ativo' ? 'border-orange-500/30' : ''}`} onClick={() => { setEditPackage(pkg); setShowPackageDialog(true); }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{pkg.student_name}</span>
                          <Badge variant="outline" className={PACKAGE_STATUS_COLORS[pkg.status]}>{PACKAGE_STATUS_LABELS[pkg.status]}</Badge>
                          {pkg.payment_status === 'pendente' && (
                            <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pgto Pendente</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{pkg.package_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {pkg.used_classes}/{pkg.total_classes} realizadas • {formatMoney(pkg.total_amount, pkg.currency)} • {formatMoney(pkg.price_per_class, pkg.currency)}/aula
                        </p>
                        {pkg.status === 'ativo' && pkg.remaining_classes > 0 && (
                          <p className={`text-xs mt-1 flex items-center gap-1 ${nextClasses[pkg.student_id] ? 'text-muted-foreground' : 'text-orange-400'}`}>
                            <CalendarClock className="h-3 w-3" />
                            {nextClasses[pkg.student_id]
                              ? `Próxima aula: ${formatNextClassLabel(nextClasses[pkg.student_id])}`
                              : 'Próxima aula: não agendada'}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-2xl font-bold ${pkg.remaining_classes === 0 ? 'text-red-400' : pkg.remaining_classes <= 2 ? 'text-orange-400' : 'text-green-400'}`}>
                          {pkg.remaining_classes}
                        </p>
                        <p className="text-xs text-muted-foreground">restantes</p>
                        {pkg.remaining_classes <= 2 && pkg.status === 'ativo' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs mt-1" onClick={e => { e.stopPropagation(); handleWhatsAppRenewal(pkg.student_name || '', pkg.remaining_classes); }}>
                            <MessageCircle className="h-3 w-3 mr-1" /> Renovar
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* REPORT TAB */}
          <TabsContent value="relatorio" className="space-y-4">
            <Card className="glass-card">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold text-lg">Resumo de {monthLabel(selectedMonth)}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Recebido:</span> <span className="font-medium">{formatMoneyByCurrency(summary.received)}</span></div>
                  <div><span className="text-muted-foreground">A receber:</span> <span className="font-medium">{formatMoneyByCurrency(summary.toReceive)}</span></div>
                  <div><span className="text-muted-foreground">Vencido:</span> <span className="font-medium text-red-400">{formatMoneyByCurrency(summary.overdue)}</span></div>
                  <div><span className="text-muted-foreground">Total previsto:</span> <span className="font-medium">{formatMoneyByCurrency(summary.expectedTotal)}</span></div>
                  <div><span className="text-muted-foreground">Aulas realizadas no mês:</span> <span className="font-medium">{summary.classesThisMonth}</span></div>
                  <div><span className="text-muted-foreground">Aulas restantes:</span> <span className="font-medium">{summary.balanceIsCurrent ? summary.remainingClasses : '—'}</span></div>
                  <div><span className="text-muted-foreground">Pacotes ativos:</span> <span className="font-medium">{summary.activePackagesCount}</span></div>
                  <div><span className="text-muted-foreground">Alunos em atraso:</span> <span className="font-medium text-red-400">{summary.studentsOverdue}</span></div>
                </div>
                {!summary.balanceIsCurrent && (
                  <p className="text-xs text-muted-foreground">
                    O saldo de aulas é sempre o saldo atual: não existe registo histórico de saldo, por isso não é mostrado em meses passados.
                  </p>
                )}

                <h4 className="font-semibold mt-4">Recebido por Aluno no mês</h4>
                <div className="space-y-1">
                  {receivedByStudent.map(r => (
                    <div key={`${r.name}|${r.currency}`} className="flex justify-between text-sm">
                      <span>{r.name}</span>
                      <span className="font-medium">{formatMoney(r.amount, r.currency)}</span>
                    </div>
                  ))}
                  {receivedByStudent.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum recebimento neste mês.</p>
                  )}
                </div>

                <Button variant="outline" className="w-full mt-4" onClick={() => {
                  const text = [
                    `Resumo Financeiro — ${monthLabel(selectedMonth)}`,
                    `Recebido: ${formatMoneyByCurrency(summary.received)}`,
                    `A receber: ${formatMoneyByCurrency(summary.toReceive)}`,
                    `Vencido: ${formatMoneyByCurrency(summary.overdue)}`,
                    `Previsto: ${formatMoneyByCurrency(summary.expectedTotal)}`,
                  ].join('\n');
                  navigator.clipboard.writeText(text);
                  toast.success('Resumo copiado');
                }}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar Resumo
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <PaymentDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog} onSuccess={refetchAll} payment={editPayment} />
        <PackageDialog open={showPackageDialog} onOpenChange={setShowPackageDialog} onSuccess={refetchAll} pkg={editPackage} />
        <BillingPlanDialog open={showPlanDialog} onOpenChange={setShowPlanDialog} onSuccess={refetchAll} plan={editPlan} />
      </div>
    </AppLayout>
  );
};

export default Financeiro;
