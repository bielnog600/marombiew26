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

    // Cada categoria gera UMA única frase, mesmo que vários itens caiam nela
    const categorize = (item: string): { key: string; line: string } => {
      const l = item.toLowerCase();
      if (l.includes('pesagem') || l.includes('peso') || l.includes('balança') || l.includes('balanca'))
        return { key: 'peso', line: '⚖️ *Pesagem*\nConsegue se pesar amanhã pela manhã, em jejum e após ir ao banheiro?\n👉 No app: *Perfil → Meu Progresso → Registrar peso*. Leva 10 segundos e me ajuda muito a calibrar seu plano.' };
      if (l.includes('refeiç') || l.includes('refeic') || l.includes('alimenta') || l.includes('comida') || l.includes('dieta'))
        return { key: 'refeicoes', line: '🍽️ *Refeições do dia*\nQuando fizer cada refeição, é só marcar como concluída — não precisa ser perfeito.\n👉 No app: *Home → Dieta de hoje → tocar na refeição → Marcar como feita*.' };
      if (l.includes('rpe') || l.includes('esforç') || l.includes('esforc'))
        return { key: 'rpe', line: '💪 *RPE (esforço percebido)*\nAo finalizar o treino, marca de 1 a 10 o quanto foi puxado.\n👉 No app: *Treino → ao terminar a sessão aparece a tela de RPE*. É 1 toque e me ajuda a ajustar a intensidade.' };
      if (l.includes('carga'))
        return { key: 'carga', line: '🏋️ *Cargas*\nAnota a carga (kg) usada em cada exercício enquanto treina.\n👉 No app: *Treino de hoje → tocar no exercício → campo Carga (kg)*. Assim consigo planejar a progressão certa.' };
      if (l.includes('séries') || l.includes('series') || l.includes('exerc'))
        return { key: 'series', line: '✅ *Séries concluídas*\nVai marcando cada série conforme termina.\n👉 No app: *Treino de hoje → tocar no checkbox de cada série*. Qualquer registro já me ajuda muito.' };
      if (l.includes('treinos concluídos') || l.includes('treinos concluidos') || l.includes('frequ'))
        return { key: 'frequencia', line: '📅 *Frequência*\nSempre que treinar, finaliza a sessão no app pra ficar registrado.\n👉 No app: *Home → Treino de hoje → Iniciar treino → Finalizar ao terminar*. Se faltar algum dia, sem problema — me conta pra gente ajustar.' };
      if (l.includes('água') || l.includes('agua') || l.includes('hidrat'))
        return { key: 'agua', line: '💧 *Hidratação*\nVai marcando os copos de água ao longo do dia.\n👉 No app: *Home → card Água → tocar no copo +*. Pequenos registros já me dão um ótimo panorama.' };
      if (l.includes('sono') || l.includes('humor') || l.includes('energia') || l.includes('bem-estar') || l.includes('bem estar'))
        return { key: 'bem_estar', line: '😴 *Sono e energia*\nQuando lembrar, registra como dormiu e como está sua energia.\n👉 No app: *Perfil → Meu Progresso → Bem-estar*. Esses dados me ajudam a entender seu contexto além do treino.' };
      return { key: `outro:${l}`, line: `• ${item}` };
    };

    const seen = new Set<string>();
    const friendlyLines: string[] = [];
    (missingItems ?? []).forEach((item) => {
      const { key, line } = categorize(item);
      if (seen.has(key)) return;
      seen.add(key);
      friendlyLines.push(line);
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