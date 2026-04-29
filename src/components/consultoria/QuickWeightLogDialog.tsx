import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Scale } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName?: string;
  onSaved?: () => void;
}

const QuickWeightLogDialog: React.FC<Props> = ({ open, onOpenChange, studentId, studentName, onSaved }) => {
  const [peso, setPeso] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const pesoNum = parseFloat(peso.replace(',', '.'));
    if (!pesoNum || pesoNum <= 0 || pesoNum > 500) {
      toast.error('Informe um peso válido (kg).');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('weight_logs').insert({
        student_id: studentId,
        peso: pesoNum,
        data,
        observacao: observacao.trim() || null,
      });
      if (error) throw error;
      toast.success('Peso registrado com sucesso.');
      setPeso('');
      setObservacao('');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e.message ?? 'desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Registrar peso atual
          </DialogTitle>
          <DialogDescription>
            {studentName ? `Aluno: ${studentName}` : 'Informe o peso atual do aluno.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="peso">Peso (kg)</Label>
            <Input
              id="peso"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Ex: 78.5"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Textarea id="obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas sobre a pesagem" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            Salvar peso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickWeightLogDialog;