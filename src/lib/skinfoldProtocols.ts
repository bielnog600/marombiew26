// Skinfold body-fat protocols + auto-selection logic.
// All formulas return body fat % (0-60) or null when inputs are insufficient.

export type Sex = 'masculino' | 'feminino';

export type SkinfoldKey =
  | 'triceps' | 'subescapular' | 'suprailiaca' | 'abdominal'
  | 'peitoral' | 'axilar_media' | 'coxa'
  | 'biceps' | 'panturrilha_medial';

export type ProtocolId =
  | 'auto'
  | 'jackson_pollock_3'
  | 'jackson_pollock_7'
  | 'guedes_3'
  | 'petroski_4'
  | 'faulkner_4'
  | 'durnin_4'
  | 'manual';

export interface ProtocolMeta {
  id: ProtocolId;
  label: string;
  short: string;
  description: string;
  /** Required folds per sex (some protocols differ M/F). */
  required: { masculino: SkinfoldKey[]; feminino: SkinfoldKey[] };
  /** Recommended age range — used by auto picker. */
  ageRange?: [number, number];
  /** True when validated for Brazilian population. */
  brazilian?: boolean;
}

export const PROTOCOLS: Record<Exclude<ProtocolId, 'auto' | 'manual'>, ProtocolMeta> = {
  jackson_pollock_3: {
    id: 'jackson_pollock_3',
    label: 'Jackson & Pollock 3 Dobras',
    short: 'Pollock 3',
    description: 'Clássico — 3 dobras. Adultos jovens / atletas.',
    required: {
      masculino: ['peitoral', 'abdominal', 'coxa'],
      feminino: ['triceps', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 55],
  },
  jackson_pollock_7: {
    id: 'jackson_pollock_7',
    label: 'Jackson & Pollock 7 Dobras',
    short: 'Pollock 7',
    description: 'Mais preciso — 7 dobras. Atletas e populações treinadas.',
    required: {
      masculino: ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
      feminino: ['peitoral', 'axilar_media', 'triceps', 'subescapular', 'abdominal', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 60],
  },
  guedes_3: {
    id: 'guedes_3',
    label: 'Guedes 3 Dobras',
    short: 'Guedes 3',
    description: 'Validado para brasileiros adultos.',
    required: {
      masculino: ['triceps', 'suprailiaca', 'abdominal'],
      feminino: ['subescapular', 'suprailiaca', 'coxa'],
    },
    ageRange: [18, 50],
    brazilian: true,
  },
  petroski_4: {
    id: 'petroski_4',
    label: 'Petroski 4 Dobras',
    short: 'Petroski 4',
    description: 'Validado para brasileiros — inclui panturrilha.',
    required: {
      masculino: ['subescapular', 'triceps', 'suprailiaca', 'panturrilha_medial'],
      feminino: ['axilar_media', 'suprailiaca', 'coxa', 'panturrilha_medial'],
    },
    ageRange: [18, 60],
    brazilian: true,
  },
  faulkner_4: {
    id: 'faulkner_4',
    label: 'Faulkner 4 Dobras',
    short: 'Faulkner',
    description: 'Simples e direto — bom para iniciantes/triagem.',
    required: {
      masculino: ['triceps', 'subescapular', 'suprailiaca', 'abdominal'],
      feminino: ['triceps', 'subescapular', 'suprailiaca', 'abdominal'],
    },
    ageRange: [16, 70],
  },
  durnin_4: {
    id: 'durnin_4',
    label: 'Durnin & Womersley 4 Dobras',
    short: 'Durnin',
    description: 'Internacional, robusto p/ ampla faixa etária (inclui idosos).',
    required: {
      masculino: ['biceps', 'triceps', 'subescapular', 'suprailiaca'],
      feminino: ['biceps', 'triceps', 'subescapular', 'suprailiaca'],
    },
    ageRange: [17, 72],
  },
};

const isFemale = (sex: string | null | undefined): boolean => {
  if (!sex) return false;
  const s = sex.toLowerCase();
  return s.startsWith('f') || s === 'mulher';
};

const dcToBfSiri = (dc: number) => ((4.95 / dc) - 4.5) * 100;
const dcToBfBrozek = (dc: number) => ((4.57 / dc) - 4.142) * 100;

export interface CalcInput {
  sex: string | null | undefined;
  ageYears: number | null | undefined;
  values: Partial<Record<SkinfoldKey, number>>; // mm (averaged)
}

export interface CalcResult {
  protocol: ProtocolId;
  bodyFat: number | null;
  reason?: string; // why null
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
  return s;
};

export function calcProtocol(protocol: Exclude<ProtocolId, 'auto' | 'manual'>, input: CalcInput): CalcResult {
  const meta = PROTOCOLS[protocol];
  const female = isFemale(input.sex);
  const age = input.ageYears && input.ageYears > 0 ? input.ageYears : null;
  const need = meta.required[female ? 'feminino' : 'masculino'];
  const sum = sumAll(input.values, need);
  if (sum == null) return { protocol, bodyFat: null, reason: 'Dobras necessárias incompletas.' };

  let bf: number | null = null;

  switch (protocol) {
    case 'jackson_pollock_3': {
      if (!age) return { protocol, bodyFat: null, reason: 'Idade necessária.' };
      const dc = female
        ? 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * age)
        : 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * age);
      bf = dcToBfSiri(dc);
      break;
    }
    case 'jackson_pollock_7': {
      if (!age) return { protocol, bodyFat: null, reason: 'Idade necessária.' };
      const dc = female
        ? 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * age)
        : 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * age);
      bf = dcToBfSiri(dc);
      break;
    }
    case 'guedes_3': {
      // Guedes (1985) — DC then Siri
      const dc = female
        ? 1.16650 - 0.07063 * Math.log10(sum)
        : 1.17136 - 0.06706 * Math.log10(sum);
      bf = dcToBfSiri(dc);
      break;
    }
    case 'petroski_4': {
      if (!age) return { protocol, bodyFat: null, reason: 'Idade necessária.' };
      // Petroski (1995) — populações brasileiras
      const dc = female
        ? 1.03954 - 0.000327 * sum - 0.000297 * age - 0.0009 * 0 // simplified placeholder removed below
        : 1.10726863 - 0.00081201 * sum + 0.00000212 * sum * sum - 0.00041761 * age;
      // For females use Petroski feminino formula:
      const dcFinal = female
        ? 1.1954713 - 0.07513507 * Math.log10(sum) - 0.00041072 * age
        : dc;
      bf = dcToBfSiri(dcFinal);
      break;
    }
    case 'faulkner_4': {
      // Faulkner (1968) — simple direct % formula
      bf = 0.153 * sum + 5.783;
      break;
    }
    case 'durnin_4': {
      if (!age) return { protocol, bodyFat: null, reason: 'Idade necessária.' };
      // Durnin & Womersley (1974) — log10 by age & sex
      // Coefficients vary by age band; we use the consolidated adult formula.
      let c = 0, m = 0;
      if (female) {
        if (age < 20) { c = 1.1549; m = 0.0678; }
        else if (age < 30) { c = 1.1599; m = 0.0717; }
        else if (age < 40) { c = 1.1423; m = 0.0632; }
        else if (age < 50) { c = 1.1333; m = 0.0612; }
        else { c = 1.1339; m = 0.0645; }
      } else {
        if (age < 20) { c = 1.1620; m = 0.0630; }
        else if (age < 30) { c = 1.1631; m = 0.0632; }
        else if (age < 40) { c = 1.1422; m = 0.0544; }
        else if (age < 50) { c = 1.1620; m = 0.0700; }
        else { c = 1.1715; m = 0.0779; }
      }
      const dc = c - m * Math.log10(sum);
      bf = dcToBfBrozek(dc);
      break;
    }
  }

  if (bf == null || !isFinite(bf) || bf <= 0 || bf >= 60) {
    return { protocol, bodyFat: null, reason: 'Resultado fora do intervalo válido.' };
  }
  return { protocol, bodyFat: Number(bf.toFixed(1)) };
}

