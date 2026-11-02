/**
 * Agente de Dieta — código compartilhado entre a tela do admin (DietaIA) e a
 * edge function office-gerar (via bundle officeCore.js). Contém as opções do
 * wizard, os cálculos determinísticos de meta (TMB/GET, macros, carb cycling,
 * cronograma semanal), a montagem do prompt/corpo do diet-agent e a montagem
 * do rascunho em ai_plans. Nada aqui depende do navegador ou do cliente do app.
 */
import {
  type WeeklyEnergySchedule,
  type EnergyWeekday,
  type DayWorkoutRef,
  type BaseKcalCalculationSnapshot,
  type BaseKcalSource,
  ENERGY_WEEKDAYS,
  WEEKDAY_LABELS,
  buildDefaultSchedule,
  computeDayTarget,
  MIN_DAILY_KCAL,
  scheduleToJson,
  validateSchedule,
} from '../weeklyEnergy';
import { parseTrainingSections } from '../trainingResultParser';
import { extractTrainingContext } from '../trainingContextExtractor';
import { selectEnergyFormula, ENERGY_FORMULA_LABEL, type EnergyFormula, type EnergyFormulaResult } from '../energyFormula';
import {
  defaultMacroConfig,
  resolveMacroConfig,
  setMacroPerKg,
  getMacroPrescription,
  type MacroConfig,
  type MacroKey,
  type MacroResolution,
  type BodyBasis,
} from '../macroConfig';
import {
  defaultCarbCyclingConfig,
  buildCarbDayTypeTargets,
  buildWeeklyCarbTargets,
  suggestCarbDayTypeForWorkout,
  isCarbCyclingValid,
  type CarbCyclingConfig,
  type WeeklyCarbDayTarget,
} from '../carbCycling';
import { WEEKDAY_KEYS, resolveDayTarget, type WeekdayKey } from '../dietDayTargets';
import { buildStructuredDietPrompt } from '../structuredDietPrompt';
import { buildAllowedUnresolvedFromModelDiet, extractModelDietFoodNames, matchFoodNamesToCatalog } from '../modelDietFoods';
import { parseDietPlanStrict, parseDietPlanLoose, type DietPlan } from '../dietSchema';
import { finalizeDietPlan } from '../dietValidation';
import { normalizeDailyAdjustments, validateDailyAdjustments, evaluateTolerance, TOLERANCE_TEXT, type DailyAdjustments } from '../dailyAdjustments';
import { DEFAULT_INTENSITY as DEFAULT_DIET_INTENSITY, type VariationIntensity as DietVariationIntensity, type DietIntent } from '../variationProfiles';
import type { DietMacroTargets } from '../dietMacroValidation';

export type StudentCtx = Record<string, any>;

export type BaseKcalMode = BaseKcalSource;

export type BaseKcalState = {
  source: BaseKcalSource;
  base_daily_kcal: number | null;
  calculation: BaseKcalCalculationSnapshot;
  missing: string[];
};

export const BASE_SOURCE_LABELS: Record<BaseKcalSource, string> = {
  automatic: 'Cálculo automático',
  manual: 'Manual',
};

export const emptyCalculationSnapshot = (): BaseKcalCalculationSnapshot => ({
  bmr: null,
  activity_factor: null,
  tdee: null,
  strategy_percent: null,
  formula: null,
});

export const parsePositiveNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const calculateAge = (birthDate: unknown): number | null => {
  if (!birthDate) return null;
  const time = new Date(String(birthDate)).getTime();
  if (!Number.isFinite(time)) return null;
  const age = Math.floor((Date.now() - time) / (365.25 * 24 * 60 * 60 * 1000));
  return age > 0 ? age : null;
};

export const normalizeSex = (value: unknown): 'masculino' | 'feminino' | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['masculino', 'm', 'male', 'homem'].includes(normalized)) return 'masculino';
  if (['feminino', 'f', 'female', 'mulher'].includes(normalized)) return 'feminino';
  return null;
};

// Fatores de atividade diária (NEAT + rotina), alinhados à tabela clássica.
// value === factor em string; nunca é sobrescrito por frequência de treino.
export const ACTIVITY_LEVELS = [
  { value: '1.2',   factor: 1.20,  label: 'Sedentário', desc: 'Rotina parada, quase sem deslocamento' },
  { value: '1.3',   factor: 1.30,  label: 'Super Leve', desc: 'Trabalho sentado, pouca caminhada e rotina pouco ativa' },
  { value: '1.375', factor: 1.375, label: 'Leve',       desc: 'Alguma caminhada ou rotina diária levemente ativa' },
  { value: '1.55',  factor: 1.55,  label: 'Moderado',   desc: 'Rotina ativa ou trabalho com movimentação frequente' },
  { value: '1.725', factor: 1.725, label: 'Alto',       desc: 'Trabalho físico ou rotina diária muito ativa' },
  { value: '1.9',   factor: 1.90,  label: 'Extremo',    desc: 'Atividade física profissional ou trabalho físico muito intenso' },
];

export const STRATEGIES = [
  { value: 'deficit_leve', label: 'Déficit Leve (-10%)', desc: 'Emagrecimento gradual, preserva massa', pct: -10 },
  { value: 'deficit_moderado', label: 'Déficit Moderado (-20%)', desc: 'Emagrecimento acelerado', pct: -20 },
  { value: 'deficit_agressivo', label: 'Déficit Agressivo (-30%)', desc: 'Perda rápida, mais restritivo', pct: -30 },
  { value: 'manutencao', label: 'Manutenção (0%)', desc: 'Manter peso e composição', pct: 0 },
  { value: 'superavit_leve', label: 'Superávit Leve (+10%)', desc: 'Lean bulk — ganho limpo', pct: 10 },
  { value: 'superavit_moderado', label: 'Superávit Moderado (+20%)', desc: 'Bulk agressivo', pct: 20 },
];

export const MEAL_COUNTS = [
  { value: '4', label: '4 refeições' },
  { value: '5', label: '5 refeições' },
  { value: '6', label: '6 refeições' },
  { value: '7', label: '7 refeições' },
];

export const DIET_STYLES = [
  { value: 'flexivel', label: 'Flexível (IIFYM)', desc: 'Foco nos macros, liberdade de escolha dos alimentos' },
  { value: 'low_carb', label: 'Low Carb', desc: 'Redução significativa de carboidratos' },
  { value: 'cetogenica', label: 'Cetogênica', desc: 'Ultra low carb, alto em gorduras' },
  { value: 'mediterranea', label: 'Mediterrânea', desc: 'Baseada em azeite, peixes, grãos integrais' },
  { value: 'paleolitica', label: 'Paleolítica', desc: 'Alimentos naturais, sem processados' },
  { value: 'vegetariana', label: 'Vegetariana', desc: 'Sem carnes, permite ovos/laticínios' },
  { value: 'vegana', label: 'Vegana', desc: 'Sem alimentos de origem animal' },
  { value: 'convencional', label: 'Convencional', desc: 'Dieta tradicional balanceada' },
];

export const PHASES = [
  { value: 'bulking', label: 'Bulking', desc: 'Fase de ganho de massa' },
  { value: 'cutting', label: 'Cutting', desc: 'Fase de definição' },
  { value: 'manutencao', label: 'Manutenção', desc: 'Manter composição corporal' },
  { value: 'recomposicao', label: 'Recomposição', desc: 'Perder gordura e ganhar massa simultaneamente' },
  { value: 'pre_contest', label: 'Pré-Contest', desc: 'Preparação para competição' },
];

export const TRAINING_TIMES = [
  { value: 'manha_jejum', label: 'Manhã (jejum)' },
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
  { value: 'madrugada', label: 'Madrugada' },
];

export const TRAINING_DAYS_OPTIONS = [
  { value: '3', label: '3x/semana' },
  { value: '4', label: '4x/semana' },
  { value: '5', label: '5x/semana' },
  { value: '6', label: '6x/semana' },
  { value: '7', label: 'Todos os dias' },
];

export const RESTRICTION_OPTIONS = [
  'Sem lactose', 'Sem glúten', 'Sem frutos do mar', 'Sem carne vermelha',
  'Sem porco', 'Vegetariano', 'Vegano', 'Sem ovo', 'Sem soja',
  'Diabético', 'Hipertenso', 'Intolerância à frutose', 'Alergia a amendoim',
];

export const PREFERENCE_OPTIONS = [
  'Frango', 'Carne vermelha', 'Peixe', 'Ovos', 'Arroz integral',
  'Batata doce', 'Aveia', 'Whey no shake', 'Frutas', 'Pasta de amendoim',
  'Iogurte', 'Queijo cottage', 'Tapioca', 'Macarrão integral', 'Abacate',
];

export const PROTOCOL_ADJUSTMENTS = [
  { id: 'calorie_adjust', label: 'Ajuste de Calorias', desc: 'Aumento ou redução calórica semanal' },
  { id: 'carb_adjust', label: 'Ajuste de Carboidrato', desc: 'Manipulação de carbs por dia da semana' },
  { id: 'sodium_adjust', label: 'Ajuste de Sódio', desc: 'Protocolo de manipulação de sódio' },
  { id: 'water_adjust', label: 'Ajuste de Água', desc: 'Protocolo de ingestão hídrica' },
  { id: 'meal_change', label: 'Mudança de Refeições', desc: 'Alterar número/distribuição de refeições' },
  { id: 'plato', label: 'Estratégia para Platô', desc: 'Quebrar estagnação metabólica' },
  { id: 'refeed', label: 'Refeed', desc: 'Dias de recarga de carboidrato' },
  { id: 'diet_break', label: 'Diet Break', desc: 'Pausa programada na dieta' },
  { id: 'carb_cycling', label: 'Carb Cycling', desc: 'Ciclagem de carboidrato (high/medium/low)' },
];



export const hasHormoneUse = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return !['não', 'nao', 'natural', 'false', '0', 'n'].includes(normalized);
};

export const buildInitialMacroPreset = ({
  calories,
  weight,
  strategyValue,
  phaseValue,
  hormoneUse,
  proteinPerKgOverride,
  fatPerKgOverride,
}: {
  calories: number;
  weight: number;
  strategyValue: string;
  phaseValue: string;
  hormoneUse: boolean;
  proteinPerKgOverride?: number | null;
  fatPerKgOverride?: number | null;
}) => {
  const isDeficit = strategyValue.includes('deficit') || phaseValue === 'cutting' || phaseValue === 'pre_contest';
  const isMaintenance = (phaseValue === 'manutencao' || strategyValue === 'manutencao') && !isDeficit;

  let proteinPerKg = isDeficit ? 2.2 : isMaintenance ? 1.8 : 2.0;
  const proteinMax = isDeficit ? 2.6 : isMaintenance ? 2.2 : 2.4;
  const fatPerKg = isDeficit ? 0.8 : 0.9;

  // Hormônios/medicamentos são contexto clínico e NÃO alteram macros (Fase 2).
  void hormoneUse;
  proteinPerKg = Math.min(proteinPerKg, proteinMax);

  // g/kg overrides (Phase 2): apply when caller provided them and they are sensible.
  const finalProteinPerKg =
    typeof proteinPerKgOverride === 'number' && proteinPerKgOverride > 0
      ? Math.min(Math.max(proteinPerKgOverride, 0.8), 3.5)
      : proteinPerKg;
  const finalFatPerKg =
    typeof fatPerKgOverride === 'number' && fatPerKgOverride > 0
      ? Math.min(Math.max(fatPerKgOverride, 0.3), 2.0)
      : fatPerKg;

  const proteinGrams = Math.round(finalProteinPerKg * weight);
  const fatGrams = Math.round(finalFatPerKg * weight);
  const carbGrams = Math.max(Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4), 0);

  return {
    proteinPerKg: finalProteinPerKg,
    proteinGrams,
    fatPerKg: finalFatPerKg,
    fatGrams,
    carbGrams,
  };
};

// ─── Weekday parsing helpers for the Weekly Energy Schedule ──────
// Maps free-form training-day headers ("Segunda", "Dia 1 - Peito + Costas",
// "Terça — Peito/Tríceps") into a weekday key + label + muscle list.
export const WEEKDAY_KEY_PATTERNS: Array<[EnergyWeekday, RegExp]> = [
  ['seg', /\bseg(?:unda)?\b/i],
  ['ter', /\bter(?:ça|ca)?\b/i],
  ['qua', /\bqua(?:rta)?\b/i],
  ['qui', /\bqui(?:nta)?\b/i],
  ['sex', /\bsex(?:ta)?\b/i],
  ['sab', /\bs[áa]b(?:ado)?\b/i],
  ['dom', /\bdom(?:ingo)?\b/i],
];

export const MUSCLE_KEYWORDS: Array<[string, RegExp]> = [
  ['peito', /\bpeito|peitoral|supino|crossover|crucifix/i],
  ['costas', /\bcostas|dorsal|puxad|remada|pull|barra fixa/i],
  ['ombros', /\bombro|deltoid|elevaç(ão|ao)|desenvolvim/i],
  ['bíceps', /\bb[íi]ceps|rosca/i],
  ['tríceps', /\btr[íi]ceps|test(a|ão)|fr(a|â)nc[eê]s|corda/i],
  ['pernas', /\bperna|quadr[íi]ceps|leg press|agachamento|passada|extensora|hack/i],
  ['posterior', /\bposterior|isquio|stiff|mesa flexora|flex(a|ão) de perna/i],
  ['glúteos', /\bgl[úu]teo|hip thrust/i],
  ['panturrilha', /\bpanturrilh|gastrocn[eê]mio|s[óo]leo/i],
  ['abdômen', /\babdom(en|inal)|prancha|core/i],
  ['cardio', /\bcardio|corrida|esteira|bike|elipt/i],
];

export function parseWeekdayWorkouts(md: string): Partial<Record<EnergyWeekday, DayWorkoutRef>> {
  try {
    const sections = parseTrainingSections(md);
    const result: Partial<Record<EnergyWeekday, DayWorkoutRef>> = {};
    for (const section of sections) {
      if (section.type !== 'training' || !section.days) continue;
      for (const trainingDay of section.days) {
        const rawTitle = (trainingDay.day || '').trim();
        if (!rawTitle) continue;
        const match = WEEKDAY_KEY_PATTERNS.find(([, re]) => re.test(rawTitle));
        if (!match) continue;
        const [weekday, wdRe] = match;
        const afterSeparator = rawTitle.replace(wdRe, '').replace(/^[\s–—:\-]+/, '').trim();
        const label = afterSeparator || rawTitle;
        const exList = Array.isArray(trainingDay.exercises) ? trainingDay.exercises : [];
        const isRest = /\bdescanso|off\b/i.test(rawTitle) || exList.length === 0;
        const musclesSet = new Set<string>();
        const haystack = [rawTitle, ...exList.map((e) => e.exercise || '')].join(' | ');
        for (const [muscle, re] of MUSCLE_KEYWORDS) {
          if (re.test(haystack)) musclesSet.add(muscle);
        }
        if (!result[weekday]) {
          result[weekday] = {
            label: isRest ? 'Descanso' : label,
            type: isRest ? 'rest' : null,
            muscles: Array.from(musclesSet),
          };
        }
      }
    }
    return result;
  } catch (e) {
    console.warn('parseWeekdayWorkouts failed', e);
    return {};
  }
}

// ─── Estado do wizard ────────────────────────────────────────────────

export type ScheduleAdjustments = Record<EnergyWeekday, { adjustment_kcal: number; fixed_kcal: number | null }>;

export const emptyScheduleAdjustments = (): ScheduleAdjustments => ({
  seg: { adjustment_kcal: 0, fixed_kcal: null },
  ter: { adjustment_kcal: 0, fixed_kcal: null },
  qua: { adjustment_kcal: 0, fixed_kcal: null },
  qui: { adjustment_kcal: 0, fixed_kcal: null },
  sex: { adjustment_kcal: 0, fixed_kcal: null },
  sab: { adjustment_kcal: 0, fixed_kcal: null },
  dom: { adjustment_kcal: 0, fixed_kcal: null },
});

/** Respostas do wizard do Agente de Dieta (mesmos nomes dos estados da tela). */
export interface DietaWizardState {
  dailyRoutine: string;
  trainingTime: string;
  trainingDays: string;
  dietStyle: string;
  phase: string;
  usesHormones: boolean | null;
  hormoneDetails: string;
  activityLevel: string;
  strategy: string;
  mealCount: string;
  selectedRestrictions: string[];
  customRestriction: string;
  selectedPreferences: string[];
  customPreference: string;
  selectedAdjustments: string[];
  enableFitoterapia: boolean;
  enableSuplementos: boolean;
  enableEmagrecimentoRapido: boolean;
  enableJejumIntermitente: boolean;
  substitutions: { food: string; portion: string }[];
  modelDiet: string;
  variationIntensity: DietVariationIntensity;
  baseKcalMode: BaseKcalMode;
  manualBaseKcalInput: string;
  manualFormula: EnergyFormula | null;
  /** g/kg de proteína/gordura (null = preset automático por fase/estratégia, como na tela). */
  proteinPerKgOverride: number | null;
  fatPerKgOverride: number | null;
  scheduleAdjustments: ScheduleAdjustments;
}

export const defaultDietaWizardState = (): DietaWizardState => ({
  dailyRoutine: '', trainingTime: '', trainingDays: '', dietStyle: '', phase: '',
  usesHormones: null, hormoneDetails: '', activityLevel: '', strategy: '', mealCount: '',
  selectedRestrictions: [], customRestriction: '', selectedPreferences: [], customPreference: '',
  selectedAdjustments: [], enableFitoterapia: false, enableSuplementos: false,
  enableEmagrecimentoRapido: false, enableJejumIntermitente: false, substitutions: [], modelDiet: '',
  variationIntensity: DEFAULT_DIET_INTENSITY, baseKcalMode: 'automatic', manualBaseKcalInput: '',
  manualFormula: null, proteinPerKgOverride: null, fatPerKgOverride: null,
  scheduleAdjustments: emptyScheduleAdjustments(),
});

export const dietRestrictionsText = (s: Pick<DietaWizardState, 'selectedRestrictions' | 'customRestriction'>) => {
  const parts = [...s.selectedRestrictions];
  if (s.customRestriction.trim()) parts.push(s.customRestriction.trim());
  return parts.join(', ');
};

export const dietPreferencesText = (s: Pick<DietaWizardState, 'selectedPreferences' | 'customPreference'>) => {
  const parts = [...s.selectedPreferences];
  if (s.customPreference.trim()) parts.push(s.customPreference.trim());
  return parts.join(', ');
};

// ─── Cálculos determinísticos (mesmas funções usadas nos useMemo da tela) ──

export function computeEnergySelection(studentCtx: StudentCtx | null, manualFormula: EnergyFormula | null): EnergyFormulaResult | null {
  const weight = parsePositiveNumber(studentCtx?.peso);
  const height = parsePositiveNumber(studentCtx?.altura);
  const age = calculateAge(studentCtx?.data_nascimento);
  const sex = normalizeSex(studentCtx?.sexo);
  if (!weight || !height || !age) return null;
  return selectEnergyFormula({
    sex: sex === 'masculino' ? 'male' : sex === 'feminino' ? 'female' : null,
    weightKg: weight,
    heightCm: height,
    ageYears: age,
    bodyFatPct: parsePositiveNumber(studentCtx?.percentual_gordura),
    leanMass: {
      kg: parsePositiveNumber(studentCtx?.massa_magra),
      measuredAt: studentCtx?.massa_magra_data ?? null,
      source: studentCtx?.massa_magra_origem ?? 'Composição corporal mais recente',
    },
    manualFormula,
  });
}

export function computeAutomaticBaseKcal(
  studentCtx: StudentCtx | null,
  activityLevel: string,
  strategy: string,
  phase: string,
  energySelection: EnergyFormulaResult | null,
): BaseKcalState {
  const missing: string[] = [];
  const weight = parsePositiveNumber(studentCtx?.peso);
  const height = parsePositiveNumber(studentCtx?.altura);
  const age = calculateAge(studentCtx?.data_nascimento);
  const sex = normalizeSex(studentCtx?.sexo);
  const activityFactor = parsePositiveNumber(activityLevel);
  const selectedStrategy = STRATEGIES.find((s) => s.value === strategy);
  const selectedPhase = PHASES.find((p) => p.value === phase);

  if (!weight) missing.push('peso');
  if (!height) missing.push('altura');
  if (!age) missing.push('idade');
  if (!sex) missing.push('sexo');
  if (!activityFactor) missing.push('nível de atividade');
  if (!selectedPhase) missing.push('fase');
  if (!selectedStrategy) missing.push('estratégia');

  if (missing.length > 0 || !weight || !height || !age || !sex || !activityFactor || !selectedPhase || !selectedStrategy) {
    return { source: 'automatic', base_daily_kcal: null, calculation: emptyCalculationSnapshot(), missing };
  }

  // Fonte única: energyFormula.selectEnergyFormula (sem duplicar contas aqui).
  if (!energySelection || energySelection.insufficientData) {
    return {
      source: 'automatic',
      base_daily_kcal: null,
      calculation: emptyCalculationSnapshot(),
      missing: energySelection?.insufficientData ? ['sexo biológico ou massa magra válida'] : ['dados corporais'],
    };
  }
  const formula = ENERGY_FORMULA_LABEL[energySelection.formula];
  const roundedBmr = Math.round(energySelection.bmr);
  const tdee = Math.round(roundedBmr * activityFactor);
  const strategyPercent = selectedStrategy.pct;
  const base = Math.round(tdee * (1 + strategyPercent / 100));
  return {
    source: 'automatic',
    base_daily_kcal: base,
    calculation: { bmr: roundedBmr, activity_factor: activityFactor, tdee, strategy_percent: strategyPercent, formula },
    missing: [],
  };
}

export const parseManualBaseKcal = (manualBaseKcalInput: string): number | null => {
  const parsed = parsePositiveNumber(manualBaseKcalInput);
  return parsed == null ? null : Math.round(parsed);
};

export function resolveBaseKcal(baseKcalMode: BaseKcalMode, manualBaseKcal: number | null, automatic: BaseKcalState): BaseKcalState {
  if (baseKcalMode === 'manual') {
    return {
      source: 'manual',
      base_daily_kcal: manualBaseKcal,
      calculation: emptyCalculationSnapshot(),
      missing: manualBaseKcal == null ? ['meta calórica base manual'] : [],
    };
  }
  return automatic;
}

export function computeBaseKcalIssues(baseKcal: BaseKcalState, baseKcalMode: BaseKcalMode, automatic: BaseKcalState): string[] {
  const issues: string[] = [];
  if (baseKcal.source !== 'automatic' && baseKcal.source !== 'manual') issues.push('Origem da meta calórica base inválida.');
  if (baseKcal.base_daily_kcal == null) {
    issues.push('Meta calórica base ausente.');
  } else if (!Number.isFinite(baseKcal.base_daily_kcal) || baseKcal.base_daily_kcal <= 0) {
    issues.push('Meta calórica base inválida.');
  } else if (baseKcal.base_daily_kcal < MIN_DAILY_KCAL) {
    issues.push(`Meta calórica base abaixo do mínimo permitido (${MIN_DAILY_KCAL} kcal).`);
  }
  if (baseKcalMode === 'automatic' && automatic.missing.length > 0) {
    issues.push(`Dados ausentes para cálculo automático: ${automatic.missing.join(', ')}.`);
  }
  return issues;
}

export const computeMacroBody = (studentCtx: StudentCtx | null): BodyBasis => ({
  weightKg: parsePositiveNumber(studentCtx?.peso) ?? 0,
  leanMassKg: parsePositiveNumber(studentCtx?.massa_magra),
});

/** Preset inicial coerente com fase/estratégia (o mesmo efeito da tela). */
export function applyMacroPreset(
  prev: MacroConfig,
  p: { baseKcal: number | null; body: BodyBasis; strategy: string; phase: string; proteinPerKgOverride?: number | null; fatPerKgOverride?: number | null },
): MacroConfig {
  const preset = buildInitialMacroPreset({
    calories: p.baseKcal ?? 2000,
    weight: p.body.weightKg,
    strategyValue: p.strategy,
    phaseValue: p.phase,
    hormoneUse: false,
    proteinPerKgOverride: p.proteinPerKgOverride,
    fatPerKgOverride: p.fatPerKgOverride,
  });
  return {
    ...prev,
    protein: setMacroPerKg({ ...prev.protein, locked: true }, preset.proteinPerKg, p.body),
    fat: setMacroPerKg({ ...prev.fat, locked: true }, preset.fatPerKg, p.body),
    carbs: { ...prev.carbs, perKg: null, grams: null, locked: false },
  };
}

export const computeCanonicalTargets = (baseKcal: BaseKcalState, macroResolution: MacroResolution) => ({
  kcal: baseKcal.base_daily_kcal ?? 0,
  p: Math.round(macroResolution.grams?.protein ?? 0),
  c: Math.round(macroResolution.grams?.carbs ?? 0),
  g: Math.round(macroResolution.grams?.fat ?? 0),
});

export function computeWeeklySchedule(
  baseKcal: BaseKcalState,
  baseKcalIssuesCount: number,
  workoutByWeekday: Partial<Record<EnergyWeekday, DayWorkoutRef>>,
  scheduleAdjustments: ScheduleAdjustments,
): WeeklyEnergySchedule | null {
  if (baseKcal.base_daily_kcal == null || baseKcalIssuesCount > 0) return null;
  const draft = buildDefaultSchedule({
    baseDailyKcal: baseKcal.base_daily_kcal,
    workoutByWeekday,
    baseSource: baseKcal.source,
    calculationSnapshot: baseKcal.calculation,
  });
  for (const wd of ENERGY_WEEKDAYS) {
    const adj = scheduleAdjustments[wd];
    draft.days[wd].adjustment_kcal = adj.adjustment_kcal;
    draft.days[wd].fixed_kcal = adj.fixed_kcal;
  }
  return draft;
}

/** Sugestão de tipo de dia do carb cycling pelo treino — respeita escolhas manuais. */
export function suggestCarbAssignments(prev: CarbCyclingConfig, workoutByWeekday: Partial<Record<EnergyWeekday, DayWorkoutRef>>): CarbCyclingConfig {
  let changed = false;
  const assignments = { ...prev.assignments };
  for (const wd of WEEKDAY_KEYS) {
    if (prev.manual[wd]) continue;
    const suggestion = suggestCarbDayTypeForWorkout(workoutByWeekday[wd as EnergyWeekday] ?? null);
    if (assignments[wd] !== suggestion) {
      assignments[wd] = suggestion;
      changed = true;
    }
  }
  return changed ? { ...prev, assignments } : prev;
}

/** Todas as derivações da tela, para um estado de wizard sem edição manual de painéis. */
export function deriveDietaWizard(
  state: DietaWizardState,
  studentCtx: StudentCtx | null,
  workoutByWeekday: Partial<Record<EnergyWeekday, DayWorkoutRef>>,
) {
  const energySelection = computeEnergySelection(studentCtx, state.manualFormula);
  const automaticBaseKcal = computeAutomaticBaseKcal(studentCtx, state.activityLevel, state.strategy, state.phase, energySelection);
  const baseKcal = resolveBaseKcal(state.baseKcalMode, parseManualBaseKcal(state.manualBaseKcalInput), automaticBaseKcal);
  const baseKcalIssues = computeBaseKcalIssues(baseKcal, state.baseKcalMode, automaticBaseKcal);
  const macroBody = computeMacroBody(studentCtx);
  const closingMacro: MacroKey | null = null;
  const macroConfig = macroBody.weightKg
    ? applyMacroPreset(defaultMacroConfig(), {
      baseKcal: baseKcal.base_daily_kcal, body: macroBody, strategy: state.strategy, phase: state.phase,
      proteinPerKgOverride: state.proteinPerKgOverride, fatPerKgOverride: state.fatPerKgOverride,
    })
    : defaultMacroConfig();
  const macroResolution = resolveMacroConfig({ kcalTarget: baseKcal.base_daily_kcal ?? 0, config: macroConfig, body: macroBody, closingMacro });
  const canonicalTargets = computeCanonicalTargets(baseKcal, macroResolution);
  const carbCycling = suggestCarbAssignments(
    { ...defaultCarbCyclingConfig(), enabled: state.selectedAdjustments.includes('carb_cycling') },
    workoutByWeekday,
  );
  const carbTypeTargets = buildCarbDayTypeTargets({
    mode: carbCycling.mode,
    carbCycling,
    macroConfig,
    body: macroBody,
    baseKcal: baseKcal.base_daily_kcal ?? 0,
    closingMacro,
    baseResolvedMacros: macroResolution.grams ? { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g } : null,
  });
  const weeklyCarbTargets = carbCycling.enabled ? buildWeeklyCarbTargets(carbCycling, carbTypeTargets) : {};
  const weeklySchedule = computeWeeklySchedule(baseKcal, baseKcalIssues.length, workoutByWeekday, state.scheduleAdjustments);
  const carbCyclingValidity = isCarbCyclingValid(carbCycling, carbTypeTargets, weeklyCarbTargets);
  const scheduleIssues = weeklySchedule ? validateSchedule(weeklySchedule) : ['Cronograma semanal indisponível.'];
  const canGenerate = Boolean(
    state.activityLevel && state.strategy && state.mealCount && state.phase && weeklySchedule &&
    baseKcalIssues.length === 0 && macroResolution.status === 'ok' && carbCyclingValidity.valid,
  );
  return {
    energySelection, automaticBaseKcal, baseKcal, baseKcalIssues, macroBody, macroConfig, macroResolution,
    canonicalTargets, carbCycling, carbTypeTargets, weeklyCarbTargets, weeklySchedule, carbCyclingValidity,
    scheduleIssues, canGenerate,
  };
}

// ─── Montagem do pedido ao diet-agent ───────────────────────────────

export interface DietGenerationInput {
  state: DietaWizardState;
  studentCtx: StudentCtx;
  baseKcal: BaseKcalState;
  macroConfig: MacroConfig;
  macroResolution: MacroResolution;
  macroBody: BodyBasis;
  canonicalTargets: { kcal: number; p: number; c: number; g: number };
  carbCycling: CarbCyclingConfig;
  weeklyCarbTargets: Partial<Record<WeekdayKey, WeeklyCarbDayTarget>>;
  weeklySchedule: WeeklyEnergySchedule;
}

