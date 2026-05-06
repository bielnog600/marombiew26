import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deductClassCredit, ClassPackage, PAYMENT_METHOD_LABELS } from '@/hooks/useFinancial';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  studentId: string;
  studentName: string;
  pkg: ClassPackage | null;
  allPackages?: ClassPackage[];
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
  { label: 'Aula avulsa, criar cobrança', action: 'none', deduct: false, reason: '' },
];

const ClassDeductionDialog: React.FC<Props> = ({ open, onOpenChange, onSuccess, studentId, studentName, pkg, allPackages, calendarEventId }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState<string>(pkg?.id || '');

  const activePkgs = (allPackages || (pkg ? [pkg] : [])).filter(p => p.status === 'ativo' && p.remaining_classes > 0);
  const selectedPkg = activePkgs.find(p => p.id === selectedPkgId) || activePkgs[0] || null;

  const handleOption = async (opt: DeductOption) => {
    setLoading(true);
    try {
      if (opt.deduct && selectedPkg) {
        await deductClassCredit({
          student_id: studentId,
          package_id: selectedPkg.id,
          calendar_event_id: calendarEventId,
          reason: opt.reason,
          created_by: user!.id,
          action_type: opt.action,
        });
        toast.success(`Aula descontada. Restam ${selectedPkg.remaining_classes - 1} aulas.`);
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
        
        {activePkgs.length === 0 ? (
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Aluno sem pacote ativo</span>
            </div>
            <p className="text-sm text-muted-foreground">{studentName} não possui pacote com aulas disponíveis.</p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => { onOpenChange(false); }}>
                Criar pacote agora
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => { toast.info('Concluído sem desconto'); onSuccess(); onOpenChange(false); }}>
                Concluir mesmo assim
              </Button>
            </div>
          </div>
        ) : (
          <>
            {activePkgs.length > 1 && (
              <div className="space-y-1 mt-2">
                <p className="text-xs text-muted-foreground">Selecionar pacote:</p>
                {activePkgs.map(p => (
                  <Button
                    key={p.id}
                    variant={selectedPkg?.id === p.id ? 'default' : 'outline'}
                    size="sm"
                    className="w-full justify-start text-left"
                    onClick={() => setSelectedPkgId(p.id)}
                  >
                    {p.package_name} — {p.remaining_classes} restantes — €{Number(p.price_per_class).toFixed(2)}/aula
                  </Button>
                ))}
              </div>
            )}
            
            {selectedPkg && (
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <p><strong>{studentName}</strong> — {selectedPkg.package_name}</p>
                <p>{selectedPkg.remaining_classes} aulas restantes • €{Number(selectedPkg.price_per_class).toFixed(2)}/aula</p>
              </div>
            )}
            
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClassDeductionDialog;