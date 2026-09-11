// Fórmulas de estimativa de composição corporal por dobras cutâneas.
// Este arquivo cuida APENAS do CÁLCULO das equações.
// A RECOMENDAÇÃO de qual equação usar vive em src/lib/protocolRecommendation.ts.
// Todas as fórmulas retornam % de gordura (0-60) ou null quando os dados são insuficientes.

export type Sex = 'masculino' | 'feminino';

export type SkinfoldKey =
  | 'triceps' | 'subescapular' | 'suprailiaca' | 'abdominal'
  | 'peitoral' | 'axilar_media' | 'coxa'
  | 'biceps' | 'panturrilha_medial' | 'supraspinale';

export type ProtocolId =
  | 'auto'
  | 'jackson_pollock_3'
  | 'jackson_pollock_7'
  | 'guedes_3'
  | 'petroski_4'
  | 'faulkner_4'
  | 'durnin_4'
  | 'manual';

export type CalcProtocolId = Exclude<ProtocolId, 'auto' | 'manual'>;

/** Referência populacional declarada da equação (contexto, nunca regra de nacionalidade). */
export type PopulationReference = 'brasil' | 'geral_adultos' | 'europeia_ampla' | 'esportiva';

export interface ProtocolMeta {
  id: CalcProtocolId;
  label: string;
  short: string;
  description: string;
  /** Dobras obrigatórias por sexo. */
  required: { masculino: SkinfoldKey[]; feminino: SkinfoldKey[] };
  /** Faixa etária de referência da equação. */
  ageRange?: [number, number];
  /** A equação usa coeficientes distintos por sexo. */
  sexSpecific: boolean;
  /** A equação usa a idade como variável. */
  usesAge: boolean;
  populationReference: PopulationReference;
  evidenceNotes: string;
  limitations: string;
  /** True quando validada em população brasileira. */
  brazilian?: boolean;
}

