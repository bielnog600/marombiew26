/**
 * Seleção determinística da fórmula de gasto energético.
 *
 * Regras:
 *  - sem corte arbitrário de %gordura para liberar Cunningham;
 *  - massa magra é "utilizável" quando é plausível e vem da composição
 *    corporal válida mais recente;
 *  - o treinador pode forçar manualmente qualquer fórmula;
 *  - a IA NUNCA escolhe a fórmula;
 *  - medicamentos/hormônios/termogênicos NÃO entram no cálculo energético.
 */

export type EnergyFormula = 'cunningham' | 'mifflin' | 'harris_benedict' | 'katch_mcardle';

export type BiologicalSex = 'male' | 'female' | null;

export interface LeanMassInfo {
  /** Massa magra em kg. */
  kg: number | null;
  /** Data (ISO) da composição corporal de origem. */
  measuredAt?: string | null;
  /** Origem legível — ex.: "Avaliação física 12/03/2026". */
  source?: string | null;
}

export interface EnergyFormulaInput {
  sex: BiologicalSex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  bodyFatPct?: number | null;
  leanMass?: LeanMassInfo | null;
  /** Escolha manual do treinador — prevalece sobre a seleção automática. */
  manualFormula?: EnergyFormula | null;
  /** Data de referência para avaliar a idade da composição corporal. */
  now?: Date;
}

export interface EnergyFormulaResult {
  formula: EnergyFormula;
  bmr: number;
  reason: string;
  alternatives: Partial<Record<EnergyFormula, number>>;
  /** Avisos de qualidade/antiguidade — nunca bloqueiam. */
  warnings: string[];
  /**
   * true quando não há dados suficientes para uma fórmula válida
   * (sexo ausente e sem massa magra utilizável). `bmr` não deve ser usado.
   */
  insufficientData: boolean;
  leanMassUsable: boolean;
  manual: boolean;
}

/** Idade máxima da composição corporal sem gerar aviso. */
export const LEAN_MASS_FRESH_DAYS = 120;

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Massa magra utilizável: número positivo, menor que o peso e
 * fisiologicamente plausível (>= 30% do peso corporal).
 */
export const isLeanMassUsable = (leanKg: number | null | undefined, weightKg: number): boolean => {
  const lean = finite(leanKg);
  const weight = finite(weightKg);
  if (lean === null || weight === null) return false;
  if (lean <= 0 || weight <= 0) return false;
  if (lean >= weight) return false;
  return lean / weight >= 0.3;
};

export const mifflinStJeor = (
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number =>
  sex === 'female'
    ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;

export const harrisBenedict = (
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number =>
  sex === 'female'
    ? 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears
    : 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears;

export const cunningham = (leanMassKg: number): number => 500 + 22 * leanMassKg;

export const katchMcArdle = (leanMassKg: number): number => 370 + 21.6 * leanMassKg;

const daysBetween = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);

export const selectEnergyFormula = (input: EnergyFormulaInput): EnergyFormulaResult => {
  const { sex, weightKg, heightCm, ageYears } = input;
  const now = input.now ?? new Date();
  const warnings: string[] = [];

  if (sex === null) {
    warnings.push(
      'Sexo biológico não informado — Mifflin e Harris-Benedict dependem do sexo e não podem ser aplicadas.',
    );
  }

  const leanKg = finite(input.leanMass?.kg ?? null);
  const leanUsable = isLeanMassUsable(leanKg, weightKg);

  if (leanKg !== null && !leanUsable) {
    warnings.push('Massa magra registrada é implausível para o peso atual — não usada no cálculo.');
  }

  let staleLeanMass = false;
  if (leanUsable && input.leanMass?.measuredAt) {
    const measured = new Date(input.leanMass.measuredAt);
    if (!Number.isNaN(measured.getTime()) && daysBetween(now, measured) > LEAN_MASS_FRESH_DAYS) {
      staleLeanMass = true;
      warnings.push(
        `Composição corporal de ${measured.toLocaleDateString('pt-BR')}${
          input.leanMass.source ? ` (${input.leanMass.source})` : ''
        } — confira se ainda representa o aluno.`,
      );
    }
  }
  if (leanUsable && !input.leanMass?.measuredAt) {
    warnings.push('Massa magra sem data de avaliação registrada.');
  }

  // Sem sexo informado NÃO usamos equações dependentes de sexo (nada de assumir
  // masculino silenciosamente); restam apenas as baseadas em massa magra.
  const alternatives: Partial<Record<EnergyFormula, number>> = {};
  if (sex !== null) {
    alternatives.mifflin = Math.round(mifflinStJeor(sex, weightKg, heightCm, ageYears));
    alternatives.harris_benedict = Math.round(harrisBenedict(sex, weightKg, heightCm, ageYears));
  }
  if (leanUsable && leanKg !== null) {
    alternatives.cunningham = Math.round(cunningham(leanKg));
    alternatives.katch_mcardle = Math.round(katchMcArdle(leanKg));
  }

  const bmrFor = (formula: EnergyFormula): number | null => {
    const value = alternatives[formula];
    return value != null ? value : null;
  };

  // Escolha manual do treinador prevalece (inclusive massa magra "duvidosa").
  if (input.manualFormula) {
    const manualBmr = bmrFor(input.manualFormula);
    if (manualBmr != null) {
      return {
        formula: input.manualFormula,
        bmr: manualBmr,
        reason: 'Fórmula escolhida manualmente pelo treinador.',
        alternatives,
        warnings,
        insufficientData: false,
        leanMassUsable: leanUsable,
        manual: true,
      };
    }
    warnings.push('Fórmula escolhida manualmente não é aplicável com os dados atuais.');
  }

  if (leanUsable && alternatives.cunningham != null) {
    return {
      formula: 'cunningham',
      bmr: alternatives.cunningham,
      reason: staleLeanMass
        ? 'Massa magra disponível na composição corporal mais recente (avaliação antiga — confira a data).'
        : 'Massa magra disponível na avaliação mais recente.',
      alternatives,
      warnings,
      insufficientData: false,
      leanMassUsable: true,
      manual: false,
    };
  }

  if (alternatives.mifflin == null) {
    return {
      formula: 'mifflin',
      bmr: 0,
      reason:
        'Dados insuficientes: sem sexo biológico e sem massa magra utilizável não existe fórmula aplicável.',
      alternatives,
      warnings,
      insufficientData: true,
      leanMassUsable: false,
      manual: false,
    };
  }

  return {
    formula: 'mifflin',
    bmr: alternatives.mifflin,
    reason: 'Sem massa magra utilizável — usando Mifflin-St Jeor com peso, altura e idade.',
    alternatives,
    warnings,
    insufficientData: false,
    leanMassUsable: false,
    manual: false,
  };
};

export const ENERGY_FORMULA_LABEL: Record<EnergyFormula, string> = {
  cunningham: 'Cunningham (massa magra)',
  katch_mcardle: 'Katch-McArdle (massa magra)',
  mifflin: 'Mifflin-St Jeor',
  harris_benedict: 'Harris-Benedict',
};

/**
 * Fármacos (retatrutida, clembuterol, TRT, esteroides, termogênicos…) são
 * contexto do aluno e NÃO alteram energia. Função explícita para deixar a
 * regra visível em quem consome o motor.
 */
export const applyMedicationEnergyAdjustment = (tdee: number): number => tdee;
