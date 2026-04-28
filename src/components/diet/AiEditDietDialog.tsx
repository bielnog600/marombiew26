import React, { useState } from 'react';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedMeal } from '@/lib/dietResultParser';
import { applyDietActions, type DietAiAction } from '@/lib/dietAiActions';
import { computeDayTotals } from '@/lib/dietMarkdownSerializer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMeals: ParsedMeal[];
  studentId?: string;
  onApply: (newMeals: ParsedMeal[], notes: string[]) => void;
}

const QUICK: { group: string; label: string; instruction: string }[] = [
  // Calorias
  { group: 'Calorias', label: '↓ -10% kcal', instruction: 'Reduza 10% das calorias da dieta inteira mantendo proporção dos macros (use scale_day com factor 0.9).' },
  { group: 'Calorias', label: '↓ -20% kcal', instruction: 'Reduza 20% das calorias da dieta inteira (scale_day factor 0.8).' },
  { group: 'Calorias', label: '↑ +10% kcal', instruction: 'Aumente 10% das calorias da dieta inteira (scale_day factor 1.1).' },
  { group: 'Calorias', label: 'Definir 1800 kcal', instruction: 'Ajuste a dieta inteira para totalizar 1800 kcal (scale_day targetKcal 1800).' },
  { group: 'Calorias', label: 'Definir 2200 kcal', instruction: 'Ajuste a dieta inteira para totalizar 2200 kcal (scale_day targetKcal 2200).' },

  // Ciclo de carbo
  { group: 'Ciclo de Carboidrato', label: 'Low Seg/Qua/Sex', instruction: 'Crie estratégia de ciclo de carboidratos: low carb na segunda, quarta e sexta (reduzir carbo em 50%), high carb terça e quinta (aumentar carbo em 20%), normal sábado e domingo. Use carb_cycle.' },
  { group: 'Ciclo de Carboidrato', label: 'Low fim de semana', instruction: 'Ciclo de carbo: low carb sábado e domingo (reduzir carbo 50%), demais dias normal. Use carb_cycle.' },
  { group: 'Ciclo de Carboidrato', label: 'High dias de treino', instruction: 'Ciclo de carbo: high carb nos dias de treino (segunda, quarta, sexta — aumento de 25% no carbo), low carb nos dias de descanso (terça, quinta — redução de 40%). Use carb_cycle.' },

  // Estratégias
  { group: 'Estratégias', label: '↓ Carbo geral', instruction: 'Reduza 30% dos carboidratos de cada refeição mantendo proteínas e gorduras. Use modify em cada alimento rico em carbo.' },
  { group: 'Estratégias', label: '↑ Proteína', instruction: 'Aumente proteína da dieta para ~2.2g/kg. Adicione fontes proteicas (whey, frango, ovos, atum) nas refeições principais.' },
  { group: 'Estratégias', label: '+ Pré-treino', instruction: 'Adicione uma refeição pré-treino (60-90 min antes) com carbo de absorção média + proteína magra (banana + whey ou aveia + clara).' },
  { group: 'Estratégias', label: '+ Pós-treino', instruction: 'Adicione refeição pós-treino com proteína rápida (whey 30g) + carbo simples (dextrose ou banana).' },
  { group: 'Estratégias', label: 'Aplicar p/ semana toda', instruction: 'Esta dieta deve valer para todos os dias da semana. Mantenha como está e registre em observação que se aplica de segunda a domingo.' },
];

const GROUPS = ['Calorias', 'Ciclo de Carboidrato', 'Estratégias'];

const AiEditDietDialog: React.FC<Props> = ({ open, onOpenChange, currentMeals, studentId, onApply }) => {
  const [instruction, setInstruction] = useState('');
  const [targetKcal, setTargetKcal] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const totals = computeDayTotals(currentMeals);

  const runWithInstruction = async (text: string) => {
    if (!text.trim()) {
      toast.error('Escreva uma instrução ou escolha uma opção rápida.');
      return;
    }
    setLoading(true);
    try {
      // Load food catalog (limited)
      const { data: foods } = await supabase
        .from('foods')
        .select('name, calories, protein, carbs, fats, portion_size')
        .order('name')
        .limit(250);

      // Optional student context
      let studentContext: any = undefined;
      if (studentId) {
        const { data } = await supabase
          .from('students_profile')
          .select('objetivo, restricoes, observacoes')
          .eq('user_id', studentId)
          .maybeSingle();
        if (data) studentContext = data;
      }

      const { data, error } = await supabase.functions.invoke('diet-edit-agent', {
        body: {
          currentMeals,
          instruction: text,
          foodCatalog: foods || [],
          studentContext,
          dayTotals: totals,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const actions: DietAiAction[] = Array.isArray((data as any)?.actions) ? (data as any).actions : [];
      if (actions.length === 0) {
        toast.error('A IA não retornou alterações. Tente uma instrução mais específica.');
        return;
      }

      const { meals: newMeals, notes } = applyDietActions(currentMeals, actions);
      onApply(newMeals, notes);
      toast.success((data as any)?.summary || `${actions.length} alteração(ões) aplicada(s).`);
      setInstruction('');
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro: ' + (e?.message || 'falha ao chamar IA'));
    } finally {
      setLoading(false);
    }
  };

  const runTargetKcal = () => {
    const n = Number(targetKcal);
    if (!n || n < 500) {
      toast.error('Informe uma meta válida (>= 500 kcal).');
      return;
    }
    runWithInstruction(`Ajuste a dieta inteira para totalizar exatamente ${n} kcal mantendo proporção dos macros. Use scale_day com targetKcal=${n}.`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Editar dieta com IA
          </DialogTitle>
          <DialogDescription>
            Atual: {Math.round(totals.kcal)} kcal · P{Math.round(totals.p)} C{Math.round(totals.c)} G{Math.round(totals.g)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target kcal quick set */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meta de calorias</p>
            <div className="flex gap-2">
              <Input
                type="number"
                value={targetKcal}
                onChange={(e) => setTargetKcal(e.target.value)}
                placeholder="Ex: 1800"
                className="h-8 text-sm"
                disabled={loading}
              />
              <Button size="sm" disabled={loading || !targetKcal} onClick={runTargetKcal} className="h-8 text-xs">
                Ajustar
              </Button>
            </div>
          </div>

          {/* Quick options */}
          {GROUPS.map((group) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK.filter((o) => o.group === group).map((opt) => (
                  <Button
                    key={opt.label}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="h-7 text-xs"
                    onClick={() => runWithInstruction(opt.instruction)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {/* Free text */}
          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Instrução livre
            </p>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='Ex: "trocar arroz por batata doce no almoço", "adicionar whey 30g no pós-treino", "reduzir carbo do jantar pela metade", "criar ciclo de carbo low seg/qua/sex"...'
              rows={4}
              disabled={loading}
              className="text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={() => runWithInstruction(instruction)} disabled={loading || !instruction.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Aplicar com IA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiEditDietDialog;