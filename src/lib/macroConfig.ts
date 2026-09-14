/**
 * Configuração determinística de macros (Fase 2).
 *
 *  - g/kg ↔ gramas editáveis nos dois sentidos;
 *  - base por macro: peso corporal ou massa magra;
 *  - travas explícitas: exatamente um macro livre fecha as calorias;
 *  - dois macros livres → exigir escolha do macro de fechamento;
 *  - combinação inviável → erro claro, nunca ajuste silencioso.
 */

export type MacroKey = 'protein' | 'carbs' | 'fat';
export type MacroBasis = 'body_weight' | 'lean_mass';

export const MACRO_KCAL_PER_G: Record<MacroKey, number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

export const MACRO_LABEL: Record<MacroKey, string> = {
  protein: 'Proteína',
  carbs: 'Carboidrato',
  fat: 'Gordura',
};

export interface MacroSetting {
  /** Gramas por kg da base escolhida (pode ser null quando o macro é livre). */
  perKg: number | null;
  /** Gramas absolutas. */
  grams: number | null;
  basis: MacroBasis;
  locked: boolean;
}

export interface BodyBasis {
  weightKg: number;
  leanMassKg?: number | null;
}

export type MacroConfig = Record<MacroKey, MacroSetting>;

const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Peso de referência do macro conforme a base escolhida. */
export const basisWeight = (basis: MacroBasis, body: BodyBasis): number | null => {
  if (basis === 'lean_mass') {
    const lean = finite(body.leanMassKg ?? null);
    return lean && lean > 0 ? lean : null;
  }
  const weight = finite(body.weightKg);
  return weight && weight > 0 ? weight : null;
};

/** Edição do campo g/kg → atualiza as gramas. */
export const gramsFromPerKg = (
  perKg: number,
  basis: MacroBasis,
  body: BodyBasis,
): number | null => {
  const reference = basisWeight(basis, body);
  const value = finite(perKg);
  if (reference === null || value === null) return null;
  return round1(value * reference);
};

/** Edição do campo em gramas → atualiza o g/kg. */
export const perKgFromGrams = (
  grams: number,
  basis: MacroBasis,
  body: BodyBasis,
): number | null => {
  const reference = basisWeight(basis, body);
  const value = finite(grams);
  if (reference === null || value === null) return null;
  return round2(value / reference);
};

/** Aplica a edição de um campo mantendo os dois lados sincronizados. */
export const setMacroPerKg = (
  setting: MacroSetting,
  perKg: number | null,
  body: BodyBasis,
): MacroSetting =>
  // Limpar o campo limpa os DOIS lados: nunca manter valor antigo escondido.
  perKg === null
    ? { ...setting, perKg: null, grams: null }
    : { ...setting, perKg, grams: gramsFromPerKg(perKg, setting.basis, body) };

export const setMacroGrams = (
  setting: MacroSetting,
  grams: number | null,
  body: BodyBasis,
): MacroSetting =>
  grams === null
    ? { ...setting, perKg: null, grams: null }
    : { ...setting, grams, perKg: perKgFromGrams(grams, setting.basis, body) };

/** Troca da base mantém o g/kg e recalcula as gramas. */
export const setMacroBasis = (
  setting: MacroSetting,
  basis: MacroBasis,
  body: BodyBasis,
): MacroSetting => {
  const next: MacroSetting = { ...setting, basis };
  if (setting.perKg != null) next.grams = gramsFromPerKg(setting.perKg, basis, body);
  else if (setting.grams != null) next.perKg = perKgFromGrams(setting.grams, basis, body);
  return next;
};

/* -------------------------------------------------------------------------- */
/* Resolução das travas                                                       */
/* -------------------------------------------------------------------------- */

export type MacroResolutionStatus = 'ok' | 'needs_closing_macro' | 'infeasible' | 'incomplete';

