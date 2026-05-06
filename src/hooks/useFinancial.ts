import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, format, subDays, addDays } from 'date-fns';

export type Payment = {
  id: string;
  student_id: string;
  admin_id: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  paid_at: string | null;
  due_date: string | null;
  notes: string;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
  student_name?: string;
};

export type ClassPackage = {
  id: string;
  student_id: string;
  admin_id: string;
  payment_id: string | null;
  package_name: string;
  total_classes: number;
  used_classes: number;
  remaining_classes: number;
  total_amount: number;
  start_date: string;
  expiry_date: string | null;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  student_name?: string;
};

export type ClassCreditLog = {
  id: string;
  student_id: string;
  package_id: string;
  calendar_event_id: string | null;
  action_type: string;
  quantity: number;
  reason: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
  created_by: string;
};

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  consultoria_online: 'Consultoria Online',
  pacote_aulas: 'Pacote de Aulas',
  aula_avulsa: 'Aula Avulsa',
  avaliacao_fisica: 'Avaliação Física',
  plano_hibrido: 'Plano Híbrido',
  outro: 'Outro',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  vencido: 'Vencido',
  parcial: 'Parcial',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pago: 'bg-green-500/20 text-green-400 border-green-500/30',
  pendente: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  vencido: 'bg-red-500/20 text-red-400 border-red-500/30',
  parcial: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cancelado: 'bg-muted text-muted-foreground border-muted',
  reembolsado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mbway: 'MB WAY',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  stripe: 'Stripe',
  outro: 'Outro',
};

export const PACKAGE_STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
  renovado: 'Renovado',
  pausado: 'Pausado',
};

export const PACKAGE_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-500/20 text-green-400 border-green-500/30',
  expirado: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelado: 'bg-muted text-muted-foreground border-muted',
  renovado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pausado: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

export function usePayments(studentId?: string) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase.from('payments').select('*').order('created_at', { ascending: false });
      if (studentId) query = query.eq('student_id', studentId);
      const { data, error } = await query;
      if (error) throw error;

      // Get student names
      const sIds = [...new Set((data || []).map(p => p.student_id))];
      const nameMap: Record<string, string> = {};
      if (sIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, nome').in('user_id', sIds);
        profiles?.forEach(p => { nameMap[p.user_id] = p.nome; });
      }

      setPayments((data || []).map(p => ({ ...p, student_name: nameMap[p.student_id] || 'Aluno' })));
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  }, [user, studentId]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  return { payments, loading, refetch: fetchPayments };
}

export function useClassPackages(studentId?: string) {
  const [packages, setPackages] = useState<ClassPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPackages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase.from('class_packages').select('*').order('created_at', { ascending: false });
      if (studentId) query = query.eq('student_id', studentId);
      const { data, error } = await query;
      if (error) throw error;

      const sIds = [...new Set((data || []).map(p => p.student_id))];
      const nameMap: Record<string, string> = {};
      if (sIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, nome').in('user_id', sIds);
        profiles?.forEach(p => { nameMap[p.user_id] = p.nome; });
      }

      setPackages((data || []).map(p => ({ ...p, student_name: nameMap[p.student_id] || 'Aluno' })));
    } catch (err) {
      console.error('Error fetching packages:', err);
    } finally {
      setLoading(false);
    }
  }, [user, studentId]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  return { packages, loading, refetch: fetchPackages };
}