export function buildDietGenerationPrompts(input: DietGenerationInput) {
  const { state, studentCtx, baseKcal, macroConfig, macroResolution, macroBody, canonicalTargets, carbCycling, weeklyCarbTargets, weeklySchedule } = input;
  const {
    dailyRoutine, trainingTime, trainingDays, dietStyle, phase, usesHormones, hormoneDetails, activityLevel, strategy,
    mealCount, selectedRestrictions, selectedPreferences, selectedAdjustments, enableFitoterapia, enableSuplementos,
    enableEmagrecimentoRapido, enableJejumIntermitente, substitutions, modelDiet,
  } = state;
  const getRestrictionsText = () => dietRestrictionsText(state);
  const getPreferencesText = () => dietPreferencesText(state);

    const selectedStrategy = STRATEGIES.find(s => s.value === strategy);
    const selectedActivity = ACTIVITY_LEVELS.find(a => a.value === activityLevel);
    const selectedPhase = PHASES.find(p => p.value === phase);
    const selectedTrainingTime = TRAINING_TIMES.find(t => t.value === trainingTime);
    const selectedDietStyle = DIET_STYLES.find(d => d.value === dietStyle);

    const adjustmentLabels = selectedAdjustments.map(id => PROTOCOL_ADJUSTMENTS.find(a => a.id === id)?.label).filter(Boolean);

    // Build meal names based on count
    const getMealNames = (count: number): string[] => {
      const base = ['Café da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar'];
      if (count <= 4) return base.slice(0, count);
      const extra = ['Pós-Treino', 'Ceia', 'Lanche da Manhã'];
      return [...base, ...extra.slice(0, count - 4)];
    };

    const mealNames = getMealNames(Number(mealCount));

    // Build alimentos_por_refeicao info from questionnaire
    let alimentosPorRefeicaoText = '';
    if (studentCtx.questionario_dieta?.alimentos_por_refeicao) {
      const apr = studentCtx.questionario_dieta.alimentos_por_refeicao;
      if (typeof apr === 'object' && apr !== null) {
        const entries = Object.entries(apr as Record<string, any>).filter(([, v]) => v && String(v).trim());
        if (entries.length > 0) {
          alimentosPorRefeicaoText = `\n=== ALIMENTOS POR REFEIÇÃO (informados pelo aluno na ficha) ===\n${entries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}\nIMPORTANTE: Respeite esses alimentos nas refeições correspondentes.\n`;
        }
      }
    }

    const observationsList = [
      dailyRoutine && `Observações digitadas no wizard: ${dailyRoutine}`,
      studentCtx.observacoes && `Observações do perfil do aluno: ${studentCtx.observacoes}`,
      studentCtx.anamnese?.rotina && `Rotina registrada na anamnese: ${studentCtx.anamnese.rotina}`,
      studentCtx.questionario_dieta?.observacoes && `Observações do questionário: ${studentCtx.questionario_dieta.observacoes}`,
      studentCtx.questionario_dieta?.como_se_sente && `Como o aluno se sente: ${studentCtx.questionario_dieta.como_se_sente}`,
    ].filter(Boolean);

    const criticalInputsText = `
=== INPUTS OBRIGATÓRIOS DO WIZARD E DA FICHA ===
Use TODOS os dados abaixo como prioridade máxima. NÃO ignore, NÃO substitua por suposições e NÃO contradiga esses campos.
- Frequência de treino selecionada: ${trainingDays ? `${trainingDays}x/semana` : studentCtx.questionario_dieta?.dias_treino || 'Não informada'}
- Fase atual selecionada: ${selectedPhase?.label || studentCtx.questionario_dieta?.fase_atual || 'Não informada'}
- Nível de atividade física selecionado: ${selectedActivity?.label || 'Não informado'} (FA = ${activityLevel || 'não informado'})
- Restrições alimentares obrigatórias: ${getRestrictionsText() || studentCtx.questionario_dieta?.restricoes_alimentares || studentCtx.restricoes || 'Nenhuma informada'}
- Preferências alimentares: ${getPreferencesText() || studentCtx.questionario_dieta?.preferencias_alimentares || 'Não informadas'}
- Estilo de dieta selecionado: ${selectedDietStyle?.label || studentCtx.questionario_dieta?.estilo_dieta || 'Não informado'}
${observationsList.length > 0 ? observationsList.map(item => `- ${item}`).join('\n') : '- Observações adicionais: Nenhuma informada'}
IMPORTANTE: Se houver conflito entre uma inferência sua e os dados acima, os dados acima vencem.
`;


    // Recalculate recommendation using the single base-kcal source selected in the wizard.
    let recText = '';
    let currentTargets: DietMacroTargets | null = null;
    const currentCalories = baseKcal.base_daily_kcal;
    const currentFA = baseKcal.calculation.activity_factor;
    const currentStrategyPct = baseKcal.calculation.strategy_percent;
    const currentGET = baseKcal.calculation.tdee;
    const currentBmr = baseKcal.calculation.bmr;
    const currentFormula = baseKcal.calculation.formula;
    // Fase 2: os macros vêm EXCLUSIVAMENTE da configuração exibida na tela,
    // preservando a BASE escolhida (peso corporal ou massa magra) em cada g/kg.
    const prescription = getMacroPrescription(macroConfig, macroResolution, macroBody);
    const macros = {
      proteinGrams: canonicalTargets.p,
      carbGrams: canonicalTargets.c,
      fatGrams: canonicalTargets.g,
      proteinPerKg: prescription?.protein.perKg ?? null,
      fatPerKg: prescription?.fat.perKg ?? null,
      proteinBasis: prescription?.protein.basisLabel ?? 'peso corporal',
      fatBasis: prescription?.fat.basisLabel ?? 'peso corporal',
    };
    currentTargets = {
      calories: currentCalories,
      protein: macros.proteinGrams,
      carbs: macros.carbGrams,
      fats: macros.fatGrams,
    };

    recText = `
=== RECOMENDAÇÃO CALCULADA (VALORES OBRIGATÓRIOS — NÃO RECALCULE) ===
- Origem da meta base: ${BASE_SOURCE_LABELS[baseKcal.source]}
- TMB: ${currentBmr ?? 'não aplicada'} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ''}
- Fator de Atividade: ${currentFA ?? 'não aplicado'}
- GET: ${currentGET ?? 'não aplicado'} kcal
- Estratégia: ${selectedStrategy?.label} (${(currentStrategyPct ?? 0) > 0 ? '+' : ''}${currentStrategyPct ?? 0}%)
- Calorias alvo EXATAS: ${currentCalories} kcal
- Proteína EXATA: ${macros.proteinGrams}g${macros.proteinPerKg ? ` (${macros.proteinPerKg} g/kg de ${macros.proteinBasis})` : ''}
- Carboidrato EXATO: ${macros.carbGrams}g
- Gordura EXATA: ${macros.fatGrams}g${macros.fatPerKg ? ` (${macros.fatPerKg} g/kg de ${macros.fatBasis})` : ''}
⚠️ OBRIGATÓRIO: O TOTAL DIÁRIO da tabela DEVE ser EXATAMENTE ${currentCalories} kcal (tolerância ±50 kcal). Proteína total = ${macros.proteinGrams}g, Carboidrato total = ${macros.carbGrams}g, Gordura total = ${macros.fatGrams}g. NÃO use outros valores. NÃO recalcule a TMB. Estes valores já são definitivos.
⚠️ REGRA DE CORREÇÃO: Se faltar caloria para bater a meta, ajuste CARBOIDRATO. NÃO aumente proteína acima de ${macros.proteinGrams}g para completar calorias.
⚠️ VALIDAÇÃO FINAL: Antes de responder, some alimento por alimento. A dieta só é aceitável se ficar entre ${currentCalories - 50} e ${currentCalories + 50} kcal, proteína entre ${macros.proteinGrams - 10} e ${macros.proteinGrams + 10}g, carboidrato entre ${macros.carbGrams - 15} e ${macros.carbGrams + 15}g e gordura entre ${macros.fatGrams - 8} e ${macros.fatGrams + 8}g.
`;

    if (carbCycling.enabled) {
      const dayLines = WEEKDAY_KEYS.map((wd) => {
        const d = weeklyCarbTargets[wd];
        if (!d) return '';
        return `${WEEKDAY_LABELS[wd as EnergyWeekday].toUpperCase()} — ${d.type.toUpperCase()}\nKcal: ${d.kcal}\nP: ${d.p}g\nC: ${d.c}g\nG: ${d.g}g`;
      }).filter(Boolean).join('\n\n');
      recText = `
=== REFERÊNCIA METABÓLICA (NÃO É A META DE TODOS OS DIAS) ===
- TMB: ${currentBmr ?? 'não aplicada'} kcal${currentFormula ? ` (calculado por ${currentFormula})` : ''}
- GET: ${currentGET ?? 'não aplicado'} kcal
- Meta base diária (apenas referência): ${currentCalories} kcal

=== METAS DIÁRIAS OBRIGATÓRIAS (CARB CYCLING) ===
${dayLines}

⚠️ Cada dia deve respeitar sua própria meta. Não aplicar a meta base global por cima dessas metas.
⚠️ NÃO recalcule a TMB nem os macros. Os valores acima são definitivos (tolerância ±50 kcal por dia).
`;
    }

    const prompt = `Gere o plano alimentar COMPLETO para fisiculturismo com as seguintes configurações:
${criticalInputsText}
${recText}

=== ROTINA DO ALUNO ===
- Rotina diária: ${dailyRoutine || 'Não informada'}
- Horário de treino: ${selectedTrainingTime?.label || 'Não informado'}
- Dias de treino: ${trainingDays ? `${trainingDays}x/semana` : 'Não informado'}

=== ESTILO DE DIETA ===
- Estilo: ${selectedDietStyle?.label || 'Não definido'} — ${selectedDietStyle?.desc || ''}
IMPORTANTE: Siga o estilo selecionado sem quebrar os macros obrigatórios. Se Low Carb/Cetogênica conflitar com a meta de carboidrato calculada, a meta calculada vence. Se Vegetariana/Vegana, respeite as restrições proteicas sem aumentar a proteína total.

=== FASE ATUAL ===
- Fase: ${selectedPhase?.label} — ${selectedPhase?.desc}
- Uso de hormônios: ${usesHormones === null ? 'Não informado' : usesHormones ? `Sim — ${hormoneDetails || 'detalhes não especificados'}` : 'Não (natural)'}

=== PARÂMETROS NUTRICIONAIS ===
- Fator de Atividade: ${selectedActivity?.label} (FA = ${activityLevel})
- Estratégia: ${selectedStrategy?.label} (${(selectedStrategy?.pct ?? 0) > 0 ? '+' : ''}${selectedStrategy?.pct}%)
- Número de refeições: ${mealCount} por dia
- NOMES DAS REFEIÇÕES (use EXATAMENTE estes nomes na coluna "Refeição" da tabela): ${mealNames.join(', ')}
${getRestrictionsText() ? `- Restrições alimentares: ${getRestrictionsText()}` : ''}
${getPreferencesText() ? `- Preferências alimentares: ${getPreferencesText()}` : ''}
${alimentosPorRefeicaoText}
=== AJUSTES DO PROTOCOLO ===
${adjustmentLabels.length > 0 ? adjustmentLabels.map(a => `- ${a}`).join('\n') : '- Nenhum ajuste selecionado'}

=== EXTRAS ===
${enableFitoterapia ? '- INCLUIR RECEITAS DE FITOTERAPIA: Sugira chás, infusões e preparações fitoterápicas complementares. Inclua dosagens, horários e benefícios.' : ''}
${enableSuplementos ? '- INCLUIR SUPLEMENTAÇÃO COMPLETA: Protocolo de suplementos com dosagem, horário e justificativa.' : ''}
${enableEmagrecimentoRapido ? '- ESTRATÉGIA DE EMAGRECIMENTO RÁPIDO: Estratégias avançadas (jejum intermitente, HIIT, termogênicos).' : ''}
${enableJejumIntermitente ? '- JEJUM INTERMITENTE: Estruturar o dia alimentar respeitando a janela alimentar. Concentrar refeições na janela e indicar horários explicitamente. Não criar refeições fora da janela.' : ''}
=== SUBSTITUIÇÕES DE ALIMENTOS ===
OBRIGATÓRIO: Para CADA alimento na tabela de refeições, a coluna "Substituição" deve conter EXATAMENTE 3 opções de troca, cada uma com nome e quantidade (em gramas), que tenham macros e calorias equivalentes ao alimento principal.
Formato da coluna Substituição: "1) Alimento X (Xg); 2) Alimento Y (Xg); 3) Alimento Z (Xg)"
Exemplo: "1) Batata-doce (150g); 2) Inhame (140g); 3) Mandioca (120g)"
As 3 opções devem ser alimentos DIFERENTES entre si e diferentes do alimento principal, respeitando os macros e calorias equivalentes.
${substitutions.length > 0 ? `Use PREFERENCIALMENTE os alimentos abaixo como opções de substituição:\n${substitutions.map(s => `- ${s.food}: ${s.portion}`).join('\n')}` : ''}
${modelDiet.trim() ? `
 === DIETA MODELO (APENAS LISTA DE ALIMENTOS) ===
 IMPORTANTE: A dieta modelo serve APENAS como fonte da LISTA DE ALIMENTOS por refeição. IGNORE completamente as calorias, macros, "Estimativa" e "TOTAL DIÁRIO" da dieta modelo — esses valores NÃO devem ser copiados nem usados como referência. ${carbCycling.enabled ? 'Use as metas específicas de cada dia definidas no bloco METAS DIÁRIAS OBRIGATÓRIAS — não existe meta única para todos os dias.' : `A meta calórica e de macros do aluno é a definida acima (${currentCalories} kcal, P=${macros.proteinGrams}g, C=${macros.carbGrams}g, G=${macros.fatGrams}g) e SEMPRE prevalece.`}
 REGRAS OBRIGATÓRIAS:
 1) Use EXATAMENTE os mesmos alimentos da dieta modelo, na MESMA ordem, refeição por refeição, preservando o NOME EXATO (ex.: "Arroz basmati cozido") — não renomeie nem simplifique. Se o alimento não estiver na base do sistema, use-o mesmo assim e devolva kcal/P/C/G estimados por você.
 2) AJUSTE LIVREMENTE AS QUANTIDADES (gramas/ml/unidades) de cada item para bater EXATAMENTE a meta calórica e de macros do aluno — as quantidades da dieta modelo são apenas ponto de partida e devem ser recalculadas do zero conforme a meta do aluno.
 3) Substituição do alimento SÓ é permitida quando o alimento da dieta modelo estiver listado como restrição/alergia/intolerância do aluno. Nesse caso, substitua por um item de perfil nutricional semelhante e explique o motivo na coluna "Substituição".
 4) NÃO adicione alimentos que não estejam na dieta modelo, exceto quando absolutamente necessário para fechar um macro — nesse caso, prefira alimentos que já apareçam em outras refeições da própria dieta modelo.
 5) Para cada alimento, preencha SEMPRE Kcal, P, C, G reais daquela quantidade.
 6) FORMATO DA DIETA MODELO: markdown com títulos "### N. Nome da refeição — HHhMM" seguidos por bullets "* Nome do alimento: quantidade". Extraia cada bullet como um alimento; use o horário do título na coluna "Horário" (ex.: "13:30"); mapeie o nome da refeição para os nomes oficiais (${mealNames.join(', ')}). Linhas de "Estimativa" e "TOTAL DIÁRIO" devem ser IGNORADAS.
