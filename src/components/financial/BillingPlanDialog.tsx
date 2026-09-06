import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createBillingPlan, updateBillingPlan, deleteBillingPlan, StudentBillingPlan } from '@/hooks/useFinancial';
import { BILLING_SERVICE_LABELS, BILLING_PLAN_STATUS_LABELS, CURRENCY_LABELS, SUPPORTED_CURRENCIES } from '@/lib/financial';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  plan?: StudentBillingPlan | null;
  preselectedStudentId?: string;
};

const emptyForm = {
  student_id: '',
  service_type: 'consultoria_online',
  description: '',
  amount: '',
  currency: 'EUR',
  due_day: '1',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  status: 'active',
  notes: '',
};

const BillingPlanDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, plan, preselectedStudentId }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [form, setForm] = useState({ ...emptyForm, student_id: preselectedStudentId || '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('user_id, nome').order('nome').then(({ data }) => setStudents(data || []));
  }, []);

  useEffect(() => {
    if (plan) {
      setForm({
        student_id: plan.student_id,
        service_type: plan.service_type,
        description: plan.description || '',
        amount: String(plan.amount),
        currency: plan.currency,
        due_day: String(plan.due_day),
        start_date: plan.start_date,
        end_date: plan.end_date || '',
        status: plan.status,
        notes: plan.notes || '',
      });
    } else {
      setForm({ ...emptyForm, student_id: preselectedStudentId || '' });
    }
  }, [plan, preselectedStudentId, open]);

  const handleSave = async () => {
    if (!form.student_id || !form.amount) { toast.error('Selecione o aluno e informe o valor'); return; }
    const dueDay = Number(form.due_day);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) { toast.error('Dia de vencimento deve estar entre 1 e 28'); return; }
    setSaving(true);
    try {
      const payload = {
        service_type: form.service_type,
        description: form.description,
        amount: Number(form.amount),
        currency: form.currency,
        billing_frequency: 'monthly',
        due_day: dueDay,
        start_date: form.start_date,
        end_date: form.end_date || null,
        status: form.status,
        notes: form.notes,
      };
      if (plan) {
        await updateBillingPlan(plan.id, payload as any);
        toast.success('Plano atualizado');
      } else {
        await createBillingPlan({ ...payload, student_id: form.student_id, admin_id: user!.id } as any);
        toast.success('Plano recorrente criado');
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plan) return;
    if (!confirm('Apagar este plano? As cobranças já geradas continuam no histórico.')) return;
    setDeleting(true);
    try {
      await deleteBillingPlan(plan.id);
      toast.success('Plano apagado');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar Plano Recorrente' : 'Novo Plano Recorrente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={v => setForm(f => ({ ...f, student_id: v }))} disabled={!!plan}>
              <SelectTrigger><SelectValue placeholder="Selecionar aluno" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Serviço</Label>
              <Select value={form.service_type} onValueChange={v => setForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_SERVICE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_PLAN_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor mensal</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>Moeda</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dia venc.</Label>
              <Input type="number" min={1} max={28} value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Descrição da cobrança</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Consultoria online mensal" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Fim (opcional)</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="flex gap-2 pt-2">
            {plan && (
              <Button variant="destructive" onClick={handleDelete} disabled={saving || deleting} className="flex-1">
                {deleting ? 'Apagando...' : 'Apagar'}
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || deleting} className={plan ? 'flex-[2]' : 'w-full'}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillingPlanDialog;
