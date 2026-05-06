import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePayments, useClassPackages,
  PAYMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, PACKAGE_STATUS_LABELS, PACKAGE_STATUS_COLORS,
  Payment, ClassPackage, updatePayment, deductClassCredit,
} from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import PaymentDialog from '@/components/financial/PaymentDialog';
import PackageDialog from '@/components/financial/PackageDialog';
import { Plus, Package, Check, MessageCircle, Minus, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ClassCreditLog } from '@/hooks/useFinancial';

type Props = { studentId: string; studentName: string };

const StudentFinancialTab: React.FC<Props> = ({ studentId, studentName }) => {
  const { user } = useAuth();
  const { payments, loading: pLoading, refetch: refetchP } = usePayments(studentId);
  const { packages, loading: pkgLoading, refetch: refetchPkg } = useClassPackages(studentId);
  const [creditLogs, setCreditLogs] = useState<ClassCreditLog[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);

  const refetchAll = () => { refetchP(); refetchPkg(); fetchLogs(); };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('class_credits_log')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(50);
    setCreditLogs((data || []) as ClassCreditLog[]);
  };

  useEffect(() => { fetchLogs(); }, [studentId]);

  const activePackage = packages.find(p => p.status === 'ativo');
  const fmt = (v: number) => `€${v.toFixed(2)}`;

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
                <p className="text-2xl font-bold text-muted-foreground">€{Number(activePackage.price_per_class).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Por aula</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
              <p>Valor: €{Number(activePackage.total_amount).toFixed(2)}</p>
              <p>Pagamento: {activePackage.payment_date}</p>
              <p>Método: {PAYMENT_METHOD_LABELS[activePackage.payment_method] || activePackage.payment_method}</p>
              {activePackage.expiry_date && <p>Validade: {activePackage.expiry_date}</p>}
            </div>
            <div className="flex gap-2 mt-4">
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
      </div>

      {/* Payments History */}
      <div>
        <h3 className="font-semibold mb-2">Histórico de Pagamentos</h3>
        {pLoading ? <p className="text-muted-foreground text-sm">Carregando...</p> : payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <Card key={p.id} className="glass-card cursor-pointer" onClick={() => { setEditPayment(p); setShowPaymentDialog(true); }}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{PAYMENT_TYPE_LABELS[p.type] || p.type}</span>
                      <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[p.status]}`}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.description} — {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</p>
                    {p.due_date && <p className="text-xs text-muted-foreground">Vence: {p.due_date}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{fmt(Number(p.amount))}</p>
                    {p.status === 'pendente' && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={e => { e.stopPropagation(); handleMarkPaid(p); }}>
                        <Check className="h-3 w-3 mr-1" /> Pago
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
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
                <span className="text-muted-foreground text-xs">{new Date(log.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PaymentDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog} onSuccess={refetchAll} payment={editPayment} preselectedStudentId={studentId} />
      <PackageDialog open={showPackageDialog} onOpenChange={setShowPackageDialog} onSuccess={refetchAll} preselectedStudentId={studentId} />
    </div>
  );
};

export default StudentFinancialTab;