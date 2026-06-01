import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Wand2, Settings2, Activity, Dumbbell, Repeat, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ParsedExercise, ParsedTrainingDay } from '@/lib/trainingResultParser';
import { useIsMobile } from '@/hooks/use-mobile';

interface AiAllDaysAction {
  day: string;
  op: 'add' | 'modify' | 'remove' | 'replace';
  index?: number;
  match?: string;
  exercise?: Partial<ParsedExercise>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allDays: ParsedTrainingDay[];
  studentId: string;
  onApply: (updatedDays: ParsedTrainingDay[]) => void;
  mobilityCount?: number | null;
  mainExercisesCount?: number | null;
  onStructureChange?: (mobility: number | null, main: number | null) => void;
}

 const QUICK_OPTIONS: { label: string; instruction: string; category?: string }[] = [
   { label: '+ Core', instruction: 'Adicione 1-2 exercícios de core/abdômen ao final de cada dia de treino, variando entre supra, infra e estabilização.', category: 'Adicionar' },
   { label: '+ Mobilidade', instruction: 'Adicione 1-2 exercícios de mobilidade/ativação no início de cada dia, específicos para o grupo muscular daquele dia.', category: 'Adicionar' },
   { label: '↻ Variar Mobilidades', instruction: 'DIVERSIFIQUE OBRIGATORIAMENTE as mobilidades/aquecimentos de cada dia: SUBSTITUA (op "replace") as mobilidades atuais por opções DIFERENTES e VARIADAS dentro do banco, sempre RESPEITANDO o grupo muscular do dia (ex.: dia de INFERIORES → mobilidade de quadril, tornozelo, estabilidade de core/lombar, alongamentos dinâmicos de posterior e adutores; dia de SUPERIORES PUXAR → mobilidade torácica, escapular, ombro; dia de SUPERIORES EMPURRAR → mobilidade de ombro, peitoral, punho; dia de OMBRO → cuff rotador, escapular; dia de PEITO → mobilidade torácica e ombro; dia de COSTAS → torácica e escapular). Não repita os mesmos nomes entre dias e não mantenha as mesmas mobilidades atuais. Use no mínimo 2 variações diferentes por dia.', category: 'Variar' },
   { label: '↻ Variar Acessórios', instruction: 'Substitua (op "replace") os exercícios acessórios/isoladores atuais por variações DIFERENTES do mesmo grupo muscular do dia, mantendo volume e intensidade. Não repita os mesmos nomes entre dias.', category: 'Variar' },
   { label: '+ Quadríceps', instruction: 'Adicione 1-2 exercícios de Quadríceps em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Isquiotibiais', instruction: 'Adicione 1-2 exercícios de Isquiotibiais em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Peito', instruction: 'Adicione 1-2 exercícios de Peitoral em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Tríceps', instruction: 'Adicione 1-2 exercícios de Tríceps em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Bíceps', instruction: 'Adicione 1-2 exercícios de Bíceps em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Ombro', instruction: 'Adicione 1-2 exercícios de Ombro em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Dorsal', instruction: 'Adicione 1-2 exercícios de Dorsais em cada dia de treino.', category: 'Adicionar' },
   { label: '+ Reconhecimento', instruction: 'Adicione 1 série de reconhecimento (12 reps carga leve) antes das séries de trabalho nos 2 principais compostos de cada dia.', category: 'Adicionar' },
   { label: '↑ Intensidade', instruction: 'Aumente a intensidade de todos os dias: reduza RIR para 0-1 nos compostos, adicione drop-set ou rest-pause em 1 exercício de cada dia.', category: 'Ajustar' },
   { label: '↓ Volume', instruction: 'Reduza o volume de todos os dias: remova 1 exercício acessório por dia.', category: 'Ajustar' },
   { label: '↓ Pausa menor', instruction: 'Reduza o tempo de pausa para 45s nos isoladores e 60s nos compostos em todos os dias.', category: 'Tempo' },
   { label: '↑ Pausa maior', instruction: 'Aumente o tempo de pausa para 90-120s em todos os exercícios para priorizar recuperação total.', category: 'Tempo' },
   { label: 'Foco Hipertrofia', instruction: 'Ajuste as repetições para 8-12 e o descanso para 90-120s em todos os exercícios focando em hipertrofia.', category: 'Objetivo' },
   { label: 'Foco Força', instruction: 'Ajuste as repetições para 3-6 e o descanso para 3-5min nos exercícios multiarticulares.', category: 'Objetivo' },
   { label: 'Foco Definição', instruction: 'Ajuste as repetições para 15-20 e reduza o descanso para 30-45s em todos os exercícios.', category: 'Objetivo' },
   { label: 'Iniciante', instruction: 'Simplifique o treino para nível iniciante: foco em execução, repetições entre 12-15, sem técnicas avançadas.', category: 'Perfil' },
   { label: 'Intermediário', instruction: 'Ajuste para nível intermediário: adicione 1 técnica de intensidade por dia e RIR 1-2.', category: 'Perfil' },
   { label: 'Avançado', instruction: 'Torne o treino mais desafiador para nível avançado: adicione técnicas de intensidade e reduza o RIR para 0-1.', category: 'Perfil' },
   { label: 'Cardio HIIT', instruction: 'Adicione um protocolo de HIIT (ex: 20min sendo 1min forte / 1min leve) ao final de cada dia de treino.', category: 'Adicionar' },
   { label: 'Cardio LISS', instruction: 'Adicione um cardio de baixa intensidade (LISS) de 30-40min ao final de cada dia.', category: 'Adicionar' },
   { label: 'Antagonista', instruction: 'Reorganize o treino para usar o método Agonista-Antagonista (super-set entre músculos opostos) onde possível.', category: 'Método' },
   { label: 'Circuito', instruction: 'Transforme o treino de cada dia em um circuito: realize todos os exercícios em sequência com descanso apenas ao final da volta.', category: 'Método' },
 ];

