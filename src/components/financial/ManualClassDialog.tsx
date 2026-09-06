import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClassPackage, registerManualClass, refundClassCredit } from '@/hooks/useFinancial';
import { formatMoney, localDateTimeToUtcIso, nowInOperationalTimezone } from '@/lib/financial';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  studentId: string;
  studentName: string;
  packages: ClassPackage[];
  mode: 'register' | 'refund';
};

const ManualClassDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, studentId, studentName, packages, mode }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [packageId, setPackageId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => nowInOperationalTimezone());
  const [reason, setReason] = useState('');

  const eligible = mode === 'register'
    ? packages.filter(p => p.status === 'ativo' && p.remaining_classes > 0)
    : packages.filter(p => p.used_classes > 0);

  useEffect(() => {
    if (open) {
      setPackageId(eligible[0]?.id || '');
      setOccurredAt(nowInOperationalTimezone());
      setReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const handleSave = async () => {
    if (!packageId) { toast.error('Selecione um pacote'); return; }
    setSaving(true);
    try {
      if (mode === 'register') {
        await registerManualClass({
          student_id: studentId,
          package_id: packageId,
          created_by: user!.id,
          occurred_at: localDateTimeToUtcIso(occurredAt),
          reason: reason || 'Aula registada manualmente',
        });
        toast.success('Aula registada');
      } else {
        await refundClassCredit({
          student_id: studentId,
          package_id: packageId,
          created_by: user!.id,
          occurred_at: localDateTimeToUtcIso(occurredAt),
          reason: reason || 'Estorno de aula',
        });
        toast.success('Aula estornada');
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'register' ? 'Registar aula realizada' : 'Estornar aula'}</DialogTitle>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mode === 'register'
              ? `${studentName} não tem pacote ativo com aulas disponíveis.`
              : `${studentName} não tem aulas consumidas para estornar.`}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Pacote</Label>
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger><SelectValue placeholder="Selecionar pacote" /></SelectTrigger>
                <SelectContent>
                  {eligible.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.package_name} — {p.remaining_classes} restantes — {formatMoney(p.price_per_class, p.currency)}/aula
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{mode === 'register' ? 'Data e hora da aula' : 'Data do estorno'}</Label>
              <Input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Esta data é usada nos relatórios do mês, não a data de registo.
              </p>
            </div>

            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder={mode === 'register' ? 'Ex: aula fora da agenda' : 'Ex: desconto indevido'} />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : mode === 'register' ? 'Registar aula' : 'Estornar aula'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManualClassDialog;
