import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UtensilsCrossed, ChevronDown, ChevronUp, Pencil, Save, Loader2, Eye, Trash2, Percent } from 'lucide-react';
import { toast } from 'sonner';
import DietResultCards from '@/components/DietResultCards';
import DietPlanEditor from '@/components/diet/DietPlanEditor';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { replaceMealTableInMarkdown, scaleMealsToMacroTargets, computeDayTotals } from '@/lib/dietMarkdownSerializer';
import type { ParsedMeal } from '@/lib/dietResultParser';
import { parseSections } from '@/lib/dietResultParser';
import { extractTargetsFromSections } from '@/lib/dietTargets';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface StudentDietTabProps {
  studentId: string;
}

/**
 * Strip the TMB / GET / macro calculation preamble that the AI adds before
 * the actual meal plan. We keep only content from the first menu/meal heading
 * (e.g. "## CARDÁPIO", "## Opção", "## Refeição") or the first markdown table.
 */
const stripDietPreamble = (markdown: string): string => {
  if (!markdown) return markdown;
  const lines = markdown.split('\n');
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const lower = l.toLowerCase();

    // First menu/meal heading
    if (l.match(/^#{1,3}\s/) && (
      lower.includes('card') ||
      lower.includes('opç') || lower.includes('opc') ||
      lower.includes('refei') ||
      lower.includes('café') || lower.includes('cafe') ||
      lower.includes('almoço') || lower.includes('almoco') ||
      lower.includes('jantar') || lower.includes('lanche') ||
      lower.includes('ceia') || lower.includes('pré-treino') ||
      lower.includes('pre-treino') || lower.includes('pós-treino') || lower.includes('pos-treino')
    )) {
      cutIndex = i;
      break;
    }

    // First markdown table that looks like a meal plan (Refeição/Alimento)
    if (l.startsWith('|') && (lower.includes('refei') || lower.includes('alimento'))) {
      // Walk back to include any heading right above the table
      let start = i;
      for (let k = i - 1; k >= 0 && i - k <= 3; k--) {
        const prev = lines[k].trim();
        if (!prev) continue;
        if (prev.startsWith('#') || prev.startsWith('**')) { start = k; break; }
        break;
      }
      cutIndex = start;
      break;
    }
  }

  return cutIndex > 0 ? lines.slice(cutIndex).join('\n') : markdown;
};

