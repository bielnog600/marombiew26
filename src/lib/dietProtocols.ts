import { Leaf, Pill, Zap, SlidersHorizontal, Target, Clock, Droplets, UtensilsCrossed, type LucideIcon } from 'lucide-react';

export type ProtocolKey =
  | 'calorie_adjust'
  | 'carb_adjust'
  | 'sodium_adjust'
  | 'water_adjust'
  | 'meal_change'
  | 'plato'
  | 'refeed'
  | 'diet_break'
  | 'carb_cycling'
  | 'fitoterapia'
  | 'suplementos'
  | 'emagrecimento_rapido';

export interface ProtocolInfo {
  key: ProtocolKey;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Explicação didática para o aluno */
  description: string;
  /** Palavras-chave usadas para localizar a seção correspondente no markdown da dieta */
  matchers: string[];
}

export const PROTOCOLS: Record<ProtocolKey, ProtocolInfo> = {
  calorie_adjust: {
    key: 'calorie_adjust',
    label: 'Ajuste de Calorias',
    short: 'Calorias',
    icon: SlidersHorizontal,
    description:
      'Ajuste semanal da quantidade total de calorias do plano (aumento ou redução) para manter a evolução constante e evitar estagnações.',
    matchers: ['ajuste de calorias', 'ajuste calórico', 'ajuste calorico'],
  },
  carb_adjust: {
    key: 'carb_adjust',
    label: 'Ajuste de Carboidrato',
    short: 'Carbo',
    icon: SlidersHorizontal,
    description:
      'Manipulação da quantidade de carboidrato ao longo da semana, conforme treinos e necessidade energética.',
    matchers: ['ajuste de carboidrato', 'ajuste de carbo', 'manipulação de carbo'],
  },
  sodium_adjust: {
    key: 'sodium_adjust',
    label: 'Ajuste de Sódio',
    short: 'Sódio',
    icon: SlidersHorizontal,
    description:
      'Protocolo de manipulação de sódio ao longo da semana, ajudando no controle hídrico e na definição muscular.',
    matchers: ['ajuste de sódio', 'ajuste de sodio', 'protocolo de sódio', 'protocolo de sodio', 'manipulação de sódio', 'manipulacao de sodio'],
  },
  water_adjust: {
    key: 'water_adjust',
    label: 'Ajuste de Água',
    short: 'Água',
    icon: Droplets,
    description:
      'Protocolo de ingestão hídrica diária. Beber a quantidade certa de água é fundamental para metabolismo, performance e saúde.',
    matchers: ['ajuste de água', 'ajuste de agua', 'ingestão hídrica', 'ingestao hidrica', 'protocolo hídrico', 'protocolo hidrico'],
  },
  meal_change: {
    key: 'meal_change',
    label: 'Mudança de Refeições',
    short: 'Refeições',
    icon: UtensilsCrossed,
    description:
      'Alteração do número e da distribuição das refeições no dia, para se adequar à sua rotina e otimizar resultados.',
    matchers: ['mudança de refei', 'mudanca de refei', 'distribuição de refei', 'distribuicao de refei'],
  },
  plato: {
    key: 'plato',
    label: 'Estratégia para Platô',
    short: 'Platô',
    icon: Target,
    description:
      'Estratégia para quebrar estagnação metabólica quando o corpo se adapta e os resultados travam.',
    matchers: ['estratégia para platô', 'estrategia para plato', 'platô', 'plato', 'estagnaç', 'estagnac'],
  },
  refeed: {
    key: 'refeed',
    label: 'Refeed',
    short: 'Refeed',
    icon: Zap,
    description:
      'Dia(s) de recarga de carboidrato para reabastecer glicogênio muscular, reativar hormônios e melhorar treinos.',
    matchers: ['refeed', 'recarga de carbo', 'dia de refeed'],
  },
  diet_break: {
    key: 'diet_break',
    label: 'Diet Break',
    short: 'Diet Break',
    icon: Clock,
    description:
      'Pausa programada na dieta com calorias de manutenção para aliviar o cansaço metabólico e psicológico do plano.',
    matchers: ['diet break', 'pausa programada', 'pausa na dieta'],
  },
  carb_cycling: {
    key: 'carb_cycling',
    label: 'Carb Cycling',
    short: 'Ciclagem',
    icon: SlidersHorizontal,
    description:
      'Ciclagem semanal de carboidrato (dias High / Medium / Low) sincronizada com a intensidade dos treinos.',
    matchers: ['carb cycling', 'ciclagem de carbo', 'ciclo de carbo', 'high carb', 'low carb'],
  },
  fitoterapia: {
    key: 'fitoterapia',
    label: 'Receitas de Fitoterapia',
    short: 'Fitoterapia',
    icon: Leaf,
    description:
      'Chás, infusões e preparações fitoterápicas complementares ao plano, com horários e benefícios indicados.',
    matchers: ['fitoter', 'chá', 'cha ', 'infus', 'erva'],
  },
  suplementos: {
    key: 'suplementos',
    label: 'Suplementação',
    short: 'Suplementos',
    icon: Pill,
    description:
      'Suplementos recomendados (whey, creatina, ômega-3, vitaminas, etc.) com dosagem e melhor horário de uso.',
    matchers: ['suplement'],
  },
  emagrecimento_rapido: {
    key: 'emagrecimento_rapido',
    label: 'Emagrecimento Rápido',
    short: 'Acelerado',
    icon: Zap,
    description:
      'Estratégias avançadas para acelerar a perda de gordura: jejum intermitente, HIIT, termogênicos e ajustes pontuais.',
    matchers: ['emagrec', 'jejum', 'hiit', 'termog'],
  },
};