export interface MacroResolution {
  status: MacroResolutionStatus;
  /** Gramas finais por macro (null quando não foi possível resolver). */
  grams: Record<MacroKey, number> | null;
  /** Macro usado para fechar as calorias. */
  closingMacro: MacroKey | null;
  kcalTarget: number;
  /** kcal dos macros resolvidos − meta. */
  kcalDelta: number;
  message: string | null;
  /** Opções quando o treinador precisa escolher o macro de fechamento. */
  closingOptions: MacroKey[];
}

export interface ResolveMacroInput {
  kcalTarget: number;
  config: MacroConfig;
  body: BodyBasis;
  /** Escolha explícita do treinador quando existe mais de um macro livre. */
  closingMacro?: MacroKey | null;
  /** Tolerância (kcal) para aceitar os três macros travados. */
  toleranceKcal?: number;
}

const kcalOf = (grams: Record<MacroKey, number>): number =>
  grams.protein * MACRO_KCAL_PER_G.protein +
  grams.carbs * MACRO_KCAL_PER_G.carbs +
  grams.fat * MACRO_KCAL_PER_G.fat;

const MACRO_KEYS: MacroKey[] = ['protein', 'carbs', 'fat'];

export const resolveMacroConfig = ({
  kcalTarget,
  config,
  body,
  closingMacro,
  toleranceKcal = 50,
}: ResolveMacroInput): MacroResolution => {
  const base: MacroResolution = {
    status: 'ok',
    grams: null,
    closingMacro: null,
    kcalTarget,
    kcalDelta: 0,
    message: null,
    closingOptions: [],
  };

  // Gramas declaradas de cada macro (derivando de g/kg quando necessário).
  const declared: Partial<Record<MacroKey, number>> = {};
  for (const key of MACRO_KEYS) {
    const setting = config[key];
    const grams =
      finite(setting.grams) ??
      (setting.perKg != null ? gramsFromPerKg(setting.perKg, setting.basis, body) : null);
    if (grams != null) declared[key] = grams;
  }

  const locked = MACRO_KEYS.filter((k) => config[k].locked);
  const free = MACRO_KEYS.filter((k) => !config[k].locked);

  // Macro travado precisa ter valor definido.
  const lockedMissing = locked.filter((k) => declared[k] == null);
  if (lockedMissing.length > 0) {
    return {
      ...base,
      status: 'incomplete',
      message: `Defina o valor de ${lockedMissing.map((k) => MACRO_LABEL[k]).join(' e ')} antes de travar.`,
    };
  }

  if (!Number.isFinite(kcalTarget) || kcalTarget <= 0) {
    return { ...base, status: 'incomplete', message: 'Meta calórica inválida.' };
  }

  // Caso 1 — três travados: só vale se fecharem dentro da tolerância.
  if (locked.length === 3) {
    const grams = {
      protein: declared.protein as number,
      carbs: declared.carbs as number,
      fat: declared.fat as number,
    };
    const delta = kcalOf(grams) - kcalTarget;
    if (Math.abs(delta) > toleranceKcal) {
      return {
        ...base,
        status: 'infeasible',
        grams,
        kcalDelta: Math.round(delta),
        message: `Essa combinação de macros ${delta > 0 ? 'ultrapassa' : 'fica abaixo d'}a meta calórica em ${Math.abs(
          Math.round(delta),
        )} kcal.`,
      };
    }
    return { ...base, grams, kcalDelta: Math.round(delta) };
  }

  // Caso 2 — exatamente um livre: ele fecha as calorias.
  // Caso 3 — dois ou três livres: exigir escolha do macro de fechamento e
  //          valores definidos nos demais.
  let closing: MacroKey | null = null;
  if (free.length === 1) {
    closing = free[0];
  } else {
    if (!closingMacro || !free.includes(closingMacro)) {
      return {
        ...base,
        status: 'needs_closing_macro',
        closingOptions: free,
        message:
          'Existe mais de um macro livre. Escolha qual deles fecha as calorias — o app não divide a diferença sozinho.',
      };
    }
    closing = closingMacro;
    const others = free.filter((k) => k !== closing);
    const missing = others.filter((k) => declared[k] == null);
    if (missing.length > 0) {
      return {
        ...base,
        status: 'incomplete',
        closingOptions: free,
        message: `Defina ${missing.map((k) => MACRO_LABEL[k]).join(' e ')} ou trave esse macro.`,
      };
    }
  }

  const fixedKcal = MACRO_KEYS.filter((k) => k !== closing).reduce(
    (acc, k) => acc + (declared[k] as number) * MACRO_KCAL_PER_G[k],
    0,
  );
  const remaining = kcalTarget - fixedKcal;
  const closingGrams = remaining / MACRO_KCAL_PER_G[closing];

  if (closingGrams < 0) {
    return {
      ...base,
      status: 'infeasible',
      closingMacro: closing,
      kcalDelta: Math.round(-remaining),
      message: `Essa combinação de macros ultrapassa a meta calórica em ${Math.abs(
        Math.round(remaining),
      )} kcal.`,
    };
  }

  const grams = {
    protein: closing === 'protein' ? round1(closingGrams) : (declared.protein as number),
    carbs: closing === 'carbs' ? round1(closingGrams) : (declared.carbs as number),
    fat: closing === 'fat' ? round1(closingGrams) : (declared.fat as number),
  };

  return {
    ...base,
    grams,
    closingMacro: closing,
    kcalDelta: Math.round(kcalOf(grams) - kcalTarget),
  };
};

