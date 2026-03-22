import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Dumbbell, UtensilsCrossed, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import DietResultCards from '@/components/DietResultCards';
import TrainingResultCards from '@/components/TrainingResultCards';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface AiPlansListProps {
  studentId: string;
}

const CopyableTable = ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => {
  const [copied, setCopied] = useState(false);
  const tableRef = React.useRef<HTMLTableElement>(null);

  const copyTable = useCallback(() => {
    if (!tableRef.current) return;
    // Select and copy as rich text (preserves table structure in Excel/Sheets)
    const range = document.createRange();
    range.selectNodeContents(tableRef.current);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('copy');
    selection?.removeAllRanges();
    setCopied(true);
    toast.success('Tabela copiada! Cole no Excel ou Google Sheets.');
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="relative group my-4">
      <Button
        variant="outline"
        size="sm"
        onClick={copyTable}
        className="absolute -top-3 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-xs gap-1 h-7"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copiado!' : 'Copiar tabela'}
      </Button>
      <div className="overflow-x-auto">
        <table
          ref={tableRef}
          {...props}
          className="w-full text-xs border-collapse select-text"
        >
          {children}
        </table>
      </div>
    </div>
  );
};

const markdownComponents = {
  table: CopyableTable as any,
  th: ({ children, ...props }: any) => (
    <th className="bg-muted p-2 border border-border text-left font-semibold select-text" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="p-2 border border-border select-text" {...props}>{children}</td>
  ),
};

const AiPlansList = ({ studentId }: AiPlansListProps) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    const { data } = await supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    setPlans(data ?? []);
  };

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) { toast.error('Erro ao deletar'); return; }
    toast.success('Plano deletado.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  if (plans.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          Nenhum treino ou dieta salvo ainda. Use o chat IA para gerar e salvar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Treinos & Dietas Salvos</h3>
      {plans.map(plan => (
        <Card key={plan.id} className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-3 flex-1 cursor-pointer"
                onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)}
              >
                {plan.tipo === 'treino' ? (
                  <Dumbbell className="h-5 w-5 text-primary shrink-0" />
                ) : (
                  <UtensilsCrossed className="h-5 w-5 text-green-500 shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">{plan.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {expandedId === plan.id ? <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive ml-2">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deletar plano?</AlertDialogTitle>
                    <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(plan.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Deletar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {expandedId === plan.id && (
              <div className="mt-4 pt-4 border-t border-border">
                {plan.tipo === 'dieta' ? (
                  <DietResultCards markdown={plan.conteudo} />
                ) : (
                  <TrainingResultCards markdown={plan.conteudo} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AiPlansList;
