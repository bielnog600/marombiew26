// Motor determinístico de recomendação de protocolo antropométrico.
// Não usa IA. Não escolhe pelo resultado de % de gordura.
// Primeiro compatibilidade metodológica, depois cálculo.

import {
  PROTOCOLS,
  calcProtocol,
  requiredFolds,
  resolveSex,
  type CalcProtocolId,
  type ProtocolId,
  type SkinfoldKey,
  type Sex,
} from './skinfoldProtocols';
import type { FoldQuality } from './measurementQuality';

export type Compatibility = 'high' | 'moderate' | 'low' | 'not_recommended';

export const COMPATIBILITY_LABEL: Record<Compatibility, string> = {
  high: 'Alta',
  moderate: 'Moderada',
  low: 'Baixa',
  not_recommended: 'Não recomendado',
};

/** Contexto populacional — apenas contexto, nunca regra direta de seleção. */
export type PopulationContext =
  | 'nao_informado'
  | 'brasil'
  | 'portugal'
  | 'europa'
  | 'africa_subsaariana'
  | 'cabo_verde'
  | 'angola'
  | 'reino_unido'
  | 'escandinavia'
  | 'outro';

export const POPULATION_CONTEXTS: { value: PopulationContext; label: string }[] = [
  { value: 'nao_informado', label: 'Não informar' },
  { value: 'brasil', label: 'Brasil' },
  { value: 'portugal', label: 'Portugal' },
  { value: 'europa', label: 'Europa' },
  { value: 'reino_unido', label: 'Reino Unido' },
  { value: 'escandinavia', label: 'Escandinávia' },
  { value: 'africa_subsaariana', label: 'África Subsaariana' },
  { value: 'cabo_verde', label: 'Cabo Verde' },
  { value: 'angola', label: 'Angola' },
  { value: 'outro', label: 'Outro' },
];

export type TrainingProfile =
  | 'nao_informado'
  | 'sedentario'
  | 'iniciante'
  | 'recreacional'
  | 'treinado'
  | 'atleta';

export const TRAINING_PROFILES: { value: TrainingProfile; label: string }[] = [
  { value: 'nao_informado', label: 'Não informar' },
  { value: 'sedentario', label: 'Sedentário' },
  { value: 'iniciante', label: 'Iniciante / pouco treinado' },
  { value: 'recreacional', label: 'Recreacionalmente treinado' },
  { value: 'treinado', label: 'Treinado' },
  { value: 'atleta', label: 'Atleta competitivo' },
];

const EUROPEAN_CONTEXTS: PopulationContext[] = ['portugal', 'europa', 'reino_unido', 'escandinavia'];

export interface RecommendationInput {
  sex: string | null | undefined;
  ageYears: number | null | undefined;
  /** Valores utilizados por dobra (mm). */
  values: Partial<Record<SkinfoldKey, number>>;
  /** Qualidade da aferição por dobra (opcional). */
  quality?: Partial<Record<SkinfoldKey, FoldQuality>>;
  populationContext?: PopulationContext;
  trainingProfile?: TrainingProfile;
  /** Protocolo usado na avaliação anterior do aluno, se houver. */
  previousProtocol?: CalcProtocolId | null;
}

export interface ProtocolEvaluation {
  protocol: CalcProtocolId;
  label: string;
  short: string;
  eligible: boolean;
  compatibility: Compatibility;
  reasons: string[];
  warnings: string[];
  bodyFat: number | null;
  sum: number | null;
  missingFolds: SkinfoldKey[];
  continuity: boolean;
}

const RANK: Record<Compatibility, number> = { high: 3, moderate: 2, low: 1, not_recommended: 0 };
const downgrade = (current: Compatibility, to: Compatibility): Compatibility =>
  RANK[to] < RANK[current] ? to : current;

/**
 * Desempate documentado (usado apenas para ORDENAR protocolos de mesma
 * compatibilidade — nunca para definir compatibilidade):
 * 1. Cobertura de locais de medida (mais locais → menor sensibilidade a erro pontual)
 * 2. Uso de sexo e idade como variáveis da equação
 * 3. Coerência da população de referência com o contexto informado
 */
