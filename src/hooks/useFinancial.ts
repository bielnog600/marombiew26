import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, format, subDays, addDays } from 'date-fns';
import {
  Currency, MoneyByCurrency, emptyMoney, addMoney, effectivePaymentStatus,
  monthKey, monthRange, normalizeCurrency, packageCountsAsOwnRevenue,
  packageIsEnding, packageCanBeDeleted, isDueSoon, formatMoney,
} from '@/lib/financial';

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
  billing_plan_id: string | null;
  reference_month: string | null;
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
  price_per_class: number;
  start_date: string;
  expiry_date: string | null;
  payment_date: string;
  payment_method: string;
  payment_status: string;
  status: string;
  notes: string;
  currency: string;
  created_at: string;
  updated_at: string;
  student_name?: string;
};

export type StudentBillingPlan = {
  id: string;
  student_id: string;
  admin_id: string;
  service_type: string;
  description: string;
  amount: number;
  currency: string;
  billing_frequency: string;
  due_day: number;
  start_date: string;
  end_date: string | null;
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
  occurred_at: string;
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
  esgotado: 'Esgotado',
};

export const PACKAGE_STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-500/20 text-green-400 border-green-500/30',
  expirado: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelado: 'bg-muted text-muted-foreground border-muted',
  renovado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pausado: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  esgotado: 'bg-red-500/20 text-red-400 border-red-500/30',
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

export type FinancialSummary = {
  monthKey: string;
  received: MoneyByCurrency;
  toReceive: MoneyByCurrency;
  overdue: MoneyByCurrency;
  expectedTotal: MoneyByCurrency;
  dueSoon: MoneyByCurrency;
  remainingClasses: number;
  classesThisMonth: number;
  packagesEnding: number;
  studentsOverdue: number;
  totalClassesSold: number;
  totalClassesUsed: number;
  activePackagesCount: number;
  exhaustedPackages: number;
  recurringActive: number;
  recurringExpected: MoneyByCurrency;
};

function emptySummary(key: string): FinancialSummary {
  return {
    monthKey: key,
    received: emptyMoney(),
    toReceive: emptyMoney(),
    overdue: emptyMoney(),
    expectedTotal: emptyMoney(),
    dueSoon: emptyMoney(),
    remainingClasses: 0,
    classesThisMonth: 0,
    packagesEnding: 0,
    studentsOverdue: 0,
    totalClassesSold: 0,
    totalClassesUsed: 0,
    activePackagesCount: 0,
    exhaustedPackages: 0,
    recurringActive: 0,
    recurringExpected: emptyMoney(),
  };
}

/**
 * Resumo financeiro do mês selecionado.
 * Nunca converte moedas: cada moeda é somada separadamente.
 */
export function useFinancialSummary(selectedMonth?: string) {
  const key = selectedMonth || monthKey(new Date());
  const [summary, setSummary] = useState<FinancialSummary>(() => emptySummary(key));
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const today = new Date();
      const currentKey = monthKey(today);
      const isCurrentMonth = key === currentKey;
      const { startUtc, endExclusiveUtc } = monthUtcRangeForTimezone(key);

      const [{ data: allPayments }, { data: allPackages }, { data: allPlans }, { data: creditsThisMonth }] = await Promise.all([
        supabase.from('payments').select('*'),
        supabase.from('class_packages').select('*'),
        (supabase as any).from('student_billing_plans').select('*'),
        supabase
          .from('class_credits_log')
          .select('quantity, action_type, occurred_at')
          .eq('action_type', 'use_credit')
          .gte('occurred_at', startUtc)
          .lt('occurred_at', endExclusiveUtc),
      ]);

      const payments = (allPayments || []) as any[];
      const packages = (allPackages || []) as any[];
      const plans = (allPlans || []) as any[];

      const next = emptySummary(key);

      const totals = summarizeMonth(payments, packages, key, today);
      next.received = totals.received;
      next.toReceive = totals.toReceive;
      next.overdue = totals.overdue;
      next.dueSoon = totals.dueSoon;
      next.expectedTotal = totals.expectedTotal;
      next.studentsOverdue = totals.studentsOverdue;

      // Pacotes vigentes no mês (sobreposição de datas), sem inventar saldo histórico.
      const relevantPackages = packages.filter(p => packageIsRelevantInMonth(p, key));
      next.activePackagesCount = isCurrentMonth
        ? packages.filter(p => p.status === 'ativo').length
        : relevantPackages.length;
      next.balanceIsCurrent = isCurrentMonth;
      next.remainingClasses = isCurrentMonth
        ? packages.filter(p => p.status === 'ativo').reduce((s, p) => s + p.remaining_classes, 0)
        : 0;
      next.packagesEnding = isCurrentMonth ? packages.filter(packageIsEnding).length : 0;
      next.exhaustedPackages = isCurrentMonth ? packages.filter(p => p.status === 'esgotado').length : 0;
      next.totalClassesSold = relevantPackages.filter(p => p.payment_status === 'pago').reduce((s, p) => s + p.total_classes, 0);
      next.totalClassesUsed = relevantPackages.reduce((s, p) => s + p.used_classes, 0);
      next.classesThisMonth = (creditsThisMonth || []).reduce((s: number, c: any) => s + c.quantity, 0);

      const activePlans = plans.filter(p => p.status === 'active');
      next.recurringActive = activePlans.length;
      activePlans.forEach(p => addMoney(next.recurringExpected, p.amount, p.currency));


      setSummary(next);
    } catch (err) {
      console.error('Error fetching financial summary:', err);
    } finally {
      setLoading(false);
    }
  }, [user, key]);

  useEffect(() => { fetch(); }, [fetch]);

  return { summary, loading, refetch: fetch };
}

