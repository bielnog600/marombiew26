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
        return '⚖️ *Pesagem*\nConsegue se pesar amanhã pela manhã, em jejum e após ir ao banheiro?\n👉 No app: *Perfil → Meu Progresso → Registrar peso*. Leva 10 segundos e me ajuda muito a calibrar seu plano.';
      }
      if (lower.includes('refeições') || lower.includes('refeicoes') || lower.includes('alimenta')) {
        return '🍽️ *Refeições do dia*\nQuando fizer cada refeição, é só marcar como concluída — não precisa ser perfeito.\n👉 No app: *Home → Dieta de hoje → tocar na refeição → Marcar como feita*.';
      }
      if (lower.includes('rpe') || lower.includes('esforço') || lower.includes('esforco')) {
        return '💪 *RPE (esforço percebido)*\nAo finalizar o treino, marca de 1 a 10 o quanto foi puxado.\n👉 No app: *Treino → ao terminar a sessão aparece a tela de RPE*. É 1 toque e me ajuda a ajustar a intensidade.';
      }
      if (lower.includes('carga')) {
        return '🏋️ *Cargas*\nAnota a carga (kg) usada em cada exercício enquanto treina.\n👉 No app: *Treino de hoje → tocar no exercício → campo Carga (kg)*. Assim consigo planejar a progressão certa.';
      }
      if (lower.includes('séries') || lower.includes('series') || lower.includes('exerc')) {
        return '✅ *Séries concluídas*\nVai marcando cada série conforme termina.\n👉 No app: *Treino de hoje → tocar no checkbox de cada série*. Qualquer registro já me ajuda muito.';
      }
      if (lower.includes('treinos concluídos') || lower.includes('treinos concluidos') || lower.includes('frequ')) {
        return '📅 *Frequência*\nSempre que treinar, finaliza a sessão no app pra ficar registrado.\n👉 No app: *Home → Treino de hoje → Iniciar treino → Finalizar ao terminar*. Se faltar algum dia, sem problema — me conta pra gente ajustar.';
      }
      if (lower.includes('água') || lower.includes('agua') || lower.includes('hidrat')) {
        return '💧 *Hidratação*\nVai marcando os copos de água ao longo do dia.\n👉 No app: *Home → card Água → tocar no copo +*. Pequenos registros já me dão um ótimo panorama.';
      }
      if (lower.includes('sono') || lower.includes('humor') || lower.includes('energia')) {
        return '😴 *Sono e energia*\nQuando lembrar, registra como dormiu e como está sua energia.\n👉 No app: *Perfil → Meu Progresso → Bem-estar*. Esses dados me ajudam a entender seu contexto além do treino.';
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