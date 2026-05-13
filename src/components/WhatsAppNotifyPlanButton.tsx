import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 import { parseSections } from '@/lib/dietResultParser';
 import { computeDayTotals } from '@/lib/dietMarkdownSerializer';

interface Props {
  plan: {
    id: string;
    tipo: string;
    titulo: string;
    whatsapp_notified_at?: string | null;
    whatsapp_notified_count?: number | null;
  };
  studentId: string;
  onNotified?: (planId: string, notifiedAt: string, count: number) => void;
}

/**
 * Botão de WhatsApp que aparece ao lado do "Editar" nos cards de planos da IA
 * (treino, dieta, cardio, tabata) na área de Alunos do admin.
 *
 * Regras:
 * - Só aparece quando `whatsapp_notified_at` é null (plano novo OU recém-editado).
 * - Ao clicar: abre wa.me com mensagem ("liberado" ou "ajustado") e marca o plano
 *   como notificado, sumindo até a próxima edição.
 * - O reset automático em edições é feito por trigger no banco.
 */
const WhatsAppNotifyPlanButton: React.FC<Props> = ({ plan, studentId, onNotified }) => {
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState<string>('aluno');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('nome, telefone')
        .eq('user_id', studentId)
        .maybeSingle();
      if (cancelled) return;
      setPhone(data?.telefone ?? null);
      setName(data?.nome || 'aluno');
    })();
    return () => { cancelled = true; };
  }, [studentId]);

   const [notified, setNotified] = useState(!!plan.whatsapp_notified_at);
 
   useEffect(() => {
     setNotified(!!plan.whatsapp_notified_at);
   }, [plan.whatsapp_notified_at]);
 
   if (notified) return null;

   const handleClick = async (e: React.MouseEvent) => {
     e.stopPropagation();
     
     // Fetch fresh plan data to get full content for macro extraction if it's a diet
     const { data: freshPlan, error: fetchError } = await supabase
       .from('ai_plans')
       .select('conteudo, tipo, titulo, whatsapp_notified_count')
       .eq('id', plan.id)
       .maybeSingle();
 
     if (fetchError || !freshPlan) {
       toast.error('Erro ao carregar dados do plano.');
       return;
     }
 
     const isAdjust = (freshPlan.whatsapp_notified_count ?? 0) > 0;
     const firstName = (name || 'aluno').split(' ')[0];
 
     let noun = '';
     let gender = 'm'; // default masculine
     
     if (freshPlan.tipo === 'treino') {
       noun = 'treino';
       gender = 'm';
     } else if (freshPlan.tipo === 'tabata') {
       noun = 'protocolo de Tabata';
       gender = 'm';
     } else if (freshPlan.tipo === 'cardio') {
       noun = 'protocolo de cardio';
       gender = 'm';
     } else if (freshPlan.tipo === 'dieta') {
       noun = 'dieta';
       gender = 'f';
     } else {
       noun = 'plano';
       gender = 'm';
     }
 
     const verb = isAdjust 
       ? (gender === 'm' ? 'foi ajustado e já está disponível' : 'foi ajustada e já está disponível')
       : (gender === 'm' ? 'já está liberado no app' : 'já está liberada no app');
 
     let macroInfo = '';
     if (freshPlan.tipo === 'dieta' && freshPlan.conteudo) {
       const sections = parseSections(freshPlan.conteudo);
       const meals = sections.flatMap(s => s.type === 'meal' && s.meals ? s.meals : []);
       if (meals.length > 0) {
         const t = computeDayTotals(meals);
         if (t.kcal > 0) {
           macroInfo = `\n\n📊 *Meta diária:*\n🔥 ${Math.round(t.kcal)} kcal\n🥩 ${Math.round(t.p)}g Proteína\n🍞 ${Math.round(t.c)}g Carbo\n🥑 ${Math.round(t.g)}g Gordura`;
         }
       }
     }
 
     const msg = isAdjust
       ? `Oi ${firstName}! 💪\n\nFiz alguns ajustes na sua *${noun}* ("${freshPlan.titulo}") e ${verb}.${macroInfo}\n\nPode abrir o app pra conferir as novidades. Qualquer dúvida me chama por aqui! 🙌`
       : `Oi ${firstName}! 🚀\n\nSua nova *${noun}* ("${freshPlan.titulo}") ${verb}.${macroInfo}\n\nÉ só abrir o app pra começar! Bons treinos e qualquer dúvida me chama por aqui. 🙌`;

    const cleaned = (phone ?? '').replace(/\D/g, '');
    const withDdi = cleaned.length === 10 || cleaned.length === 11 ? `55${cleaned}` : cleaned;
    const url = withDdi
      ? `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

     // The state update is handled by the parent component re-loading data 
     // or the local state in this component, but to ensure it updates immediately
     // in the UI without waiting for a full refetch if possible.
     const now = new Date().toISOString();
     const newCount = (freshPlan.whatsapp_notified_count ?? 0) + 1;
     
     // Update local state first for immediate UI feedback
     setNotified(true);
 
     // Persist to database
     const { error } = await supabase
       .from('ai_plans')
       .update({ whatsapp_notified_at: now, whatsapp_notified_count: newCount })
       .eq('id', plan.id);
 
     if (error) {
       setNotified(false);
       toast.error('Erro ao registrar envio.');
       return;
     }
 
     onNotified?.(plan.id, now, newCount);
  };

  const isAdjust = (plan.whatsapp_notified_count ?? 0) > 0;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10"
      title={isAdjust ? 'Avisar aluno sobre ajuste (WhatsApp)' : 'Avisar aluno que está liberado (WhatsApp)'}
      onClick={handleClick}
    >
      <MessageCircle className="h-3 w-3" />
    </Button>
  );
};

export default WhatsAppNotifyPlanButton;