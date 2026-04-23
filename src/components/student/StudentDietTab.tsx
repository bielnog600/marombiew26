import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UtensilsCrossed, ChevronDown, ChevronUp, Pencil, Save, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import DietResultCards from '@/components/DietResultCards';
import { Textarea } from '@/components/ui/textarea';

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
  const [editedMarkdowns, setEditedMarkdowns] = useState<Record<string, string>>({});
  const [showRawId, setShowRawId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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

  const handleMarkdownChange = (planId: string, value: string) => {
    setEditedMarkdowns(prev => ({ ...prev, [planId]: value }));
  };

  const handleSave = async (planId: string) => {
    const newContent = editedMarkdowns[planId];
    if (newContent === undefined) return;

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
      setEditedMarkdowns(prev => { const c = { ...prev }; delete c[planId]; return c; });
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
        const hasChanges = editedMarkdowns[plan.id] !== undefined;
        const currentMarkdown = editedMarkdowns[plan.id] ?? plan.conteudo;
        const isShowingRaw = showRawId === plan.id;
        const cleanedMarkdown = stripDietPreamble(currentMarkdown);

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
                      title={isShowingRaw ? 'Voltar à pré-visualização' : 'Editar conteúdo'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRawId(isShowingRaw ? null : plan.id);
                      }}
                    >
                      {isShowingRaw ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                      {isShowingRaw ? 'Visualizar' : 'Editar'}
                    </Button>
                  )}
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
                  {isShowingRaw ? (
                    <Textarea
                      value={currentMarkdown}
                      onChange={(e) => handleMarkdownChange(plan.id, e.target.value)}
                      className="min-h-[400px] font-mono text-xs"
                      placeholder="Conteúdo em markdown..."
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
