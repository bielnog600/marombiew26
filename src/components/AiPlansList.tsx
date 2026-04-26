import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Dumbbell, UtensilsCrossed, ChevronDown, ChevronUp, Pencil, ClipboardCheck, Flame, HeartPulse, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useNavigate } from 'react-router-dom';
import DietResultCards from '@/components/DietResultCards';
import TrainingResultCards from '@/components/TrainingResultCards';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import DietReadjustmentDialog from '@/components/DietReadjustmentDialog';

interface AiPlansListProps {
  studentId: string;
  tipos?: string[];
}


const AiPlansList = ({ studentId, tipos }: AiPlansListProps) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readjustPlanId, setReadjustPlanId] = useState<string | null>(null);
  const [studentPhone, setStudentPhone] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>('aluno');

  useEffect(() => {
    loadPlans();
    loadStudent();
  }, [studentId, tipos?.join(',')]);

  const loadStudent = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('nome, telefone')
      .eq('user_id', studentId)
      .maybeSingle();
    setStudentPhone(data?.telefone ?? null);
    setStudentName(data?.nome || 'aluno');
  };

  const loadPlans = async () => {
    let query = supabase
      .from('ai_plans')
      .select('*')
      .eq('student_id', studentId);
    if (tipos && tipos.length > 0) {
      query = query.in('tipo', tipos);
    }
    const { data } = await query.order('created_at', { ascending: false });
    setPlans(data ?? []);
  };

  const handleDelete = async (planId: string) => {
    const { error } = await supabase.from('ai_plans').delete().eq('id', planId);
    if (error) { toast.error('Erro ao deletar'); return; }
    toast.success('Plano deletado.');
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  const planTypeLabel = (tipo: string, isAdjust: boolean) => {
    const noun = tipo === 'treino'
      ? 'treino'
      : tipo === 'tabata'
      ? 'protocolo de Tabata'
      : tipo === 'cardio'
      ? 'protocolo de cardio'
      : 'dieta';
    return { noun, verb: isAdjust ? 'foi ajustado(a) e já está disponível' : 'já está liberado(a) no app' };
  };

  const handleNotifyWhatsApp = async (plan: any) => {
    const isAdjust = (plan.whatsapp_notified_count ?? 0) > 0;
    const firstName = (studentName || 'aluno').split(' ')[0];
    const { noun, verb } = planTypeLabel(plan.tipo, isAdjust);

    const msg = isAdjust
      ? `Oi ${firstName}! 💪\n\nFiz alguns ajustes no seu *${noun}* ("${plan.titulo}") e ${verb}. Pode abrir o app pra conferir as novidades.\n\nQualquer dúvida me chama por aqui! 🙌`
      : `Oi ${firstName}! 🚀\n\nSeu novo *${noun}* ("${plan.titulo}") ${verb}. É só abrir o app pra começar!\n\nBons treinos e qualquer dúvida me chama por aqui. 🙌`;

    const cleaned = (studentPhone ?? '').replace(/\D/g, '');
    const withDdi = cleaned.length === 10 || cleaned.length === 11 ? `55${cleaned}` : cleaned;
    const url = withDdi
      ? `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('ai_plans')
      .update({
        whatsapp_notified_at: now,
        whatsapp_notified_count: (plan.whatsapp_notified_count ?? 0) + 1,
      })
      .eq('id', plan.id);

    if (error) {
      toast.error('Não foi possível registrar o envio.');
      return;
    }
    setPlans(prev => prev.map(p => p.id === plan.id
      ? { ...p, whatsapp_notified_at: now, whatsapp_notified_count: (p.whatsapp_notified_count ?? 0) + 1 }
      : p));
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
                ) : plan.tipo === 'tabata' ? (
                  <Flame className="h-5 w-5 text-primary shrink-0" />
                ) : plan.tipo === 'cardio' ? (
                  <HeartPulse className="h-5 w-5 text-primary shrink-0" />
                ) : (
                  <UtensilsCrossed className="h-5 w-5 text-primary shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">{plan.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(plan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {expandedId === plan.id ? <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />}
              </div>
              {plan.tipo === 'dieta' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-primary ml-1"
                  title="Questionário de Reajuste"
                  onClick={() => setReadjustPlanId(plan.id)}
                >
                  <ClipboardCheck className="w-4 h-4" />
                </Button>
              )}
              {!plan.whatsapp_notified_at && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10 ml-1"
                  title={
                    (plan.whatsapp_notified_count ?? 0) > 0
                      ? 'Avisar aluno sobre ajuste (WhatsApp)'
                      : 'Avisar aluno que está liberado (WhatsApp)'
                  }
                  onClick={() => handleNotifyWhatsApp(plan)}
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-primary ml-1"
                onClick={() => {
                  const route = plan.tipo === 'treino'
                    ? `/treino-ia/${studentId}?edit=${plan.id}`
                    : plan.tipo === 'tabata'
                    ? `/tabata-ia/${studentId}?edit=${plan.id}`
                    : plan.tipo === 'cardio'
                    ? `/cardio-ia/${studentId}?edit=${plan.id}`
                    : `/dieta-ia/${studentId}?edit=${plan.id}`;
                  navigate(route);
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive ml-1">
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
                ) : plan.tipo === 'tabata' ? (
                  <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-sm">
                    {plan.conteudo}
                  </div>
                ) : plan.tipo === 'cardio' ? (
                  <pre className="text-[10px] text-muted-foreground bg-secondary/40 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {plan.conteudo}
                  </pre>
                ) : (
                  <TrainingResultCards markdown={plan.conteudo} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {readjustPlanId && (
        <DietReadjustmentDialog
          open={!!readjustPlanId}
          onOpenChange={(open) => { if (!open) setReadjustPlanId(null); }}
          planId={readjustPlanId}
          studentId={studentId}
        />
      )}
    </div>
  );
};

export default AiPlansList;