/**
 * Choose the ideal protocol based on sex, age, athletic profile and which
 * skinfolds are already filled in. Rules (priority):
 *  1) Idosos (>55) → Durnin (validado p/ idosos)
 *  2) Brasileiro adulto jovem (18-50) com panturrilha medida → Petroski
 *  3) Brasileiro adulto jovem (18-50) sem panturrilha → Guedes
 *  4) Atletas / 7 dobras preenchidas → Pollock 7
 *  5) Adolescentes/triagem (<18 ou sem idade) → Faulkner
 *  6) Default → Pollock 3
 * Em todos os casos, se o protocolo escolhido não tem dobras suficientes
 * preenchidas, busca o próximo viável na lista de fallback.
 */
export function pickAutoProtocol(input: CalcInput): Exclude<ProtocolId, 'auto' | 'manual'> {
  const female = isFemale(input.sex);
  const age = input.ageYears ?? null;
  const v = input.values;

  const order: Exclude<ProtocolId, 'auto' | 'manual'>[] = [];

  if (age != null && age > 55) {
    order.push('durnin_4', 'guedes_3', 'jackson_pollock_3', 'faulkner_4');
  } else if (age != null && age >= 18 && age <= 50) {
    if (get(v, 'panturrilha_medial') != null) order.push('petroski_4');
    order.push('guedes_3', 'jackson_pollock_7', 'jackson_pollock_3', 'faulkner_4', 'durnin_4');
  } else if (age != null && age < 18) {
    order.push('faulkner_4', 'guedes_3', 'jackson_pollock_3');
  } else {
    order.push('jackson_pollock_3', 'guedes_3', 'jackson_pollock_7', 'faulkner_4');
  }

  for (const p of order) {
    const need = PROTOCOLS[p].required[female ? 'feminino' : 'masculino'];
    if (sumAll(v, need) != null) return p;
  }
  return order[0];
}

export function calcAuto(input: CalcInput): CalcResult & { autoPicked: ProtocolId } {
  const picked = pickAutoProtocol(input);
  const r = calcProtocol(picked, input);
  return { ...r, autoPicked: picked };
}