export function useFinancialSummary() {
  const [summary, setSummary] = useState({
    receivedThisMonth: 0,
    toReceive: 0,
    overdue: 0,
    remainingClasses: 0,
    classesThisMonth: 0,
    packagesEnding: 0,
    studentsOverdue: 0,
    expectedTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const { data: allPayments } = await supabase.from('payments').select('*');
      const { data: allPackages } = await supabase.from('class_packages').select('*');

      const payments = allPayments || [];
      const packages = allPackages || [];

      const receivedThisMonth = payments
        .filter(p => p.status === 'pago' && p.paid_at && p.paid_at >= monthStart && p.paid_at <= monthEnd)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const toReceive = payments
        .filter(p => p.status === 'pendente')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const overdue = payments
        .filter(p => p.status === 'vencido')
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const activePackages = packages.filter(p => p.status === 'ativo');
      const remainingClasses = activePackages.reduce((sum, p) => sum + p.remaining_classes, 0);

      // Classes done this month via credits log
      const { data: creditsThisMonth } = await supabase
        .from('class_credits_log')
        .select('quantity')
        .eq('action_type', 'use_credit')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const classesThisMonth = (creditsThisMonth || []).reduce((sum, c) => sum + c.quantity, 0);

      const packagesEnding = activePackages.filter(p => p.remaining_classes <= 2).length;

      const overdueStudentIds = new Set(payments.filter(p => p.status === 'vencido').map(p => p.student_id));

      const expectedTotal = receivedThisMonth + toReceive;

      setSummary({
        receivedThisMonth,
        toReceive,
        overdue,
        remainingClasses,
        classesThisMonth,
        packagesEnding,
        studentsOverdue: overdueStudentIds.size,
        expectedTotal,
      });
    } catch (err) {
      console.error('Error fetching financial summary:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  return { summary, loading, refetch: fetch };
}

export async function createPayment(data: {
  student_id: string;
  admin_id: string;
  type: string;
  description?: string;
  amount: number;
  currency?: string;
  payment_method: string;
  status: string;
  paid_at?: string | null;
  due_date?: string | null;
  notes?: string;
  receipt_url?: string | null;
}) {
  const { data: result, error } = await supabase
    .from('payments')
    .insert(data as any)
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updatePayment(id: string, updates: Partial<Payment>) {
  const { error } = await supabase.from('payments').update(updates as any).eq('id', id);
  if (error) throw error;
}

export async function createClassPackage(data: {
  student_id: string;
  admin_id: string;
  payment_id?: string | null;
  package_name: string;
  total_classes: number;
  total_amount: number;
  start_date?: string;
  expiry_date?: string | null;
  notes?: string;
}) {
  const payload = {
    ...data,
    used_classes: 0,
    remaining_classes: data.total_classes,
    status: 'ativo',
  };
  const { data: result, error } = await supabase
    .from('class_packages')
    .insert(payload as any)
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateClassPackage(id: string, updates: Partial<ClassPackage>) {
  const { error } = await supabase.from('class_packages').update(updates as any).eq('id', id);
  if (error) throw error;
}

export async function deductClassCredit(params: {
  student_id: string;
  package_id: string;
  calendar_event_id?: string;
  reason: string;
  created_by: string;
  action_type?: string;
  quantity?: number;
}) {
  const { data: pkg } = await supabase
    .from('class_packages')
    .select('remaining_classes, used_classes')
    .eq('id', params.package_id)
    .single();
  if (!pkg) throw new Error('Pacote não encontrado');

  const qty = params.quantity || 1;
  const actionType = params.action_type || 'use_credit';
  const balanceBefore = pkg.remaining_classes;
  let balanceAfter = balanceBefore;
  let usedDelta = 0;

  if (actionType === 'use_credit') {
    balanceAfter = Math.max(0, balanceBefore - qty);
    usedDelta = qty;
  } else if (actionType === 'add_credit' || actionType === 'refund_credit') {
    balanceAfter = balanceBefore + qty;
    usedDelta = -qty;
  } else if (actionType === 'manual_adjustment') {
    balanceAfter = balanceBefore + qty; // qty can be negative
    usedDelta = -qty;
  }

  // Insert log
  await supabase.from('class_credits_log').insert({
    student_id: params.student_id,
    package_id: params.package_id,
    calendar_event_id: params.calendar_event_id || null,
    action_type: actionType,
    quantity: Math.abs(qty),
    reason: params.reason,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    created_by: params.created_by,
  } as any);

  // Update package
  await supabase.from('class_packages').update({
    remaining_classes: balanceAfter,
    used_classes: pkg.used_classes + usedDelta,
  } as any).eq('id', params.package_id);
}

export async function getStudentActivePackage(studentId: string): Promise<ClassPackage | null> {
  const { data } = await supabase
    .from('class_packages')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1);
  return (data && data.length > 0) ? data[0] as ClassPackage : null;
}