function tiebreak(protocol: CalcProtocolId, ctx: PopulationContext, age: number | null): number {
  const meta = PROTOCOLS[protocol];
  let score = 0;
  score += requiredFolds(protocol, 'masculino').length; // cobertura
  if (meta.sexSpecific) score += 2;
  if (meta.usesAge) score += 2;
  if (meta.populationReference === 'brasil' && ctx === 'brasil') score += 3;
  if (meta.populationReference === 'europeia_ampla' && EUROPEAN_CONTEXTS.includes(ctx)) score += 2;
  // Durnin usa coeficientes por faixa etária: mais adequado em adultos mais velhos
  if (protocol === 'durnin_4' && age != null && age >= 50) score += 3;
  return score;
}

export function evaluateProtocolCompatibility(
  protocol: CalcProtocolId,
  input: RecommendationInput,
): ProtocolEvaluation {
  const meta = PROTOCOLS[protocol];
  const sex: Sex | null = resolveSex(input.sex);
  const age = input.ageYears && input.ageYears > 0 ? input.ageYears : null;
  const ctx = input.populationContext ?? 'nao_informado';
  const profile = input.trainingProfile ?? 'nao_informado';

  const reasons: string[] = [];
  const warnings: string[] = [];
  const need = requiredFolds(protocol, sex);
  const missingFolds = need.filter((k) => {
    const v = input.values[k];
    return !(typeof v === 'number' && isFinite(v) && v > 0);
  });

  let eligible = true;
  let compatibility: Compatibility = 'high';

  // ---- Elegibilidade (requisitos obrigatórios) ----
  if (meta.sexSpecific && !sex) {
    eligible = false;
    warnings.push('Sexo necessário para esta equação.');
  } else if (sex) {
    reasons.push('Sexo compatível com a equação.');
  }

  if (meta.usesAge && !age) {
    eligible = false;
    warnings.push('Idade necessária para esta equação.');
  }

  if (missingFolds.length > 0) {
    eligible = false;
    warnings.push('Dobras necessárias ausentes.');
  } else {
    reasons.push('Todas as dobras necessárias disponíveis.');
  }

  // Qualidade das aferições obrigatórias
  const badQuality = need.filter((k) => input.quality?.[k]?.status === 'needs_third');
  const singleOnly = need.filter((k) => input.quality?.[k]?.status === 'single');
  if (badQuality.length > 0) {
    eligible = false;
    warnings.push('Qualidade da aferição insuficiente: realize a terceira medição das dobras divergentes.');
  } else if (missingFolds.length === 0) {
    if (singleOnly.length > 0) {
      compatibility = downgrade(compatibility, 'moderate');
      warnings.push('Algumas dobras têm apenas uma aferição.');
    } else if (input.quality) {
      reasons.push('Qualidade das medidas adequada.');
    }
  }

  if (!eligible) {
    return {
      protocol, label: meta.label, short: meta.short,
      eligible: false, compatibility: 'not_recommended',
      reasons, warnings, bodyFat: null, sum: null, missingFolds,
      continuity: input.previousProtocol === protocol,
    };
  }

  // ---- Compatibilidade ----
  if (meta.ageRange && age != null) {
    const [min, max] = meta.ageRange;
    if (age < min || age > max) {
      compatibility = downgrade(compatibility, 'low');
      warnings.push(`Idade fora da faixa de referência da equação (${min}-${max} anos).`);
    } else {
      reasons.push('Idade dentro da população de referência da equação.');
    }
  } else if (meta.ageRange && age == null) {
    compatibility = downgrade(compatibility, 'moderate');
    warnings.push('Idade não informada: faixa de referência não pôde ser verificada.');
  }

  // População de referência (contexto, nunca regra direta)
  if (meta.populationReference === 'brasil') {
    if (ctx === 'brasil') {
      reasons.push('Contexto populacional informado coincide com a população de referência da equação.');
    } else if (ctx === 'nao_informado') {
      compatibility = downgrade(compatibility, 'moderate');
      warnings.push('Evidência populacional limitada: equação de população de referência específica.');
    } else {
      compatibility = downgrade(compatibility, 'moderate');
      warnings.push('Equação desenvolvida em população de referência específica, diferente do contexto informado.');
    }
  } else if (meta.populationReference === 'europeia_ampla') {
    if (EUROPEAN_CONTEXTS.includes(ctx)) {
      reasons.push('Contexto populacional coerente com a amostra de referência da equação.');
    } else {
      reasons.push('Equação aplicável a ampla faixa etária adulta.');
      if (ctx !== 'nao_informado') warnings.push('Evidência populacional específica limitada para este contexto.');
    }
  } else if (meta.populationReference === 'esportiva') {
    if (profile === 'treinado' || profile === 'atleta') {
      reasons.push('Perfil de treinamento próximo ao contexto de origem da equação.');
      compatibility = downgrade(compatibility, 'moderate');
    } else {
      compatibility = downgrade(compatibility, 'low');
      warnings.push('Equação com contexto esportivo específico e sem ajuste por sexo/idade.');
    }
  } else {
    reasons.push('Equação generalizada para adultos.');
  }

  const result = calcProtocol(protocol, { sex: input.sex, ageYears: age, values: input.values });
  if (result.bodyFat == null) {
    return {
      protocol, label: meta.label, short: meta.short,
      eligible: false, compatibility: 'not_recommended',
      reasons, warnings: [...warnings, result.reason ?? 'Cálculo indisponível.'],
      bodyFat: null, sum: result.sum, missingFolds,
      continuity: input.previousProtocol === protocol,
    };
  }

  return {
    protocol, label: meta.label, short: meta.short,
    eligible: true, compatibility,
    reasons, warnings,
    bodyFat: result.bodyFat, sum: result.sum, missingFolds,
    continuity: input.previousProtocol === protocol,
  };
}

