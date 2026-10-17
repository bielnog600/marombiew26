import React, { useEffect, useState } from 'react';
import { normalizeWorkoutPlan, workoutPlanToParsedDays } from '@/lib/workoutSchema';
import { executionSummary } from '@/lib/workoutExecutionMethods';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 import { normalizeWhatsAppPhone } from '@/lib/phone';
 import { buildDietWhatsAppMessage, resolveDietWhatsAppState, DIET_WHATSAPP_VARIATION_COUNT } from '@/lib/dietWhatsAppMessage';
 import { buildPlanWhatsAppMessage, PLAN_WHATSAPP_VARIATION_COUNT, type PlanWhatsAppGender } from '@/lib/planWhatsAppMessage';
 import { nextPlanWhatsAppMessageIndex } from '@/lib/whatsAppMessageVariation';

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
  /** Mostra o texto "WhatsApp" ao lado do ícone. */
  showLabel?: boolean;
  /** Mantém o botão visível mesmo depois do primeiro envio (reenvio). */
  alwaysVisible?: boolean;
  variant?: 'ghost' | 'outline';
  className?: string;
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
const WhatsAppNotifyPlanButton: React.FC<Props> = ({
  plan,
  studentId,
  onNotified,
  showLabel = false,
  alwaysVisible = false,
  variant = 'ghost',
  className,
}) => {
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
 
   if (notified && !alwaysVisible) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Fetch fresh plan data to get full content for macro extraction if it's a diet
    const { data: freshPlan, error: fetchError } = await supabase
      .from('ai_plans')
      .select('conteudo, conteudo_json, protocols, tipo, titulo, whatsapp_notified_at, whatsapp_notified_count, is_draft, version, published_at')
      .eq('id', plan.id)
      .maybeSingle();

    if (fetchError || !freshPlan) {
      toast.error('Erro ao carregar dados do plano.');
      return;
    }

    const isAdjust = (freshPlan.whatsapp_notified_count ?? 0) > 0;
    const firstName = (name || 'aluno').split(' ')[0];

    let noun = '';
    let gender: PlanWhatsAppGender = 'm'; // default masculine
    
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

    const seed = nextPlanWhatsAppMessageIndex(
      studentId,
      freshPlan.tipo,
      freshPlan.tipo === 'dieta' ? DIET_WHATSAPP_VARIATION_COUNT : PLAN_WHATSAPP_VARIATION_COUNT,
    );

    let msg = freshPlan.tipo === 'dieta'
      ? buildDietWhatsAppMessage({
          firstName,
          seed,
          plan: {
            titulo: freshPlan.titulo,
            conteudo_json: (freshPlan as any).conteudo_json,
            protocols: (freshPlan as any).protocols,
          },
          resendState: resolveDietWhatsAppState(
            freshPlan.whatsapp_notified_count,
            (freshPlan as any).whatsapp_notified_at,
          ),
        })
      : buildPlanWhatsAppMessage({ firstName, noun, gender, titulo: freshPlan.titulo, state: isAdjust ? 'adjusted' : 'new', seed });

    if (freshPlan.tipo === 'treino') {
      const workout = normalizeWorkoutPlan(freshPlan.conteudo_json);
      const summaries = workout ? workoutPlanToParsedDays(workout).flatMap(day => day.exercises.filter(ex => executionSummary(ex)).map(ex => `${day.day} · ${ex.exercise}: ${executionSummary(ex)}`)) : [];
      if (summaries.length) msg += `\n\n${summaries.join('\n')}`;
    }

    const withDdi = normalizeWhatsAppPhone(phone);
    const url = withDdi 
      ? `whatsapp://send?phone=${withDdi}&text=${encodeURIComponent(msg)}`
      : `whatsapp://send?text=${encodeURIComponent(msg)}`;
    
    // On mobile/iPhone, directly setting location.href is often more reliable than window.open
    // for custom protocols like whatsapp://
    try {
      window.location.href = url;
    } catch (err) {
      // Fallback to web link if protocol fails
      const webUrl = withDdi
        ? `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }

    // Now update state and database
    const now = new Date().toISOString();
    const newCount = (freshPlan.whatsapp_notified_count ?? 0) + 1;
    
    // Persist to database
    const { error } = await supabase
      .from('ai_plans')
      .update({ whatsapp_notified_at: now, whatsapp_notified_count: newCount })
      .eq('id', plan.id);

    if (error) {
      toast.error('Erro ao registrar envio.');
      return;
    }

    // Only update UI after successful DB update
    setNotified(true);
    onNotified?.(plan.id, now, newCount);
  };

  const isAdjust = (plan.whatsapp_notified_count ?? 0) > 0;

  return (
    <Button
      variant={variant}
      size="sm"
      className={
        className ??
        (showLabel
          ? 'h-8 gap-1.5 rounded-xl px-3 text-xs text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10 border-[#25D366]/30'
          : 'h-7 gap-1 px-2 text-xs text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10')
      }
      title={isAdjust ? 'Avisar aluno sobre ajuste (WhatsApp)' : 'Avisar aluno que está liberado (WhatsApp)'}
      onClick={handleClick}
    >
      <MessageCircle className={showLabel ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      {showLabel && 'WhatsApp'}
    </Button>
  );
};

export default WhatsAppNotifyPlanButton;