export const PROTOCOLS: Record<CalcProtocolId, ProtocolMeta> = {
  jackson_pollock_3: {
    id: 'jackson_pollock_3',
    label: 'Jackson & Pollock 3 Dobras',
    short: 'Pollock 3',
    description: 'Equação generalizada para adultos utilizando três locais de dobra cutânea.',
    required: {
      masculino: ['peitoral', 'abdominal', 'coxa'],
      feminino: ['triceps', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 55],
    sexSpecific: true,
    usesAge: true,
    populationReference: 'geral_adultos',
    evidenceNotes: 'Equação generalizada amplamente utilizada em adultos.',
    limitations: 'Menos locais de medida: mais sensível a erro em uma única dobra.',
  },
  jackson_pollock_7: {
    id: 'jackson_pollock_7',
    label: 'Jackson & Pollock 7 Dobras',
    short: 'Pollock 7',
    description: 'Equação generalizada utilizando sete locais de dobra cutânea.',
    required: {
      masculino: ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
      feminino: ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 60],
    sexSpecific: true,
    usesAge: true,
    populationReference: 'geral_adultos',
    evidenceNotes: 'Distribui o erro por mais locais de medida quando todas as dobras estão disponíveis.',
    limitations: 'Exige sete aferições bem executadas; erro de técnica em qualquer local afeta o resultado.',
  },
  guedes_3: {
    id: 'guedes_3',
    label: 'Guedes 3 Dobras',
    short: 'Guedes 3',
    description: 'Equação desenvolvida em população brasileira específica (três dobras).',
    required: {
      masculino: ['triceps', 'suprailiaca', 'abdominal'],
      feminino: ['subescapular', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 50],
    sexSpecific: true,
    usesAge: false,
    populationReference: 'brasil',
    evidenceNotes: 'População de referência específica (adultos brasileiros).',
    limitations: 'Fora da população original a força da recomendação é menor.',
    brazilian: true,
  },
  petroski_4: {
    id: 'petroski_4',
    label: 'Petroski 4 Dobras',
    short: 'Petroski 4',
    description: 'Equação desenvolvida em população brasileira, com quatro dobras (inclui panturrilha medial).',
    required: {
      masculino: ['subescapular', 'triceps', 'suprailiaca', 'panturrilha_medial'],
      feminino: ['axilar_media', 'suprailiaca', 'coxa', 'panturrilha_medial'],
    },
    ageRange: [18, 60],
    sexSpecific: true,
    usesAge: true,
    populationReference: 'brasil',
    evidenceNotes: 'População de referência específica (adultos brasileiros).',
    limitations: 'A presença da panturrilha medial indica apenas medidas disponíveis, não superioridade do método.',
    brazilian: true,
  },
  faulkner_4: {
    id: 'faulkner_4',
    label: 'Faulkner 4 Dobras',
    short: 'Faulkner',
    description: 'Equação de quatro dobras com origem em contexto esportivo específico.',
    required: {
      masculino: ['triceps', 'subescapular', 'suprailiaca', 'abdominal'],
      feminino: ['triceps', 'subescapular', 'suprailiaca', 'abdominal'],
    },
    ageRange: [16, 70],
    sexSpecific: false,
    usesAge: false,
    populationReference: 'esportiva',
    evidenceNotes: 'Origem em amostra esportiva (nadadores); não usa sexo nem idade como variáveis.',
    limitations: 'Ignora sexo e idade, o que reduz a compatibilidade fora do contexto original.',
  },
  durnin_4: {
    id: 'durnin_4',
    label: 'Durnin & Womersley 4 Dobras',
    short: 'Durnin',
    description: 'Equação com coeficientes distintos por faixa etária e sexo, para ampla faixa de idade adulta.',
    required: {
      masculino: ['biceps', 'triceps', 'subescapular', 'suprailiaca'],
      feminino: ['biceps', 'triceps', 'subescapular', 'suprailiaca'],
    },
    ageRange: [17, 72],
    sexSpecific: true,
    usesAge: true,
    populationReference: 'europeia_ampla',
    evidenceNotes: 'Coeficientes específicos por faixa etária, incluindo adultos mais velhos.',
    limitations: 'Amostra original europeia; tende a estimar valores mais altos em pessoas muito treinadas.',
  },
};

/** Resolve o sexo informado. Retorna null quando ausente/indefinido (nunca assume masculino). */
export function resolveSex(sex: string | null | undefined): Sex | null {
  if (!sex) return null;
  const s = String(sex).trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('f') || s === 'mulher') return 'feminino';
  if (s.startsWith('m') || s === 'homem') return 'masculino';
  return null;
}

const dcToBfSiri = (dc: number) => ((4.95 / dc) - 4.5) * 100;
const dcToBfBrozek = (dc: number) => ((4.57 / dc) - 4.142) * 100;

export interface CalcInput {
  sex: string | null | undefined;
  ageYears: number | null | undefined;
  values: Partial<Record<SkinfoldKey, number>>; // mm (valor utilizado)
}

export interface CalcResult {
  protocol: CalcProtocolId;
  bodyFat: number | null;
  sum: number | null;
  reason?: string; // motivo quando null
}

const get = (v: Partial<Record<SkinfoldKey, number>>, k: SkinfoldKey) => {
  const n = v[k];
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
};

const sumAll = (v: Partial<Record<SkinfoldKey, number>>, keys: SkinfoldKey[]): number | null => {
  let s = 0;
  for (const k of keys) {
    const n = get(v, k);
    if (n == null) return null;
    s += n;
  }
  return Math.round(s * 10) / 10;
};

/** Dobras exigidas pelo protocolo para o sexo informado (masculino como estrutura padrão quando indiferente). */
export function requiredFolds(protocol: CalcProtocolId, sex: Sex | null): SkinfoldKey[] {
  const meta = PROTOCOLS[protocol];
  if (sex) return meta.required[sex];
  return meta.required.masculino;
}

export function calcProtocol(protocol: CalcProtocolId, input: CalcInput): CalcResult {
  const meta = PROTOCOLS[protocol];
  const sex = resolveSex(input.sex);
  const age = input.ageYears && input.ageYears > 0 ? input.ageYears : null;

  if (meta.sexSpecific && !sex) {
    return { protocol, bodyFat: null, sum: null, reason: 'Sexo necessário para cálculo.' };
  }
  const female = sex === 'feminino';

  const need = requiredFolds(protocol, sex);
  const sum = sumAll(input.values, need);
  if (sum == null) return { protocol, bodyFat: null, sum: null, reason: 'Dobras necessárias incompletas.' };

  if (meta.usesAge && !age) {
    return { protocol, bodyFat: null, sum, reason: 'Idade necessária.' };
  }

  let bf: number | null = null;

  switch (protocol) {
    case 'jackson_pollock_3': {
      const dc = female
        ? 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * (age as number))
        : 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * (age as number));
      bf = dcToBfSiri(dc);
      break;
    }
    case 'jackson_pollock_7': {
      const dc = female
        ? 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * (age as number))
        : 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * (age as number));
      bf = dcToBfSiri(dc);
      break;
    }
    case 'guedes_3': {
      // Guedes (1985) — densidade corporal e Siri
      const dc = female
        ? 1.16650 - 0.07063 * Math.log10(sum)
        : 1.17136 - 0.06706 * Math.log10(sum);
      bf = dcToBfSiri(dc);
      break;
    }
    case 'petroski_4': {
      // Petroski (1995) — populações brasileiras
      const dc = female
        ? 1.1954713 - 0.07513507 * Math.log10(sum) - 0.00041072 * (age as number)
        : 1.10726863 - 0.00081201 * sum + 0.00000212 * sum * sum - 0.00041761 * (age as number);
      bf = dcToBfSiri(dc);
      break;
    }
    case 'faulkner_4': {
      // Faulkner (1968) — percentual direto
      bf = 0.153 * sum + 5.783;
      break;
    }
    case 'durnin_4': {
      // Durnin & Womersley (1974) — log10 por faixa etária e sexo
      const a = age as number;
      let c = 0, m = 0;
      if (female) {
        if (a < 20) { c = 1.1549; m = 0.0678; }
        else if (a < 30) { c = 1.1599; m = 0.0717; }
        else if (a < 40) { c = 1.1423; m = 0.0632; }
        else if (a < 50) { c = 1.1333; m = 0.0612; }
        else { c = 1.1339; m = 0.0645; }
      } else {
        if (a < 20) { c = 1.1620; m = 0.0630; }
        else if (a < 30) { c = 1.1631; m = 0.0632; }
        else if (a < 40) { c = 1.1422; m = 0.0544; }
        else if (a < 50) { c = 1.1620; m = 0.0700; }
        else { c = 1.1715; m = 0.0779; }
      }
      const dc = c - m * Math.log10(sum);
      bf = dcToBfBrozek(dc);
      break;
    }
  }

  if (bf == null || !isFinite(bf) || bf <= 0 || bf >= 60) {
    return { protocol, bodyFat: null, sum, reason: 'Resultado fora do intervalo válido.' };
  }
  return { protocol, bodyFat: Number(bf.toFixed(1)), sum };
}

/** Soma bruta das dobras informadas (todas as disponíveis). */
export function sumOfFolds(values: Partial<Record<SkinfoldKey, number>>, keys?: SkinfoldKey[]): { sum: number | null; sites: SkinfoldKey[] } {
  const list = (keys ?? (Object.keys(values) as SkinfoldKey[])).filter((k) => get(values, k) != null);
  if (list.length === 0) return { sum: null, sites: [] };
  const total = list.reduce((acc, k) => acc + (get(values, k) as number), 0);
  return { sum: Math.round(total * 10) / 10, sites: list };
}