/** Aviso quando o macro de fechamento fica em valor extremo. */
export const closingMacroWarning = (
  resolution: MacroResolution,
  body: BodyBasis,
): string | null => {
  if (resolution.status !== 'ok' || !resolution.grams || !resolution.closingMacro) return null;
  const key = resolution.closingMacro;
  const grams = resolution.grams[key];
  const perKg = perKgFromGrams(grams, 'body_weight', body);
  if (perKg === null) return null;
  const limits: Record<MacroKey, [number, number]> = {
    protein: [1.2, 3.5],
    carbs: [0.5, 8],
    fat: [0.4, 1.6],
  };
  const [min, max] = limits[key];
  if (perKg < min || perKg > max) {
    return `Para manter ${resolution.kcalTarget} kcal com essa configuração, ${MACRO_LABEL[
      key
    ].toLowerCase()} precisaria ficar em ${Math.round(grams)} g (${perKg} g/kg). Revise a configuração.`;
  }
  return null;
};

export const defaultMacroConfig = (): MacroConfig => ({
  protein: { perKg: 2.2, grams: null, basis: 'body_weight', locked: true },
  fat: { perKg: 0.8, grams: null, basis: 'body_weight', locked: true },
  carbs: { perKg: null, grams: null, basis: 'body_weight', locked: false },
});

/* -------------------------------------------------------------------------- */
/* Prescrição final por macro (gramas + g/kg na BASE escolhida)               */
/* -------------------------------------------------------------------------- */

export interface MacroPrescription {
  grams: number;
  perKg: number | null;
  basis: MacroBasis;
  basisLabel: string;
}

export const MACRO_BASIS_LABEL: Record<MacroBasis, string> = {
  body_weight: 'peso corporal',
  lean_mass: 'massa magra',
};

/**
 * Devolve, para cada macro, as gramas finais resolvidas e o g/kg calculado
 * SEMPRE na base escolhida pelo treinador — nunca recomposto pelo peso corporal.
 */
export const getMacroPrescription = (
  config: MacroConfig,
  resolution: MacroResolution,
  body: BodyBasis,
): Record<MacroKey, MacroPrescription> | null => {
  if (!resolution.grams) return null;
  const out = {} as Record<MacroKey, MacroPrescription>;
  for (const key of MACRO_KEYS) {
    const basis = config[key].basis;
    const grams = resolution.grams[key];
    out[key] = {
      grams,
      perKg: perKgFromGrams(grams, basis, body),
      basis,
      basisLabel: MACRO_BASIS_LABEL[basis],
    };
  }
  return out;
};