Dieta modelo:
${modelDiet.trim()}
` : ''}
${studentCtx.questionario_dieta?.preferencias_alimentares ? `
=== PREFERÊNCIAS ALIMENTARES DO ALUNO ===
Estes são os alimentos que o aluno GOSTA e PODE comer. Ao usar dieta modelo, substitua qualquer alimento que não esteja nesta lista por um equivalente desta lista:
${studentCtx.questionario_dieta.preferencias_alimentares}` : ''}
${studentCtx.questionario_dieta?.restricoes_alimentares ? `
=== RESTRIÇÕES ALIMENTARES DO ALUNO ===
O aluno NÃO PODE comer os alimentos/grupos abaixo. Se aparecerem na dieta modelo, SUBSTITUA obrigatoriamente por alternativas permitidas:
${studentCtx.questionario_dieta.restricoes_alimentares}` : ''}
${selectedPreferences.length > 0 ? `
=== ALIMENTOS PREFERIDOS (selecionados pelo nutricionista) ===
Priorize estes alimentos ao montar o plano ou ao substituir itens da dieta modelo:
${selectedPreferences.join(', ')}` : ''}
${selectedRestrictions.length > 0 ? `
=== RESTRIÇÕES (selecionadas pelo nutricionista) ===
O aluno possui estas restrições. Nunca inclua alimentos incompatíveis:
${selectedRestrictions.join(', ')}` : ''}
Use também a base de alimentos disponível do sistema para escolher substituições adequadas.

=== ESTRUTURA OBRIGATÓRIA DA TABELA ===
A tabela DEVE ter as colunas: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição
REGRA CRÍTICA: A coluna "Refeição" deve conter SOMENTE os nomes das refeições: ${mealNames.join(', ')}
Cada refeição deve ter VÁRIOS alimentos (linhas), onde a primeira linha de cada refeição mostra o nome da refeição e as linhas seguintes ficam com a célula "Refeição" VAZIA (continuação da mesma refeição).
NÃO coloque nomes de refeições na coluna "Alimento". A coluna "Alimento" é SOMENTE para os alimentos.
Inclua uma linha de TOTAL por refeição e TOTAL DIÁRIO no final.

GERE TUDO DE UMA VEZ:
${studentCtx.questionario_dieta ? `
=== FEEDBACK DO ALUNO (Questionário respondido em ${new Date(studentCtx.questionario_dieta.respondido_em).toLocaleDateString('pt-BR')}) ===
- Estilo de dieta preferido: ${studentCtx.questionario_dieta.estilo_dieta || 'Não informado'}
- Fase informada pelo aluno: ${studentCtx.questionario_dieta.fase_atual || 'Não informada'}
- Alimentos preferidos: ${studentCtx.questionario_dieta.preferencias_alimentares || 'Não informado'}
- Restrições do aluno: ${studentCtx.questionario_dieta.restricoes_alimentares || 'Nenhuma'}
- Usa hormônios: ${studentCtx.questionario_dieta.usa_hormonios || 'Não informado'}
- Como se sente: ${studentCtx.questionario_dieta.como_se_sente || 'Não informou'}
- Sintomas relatados: ${[
    studentCtx.questionario_dieta.fraqueza && 'Fraqueza muscular',
    studentCtx.questionario_dieta.dor_cabeca && 'Dor de cabeça',
    studentCtx.questionario_dieta.reduziu_peso && 'Reduziu peso',
    studentCtx.questionario_dieta.pele_fina && 'Pele mais fina',
    studentCtx.questionario_dieta.fome_excessiva && 'Fome excessiva',
    studentCtx.questionario_dieta.insonia && 'Insônia',
    studentCtx.questionario_dieta.baixa_energia && 'Baixa energia',
    studentCtx.questionario_dieta.irritabilidade && 'Irritabilidade',
  ].filter(Boolean).join(', ') || 'Nenhum'}
- Observações do aluno: ${studentCtx.questionario_dieta.observacoes || 'Nenhuma'}

