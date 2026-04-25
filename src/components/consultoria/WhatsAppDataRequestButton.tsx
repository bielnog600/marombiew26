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

    // Transforma cada item em uma frase amigável, oferecendo ajuda em vez de cobrar
    const friendlyLines = (missingItems ?? []).map((item) => {
      const lower = item.toLowerCase();
      if (lower.includes('pesagem') || lower.includes('peso')) {
        return '⚖️ Consegue se pesar amanhã pela manhã, em jejum e após ir ao banheiro? É super rápido e me ajuda demais a calibrar seu plano.';
      }
      if (lower.includes('refeições') || lower.includes('refeicoes') || lower.includes('alimenta')) {
        return '🍽️ Quando puder, registra as refeições do dia no app — mesmo que seja só marcar as que você já fez. Não precisa ser perfeito!';
      }
      if (lower.includes('rpe') || lower.includes('esforço') || lower.includes('esforco')) {
        return '💪 Ao terminar o treino, marca o RPE (o quanto foi puxado de 1 a 10). Leva 2 segundos e me ajuda a ajustar a intensidade pra você.';
      }
      if (lower.includes('carga')) {
        return '🏋️ Se puder, anota as cargas que você está usando nos exercícios. Assim consigo planejar a progressão certa pra você.';
      }
      if (lower.includes('séries') || lower.includes('series') || lower.includes('exerc')) {
        return '✅ Tenta marcar as séries/exercícios concluídos no app durante o treino. Qualquer registro já me ajuda muito.';
      }
      if (lower.includes('treinos concluídos') || lower.includes('treinos concluidos') || lower.includes('frequ')) {
        return '📅 Sempre que treinar, dá um check no app. Se faltar algum dia, sem problema — me conta o que aconteceu pra gente ajustar juntos.';
      }
      if (lower.includes('água') || lower.includes('agua') || lower.includes('hidrat')) {
        return '💧 Se conseguir, vai marcando os copos de água no app. Pequenos registros já me dão um ótimo panorama.';
      }
      if (lower.includes('sono') || lower.includes('humor') || lower.includes('energia')) {
        return '😴 Quando lembrar, registra como está seu sono e energia. Esses dados me ajudam a entender seu contexto além do treino.';
      }
      return `• ${item}`;
    });

    const itemsBlock = friendlyLines.length > 0
      ? `\n\nPra eu te ajudar melhor, se conseguir essa semana:\n\n${friendlyLines.join('\n\n')}`
      : '';

    const msg =
      `Oi ${firstName}, tudo bem? 😊\n\n` +
      `Tô aqui revisando ${planLabel} pra deixar tudo certinho pra próxima fase e queria te ajudar a tirar o melhor proveito possível.${itemsBlock}\n\n` +
      `Sem pressão e sem cobrança, tá? Qualquer dificuldade me chama por aqui que a gente resolve junto. Tô torcendo por você! 🙌`;

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