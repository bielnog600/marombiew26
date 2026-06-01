import React, { useState } from 'react';
import { Sparkles, Loader2, Plus, Wand2, Repeat, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
   { group: 'Adicionar', label: '+ Quadríceps', instruction: 'Adicione 2 exercícios focados em Quadríceps.' },
   { group: 'Adicionar', label: '+ Isquiotibiais', instruction: 'Adicione 2 exercícios focados em Isquiotibiais (Posterior de coxa).' },
   { group: 'Adicionar', label: '+ Peito', instruction: 'Adicione 2 exercícios focados em Peitoral.' },
   { group: 'Adicionar', label: '+ Tríceps', instruction: 'Adicione 2 exercícios focados em Tríceps.' },
   { group: 'Adicionar', label: '+ Bíceps', instruction: 'Adicione 2 exercícios focados em Bíceps.' },
   { group: 'Adicionar', label: '+ Ombro', instruction: 'Adicione 2 exercícios focados em Deltoides (Ombros).' },
   { group: 'Adicionar', label: '+ Dorsal', instruction: 'Adicione 2 exercícios focados em Dorsais (Costas).' },
   { group: 'Adicionar', label: '+ Glúteos', instruction: 'Adicione 2 exercícios específicos para glúteos.' },
   { group: 'Adicionar', label: '+ Alongamento final', instruction: 'Adicione 1-2 alongamentos relacionados ao grupo muscular trabalhado, ao final do treino.' },
   { group: 'Intensidade', label: '↑ Mais intensidade', instruction: 'Aumente a intensidade do treino: reduza repetições, diminua RIR para 0-1 nos compostos, e adicione técnicas avançadas (drop-set ou rest-pause) em 2 exercícios principais.' },
   { group: 'Intensidade', label: '↓ Reduzir volume', instruction: 'Reduza o volume total: remova 1-2 exercícios menos prioritários ou reduza séries dos acessórios.' },
   { group: 'Intensidade', label: '+ Drop-set', instruction: 'Aplique técnica drop-set no último exercício do treino. Adicione na descrição: "Última série em drop-set: até a falha, reduza 30% da carga e continue até nova falha".' },
   { group: 'Intensidade', label: '+ Rest-pause', instruction: 'Aplique técnica rest-pause em 1 exercício composto. Adicione na descrição: "Última série rest-pause: chegue à falha, descanse 15s, mais reps até falha (repita 2x)".' },
   { group: 'Intensidade', label: '+ Cluster-set', instruction: 'Aplique técnica cluster-set em um exercício multiarticular: realize 2-3 reps, descanse 10-15s, repita até completar a série total.' },
   { group: 'Tempo', label: '↓ Pausa menor', instruction: 'Reduza o tempo de pausa para 45s nos exercícios isoladores e 60s nos compostos.' },
   { group: 'Tempo', label: '↑ Pausa maior', instruction: 'Aumente o tempo de pausa para 90-120s em todos os exercícios focando em recuperação.' },
   { group: 'Ajustar', label: '↑ Reps maiores', instruction: 'Aumente a faixa de repetições para 12-15 em todos os exercícios (foco em resistência/definição).' },
   { group: 'Ajustar', label: '↓ Reps menores', instruction: 'Reduza para faixa de 6-8 repetições nos compostos principais (foco em força/hipertrofia).' },
   { group: 'Ajustar', label: '+ Reconhecimento', instruction: 'Adicione 1 série de reconhecimento (12 reps com carga leve) antes das séries de trabalho nos 2 principais compostos.' },
   { group: 'Ajustar', label: 'Cadência 4020', instruction: 'Ajuste a cadência de todos os exercícios para 4020 (4s na descida, 0s embaixo, 2s na subida, 0s em cima).' },
   { group: 'Ajustar', label: 'Pico de contração', instruction: 'Adicione "Pico de contração de 2s" em todos os exercícios isoladores do treino.' },
   { group: 'Intensidade', label: '+ FST-7', instruction: 'Aplique o método FST-7 no último exercício: 7 séries de 10-12 reps com apenas 30s de descanso, focando no alongamento da fáscia.' },
   { group: 'Intensidade', label: '+ Pirâmide', instruction: 'Aplique o sistema de pirâmide crescente nos 2 primeiros exercícios: aumente a carga e reduza as repetições a cada série.' },
   { group: 'Tempo', label: 'Treino Express', instruction: 'Reduza o volume e as pausas para que o treino dure no máximo 40 minutos.' },
];

 const GROUPS = ['Adicionar', 'Intensidade', 'Tempo', 'Ajustar'];

