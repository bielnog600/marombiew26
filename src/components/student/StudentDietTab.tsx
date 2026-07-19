import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UtensilsCrossed, ChevronDown, ChevronUp, Pencil, Save, Loader2, Eye, Trash2, Percent, Wand2, Zap, RefreshCw, ClipboardCheck } from 'lucide-react';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import DietResultCards from '@/components/DietResultCards';
import DietPlanEditor from '@/components/diet/DietPlanEditor';
import AiEditDietDialog from '@/components/diet/AiEditDietDialog';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { replaceMealTableInMarkdown, replaceMealTablesPerDayInMarkdown, scaleMealsToMacroTargets, computeDayTotals, dietPlanToMarkdown } from '@/lib/dietMarkdownSerializer';
import { parsedMealsToDietPlan } from '@/lib/dietPlanAdapter';
import { finalizeDietPlan } from '@/lib/dietValidation';
import type { ParsedMeal } from '@/lib/dietResultParser';
import { parseSections } from '@/lib/dietResultParser';
import { parseDietPlanLoose, type DietPlan } from '@/lib/dietSchema';
import DietValidationBadge from '@/components/diet/DietValidationBadge';
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

const stripDietPreamble = (markdown: string): string => {
  if (!markdown) return markdown;
  const lines = markdown.split('\n');
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const lower = l.toLowerCase();

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

    if (l.startsWith('|') && (lower.includes('refei') || lower.includes('alimento'))) {
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
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedMeals, setEditedMeals] = useState<Record<string, ParsedMeal[]>>({});
  const [editedDays, setEditedDays] = useState<Record<string, { label: string; meals: ParsedMeal[] }[]>>({});
  const [aiNotes, setAiNotes] = useState<Record<string, string[]>>({});
  const [editedPlans, setEditedPlans] = useState<Record<string, DietPlan>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [macroModalPlanId, setMacroModalPlanId] = useState<string | null>(null);
  const [macroPct, setMacroPct] = useState({ protein: 30, carbs: 50, fat: 20 });
  const [aiDialogPlanId, setAiDialogPlanId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  /**
   * Extract meals for a SINGLE day from the diet markdown. When a diet has
   * multiple meal tables (carb cycle expanded into 7 weekdays, alternative
   * "Cardápio/Opção" blocks, etc.), flattening every section would duplicate
   * each meal N times — inflating totals and, when re-applying carb_cycle,
   * producing a 49×-duplicated diet. Always take the first meal block only.
   */
  const extractSingleDayMeals = useCallback((markdown: string): ParsedMeal[] => {
    const sections = parseSections(markdown);
    const mealSections = sections.filter(s => s.type === 'meal' && s.meals && s.meals.length > 0);
    if (mealSections.length === 0) return [];
    const firstDay = [...(mealSections[0].meals || [])];
    // Dedupe by meal name + time (case-insensitive) — recovers diets previously
    // corrupted by the old bug that 7×-duplicated meals inside one day, while
    // still preserving two valid snacks named "Lanche" at different times.
    const seen = new Set<string>();
    const deduped: ParsedMeal[] = [];
    for (const m of firstDay) {
      const key = `${String(m.name || '').trim().toLowerCase()}__${String(m.time || '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(m);
    }
    return deduped;
  }, []);

  const getPlanTotals = useCallback((markdown: string) => {
    const meals = extractSingleDayMeals(markdown);
    if (!meals.length) return null;
    return computeDayTotals(meals);
  }, [extractSingleDayMeals]);

  const modalPlanTotals = useMemo(() => {
    if (!macroModalPlanId) return null;
    const plan = plans.find(p => p.id === macroModalPlanId);
    if (!plan) return null;
    return getPlanTotals(plan.conteudo);
  }, [macroModalPlanId, plans, getPlanTotals]);

  const openMacroModal = useCallback((planId: string) => {
    setMacroModalPlanId(planId);
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const meals = extractSingleDayMeals(plan.conteudo);
    if (!meals.length) return;
    const t = computeDayTotals(meals);
    if (t.kcal <= 0) return;
    const pPct = Math.round((t.p * 4 / t.kcal) * 100);
    const gPct = Math.round((t.g * 9 / t.kcal) * 100);
    const cPct = 100 - pPct - gPct;
    setMacroPct({ protein: pPct, carbs: cPct, fat: gPct });
  }, [plans, extractSingleDayMeals]);

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) { toast.error('Erro ao deletar: ' + error.message); return; }
    toast.success('Dieta deletada.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  const handleDuplicate = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setDuplicatingId(planId);
    try {
      const today = new Date();
      const dateLabel = today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const payload: Record<string, unknown> = {
        student_id: plan.student_id,
        tipo: 'dieta',
        titulo: `${plan.titulo || 'Dieta'} (cópia ${dateLabel})`,
        conteudo: plan.conteudo,
        conteudo_json: plan.conteudo_json ?? null,
        migration_status: plan.migration_status ?? null,
        fase: plan.fase ?? null,
        is_draft: false,
      };
      const { data, error } = await supabase.from('ai_plans').insert(payload as any).select('*').single();
      if (error) throw error;
      toast.success('Dieta duplicada!');
      setPlans(prev => [data, ...prev]);
    } catch (e: any) {
      toast.error('Erro ao duplicar: ' + (e?.message || 'falha'));
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleAiApply = async (
    planId: string,
    newMeals: ParsedMeal[],
    notes: string[],
    newPlan?: DietPlan,
    days?: { label: string; meals: ParsedMeal[] }[],
  ) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    let newContent: string;
    if (days && days.length > 1) {
      // Carb cycle / per-weekday output → write one table per day
      newContent = replaceMealTablesPerDayInMarkdown(plan.conteudo, days);
    } else if (newPlan) {
      newContent = dietPlanToMarkdown(newPlan);
    } else {
      newContent = replaceMealTableInMarkdown(plan.conteudo, newMeals);
    }
    if (notes && notes.length) {
      newContent = `${newContent.trimEnd()}\n\n## 📝 Observações da IA\n\n${notes.join('\n\n')}\n`;
    }
    const updatePayload: Record<string, unknown> = { conteudo: newContent, whatsapp_notified_at: null };
    if (newPlan) {
      updatePayload.conteudo_json = newPlan as any;
      updatePayload.migration_status = 'completed';
    }
    const { error } = await supabase.from('ai_plans').update(updatePayload).eq('id', planId);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: newContent, conteudo_json: newPlan ?? p.conteudo_json, whatsapp_notified_at: null } : p));
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
    const rows = data ?? [];
    // Dedupe by normalized título: consecutive saves/regenerations of the
    // same diet were producing 2-3 identical rows ("Dieta - 03/07/2026").
    // Keep the most recent per título and hard-delete the older twins so
    // the list — and the student portal — always show a single source of
    // truth for that plan.
    const seen = new Map<string, any>();
    const dupIds: string[] = [];
    for (const p of rows) {
      const key = String(p.titulo || '').trim().toLowerCase().replace(/\s*\(c[óo]pia[^)]*\)\s*/gi, '').trim();
      if (!key) { seen.set(String(p.id), p); continue; }
      if (seen.has(key)) {
        dupIds.push(p.id);
      } else {
        seen.set(key, p);
      }
    }
    const deduped = rows.filter(p => !dupIds.includes(p.id));
    setPlans(deduped);
    if (dupIds.length > 0) {
      // Fire-and-forget cleanup; failure is non-fatal (RLS/network).
      supabase.from('ai_plans').delete().in('id', dupIds).then(({ error }) => {
        if (error) console.warn('duplicate cleanup skipped:', error.message);
      });
    }
  };

  const handleMealsChange = (planId: string, meals: ParsedMeal[]) => {
    setEditedMeals(prev => ({ ...prev, [planId]: meals }));
  };

  const handleDaysChange = (planId: string, days: { label: string; meals: ParsedMeal[] }[]) => {
    setEditedDays(prev => ({ ...prev, [planId]: days }));
  };

  const handlePlanChange = (planId: string, plan: DietPlan) => {
    setEditedPlans(prev => ({ ...prev, [planId]: plan }));
  };

  const handleSave = async (planId: string) => {
    const meals = editedMeals[planId];
    const daysEdit = editedDays[planId];
    const updatedPlan = editedPlans[planId];
    if (!meals && !updatedPlan && !daysEdit) return;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    // When we have a canonical updated plan, derive markdown from it so the
    // two representations stay in sync; otherwise patch the table only.
    let newContent = updatedPlan
      ? dietPlanToMarkdown(updatedPlan)
      : (daysEdit && daysEdit.length > 1
          ? replaceMealTablesPerDayInMarkdown(plan.conteudo, daysEdit)
          : replaceMealTableInMarkdown(plan.conteudo, (daysEdit?.[0]?.meals ?? meals)!));
    const notes = aiNotes[planId];
    if (notes && notes.length) {
      newContent = `${newContent.trimEnd()}\n\n## 📝 Observações da IA\n\n${notes.join('\n\n')}\n`;
    }

    setSaving(planId);
    const updatePayload: Record<string, unknown> = { conteudo: newContent };
    if (updatedPlan) {
      updatePayload.conteudo_json = updatedPlan as any;
      updatePayload.migration_status = 'completed';
    }
    const { error } = await supabase
      .from('ai_plans')
      .update(updatePayload)
      .eq('id', planId);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Dieta salva com sucesso!');
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: newContent, conteudo_json: updatedPlan ?? p.conteudo_json, whatsapp_notified_at: null } : p));
      setEditedMeals(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedDays(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedPlans(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setAiNotes(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditingId(null);
    }
    setSaving(null);
  };

  const handleApplyMacroPct = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    try {
      const meals = extractSingleDayMeals(plan.conteudo);
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
          const hasChanges = editedMeals[plan.id] !== undefined || editedDays[plan.id] !== undefined || editedPlans[plan.id] !== undefined || (aiNotes[plan.id]?.length || 0) > 0;
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{plan.titulo}</p>
                        {plan.migration_status === 'completed' && (
                          <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase text-emerald-500 border-emerald-500/30">JSON</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs text-muted-foreground">
                          {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                        {(() => {
                          const parsed = parseDietPlanLoose(plan.conteudo_json);
                          return parsed?.validation ? (
                            <DietValidationBadge report={parsed.validation} className="ml-1" />
                          ) : null;
                        })()}
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
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(isEditing ? null : plan.id);
                          if (isEditing) {
                            setEditedMeals(prev => { const c = { ...prev }; delete c[plan.id]; return c; });
                            setEditedDays(prev => { const c = { ...prev }; delete c[plan.id]; return c; });
                          }
                        }}
                      >
                        {isEditing ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                        <span className="hidden sm:inline">{isEditing ? 'Visualizar' : 'Editar'}</span>
                      </Button>
                    )}
                    {isExpanded && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openMacroModal(plan.id); }}
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </Button>
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
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    {/* Ações Híbridas - Central de Ação Individual */}
                    <div className="flex flex-wrap gap-2 pb-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-primary/5 border-primary/20"
                        onClick={() => setAiDialogPlanId(plan.id)}
                      >
                        <Wand2 className="h-3.5 w-3.5 text-primary" />
                        Ajustar com IA
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs rounded-xl border-border"
                        disabled={duplicatingId === plan.id}
                        onClick={() => handleDuplicate(plan.id)}
                      >
                        {duplicatingId === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        Duplicar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-orange-500/5 border-orange-500/20 text-orange-600"
                        onClick={() => navigate(`/dieta-ia/${studentId}?edit=${plan.id}&mode=adjust`)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Ajuste Rápido
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl bg-blue-500/5 border-blue-500/20 text-blue-600"
                        onClick={() => navigate(`/dieta-ia/${studentId}`)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Nova Dieta
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 text-xs rounded-xl border-amber-500/30 text-amber-600"
                        onClick={() => toast.info('Check-in solicitado')}
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Feedback
                      </Button>
                    </div>

                    {isEditing ? (
                      <DietPlanEditor
                        markdown={plan.conteudo}
                        onMealsChange={(meals) => handleMealsChange(plan.id, meals)}
                        onDaysChange={(days) => handleDaysChange(plan.id, days)}
                        studentId={studentId}
                        onAiNotes={(notes) => setAiNotes(prev => ({ ...prev, [plan.id]: [...(prev[plan.id] || []), ...notes] }))}
                        currentPlan={editedPlans[plan.id] ?? parseDietPlanLoose(plan.conteudo_json)}
                        onPlanChange={(p) => handlePlanChange(plan.id, p)}
                        weeklySchedule={(plan as any).protocols?.weekly_energy_schedule ?? null}
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

      {(() => {
        const aiPlan = aiDialogPlanId ? plans.find(p => p.id === aiDialogPlanId) : null;
        if (!aiPlan) return null;
        const sections = parseSections(aiPlan.conteudo);
        // Use only the FIRST day's meals — otherwise a diet already expanded
        // into 7 weekdays would feed 7× duplicated meals to the AI editor,
        // which then expands carb_cycle into a 49× duplicated diet.
        const meals = extractSingleDayMeals(aiPlan.conteudo);
        const canonical = parseDietPlanLoose(aiPlan.conteudo_json);
        const totals = computeDayTotals(meals);
        const fallbackTargets: any = canonical?.targets ?? extractTargetsFromSections(sections) ?? {
          kcal: Math.round(totals.kcal),
          p: Math.round(totals.p),
          c: Math.round(totals.c),
          g: Math.round(totals.g),
        };
        return (
          <AiEditDietDialog
            open={!!aiDialogPlanId}
            onOpenChange={(o) => !o && setAiDialogPlanId(null)}
            currentMeals={meals}
            studentId={studentId}
            currentPlan={canonical}
            targets={fallbackTargets}
            onApply={(newMeals, notes, newPlan, days) => handleAiApply(aiPlan.id, newMeals, notes, newPlan, days)}
          />
        );
      })()}
    </>
  );
};

export default StudentDietTab;
