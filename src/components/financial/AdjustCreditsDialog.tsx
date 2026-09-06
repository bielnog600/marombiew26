import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClassPackage, deductClassCredit } from '@/hooks/useFinancial';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  studentId: string;
  packages: ClassPackage[];
};

/**
 * Ajuste manual de saldo — nunca representa uma aula realizada.
 * Regista em class_credits_log com action_type = manual_adjustment.
 */
const AdjustCreditsDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, studentId, packages }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [packageId, setPackageId] = useState('');
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');

  const eligible = packages.filter(p => p.status === 'ativo' || p.status === 'pausado' || p.status === 'esgotado');

  useEffect(() => {
    if (open) {
      setPackageId(eligible[0]?.id || '');
      setDirection('add');
      setQuantity('1');
      setReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = eligible.find(p => p.id === packageId);

  const handleSave = async () => {
    const qty = Math.trunc(Number(quantity));
    if (!packageId) { toast.error('Selecione um pacote'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantidade inválida'); return; }
    if (!reason.trim()) { toast.error('O motivo é obrigatório'); return; }
    const delta = direction === 'add' ? qty : -qty;
    if (selected && selected.remaining_classes + delta < 0) {
      toast.error('O saldo do pacote não pode ficar negativo.');
      return;
    }
    setSaving(true);
    try {
      await deductClassCredit({
        student_id: studentId,
        package_id: packageId,
        created_by: user!.id,
        action_type: 'manual_adjustment',
        quantity: delta,
        reason: `Ajuste manual: ${reason.trim()}`,
      });
      toast.success('Saldo ajustado');
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
          <DialogTitle>Ajustar saldo</DialogTitle>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este aluno não tem pacote para ajustar.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Pacote</Label>
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {eligible.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.package_name} — saldo {p.remaining_classes}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar créditos</SelectItem>
                  <SelectItem value="remove">Remover créditos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Quantidade</Label>
              <Input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>

            <div>
              <Label>Motivo</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: correção de lançamento duplicado" />
            </div>

            <p className="text-xs text-muted-foreground">
              Um ajuste de saldo não conta como aula realizada.
            </p>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'A guardar...' : 'Confirmar ajuste'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdjustCreditsDialog;
