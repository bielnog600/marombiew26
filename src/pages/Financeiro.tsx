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
  useFinancialSummary, usePayments, useClassPackages,
  PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PACKAGE_STATUS_LABELS, PACKAGE_STATUS_COLORS,
  Payment, ClassPackage, updatePayment,
} from '@/hooks/useFinancial';
import PaymentDialog from '@/components/financial/PaymentDialog';
import PackageDialog from '@/components/financial/PackageDialog';
import {
  Plus, DollarSign, Clock, AlertTriangle, Users, CalendarDays,
  Package, TrendingUp, Search, Check, MessageCircle, RefreshCw, Copy,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  const { summary, loading: summaryLoading, refetch: refetchSummary } = useFinancialSummary();
  const { payments, loading: paymentsLoading, refetch: refetchPayments } = usePayments();
  const { packages, loading: packagesLoading, refetch: refetchPackages } = useClassPackages();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editPackage, setEditPackage] = useState<ClassPackage | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const refetchAll = () => { refetchSummary(); refetchPayments(); refetchPackages(); };

  const filteredPayments = useMemo(() => {
    let result = payments;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(p => p.student_name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter(p => p.status === statusFilter);
    return result;
  }, [payments, searchFilter, statusFilter]);

  const activePackages = useMemo(() => packages.filter(p => p.status === 'ativo'), [packages]);
  const endingPackages = useMemo(() => activePackages.filter(p => p.remaining_classes <= 2).sort((a, b) => a.remaining_classes - b.remaining_classes), [activePackages]);

  const handleMarkPaid = async (p: Payment) => {
    try {
      await updatePayment(p.id, { status: 'pago', paid_at: new Date().toISOString() } as any);
      toast.success('Marcado como pago');
      refetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleWhatsAppRenewal = (name: string, remaining: number) => {
    const msg = encodeURIComponent(`Olá ${name}, o teu pacote está quase a terminar. Restam ${remaining} aulas. Queres que eu já deixe a renovação organizada?`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const handleWhatsAppPayment = (name: string, amount: number, currency: string) => {
    const msg = encodeURIComponent(`Olá ${name}, estou a organizar os pagamentos deste mês e consta aqui o valor de ${amount}${currency} pendente. Consegues confirmar, por favor?`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const fmt = (v: number) => `€${v.toFixed(2)}`;

  return (
    <AppLayout title="Financeiro">
      <div className="space-y-6 animate-fade-in">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summaryLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : (
            <>
              <SummaryCard icon={DollarSign} label="Recebido este mês" value={fmt(summary.receivedThisMonth)} color="bg-green-500/20 text-green-400" />
              <SummaryCard icon={Clock} label="A receber" value={fmt(summary.toReceive)} color="bg-yellow-500/20 text-yellow-400" />
              <SummaryCard icon={AlertTriangle} label="Vencidos" value={fmt(summary.overdue)} color="bg-red-500/20 text-red-400" />
              <SummaryCard icon={TrendingUp} label="Total previsto" value={fmt(summary.expectedTotal)} color="bg-blue-500/20 text-blue-400" />
              <SummaryCard icon={CalendarDays} label="Aulas restantes" value={String(summary.remainingClasses)} />
              <SummaryCard icon={Check} label="Aulas no mês" value={String(summary.classesThisMonth)} />
              <SummaryCard icon={Package} label="Pacotes acabando" value={String(summary.packagesEnding)} color="bg-orange-500/20 text-orange-400" />
              <SummaryCard icon={Users} label="Alunos em atraso" value={String(summary.studentsOverdue)} color="bg-red-500/20 text-red-300" />
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setEditPayment(null); setShowPaymentDialog(true); }}><Plus className="mr-2 h-4 w-4" /> Novo Pagamento</Button>
          <Button variant="outline" onClick={() => { setEditPackage(null); setShowPackageDialog(true); }}><Package className="mr-2 h-4 w-4" /> Novo Pacote</Button>
          <Button variant="ghost" size="icon" onClick={refetchAll}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        <Tabs defaultValue="pagamentos">
          <TabsList className="bg-secondary">
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
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
              <p className="text-center text-muted-foreground py-8">Nenhum pagamento encontrado</p>
            ) : (
              <div className="space-y-2">
                {filteredPayments.map(p => (
                  <Card key={p.id} className="glass-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { setEditPayment(p); setShowPaymentDialog(true); }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{p.student_name}</span>
                            <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[p.status] || ''}`}>
                              {PAYMENT_STATUS_LABELS[p.status] || p.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {PAYMENT_TYPE_LABELS[p.type] || p.type} — {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                          </p>
                          {p.due_date && <p className="text-xs text-muted-foreground">Vencimento: {p.due_date}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-lg">{fmt(Number(p.amount))}</p>
                          <div className="flex gap-1 mt-1">
                            {p.status === 'pendente' && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleMarkPaid(p); }}>
                                <Check className="h-3 w-3 mr-1" /> Pago
                              </Button>
                            )}
                            {(p.status === 'pendente' || p.status === 'vencido') && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={e => { e.stopPropagation(); handleWhatsAppPayment(p.student_name || '', Number(p.amount), p.currency); }}>
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* REMAINING CLASSES TAB */}
          <TabsContent value="aulas" className="space-y-2">
            {packagesLoading ? <Skeleton className="h-40" /> : activePackages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum pacote ativo</p>
            ) : (
              activePackages.sort((a, b) => a.remaining_classes - b.remaining_classes).map(pkg => (
                <Card key={pkg.id} className={`glass-card ${pkg.remaining_classes <= 2 ? 'border-orange-500/30' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{pkg.student_name}</span>
                          <Badge variant="outline" className={PACKAGE_STATUS_COLORS[pkg.status]}>{PACKAGE_STATUS_LABELS[pkg.status]}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{pkg.package_name}</p>
                        <p className="text-xs text-muted-foreground">{pkg.used_classes}/{pkg.total_classes} realizadas</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-2xl font-bold ${pkg.remaining_classes === 0 ? 'text-red-400' : pkg.remaining_classes <= 2 ? 'text-orange-400' : 'text-green-400'}`}>
                          {pkg.remaining_classes}
                        </p>
                        <p className="text-xs text-muted-foreground">restantes</p>
                        {pkg.remaining_classes <= 2 && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs mt-1" onClick={() => handleWhatsAppRenewal(pkg.student_name || '', pkg.remaining_classes)}>
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
                <h3 className="font-semibold text-lg">Resumo do Mês</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Total recebido:</span> <span className="font-medium">{fmt(summary.receivedThisMonth)}</span></div>
                  <div><span className="text-muted-foreground">Total pendente:</span> <span className="font-medium">{fmt(summary.toReceive)}</span></div>
                  <div><span className="text-muted-foreground">Total vencido:</span> <span className="font-medium text-red-400">{fmt(summary.overdue)}</span></div>
                  <div><span className="text-muted-foreground">Total previsto:</span> <span className="font-medium">{fmt(summary.expectedTotal)}</span></div>
                  <div><span className="text-muted-foreground">Aulas vendidas:</span> <span className="font-medium">{activePackages.reduce((s, p) => s + p.total_classes, 0)}</span></div>
                  <div><span className="text-muted-foreground">Aulas realizadas:</span> <span className="font-medium">{summary.classesThisMonth}</span></div>
                  <div><span className="text-muted-foreground">Aulas restantes:</span> <span className="font-medium">{summary.remainingClasses}</span></div>
                  <div><span className="text-muted-foreground">Alunos em atraso:</span> <span className="font-medium text-red-400">{summary.studentsOverdue}</span></div>
                </div>

                {/* Revenue by student */}
                <h4 className="font-semibold mt-4">Receita por Aluno</h4>
                <div className="space-y-1">
                  {Object.entries(
                    payments.filter(p => p.status === 'pago').reduce((acc, p) => {
                      acc[p.student_name || 'Desconhecido'] = (acc[p.student_name || 'Desconhecido'] || 0) + Number(p.amount);
                      return acc;
                    }, {} as Record<string, number>)
                  ).sort(([, a], [, b]) => b - a).map(([name, amount]) => (
                    <div key={name} className="flex justify-between text-sm">
                      <span>{name}</span>
                      <span className="font-medium">{fmt(amount)}</span>
                    </div>
                  ))}
                </div>

                <Button variant="outline" className="w-full mt-4" onClick={() => {
                  const text = `Resumo Financeiro\nRecebido: ${fmt(summary.receivedThisMonth)}\nPendente: ${fmt(summary.toReceive)}\nVencido: ${fmt(summary.overdue)}\nPrevisto: ${fmt(summary.expectedTotal)}`;
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
      </div>
    </AppLayout>
  );
};

export default Financeiro;