export interface Dispersion {
  min: number;
  max: number;
  range: number;
  count: number;
}

export interface Recommendation {
  evaluations: ProtocolEvaluation[];
  eligible: ProtocolEvaluation[];
  recommended: ProtocolEvaluation | null;
  alternative: ProtocolEvaluation | null;
  continuityRecommended: boolean;
  continuityReason: string | null;
  dispersion: Dispersion | null;
}

export function recommendProtocol(input: RecommendationInput): Recommendation {
  const ids = Object.keys(PROTOCOLS) as CalcProtocolId[];
  const evaluations = ids.map((id) => evaluateProtocolCompatibility(id, input));

  const age = input.ageYears && input.ageYears > 0 ? input.ageYears : null;
  const ctx = input.populationContext ?? 'nao_informado';

  const eligible = evaluations
    .filter((e) => e.eligible)
    .sort((a, b) => {
      const byTier = RANK[b.compatibility] - RANK[a.compatibility];
      if (byTier !== 0) return byTier;
      return tiebreak(b.protocol, ctx, age) - tiebreak(a.protocol, ctx, age);
    });

  let recommended = eligible[0] ?? null;
  let continuityRecommended = false;
  let continuityReason: string | null = null;

  // Continuidade tem prioridade alta: se o protocolo anterior segue elegível, mantê-lo.
  if (input.previousProtocol) {
    const prev = eligible.find((e) => e.protocol === input.previousProtocol);
    if (prev) {
      recommended = prev;
      continuityRecommended = true;
      continuityReason =
        'Utilizado na avaliação anterior. Manter o mesmo método melhora a comparabilidade longitudinal.';
    }
  }

  const alternative = eligible.find((e) => e.protocol !== recommended?.protocol) ?? null;

  const values = eligible.map((e) => e.bodyFat).filter((v): v is number => v != null);
  const dispersion: Dispersion | null =
    values.length > 1
      ? {
          min: Math.min(...values),
          max: Math.max(...values),
          range: Math.round((Math.max(...values) - Math.min(...values)) * 10) / 10,
          count: values.length,
        }
      : null;

  return { evaluations, eligible, recommended, alternative, continuityRecommended, continuityReason, dispersion };
}

export const PROTOCOL_CHANGE_WARNING =
  'A alteração do protocolo pode modificar o percentual de gordura mesmo sem alteração corporal real, reduzindo a comparabilidade com avaliações anteriores.';

export const isCalcProtocol = (id: string | null | undefined): id is CalcProtocolId =>
  !!id && Object.prototype.hasOwnProperty.call(PROTOCOLS, id);

export const protocolLabel = (id: ProtocolId | string | null | undefined): string => {
  if (!id) return '—';
  if (id === 'manual') return 'Manual';
  if (id === 'auto') return 'Automático';
  return isCalcProtocol(id) ? PROTOCOLS[id].label : String(id);
};