IMPORTANTE: Considere os sintomas e feedback do aluno ao montar a dieta. Se há fraqueza/baixa energia, priorize mais calorias ou distribuição melhor. Se há insônia, evite estimulantes à noite. Se reduziu peso, pode estar em déficit excessivo.
` : ''}
1) Utilize a TMB e o GET fornecidos pelo app apenas como referência
2) NÃO recalcule a TMB/GET nem escolha outra fórmula — a fórmula já foi definida pelo app
3) Monte o plano exatamente conforme os targets fornecidos${carbCycling.enabled ? ' para CADA dia (bloco METAS DIÁRIAS OBRIGATÓRIAS)' : ''}
4) Apresente a distribuição de macronutrientes usando os gramas fornecidos
5) EXATAMENTE 1 cardápio completo em tabela com: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição.
6) Total de cada refeição e do dia
7) Timing nutricional (pré-treino, intra-treino, pós-treino) baseado no horário de treino informado
${selectedAdjustments.includes('carb_cycling') ? '8) Protocolo de Carb Cycling com tabela de dias High/Medium/Low' : ''}
${selectedAdjustments.includes('refeed') ? '9) Protocolo de Refeed: frequência, calorias e macros no dia de refeed' : ''}
${selectedAdjustments.includes('diet_break') ? '10) Protocolo de Diet Break: duração, calorias de manutenção' : ''}
${selectedAdjustments.includes('plato') ? '11) Estratégias para quebrar platô metabólico' : ''}
${selectedAdjustments.includes('sodium_adjust') ? '12) Protocolo de manipulação de sódio (especialmente para pré-contest)' : ''}
${selectedAdjustments.includes('water_adjust') ? '13) Protocolo de manipulação hídrica' : ''}
${enableFitoterapia ? '14) Receitas e protocolos de fitoterapia' : ''}
${enableSuplementos ? '15) Protocolo de suplementação completo' : ''}
${enableEmagrecimentoRapido ? '16) Estratégias avançadas de emagrecimento' : ''}
17) Mensagens prontas para WhatsApp`;

  // Fase 3 é a única implementação de carb cycling — o plano legado
  // (buildCarbCyclePlan) não é mais enviado em paralelo ao diet-agent.
  const cyclePlan = null;
  const structuredPrompt = buildStructuredDietPrompt({
    studentContext: criticalInputsText,
    routine: [
      `Rotina diária: ${dailyRoutine || 'Não informada'}`,
      `Horário de treino: ${selectedTrainingTime?.label || 'Não informado'}`,
    ].join('\n'),
    training: trainingDays ? `${trainingDays}x/semana` : 'Não informado',
    phase: `${selectedPhase?.label ?? 'Não informada'} — ${selectedPhase?.desc ?? ''}`,
    strategy: `${selectedStrategy?.label ?? 'Não informada'} (${(selectedStrategy?.pct ?? 0) > 0 ? '+' : ''}${selectedStrategy?.pct ?? 0}%)`,
    style: `${selectedDietStyle?.label || 'Não definido'} — ${selectedDietStyle?.desc || ''}`,
    meals: [
      `Número de refeições: ${mealCount} por dia`,
      `Nomes das refeições (use exatamente): ${mealNames.join(', ')}`,
      alimentosPorRefeicaoText.trim(),
    ].filter(Boolean).join('\n'),
    restrictions: [getRestrictionsText(), ...selectedRestrictions].filter(Boolean).join('; '),
    preferences: [getPreferencesText(), ...selectedPreferences].filter(Boolean).join('; '),
    targets: carbCycling.enabled ? '' : recText,
    carbCycling: carbCycling.enabled ? recText : '',
    modelDiet: modelDiet.trim(),
    extras: adjustmentLabels.length > 0 ? adjustmentLabels.map((a) => `- ${a}`).join('\n') : '',
  });

  const dietConfig = {
    objective: phase || undefined,
    strategy: strategy || undefined,
    style: dietStyle || undefined,
    ...(cyclePlan ? { carbCyclePlan: cyclePlan } : {}),
    // Autoridade explícita: carb cycling materializa cada weekday e
    // por isso NÃO exige dailyAdjustments add/remove.
    carbCyclingEnabled: carbCycling.enabled,
    weeklyEnergySchedule: {
      base_daily_kcal: currentTargets!.calories,
      base_source: weeklySchedule.base_source,
      calculation_snapshot: weeklySchedule.calculation_snapshot,
      days: Object.fromEntries(
        ENERGY_WEEKDAYS.map((wd) => {
          const entry = weeklySchedule.days[wd];
          // Rebase adjustments over the definitive currentTargets!.calories.
          const adj = entry.adjustment_kcal;
          const fixed = entry.fixed_kcal;
          // Fase 3: quando o carb cycling está ativo, o dia já vem
          // materializado com {kcal,p,c,g} — resolveDayTarget é o
          // ponto único de consumo e nada é reescalonado depois.
          const cycleDay = carbCycling.enabled ? weeklyCarbTargets[wd] : undefined;
          const dayTarget = resolveDayTarget({
            schedule: weeklySchedule as unknown as Parameters<typeof resolveDayTarget>[0]['schedule'],
            dayIndex: ENERGY_WEEKDAYS.indexOf(wd),
            planTargetKcal: currentTargets!.calories,
            planTargetMacros: { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g },
            dayTarget: cycleDay ?? null,
          });
          const target = cycleDay
            ? dayTarget.kcal
            : fixed != null && fixed > 0
              ? Math.round(fixed)
              : Math.round(currentTargets!.calories + adj);
          return [wd, {
            base_kcal: currentTargets!.calories,
            adjustment_kcal: cycleDay ? 0 : adj,
            fixed_kcal: cycleDay ? target : fixed,
            target_kcal: target,
            day_type: cycleDay?.type ?? null,
            protein_g: dayTarget.p || null,
            carbs_g: dayTarget.c || null,
            fat_g: dayTarget.g || null,
            workout: entry.workout,
          }];
        }),
      ),
    },
  };
  const targets = {
    kcal: currentTargets!.calories,
    p: currentTargets!.protein,
    c: currentTargets!.carbs,
    g: currentTargets!.fats,
    tmb: currentBmr ?? undefined,
    get: currentGET ?? undefined,
  };
  return { prompt, structuredPrompt, dietConfig, targets, currentTargets: currentTargets!, criticalInputsText, recText };
}


/** Contexto do treino ativo (markdown publicado) para o diet-agent. */
export function buildDietTrainingContext(trainingMarkdown: string | null | undefined, trainingTime: string) {
  if (!trainingMarkdown) return undefined;
  return extractTrainingContext({
    trainingMarkdown,
    trainingTime: (['manha', 'tarde', 'noite'] as const).find((t) => trainingTime?.includes(t)) || null,
  });
}

export type DietFoodRecord = { id: string; name: string; calories: number; protein: number; carbs: number; fats: number; portion_size: number };

/** Base alimentar no formato usado pela validação structured (foodId obrigatório). */
// deno-lint-ignore no-explicit-any
export async function loadDietFoodRecords(sb: any): Promise<DietFoodRecord[]> {
  const { data, error } = await sb
    .from('foods')
    .select('id, name, calories, protein, carbs, fats, portion_size')
    .order('name');
  if (error) throw new Error('Erro ao carregar base alimentar: ' + error.message);
  // deno-lint-ignore no-explicit-any
  return (data || []).map((food: any) => ({
    id: String(food.id),
    name: food.name,
    calories: Number(food.calories) || 0,
    protein: Number(food.protein) || 0,
    carbs: Number(food.carbs) || 0,
    fats: Number(food.fats) || 0,
    portion_size: Number(food.portion_size) || 100,
  }));
}

/**
 * Alimentos da dieta modelo sem correspondência na base (podem voltar sem
 * foodId) e associação de nomes livres ao catálogo — calculado ANTES da geração.
 */
