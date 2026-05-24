import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  dietId?: string;
  onSuccess?: () => void;
}

const DietCheckinDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  studentId,
  studentName,
  dietId,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fome: 'moderada',
    energia: 'normal',
    saciedade: 'ok',
    sono: 'igual',
    digestao: 'ok',
    facilidade: 'media',
    observacoes: ''
  });

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('diet_checkins')
        .insert({
          student_id: studentId,
          diet_id: dietId,
          status: 'completed',
          completed_at: new Date().toISOString(),
          ...formData
        });

      if (error) throw error;

      toast.success('Check-in registrado com sucesso!');
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving checkin:', error);
      toast.error('Erro ao salvar check-in: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, id, options, value, onChange }: any) => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-4"
      >
        {options.map((opt: any) => (
          <div key={opt.value} className="flex items-center space-x-2">
            <RadioGroupItem value={opt.value} id={`${id}-${opt.value}`} />
            <Label htmlFor={`${id}-${opt.value}`} className="text-xs cursor-pointer">{opt.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Check-in de Dieta - {studentName}
          </DialogTitle>
          <DialogDescription>
            Como o aluno sentiu a dieta nos últimos dias? (Preenchimento manual pelo consultor)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Field
            label="Fome"
            id="fome"
            value={formData.fome}
            onChange={(v: string) => setFormData(p => ({ ...p, fome: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Moderada', value: 'moderada' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <Field
            label="Energia"
            id="energia"
            value={formData.energia}
            onChange={(v: string) => setFormData(p => ({ ...p, energia: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Normal', value: 'normal' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <Field
            label="Saciedade"
            id="saciedade"
            value={formData.saciedade}
            onChange={(v: string) => setFormData(p => ({ ...p, saciedade: v }))}
            options={[
              { label: 'Ruim', value: 'ruim' },
              { label: 'Ok', value: 'ok' },
              { label: 'Boa', value: 'boa' }
            ]}
          />

          <Field
            label="Sono"
            id="sono"
            value={formData.sono}
            onChange={(v: string) => setFormData(p => ({ ...p, sono: v }))}
            options={[
              { label: 'Piorou', value: 'piorou' },
              { label: 'Igual', value: 'igual' },
              { label: 'Melhorou', value: 'melhorou' }
            ]}
          />

          <Field
            label="Digestão"
            id="digestao"
            value={formData.digestao}
            onChange={(v: string) => setFormData(p => ({ ...p, digestao: v }))}
            options={[
              { label: 'Ruim', value: 'ruim' },
              { label: 'Ok', value: 'ok' },
              { label: 'Boa', value: 'boa' }
            ]}
          />

          <Field
            label="Facilidade para seguir"
            id="facilidade"
            value={formData.facilidade}
            onChange={(v: string) => setFormData(p => ({ ...p, facilidade: v }))}
            options={[
              { label: 'Difícil', value: 'dificil' },
              { label: 'Média', value: 'media' },
              { label: 'Fácil', value: 'facil' }
            ]}
          />

          <div className="space-y-2">
            <Label htmlFor="obs" className="text-sm font-semibold">Observações importantes</Label>
            <Textarea
              id="obs"
              placeholder="Ex: Teve muita fome à noite, sentiu azia com o café..."
              value={formData.observacoes}
              onChange={(e) => setFormData(p => ({ ...p, observacoes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
            Salvar Check-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DietCheckinDialog;