const AiEditAllDaysDialog: React.FC<Props> = ({
  open, onOpenChange, allDays, studentId, onApply,
  mobilityCount, mainExercisesCount, onStructureChange
}) => {
   const [instruction, setInstruction] = useState('');
   const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const [tab, setTab] = useState<'ai' | 'variations'>('ai');
   const [activeDayIdx, setActiveDayIdx] = useState(0);
   const [catalog, setCatalog] = useState<Array<{ nome: string; grupo_muscular: string; imagem_url?: string | null }>>([]);
   // Substituições por dia: { [dayIdx]: { [exIdx]: nome } }
   const [subsByDay, setSubsByDay] = useState<Record<number, Record<number, string>>>({});
   const [varSubsByDay, setVarSubsByDay] = useState<Record<number, Record<number, string>>>({});
   const [aiSugByDay, setAiSugByDay] = useState<Record<number, Record<number, string[]>>>({});
   const [aiSugVarByDay, setAiSugVarByDay] = useState<Record<number, Record<number, string[]>>>({});
   const [selForAiByDay, setSelForAiByDay] = useState<Record<number, Record<number, boolean>>>({});
   const [selForAiVarByDay, setSelForAiVarByDay] = useState<Record<number, Record<number, boolean>>>({});
   const [batchAiLoading, setBatchAiLoading] = useState(false);
   const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);

   useEffect(() => {
     if (!open) return;
     (async () => {
       const { data } = await supabase
         .from('exercises')
         .select('nome, grupo_muscular, imagem_url')
         .order('nome');
       if (data) setCatalog(data as any);
     })();
   }, [open]);

   const normalize = (s: string) =>
     (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
       .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

   const findCatalogEntry = (name: string) => {
     const n = normalize(name);
     if (!n) return undefined;
     let m = catalog.find((c) => normalize(c.nome) === n);
     if (m) return m;
     m = catalog.find((c) => {
       const cn = normalize(c.nome);
       return cn.includes(n) || n.includes(cn);
     });
     return m;
   };

   const getVariationsFor = (name: string) => {
     const entry = findCatalogEntry(name);
     const targetGroup = entry?.grupo_muscular ? normalize(entry.grupo_muscular) : '';
     const targetName = normalize(name);
     return catalog
       .filter((c) => {
         if (normalize(c.nome) === targetName) return false;
         if (!targetGroup) return true;
         return normalize(c.grupo_muscular || '') === targetGroup;
       })
       .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
   };

   const Thumb: React.FC<{ name: string; size?: 'sm' | 'xs' }> = ({ name, size = 'sm' }) => {
     const url = findCatalogEntry(name)?.imagem_url || null;
     const dim = size === 'xs' ? 'h-6 w-6' : 'h-9 w-9';
     if (!url) {
       return (
         <div className={`${dim} shrink-0 rounded-md bg-muted/40 flex items-center justify-center border border-border/40`}>
           <Dumbbell className="h-3 w-3 text-muted-foreground" />
         </div>
       );
     }
     return (
       <img src={url} alt={name} loading="lazy"
         className={`${dim} shrink-0 rounded-md object-cover border border-border/40 bg-muted/40`} />
     );
   };

   const dayCount = (dayIdx: number) =>
     Object.values(subsByDay[dayIdx] || {}).filter(Boolean).length
     + Object.values(varSubsByDay[dayIdx] || {}).filter(Boolean).length;

   const totalSubs = allDays.reduce((acc, _d, i) => acc + dayCount(i), 0);

   const runBatchAiSuggestForDay = async (dayIdx: number) => {
     const day = allDays[dayIdx];
     const selMain = selForAiByDay[dayIdx] || {};
     const selVar = selForAiVarByDay[dayIdx] || {};
     const mainIdx = Object.entries(selMain).filter(([, v]) => v).map(([k]) => Number(k));
     const varIdx = Object.entries(selVar).filter(([, v]) => v).map(([k]) => Number(k));
     const targets: Array<{ idx: number; kind: 'main' | 'variation' }> = [
       ...mainIdx.map((idx) => ({ idx, kind: 'main' as const })),
       ...varIdx.map((idx) => ({ idx, kind: 'variation' as const })),
     ];
     if (targets.length === 0) {
       toast.error('Selecione 1 ou mais exercícios deste dia para a IA sugerir.');
       return;
     }
     setBatchAiLoading(true);
     let studentContext: any = undefined;
     try {
       if (studentId) {
         const { data } = await supabase
           .from('students_profile')
           .select('lesoes, restricoes, observacoes, objetivo')
           .eq('user_id', studentId)
           .maybeSingle();
         if (data) studentContext = data;
       }

       const usedNorms = new Set<string>();
       day.exercises.forEach((e, i) => {
         if (!mainIdx.includes(i)) usedNorms.add(normalize(e.exercise));
       });

       const newSubs = { ...(subsByDay[dayIdx] || {}) };
       const newSugs = { ...(aiSugByDay[dayIdx] || {}) };
       const newVarSubs = { ...(varSubsByDay[dayIdx] || {}) };
       const newVarSugs = { ...(aiSugVarByDay[dayIdx] || {}) };
       let success = 0;

       for (const { idx, kind } of targets) {
         const ex = day.exercises[idx];
         const baseName = kind === 'main' ? ex?.exercise : (ex?.variation || ex?.exercise);
         if (!baseName) continue;
         setAiLoadingKey(`${dayIdx}-${kind}-${idx}`);
         try {
           const { data, error } = await supabase.functions.invoke('training-edit-agent', {
             body: {
               dayName: day.day,
               currentExercises: day.exercises,
               instruction: `Sugira 6 variações/alternativas para o exercício "${baseName}" (posição ${idx}${kind === 'variation' ? ', campo VARIAÇÃO' : ''}). Todas DEVEM trabalhar o MESMO grupo muscular, vir EXCLUSIVAMENTE do BANCO DE EXERCÍCIOS, e ser DIFERENTES de "${baseName}"${kind === 'variation' && ex?.exercise ? ` e de "${ex.exercise}"` : ''} e dos outros exercícios já presentes no dia. Para cada candidato, retorne uma ação "replace" no índice ${idx} preenchendo apenas exercise.exercise (em MAIÚSCULAS). Retorne exatamente 6 ações, cada uma com um nome distinto.`,
               exerciseCatalog: catalog,
               studentContext,
             },
           });
           if (error) throw error;
           const actions: any[] = Array.isArray((data as any)?.actions) ? (data as any).actions : [];
           const names: string[] = [];
           const seen = new Set<string>();
           for (const a of actions) {
             const n = a?.exercise?.exercise?.trim();
             if (!n) continue;
             const nn = normalize(n);
             if (!nn || nn === normalize(baseName)) continue;
             if (seen.has(nn)) continue;
             seen.add(nn);
             names.push(n);
           }
           if (names.length) {
             const pick = names.find((n) => !usedNorms.has(normalize(n))) || names[0];
             if (kind === 'main') { newSugs[idx] = names; newSubs[idx] = pick; }
             else { newVarSugs[idx] = names; newVarSubs[idx] = pick; }
             usedNorms.add(normalize(pick));
             success++;
           }
         } catch (err) {
           console.error('AI variation failed for', dayIdx, idx, err);
         }
       }

       setSubsByDay((p) => ({ ...p, [dayIdx]: newSubs }));
       setAiSugByDay((p) => ({ ...p, [dayIdx]: newSugs }));
       setVarSubsByDay((p) => ({ ...p, [dayIdx]: newVarSubs }));
       setAiSugVarByDay((p) => ({ ...p, [dayIdx]: newVarSugs }));

       if (success === 0) toast.error('A IA não retornou variações. Tente novamente.');
       else {
         toast.success(`${success} substituição(ões) sugerida(s) pela IA em ${day.day}.`);
         setSelForAiByDay((p) => ({ ...p, [dayIdx]: {} }));
         setSelForAiVarByDay((p) => ({ ...p, [dayIdx]: {} }));
       }
     } catch (e: any) {
       console.error(e);
       toast.error('Erro IA: ' + (e?.message || 'falha'));
     } finally {
       setAiLoadingKey(null);
       setBatchAiLoading(false);
     }
   };

   const applyAllVariations = () => {
     if (totalSubs === 0) {
       toast.error('Selecione ao menos uma substituição.');
       return;
     }
     const updatedDays = allDays.map((day, dIdx) => {
       const mainMap = subsByDay[dIdx] || {};
       const varMap = varSubsByDay[dIdx] || {};
       if (!Object.keys(mainMap).length && !Object.keys(varMap).length) return day;
       const list = day.exercises.map((ex, i) => {
         const next = { ...ex };
         if (mainMap[i]) next.exercise = mainMap[i];
         if (varMap[i]) next.variation = varMap[i];
         return next;
       });
       return { ...day, exercises: list };
     });
     onApply(updatedDays);
     toast.success(`${totalSubs} substituição(ões) aplicada(s) em ${allDays.length} dias.`);
     setSubsByDay({}); setVarSubsByDay({});
     setAiSugByDay({}); setAiSugVarByDay({});
     setSelForAiByDay({}); setSelForAiVarByDay({});
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
      let studentContext: any = undefined;
      if (studentId) {
        const { data } = await supabase
          .from('students_profile')
          .select('lesoes, restricoes, observacoes, objetivo')
          .eq('user_id', studentId)
          .maybeSingle();
        if (data) studentContext = data;
      }

      // Fetch exercise catalog once
      const { data: catalog } = await supabase
        .from('exercises')
        .select('nome, grupo_muscular')
        .order('nome');

      const updatedDays = [...allDays];
      let totalActions = 0;
      let lastSummary = '';

      // Call AI for each day sequentially
      for (let i = 0; i < allDays.length; i++) {
        const day = allDays[i];
        const { data, error } = await supabase.functions.invoke('training-edit-agent', {
          body: {
            dayName: day.day,
            currentExercises: day.exercises,
            instruction: text,
            exerciseCatalog: catalog || [],
            studentContext,
          },
        });

        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);

        const actions = Array.isArray((data as any)?.actions) ? (data as any).actions : [];
        if (actions.length > 0) {
          updatedDays[i] = applyActionsToDay(day, actions);
          totalActions += actions.length;
          lastSummary = (data as any)?.summary || '';
        }
      }

      if (totalActions === 0) {
        toast.error('A IA não retornou alterações. Tente uma instrução mais específica.');
        return;
      }

       onApply(updatedDays);
       toast.success(`${totalActions} alteração(ões) em ${allDays.length} dias. ${lastSummary}`);
       setInstruction('');
       setSelectedOptions([]);
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
            Editar todos os dias com IA
          </DialogTitle>
          <DialogDescription>
            A instrução será aplicada em cada dia ({allDays.map(d => d.day).join(', ')}).
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/60 pb-2">
          <Button type="button" variant={tab === 'ai' ? 'default' : 'ghost'} size="sm"
            onClick={() => setTab('ai')} disabled={loading} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Ajuste com IA
          </Button>
          <Button type="button" variant={tab === 'variations' ? 'default' : 'ghost'} size="sm"
            onClick={() => setTab('variations')} disabled={loading} className="gap-1.5">
            <Repeat className="h-3.5 w-3.5" /> Variações
          </Button>
        </div>

        {tab === 'ai' && (
        <div className="space-y-4">
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-violet-500" />
              <h4 className="font-bold text-xs text-violet-700 uppercase tracking-widest">Estrutura da Sessão</h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Mobilidade
                </Label>
                <Select 
                  value={String(mobilityCount ?? 'auto')} 
                  onValueChange={(v) => onStructureChange?.(v === 'auto' ? null : parseInt(v), mainExercisesCount ?? null)}
                >
                  <SelectTrigger className="h-9 bg-card text-xs rounded-lg border-violet-500/20 text-foreground">
                    <SelectValue placeholder="Automático" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border shadow-xl z-[100] text-foreground">
                    <SelectItem value="auto" className="text-sm">Auto (IA)</SelectItem>
                    <SelectItem value="0" className="text-sm">0 exercícios</SelectItem>
                    <SelectItem value="1" className="text-sm">1 exercício</SelectItem>
                    <SelectItem value="2" className="text-sm">2 exercícios</SelectItem>
                    <SelectItem value="3" className="text-sm">3 exercícios</SelectItem>
                    <SelectItem value="4" className="text-sm">4 exercícios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Dumbbell className="h-3 w-3" /> Principais
                </Label>
                <Select 
                  value={String(mainExercisesCount ?? 'auto')} 
                  onValueChange={(v) => onStructureChange?.(mobilityCount ?? null, v === 'auto' ? null : parseInt(v))}
                >
                  <SelectTrigger className="h-9 bg-card text-xs rounded-lg border-violet-500/20 text-foreground">
                    <SelectValue placeholder="Automático" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border shadow-xl z-[100] text-foreground">
                    <SelectItem value="auto" className="text-sm">Auto (IA)</SelectItem>
                    <SelectItem value="4" className="text-sm">4 exercícios</SelectItem>
                    <SelectItem value="5" className="text-sm">5 exercícios</SelectItem>
                    <SelectItem value="6" className="text-sm">6 exercícios</SelectItem>
                    <SelectItem value="7" className="text-sm">7 exercícios</SelectItem>
                    <SelectItem value="8" className="text-sm">8 exercícios</SelectItem>
                    <SelectItem value="9" className="text-sm">9 exercícios</SelectItem>
                    <SelectItem value="10" className="text-sm">10 exercícios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

           <div className="space-y-3">
             {Array.from(new Set(QUICK_OPTIONS.map(o => o.category))).map(cat => (
               <div key={cat} className="space-y-1.5">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{cat}</p>
                 <div className="flex flex-wrap gap-1.5">
                   {QUICK_OPTIONS.filter(o => o.category === cat).map(opt => {
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
           </div>

          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Instrução livre
            </p>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='Ex: "adicionar core em todos os dias", "diminuir descanso geral", "trocar todos isoladores por compostos"...'
              rows={4}
              disabled={loading}
              className="text-sm resize-none"
            />
          </div>
        </div>
        )}

        {tab === 'variations' && (
          <div className="space-y-3">
            {/* Day buttons */}
            <div className="flex flex-wrap gap-1.5">
              {allDays.map((d, i) => {
                const count = dayCount(i);
                const active = activeDayIdx === i;
                return (
                  <Button key={i} type="button" size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="h-8 text-xs rounded-full gap-1.5"
                    onClick={() => setActiveDayIdx(i)} disabled={batchAiLoading}>
                    {d.day}
                    {count > 0 && (
                      <span className={`inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold ${active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'}`}>
                        {count}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* Per-day editor */}
            {(() => {
              const day = allDays[activeDayIdx];
              if (!day) return null;
              const subs = subsByDay[activeDayIdx] || {};
              const varSubs = varSubsByDay[activeDayIdx] || {};
              const aiSugs = aiSugByDay[activeDayIdx] || {};
              const aiSugsVar = aiSugVarByDay[activeDayIdx] || {};
              const selMain = selForAiByDay[activeDayIdx] || {};
              const selVar = selForAiVarByDay[activeDayIdx] || {};
              const allMainSel = day.exercises.length > 0 && day.exercises.every((_, i) => selMain[i]);
              const allVarSel = day.exercises.every((ex, i) => !ex.variation || selVar[i]);
              return (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border/60 bg-card/40 p-2.5">
                    <div className="text-xs text-muted-foreground">
                      Dia <strong>{day.day}</strong>: marque os exercícios e clique em <strong>IA sugere</strong>. As substituições ficam acumuladas por dia até você clicar em <strong>Aplicar substituições</strong>.
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs"
                        disabled={batchAiLoading || day.exercises.length === 0}
                        onClick={() => {
                          if (allMainSel && allVarSel) {
                            setSelForAiByDay((p) => ({ ...p, [activeDayIdx]: {} }));
                            setSelForAiVarByDay((p) => ({ ...p, [activeDayIdx]: {} }));
                          } else {
                            const m: Record<number, boolean> = {};
                            const v: Record<number, boolean> = {};
                            day.exercises.forEach((ex, i) => { m[i] = true; if (ex.variation) v[i] = true; });
                            setSelForAiByDay((p) => ({ ...p, [activeDayIdx]: m }));
                            setSelForAiVarByDay((p) => ({ ...p, [activeDayIdx]: v }));
                          }
                        }}>
                        {allMainSel && allVarSel ? 'Limpar' : 'Selecionar todos'}
                      </Button>
                      <Button type="button" size="sm" className="h-8 gap-1.5"
                        disabled={batchAiLoading}
                        onClick={() => runBatchAiSuggestForDay(activeDayIdx)}>
                        {batchAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        IA sugere
                      </Button>
                    </div>
                  </div>
                  {day.exercises.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Nenhum exercício neste dia.</p>
                  )}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {day.exercises.map((ex, idx) => {
                      const variations = getVariationsFor(ex.exercise);
                      const selected = subs[idx] || '';
                      const aiNames = aiSugs[idx] || [];
                      const baseNorms = new Set(variations.map((v) => normalize(v.nome)));
                      const aiOnly = aiNames.filter((n) => !baseNorms.has(normalize(n)));
                      const aiNormSet = new Set(aiNames.map((n) => normalize(n)));
                      const isChecked = !!selMain[idx];
                      const isAiLoading = aiLoadingKey === `${activeDayIdx}-main-${idx}`;
                      return (
                        <div key={idx} className={`rounded-md border p-2.5 space-y-1.5 transition-colors ${isChecked ? 'border-primary/60 bg-primary/5' : 'border-border/60 bg-card/40'}`}>
                          <div className="flex items-center gap-2 text-sm">
                            <Checkbox checked={isChecked}
                              onCheckedChange={(v) => setSelForAiByDay((prev) => {
                                const cur = { ...(prev[activeDayIdx] || {}) };
                                if (v) cur[idx] = true; else delete cur[idx];
                                return { ...prev, [activeDayIdx]: cur };
                              })}
                              disabled={batchAiLoading || !ex.exercise} />
                            <Thumb name={ex.exercise} />
                            <span className="font-medium truncate flex-1">{ex.exercise || `Exercício ${idx + 1}`}</span>
                            {isAiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                          <Select value={selected}
                            onValueChange={(v) => setSubsByDay((prev) => {
                              const cur = { ...(prev[activeDayIdx] || {}) };
                              if (!v || v === '__none__') delete cur[idx]; else cur[idx] = v;
                              return { ...prev, [activeDayIdx]: cur };
                            })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={variations.length ? 'Escolher substituição...' : 'Sem variações no catálogo'} />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="__none__">— Manter exercício atual —</SelectItem>
                              {aiOnly.map((n) => (
                                <SelectItem key={`ai-${n}`} value={n}>
                                  <span className="flex items-center gap-2"><Thumb name={n} size="xs" /><span>✨ {n}</span></span>
                                </SelectItem>
                              ))}
                              {variations.map((v) => {
                                const isAi = aiNormSet.has(normalize(v.nome));
                                return (
                                  <SelectItem key={v.nome} value={v.nome}>
                                    <span className="flex items-center gap-2"><Thumb name={v.nome} size="xs" /><span>{isAi ? '✨ ' : ''}{v.nome}</span></span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {aiNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {aiNames.map((n) => {
                                const isPicked = normalize(selected) === normalize(n);
                                return (
                                  <Button key={`chip-${n}`} type="button" size="sm"
                                    variant={isPicked ? 'default' : 'outline'}
                                    className="h-7 pl-1 pr-2 text-[11px] rounded-full gap-1"
                                    onClick={() => setSubsByDay((prev) => ({ ...prev, [activeDayIdx]: { ...(prev[activeDayIdx] || {}), [idx]: n } }))}>
                                    <Thumb name={n} size="xs" />
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {n}
                                  </Button>
                                );
                              })}
                            </div>
                          )}

                          {ex.variation && (() => {
                            const varVariations = getVariationsFor(ex.variation);
                            const selectedVar = varSubs[idx] || '';
                            const aiNamesVar = aiSugsVar[idx] || [];
                            const baseNormsVar = new Set(varVariations.map((v) => normalize(v.nome)));
                            const aiOnlyVar = aiNamesVar.filter((n) => !baseNormsVar.has(normalize(n)));
                            const aiNormSetVar = new Set(aiNamesVar.map((n) => normalize(n)));
                            const isCheckedVar = !!selVar[idx];
                            return (
                              <div className={`mt-1.5 rounded-md border p-2 space-y-1.5 transition-colors ${isCheckedVar ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-background/40'}`}>
                                <div className="flex items-center gap-2 text-xs">
                                  <Checkbox checked={isCheckedVar}
                                    onCheckedChange={(v) => setSelForAiVarByDay((prev) => {
                                      const cur = { ...(prev[activeDayIdx] || {}) };
                                      if (v) cur[idx] = true; else delete cur[idx];
                                      return { ...prev, [activeDayIdx]: cur };
                                    })}
                                    disabled={batchAiLoading} />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variação</span>
                                  <Thumb name={ex.variation} size="xs" />
                                  <span className="truncate flex-1">{ex.variation}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                </div>
                                <Select value={selectedVar}
                                  onValueChange={(v) => setVarSubsByDay((prev) => {
                                    const cur = { ...(prev[activeDayIdx] || {}) };
                                    if (!v || v === '__none__') delete cur[idx]; else cur[idx] = v;
                                    return { ...prev, [activeDayIdx]: cur };
                                  })}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={varVariations.length ? 'Escolher substituição da variação...' : 'Sem variações no catálogo'} />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-72">
                                    <SelectItem value="__none__">— Manter variação atual —</SelectItem>
                                    {aiOnlyVar.map((n) => (
                                      <SelectItem key={`aiv-${n}`} value={n}>
                                        <span className="flex items-center gap-2"><Thumb name={n} size="xs" /><span>✨ {n}</span></span>
                                      </SelectItem>
                                    ))}
                                    {varVariations.map((v) => {
                                      const isAi = aiNormSetVar.has(normalize(v.nome));
                                      return (
                                        <SelectItem key={`v-${v.nome}`} value={v.nome}>
                                          <span className="flex items-center gap-2"><Thumb name={v.nome} size="xs" /><span>{isAi ? '✨ ' : ''}{v.nome}</span></span>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                {aiNamesVar.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {aiNamesVar.map((n) => {
                                      const isPicked = normalize(selectedVar) === normalize(n);
                                      return (
                                        <Button key={`chipv-${n}`} type="button" size="sm"
                                          variant={isPicked ? 'default' : 'outline'}
                                          className="h-7 pl-1 pr-2 text-[11px] rounded-full gap-1"
                                          onClick={() => setVarSubsByDay((prev) => ({ ...prev, [activeDayIdx]: { ...(prev[activeDayIdx] || {}), [idx]: n } }))}>
                                          <Thumb name={n} size="xs" />
                                          <Sparkles className="h-2.5 w-2.5" />
                                          {n}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          {tab === 'ai' ? (
            <Button onClick={() => runWithInstruction()}
              disabled={loading || (selectedOptions.length === 0 && !instruction.trim())}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Aplicar em todos os dias
            </Button>
          ) : (
            <Button onClick={applyAllVariations} disabled={batchAiLoading || totalSubs === 0}>
              <Repeat className="h-4 w-4 mr-1" />
              Aplicar substituições{totalSubs > 0 ? ` (${totalSubs})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function applyActionsToDay(day: ParsedTrainingDay, actions: any[]): ParsedTrainingDay {
  let list = [...day.exercises];
  const norm = (s: string) =>
    (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  const findIdx = (action: any): number => {
    if (typeof action.index === 'number' && action.index >= 0 && action.index < list.length) return action.index;
    if (action.match) {
      const target = norm(action.match);
      let idx = list.findIndex((e) => norm(e.exercise) === target);
      if (idx >= 0) return idx;
      idx = list.findIndex((e) => norm(e.exercise).includes(target) || target.includes(norm(e.exercise)));
      return idx;
    }
    return -1;
  };

  const fill = (ex: any): ParsedExercise => ({
    exercise: ex?.exercise || '',
    series: ex?.series || '3',
    series2: ex?.series2 || '',
    reps: ex?.reps || '8-12',
    rir: ex?.rir || '',
    pause: ex?.pause || '60s',
    description: ex?.description || '',
    variation: ex?.variation || '',
  });

  for (const action of actions) {
    if (action.op === 'add') {
      const newEx = fill(action.exercise);
      if (!newEx.exercise) continue;
      if (typeof action.index === 'number' && action.index >= 0 && action.index <= list.length) {
        list.splice(action.index, 0, newEx);
      } else {
        list.push(newEx);
      }
    } else if (action.op === 'remove') {
      const idx = findIdx(action);
      if (idx >= 0) list.splice(idx, 1);
    } else if (action.op === 'replace') {
      const idx = findIdx(action);
      const newEx = fill(action.exercise);
      if (idx >= 0 && newEx.exercise) list[idx] = newEx;
      else if (newEx.exercise) list.push(newEx);
    } else if (action.op === 'modify') {
      const idx = findIdx(action);
      if (idx >= 0 && action.exercise) {
        list[idx] = { ...list[idx], ...action.exercise } as ParsedExercise;
      }
    }
  }

  return { ...day, exercises: list };
}

export default AiEditAllDaysDialog;