export function buildDietFoodHints(modelDiet: string, preferencesText: string, foodsForCheck: DietFoodRecord[]) {
  let allowedUnresolvedFoods: { name: string; source: string }[] = [];
  let foodAliasBlock = '';
  if (modelDiet.trim()) {
    allowedUnresolvedFoods = buildAllowedUnresolvedFromModelDiet(modelDiet, foodsForCheck);
  }
  const freeNames = [
    ...preferencesText.split(/[,;\n]/),
    ...extractModelDietFoodNames(modelDiet),
    ...modelDiet.split(/[,;\n]/).filter((x) => x.trim().length <= 40 && !/\d/.test(x)),
  ].map((x) => x.replace(/^\s*[-*•]\s*/, '').trim()).filter((x) => x.length >= 3);
  const { matched, unmatched } = matchFoodNamesToCatalog(freeNames, foodsForCheck);
  if (matched.length) {
    const matchedKeys = new Set(matched.map((m) => m.from.toLowerCase()));
    allowedUnresolvedFoods = allowedUnresolvedFoods.filter((a) => !matchedKeys.has(a.name.toLowerCase()));
    foodAliasBlock = `\n\n=== ALIMENTOS CITADOS → USE ESTES DO CATÁLOGO ===\n${matched
      .map((m) => `- "${m.from}" = ${m.to}${m.id ? ` [id=${m.id}]` : ''}`)
      .join('\n')}\nUse SEMPRE o foodId indicado para esses alimentos.`;
  }
  const modelNames = new Set(extractModelDietFoodNames(modelDiet).map((n) => n.toLowerCase()));
  const unmatchedModel = unmatched.filter((n) => modelNames.has(n.toLowerCase()));
  return { allowedUnresolvedFoods, foodAliasBlock, matched, unmatchedModel };
}

/** Corpo exato do POST structured ao diet-agent (admin e escritório). */
export function buildDietAgentBody(p: {
  userPrompt: string;
  foodAliasBlock: string;
  studentCtx: StudentCtx | null;
  // deno-lint-ignore no-explicit-any
  dietConfig: any;
  // deno-lint-ignore no-explicit-any
  trainingContext: any;
  studentId: string;
  variationIntensity: DietVariationIntensity;
  intent: DietIntent;
  modelDiet: string;
  targets: { kcal: number; p: number; c: number; g: number };
  allowedUnresolvedFoods: { name: string; source: string }[];
}) {
  return {
    mode: 'structured',
    // Progresso em tempo real: a função devolve SSE com fases + resultado final.
    progressStream: true,
    messages: [{ role: 'user', content: p.userPrompt + p.foodAliasBlock }],
    studentContext: p.studentCtx,
    dietConfig: p.dietConfig,
    trainingContext: p.trainingContext,
    studentId: p.studentId,
    variationIntensity: p.variationIntensity,
    intent: p.intent,
    regenerateIntent: p.intent === 'regenerate',
    // Dieta modelo colada: o plano deve repetir os alimentos de referência,
    // então os filtros de variação/repetição não podem bloquear a geração.
    referenceDietProvided: Boolean(p.modelDiet.trim()),
    // Target determinístico do app: única autoridade de meta no servidor.
    canonicalTargets: { kcal: p.targets.kcal, p: p.targets.p, c: p.targets.c, g: p.targets.g },
    allowedUnresolvedFoods: p.allowedUnresolvedFoods,
  };
}

/** Consome o SSE do diet-agent (texto completo) e devolve o evento `result`. */
export function parseDietAgentSse(text: string): { status: number; body: string } {
  let status = 500;
  let body = '';
  for (const block of text.replace(/\r\n/g, '\n').split('\n\n')) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      // deno-lint-ignore no-explicit-any
      let evt: any;
      try { evt = JSON.parse(raw); } catch { continue; }
      if (evt.type === 'result') {
        status = Number(evt.status) || 500;
        body = typeof evt.body === 'string' ? evt.body : '';
      }
    }
  }
  return { status, body };
}

/** Targets do app vencem os da IA; schema estrito → tolerante → finalize. */
export function finalizeDietAgentPlan(
  // deno-lint-ignore no-explicit-any
  raw: any,
  targets: { kcal: number; p: number; c: number; g: number; tmb?: number; get?: number },
): { plan: DietPlan | null; errorCode?: string; issues?: unknown } {
  if (!raw) return { plan: null };
  if (raw.targets) {
    raw.targets = { ...raw.targets, ...targets };
  } else {
    raw.targets = targets;
  }
  const parsed = parseDietPlanStrict(raw);
  if (!parsed.success) {
    const loose = parseDietPlanLoose(raw);
    // deno-lint-ignore no-explicit-any
    if (!loose) return { plan: null, errorCode: 'schema_rejected', issues: (parsed as any).error?.issues?.slice(0, 5) };
    // deno-lint-ignore no-explicit-any
    return { plan: finalizeDietPlan(loose, targets as any) };
  }
  // deno-lint-ignore no-explicit-any
  return { plan: finalizeDietPlan(parsed.data, targets as any) };
}

/** Re-normaliza os ajustes diários devolvidos e monta os avisos de tolerância. */
// deno-lint-ignore no-explicit-any
export function processDietDailyAdjustments(adjRaw: any, weeklySchedule: WeeklyEnergySchedule) {
  const { adjustments, missing } = normalizeDailyAdjustments(adjRaw, weeklySchedule);
  const validation = validateDailyAdjustments(adjustments, missing);
  const warnings: string[] = [];
  for (const wd of ENERGY_WEEKDAYS) {
    const d = adjustments[wd];
    const tol = evaluateTolerance(d.requested_adjustment_kcal, d.estimated_adjustment_kcal);
    if (tol.state === 'outside_tolerance') {
      warnings.push(
        `${WEEKDAY_LABELS[wd]}: ${TOLERANCE_TEXT.outside_tolerance} — Ajuste calórico estimado (solicitado ${d.requested_adjustment_kcal >= 0 ? '+' : ''}${d.requested_adjustment_kcal} kcal, estimado ${d.estimated_adjustment_kcal >= 0 ? '+' : ''}${d.estimated_adjustment_kcal} kcal, tolerância ±${tol.tolerance_kcal} kcal, diferença ${tol.difference_kcal >= 0 ? '+' : ''}${tol.difference_kcal} kcal).`,
      );
    }
  }
  for (const err of validation.errors) warnings.push(err);
  return { adjustments, missing, validation, warnings };
}

// ─── Persistência do rascunho ───────────────────────────────────────

/** `ai_plans.protocols` exatamente como o botão Salvar da tela grava. */
export function buildDietProtocols(p: {
  selectedAdjustments: string[];
  enableFitoterapia: boolean;
  enableSuplementos: boolean;
  enableEmagrecimentoRapido: boolean;
  enableJejumIntermitente: boolean;
  weeklySchedule: WeeklyEnergySchedule;
  dailyAdjustments: DailyAdjustments | null;
  carbCycling: CarbCyclingConfig;
  weeklyCarbTargets: Partial<Record<WeekdayKey, WeeklyCarbDayTarget>>;
}) {
  // deno-lint-ignore no-explicit-any
  const scheduleJson = scheduleToJson(p.weeklySchedule) as any;
  if (p.dailyAdjustments && scheduleJson && typeof scheduleJson === 'object') {
    scheduleJson.generated_adjustments = p.dailyAdjustments;
  }
  return {
    adjustments: p.selectedAdjustments,
    extras: {
      fitoterapia: p.enableFitoterapia,
      suplementos: p.enableSuplementos,
      emagrecimento_rapido: p.enableEmagrecimentoRapido,
      jejum_intermitente: p.enableJejumIntermitente,
    },
    weekly_energy_schedule: scheduleJson,
    carb_cycling: JSON.parse(JSON.stringify({
      enabled: p.carbCycling.enabled,
      mode: p.carbCycling.mode,
      types: p.carbCycling.types,
      assignments: p.carbCycling.assignments,
      manual: p.carbCycling.manual,
      fixedClosingMacro: p.carbCycling.fixedClosingMacro,
    })),
    weekly_day_targets: p.carbCycling.enabled ? JSON.parse(JSON.stringify(p.weeklyCarbTargets)) : null,
  };
}

/** Linha nova de rascunho structured em ai_plans (structured nasce SEMPRE rascunho). */
export function buildDietDraftInsert(p: {
  studentId: string;
  markdown: string;
  // deno-lint-ignore no-explicit-any
  protocols: any;
  plan: DietPlan;
  strategy: string;
  intent: DietIntent;
  viability: { score: number; breakdown: unknown } | null;
  now?: Date;
}) {
  return {
    student_id: p.studentId,
    tipo: 'dieta',
    titulo: `Dieta - ${(p.now ?? new Date()).toLocaleDateString('pt-BR')}`,
    conteudo: p.markdown,
    protocols: p.protocols,
    is_draft: true,
    cycle_status: 'em_dia',
    conteudo_json: p.plan,
    migration_status: 'completed',
    diet_strategy: p.strategy || null,
    strategy_source: 'manual',
    generation_intent: p.intent,
    viability_score: p.viability?.score ?? null,
    viability_breakdown: p.viability?.breakdown ?? null,
  };
}
