import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  if (plan.whatsapp_notified_at) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const isAdjust = (plan.whatsapp_notified_count ?? 0) > 0;
    const firstName = (name || 'aluno').split(' ')[0];
    const noun =
      plan.tipo === 'treino' ? 'treino'
      : plan.tipo === 'tabata' ? 'protocolo de Tabata'
      : plan.tipo === 'cardio' ? 'protocolo de cardio'
      : 'dieta';
    const verb = isAdjust ? 'foi ajustado(a) e já está disponível' : 'já está liberado(a) no app';

    const msg = isAdjust
      ? `Oi ${firstName}! 💪\n\nFiz alguns ajustes no seu *${noun}* ("${plan.titulo}") e ${verb}. Pode abrir o app pra conferir as novidades.\n\nQualquer dúvida me chama por aqui! 🙌`
      : `Oi ${firstName}! 🚀\n\nSeu novo *${noun}* ("${plan.titulo}") ${verb}. É só abrir o app pra começar!\n\nBons treinos e qualquer dúvida me chama por aqui. 🙌`;

    const cleaned = (phone ?? '').replace(/\D/g, '');
    const withDdi = cleaned.length === 10 || cleaned.length === 11 ? `55${cleaned}` : cleaned;
    const url = withDdi
      ? `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    const now = new Date().toISOString();
    const newCount = (plan.whatsapp_notified_count ?? 0) + 1;
    const { error } = await supabase
      .from('ai_plans')
      .update({ whatsapp_notified_at: now, whatsapp_notified_count: newCount })
      .eq('id', plan.id);

    if (error) {
      toast.error('Não foi possível registrar o envio.');
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