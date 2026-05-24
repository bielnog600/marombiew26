import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Flame, 
  Save, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Wand2, 
  Zap, 
  RefreshCw,
  Play,
  ClipboardCheck
} from 'lucide-react';
import { toast } from 'sonner';
import WhatsAppNotifyPlanButton from '@/components/WhatsAppNotifyPlanButton';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { parseTabata } from '@/lib/tabataParser';

interface StudentTabataTabProps {
  studentId: string;
}

const StudentTabataTab: React.FC<StudentTabataTabProps> = ({ studentId }) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .eq('tipo', 'tabata')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });
    setPlans(data ?? []);
    setLoading(false);
  };

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) {
      toast.error('Erro ao deletar: ' + error.message);
      return;
    }
    toast.success('Tabata deletado.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          Nenhum treino Tabata gerado ainda. Use o Agente de Tabata para criar treinos HIIT.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const isExpanded = expandedId === plan.id;
        const parsed = parseTabata(plan.conteudo_json || plan.conteudo);
        const totalExercises = parsed.blocks.reduce((sum, b) => sum + b.exercises.length, 0);

        return (
          <Card key={plan.id} className="glass-card overflow-hidden">
            <CardContent className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : plan.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <Flame className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{plan.titulo || parsed.title || 'Tabata HIIT'}</p>
                      {plan.migration_status === 'completed' && (
                        <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase text-emerald-500 border-emerald-500/30">Híbrido</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {new Date(plan.created_at).toLocaleDateString('pt-BR')} • {parsed.duration || `${parsed.blocks.length} blocos`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/tabata-execucao', { state: { tabata: parsed } });
                    }}
                  >
                    <Play className="h-3 w-3" /> Player
                  </Button>
                  
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
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Deletar Tabata?</AlertDialogTitle>
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
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-wrap gap-2 pb-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 gap-1.5 text-xs rounded-xl bg-primary/5 border-primary/20"
                      onClick={() => navigate(`/tabata-ia/${studentId}?edit=${plan.id}`)}
                    >
                      <Wand2 className="h-3.5 w-3.5 text-primary" />
                      Ajustar com IA
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 gap-1.5 text-xs rounded-xl bg-orange-500/5 border-orange-500/20 text-orange-600"
                      onClick={() => navigate(`/tabata-ia/${studentId}?edit=${plan.id}&mode=adjust`)}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Ajuste Rápido
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 gap-1.5 text-xs rounded-xl bg-blue-500/5 border-blue-500/20 text-blue-600"
                      onClick={() => navigate(`/tabata-ia/${studentId}`)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Novo Tabata
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 gap-1.5 text-xs rounded-xl"
                      onClick={() => toast.info("Check-in de Tabata em breve")}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Check-in
                    </Button>
                  </div>

                  <div className="bg-secondary/30 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Configuração</span>
                      <Badge variant="secondary" className="text-[10px]">{parsed.level?.toUpperCase() || 'MODERADO'}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-background/50 rounded-lg border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase">Blocos</p>
                        <p className="text-sm font-bold">{parsed.blocks.length}</p>
                      </div>
                      <div className="p-2 bg-background/50 rounded-lg border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase">Exercícios</p>
                        <p className="text-sm font-bold">{totalExercises}</p>
                      </div>
                    </div>
                    <div className="p-2 bg-background/50 rounded-lg border border-border/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Objetivo</p>
                      <p className="text-xs">{parsed.objective || 'Queima calórica e condicionamento'}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Estrutura do Treino</p>
                    <div className="text-[11px] text-muted-foreground bg-secondary/20 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">
                      {plan.conteudo}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StudentTabataTab;