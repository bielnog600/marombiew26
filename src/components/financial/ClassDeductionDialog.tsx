import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deductClassCredit, ClassPackage } from '@/hooks/useFinancial';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  studentId: string;
  studentName: string;
  pkg: ClassPackage;
  calendarEventId?: string;
};

type DeductOption = {
  label: string;
  action: string;
  deduct: boolean;
  reason: string;
};

const options: DeductOption[] = [
  { label: 'Sim, descontar', action: 'use_credit', deduct: true, reason: 'Aula concluída' },
  { label: 'Não descontar', action: 'none', deduct: false, reason: '' },
  { label: 'Aula experimental', action: 'none', deduct: false, reason: '' },
  { label: 'Falta justificada, não descontar', action: 'none', deduct: false, reason: '' },
  { label: 'Falta sem aviso, descontar', action: 'use_credit', deduct: true, reason: 'Falta sem aviso' },
];

const ClassDeductionDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, studentId, studentName, pkg, calendarEventId }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleOption = async (opt: DeductOption) => {
    setLoading(true);
    try {
      if (opt.deduct) {
        await deductClassCredit({
          student_id: studentId,
          package_id: pkg.id,
          calendar_event_id: calendarEventId,
          reason: opt.reason,
          created_by: user!.id,
          action_type: opt.action,
        });
        toast.success(`Aula descontada. Restam ${pkg.remaining_classes - 1} aulas.`);
      } else {
        toast.info(opt.label);
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Descontar aula do pacote?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {studentName} — Pacote: {pkg.package_name} ({pkg.remaining_classes} aulas restantes)
        </p>
        <div className="space-y-2 mt-4">
          {options.map((opt, i) => (
            <Button
              key={i}
              variant={opt.deduct ? 'default' : 'outline'}
              className="w-full justify-start"
              onClick={() => handleOption(opt)}
              disabled={loading}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClassDeductionDialog;