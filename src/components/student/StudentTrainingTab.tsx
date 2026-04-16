import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Dumbbell, Save, Loader2, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import TrainingResultCards from '@/components/TrainingResultCards';
import {
  TRAINING_PHASES,
  PHASE_LABELS,
  PHASE_BADGE_CLASS,
  PHASE_DESCRIPTIONS,
  getPhasePreview,
  type TrainingPhase,
} from '@/lib/trainingPhase';

interface StudentTrainingTabProps {
  studentId: string;
}

const StudentTrainingTab: React.FC<StudentTrainingTabProps> = ({ studentId }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editedMarkdowns, setEditedMarkdowns] = useState<Record<string, string>>({});
  const [editedPhases, setEditedPhases] = useState<Record<string, TrainingPhase>>({});
  const [editedStartDates, setEditedStartDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    const { data } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .eq('tipo', 'treino')
      .order('created_at', { ascending: false });
    setPlans(data ?? []);
  };

  const handleMarkdownChange = (planId: string, newMarkdown: string) => {
    setEditedMarkdowns(prev => ({ ...prev, [planId]: newMarkdown }));
  };

  const handlePhaseChange = (planId: string, phase: TrainingPhase) => {
    setEditedPhases(prev => ({ ...prev, [planId]: phase }));
  };

  const handleStartDateChange = (planId: string, date: string) => {
    setEditedStartDates(prev => ({ ...prev, [planId]: date }));
  };

  const handleSave = async (planId: string) => {
    const updates: Record<string, any> = {};
    if (editedMarkdowns[planId] !== undefined) updates.conteudo = editedMarkdowns[planId];
    if (editedPhases[planId] !== undefined) updates.fase = editedPhases[planId];
    if (editedStartDates[planId] !== undefined) {
      updates.fase_inicio_data = editedStartDates[planId] || null;
    }
    if (Object.keys(updates).length === 0) return;

    setSaving(planId);
    const { error } = await supabase.from('ai_plans').update(updates).eq('id', planId);

    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } else {
      toast.success('Treino salvo com sucesso!');
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, ...updates } : p));
      setEditedMarkdowns(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedPhases(prev => { const c = { ...prev }; delete c[planId]; return c; });
      setEditedStartDates(prev => { const c = { ...prev }; delete c[planId]; return c; });
    }
    setSaving(null);
  };

  if (plans.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          Nenhum treino gerado ainda. Use a aba IA para gerar treinos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const isExpanded = expandedId === plan.id;
        const currentPhase = (editedPhases[plan.id] ?? plan.fase ?? 'semana_1') as TrainingPhase;
        const currentStartDate = editedStartDates[plan.id] ?? plan.fase_inicio_data ?? '';
        const hasChanges =
          !!editedMarkdowns[plan.id] ||
          editedPhases[plan.id] !== undefined ||
          editedStartDates[plan.id] !== undefined;
        const currentMarkdown = editedMarkdowns[plan.id] || plan.conteudo;

        return (
          <Card key={plan.id} className="glass-card">
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : plan.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Dumbbell className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{plan.titulo}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PHASE_BADGE_CLASS[currentPhase]}`}>
                        {PHASE_LABELS[currentPhase]}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasChanges && (
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
                  {/* Periodização */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fase semanal</Label>
                      <Select value={currentPhase} onValueChange={(v) => handlePhaseChange(plan.id, v as TrainingPhase)}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRAINING_PHASES.map(p => (
                            <SelectItem key={p} value={p}>
                              <div className="flex flex-col">
                                <span className="font-medium">{PHASE_LABELS[p]}</span>
                                <span className="text-[10px] text-muted-foreground">{PHASE_DESCRIPTIONS[p]}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Início do ciclo (auto)
                      </Label>
                      <Input
                        type="date"
                        value={currentStartDate}
                        onChange={(e) => handleStartDateChange(plan.id, e.target.value)}
                        className="h-9 text-sm"
                      />
                      {(() => {
                        const preview = getPhasePreview(currentStartDate);
                        if (!preview) return null;
                        return (
                          <p className="text-[10px] text-muted-foreground">
                            Hoje: dia {preview.daysIn + 1} do ciclo →{' '}
                            <span className="text-primary font-semibold">{PHASE_LABELS[preview.phase]}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  <TrainingResultCards
                    markdown={currentMarkdown}
                    editable={true}
                    trainingOnly={true}
                    onMarkdownChange={(newMd) => handleMarkdownChange(plan.id, newMd)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StudentTrainingTab;
