import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePayments, useClassPackages, useBillingPlans,
  PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PACKAGE_STATUS_LABELS, PACKAGE_STATUS_COLORS,
  Payment, ClassPackage, StudentBillingPlan, updatePayment, deductClassCredit,
} from '@/hooks/useFinancial';
import {
  formatMoney, effectivePaymentStatus, isDueSoon,
  BILLING_SERVICE_LABELS, BILLING_PLAN_STATUS_LABELS, BILLING_PLAN_STATUS_COLORS,
} from '@/lib/financial';
import { supabase } from '@/integrations/supabase/client';
import PaymentDialog from '@/components/financial/PaymentDialog';
import PackageDialog from '@/components/financial/PackageDialog';
import BillingPlanDialog from '@/components/financial/BillingPlanDialog';
import ManualClassDialog from '@/components/financial/ManualClassDialog';
import { Plus, Package, Check, Minus, RefreshCw, AlertTriangle, Repeat, CalendarPlus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ClassCreditLog } from '@/hooks/useFinancial';

type Props = { studentId: string; studentName: string };

const StudentFinancialTab: React.FC<Props> = ({ studentId, studentName }) => {
  const { user } = useAuth();
  const today = new Date();
  const { payments, loading: pLoading, refetch: refetchP } = usePayments(studentId);
  const { packages, loading: pkgLoading, refetch: refetchPkg } = useClassPackages(studentId);
  const { plans, refetch: refetchPlans } = useBillingPlans(studentId);
  const [creditLogs, setCreditLogs] = useState<ClassCreditLog[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [manualMode, setManualMode] = useState<'register' | 'refund' | null>(null);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editPlan, setEditPlan] = useState<StudentBillingPlan | null>(null);

  const refetchAll = () => { refetchP(); refetchPkg(); refetchPlans(); fetchLogs(); };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('class_credits_log')
      .select('*')
      .eq('student_id', studentId)
      .order('occurred_at', { ascending: false })
      .limit(50);
    setCreditLogs((data || []) as unknown as ClassCreditLog[]);
  };

  useEffect(() => { fetchLogs(); }, [studentId]);

  const activePackage = packages.find(p => p.status === 'ativo');

  const handleMarkPaid = async (p: Payment) => {
    await updatePayment(p.id, { status: 'pago', paid_at: new Date().toISOString() } as any);
    toast.success('Marcado como pago');
    refetchAll();
  };

  const handleAdjustCredits = async (pkg: ClassPackage, delta: number) => {
    const reason = delta > 0 ? 'Ajuste manual: adição' : 'Ajuste manual: remoção';
    await deductClassCredit({
      student_id: studentId,
      package_id: pkg.id,
      reason,
      created_by: user!.id,
      action_type: 'manual_adjustment',
      quantity: delta,
    });
    toast.success(`Saldo ajustado em ${delta > 0 ? '+' : ''}${delta}`);
    refetchAll();
  };

  return (
    <div className="space-y-6">
      {/* Active Package Summary */}
      {activePackage ? (
        <Card className="glass-card border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{activePackage.package_name}</h3>
              <Badge variant="outline" className={PACKAGE_STATUS_COLORS[activePackage.status]}>{PACKAGE_STATUS_LABELS[activePackage.status]}</Badge>
            </div>
            {activePackage.payment_status === 'pendente' && (
              <div className="flex items-center gap-2 mb-3 text-yellow-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                Pagamento pendente
              </div>
            )}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{activePackage.remaining_classes}</p>
                <p className="text-xs text-muted-foreground">Restantes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{activePackage.used_classes}</p>
                <p className="text-xs text-muted-foreground">Realizadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{activePackage.total_classes}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{formatMoney(activePackage.price_per_class, activePackage.currency)}</p>
                <p className="text-xs text-muted-foreground">Por aula</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
              <p>Valor: {formatMoney(activePackage.total_amount, activePackage.currency)}</p>
              <p>Pagamento: {activePackage.payment_date}</p>
              <p>Método: {PAYMENT_METHOD_LABELS[activePackage.payment_method] || activePackage.payment_method}</p>
              {activePackage.expiry_date && <p>Validade: {activePackage.expiry_date}</p>}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => setManualMode('register')}>
                <CalendarPlus className="h-3 w-3 mr-1" /> Registar aula
              </Button>
              <Button size="sm" variant="outline" onClick={() => setManualMode('refund')}>
                <Undo2 className="h-3 w-3 mr-1" /> Estornar
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAdjustCredits(activePackage, 1)}>
                <Plus className="h-3 w-3 mr-1" /> Aula
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleAdjustCredits(activePackage, -1)}>
                <Minus className="h-3 w-3 mr-1" /> Aula
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowPackageDialog(true); }}>
                <RefreshCw className="h-3 w-3 mr-1" /> Renovar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-yellow-500/30">
          <CardContent className="p-5 text-center">
            <p className="text-muted-foreground">Nenhum pacote ativo</p>
            <Button size="sm" className="mt-2" onClick={() => setShowPackageDialog(true)}>
              <Package className="h-4 w-4 mr-2" /> Criar Pacote
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { setEditPayment(null); setShowPaymentDialog(true); }}><Plus className="mr-1 h-4 w-4" /> Pagamento</Button>
        <Button size="sm" variant="outline" onClick={() => setShowPackageDialog(true)}><Package className="mr-1 h-4 w-4" /> Pacote</Button>
        <Button size="sm" variant="outline" onClick={() => { setEditPlan(null); setShowPlanDialog(true); }}><Repeat className="mr-1 h-4 w-4" /> Plano recorrente</Button>
      </div>

      {/* Recurring plans */}
      {plans.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Planos Recorrentes</h3>
          <div className="space-y-2">
            {plans.map(pl => (
              <Card key={pl.id} className="glass-card cursor-pointer" onClick={() => { setEditPlan(pl); setShowPlanDialog(true); }}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{BILLING_SERVICE_LABELS[pl.service_type] || pl.service_type}</span>
                      <Badge variant="outline" className={`text-xs ${BILLING_PLAN_STATUS_COLORS[pl.status]}`}>{BILLING_PLAN_STATUS_LABELS[pl.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Mensal — vence dia {pl.due_day}</p>
                  </div>
                  <p className="font-bold">{formatMoney(pl.amount, pl.currency)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Payments History */}
      <div>
        <h3 className="font-semibold mb-2">Histórico de Pagamentos</h3>
        {pLoading ? <p className="text-muted-foreground text-sm">Carregando...</p> : payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
        ) : (
          <div className="space-y-2">
            {payments.map(p => {
              const status = effectivePaymentStatus(p, today);
              return (
                <Card key={p.id} className="glass-card cursor-pointer" onClick={() => { setEditPayment(p); setShowPaymentDialog(true); }}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{PAYMENT_TYPE_LABELS[p.type] || p.type}</span>
                        <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[status]}`}>{PAYMENT_STATUS_LABELS[status]}</Badge>
                        {p.billing_plan_id && <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">Recorrente</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{p.description} — {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</p>
                      {p.due_date && (
                        <p className={`text-xs ${status === 'vencido' ? 'text-red-400' : isDueSoon(p.due_date, today) ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                          Vence: {p.due_date}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMoney(p.amount, p.currency)}</p>
                      {status !== 'pago' && status !== 'cancelado' && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={e => { e.stopPropagation(); handleMarkPaid(p); }}>
                          <Check className="h-3 w-3 mr-1" /> Pago
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Credits Log */}
      {creditLogs.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Histórico de Créditos</h3>
          <div className="space-y-1">
            {creditLogs.map(log => (
              <div key={log.id} className="flex justify-between text-sm py-1 border-b border-border/50">
                <div>
                  <span className={log.action_type === 'use_credit' ? 'text-red-400' : 'text-green-400'}>
                    {log.action_type === 'use_credit' ? '-' : '+'}{log.quantity}
                  </span>
                  <span className="ml-2 text-muted-foreground">{log.reason}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(log.occurred_at || log.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PaymentDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog} onSuccess={refetchAll} payment={editPayment} preselectedStudentId={studentId} />
      <PackageDialog open={showPackageDialog} onOpenChange={setShowPackageDialog} onSuccess={refetchAll} preselectedStudentId={studentId} />
      <BillingPlanDialog open={showPlanDialog} onOpenChange={setShowPlanDialog} onSuccess={refetchAll} plan={editPlan} preselectedStudentId={studentId} />
      <ManualClassDialog
        open={manualMode !== null}
        onOpenChange={(v) => { if (!v) setManualMode(null); }}
        onSuccess={refetchAll}
        studentId={studentId}
        studentName={studentName}
        packages={packages}
        mode={manualMode || 'register'}
      />
    </div>
  );
};

export default StudentFinancialTab;