const StudentDietTab: React.FC<StudentDietTabProps> = ({ studentId }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedMeals, setEditedMeals] = useState<Record<string, ParsedMeal[]>>({});
  const [aiNotes, setAiNotes] = useState<Record<string, string[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [macroModalPlanId, setMacroModalPlanId] = useState<string | null>(null);
  const [macroPct, setMacroPct] = useState({ protein: 30, carbs: 50, fat: 20 });

   // Compute actual macro totals for any plan (used for summary in the list and modal)
   const getPlanTotals = useCallback((markdown: string) => {
     const sections = parseSections(markdown);
     const meals = sections.flatMap(s => s.type === 'meal' && s.meals ? s.meals : []);
     if (!meals.length) return null;
     return computeDayTotals(meals);
   }, []);
 
   const modalPlanTotals = useMemo(() => {
     if (!macroModalPlanId) return null;
     const plan = plans.find(p => p.id === macroModalPlanId);
     if (!plan) return null;
     return getPlanTotals(plan.conteudo);
   }, [macroModalPlanId, plans, getPlanTotals]);

  // When opening the modal, set sliders to match current macro distribution
  const openMacroModal = useCallback((planId: string) => {
    setMacroModalPlanId(planId);
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const sections = parseSections(plan.conteudo);
    const meals = sections.flatMap(s => s.type === 'meal' && s.meals ? s.meals : []);
    if (!meals.length) return;
    const t = computeDayTotals(meals);
    if (t.kcal <= 0) return;
    const pPct = Math.round((t.p * 4 / t.kcal) * 100);
    const gPct = Math.round((t.g * 9 / t.kcal) * 100);
    const cPct = 100 - pPct - gPct;
    setMacroPct({ protein: pPct, carbs: cPct, fat: gPct });
  }, [plans]);

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Dieta deletada.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    const { data } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .eq('tipo', 'dieta')
      .order('created_at', { ascending: false });
    setPlans(data ?? []);
  };

  const handleMealsChange = (planId: string, meals: ParsedMeal[]) => {
    setEditedMeals(prev => ({ ...prev, [planId]: meals }));
  };

  const handleSave = async (planId: string) => {
    const meals = editedMeals[planId];
    if (!meals) return;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    let newContent = replaceMealTableInMarkdown(plan.conteudo, meals);
    const notes = aiNotes[planId];
    if (notes && notes.length) {
      newContent = `${newContent.trimEnd()}\n\n## 📝 Observações da IA\n\n${notes.join('\n\n')}\n`;
    }

    setSaving(planId);
    const { error } = await supabase
      .from('ai_plans')
      .update({ conteudo: newContent })
      .eq('id', planId);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Dieta salva com sucesso!');
       setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: newContent, whatsapp_notified_at: null } : p));
      setEditedMeals(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setAiNotes(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditingId(null);
    }
    setSaving(null);
  };

  if (plans.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          Nenhuma dieta gerada ainda. Use a aba IA para gerar dietas.
        </CardContent>
      </Card>
    );
  }

  const handleApplyMacroPct = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    try {
      const sections = parseSections(plan.conteudo);
      const meals = sections.flatMap(s => s.type === 'meal' && s.meals ? s.meals : []);
      if (!meals.length) { toast.error('Nenhuma refeição encontrada.'); return; }
      const totals = computeDayTotals(meals);
      if (totals.kcal <= 0) { toast.error('Não foi possível calcular calorias da dieta.'); return; }
      const kcal = totals.kcal;
      const newTarget = {
        kcal,
        p: Math.round((kcal * macroPct.protein / 100) / 4),
        c: Math.round((kcal * macroPct.carbs / 100) / 4),
        g: Math.round((kcal * macroPct.fat / 100) / 9),
      };
      const scaled = scaleMealsToMacroTargets(meals, newTarget);
      const newContent = replaceMealTableInMarkdown(plan.conteudo, scaled);
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: newContent } : p));
      setEditedMeals(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setMacroModalPlanId(null);
      toast.success('Macros ajustados por %!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao ajustar macros');
    }
  };

  const pctSum = macroPct.protein + macroPct.carbs + macroPct.fat;

  return (
    <>
    <div className="space-y-3">
      {plans.map(plan => {
        const isExpanded = expandedId === plan.id;
        const hasChanges = editedMeals[plan.id] !== undefined || (aiNotes[plan.id]?.length || 0) > 0;
        const isEditing = editingId === plan.id;
        const cleanedMarkdown = stripDietPreamble(plan.conteudo);

         return (
           <Card key={plan.id} className="glass-card">
             <CardContent className="p-4">
               <div
                 className="flex items-center justify-between cursor-pointer"
                 onClick={() => setExpandedId(isExpanded ? null : plan.id)}
               >
                 <div className="flex items-center gap-3">
                   <UtensilsCrossed className="h-5 w-5 text-green-500 shrink-0" />
                   <div className="flex-1 min-w-0">
                     <p className="font-medium text-sm truncate">{plan.titulo}</p>
                     <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                       <p className="text-xs text-muted-foreground">
                         {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                       </p>
                       {!isExpanded && (
                         <>
                           <span className="text-[10px] text-muted-foreground hidden xs:inline">•</span>
                           {(() => {
                             const t = getPlanTotals(plan.conteudo);
                             if (!t || t.kcal <= 0) return null;
                             return (
                               <div className="flex items-center gap-2 text-[10px] font-medium text-primary">
                                 <span>{Math.round(t.kcal)} kcal</span>
                                 <div className="flex gap-1.5 text-muted-foreground">
                                   <span>P: {Math.round(t.p)}g</span>
                                   <span>C: {Math.round(t.c)}g</span>
                                   <span>G: {Math.round(t.g)}g</span>
                                 </div>
                               </div>
                             );
                           })()}
                         </>
                       )}
                     </div>
                   </div>
                 </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isExpanded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs sm:px-2 sm:gap-1"
                      title={isEditing ? 'Voltar à pré-visualização' : 'Editar dieta'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(isEditing ? null : plan.id);
                        if (isEditing) {
                          // discard pending edits when leaving editor without saving
                          setEditedMeals(prev => { const c = { ...prev }; delete c[plan.id]; return c; });
                        }
                      }}
                    >
                      {isEditing ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      <span className="hidden sm:inline">{isEditing ? 'Visualizar' : 'Editar'}</span>
                    </Button>
                  )}
                  {isExpanded && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Ajustar macros por %"
                        onClick={(e) => { e.stopPropagation(); openMacroModal(plan.id); }}
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <WhatsAppNotifyPlanButton
                    plan={plan}
                    studentId={studentId}
                    onNotified={(planId, notifiedAt, count) =>
                      setPlans(prev => prev.map(p =>
                        p.id === planId ? { ...p, whatsapp_notified_at: notifiedAt, whatsapp_notified_count: count } : p
                      ))
                    }
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Deletar dieta"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deletar dieta?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(plan.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Deletar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {isExpanded && hasChanges && (
                    <Button
                      size="sm"
                      className="h-7 gap-1 px-3 text-xs"
                      disabled={saving === plan.id}
                      onClick={(e) => { e.stopPropagation(); handleSave(plan.id); }}
                    >
                      {saving === plan.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Salvar
                    </Button>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border">
                  {isEditing ? (
                    <DietPlanEditor
                      markdown={plan.conteudo}
                      onMealsChange={(meals) => handleMealsChange(plan.id, meals)}
                      studentId={studentId}
                      onAiNotes={(notes) => setAiNotes(prev => ({ ...prev, [plan.id]: [...(prev[plan.id] || []), ...notes] }))}
                    />
                  ) : (
                    <DietResultCards markdown={cleanedMarkdown} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>

    <Dialog open={!!macroModalPlanId} onOpenChange={(o) => !o && setMacroModalPlanId(null)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Ajustar macros por %</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {(['protein', 'carbs', 'fat'] as const).map((key) => {
              const labels = { protein: 'Proteína', carbs: 'Carboidrato', fat: 'Gordura' };
              const totalKcal = modalPlanTotals ? modalPlanTotals.kcal : 0;
              const divisor = key === 'fat' ? 9 : 4;
              const grams = totalKcal > 0 ? Math.round((totalKcal * macroPct[key] / 100) / divisor) : 0;
              const currentGrams = modalPlanTotals
                ? Math.round(key === 'protein' ? modalPlanTotals.p : key === 'carbs' ? modalPlanTotals.c : modalPlanTotals.g)
                : 0;
              return (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>{labels[key]} <span className="text-muted-foreground font-normal">(atual: {currentGrams}g)</span></Label>
                    <span className="font-bold">{macroPct[key]}% — <span className="text-primary">{grams}g</span></span>
                  </div>
                  <Slider
                    min={5} max={70} step={1}
                    value={[macroPct[key]]}
                    onValueChange={([v]) => setMacroPct(prev => ({ ...prev, [key]: v }))}
                  />
                </div>
              );
            })}
            <p className={`text-xs text-center ${pctSum !== 100 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
              Total: {pctSum}% {pctSum !== 100 && '(deve somar 100%)'}
            </p>
            <Button
              className="w-full"
              disabled={pctSum !== 100}
              onClick={() => macroModalPlanId && handleApplyMacroPct(macroModalPlanId)}
            >
              Aplicar
            </Button>
          </div>
        </DialogContent>
    </Dialog>
    </>
  );
};

export default StudentDietTab;
