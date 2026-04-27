import React, { useState } from 'react';
import { Sparkles, Loader2, Plus, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedExercise } from '@/lib/trainingResultParser';

export interface AiEditAction {
  op: 'add' | 'modify' | 'remove' | 'replace';
  index?: number;
  match?: string;
  exercise?: Partial<ParsedExercise>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayName: string;
  currentExercises: ParsedExercise[];
  exerciseCatalog: Array<{ nome: string; grupo_muscular: string }>;
  studentId?: string;
  onApply: (actions: AiEditAction[]) => void;
}

const QUICK_OPTIONS: { label: string; instruction: string; group: string }[] = [
  // Adicionar grupos
  { group: 'Adicionar', label: '+ Core / Abdômen', instruction: 'Adicione 2 exercícios de core/abdômen do banco, variando supra, infra e estabilização (prancha).' },
  { group: 'Adicionar', label: '+ Mobilidade', instruction: 'Adicione 2 exercícios de mobilidade/ativação no início, específicos para o grupo muscular do dia.' },
  { group: 'Adicionar', label: '+ Panturrilha', instruction: 'Adicione 2 exercícios de panturrilha (gastrocnêmio) ao final do treino.' },
  { group: 'Adicionar', label: '+ Cardio finalizador', instruction: 'Adicione 1 exercício de cardio curto e intenso ao final (HIIT, intervalado ou bike).' },
  { group: 'Adicionar', label: '+ Glúteos', instruction: 'Adicione 2 exercícios específicos para glúteos.' },
  { group: 'Adicionar', label: '+ Alongamento final', instruction: 'Adicione 1-2 alongamentos relacionados ao grupo muscular trabalhado, ao final do treino.' },

  // Intensidade
  { group: 'Intensidade', label: '↑ Mais intensidade', instruction: 'Aumente a intensidade do treino: reduza repetições, diminua RIR para 0-1 nos compostos, e adicione técnicas avançadas (drop-set ou rest-pause) em 2 exercícios principais.' },
  { group: 'Intensidade', label: '↓ Reduzir volume', instruction: 'Reduza o volume total: remova 1-2 exercícios menos prioritários ou reduza séries dos acessórios.' },
  { group: 'Intensidade', label: '+ Drop-set', instruction: 'Aplique técnica drop-set no último exercício do treino. Adicione na descrição: "Última série em drop-set: até a falha, reduza 30% da carga e continue até nova falha".' },
  { group: 'Intensidade', label: '+ Rest-pause', instruction: 'Aplique técnica rest-pause em 1 exercício composto. Adicione na descrição: "Última série rest-pause: chegue à falha, descanse 15s, mais reps até falha (repita 2x)".' },
  { group: 'Intensidade', label: '↓ Pausa menor', instruction: 'Reduza o tempo de pausa para 45s nos exercícios isoladores e 60s nos compostos.' },

  // Reorganizar
  { group: 'Ajustar', label: '↑ Reps maiores', instruction: 'Aumente a faixa de repetições para 12-15 em todos os exercícios (foco em resistência/definição).' },
  { group: 'Ajustar', label: '↓ Reps menores', instruction: 'Reduza para faixa de 6-8 repetições nos compostos principais (foco em força/hipertrofia).' },
  { group: 'Ajustar', label: '+ Reconhecimento', instruction: 'Adicione 1 série de reconhecimento (12 reps com carga leve) antes das séries de trabalho nos 2 principais compostos.' },
];

const GROUPS = ['Adicionar', 'Intensidade', 'Ajustar'];

const AiEditExerciseDialog: React.FC<Props> = ({
  open, onOpenChange, dayName, currentExercises, exerciseCatalog, studentId, onApply,
}) => {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);

  const runWithInstruction = async (text: string) => {
    if (!text.trim()) {
      toast.error('Escreva uma instrução ou escolha uma opção rápida.');
      return;
    }
    setLoading(true);
    try {
      // Optional student context for safety
      let studentContext: any = undefined;
      if (studentId) {
        const { data } = await supabase
          .from('students_profile')
          .select('lesoes, restricoes, observacoes, objetivo')
          .eq('user_id', studentId)
          .maybeSingle();
        if (data) studentContext = data;
      }

      const { data, error } = await supabase.functions.invoke('training-edit-agent', {
        body: {
          dayName,
          currentExercises,
          instruction: text,
          exerciseCatalog,
          studentContext,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const actions: AiEditAction[] = Array.isArray((data as any)?.actions) ? (data as any).actions : [];
      if (actions.length === 0) {
        toast.error('A IA não retornou alterações. Tente uma instrução mais específica.');
        return;
      }

      onApply(actions);
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Editar treino com IA — {dayName}
          </DialogTitle>
          <DialogDescription>
            Escolha uma opção rápida ou descreva o que quer modificar (exercícios, séries, reps, descanso, técnicas...).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick options */}
          {GROUPS.map(group => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_OPTIONS.filter(o => o.group === group).map(opt => (
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
              placeholder='Ex: "trocar leg press por hack machine", "adicionar 2 exercícios de tríceps", "diminuir descanso para 45s nos isoladores", "aplicar drop-set no supino"...'
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

export default AiEditExerciseDialog;