export function useBillingPlans(studentId?: string) {
  const [plans, setPlans] = useState<StudentBillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchPlans = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('student_billing_plans')
        .select('*')
        .order('created_at', { ascending: false });
      if (studentId) query = query.eq('student_id', studentId);
      const { data, error } = await query;
      if (error) throw error;

      const sIds = [...new Set((data || []).map((p: any) => p.student_id))] as string[];
      const nameMap: Record<string, string> = {};
      if (sIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, nome').in('user_id', sIds);
        profiles?.forEach(p => { nameMap[p.user_id] = p.nome; });
      }
      setPlans((data || []).map((p: any) => ({ ...p, student_name: nameMap[p.student_id] || 'Aluno' })));
    } catch (err) {
      console.error('Error fetching billing plans:', err);
    } finally {
      setLoading(false);
    }
  }, [user, studentId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  return { plans, loading, refetch: fetchPlans };
}

export async function createBillingPlan(data: Partial<StudentBillingPlan> & { student_id: string; admin_id: string }) {
  const { data: result, error } = await (supabase as any).from('student_billing_plans').insert(data).select().single();
  if (error) throw error;
  return result as StudentBillingPlan;
}

export async function updateBillingPlan(id: string, updates: Partial<StudentBillingPlan>) {
  const { error } = await (supabase as any).from('student_billing_plans').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteBillingPlan(id: string) {
  const { error } = await (supabase as any).from('student_billing_plans').delete().eq('id', id);
  if (error) throw error;
}

/** Gera as mensalidades do mês (idempotente) e marca pendências vencidas. */
export async function generateRecurringCharges(referenceMonth: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('generate_recurring_charges', { _reference_month: referenceMonth });
  if (error) throw error;
  return Number(data ?? 0);
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
  billing_plan_id?: string | null;
  reference_month?: string | null;
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
  payment_date?: string;
  payment_method?: string;
  payment_status?: string;
  currency?: string;
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

  // Log package creation
  if (result) {
    await supabase.from('class_credits_log').insert({
      student_id: data.student_id,
      package_id: (result as any).id,
      action_type: 'package_created',
      quantity: data.total_classes,
      reason: `Pacote criado: ${data.package_name} — ${data.total_classes} aulas — ${formatMoney(data.total_amount, data.currency)}`,
      balance_before: 0,
      balance_after: data.total_classes,
      created_by: data.admin_id,
    } as any);
  }
  return result;
}

 export async function updateClassPackage(id: string, updates: Partial<ClassPackage>) {
   const { error } = await supabase.from('class_packages').update(updates as any).eq('id', id);
   if (error) throw error;
 }
 
 export async function deletePayment(id: string) {
   const { error } = await supabase.from('payments').delete().eq('id', id);
   if (error) throw error;
 }
 
 /**
  * Apagar um pacote só é permitido enquanto nenhuma aula tiver sido consumida.
  * Com consumo, o histórico é preservado e o pacote deve ser cancelado.
  */
 export async function deleteClassPackage(id: string) {
   const { data: pkg, error: readError } = await supabase
     .from('class_packages')
     .select('used_classes')
     .eq('id', id)
     .single();
   if (readError) throw readError;
   if (!pkg) throw new Error('Pacote não encontrado');
   if (!packageCanBeDeleted(pkg as any)) {
     throw new Error('Este pacote já tem aulas realizadas. Cancele o pacote em vez de apagar, para preservar o histórico.');
   }
   await supabase.from('class_credits_log').delete().eq('package_id', id);
   const { error } = await supabase.from('class_packages').delete().eq('id', id);
   if (error) throw error;
 }

 /** Cancela um pacote preservando o histórico de créditos. */
 export async function cancelClassPackage(id: string) {
   const { error } = await supabase.from('class_packages').update({ status: 'cancelado' } as any).eq('id', id);
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
  /** Data real em que a aula aconteceu (default: agora). */
  occurred_at?: string;
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
  } else if (actionType === 'add_credit' || actionType === 'refund_credit' || actionType === 'class_refunded') {
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
    occurred_at: params.occurred_at || new Date().toISOString(),
    created_by: params.created_by,
  } as any);

  // Update package
  const pkgUpdate: any = {
    remaining_classes: balanceAfter,
    used_classes: pkg.used_classes + usedDelta,
  };
  if (balanceAfter <= 0 && (actionType === 'use_credit' || actionType === 'class_used')) {
    pkgUpdate.status = 'esgotado';
  }
  await supabase.from('class_packages').update(pkgUpdate).eq('id', params.package_id);
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
/** Regista uma aula realizada fora da agenda, com a data real do atendimento. */
export async function registerManualClass(params: {
  student_id: string;
  package_id: string;
  created_by: string;
  occurred_at: string;
  reason?: string;
}) {
  await deductClassCredit({
    student_id: params.student_id,
    package_id: params.package_id,
    created_by: params.created_by,
    action_type: 'use_credit',
    quantity: 1,
    occurred_at: params.occurred_at,
    reason: params.reason || 'Aula registada manualmente',
  });
}

/** Devolve uma aula ao saldo do pacote (estorno), preservando o histórico. */
export async function refundClassCredit(params: {
  student_id: string;
  package_id: string;
  created_by: string;
  reason?: string;
  occurred_at?: string;
}) {
  await deductClassCredit({
    student_id: params.student_id,
    package_id: params.package_id,
    created_by: params.created_by,
    action_type: 'refund_credit',
    quantity: 1,
    occurred_at: params.occurred_at,
    reason: params.reason || 'Estorno de aula',
  });
}
