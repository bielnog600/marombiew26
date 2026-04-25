import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

interface Props {
  phone?: string | null;
  studentName?: string | null;
  planType: 'dieta' | 'treino';
  rationale?: string | null;
  dataQuality?: string | null;
  suggestedAction?: string | null;
  missingItems?: string[];
}

/**
 * Botão que aparece quando a IA detecta dados insuficientes
 * (data_quality = 'insuficiente' ou 'parcial', ou suggested_action = 'solicitar_dados').
 * Abre o WhatsApp com mensagem pré-preenchida pedindo os registros que faltam.
 */
const WhatsAppDataRequestButton: React.FC<Props> = ({
  phone,
  studentName,
  planType,
  rationale,
  dataQuality,
  suggestedAction,
  missingItems,
}) => {
  const shouldShow = useMemo(() => {
    if (suggestedAction === 'solicitar_dados') return true;
    if (dataQuality && ['insuficiente', 'parcial', 'baixa', 'low'].includes(dataQuality.toLowerCase())) return true;
    return false;
  }, [dataQuality, suggestedAction]);

  if (!shouldShow) return null;

  const handleClick = () => {
    const firstName = (studentName ?? 'aluno').split(' ')[0];
    const planLabel = planType === 'dieta' ? 'sua dieta' : 'seu treino';
    const itemsLine = missingItems && missingItems.length > 0
      ? `\n\nPreciso especialmente de:\n${missingItems.map((i) => `• ${i}`).join('\n')}`
      : '';
    const aiNote = rationale ? `\n\nResumo da análise:\n"${rationale.slice(0, 280)}${rationale.length > 280 ? '…' : ''}"` : '';
    const msg =
      `Olá ${firstName}! Tudo bem? 💪\n\n` +
      `Estou revisando ${planLabel} e percebi que faltam alguns dados importantes para eu fazer o melhor ajuste possível.${itemsLine}${aiNote}\n\n` +
      `Pode atualizar essas informações no app esta semana? Qualquer dúvida me chama por aqui!`;

    const cleaned = (phone ?? '').replace(/\D/g, '');
    // Adiciona DDI Brasil se faltar
    const withDdi = cleaned.length === 10 || cleaned.length === 11 ? `55${cleaned}` : cleaned;
    const url = withDdi
      ? `https://wa.me/${withDdi}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10 hover:text-[#25D366]"
      onClick={handleClick}
      title={phone ? `Enviar para ${phone}` : 'Abrir WhatsApp (sem número cadastrado)'}
    >
      <MessageCircle className="h-3 w-3" />
      {phone ? 'Solicitar dados (WhatsApp)' : 'WhatsApp (sem número)'}
    </Button>
  );
};

export default WhatsAppDataRequestButton;