import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  workoutPlanId?: string;
  onSuccess?: () => void;
  mode?: 'consultor' | 'aluno' | 'view';
  checkinData?: any;
}

const WorkoutCheckinDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  studentId,
  studentName,
  workoutPlanId,
  onSuccess,
  mode = 'consultor',
  checkinData
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    intensidade_percebida: 'adequado',
    falta_tempo: 'nao',
    recuperacao: 'ok',
    dores: 'nao',
    exercicios_incomodo: '',
    duracao_percebida: 'adequado',
    energia: 'normal',
    motivacao: 'media',
    observacoes: ''
  });

  useEffect(() => {
    if (checkinData) {
      setFormData({
        intensidade_percebida: checkinData.intensidade_percebida || 'adequado',
        falta_tempo: checkinData.falta_tempo ? 'sim' : 'nao',
        recuperacao: checkinData.recuperacao || 'ok',
        dores: checkinData.dores || 'nao',
        exercicios_incomodo: checkinData.exercicios_incomodo || '',
        duracao_percebida: checkinData.duracao_percebida || 'adequado',
        energia: checkinData.energia || 'normal',
        motivacao: checkinData.motivacao || 'media',
        observacoes: checkinData.observacoes || ''
      });
    }
  }, [checkinData]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 1. Salvar o check-in
      const { error } = await supabase
        .from('workout_checkins')
        .insert({
          student_id: studentId,
          workout_plan_id: workoutPlanId,
          status: 'completed',
          completed_at: new Date().toISOString(),
          ...formData,
          falta_tempo: formData.falta_tempo === 'sim'
        });

      if (error) throw error;

      // 2. Se for o aluno respondendo, limpar a flag de checkin pendente no plano
      if (mode === 'aluno' && workoutPlanId) {
        await supabase
          .from('ai_plans')
          .update({ pending_checkin: false, has_new_checkin: true })
          .eq('id', workoutPlanId);
      } else if (mode === 'aluno') {
        // Fallback se não tiver workoutPlanId: limpa todos os pendentes desse aluno
        await supabase
          .from('ai_plans')
          .update({ pending_checkin: false, has_new_checkin: true })
          .eq('student_id', studentId)
          .eq('tipo', 'treino');
      }

      toast.success(mode === 'aluno' ? 'Obrigado pelo seu feedback!' : 'Check-in de treino registrado!');
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving workout checkin:', error);
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
            <ClipboardCheck className="h-5 w-5 text-blue-500" />
            {mode === 'view' ? `Feedback de Treino - ${studentName}` : `Check-in de Treino ${mode === 'consultor' ? `- ${studentName}` : ''}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'view'
              ? 'Visualize as respostas dadas pelo aluno no check-in do app.'
              : mode === 'consultor' 
              ? 'Como o aluno sentiu o treino nos últimos dias? (Preenchimento manual pelo consultor)'
              : 'Como você sentiu o seu treino/protocolo atual? Seu feedback é fundamental para nossos ajustes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Field
            label="Como você sentiu o treino atual?"
            id="intensidade"
            value={formData.intensidade_percebida}
            onChange={(v: string) => setFormData(p => ({ ...p, intensidade_percebida: v }))}
            options={[
              { label: 'Muito Fácil', value: 'muito_facil' },
              { label: 'Adequado', value: 'adequado' },
              { label: 'Muito Pesado', value: 'muito_pesado' }
            ]}
          />

          <Field
            label="Faltou tempo para completar?"
            id="tempo"
            value={formData.falta_tempo}
            onChange={(v: string) => setFormData(p => ({ ...p, falta_tempo: v }))}
            options={[
              { label: 'Sim', value: 'sim' },
              { label: 'Não', value: 'nao' }
            ]}
          />

          <Field
            label="Como ficou sua recuperação?"
            id="recuperacao"
            value={formData.recuperacao}
            onChange={(v: string) => setFormData(p => ({ ...p, recuperacao: v }))}
            options={[
              { label: 'Ruim', value: 'ruim' },
              { label: 'Ok', value: 'ok' },
              { label: 'Boa', value: 'boa' }
            ]}
          />

          <Field
            label="Sentiu dores ou desconfortos?"
            id="dores"
            value={formData.dores}
            onChange={(v: string) => setFormData(p => ({ ...p, dores: v }))}
            options={[
              { label: 'Não', value: 'nao' },
              { label: 'Leves', value: 'leves' },
              { label: 'Moderadas', value: 'moderadas' },
              { label: 'Fortes', value: 'fortes' }
            ]}
          />

          <div className="space-y-2">
            <Label htmlFor="exerc_inc" className="text-sm font-semibold">Algum exercício incomodou ou não fez sentido?</Label>
            <Input
              id="exerc_inc"
              placeholder="Ex: Agachamento dói o joelho"
              value={formData.exercicios_incomodo}
              onChange={(e) => setFormData(p => ({ ...p, exercicios_incomodo: e.target.value }))}
            />
          </div>

          <Field
            label="Energia para Treinar"
            id="energia"
            value={formData.energia}
            onChange={(v: string) => setFormData(p => ({ ...p, energia: v }))}
            options={[
              { label: 'Baixa', value: 'baixa' },
              { label: 'Normal', value: 'normal' },
              { label: 'Alta', value: 'alta' }
            ]}
          />

          <div className="space-y-2">
            <Label htmlFor="obs" className="text-sm font-semibold">Observação importante</Label>
            <Textarea
              id="obs"
              placeholder={mode === 'consultor' ? "Ex: Aluno relatou cansaço excessivo..." : "Conte mais sobre sua experiência..."}
              value={formData.observacoes}
              onChange={(e) => setFormData(p => ({ ...p, observacoes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          {mode === 'view' ? (
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          ) : (
            <>
              {mode === 'consultor' && (
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSubmit} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
                {mode === 'aluno' ? 'Enviar Feedback' : 'Salvar Check-in'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutCheckinDialog;