import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createClassPackage, updateClassPackage, ClassPackage, PAYMENT_METHOD_LABELS } from '@/hooks/useFinancial';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  pkg?: ClassPackage | null;
  preselectedStudentId?: string;
};

const PackageDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, pkg, preselectedStudentId }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<{ user_id: string; nome: string }[]>([]);
  const [form, setForm] = useState({
    student_id: preselectedStudentId || '',
    package_name: '',
    total_classes: '',
    total_amount: '',
    start_date: new Date().toISOString().slice(0, 10),
    expiry_date: '',
    notes: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'mbway',
    payment_status: 'pago',
  });
  const [saving, setSaving] = useState(false);

  const pricePerClass = useMemo(() => {
    const total = Number(form.total_amount);
    const classes = Number(form.total_classes);
    if (classes > 0 && total > 0) return (total / classes).toFixed(2);
    return '0.00';
  }, [form.total_amount, form.total_classes]);

  useEffect(() => {
    supabase.from('profiles').select('user_id, nome').then(({ data }) => setStudents(data || []));
  }, []);

  useEffect(() => {
    if (pkg) {
      setForm({
        student_id: pkg.student_id,
        package_name: pkg.package_name,
        total_classes: String(pkg.total_classes),
        total_amount: String(pkg.total_amount),
        start_date: pkg.start_date,
        expiry_date: pkg.expiry_date || '',
        notes: pkg.notes || '',
        payment_date: pkg.payment_date || new Date().toISOString().slice(0, 10),
        payment_method: pkg.payment_method || 'outro',
        payment_status: pkg.payment_status || 'pago',
      });
    } else {
      setForm(f => ({ ...f, student_id: preselectedStudentId || f.student_id }));
    }
  }, [pkg, preselectedStudentId]);

  const handleSave = async () => {
    if (!form.student_id || !form.total_classes || !form.package_name) {
      toast.error('Preencha aluno, nome e total de aulas');
      return;
    }
    setSaving(true);
    try {
      if (pkg) {
        await updateClassPackage(pkg.id, {
          package_name: form.package_name,
          total_amount: Number(form.total_amount),
          expiry_date: form.expiry_date || null,
          notes: form.notes,
          payment_method: form.payment_method,
          payment_status: form.payment_status,
        } as any);
        toast.success('Pacote atualizado');
      } else {
        await createClassPackage({
          student_id: form.student_id,
          admin_id: user!.id,
          package_name: form.package_name,
          total_classes: Number(form.total_classes),
          total_amount: Number(form.total_amount),
          start_date: form.start_date,
          expiry_date: form.expiry_date || null,
          notes: form.notes,
          payment_date: form.payment_date,
          payment_method: form.payment_method,
          payment_status: form.payment_status,
        });
        toast.success('Pacote criado');
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pkg ? 'Editar Pacote' : 'Novo Pacote'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Aluno</Label>
            <Select value={form.student_id} onValueChange={v => setForm(f => ({ ...f, student_id: v }))} disabled={!!pkg}>
              <SelectTrigger><SelectValue placeholder="Selecionar aluno" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do Pacote</Label>
            <Input value={form.package_name} onChange={e => setForm(f => ({ ...f, package_name: e.target.value }))} placeholder="Ex: 8 aulas presenciais" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Total de Aulas</Label>
              <Input type="number" value={form.total_classes} onChange={e => setForm(f => ({ ...f, total_classes: e.target.value }))} disabled={!!pkg} />
            </div>
            <div>
              <Label>Valor Total (€)</Label>
              <Input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Valor por Aula</Label>
            <Input value={`€${pricePerClass}`} disabled className="bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de Pagamento</Label>
              <Input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
            <div>
              <Label>Validade</Label>
              <Input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Método de Pagamento</Label>
              <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status do Pagamento</Label>
              <Select value={form.payment_status} onValueChange={v => setForm(f => ({ ...f, payment_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PackageDialog;