const AiEditExerciseDialog: React.FC<Props> = ({
  open, onOpenChange, dayName, currentExercises, exerciseCatalog, studentId, onApply,
}) => {
   const [instruction, setInstruction] = useState('');
   const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const [tab, setTab] = useState<'ai' | 'variations'>('ai');
   const [substitutions, setSubstitutions] = useState<Record<number, string>>({});

   const normalize = (s: string) =>
     (s || '')
       .toUpperCase()
       .normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/[^A-Z0-9 ]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

   const findCatalogEntry = (name: string) => {
     const n = normalize(name);
     if (!n) return undefined;
     let m = exerciseCatalog.find((c) => normalize(c.nome) === n);
     if (m) return m;
     m = exerciseCatalog.find((c) => {
       const cn = normalize(c.nome);
       return cn.includes(n) || n.includes(cn);
     });
     return m;
   };

   const getVariationsFor = (name: string) => {
     const entry = findCatalogEntry(name);
     const targetGroup = entry?.grupo_muscular ? normalize(entry.grupo_muscular) : '';
     const targetName = normalize(name);
     const list = exerciseCatalog.filter((c) => {
       if (normalize(c.nome) === targetName) return false;
       if (!targetGroup) return true;
       return normalize(c.grupo_muscular || '') === targetGroup;
     });
     // sort by nome
     return list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
   };

   const applyVariations = () => {
     const actions: AiEditAction[] = Object.entries(substitutions)
       .filter(([, name]) => !!name)
       .map(([idx, name]) => ({
         op: 'modify' as const,
         index: Number(idx),
         exercise: { exercise: name },
       }));
     if (actions.length === 0) {
       toast.error('Selecione ao menos uma substituição.');
       return;
     }
     onApply(actions);
     toast.success(`${actions.length} exercício(s) substituído(s).`);
     setSubstitutions({});
     onOpenChange(false);
   };
 
   const toggleOption = (optInstruction: string) => {
     setSelectedOptions(prev => 
       prev.includes(optInstruction) 
         ? prev.filter(i => i !== optInstruction) 
         : [...prev, optInstruction]
     );
   };
 
   const runWithInstruction = async () => {
     const combinedInstruction = [
       ...selectedOptions,
       instruction.trim()
     ].filter(Boolean).join('. ');
 
     if (!combinedInstruction) {
       toast.error('Selecione uma opção ou escreva uma instrução.');
       return;
     }
 
     const text = combinedInstruction;
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
       setSelectedOptions([]);
       onOpenChange(false);
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
            Use a IA para ajustes inteligentes ou substitua exercícios manualmente em "Variações".
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/60 pb-2">
          <Button
            type="button"
            variant={tab === 'ai' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('ai')}
            disabled={loading}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Edição com IA
          </Button>
          <Button
            type="button"
            variant={tab === 'variations' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab('variations')}
            disabled={loading}
            className="gap-1.5"
          >
            <Repeat className="h-3.5 w-3.5" />
            Variações
          </Button>
        </div>

        {tab === 'ai' && (
        <div className="space-y-4">
          {/* Quick options */}
          {GROUPS.map(group => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</p>
               <div className="flex flex-wrap gap-1.5">
                 {QUICK_OPTIONS.filter(o => o.group === group).map(opt => {
                   const isSelected = selectedOptions.includes(opt.instruction);
                   return (
                     <Button
                       key={opt.label}
                       variant={isSelected ? "default" : "outline"}
                       size="sm"
                       disabled={loading}
                       className={`h-7 text-xs transition-all rounded-full ${isSelected ? 'shadow-sm' : 'hover:bg-primary/5'}`}
                       onClick={() => toggleOption(opt.instruction)}
                     >
                       {opt.label}
                     </Button>
                   );
                 })}
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
        )}

        {tab === 'variations' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Selecione um exercício de substituição para cada item que deseja trocar. Mantém séries, reps e descanso atuais.
            </p>
            {currentExercises.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum exercício neste dia.</p>
            )}
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {currentExercises.map((ex, idx) => {
                const variations = getVariationsFor(ex.exercise);
                const selected = substitutions[idx] || '';
                return (
                  <div key={idx} className="rounded-md border border-border/60 p-2.5 space-y-1.5 bg-card/40">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate flex-1">{ex.exercise || `Exercício ${idx + 1}`}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                    <Select
                      value={selected}
                      onValueChange={(v) =>
                        setSubstitutions((prev) => {
                          const next = { ...prev };
                          if (!v || v === '__none__') delete next[idx];
                          else next[idx] = v;
                          return next;
                        })
                      }
                      disabled={loading}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={variations.length ? 'Escolher substituição...' : 'Sem variações no catálogo'} />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="__none__">— Manter exercício atual —</SelectItem>
                        {variations.map((v) => (
                          <SelectItem key={v.nome} value={v.nome}>
                            {v.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
           {tab === 'ai' ? (
             <Button
               onClick={() => runWithInstruction()}
               disabled={loading || (selectedOptions.length === 0 && !instruction.trim())}
             >
               {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
               Aplicar com IA
             </Button>
           ) : (
             <Button
               onClick={applyVariations}
               disabled={loading || Object.values(substitutions).filter(Boolean).length === 0}
             >
               <Repeat className="h-4 w-4 mr-1" />
               Aplicar substituições
             </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiEditExerciseDialog;