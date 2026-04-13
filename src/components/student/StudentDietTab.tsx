import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { UtensilsCrossed, ChevronDown, ChevronUp, Pencil, Save, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import DietResultCards from '@/components/DietResultCards';
import { Textarea } from '@/components/ui/textarea';

interface StudentDietTabProps {
  studentId: string;
}

const StudentDietTab: React.FC<StudentDietTabProps> = ({ studentId }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMarkdown, setEditMarkdown] = useState('');
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

  const startEditing = (planId: string, content: string) => {
    setEditingId(planId);
    setEditMarkdown(content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditMarkdown('');
  };

  const handleSave = async (planId: string) => {
    setSaving(planId);
    const { error } = await supabase
      .from('ai_plans')
      .update({ conteudo: editMarkdown })
      .eq('id', planId);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Dieta salva com sucesso!');
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, conteudo: editMarkdown } : p));
      setEditingId(null);
      setEditMarkdown('');
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
        const isEditing = editingId === plan.id;

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
                <div className="flex items-center gap-2">
                  {isExpanded && !isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={(e) => { e.stopPropagation(); startEditing(plan.id, plan.conteudo); }}
                    >
                      <Pencil className="h-3 w-3" /> Editar Markdown
                    </Button>
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editMarkdown}
                        onChange={(e) => setEditMarkdown(e.target.value)}
                        className="min-h-[400px] font-mono text-xs"
                        placeholder="Conteúdo em markdown..."
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={cancelEditing}>
                          <X className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={saving === plan.id}
                          onClick={() => handleSave(plan.id)}
                        >
                          {saving === plan.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                          Salvar
                        </Button>
                      </div>
                      <div className="pt-4 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">Pré-visualização:</p>
                        <DietResultCards markdown={editMarkdown} />
                      </div>
                    </div>
                  ) : (
                    <DietResultCards markdown={plan.conteudo} />
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