export const PROTOCOL_ORDER: ProtocolKey[] = [
  'calorie_adjust',
  'carb_adjust',
  'carb_cycling',
  'refeed',
  'diet_break',
  'plato',
  'sodium_adjust',
  'water_adjust',
  'meal_change',
  'fitoterapia',
  'suplementos',
  'emagrecimento_rapido',
];

export interface SavedProtocols {
  adjustments?: string[];
  extras?: {
    fitoterapia?: boolean;
    suplementos?: boolean;
    emagrecimento_rapido?: boolean;
  };
}

export const protocolsToKeys = (p?: SavedProtocols | null): ProtocolKey[] => {
  if (!p) return [];
  const keys: ProtocolKey[] = [];
  for (const a of p.adjustments ?? []) {
    if (a in PROTOCOLS) keys.push(a as ProtocolKey);
  }
  if (p.extras?.fitoterapia) keys.push('fitoterapia');
  if (p.extras?.suplementos) keys.push('suplementos');
  if (p.extras?.emagrecimento_rapido) keys.push('emagrecimento_rapido');
  // Ordena pela ordem canônica e remove duplicatas
  return PROTOCOL_ORDER.filter((k) => keys.includes(k));
};

/**
 * Extrai do markdown da dieta o trecho referente a um protocolo específico,
 * baseando-se nos matchers de cabeçalho. Retorna apenas o conteúdo (sem o título).
 */
export const extractProtocolSection = (markdown: string, key: ProtocolKey): string | null => {
  if (!markdown) return null;
  const info = PROTOCOLS[key];
  const lines = markdown.split('\n');
  let start = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const headingMatch = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
    const boldMatch = !headingMatch && raw.match(/^\*\*(.+?)\*\*\s*$/);
    const title = headingMatch ? headingMatch[2] : boldMatch ? boldMatch[1] : null;
    if (!title) continue;
    const lower = title.toLowerCase();
    if (info.matchers.some((m) => lower.includes(m))) {
      start = i + 1;
      headingLevel = headingMatch ? headingMatch[1].length : 2;
      break;
    }
  }

  if (start < 0) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const hm = raw.match(/^(#{1,6})\s+/);
    if (hm && hm[1].length <= headingLevel) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n').trim() || null;
};