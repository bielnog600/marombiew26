import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
 import { createPayment, updatePayment, deletePayment, PAYMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, Payment } from '@/hooks/useFinancial';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  payment?: Payment | null;
  preselectedStudentId?: string;
};

const PaymentDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, payment, preselectedStudentId }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [form, setForm] = useState({
    student_id: preselectedStudentId || '',
    type: 'outro' as string,
    description: '',
    amount: '',
    currency: 'EUR',
    payment_method: 'outro' as string,
    status: 'pendente' as string,
    paid_at: '',
    due_date: '',
    notes: '',
  });
   const [saving, setSaving] = useState(false);
   const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('user_id, nome').then(({ data }) => setStudents(data || []));
  }, []);

  useEffect(() => {
    if (payment) {
      setForm({
        student_id: payment.student_id,
        type: payment.type,
        description: payment.description || '',
        amount: String(payment.amount),
        currency: payment.currency,
        payment_method: payment.payment_method,
        status: payment.status,
        paid_at: payment.paid_at ? payment.paid_at.slice(0, 16) : '',
        due_date: payment.due_date || '',
        notes: payment.notes || '',
      });
    } else {
      setForm(f => ({ ...f, student_id: preselectedStudentId || f.student_id }));
    }
  }, [payment, preselectedStudentId]);

  const handleSave = async () => {
    if (!form.student_id || !form.amount) { toast.error('Preencha aluno e valor'); return; }
    setSaving(true);
    try {
      if (payment) {
        await updatePayment(payment.id, {
          type: form.type,
          description: form.description,
          amount: Number(form.amount),
          currency: form.currency,
          payment_method: form.payment_method,
          status: form.status,
          paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : null,
          due_date: form.due_date || null,
          notes: form.notes,
        } as any);
        toast.success('Pagamento atualizado');
      } else {
        await createPayment({
          student_id: form.student_id,
          admin_id: user!.id,
          type: form.type,
          description: form.description,
          amount: Number(form.amount),
          currency: form.currency,
          payment_method: form.payment_method,
          status: form.status,
          paid_at: form.status === 'pago' && form.paid_at ? new Date(form.paid_at).toISOString() : form.status === 'pago' ? new Date().toISOString() : null,
          due_date: form.due_date || null,
          notes: form.notes,
        });
        toast.success('Pagamento registrado');
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
     if (!payment) return;
     if (!confirm('Tem certeza que deseja apagar este pagamento? Esta ação não pode ser desfeita.')) return;
     
     setDeleting(true);
     try {
       await deletePayment(payment.id);
       toast.success('Pagamento apagado com sucesso');
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
          <DialogTitle>{payment ? 'Editar Pagamento' : 'Novo Pagamento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={v => setForm(f => ({ ...f, student_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar aluno" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método</Label>
              <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>Moeda</Label>
              <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Vencimento</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          {form.status === 'pago' && (
            <div>
              <Label>Data Pagamento</Label>
              <Input type="datetime-local" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
           <div className="flex gap-2 pt-2">
             {payment && (
               <Button variant="destructive" onClick={handleDelete} disabled={saving || deleting} className="flex-1">
                 {deleting ? 'Apagando...' : 'Apagar'}
               </Button>
             )}
             <Button onClick={handleSave} disabled={saving || deleting} className={payment ? 'flex-[2]' : 'w-full'}>
               {saving ? 'Salvando...' : 'Salvar'}
             </Button>
           </div>
         </div>
       </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;