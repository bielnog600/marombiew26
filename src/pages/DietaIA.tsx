import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, UtensilsCrossed, RotateCcw, Leaf, Pill, Zap, Clock, Target, SlidersHorizontal, FileDown, FileText, Plus, X, Copy } from 'lucide-react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { validateDietJSON } from '@/lib/planMigrationUtils';
import { markdownToDietPlan } from '@/lib/dietPlanAdapter';
import { finalizeDietPlan } from '@/lib/dietValidation';
import { parseDietPlanStrict, parseDietPlanLoose, type DietPlan } from '@/lib/dietSchema';
import { buildAllowedUnresolvedFromModelDiet, extractModelDietFoodNames, matchFoodNamesToCatalog, modelDietMentionsLinearTargets } from '@/lib/modelDietFoods';
import { buildStructuredDietPrompt } from '@/lib/structuredDietPrompt';
import {
  validateCanonicalDietTarget,
  validateCanonicalDietDayTargets,
} from '@/lib/canonicalDietValidation';
import { Badge } from '@/components/ui/badge';
import UnresolvedFoodsPanel, { collectUnresolvedItems } from '@/components/diet/UnresolvedFoodsPanel';
import { linkPlanItemsToFood } from '@/lib/dietFoodRelink';
import CanonicalDietEditor from '@/components/diet/CanonicalDietEditor';
import { dietPlanToMarkdown } from '@/lib/dietMarkdownSerializer';
import { extractTrainingContext } from '@/lib/trainingContextExtractor';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import {
  type WeeklyEnergySchedule,
  type EnergyWeekday,
  type DayWorkoutRef,
  ENERGY_WEEKDAYS,
  WEEKDAY_LABELS,
  buildDefaultSchedule,
  computeDayTarget,
  MIN_DAILY_KCAL,
  scheduleToJson,
  validateSchedule,
  type BaseKcalCalculationSnapshot,
  type BaseKcalSource,
} from '@/lib/weeklyEnergy';
import WeeklyEnergyScheduleStep from '@/components/diet/WeeklyEnergyScheduleStep';
import { GenerationProgress, useScrollToOnStart } from '@/components/GenerationProgress';
import {
  type DailyAdjustments,
  normalizeDailyAdjustments,
  validateDailyAdjustments,
  evaluateTolerance,
  TOLERANCE_TEXT,
} from '@/lib/dailyAdjustments';
import {
  DEFAULT_INTENSITY as DEFAULT_DIET_INTENSITY,
  VARIATION_OPTIONS as DIET_VARIATION_OPTIONS,
  describeSimilarity,
  type SimilarityFeedback,
  type VariationIntensity as DietVariationIntensity,
  DIET_INTENT_LABELS,
  type DietIntent,
} from '@/lib/variationProfiles';
import { computeViabilityScore, describeViability, type ViabilityBreakdown } from '@/lib/dietViability';
import { buildClosePatch, buildFailPatch, orphanCutoffISO } from '@/lib/dietActionApplier';
import { detectNewFoodsFromPlan, normalizeFoodName, type NewFoodCandidate } from '@/lib/newFoodsDetector';
import NewFoodsFromPlanCard from '@/components/diet/NewFoodsFromPlanCard';
import DietValidationBadge from '@/components/diet/DietValidationBadge';
import ReactMarkdown from 'react-markdown';
import DietResultCards from '@/components/DietResultCards';
import { generateDietPDF } from '@/lib/generateDietPDF';
import AiWizard from '@/components/AiWizard';
import DietDraftComparisonDialog from '@/components/consultoria/DietDraftComparisonDialog';
import { formatDietMacroLine, validateDietMacros, type DietMacroTargets, type DietMacroValidationReport, type FoodMacroRecord } from '@/lib/dietMacroValidation';
import { parseSections } from '@/lib/dietResultParser';
import { scaleMealsToTarget, scaleMealsToMacroTargets, replaceMealTableInMarkdown } from '@/lib/dietMarkdownSerializer';
import { selectEnergyFormula, ENERGY_FORMULA_LABEL, type EnergyFormula, type EnergyFormulaResult } from '@/lib/energyFormula';
import {
  defaultMacroConfig,
  resolveMacroConfig,
  setMacroPerKg,
  getMacroPrescription,
  type MacroConfig,
  type MacroKey,
} from '@/lib/macroConfig';
import EnergyCalculationPanel from '@/components/diet/EnergyCalculationPanel';
import MacroConfigPanel from '@/components/diet/MacroConfigPanel';
import CarbCyclingPanel from '@/components/diet/CarbCyclingPanel';
import {
  defaultCarbCyclingConfig,
  buildCarbDayTypeTargets,
  buildWeeklyCarbTargets,
  carbDayTargetSanityIssues,
  calculateWeeklyAverage,
  compareWeeklyAverageToBase,
  suggestCarbDayTypeForWorkout,
  isCarbCyclingValid,
  type CarbCyclingConfig,
  type CarbDayType,
} from '@/lib/carbCycling';
import { WEEKDAY_KEYS, resolveDayTarget, type WeekdayKey } from '@/lib/dietDayTargets';
import {
  validateDietDaysMacros,
  formatDayTargetLine,
  type DietDaysMacroValidationReport,
} from '@/lib/dietDayValidation';
import type { ParsedMeal } from '@/lib/dietResultParser';
import { Percent } from 'lucide-react';
import { isStructuredCanonicalPlan } from '@/lib/dietStructuredGuards';
import { publishDietPlan } from '@/lib/publishDietPlan';
import {
  ACTIVITY_LEVELS, STRATEGIES, MEAL_COUNTS, DIET_STYLES, PHASES, TRAINING_TIMES, TRAINING_DAYS_OPTIONS,
  RESTRICTION_OPTIONS, PREFERENCE_OPTIONS, PROTOCOL_ADJUSTMENTS as BASE_PROTOCOL_ADJUSTMENTS,
  parsePositiveNumber, calculateAge, parseWeekdayWorkouts,
  computeEnergySelection, computeAutomaticBaseKcal, parseManualBaseKcal, resolveBaseKcal, computeBaseKcalIssues,
  computeMacroBody, applyMacroPreset, computeCanonicalTargets, computeWeeklySchedule, suggestCarbAssignments,
  dietRestrictionsText, dietPreferencesText, buildDietGenerationPrompts, buildDietTrainingContext,
  loadDietFoodRecords, buildDietFoodHints, buildDietAgentBody, finalizeDietAgentPlan, processDietDailyAdjustments,
  buildDietProtocols,
  type StudentCtx, type BaseKcalMode, type BaseKcalState, type DietaWizardState,
} from '@/lib/officeWizard/dietaWizard';
import { loadDietaStudentData, loadActiveTrainingMarkdown } from '@/lib/officeWizard/dietaStudentData';

/**
 * FASE 6 — publicação structured SEMPRE pela Edge Function (atômica,
 * com snapshot nutricional e markdown gerados no servidor).
 */
const publishStructuredPlanViaEdge = async (planId: string): Promise<boolean> => {
  const result = await publishDietPlan(planId);
  if (!result.ok) {
    toast.error(result.message ?? 'Não foi possível publicar esta dieta.');
    return false;
  }
  toast.success('Dieta publicada.');
  return true;
};

export { ACTIVITY_LEVELS };

const PROTOCOL_ADJUSTMENT_ICONS: Record<string, typeof SlidersHorizontal> = {
  plato: Target, refeed: Zap, diet_break: Clock,
};
const PROTOCOL_ADJUSTMENTS = BASE_PROTOCOL_ADJUSTMENTS.map((a) => ({ ...a, icon: PROTOCOL_ADJUSTMENT_ICONS[a.id] ?? SlidersHorizontal }));

// Grouping of protocol adjustments by the new wizard step that owns them.
// IDs are unchanged — only the visual placement changes, so the prompt, the
// decision engine and the dietActionApplier keep working with the same keys.
const STRATEGY_ADJUSTMENT_IDS = ['refeed', 'diet_break', 'carb_cycling', 'plato'] as const;
const STRUCTURE_ADJUSTMENT_IDS = ['meal_change'] as const;
const FINE_TUNE_ADJUSTMENT_IDS = ['calorie_adjust', 'carb_adjust', 'sodium_adjust', 'water_adjust'] as const;
const STRATEGY_ADJUSTMENTS = PROTOCOL_ADJUSTMENTS.filter(a => (STRATEGY_ADJUSTMENT_IDS as readonly string[]).includes(a.id));
const STRUCTURE_ADJUSTMENTS = PROTOCOL_ADJUSTMENTS.filter(a => (STRUCTURE_ADJUSTMENT_IDS as readonly string[]).includes(a.id));
const FINE_TUNE_ADJUSTMENTS = PROTOCOL_ADJUSTMENTS.filter(a => (FINE_TUNE_ADJUSTMENT_IDS as readonly string[]).includes(a.id));

// ─── Exibição legível de erros do diet-agent (422 review_required etc.) ───
// Apenas formatação/tradução: nenhuma lógica de geração ou validação muda aqui.
const DIET_AGENT_CODE_TEXT: Record<string, string> = {
  nutrition_invalid: 'proteína/estrutura das refeições insuficiente',
  day_targets_invalid: 'totais de algum dia fora da meta diária',
  daily_adjustments_invalid: 'ajustes por dia não devolvidos corretamente',
  food_targets_invalid: 'macros fora da tolerância',
  food_contract_invalid: 'alimento fora do catálogo',
  high_similarity: 'muito parecido com a dieta anterior',
  portion_only: 'muito parecido com a dieta anterior',
  source_repetition: 'muito parecido com a dieta anterior',
  review_required: 'o plano precisa de revisão antes de ser aceito',
  canonical_targets_missing: 'as metas nutricionais não foram enviadas corretamente',
  schema_rejected: 'a resposta da IA não seguiu o formato esperado',
};

const WEEKDAY_PT: Record<string, string> = {
  SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta',
  SEX: 'Sexta', SAB: 'Sábado', DOM: 'Domingo',
};

/** Converte motivos/issues estruturados (string, array ou objeto) em linhas legíveis. */
const toReadableDietErrorLine = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') { const s = value.trim(); return s || null; }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(toReadableDietErrorLine).filter(Boolean) as string[];
    return parts.length ? parts.join(' · ') : null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const weekdayKey = obj.weekday ?? obj.dia ?? obj.day;
    const weekday = weekdayKey != null
      ? (WEEKDAY_PT[String(weekdayKey).toUpperCase()] ?? String(weekdayKey))
      : null;
    const message = [obj.message, obj.issue, obj.reason, obj.error]
      .filter((v) => typeof v === 'string' && v.trim())
      .map(String);
    const extra = Object.entries(obj)
      .filter(([k, v]) => !['weekday', 'dia', 'day', 'message', 'issue', 'reason', 'error'].includes(k)
        && v != null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
      .map(([k, v]) => `${k}: ${String(v)}`);
    const rest = [...message, ...extra].join(' · ');
    const line = weekday ? (rest ? `${weekday}: ${rest}` : weekday) : rest;
    return line.trim() || null;
  }
  return null;
};

export interface DietAgentErrorDetail {
  code?: string;
  message?: string;
  details?: string;
  validationReasons?: unknown;
  missingDays?: unknown;
  dayTargetIssues?: unknown;
}

/** Linhas legíveis (em PT-BR) para o card de erro, na ordem de relevância. */
export const formatDietAgentError = (detail: DietAgentErrorDetail): string[] => {
  const lines: string[] = [];
  const codeText = detail.code ? DIET_AGENT_CODE_TEXT[detail.code] : undefined;
  const head = codeText
    ? `${codeText} (${detail.code})`
    : detail.message || 'O plano precisa de revisão antes de ser aceito.';
  lines.push(head);
  const rawDetails = toReadableDietErrorLine(detail.details);
  if (rawDetails) lines.push(rawDetails);
  const reasons = toReadableDietErrorLine(detail.validationReasons);
  if (reasons && reasons !== rawDetails) lines.push(`Motivos da validação: ${reasons}`);
  const dayIssues = toReadableDietErrorLine(detail.dayTargetIssues);
  if (dayIssues) lines.push(`Dias fora da meta: ${dayIssues}`);
  const missing = toReadableDietErrorLine(detail.missingDays);
  if (missing) lines.push(`Dias sem ajuste devolvido: ${missing}`);
  return lines;
};

/** Mensagem amigável para falha de rede/timeout/stream interrompido. */
export const describeNetworkError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/abort|timeout|timed out/i.test(msg)) return 'A geração demorou demais e a conexão foi interrompida. Tente gerar novamente.';
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) return 'Não foi possível conectar à IA. Verifique a internet e tente novamente.';
  return msg || 'A conexão com a IA foi interrompida antes da resposta.';
};

const DietaIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPlanId = searchParams.get('edit');
  const applicationId = searchParams.get('application');
  const checkinIdParam = searchParams.get('checkin');

  const [studentCtx, setStudentCtx] = useState<StudentCtx | null>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [loading, setLoading] = useState(true);

  // Step 1 - Rotina
  const [dailyRoutine, setDailyRoutine] = useState('');
  const [trainingTime, setTrainingTime] = useState('');
  const [trainingDays, setTrainingDays] = useState('');

  // Step 2 - Estilo, Fase & Hormônios
  const [dietStyle, setDietStyle] = useState('');
  const [phase, setPhase] = useState('');
  const [usesHormones, setUsesHormones] = useState<boolean | null>(null);
  const [hormoneDetails, setHormoneDetails] = useState('');

  // Step 3 - Atividade & Estratégia
  const [activityLevel, setActivityLevel] = useState('');
  // Marca se o admin já interagiu com o campo. Após true, nenhum efeito pode
  // sobrescrever a escolha manual.
  const [activityLevelTouched, setActivityLevelTouched] = useState(false);
  const [strategy, setStrategy] = useState('');

  // Step 4 - Refeições & Preferências
  const [mealCount, setMealCount] = useState('');
  const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>([]);
  const [customRestriction, setCustomRestriction] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [customPreference, setCustomPreference] = useState('');

  // Step 5 - Ajustes do Protocolo
  const [selectedAdjustments, setSelectedAdjustments] = useState<string[]>([]);

  // Step 6 - Extras
  const [enableFitoterapia, setEnableFitoterapia] = useState(false);
  const [enableSuplementos, setEnableSuplementos] = useState(false);
  const [enableEmagrecimentoRapido, setEnableEmagrecimentoRapido] = useState(false);
  // New: jejum intermitente has its own toggle in "Estrutura Alimentar do Dia".
  // The composite "Emagrecimento Rápido" toggle was split: jejum lives in the
  // structure step; HIIT + termogênicos stays in Extras (rotulado "HIIT + Termogênicos").
  const [enableJejumIntermitente, setEnableJejumIntermitente] = useState(false);

  // Substitutions
  const [substitutions, setSubstitutions] = useState<{ food: string; portion: string }[]>([]);
  const [newSubFood, setNewSubFood] = useState('');
  const [newSubPortion, setNewSubPortion] = useState('');

  // Model diet
  const [modelDiet, setModelDiet] = useState('');

  // Wizard
  const [currentStep, setCurrentStep] = useState(0);

  // Result
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{ label: string; detail?: string; ratio: number } | null>(null);
  const [genOutcome, setGenOutcome] = useState<{ status: 'success' | 'error'; message?: string } | null>(null);
  const [genErrorDetail, setGenErrorDetail] = useState<DietAgentErrorDetail | null>(null);
  const genPanelRef = useScrollToOnStart(generating);
  // Mantém o sucesso brevemente e depois revela o resultado.
  useEffect(() => {
    if (genOutcome?.status !== 'success') return;
    const id = setTimeout(() => setGenOutcome(null), 3000);
    return () => clearTimeout(id);
  }, [genOutcome]);

  const [result, setResult] = useState('');
  const [macroReport, setMacroReport] = useState<DietMacroValidationReport | null>(null);
  /** Fase 3: com carb cycling ativo, cada dia é validado contra a SUA meta. */
  const [dayMacroReport, setDayMacroReport] = useState<DietDaysMacroValidationReport | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  // Fase 2 (QA): salvar como rascunho por padrão. UI expõe botões separados.
  const [saveMode, setSaveMode] = useState<'draft' | 'publish'>('draft');
  const [adjusting, setAdjusting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  /** Só é ativada no início de uma geração de dieta (nunca em edições). */
  const scrollToResultAfterGenerationRef = useRef(false);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [macroPct, setMacroPct] = useState({ protein: 20, carbs: 50, fat: 30 });
  const [lastDietPlan, setLastDietPlan] = useState<any>(null);
  const [showCompare, setShowCompare] = useState(false);
  // Canonical structured plan (source of truth when structured generation succeeds).
  const [structuredPlan, setStructuredPlan] = useState<DietPlan | null>(null);
  // Enquanto houver alimento sem vínculo com a base, a dieta NÃO é validada.
  const hasUnresolvedItems = useMemo(
    () => (structuredPlan ? collectUnresolvedItems(structuredPlan).length > 0 : false),
    [structuredPlan],
  );
  // Novos alimentos encontrados no plano que não estão na base — aguardam aprovação.
  const [pendingNewFoods, setPendingNewFoods] = useState<NewFoodCandidate[]>([]);
  // Variability controls + feedback (mirrors TreinoIA).
  const [variationIntensity, setVariationIntensity] = useState<DietVariationIntensity>(DEFAULT_DIET_INTENSITY);
  const [dietSimilarity, setDietSimilarity] = useState<SimilarityFeedback | null>(null);
  // Generation intent (new | update | regenerate). "new" is the default fresh path.
  const [lastIntent, setLastIntent] = useState<DietIntent>('new');
  // Viability score computed after structured generation.
  const [viability, setViability] = useState<{ score: number; breakdown: ViabilityBreakdown; notes: string[] } | null>(null);
  // Fase 2: estado canônico da configuração de macros + fórmula energética.
  const [manualFormula, setManualFormula] = useState<EnergyFormula | null>(null);
  const [macroConfig, setMacroConfig] = useState<MacroConfig>(() => defaultMacroConfig());
  const [macroConfigTouched, setMacroConfigTouched] = useState(false);
  const [closingMacro, setClosingMacro] = useState<MacroKey | null>(null);
  // Fase 3: carb cycling determinístico (camada sobre a configuração canônica).
  const [carbCycling, setCarbCycling] = useState<CarbCyclingConfig>(() => defaultCarbCyclingConfig());
  // Phase 2: enable structured carb cycling alongside the protocol checkbox.

  // ─── Weekly Energy Schedule (MVP) ────────────────────────────
  // Per-weekday user overrides. Kept minimal: signed adjustment or a fixed
  // target. Combined with the base kcal (derived below) into the full
  // schedule that is persisted at protocols.weekly_energy_schedule.
  const [scheduleAdjustments, setScheduleAdjustments] = useState<
    Record<EnergyWeekday, { adjustment_kcal: number; fixed_kcal: number | null }>
  >(() => ({
    seg: { adjustment_kcal: 0, fixed_kcal: null },
    ter: { adjustment_kcal: 0, fixed_kcal: null },
    qua: { adjustment_kcal: 0, fixed_kcal: null },
    qui: { adjustment_kcal: 0, fixed_kcal: null },
    sex: { adjustment_kcal: 0, fixed_kcal: null },
    sab: { adjustment_kcal: 0, fixed_kcal: null },
    dom: { adjustment_kcal: 0, fixed_kcal: null },
  }));
  const [workoutByWeekday, setWorkoutByWeekday] = useState<Partial<Record<EnergyWeekday, DayWorkoutRef>>>({});
  const [noActiveWorkout, setNoActiveWorkout] = useState(true);
  const [baseKcalMode, setBaseKcalMode] = useState<BaseKcalMode>('automatic');
  const [manualBaseKcalInput, setManualBaseKcalInput] = useState('');
  // Per-day adjustments returned by the AI (optional, complementary to days[]).
  // Persisted at protocols.weekly_energy_schedule.generated_adjustments.
  const [dailyAdjustments, setDailyAdjustments] = useState<DailyAdjustments | null>(null);
  // Post-generation warnings for per-day targets outside tolerance (±10% ou ±50 kcal máx).
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);

  // ── Fase 2: seleção determinística da fórmula energética ────────────
  const energySelection = useMemo<EnergyFormulaResult | null>(
    () => computeEnergySelection(studentCtx, manualFormula),
    [studentCtx?.peso, studentCtx?.altura, studentCtx?.data_nascimento, studentCtx?.sexo, studentCtx?.percentual_gordura, studentCtx?.massa_magra, studentCtx?.massa_magra_data, studentCtx?.massa_magra_origem, manualFormula],
  );

  const automaticBaseKcal = useMemo<BaseKcalState>(
    () => computeAutomaticBaseKcal(studentCtx, activityLevel, strategy, phase, energySelection),
    [studentCtx?.peso, studentCtx?.altura, studentCtx?.data_nascimento, studentCtx?.sexo, studentCtx?.percentual_gordura, studentCtx?.massa_magra, activityLevel, phase, strategy, energySelection],
  );

  const manualBaseKcal = useMemo<number | null>(() => parseManualBaseKcal(manualBaseKcalInput), [manualBaseKcalInput]);

  const baseKcal = useMemo<BaseKcalState>(
    () => resolveBaseKcal(baseKcalMode, manualBaseKcal, automaticBaseKcal),
    [automaticBaseKcal, baseKcalMode, manualBaseKcal],
  );

  const baseKcalIssues = useMemo<string[]>(
    () => computeBaseKcalIssues(baseKcal, baseKcalMode, automaticBaseKcal),
    [automaticBaseKcal.missing, baseKcal, baseKcalMode],
  );

  // ── Fase 2: estado canônico dos macros ──────────────────────────────
  const macroBody = useMemo(() => computeMacroBody(studentCtx), [studentCtx?.peso, studentCtx?.massa_magra]);

  /** Respostas do wizard no formato compartilhado com o escritório (office-gerar). */
  const wizardState: DietaWizardState = {
    dailyRoutine, trainingTime, trainingDays, dietStyle, phase, usesHormones, hormoneDetails,
    activityLevel, strategy, mealCount, selectedRestrictions, customRestriction, selectedPreferences,
    customPreference, selectedAdjustments, enableFitoterapia, enableSuplementos, enableEmagrecimentoRapido,
    enableJejumIntermitente, substitutions, modelDiet, variationIntensity, baseKcalMode, manualBaseKcalInput,
    manualFormula, proteinPerKgOverride: null, fatPerKgOverride: null, scheduleAdjustments,
  };

  // Preset inicial coerente com fase/estratégia — nunca sobrescreve edição manual.
  useEffect(() => {
    if (macroConfigTouched || !macroBody.weightKg) return;
    setMacroConfig((prev) => applyMacroPreset(prev, {
      baseKcal: baseKcal.base_daily_kcal,
      body: macroBody,
      strategy,
      phase,
    }));
  }, [macroConfigTouched, macroBody, strategy, phase, baseKcal.base_daily_kcal]);

  const macroResolution = useMemo(() => resolveMacroConfig({
    kcalTarget: baseKcal.base_daily_kcal ?? 0,
    config: macroConfig,
    body: macroBody,
    closingMacro,
  }), [baseKcal.base_daily_kcal, macroConfig, macroBody, closingMacro]);

  /** Única autoridade dos alvos usados na geração da dieta. */
  const canonicalTargets = useMemo(
    () => computeCanonicalTargets(baseKcal, macroResolution),
    [baseKcal.base_daily_kcal, macroResolution],
  );

  // ── Fase 3: metas por tipo de dia e por dia da semana ──────────────
  const carbTypeTargets = useMemo(() => buildCarbDayTypeTargets({
    mode: carbCycling.mode,
    carbCycling,
    macroConfig,
    body: macroBody,
    baseKcal: baseKcal.base_daily_kcal ?? 0,
    closingMacro,
    // P e G vêm da resolução canônica da Fase 2 (não das travas cruas).
    baseResolvedMacros: macroResolution.grams
      ? { p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g }
      : null,
  }), [carbCycling, macroConfig, macroBody, baseKcal.base_daily_kcal, closingMacro, macroResolution, canonicalTargets]);

  const weeklyCarbTargets = useMemo(
    () => (carbCycling.enabled ? buildWeeklyCarbTargets(carbCycling, carbTypeTargets) : {}),
    [carbCycling, carbTypeTargets],
  );

  /**
   * Fase 5: target FINAL por dia materializado do plano canônico.
   * Linear → meta global; carb cycling → meta do weekday. O optimizer nunca
   * recalcula meta: apenas consome o valor já resolvido pelas Fases 2–3.
   */
  const structuredTargetsByDay = useMemo(() => {
    const days = structuredPlan?.days ?? [];
    return days.map((d) => {
      if (carbCycling.enabled) {
        const wd = String(d?.weekday ?? '') as WeekdayKey;
        const t = weeklyCarbTargets[wd];
        return t ? { kcal: t.kcal, p: t.p, c: t.c, g: t.g } : null;
      }
      return canonicalTargets.kcal > 0
        ? { kcal: canonicalTargets.kcal, p: canonicalTargets.p, c: canonicalTargets.c, g: canonicalTargets.g }
        : null;
    });
  }, [structuredPlan, carbCycling.enabled, weeklyCarbTargets, canonicalTargets]);



  const carbWeeklyAverage = useMemo(
    () => calculateWeeklyAverage(weeklyCarbTargets),
    [weeklyCarbTargets],
  );

  const carbBaseComparison = useMemo(
    () => compareWeeklyAverageToBase(carbWeeklyAverage, baseKcal.base_daily_kcal ?? null),
    [carbWeeklyAverage, baseKcal.base_daily_kcal],
  );

  const carbDayInfo = useMemo(() => {
    const out: Record<string, { workoutLabel: string | null; suggestion: CarbDayType }> = {};
    for (const wd of WEEKDAY_KEYS) {
      const workout = workoutByWeekday[wd as EnergyWeekday] ?? null;
      out[wd] = {
        workoutLabel: workout?.label ?? null,
        suggestion: suggestCarbDayTypeForWorkout(workout),
      };
    }
    return out;
  }, [workoutByWeekday]);

  // Sugestão inicial pelo treino — nunca sobrescreve escolha manual do treinador.
  useEffect(() => {
    setCarbCycling((prev) => suggestCarbAssignments(prev, workoutByWeekday));
  }, [workoutByWeekday]);

  const handleMacroConfigChange = useCallback((next: MacroConfig) => {
    setMacroConfigTouched(true);
    setMacroConfig(next);
  }, []);

  const weeklySchedule = useMemo<WeeklyEnergySchedule | null>(
    () => computeWeeklySchedule(baseKcal, baseKcalIssues.length, workoutByWeekday, scheduleAdjustments),
    [baseKcal, baseKcalIssues.length, workoutByWeekday, scheduleAdjustments],
  );

  const handleScheduleChange = (next: WeeklyEnergySchedule) => {
    const nextAdj: typeof scheduleAdjustments = {
      seg: { adjustment_kcal: 0, fixed_kcal: null },
      ter: { adjustment_kcal: 0, fixed_kcal: null },
      qua: { adjustment_kcal: 0, fixed_kcal: null },
      qui: { adjustment_kcal: 0, fixed_kcal: null },
      sex: { adjustment_kcal: 0, fixed_kcal: null },
      sab: { adjustment_kcal: 0, fixed_kcal: null },
      dom: { adjustment_kcal: 0, fixed_kcal: null },
    };
    for (const wd of ENERGY_WEEKDAYS) {
      nextAdj[wd] = {
        adjustment_kcal: next.days[wd].adjustment_kcal,
        fixed_kcal: next.days[wd].fixed_kcal,
      };
    }
    setScheduleAdjustments(nextAdj);
  };

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (editPlanId && studentId) loadEditPlan();
  }, [editPlanId]);

  // ─── Load active workout for weekly energy schedule ─────────
  // We map each parsed training day to its weekday key + a friendly label
  // and a heuristic muscle-group list. Only the ACTIVE, published plan
  // (tipo='treino', is_draft=false, most recent) is considered.
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('ai_plans')
          .select('conteudo')
          .eq('student_id', studentId)
          .eq('tipo', 'treino')
          .eq('is_draft', false)
          .order('created_at', { ascending: false })
          .limit(1);
        const md = (data?.[0]?.conteudo as string | undefined) ?? '';
        if (!md) {
          if (!cancelled) {
            setWorkoutByWeekday({});
            setNoActiveWorkout(true);
          }
          return;
        }
        const map = parseWeekdayWorkouts(md);
        if (!cancelled) {
          setWorkoutByWeekday(map);
          setNoActiveWorkout(Object.keys(map).length === 0);
        }
      } catch (e) {
        console.warn('active workout load failed', e);
        if (!cancelled) {
          setWorkoutByWeekday({});
          setNoActiveWorkout(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  // ===== Fase 5: lifecycle of diet_decision_applications =====
  useEffect(() => {
    if (!studentId) return;
    // Opportunistic orphan dismissal: pending_generation older than the threshold
    // for this student are auto-marked as dismissed so the history never lies.
    (async () => {
      try {
        const cutoff = orphanCutoffISO();
        await (supabase as any)
          .from('diet_decision_applications')
          .update({
            status: 'dismissed',
            failure_reason: 'orphan_pending_timeout',
            completed_at: new Date().toISOString(),
          })
          .eq('student_id', studentId)
          .eq('status', 'pending_generation')
          .lt('applied_at', cutoff);
      } catch (e) {
        console.warn('orphan dismissal skipped:', e);
      }
    })();
  }, [studentId]);

  const closeDietApplication = async (appId: string | null, planId: string | null) => {
    if (!appId || !planId) return;
    try {
      const patch = buildClosePatch({ applicationId: appId, resultPlanId: planId });
      await (supabase as any)
        .from('diet_decision_applications')
        .update(patch)
        .eq('id', appId)
        .eq('status', 'pending_generation'); // only close if still pending
    } catch (e) {
      console.warn('closeDietApplication failed:', e);
    }
  };

  const failDietApplication = async (appId: string | null, reason: string) => {
    if (!appId) return;
    try {
      const patch = buildFailPatch({ applicationId: appId, reason });
      await (supabase as any)
        .from('diet_decision_applications')
        .update(patch)
        .eq('id', appId)
        .eq('status', 'pending_generation');
    } catch (e) {
      console.warn('failDietApplication failed:', e);
    }
  };

  const loadEditPlan = async () => {
    const { data } = await supabase.from('ai_plans').select('*').eq('id', editPlanId!).maybeSingle();
    if (data) {
      setResult(data.conteudo);
      const p = (data as any).protocols;
      if (p && typeof p === 'object') {
        if (Array.isArray(p.adjustments)) setSelectedAdjustments(p.adjustments);
        if (p.extras) {
          setEnableFitoterapia(!!p.extras.fitoterapia);
          setEnableSuplementos(!!p.extras.suplementos);
          setEnableEmagrecimentoRapido(!!p.extras.emagrecimento_rapido);
          setEnableJejumIntermitente(!!p.extras.jejum_intermitente);
        }
        // Restore Weekly Energy Schedule (per-day adjustments) and base kcal.
        const wes = p.weekly_energy_schedule;
        if (wes && typeof wes === 'object') {
          if (wes.base_source === 'manual' && typeof wes.base_daily_kcal === 'number') {
            setBaseKcalMode('manual');
            setManualBaseKcalInput(String(wes.base_daily_kcal));
          }
          if (wes.days && typeof wes.days === 'object') {
            const nextAdj = {
              seg: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              ter: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              qua: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              qui: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              sex: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              sab: { adjustment_kcal: 0, fixed_kcal: null as number | null },
              dom: { adjustment_kcal: 0, fixed_kcal: null as number | null },
            };
            for (const wd of Object.keys(nextAdj) as (keyof typeof nextAdj)[]) {
              const d = (wes.days as any)[wd];
              if (d && typeof d === 'object') {
                nextAdj[wd] = {
                  adjustment_kcal: Number(d.adjustment_kcal) || 0,
                  fixed_kcal: d.fixed_kcal == null ? null : Number(d.fixed_kcal),
                };
              }
            }
            setScheduleAdjustments(nextAdj);
          }
        }
        // Fase 3: restaurar integralmente a configuração de carb cycling.
        const cc = p.carb_cycling;
        if (cc && typeof cc === 'object') {
          setCarbCycling((prev) => ({
            ...prev,
            enabled: !!cc.enabled,
            mode: cc.mode === 'fixed_calories' ? 'fixed_calories' : 'variable_calories',
            types: { ...prev.types, ...(cc.types ?? {}) },
            assignments: { ...prev.assignments, ...(cc.assignments ?? {}) },
            manual: { ...prev.manual, ...(cc.manual ?? {}) },
            // Carboidrato nunca pode fechar as calorias no modo fixo.
            fixedClosingMacro:
              cc.fixedClosingMacro === 'protein' || cc.fixedClosingMacro === 'fat'
                ? cc.fixedClosingMacro
                : null,
          }));
        }
        if (wes && typeof wes === 'object') {
          if (wes.generated_adjustments && typeof wes.generated_adjustments === 'object') {
            setDailyAdjustments(wes.generated_adjustments as DailyAdjustments);
          }
        }
      }
    }
  };

  /**
   * HOTFIX UX — o scroll automático acontece SOMENTE quando uma nova dieta
   * acabou de ser gerada. Edições (quantidade, substituição, remoção, resolver
   * alimento, autoajuste, desfazer, copiar dia, salvar) nunca movem a tela.
   */
  useEffect(() => {
    if (!scrollToResultAfterGenerationRef.current) return;
    if (!result || !resultRef.current) return;
    scrollToResultAfterGenerationRef.current = false;
    resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const loadStudentData = async () => {
    setLoading(true);
    // Leitura compartilhada com o escritório (office-gerar): mesmo contexto e pré-preenchimento.
    const { ctx, studentName: name, lastDiet, prefill } = await loadDietaStudentData(supabase, studentId!);
    setLastDietPlan(lastDiet);
    setStudentCtx(ctx);
    setStudentName(name);
    if (prefill.mealCount !== undefined) setMealCount(prefill.mealCount);
    if (prefill.trainingTime !== undefined) setTrainingTime(prefill.trainingTime);
    if (prefill.trainingDays !== undefined) setTrainingDays(prefill.trainingDays);
    if (prefill.customRestriction !== undefined) setCustomRestriction(prefill.customRestriction);
    if (prefill.customPreference !== undefined) setCustomPreference(prefill.customPreference);
    if (prefill.usesHormones !== undefined) setUsesHormones(prefill.usesHormones);
    if (prefill.hormoneDetails !== undefined) setHormoneDetails(prefill.hormoneDetails);
    if (prefill.strategy !== undefined && !strategy) setStrategy(prefill.strategy);
    if (prefill.phase !== undefined && !phase) setPhase(prefill.phase);
    if (prefill.dietStyle !== undefined && !dietStyle) setDietStyle(prefill.dietStyle);
    setLoading(false);
  };

  const toggleAdjustment = (id: string) => {
    setSelectedAdjustments(prev => {
      const next = prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id];
      // O ajuste antigo "Carb Cycling" virou apenas um atalho para a Fase 3:
      // existe uma única implementação e um único interruptor.
      if (id === 'carb_cycling') {
        const enabled = next.includes('carb_cycling');
        setCarbCycling(prevCycle => (prevCycle.enabled === enabled ? prevCycle : { ...prevCycle, enabled }));
      }
      return next;
    });
  };

  const toggleRestriction = (r: string) => {
    setSelectedRestrictions(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  const togglePreference = (p: string) => {
    setSelectedPreferences(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const getRestrictionsText = () => dietRestrictionsText({ selectedRestrictions, customRestriction });

  const getPreferencesText = () => dietPreferencesText({ selectedPreferences, customPreference });

  const buildContextSummary = () => {
    const lines: string[] = [];
    const sel = <T extends { value: string; label: string }>(arr: T[], v: string) => arr.find(x => x.value === v);
    const selPhase = sel(PHASES, phase);
    const selStrategy = sel(STRATEGIES, strategy);
    const selStyle = sel(DIET_STYLES, dietStyle);
    const selActivity = sel(ACTIVITY_LEVELS, activityLevel);
    const selTime = sel(TRAINING_TIMES, trainingTime);

    lines.push('=== CONTEXTO DO ALUNO ===');
    lines.push(`Nome: ${studentCtx?.nome || studentName || 'N/D'}`);
    if (studentCtx?.sexo) lines.push(`Sexo: ${studentCtx.sexo}`);
    if (studentCtx?.data_nascimento) lines.push(`Nascimento: ${studentCtx.data_nascimento}`);
    if (studentCtx?.objetivo) lines.push(`Objetivo: ${studentCtx.objetivo}`);
    if (studentCtx?.peso) lines.push(`Peso: ${studentCtx.peso} kg`);
    if (studentCtx?.altura) lines.push(`Altura: ${studentCtx.altura} cm`);
    if (studentCtx?.imc) lines.push(`IMC: ${studentCtx.imc}`);
    if (studentCtx?.percentual_gordura) lines.push(`% Gordura: ${studentCtx.percentual_gordura}%`);
    if (studentCtx?.massa_magra) lines.push(`Massa magra: ${studentCtx.massa_magra} kg`);
    if (studentCtx?.massa_gorda) lines.push(`Massa gorda: ${studentCtx.massa_gorda} kg`);
    if (studentCtx?.cintura) lines.push(`Cintura: ${studentCtx.cintura} cm`);
    if (studentCtx?.quadril) lines.push(`Quadril: ${studentCtx.quadril} cm`);
    if (studentCtx?.rcq) lines.push(`RCQ: ${studentCtx.rcq}`);
    if (studentCtx?.restricoes) lines.push(`Restrições (perfil): ${studentCtx.restricoes}`);
    if (studentCtx?.lesoes) lines.push(`Lesões: ${studentCtx.lesoes}`);
    if (studentCtx?.observacoes) lines.push(`Observações do perfil: ${studentCtx.observacoes}`);

    if (studentCtx?.anamnese) {
      lines.push('');
      lines.push('--- Anamnese ---');
      for (const [k, v] of Object.entries(studentCtx.anamnese)) {
        if (v) lines.push(`${k}: ${v}`);
      }
    }

    if (studentCtx?.questionario_dieta) {
      const q = studentCtx.questionario_dieta;
      lines.push('');
      lines.push('--- Questionário de dieta (respostas do aluno) ---');
      if (q.respondido_em) lines.push(`Respondido em: ${new Date(q.respondido_em).toLocaleDateString('pt-BR')}`);
      if (q.estilo_dieta) lines.push(`Estilo preferido: ${q.estilo_dieta}`);
      if (q.fase_atual) lines.push(`Fase atual: ${q.fase_atual}`);
      if (q.num_refeicoes) lines.push(`Nº refeições: ${q.num_refeicoes}`);
      if (q.dias_treino) lines.push(`Dias de treino: ${q.dias_treino}`);
      if (q.horario_treino) lines.push(`Horário treino: ${q.horario_treino}`);
      if (q.usa_hormonios) lines.push(`Uso de hormônios: ${q.usa_hormonios}`);
      if (q.restricoes_alimentares) lines.push(`Restrições/alergias: ${q.restricoes_alimentares}`);
      if (q.preferencias_alimentares) lines.push(`Preferências alimentares: ${q.preferencias_alimentares}`);
      if (q.alimentos_por_refeicao) {
        lines.push('Alimentos selecionados por refeição:');
        const apr = q.alimentos_por_refeicao;
        if (typeof apr === 'string') {
          lines.push(`  ${apr}`);
        } else if (apr && typeof apr === 'object') {
          for (const [meal, foods] of Object.entries(apr)) {
            const list = Array.isArray(foods) ? foods.join(', ') : String(foods);
            lines.push(`  ${meal}: ${list}`);
          }
        }
      }
      if (q.como_se_sente) lines.push(`Como se sente: ${q.como_se_sente}`);
      const sintomas = [
        q.fraqueza && 'Fraqueza',
        q.dor_cabeca && 'Dor de cabeça',
        q.reduziu_peso && 'Reduziu peso',
        q.pele_fina && 'Pele fina',
        q.fome_excessiva && 'Fome excessiva',
        q.insonia && 'Insônia',
        q.baixa_energia && 'Baixa energia',
        q.irritabilidade && 'Irritabilidade',
      ].filter(Boolean);
      if (sintomas.length) lines.push(`Sintomas: ${sintomas.join(', ')}`);
      if (q.observacoes) lines.push(`Observações do aluno: ${q.observacoes}`);
    }

    lines.push('');
    lines.push('=== ETAPAS SELECIONADAS NO GERADOR ===');
    lines.push('');
    lines.push('1) Rotina e treino:');
    if (selTime) lines.push(`   Horário do treino: ${selTime.label}`);
    if (trainingDays) lines.push(`   Frequência: ${trainingDays}x/semana`);

    lines.push('');
    lines.push('2) Estilo, fase e hormônios:');
    if (selStyle) lines.push(`   Estilo de dieta: ${selStyle.label}${selStyle.desc ? ` — ${selStyle.desc}` : ''}`);
    if (selPhase) lines.push(`   Fase: ${selPhase.label}${selPhase.desc ? ` — ${selPhase.desc}` : ''}`);
    lines.push(`   Uso de hormônios: ${usesHormones === null ? 'Não informado' : usesHormones ? `Sim — ${hormoneDetails || 'sem detalhes'}` : 'Não (natural)'}`);

    lines.push('');
    lines.push('3) Atividade e estratégia:');
    if (selActivity) lines.push(`   Nível de atividade: ${selActivity.label} (FA = ${activityLevel})`);
    if (selStrategy) lines.push(`   Estratégia calórica: ${selStrategy.label} (${(selStrategy.pct ?? 0) > 0 ? '+' : ''}${selStrategy.pct}%)`);

    lines.push('');
    lines.push('4) Refeições e preferências:');
    if (mealCount) lines.push(`   Nº de refeições: ${mealCount}`);
    const restr = getRestrictionsText();
    if (restr) lines.push(`   Restrições/alergias: ${restr}`);
    const prefs = getPreferencesText();
    if (prefs) lines.push(`   Preferências: ${prefs}`);

    lines.push('');
    lines.push('5) Calorias por dia (cronograma semanal):');
    if (baseKcal?.base_daily_kcal) {
      lines.push(`   Meta base diária: ${baseKcal.base_daily_kcal} kcal (origem: ${baseKcal.source})`);
    }
    if (weeklySchedule) {
      for (const wd of ENERGY_WEEKDAYS) {
        const day = weeklySchedule.days[wd];
        if (!day) continue;
        const adj = day.adjustment_kcal ?? 0;
        const adjStr = adj === 0 ? 'Manter plano base' : `${adj > 0 ? '+' : ''}${adj} kcal`;
        lines.push(`   ${WEEKDAY_LABELS[wd]}: ${computeDayTarget(day)} kcal (${adjStr})`);
      }
    }

    lines.push('');
    lines.push('6) Ajustes do protocolo (extras habilitados):');
    const extras = [
      enableFitoterapia && 'Fitoterapia',
      enableSuplementos && 'Suplementação',
      enableEmagrecimentoRapido && 'HIIT + Termogênicos',
    ].filter(Boolean);
    lines.push(`   ${extras.length ? extras.join(', ') : 'Nenhum'}`);

    lines.push('');
    lines.push('7) Extras e observações:');
    if (substitutions.length) {
      lines.push('   Alimentos para substituição:');
      for (const s of substitutions) lines.push(`     - ${s.food} — ${s.portion}`);
    }
    if (modelDiet.trim()) {
      lines.push('   Dieta modelo (referência):');
      lines.push(modelDiet.trim().split('\n').map(l => `     ${l}`).join('\n'));
    }

    return lines.join('\n');
  };

  const copyAllInfo = async () => {
    try {
      await navigator.clipboard.writeText(buildContextSummary());
      toast.success('Informações copiadas!');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const carbCyclingValidity = useMemo(
    () => isCarbCyclingValid(carbCycling, carbTypeTargets, weeklyCarbTargets),
    [carbCycling, carbTypeTargets, weeklyCarbTargets],
  );
  const canGenerate = Boolean(
    activityLevel && strategy && mealCount && phase && weeklySchedule &&
    baseKcalIssues.length === 0 && macroResolution.status === 'ok' && carbCyclingValidity.valid,
  );

  const streamDietAgent = async (
    messages: { role: 'user' | 'assistant'; content: string }[],
    onChunk?: (content: string) => void,
  ) => {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, studentContext: studentCtx }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || `Erro ${resp.status}`);
    }
    if (!resp.body) throw new Error('Sem resposta');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';
    let accumulated = '';
    let streamDone = false;

    const consumeLine = (line: string) => {
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '' || !line.startsWith('data: ')) return;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') { streamDone = true; return; }
      const parsed = JSON.parse(jsonStr);
      const content = parsed.choices?.[0]?.delta?.content as string | undefined;
      if (content) {
        accumulated += content;
        onChunk?.(accumulated);
      }
    };

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = textBuffer.indexOf('\n')) !== -1) {
        const line = textBuffer.slice(0, idx);
        textBuffer = textBuffer.slice(idx + 1);
        try { consumeLine(line); } catch { textBuffer = line + '\n' + textBuffer; break; }
      }
    }

    for (const raw of textBuffer.split('\n')) {
      if (!raw || raw.startsWith(':') || raw.trim() === '' || !raw.startsWith('data: ')) continue;
      try { consumeLine(raw); } catch { /* ignore trailing partial chunks */ }
    }

    return accumulated;
  };

  /**
   * Structured generation path — JSON canonical DietPlan as primary output.
   * Returns the validated, totals-recomputed plan or null on failure.
   * The caller decides whether to fall back to streaming markdown.
   */
  // Traduz os eventos de progresso do servidor para texto amigável na UI.
  const describeGenProgress = (evt: any): { label: string; detail?: string; ratio: number } => {
    switch (evt?.phase) {
      case 'start':
        return { label: 'Preparando contexto do aluno...', ratio: 0.03 };
      case 'models_started':
        return { label: 'Montando o plano alimentar...', detail: 'Duas candidatas em paralelo', ratio: 0.08 };
      case 'generating':
        return {
          label: 'Montando o plano alimentar...',
          detail: `Candidata ${evt.candidate === 'seguranca' ? 'de segurança' : 'principal'} — ${Math.round((Number(evt.ratio) || 0) * 100)}% do JSON`,
          ratio: 0.08 + (Number(evt.ratio) || 0) * 0.62,
        };
      case 'primary_done':
        return { label: 'Plano recebido, conferindo...', ratio: 0.72 };
      case 'validating':
        return { label: 'Validando macros, proteína e ajustes diários...', ratio: 0.8 };
      case 'fallback_review':
        return {
          label: 'Revisando com a candidata de segurança...',
          detail: Array.isArray(evt.reasons) && evt.reasons.length ? evt.reasons.join(', ') : undefined,
          ratio: 0.86,
        };
      case 'finalizing':
        return { label: 'Finalizando e normalizando o plano...', ratio: 0.95 };
      default:
        return { label: 'Gerando plano...', ratio: 0.5 };
    }
  };

  const generateStructuredPlan = async (

    userPrompt: string,
    dietConfig: { objective?: string; strategy?: string; style?: string; carbCyclePlan?: any; weeklyEnergySchedule?: any; carbCyclingEnabled?: boolean },
    targets: { kcal: number; p: number; c: number; g: number; tmb?: number; get?: number },
    intent: DietIntent = 'new',
  ): Promise<{
    plan: DietPlan | null;
    errorCode?: string;
    status?: number;
    message?: string;
    details?: string;
    validationReasons?: unknown;
    missingDays?: unknown;
    dayTargetIssues?: unknown;
  }> => {
    // Latest training markdown → structured context
    let trainingContext: any = undefined;
    try {
      const md = await loadActiveTrainingMarkdown(supabase, studentId!);
      trainingContext = buildDietTrainingContext(md, trainingTime);
    } catch (e) {
      console.warn('structured: failed to load training context', e);
    }

    // Alimentos da dieta modelo sem correspondência única na base: só eles podem
    // voltar sem foodId (source model_diet). Calculado ANTES da geração.
    let allowedUnresolvedFoods: { name: string; source: string }[] = [];
    // Nomes livres (preferências / lista de alimentos) associados ao alimento do banco.
    let foodAliasBlock = '';
    try {
      const foodsForCheck = await loadFoodMacroRecords();
      const hints = buildDietFoodHints(modelDiet, getPreferencesText(), foodsForCheck);
      allowedUnresolvedFoods = hints.allowedUnresolvedFoods;
      foodAliasBlock = hints.foodAliasBlock;
      if (hints.matched.length) {
        toast.info('Alimentos associados ao banco', { description: hints.matched.map((m) => `${m.from} → ${m.to}`).join(' · ') });
      }
      if (hints.unmatchedModel.length) {
        toast.warning('Alimentos sem cadastro', { description: `Sem correspondência no banco: ${hints.unmatchedModel.join(', ')}. Cadastre-os ou troque por um alimento existente.` });
      }
    } catch (e) {
      console.warn('structured: failed to build allowed unresolved foods', e);
    }

    const streamResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(buildDietAgentBody({
        userPrompt,
        foodAliasBlock,
        studentCtx,
        dietConfig,
        trainingContext,
        studentId: studentId!,
        variationIntensity,
        intent,
        modelDiet,
        targets,
        allowedUnresolvedFoods,
      })),
    });

    if (!streamResp.ok || !streamResp.body) {
      const err = await streamResp.json().catch(() => ({}));
      const body = (err && typeof err === 'object' ? err : {}) as any;
      console.error('[DietaIA] structured generation failed', {
        status: streamResp.status,
        error_code: body.error_code,
        error: body.error,
        details: body.details,
        validationReasons: body.validationReasons,
        missing_days: body.missing_days,
        dayTargetIssues: body.dayTargetIssues,
      });
      return {
        plan: null,
        status: streamResp.status,
        errorCode: body.error_code || undefined,
        message: body.error || undefined,
        details: body.details,
        validationReasons: body.validationReasons,
        missingDays: body.missing_days,
        dayTargetIssues: body.dayTargetIssues,
      };
    }

    // Consome o SSE de progresso até o evento `result`.
    let finalStatus = 500;
    let finalBody = '';
    {
      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const handleEvent = (block: string) => {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.type === 'progress') setGenProgress(describeGenProgress(evt));
          else if (evt.type === 'result') {
            finalStatus = Number(evt.status) || 500;
            finalBody = typeof evt.body === 'string' ? evt.body : '';
          }
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buf += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        let sep = buf.indexOf('\n\n');
        while (sep >= 0) {
          handleEvent(buf.slice(0, sep));
          buf = buf.slice(sep + 2);
          sep = buf.indexOf('\n\n');
        }
        if (done) break;
      }
      if (buf.trim()) handleEvent(buf);
    }

    const resp = { status: finalStatus, ok: finalStatus >= 200 && finalStatus < 300 };
    const parsedBody = (() => { try { return JSON.parse(finalBody); } catch { return null; } })();
    if (!resp.ok) {
      console.error('[DietaIA] structured generation failed', {
        status: resp.status,
        error_code: parsedBody?.error_code,
        error: parsedBody?.error,
        details: parsedBody?.details,
        validationReasons: parsedBody?.validationReasons,
        missing_days: parsedBody?.missing_days,
        dayTargetIssues: parsedBody?.dayTargetIssues,
      });
      return {
        plan: null,
        status: resp.status,
        errorCode: parsedBody?.error_code || undefined,
        message: parsedBody?.error || (!parsedBody ? 'A conexão com a IA foi interrompida antes da resposta final.' : undefined),
        details: parsedBody?.details,
        validationReasons: parsedBody?.validationReasons,
        missingDays: parsedBody?.missing_days,
        dayTargetIssues: parsedBody?.dayTargetIssues,
      };
    }
    const data = parsedBody;
    const raw = data?.plan;
    if (!raw) return { plan: null, status: resp.status };

    // Normalized daily adjustments (7 dias garantidos pelo servidor).
    try {
      const adjRaw = data?.dailyAdjustments ?? null;
      if (dietConfig?.weeklyEnergySchedule && weeklySchedule && adjRaw && typeof adjRaw === 'object') {
        // Re-normaliza no cliente para blindar contra respostas alteradas em trânsito.
        const { adjustments, missing, validation, warnings } = processDietDailyAdjustments(adjRaw, weeklySchedule);
        console.log('[DietaIA] client_daily_adjustments_received', {
          days: Object.keys(adjustments).length,
          missing_count: missing.length,
          validation_ok: validation.ok,
        });
        setDailyAdjustments(adjustments);
        setScheduleWarnings(warnings);
      } else {
        setDailyAdjustments(null);
        setScheduleWarnings([]);
      }
    } catch (e) {
      console.warn('daily adjustments validation failed', e);
    }
    if (data?.similarity) {
      const sim = {
        ...(data.similarity as SimilarityFeedback),
        nutrition: data?.nutrition,
      } as SimilarityFeedback;
      setDietSimilarity(sim);
      const fb = describeSimilarity(sim);
      if (fb.level === 'warn') toast.warning(fb.label);
      else if (sim.historyCount > 0) toast(fb.label);
    } else {
      setDietSimilarity(null);
    }

    // Autoridade determinística: os targets do app vencem os da IA (código compartilhado).
    const finalized = finalizeDietAgentPlan(raw, targets);
    if (!finalized.plan) {
      console.warn('structured: schema rejected plan', finalized.issues);
      return { plan: null, status: resp.status, errorCode: finalized.errorCode ?? 'schema_rejected' };
    }
    return { plan: finalized.plan };
  };

  // Fase 4.2: o fluxo structured valida por foodId — o `id` é obrigatório aqui.
  const loadFoodMacroRecords = async (): Promise<Array<FoodMacroRecord & { id: string }>> => loadDietFoodRecords(supabase);

  const generatePlan = async (opts: { regenerateIntent?: boolean; intent?: DietIntent } = {}) => {
    if (!canGenerate || !studentCtx || generating) return;
    const intent: DietIntent = opts.intent ?? (opts.regenerateIntent ? 'regenerate' : 'new');
    setLastIntent(intent);
    scrollToResultAfterGenerationRef.current = true;
    setGenerating(true);
    setGenOutcome(null);
    setGenErrorDetail(null);
    setGenProgress({ label: 'Preparando dados do aluno...', ratio: 0.03 });
    setResult('');
    setMacroReport(null);
    setStructuredPlan(null);
    setDietSimilarity(null);
    setViability(null);
    setDailyAdjustments(null);
    setPendingNewFoods([]);
    setScheduleWarnings([]);

    if (!weeklySchedule || baseKcal.base_daily_kcal == null || baseKcalIssues.length > 0) {
      toast.error('Defina uma meta calórica base válida antes de gerar a dieta.');
      setGenerating(false);
      setGenProgress(null);
      return;
    }

    // Prompt, configuração e metas: código compartilhado com o escritório (office-gerar).
    const {
      prompt,
      structuredPrompt,
      dietConfig,
      targets: structuredTargets,
      currentTargets,
    } = buildDietGenerationPrompts({
      state: wizardState,
      studentCtx,
      baseKcal,
      macroConfig,
      macroResolution,
      macroBody,
      canonicalTargets,
      carbCycling,
      weeklyCarbTargets,
      weeklySchedule,
    });

    try {
      const foodRecords = await loadFoodMacroRecords();

      // ── 1) STRUCTURED MODE (primary path) ──
      let structured: DietPlan | null = null;
      let structuredError: {
        status?: number;
        code?: string;
        message?: string;
        details?: string;
        validationReasons?: unknown;
        missingDays?: unknown;
        dayTargetIssues?: unknown;
      } | null = null;
      if (currentTargets) {
        try {
          const structuredResult = await generateStructuredPlan(
            structuredPrompt,
            dietConfig,
            structuredTargets,
            intent,
          );
          structured = structuredResult.plan;
          if (!structured) {
            structuredError = {
              status: structuredResult.status,
              code: structuredResult.errorCode,
              message: structuredResult.message,
              details: structuredResult.details,
              validationReasons: structuredResult.validationReasons,
              missingDays: structuredResult.missingDays,
              dayTargetIssues: structuredResult.dayTargetIssues,
            };
          }
        } catch (e) {
          console.warn('structured generation threw, falling back to streaming:', e);
          structuredError = { message: (e as any)?.message };
        }
      }

      if (structured) {
        const md = dietPlanToMarkdown(structured);
        setStructuredPlan(structured);
        setResult(md);
        // Detectar alimentos novos (não existentes na base) para aprovação manual.
        try {
          const existingNames = foodRecords.map((f) => f.name);
          const newFoods = detectNewFoodsFromPlan(structured, existingNames);
          setPendingNewFoods(newFoods);
          if (newFoods.length > 0) {
            toast.info(`${newFoods.length} alimento(s) novo(s) detectado(s). Revise e aprove abaixo.`);
          }
        } catch (e) {
          console.warn('detectNewFoodsFromPlan failed', e);
        }
        if (currentTargets) {
          // Fase 4.2: plano STRUCTURED é validado direto pelo JSON canônico
          // (foodId → foods → nutritionCore). O markdown é apenas derivado.
          if (carbCycling.enabled) {
            setMacroReport(null);
            setDayMacroReport(
              validateCanonicalDietDayTargets({
                plan: structured,
                dayTargets: weeklyCarbTargets,
                foods: foodRecords,
              }),
            );
          } else {
            setDayMacroReport(null);
            setMacroReport(
              validateCanonicalDietTarget({
                plan: structured,
                target: currentTargets,
                foods: foodRecords,
              }),
            );
          }
        }
        // Compute viability score from generated plan + questionnaire + adherence.
        try {
          const adherencePct = studentCtx.historico_processo?.aderencia_recente?.percentual_aderencia ?? null;
          const v = computeViabilityScore({
            plan: structured,
            questionnaire: studentCtx.questionario_dieta ?? null,
            adherencePct,
            mealCount: Number(mealCount) || undefined,
          });
          setViability(v);
        } catch (e) { console.warn('viability score failed', e); }
        const status = structured.validation?.status;
        if (status === 'ok') toast.success('Dieta gerada (JSON canônico).');
        else if (status === 'warning') toast('Dieta gerada — revisar avisos.', { icon: '⚠️' });
        else if (status === 'invalid') toast('Dieta fora da meta. Revise antes de enviar.', { icon: '⚠️' });
        return;
      }

      // Contrato formal: quando existe weeklyEnergySchedule, o servidor DEVE
      // devolver dailyAdjustments válido. Se o structured falhou (ex.: 422
      // daily_adjustments_invalid), NÃO cair no fallback markdown — o editor
      // não pode exibir um plano sem os ajustes por dia.
      if (weeklySchedule && structuredError) {
        console.error('[DietaIA] structured_failed_with_schedule', structuredError);
        const errorDetail: DietAgentErrorDetail = {
          code: structuredError.code,
          message: structuredError.message,
          details: structuredError.details,
          validationReasons: structuredError.validationReasons,
          missingDays: structuredError.missingDays,
          dayTargetIssues: structuredError.dayTargetIssues,
        };
        const errorLines = formatDietAgentError(errorDetail);
        setGenErrorDetail(errorDetail);
        setGenOutcome({ status: 'error', message: errorLines[0] });
        toast.error(errorLines[0]);
        return;
      }


      // ── 2) FALLBACK: streaming markdown ──
      console.warn('Structured path unavailable, falling back to markdown stream.');
      const generated = await streamDietAgent([{ role: 'user', content: prompt }]);
      let finalPlan = generated;

      if (currentTargets) {
        let report = validateDietMacros(generated, currentTargets, foodRecords);

        if (!report.valid) {
          toast.error('Dieta gerada fora da meta. Ajustando automaticamente...');
          const correctionPrompt = `A dieta abaixo foi REPROVADA na validação real do sistema. Reescreva o plano inteiro corrigindo SOMENTE as porções/alimentos da tabela para bater a meta.

META OBRIGATÓRIA: ${formatDietMacroLine(report.target)}
GERADO REAL: ${formatDietMacroLine(report.generated)}
DIFERENÇA: ${formatDietMacroLine(report.difference)}
MOTIVOS: ${report.reasons.join(' ')}

REGRAS DE AJUSTE OBRIGATÓRIAS:
- Se proteína estiver acima da meta, reduza whey, claras, frango, peixe, carne, ovos e laticínios proteicos primeiro.
- Se carboidrato estiver abaixo da meta, aumente arroz, massa, batata, batata-doce, aveia, pão, tapioca, frutas, mel, cereais ou quinoa.
- Se gordura estiver acima da meta, reduza salmão, abacate, amêndoas, castanhas, azeite, manteiga de amendoim, ovos inteiros e iogurtes gordos.
- Se calorias estiverem abaixo, complete preferencialmente com carboidratos de baixa gordura.
- Não use proteína para completar calorias.
- Distribua a proteína de forma equilibrada entre as ${mealCount} refeições.
- Use valores da base por gramas: valor_porção = valor_base * quantidade_g / porção_base.

DIETA REPROVADA:
${generated}`;

          const adjusted = await streamDietAgent([{ role: 'user', content: correctionPrompt }]);
          finalPlan = adjusted;
          report = validateDietMacros(adjusted, currentTargets, foodRecords);
        }

        setMacroReport(report);
        setDayMacroReport(null);
        setResult(finalPlan);
        if (report.valid) {
          toast.success('Dieta validada dentro da meta.');
        } else {
          toast('Dieta fora da meta. Revise ou ajuste antes de enviar ao aluno.', { icon: '⚠️' });
        }
      } else {
        setResult(generated);
      }
    } catch (e: any) {
      console.error(e);
      const friendlyMessage = describeNetworkError(e);
      setGenErrorDetail({ message: friendlyMessage });
      setGenOutcome({ status: 'error', message: friendlyMessage });
      toast.error(friendlyMessage);
    } finally {
      setGenerating(false);
      setGenProgress(null);
      setGenOutcome((prev) => prev ?? { status: 'success' });
    }
  };

  const savePlan = async (modeOverride?: 'draft' | 'publish') => {
    if (!result) return;
    if (!weeklySchedule || baseKcal.base_daily_kcal == null || baseKcalIssues.length > 0) {
      toast.error('Não é possível salvar: defina uma meta calórica base válida.');
      return;
    }
    const mode = modeOverride ?? saveMode;
    const isDraft = mode === 'draft';
    // Guarda de integridade: alimento sem vínculo com a base não vai para publicação.
    if (!isDraft && structuredPlan && collectUnresolvedItems(structuredPlan).length > 0) {
      toast.error('Resolva os alimentos não vinculados à base antes de publicar. É possível salvar como rascunho.');
      return;
    }
    // Bloqueio duro: se o schedule tem qualquer dia diferente da base,
    // dailyAdjustments é obrigatório (contrato formal) apenas para PUBLICAÇÃO.
    const scheduleHasAdjustments = ENERGY_WEEKDAYS.some((wd) => {
      const d = weeklySchedule.days[wd];
      const t = d.fixed_kcal != null && d.fixed_kcal > 0
        ? Math.round(d.fixed_kcal)
        : Math.round(weeklySchedule.base_daily_kcal + d.adjustment_kcal);
      return t !== Math.round(weeklySchedule.base_daily_kcal);
    });
    if (scheduleHasAdjustments && !isDraft) {
      if (!dailyAdjustments) {
        toast.error('Não é possível publicar: dados de ajuste ausentes. Salve como rascunho e regere o plano.');
        return;
      }
      const validation = validateDailyAdjustments(dailyAdjustments, []);
      if (!validation.ok) {
        console.warn('[DietaIA] savePlan_blocked_invalid_adjustments', validation.errors);
        toast.error('Não é possível publicar: sinal incompatível ou dias faltando. Corrija antes de publicar.');
        return;
      }
      // Tolerância ±75 kcal por dia — bloqueia publicação se algum dia estiver fora.
      const outside: string[] = [];
      for (const wd of ENERGY_WEEKDAYS) {
        const d = dailyAdjustments[wd];
        const tol = evaluateTolerance(d.requested_adjustment_kcal, d.estimated_adjustment_kcal);
        if (tol.state === 'outside_tolerance') {
          outside.push(`${WEEKDAY_LABELS[wd]} (diferença ${tol.difference_kcal >= 0 ? '+' : ''}${tol.difference_kcal} kcal)`);
        }
      }
      if (outside.length > 0) {
        console.warn('[DietaIA] savePlan_blocked_outside_tolerance', outside);
        toast.error(`Não é possível publicar: ${outside.length} dia(s) fora da tolerância ±75 kcal — ${outside.join(', ')}. Regere ou edite manualmente.`);
        return;
      }
    }
    if (carbCycling.enabled) {
      const hard: string[] = [];
      const soft: string[] = [];
      for (const [wd, t] of Object.entries(weeklyCarbTargets)) {
        if (!t) continue;
        carbDayTargetSanityIssues(t, macroBody.weightKg ?? null, baseKcal.base_daily_kcal ?? null).forEach((msg) => {
          (msg.includes('meta base') ? soft : hard).push(`${wd.toUpperCase()}: ${msg}`);
        });
      }
      if (hard.length > 0) {
        toast.error(`Metas do ciclo de carbo inválidas — ${hard.slice(0, 3).join(' · ')}. Revise os g/kg em Ajustes Finos.`);
        return;
      }
      if (soft.length > 0) toast.warning(`Atenção: ${soft.slice(0, 3).join(' · ')}`);
    }
    console.log('[DietaIA] savePlan_start', { mode, isDraft, scheduleHasAdjustments });
    setSaving(true);
    const protocols = buildDietProtocols({
      selectedAdjustments,
      enableFitoterapia,
      enableSuplementos,
      enableEmagrecimentoRapido,
      enableJejumIntermitente,
      weeklySchedule,
      dailyAdjustments,
      carbCycling,
      weeklyCarbTargets,
    });
    if (editPlanId) {
      const validation = validateDietJSON(result);
      let canonicalPlan: any = null;
      // Prefer structured plan from generation; lift markdown only as fallback.
      if (structuredPlan) {
        canonicalPlan = structuredPlan;
      }
      try {
        if (!canonicalPlan && macroReport?.target) {
          const lifted = markdownToDietPlan(result, {
            kcal: macroReport.target.calories,
            p: macroReport.target.protein,
            c: macroReport.target.carbs,
            g: macroReport.target.fats,
          }, { strategy: (strategy as any) || undefined, style: (dietStyle as any) || undefined, phase });
          if (lifted) canonicalPlan = finalizeDietPlan(lifted);
        }
      } catch (e) { console.error('lift to DietPlan failed', e); }
      // FASE 6: structured NUNCA é publicado pelo cliente — salva rascunho e
      // delega a publicação atômica para a Edge Function.
      const structuredSave = isStructuredCanonicalPlan(canonicalPlan);
      const { error } = await supabase.from('ai_plans').update({
        conteudo: result,
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')} (editada)`,
        protocols,
        is_draft: structuredSave ? true : isDraft,
        conteudo_json: canonicalPlan ?? (validation.success ? (validation.data as any) : null),
        migration_status: (validation.success ? 'completed' : 'failed') as any,
        migration_error: validation.error || null,
      }).eq('id', editPlanId);
      if (error) {
        toast.error('Erro: ' + error.message);
        await failDietApplication(applicationId, error.message);
      } else if (structuredSave && !isDraft) {
        const ok = await publishStructuredPlanViaEdge(editPlanId);
        if (ok) await closeDietApplication(applicationId, editPlanId);
        else await failDietApplication(applicationId, 'publicação bloqueada');
      } else {
        toast.success('Dieta atualizada!');
        await closeDietApplication(applicationId, editPlanId);
      }
    } else {
      let canonicalPlan: any = null;
      if (structuredPlan) {
        canonicalPlan = structuredPlan;
      }
      try {
        if (!canonicalPlan && macroReport?.target) {
          const lifted = markdownToDietPlan(result, {
            kcal: macroReport.target.calories,
            p: macroReport.target.protein,
            c: macroReport.target.carbs,
            g: macroReport.target.fats,
          }, { strategy: (strategy as any) || undefined, style: (dietStyle as any) || undefined, phase });
          if (lifted) canonicalPlan = finalizeDietPlan(lifted);
        }
      } catch (e) { console.error('lift to DietPlan failed', e); }
      // Guard against duplicate rows: if there's already a plan created today
      // for this student, treat this save as an update to that row rather
      // than inserting a new one. Prevents the "Dieta triplicada" bug where
      // repeated regenerations/saves produced multiple identical rows.
      let sameDayId: string | null = null;
      try {
        const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
        const { data: sameDay } = await supabase
          .from('ai_plans')
          .select('id, created_at')
          .eq('student_id', studentId!)
          .eq('tipo', 'dieta')
          // FASE 6: reaproveitar apenas RASCUNHO do dia. Dieta publicada é histórico.
          // FASE 6.1: nunca reaproveitar draft que é NOVA VERSÃO de uma publicada.
          .eq('is_draft', true)
          .is('parent_plan_id', null)

          .gte('created_at', startOfDay.toISOString())
          .order('created_at', { ascending: false })
          .limit(1);
        sameDayId = sameDay?.[0]?.id ?? null;
      } catch (e) { /* fall through to insert */ }

      // FASE 6: structured nasce SEMPRE como rascunho; publicação é server-side.
      const structuredSave = isStructuredCanonicalPlan(canonicalPlan);

      if (sameDayId) {
        const { error } = await supabase.from('ai_plans').update({
          conteudo: result,
          titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
          protocols,
          is_draft: structuredSave ? true : isDraft,
          conteudo_json: canonicalPlan ?? null,
          migration_status: canonicalPlan ? 'completed' : 'pending',
          diet_strategy: strategy || null,
          strategy_source: 'manual',
          generation_intent: lastIntent,
          viability_score: viability?.score ?? null,
          viability_breakdown: viability?.breakdown ?? null,
          whatsapp_notified_at: null,
        } as any).eq('id', sameDayId);
        if (error) {
          toast.error('Erro: ' + error.message);
          await failDietApplication(applicationId, error.message);
        } else if (structuredSave && !isDraft) {
          const ok = await publishStructuredPlanViaEdge(sameDayId);
          if (ok) await closeDietApplication(applicationId, sameDayId);
          else await failDietApplication(applicationId, 'publicação bloqueada');
        } else {
          toast.success('Dieta atualizada!');
          await closeDietApplication(applicationId, sameDayId);
        }
        setSaving(false);
        return;
      }

      const { data: insertedPlan, error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'dieta',
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo: result,
        protocols,
        is_draft: structuredSave ? true : isDraft,
        cycle_status: 'em_dia',
        conteudo_json: canonicalPlan ?? null,
        migration_status: canonicalPlan ? 'completed' : 'pending',
        diet_strategy: strategy || null,
        strategy_source: 'manual',
        generation_intent: lastIntent,
        viability_score: viability?.score ?? null,
        viability_breakdown: viability?.breakdown ?? null,
      }).select('id').single();
      if (error) {
        toast.error('Erro: ' + error.message);
        await failDietApplication(applicationId, error.message);
      } else {
        let published = true;
        if (structuredSave && !isDraft && insertedPlan?.id) {
          published = await publishStructuredPlanViaEdge(insertedPlan.id);
        }
        // FASE 6.1: em structured quem renova o ciclo é a RPC atômica.
        if (!structuredSave && published && !isDraft && lastDietPlan?.id) {
          await supabase.from('ai_plans').update({
            cycle_status: 'renovado'
          }).eq('id', lastDietPlan.id);
        }

        if (!structuredSave || isDraft) {
          toast.success(isDraft ? 'Rascunho salvo!' : 'Dieta salva e ciclo atualizado!');
        }
        if (published) await closeDietApplication(applicationId, insertedPlan?.id ?? null);
        else await failDietApplication(applicationId, 'publicação bloqueada');
      }
    }
    setSaving(false);
  };

  /**
   * Fluxo único: JSON canônico → derivados (markdown, cards, PDF, validação).
   * Nunca o contrário. Usado depois de resolver um alimento manualmente.
   */
  const applyCanonicalPlanUpdate = async (nextPlan: DietPlan) => {
    setStructuredPlan(nextPlan);
    const stillUnresolved = collectUnresolvedItems(nextPlan).length > 0;
    try {
      const foodRecords = await loadFoodMacroRecords();
      const targets: DietMacroTargets | null = canonicalTargets.kcal > 0
        ? {
          calories: canonicalTargets.kcal,
          protein: canonicalTargets.p,
          carbs: canonicalTargets.c,
          fats: canonicalTargets.g,
        }
        : null;
      if (!targets || stillUnresolved) {
        // Com alimento pendente a dieta não é validada contra a meta.
        setMacroReport(null);
        setDayMacroReport(null);
        return;
      }
      // Fase 4.2: validação direto pelo JSON canônico (foodId), nunca pelo markdown.
      if (carbCycling.enabled) {
        setMacroReport(null);
        setDayMacroReport(
          validateCanonicalDietDayTargets({
            plan: nextPlan,
            dayTargets: weeklyCarbTargets,
            foods: foodRecords,
          }),
        );
      } else {
        setDayMacroReport(null);
        setMacroReport(
          validateCanonicalDietTarget({ plan: nextPlan, target: targets, foods: foodRecords }),
        );
      }
    } catch (e) {
      console.warn('applyCanonicalPlanUpdate revalidation failed', e);
    } finally {
      // Markdown/cards/PDF são derivados do canônico.
      setResult(dietPlanToMarkdown(nextPlan));
    }
  };

  const adjustMacros = async () => {
    if (!result || !macroReport) return;
    setAdjusting(true);
    try {
      // Extract meals from the current result markdown
      const sections = parseSections(result);
      const meals: ParsedMeal[] = sections.flatMap((s) =>
        s.type === 'meal' ? (s.meals || []) : []
      );

      if (meals.length === 0) {
        toast.error('Nenhuma tabela de refeições encontrada para ajustar.');
        setAdjusting(false);
        return;
      }

      // Scale all portions proportionally to match target kcal
      const scaled = scaleMealsToMacroTargets(meals, {
        kcal: macroReport.target.calories,
        p: macroReport.target.protein,
        c: macroReport.target.carbs,
        g: macroReport.target.fats,
      });

      // Rebuild the markdown with adjusted table
      const adjusted = replaceMealTableInMarkdown(result, scaled);

      // Re-validate
      const foodRecords = await loadFoodMacroRecords();
      const report = validateDietMacros(adjusted, macroReport.target, foodRecords);
      setMacroReport(report);
      setResult(adjusted);

      if (report.valid) {
        toast.success('Porções ajustadas proporcionalmente dentro da meta!');
      } else {
        toast('Ajuste proporcional aplicado. Revise os macros.', { icon: '⚠️' });
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao ajustar macros');
    } finally {
      setAdjusting(false);
    }
  };

  const SelectionButton = ({ selected, onClick, children, className = '' }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) => (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition-all ${
        selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
      } ${className}`}
    >
      {children}
    </button>
  );

  const StepHeader = ({ step, title }: { step: number; title: string }) => (
    <h3 className="font-bold text-sm flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{step}</span>
      {title}
    </h3>
  );

  if (loading) {
    return (
      <AppLayout title="Dieta IA">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Dieta IA - ${studentName}`}>
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {(generating || genOutcome) && (
          <div ref={genPanelRef}>
            <GenerationProgress
              kind="diet"
              status={generating ? 'generating' : (genOutcome?.status ?? 'success')}
              progress={genProgress}
              errorMessage={genOutcome?.message}
            />
          </div>
        )}

        {/* Student Summary */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <UtensilsCrossed className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-bold">Plano Alimentar - {studentName}</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              {studentCtx?.peso && <div className="bg-secondary rounded-lg p-2 text-center"><span className="text-muted-foreground text-xs block">Peso</span><span className="font-bold">{studentCtx.peso} kg</span></div>}
              {studentCtx?.altura && <div className="bg-secondary rounded-lg p-2 text-center"><span className="text-muted-foreground text-xs block">Altura</span><span className="font-bold">{studentCtx.altura} cm</span></div>}
              {studentCtx?.percentual_gordura && <div className="bg-secondary rounded-lg p-2 text-center"><span className="text-muted-foreground text-xs block">% Gordura</span><span className="font-bold">{studentCtx.percentual_gordura}%</span></div>}
              {studentCtx?.massa_magra && <div className="bg-secondary rounded-lg p-2 text-center"><span className="text-muted-foreground text-xs block">Massa Magra</span><span className="font-bold">{studentCtx.massa_magra} kg</span></div>}
            </div>
            {studentCtx?.objetivo && (
              <p className="text-sm text-muted-foreground mt-2">Objetivo: <span className="text-foreground font-medium">{studentCtx.objetivo}</span></p>
            )}
          </CardContent>
        </Card>

        {(() => {
          const STEP_TITLES = [
            'Objetivo do Plano',
            'Base da Dieta',
            'Estratégia da Dieta',
            'Estrutura Alimentar do Dia',
            'Ajustes Finos do Protocolo',
            'Calorias por dia',
            'Extras e Observações',
          ];
          const stepValid = [
            !!trainingTime && !!trainingDays && !!phase && usesHormones !== null && !!activityLevel && !!strategy,
            !!dietStyle,
            true,
            !!mealCount,
            true,
            !!weeklySchedule && baseKcalIssues.length === 0 && validateSchedule(weeklySchedule).length === 0,
            true,
          ];
          return (
            <AiWizard
              steps={STEP_TITLES}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              stepValid={stepValid}
              autoAdvanceDelay={0}
              canGenerate={!!canGenerate}
              generating={generating}
              onGenerate={generatePlan}
              generateLabel="Gerar Plano Alimentar"
              generateIcon={<UtensilsCrossed className="h-5 w-5" />}
            >
              {currentStep === 0 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={1} title="Objetivo do Plano" />
            <p className="text-[11px] text-muted-foreground -mt-2">
              Defina a direção do plano: rotina, treino, fase, hormônios, atividade e estratégia.
            </p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Descreva a rotina diária do aluno (trabalho, horários, etc.)</p>
              <input
                value={dailyRoutine}
                onChange={(e) => setDailyRoutine(e.target.value)}
                placeholder="Ex: trabalha das 8h às 17h, treina de manhã..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Horário de treino</p>
              <div className="flex gap-2 flex-wrap">
                {TRAINING_TIMES.map(t => (
                  <SelectionButton key={t.value} selected={trainingTime === t.value} onClick={() => setTrainingTime(t.value)} className="px-4 py-2">
                    <span className="font-medium text-sm">{t.label}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Variação em relação à dieta anterior</p>
              <div className="grid grid-cols-3 gap-2">
                {DIET_VARIATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVariationIntensity(opt.value)}
                    className={`rounded-xl border-2 p-2 text-xs text-left transition-all ${
                      variationIntensity === opt.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Se ficar parecido demais com o cardápio anterior, o sistema regerar automaticamente 1x.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Frequência de treino</p>
              <div className="flex gap-2 flex-wrap">
                {TRAINING_DAYS_OPTIONS.map(d => (
                  <SelectionButton key={d.value} selected={trainingDays === d.value} onClick={() => setTrainingDays(d.value)} className="px-4 py-2">
                    <span className="font-medium text-sm">{d.label}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Fase atual do aluno</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PHASES.map(p => (
                  <SelectionButton key={p.value} selected={phase === p.value} onClick={() => setPhase(p.value)}>
                    <span className="font-semibold text-sm block">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Uso de hormônios / TRT</p>
              <div className="flex gap-2">
                <SelectionButton selected={usesHormones === false} onClick={() => setUsesHormones(false)} className="px-4 py-2">
                  <span className="font-medium text-sm">Natural</span>
                </SelectionButton>
                <SelectionButton selected={usesHormones === true} onClick={() => setUsesHormones(true)} className="px-4 py-2">
                  <span className="font-medium text-sm">Sim, usa hormônios</span>
                </SelectionButton>
              </div>
              {usesHormones && (
                <input
                  value={hormoneDetails}
                  onChange={(e) => setHormoneDetails(e.target.value)}
                  placeholder="Ex: TRT 200mg/sem, GH 4ui/dia..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none mt-2"
                />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Nível de atividade física</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ACTIVITY_LEVELS.map(a => (
                  <SelectionButton
                    key={a.value}
                    selected={activityLevel === a.value}
                    onClick={() => { setActivityLevel(a.value); setActivityLevelTouched(true); }}
                  >
                    <span className="font-semibold text-sm block">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{a.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Estratégia nutricional (cutting/manutenção/bulking/recomp/performance)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STRATEGIES.map(s => (
                  <SelectionButton key={s.value} selected={strategy === s.value} onClick={() => setStrategy(s.value)}>
                    <span className="font-semibold text-sm block">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 1 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={2} title="Base da Dieta" />
            <p className="text-[11px] text-muted-foreground -mt-2">
              A "dieta-mãe": estrutura base do plano alimentar.
            </p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Escolha a base da dieta</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIET_STYLES.map(d => (
                  <SelectionButton key={d.value} selected={dietStyle === d.value} onClick={() => setDietStyle(d.value)}>
                    <span className="font-semibold text-sm block">{d.label}</span>
                    <span className="text-xs text-muted-foreground">{d.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 2 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={3} title="Estratégia da Dieta" />
            <p className="text-[11px] text-muted-foreground -mt-2">
              Como a dieta será conduzida ao longo do tempo. Sem nenhum marcado = condução <strong>linear</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STRATEGY_ADJUSTMENTS.map(adj => {
                const isSelected = selectedAdjustments.includes(adj.id);
                return (
                  <button
                    key={adj.id}
                    onClick={() => toggleAdjustment(adj.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <adj.icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <span className="font-semibold text-sm block">{adj.label}</span>
                      <span className="text-xs text-muted-foreground">{adj.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 3 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={4} title="Estrutura Alimentar do Dia" />
            <p className="text-[11px] text-muted-foreground -mt-2">
              Como o dia alimentar é montado: refeições, jejum e organização prática.
            </p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Número de refeições por dia</p>
              <div className="flex gap-2 flex-wrap">
                {MEAL_COUNTS.map(m => (
                  <SelectionButton key={m.value} selected={mealCount === m.value} onClick={() => setMealCount(m.value)} className="px-4 py-2">
                    <span className="font-medium text-sm">{m.label}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all hover:border-primary/50 ${enableJejumIntermitente ? 'border-primary bg-primary/10' : 'border-border'}`}>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <span className="font-semibold text-sm block">Jejum Intermitente</span>
                  <span className="text-xs text-muted-foreground">Janela alimentar (ex: 16/8, 18/6). Organiza estrutura, não é "extra".</span>
                </div>
              </div>
              <Switch checked={enableJejumIntermitente} onCheckedChange={setEnableJejumIntermitente} />
            </div>
            {STRUCTURE_ADJUSTMENTS.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Reorganização de refeições</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STRUCTURE_ADJUSTMENTS.map(adj => {
                    const isSelected = selectedAdjustments.includes(adj.id);
                    return (
                      <button
                        key={adj.id}
                        onClick={() => toggleAdjustment(adj.id)}
                        className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                          isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <adj.icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <span className="font-semibold text-sm block">{adj.label}</span>
                          <span className="text-xs text-muted-foreground">{adj.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Restrições alimentares</p>
              <div className="flex gap-2 flex-wrap">
                {RESTRICTION_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => toggleRestriction(r)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedRestrictions.includes(r)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                value={customRestriction}
                onChange={(e) => setCustomRestriction(e.target.value)}
                placeholder="Outro: digite aqui..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none mt-2"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Preferências alimentares</p>
              <div className="flex gap-2 flex-wrap">
                {PREFERENCE_OPTIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePreference(p)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      selectedPreferences.includes(p)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                value={customPreference}
                onChange={(e) => setCustomPreference(e.target.value)}
                placeholder="Outro: digite aqui..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none mt-2"
              />
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 4 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <StepHeader step={5} title="Ajustes Finos do Protocolo (opcional)" />
            <p className="text-xs text-muted-foreground">Refinamentos numéricos que não mudam a base nem a estratégia.</p>
            <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">Meta calórica base</p>
                  <p className="text-[10px] text-muted-foreground">Fonte única usada na etapa de calorias por dia, no payload e na persistência.</p>
                </div>
                <div className="flex rounded-lg border border-border bg-background p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setBaseKcalMode('automatic')}
                    disabled={automaticBaseKcal.missing.length > 0}
                    className={`rounded-md px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      baseKcalMode === 'automatic' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Automática
                  </button>
                  <button
                    type="button"
                    onClick={() => setBaseKcalMode('manual')}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      baseKcalMode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>

              <EnergyCalculationPanel
                selection={energySelection}
                tdee={automaticBaseKcal.calculation.tdee}
                targetKcal={baseKcal.base_daily_kcal}
                activityFactor={parsePositiveNumber(activityLevel)}
                activityLabel={ACTIVITY_LEVELS.find(a => a.value === activityLevel)?.label ?? null}
                strategyPercent={automaticBaseKcal.calculation.strategy_percent}
                weightKg={parsePositiveNumber(studentCtx?.peso)}
                heightCm={parsePositiveNumber(studentCtx?.altura)}
                ageYears={calculateAge(studentCtx?.data_nascimento)}
                bodyFatPct={parsePositiveNumber(studentCtx?.percentual_gordura)}
                leanMassKg={parsePositiveNumber(studentCtx?.massa_magra)}
                leanMassInfo={studentCtx?.massa_magra_data ? `Avaliação de ${new Date(studentCtx.massa_magra_data).toLocaleDateString('pt-BR')}` : (studentCtx?.massa_magra ? 'Composição corporal mais recente' : null)}
                missing={automaticBaseKcal.missing}
                onSelectFormula={setManualFormula}
              />

              {baseKcalMode === 'manual' && (
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Meta manual (kcal/dia)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_DAILY_KCAL}
                    value={manualBaseKcalInput}
                    onChange={(e) => setManualBaseKcalInput(e.target.value)}
                    placeholder="ex: 2200"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                  {manualBaseKcal != null && (
                    <span className="mt-1 block text-[10px] text-primary">Meta definida manualmente: {manualBaseKcal.toLocaleString('pt-BR')} kcal/dia.</span>
                  )}
                </label>
              )}

              {baseKcalIssues.length > 0 && (
                <ul className="list-disc pl-5 text-[11px] text-rose-600">
                  {baseKcalIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FINE_TUNE_ADJUSTMENTS.map(adj => {
                const isSelected = selectedAdjustments.includes(adj.id);
                return (
                  <button
                    key={adj.id}
                    onClick={() => toggleAdjustment(adj.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <adj.icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <span className="font-semibold text-sm block">{adj.label}</span>
                      <span className="text-xs text-muted-foreground">{adj.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <MacroConfigPanel
              config={macroConfig}
              body={macroBody}
              resolution={macroResolution}
              closingMacro={closingMacro}
              targetKcal={baseKcal.base_daily_kcal}
              onChange={handleMacroConfigChange}
              onClosingMacroChange={(macro) => { setMacroConfigTouched(true); setClosingMacro(macro); }}
            />

            <CarbCyclingPanel
              config={carbCycling}
              typeTargets={carbTypeTargets}
              weeklyAverage={carbWeeklyAverage}
              comparison={carbBaseComparison}
              dayInfo={carbDayInfo}
              body={macroBody}
              onChange={(next) => {
                setCarbCycling(next);
                setSelectedAdjustments((prev) => {
                  const has = prev.includes('carb_cycling');
                  if (next.enabled === has) return prev;
                  return next.enabled ? [...prev, 'carb_cycling'] : prev.filter((a) => a !== 'carb_cycling');
                });
              }}
            />
          </CardContent>
        </Card>
              )}

              {currentStep === 5 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <StepHeader step={6} title="Calorias por dia" />
            <p className="text-xs text-muted-foreground">
              Distribua a meta calórica entre os dias da semana. Preencha os passos anteriores
              para calcular a meta base; ajustes são opcionais.
            </p>
            {!weeklySchedule ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-700">Não foi possível calcular automaticamente. Dados ausentes:</p>
                <ul className="list-disc pl-5 text-[11px] text-amber-700">
                  {(baseKcal.missing.length > 0 ? baseKcal.missing : baseKcalIssues).map((item) => <li key={item}>{item}.</li>)}
                </ul>
                <p className="mt-2 text-[11px] text-amber-700">Volte para “Ajustes Finos do Protocolo” e defina uma meta manual.</p>
              </div>
            ) : carbCycling.enabled ? (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
                <p className="text-xs font-semibold">Metas controladas pelo Carb Cycling.</p>
                {WEEKDAY_KEYS.map((wd) => {
                  const d = weeklyCarbTargets[wd];
                  return (
                    <p key={wd} className="text-[11px] text-muted-foreground">
                      {WEEKDAY_LABELS[wd as EnergyWeekday]} · {d ? `${d.type.toUpperCase()} · ${d.kcal} kcal · P ${d.p}g · C ${d.c}g · G ${d.g}g` : 'sem meta válida'}
                    </p>
                  );
                })}
                <p className="text-[10px] text-muted-foreground">
                  Ajustes por dia ficam desativados aqui para não somar duas vezes as mesmas calorias.
                </p>
              </div>
            ) : (
              <WeeklyEnergyScheduleStep
                schedule={weeklySchedule}
                onChange={handleScheduleChange}
                noActiveWorkout={noActiveWorkout}
              />
            )}
            {!carbCyclingValidity.valid && carbCyclingValidity.reason && (
              <p className="text-[11px] text-amber-600">{carbCyclingValidity.reason}</p>
            )}
            {scheduleWarnings.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700">
                  Avisos pós-geração — ajustes fora da tolerância (±10% do ajuste diário, teto ±50 kcal):
                </p>
                <ul className="list-disc pl-5 text-[11px] text-amber-700">
                  {scheduleWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <p className="text-[11px] text-amber-700">
                  Você pode regenerar a dieta para tentar novamente.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
              )}

              {currentStep === 6 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <StepHeader step={7} title="Extras e Observações (opcional)" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                onClick={copyAllInfo}
                title="Copiar todas as informações do aluno e das etapas selecionadas"
              >
                <Copy className="h-3 w-3" />
                Copiar tudo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Complementos que não afetam a lógica central da dieta.</p>
            <div className="space-y-3">
              <div className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all hover:border-primary/50 ${enableFitoterapia ? 'border-primary bg-primary/10' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <Leaf className="h-5 w-5 text-green-500" />
                  <div>
                    <span className="font-semibold text-sm block">Receitas de Fitoterapia</span>
                    <span className="text-xs text-muted-foreground">Chás, infusões e preparações fitoterápicas</span>
                  </div>
                </div>
                <Switch checked={enableFitoterapia} onCheckedChange={setEnableFitoterapia} />
              </div>

              <div className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all hover:border-primary/50 ${enableSuplementos ? 'border-primary bg-primary/10' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <Pill className="h-5 w-5 text-blue-500" />
                  <div>
                    <span className="font-semibold text-sm block">Suplementação</span>
                    <span className="text-xs text-muted-foreground">Whey, creatina, ômega-3, vitaminas e mais</span>
                  </div>
                </div>
                <Switch checked={enableSuplementos} onCheckedChange={setEnableSuplementos} />
              </div>

              <div className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all hover:border-primary/50 ${enableEmagrecimentoRapido ? 'border-primary bg-primary/10' : 'border-border'}`}>
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <div>
                    <span className="font-semibold text-sm block">HIIT + Termogênicos</span>
                    <span className="text-xs text-muted-foreground">Estratégias avançadas de emagrecimento (HIIT, termogênicos). Jejum agora vive na "Estrutura Alimentar do Dia".</span>
                  </div>
                </div>
                <Switch checked={enableEmagrecimentoRapido} onCheckedChange={setEnableEmagrecimentoRapido} />
              </div>
            </div>

            <div className="pt-2 border-t border-border/50 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Alimentos para substituição (opcional)
              </p>
              <p className="text-xs text-muted-foreground">Adicione alimentos que o aluno pode usar como substituição. Serão incluídos no plano.</p>
            
            <div className="flex gap-2">
              <input
                value={newSubFood}
                onChange={(e) => setNewSubFood(e.target.value)}
                placeholder="Alimento (ex: Batata inglesa)"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <input
                value={newSubPortion}
                onChange={(e) => setNewSubPortion(e.target.value)}
                placeholder="Porção (ex: 150g)"
                className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  if (newSubFood.trim()) {
                    setSubstitutions(prev => [...prev, { food: newSubFood.trim(), portion: newSubPortion.trim() || 'a definir' }]);
                    setNewSubFood('');
                    setNewSubPortion('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {substitutions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {substitutions.map((sub, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium">
                    {sub.food} — {sub.portion}
                    <button onClick={() => setSubstitutions(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Dieta Modelo (opcional) — Cole uma dieta de referência e a IA ajustará as quantidades para os macros do aluno
              </p>
              <textarea
                value={modelDiet}
                onChange={(e) => setModelDiet(e.target.value)}
                placeholder="Cole aqui uma dieta modelo completa (ex: tabela de refeições de outro aluno ou plano padrão). A IA usará como base e ajustará as quantidades..."
                rows={6}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-y min-h-[100px]"
              />
              {carbCycling.enabled && modelDietMentionsLinearTargets(modelDiet) && (
                <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs text-amber-600">
                    A dieta modelo menciona dieta linear, mas o Carb Cycling está ativo.
                    As metas configuradas no app serão utilizadas.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCarbCycling((prev) => ({ ...prev, enabled: false }));
                      setSelectedAdjustments((prev) => prev.filter((id) => id !== 'carb_cycling'));
                    }}
                  >
                    Desativar Carb Cycling
                  </Button>
                </div>
              )}
            </div>
            </div>
          </CardContent>
        </Card>
              )}
            </AiWizard>
          );
        })()}

        {/* Card de erro detalhado: visível até a próxima tentativa de geração. */}
        {genErrorDetail && !generating && (
          <Card className="glass-card border-destructive/40">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <h3 className="text-sm font-bold uppercase tracking-wide">Falha na geração do plano</h3>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {formatDietAgentError(genErrorDetail).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}


        {result && generating && (

          <Card className="glass-card" ref={resultRef}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <h3 className="font-bold text-sm">Gerando plano...</h3>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {result && !generating && (
          <div ref={resultRef} className="space-y-4">
            {/* Intent badge — what kind of generation produced this plan */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-0.5 ${
                lastIntent === 'regenerate'
                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-200'
                  : lastIntent === 'update'
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                    : 'border-primary/40 bg-primary/10 text-primary'
              }`}>
                {DIET_INTENT_LABELS[lastIntent].label}
              </span>
              {dietSimilarity?.changeKind && (
                <span className="rounded-full border border-muted-foreground/30 bg-muted/30 px-2 py-0.5 text-muted-foreground">
                  Tipo de mudança:{' '}
                  {dietSimilarity.changeKind === 'portion_only'
                    ? 'ajuste de quantidades'
                    : dietSimilarity.changeKind === 'menu_variation' || dietSimilarity.changeKind === 'new_menu'
                      ? 'variação real de cardápio'
                      : 'mista (quantidades + trocas)'}
                </span>
              )}
            </div>

            {/* Viability score card */}
            {viability && (() => {
              const v = describeViability(viability.score);
              const cls = v.level === 'ok'
                ? 'border-green-500/40 bg-green-500/10 text-green-200'
                : v.level === 'warn'
                  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
                  : 'border-red-500/40 bg-red-500/10 text-red-200';
              return (
                <div className={`rounded-xl border px-3 py-2 text-xs space-y-1 ${cls}`}>
                  <div className="font-semibold">{v.label}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 opacity-90">
                    <span>Aderência: <strong>{viability.breakdown.adherence}</strong></span>
                    <span>Praticidade: <strong>{viability.breakdown.practicality}</strong></span>
                    <span>Familiaridade: <strong>{viability.breakdown.familiarity}</strong></span>
                    <span>Complexidade: <strong>{viability.breakdown.complexity}</strong></span>
                    <span>Custo: <strong>{viability.breakdown.cost}</strong></span>
                  </div>
                  {viability.notes.length > 0 && (
                    <ul className="list-disc pl-4 opacity-80">
                      {viability.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              );
            })()}

            {pendingNewFoods.length > 0 && (
              <NewFoodsFromPlanCard
                candidates={pendingNewFoods}
                onDismissAll={() => setPendingNewFoods([])}
                onReplaceInPlan={(cand, existingName) => {
                  const target = normalizeFoodName(cand.name);
                  if (!target) return;
                  setPendingNewFoods((prev) => prev.filter((c) => normalizeFoodName(c.name) !== target));
                  setStructuredPlan((prev) => {
                    if (!prev) return prev;
                    const next: DietPlan = {
                      ...prev,
                      days: prev.days.map((d) => ({
                        ...d,
                        meals: (d.meals ?? []).map((m) => ({
                          ...m,
                          items: (m.items ?? []).map((it) =>
                            normalizeFoodName(it.name || '') === target
                              ? { ...it, name: existingName }
                              : it,
                          ),
                        })),
                      })),
                    };
                    try {
                      setResult(dietPlanToMarkdown(next));
                    } catch (e) {
                      console.warn('failed to re-serialize plan after swap', e);
                    }
                    return next;
                  });
                }}
                onRemoveFromPlan={(cand) => {
                  const target = normalizeFoodName(cand.name);
                  if (!target) return;
                  setPendingNewFoods((prev) => prev.filter((c) => normalizeFoodName(c.name) !== target));
                  setStructuredPlan((prev) => {
                    if (!prev) return prev;
                    const next: DietPlan = {
                      ...prev,
                      days: prev.days.map((d) => ({
                        ...d,
                        meals: (d.meals ?? []).map((m) => ({
                          ...m,
                          items: (m.items ?? []).filter(
                            (it) => normalizeFoodName(it.name || '') !== target,
                          ),
                        })),
                      })),
                    };
                    try {
                      setResult(dietPlanToMarkdown(next));
                    } catch (e) {
                      console.warn('failed to re-serialize plan after removal', e);
                    }
                    return next;
                  });
                  toast.info(`"${cand.name}" removido do plano`);
                }}
                onFoodLinked={async (cand, food) => {
                  // HOTFIX — vincula imediatamente o item do plano ao alimento
                  // recém-criado/reaproveitado, sem regerar a dieta.
                  if (!structuredPlan) return;
                  try {
                    const foodRecords = await loadFoodMacroRecords();
                    const linked = linkPlanItemsToFood<DietPlan>(
                      structuredPlan,
                      cand.name,
                      food,
                      foodRecords,
                    );
                    if (linked.changed) {
                      await applyCanonicalPlanUpdate(linked.plan);
                      toast.success(`"${food.name}" vinculado à dieta (${linked.resolvedCount} item(ns)).`);
                    }
                  } catch (e) {
                    console.warn('linkPlanItemsToFood failed', e);
                  }
                }}
              />
            )}
            {dietSimilarity && dietSimilarity.historyCount > 0 && (() => {
              const fb = describeSimilarity(dietSimilarity);
              const cls =
                fb.level === 'warn'
                  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
                  : 'border-primary/30 bg-primary/5 text-muted-foreground';
              return (
                <div className={`rounded-xl border px-3 py-2 text-xs ${cls}`}>
                  {fb.label}
                  {dietSimilarity.worstOverlap && dietSimilarity.worstOverlap.length > 0 && (
                    <div className="mt-1 opacity-80">
                      Alimentos repetidos: {dietSimilarity.worstOverlap.slice(0, 6).join(', ')}
                      {dietSimilarity.worstOverlap.length > 6 ? '…' : ''}
                    </div>
                  )}
                </div>
              );
            })()}
            {structuredPlan && (
              <UnresolvedFoodsPanel
                plan={structuredPlan}
                onChange={(p) => { void applyCanonicalPlanUpdate(p); }}
              />
            )}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                Plano Alimentar
                {/* Fase 4.2: em plano STRUCTURED o selo vem SEMPRE do relatório atual,
                    nunca de structuredPlan.validation (pode estar desatualizado). */}
                {hasUnresolvedItems ? (
                  <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-400 text-[10px]">
                    NÃO VALIDADO
                  </Badge>
                ) : structuredPlan ? (
                  (dayMacroReport ?? macroReport) && (
                    <Badge
                      variant="outline"
                      className={`ml-2 text-[10px] ${(dayMacroReport ?? macroReport)!.valid ? 'border-green-500/50 text-green-400' : 'border-yellow-500/50 text-yellow-400'}`}
                    >
                      {(dayMacroReport ?? macroReport)!.valid ? 'DIETA VALIDADA' : 'FORA DA META'}
                    </Badge>
                  )
                ) : null}
              </h3>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  title={DIET_INTENT_LABELS.update.desc}
                  onClick={() => { setResult(''); generatePlan({ intent: 'update' }); }}
                >
                  <SlidersHorizontal className="h-3 w-3 mr-1" /> Atualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  title={DIET_INTENT_LABELS.regenerate.desc}
                  onClick={() => { setResult(''); generatePlan({ intent: 'regenerate' }); }}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Regenerar
                </Button>
                <Button variant="outline" size="sm" onClick={() => generateDietPDF(result, studentName)}>
                  <FileDown className="h-3 w-3 mr-1" /> PDF
                </Button>
                {lastDietPlan && !editPlanId && (
                  <Button variant="outline" size="sm" onClick={() => setShowCompare(true)}>
                    <FileText className="h-3 w-3 mr-1" /> Comparar antes de salvar
                  </Button>
                )}
                 <Button size="sm" onClick={() => savePlan()} disabled={saving}>
                  <Save className="h-3 w-3 mr-1" /> {editPlanId ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </div>
            {dayMacroReport && (
              <Card className={`border ${dayMacroReport.valid ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/40 bg-yellow-500/5'}`}>
                <CardContent className="space-y-2 p-4 text-xs">
                  <div className="flex items-center gap-2">
                    {dayMacroReport.valid
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />}
                    <span className="font-bold text-sm">
                      {dayMacroReport.valid ? 'Todos os dias dentro da meta' : 'Há dias fora da meta'}
                    </span>
                  </div>
                  {WEEKDAY_KEYS.map((wd) => {
                    const d = dayMacroReport.days[wd];
                    if (!d) return null;
                    return (
                      <div key={wd} className="rounded-lg border border-border bg-background/60 p-2">
                        <p className="font-semibold">
                          {wd.toUpperCase()} · {(d.type ?? '').toUpperCase()}
                        </p>
                        <p className="text-muted-foreground">Meta: <strong className="text-foreground">{formatDayTargetLine(d.target)}</strong></p>
                        <p className="text-muted-foreground">Base: <strong className="text-foreground">{formatDayTargetLine(d.generated)}</strong></p>
                        <p className={d.valid ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                          {d.valid ? '✓ dentro da meta' : d.reasons.join(' ')}
                        </p>
                      </div>
                    );
                  })}
                  {dayMacroReport.missingDays.length > 0 && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      Dias sem cardápio correspondente: {dayMacroReport.missingDays.map((w) => w.toUpperCase()).join(', ')}.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {macroReport && !dayMacroReport && (
              <Card className={`border ${macroReport.valid ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/40 bg-yellow-500/5'}`}>
                <CardContent className="space-y-3 p-4 text-xs">
                  <div className="flex items-center gap-2">
                    {macroReport.valid
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />}
                    <span className="font-bold text-sm">
                      {macroReport.valid ? 'Dieta dentro da meta' : 'Dieta fora da meta'}
                    </span>
                  </div>
                  <div className="grid gap-1 text-muted-foreground sm:grid-cols-3">
                    <span>Meta: <strong className="text-foreground">{formatDietMacroLine(macroReport.target)}</strong></span>
                    <span>Calculado pela base alimentar: <strong className="text-foreground">{formatDietMacroLine(macroReport.generated)}</strong></span>
                    <span>Diferença: <strong className="text-foreground">{formatDietMacroLine(macroReport.difference)}</strong></span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Valor oficial: o cálculo pela base alimentar acima. Os números dentro das tabelas
                    ainda vêm do plano gerado e podem divergir até a próxima etapa.
                  </p>
                  {!macroReport.valid && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      Fora da meta. Pode ajustar automaticamente, regenerar ou salvar mesmo assim.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {structuredPlan ? (
                      <span className="text-[11px] text-muted-foreground self-center">
                        Ajuste de porções disponível no editor abaixo.
                      </span>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={adjustMacros} disabled={adjusting}>
                          {adjusting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <SlidersHorizontal className="h-3 w-3 mr-1" />}
                          Ajuste automático
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowMacroModal(true)}>
                          <Percent className="h-3 w-3 mr-1" /> Ajustar macros
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { setResult(''); generatePlan({ regenerateIntent: true }); }}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Regenerar dieta
                    </Button>
                    {lastDietPlan && !editPlanId && (
                      <Button variant="outline" size="sm" onClick={() => setShowCompare(true)}>
                        <FileText className="h-3 w-3 mr-1" /> Comparar com última dieta
                      </Button>
                    )}
                    {!macroReport.valid && (
                      <Button variant="secondary" size="sm" onClick={() => savePlan()}>
                        <Save className="h-3 w-3 mr-1" /> Salvar mesmo assim
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Fase 5: editor canônico (foodId + nutritionCore) com ajuste
                determinístico de porções. Planos legacy seguem no editor antigo. */}
            {structuredPlan && (
              <CanonicalDietEditor
                plan={structuredPlan}
                targetsByDay={structuredTargetsByDay}
                dayTypesByDay={(structuredPlan?.days ?? []).map((d: any) =>
                  carbCycling.enabled
                    ? (carbCycling.assignments?.[String(d?.weekday ?? '') as WeekdayKey] ?? null)
                    : null,
                )}
                onChange={(p) => { void applyCanonicalPlanUpdate(p); }}
              />
            )}
            {lastDietPlan && !editPlanId && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span>
                    <strong className="text-foreground">Última dieta salva:</strong>{' '}
                    <span className="text-muted-foreground">
                      {lastDietPlan.titulo} · {new Date(lastDietPlan.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowCompare(true)}>
                  Comparar antes de salvar
                </Button>
              </div>
            )}
            <DietResultCards markdown={result} />
          </div>
        )}

        <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dieta fora da meta</AlertDialogTitle>
              <AlertDialogDescription>
                Esta dieta está fora da meta calculada. Deseja salvar mesmo assim?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => savePlan()}>
                Salvar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {lastDietPlan && (
          <DietDraftComparisonDialog
            open={showCompare}
            onOpenChange={setShowCompare}
            current={{
              id: lastDietPlan.id,
              titulo: lastDietPlan.titulo,
              conteudo: lastDietPlan.conteudo,
              version: 1,
              created_at: lastDietPlan.created_at,
              ...(lastDietPlan.conteudo_json ? { conteudo_json: lastDietPlan.conteudo_json } as any : {}),
            }}
            draft={{
              id: 'draft',
              titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
              conteudo: result,
              version: 2,
              created_at: new Date().toISOString(),
              draft_source: 'manual',
            }}
            currentPlan={parseDietPlanLoose(lastDietPlan?.conteudo_json) ?? undefined}
            draftPlan={structuredPlan ?? undefined}
            rationale={studentCtx?.historico_processo?.motivos_decisao?.join(' ')}
            busy={saving}
            onPublish={async () => { await savePlan(); setShowCompare(false); }}
            onKeep={() => setShowCompare(false)}
            onDiscard={() => { setResult(''); setShowCompare(false); }}
          />
        )}

        {/* Modal Ajustar Macros por % */}
        <Dialog open={showMacroModal} onOpenChange={setShowMacroModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Ajustar macros por %</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {([
                { key: 'protein' as const, label: 'Proteína' },
                { key: 'carbs' as const, label: 'Carboidrato' },
                { key: 'fat' as const, label: 'Gordura' },
              ]).map(({ key, label }) => {
                const kcalTotal = macroReport?.target.calories ?? baseKcal.base_daily_kcal ?? 0;
                const kcalFromMacro = key === 'fat'
                  ? (kcalTotal * macroPct[key]) / 100
                  : (kcalTotal * macroPct[key]) / 100;
                const grams = key === 'fat' ? kcalFromMacro / 9 : kcalFromMacro / 4;
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{label}</Label>
                      <span className="text-sm font-bold text-primary">{macroPct[key]}% — {Math.round(grams)}g</span>
                    </div>
                    <Slider
                      value={[macroPct[key]]}
                      onValueChange={([v]) => setMacroPct(prev => ({ ...prev, [key]: v }))}
                      min={5}
                      max={70}
                      step={5}
                    />
                  </div>
                );
              })}
              <div className="text-xs text-muted-foreground text-center">
                Total: <strong className={macroPct.protein + macroPct.carbs + macroPct.fat === 100 ? 'text-green-500' : 'text-red-500'}>
                  {macroPct.protein + macroPct.carbs + macroPct.fat}%
                </strong> (deve ser 100%)
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={macroPct.protein + macroPct.carbs + macroPct.fat !== 100 || adjusting}
                onClick={async () => {
                  if (!macroReport || !result) return;
                  setAdjusting(true);
                  try {
                    const kcal = macroReport.target.calories;
                    const newTarget: DietMacroTargets = {
                      calories: kcal,
                      protein: Math.round((kcal * macroPct.protein / 100) / 4),
                      carbs: Math.round((kcal * macroPct.carbs / 100) / 4),
                      fats: Math.round((kcal * macroPct.fat / 100) / 9),
                    };
                    const sections = parseSections(result);
                    const meals: ParsedMeal[] = sections.flatMap(s => s.type === 'meal' ? (s.meals || []) : []);
                    if (meals.length === 0) { toast.error('Nenhuma refeição encontrada.'); return; }
                    const scaled = scaleMealsToMacroTargets(meals, {
                      kcal: newTarget.calories,
                      p: newTarget.protein,
                      c: newTarget.carbs,
                      g: newTarget.fats,
                    });
                    const adjusted = replaceMealTableInMarkdown(result, scaled);
                    const foodRecords = await loadFoodMacroRecords();
                    const report = validateDietMacros(adjusted, newTarget, foodRecords);
                    setMacroReport(report);
                    setResult(adjusted);
                    setShowMacroModal(false);
                    if (report.valid) toast.success('Macros ajustados com sucesso!');
                    else toast('Macros ajustados. Revise os valores.', { icon: '⚠️' });
                  } catch (e: any) {
                    toast.error(e.message || 'Erro ao ajustar');
                  } finally {
                    setAdjusting(false);
                  }
                }}
              >
                {adjusting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Percent className="h-4 w-4 mr-1" />}
                Aplicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default DietaIA;
