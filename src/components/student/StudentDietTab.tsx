import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UtensilsCrossed, ChevronDown, ChevronUp, Pencil, Save, Loader2, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import DietResultCards from '@/components/DietResultCards';
import DietPlanEditor from '@/components/diet/DietPlanEditor';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { replaceMealTableInMarkdown } from '@/lib/dietMarkdownSerializer';
import type { ParsedMeal } from '@/lib/dietResultParser';
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
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: newContent } : p));
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

  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const isExpanded = expandedId === plan.id;
        const hasChanges = editedMeals[plan.id] !== undefined;
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
                  <div>
                    <p className="font-medium text-sm">{plan.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isExpanded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
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
                      {isEditing ? 'Visualizar' : 'Editar'}
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
  );
};

export default StudentDietTab;
