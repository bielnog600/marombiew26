import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, UtensilsCrossed, RotateCcw, Leaf, Pill, Zap, Clock, Target, SlidersHorizontal, FileDown, FileText, Plus, X } from 'lucide-react';
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
import { dietPlanToMarkdown } from '@/lib/dietMarkdownSerializer';
import { extractTrainingContext } from '@/lib/trainingContextExtractor';
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
import { buildCarbCyclePlan } from '@/lib/carbCycling';
import DietValidationBadge from '@/components/diet/DietValidationBadge';
import ReactMarkdown from 'react-markdown';
import DietResultCards from '@/components/DietResultCards';
import { generateDietPDF } from '@/lib/generateDietPDF';
import AiWizard from '@/components/AiWizard';
import DietDraftComparisonDialog from '@/components/consultoria/DietDraftComparisonDialog';
import { formatDietMacroLine, validateDietMacros, type DietMacroTargets, type DietMacroValidationReport, type FoodMacroRecord } from '@/lib/dietMacroValidation';
import { parseSections } from '@/lib/dietResultParser';
import { scaleMealsToTarget, scaleMealsToMacroTargets, replaceMealTableInMarkdown } from '@/lib/dietMarkdownSerializer';
import type { ParsedMeal } from '@/lib/dietResultParser';
import { Percent } from 'lucide-react';

type StudentCtx = Record<string, any>;

const ACTIVITY_LEVELS = [
  { value: '1.0', label: 'Sedentário', desc: 'Pouca ou nenhuma atividade no dia' },
  { value: '1.2', label: 'Super Leve', desc: 'Trabalho leve, caminhadas curtas' },
  { value: '1.4', label: 'Leve', desc: 'Trabalho em pé, atividades leves' },
  { value: '1.6', label: 'Moderado', desc: 'Trabalho ativo, se movimenta bastante' },
  { value: '1.8', label: 'Alto', desc: 'Trabalho físico pesado ou muito ativo' },
  { value: '2.0', label: 'Extremo', desc: 'Atleta profissional, treina 2x/dia' },
];

const STRATEGIES = [
  { value: 'deficit_leve', label: 'Déficit Leve (-10%)', desc: 'Emagrecimento gradual, preserva massa', pct: -10 },
  { value: 'deficit_moderado', label: 'Déficit Moderado (-20%)', desc: 'Emagrecimento acelerado', pct: -20 },
  { value: 'deficit_agressivo', label: 'Déficit Agressivo (-30%)', desc: 'Perda rápida, mais restritivo', pct: -30 },
  { value: 'manutencao', label: 'Manutenção (0%)', desc: 'Manter peso e composição', pct: 0 },
  { value: 'superavit_leve', label: 'Superávit Leve (+10%)', desc: 'Lean bulk — ganho limpo', pct: 10 },
  { value: 'superavit_moderado', label: 'Superávit Moderado (+20%)', desc: 'Bulk agressivo', pct: 20 },
];

const MEAL_COUNTS = [
  { value: '4', label: '4 refeições' },
  { value: '5', label: '5 refeições' },
  { value: '6', label: '6 refeições' },
  { value: '7', label: '7 refeições' },
];

const DIET_STYLES = [
  { value: 'flexivel', label: 'Flexível (IIFYM)', desc: 'Foco nos macros, liberdade de escolha dos alimentos' },
  { value: 'low_carb', label: 'Low Carb', desc: 'Redução significativa de carboidratos' },
  { value: 'cetogenica', label: 'Cetogênica', desc: 'Ultra low carb, alto em gorduras' },
  { value: 'mediterranea', label: 'Mediterrânea', desc: 'Baseada em azeite, peixes, grãos integrais' },
  { value: 'paleolitica', label: 'Paleolítica', desc: 'Alimentos naturais, sem processados' },
  { value: 'vegetariana', label: 'Vegetariana', desc: 'Sem carnes, permite ovos/laticínios' },
  { value: 'vegana', label: 'Vegana', desc: 'Sem alimentos de origem animal' },
  { value: 'convencional', label: 'Convencional', desc: 'Dieta tradicional balanceada' },
];

const PHASES = [
  { value: 'bulking', label: 'Bulking', desc: 'Fase de ganho de massa' },
  { value: 'cutting', label: 'Cutting', desc: 'Fase de definição' },
  { value: 'manutencao', label: 'Manutenção', desc: 'Manter composição corporal' },
  { value: 'recomposicao', label: 'Recomposição', desc: 'Perder gordura e ganhar massa simultaneamente' },
  { value: 'pre_contest', label: 'Pré-Contest', desc: 'Preparação para competição' },
];

const TRAINING_TIMES = [
  { value: 'manha_jejum', label: 'Manhã (jejum)' },
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
  { value: 'madrugada', label: 'Madrugada' },
];

const TRAINING_DAYS_OPTIONS = [
  { value: '3', label: '3x/semana' },
  { value: '4', label: '4x/semana' },
  { value: '5', label: '5x/semana' },
  { value: '6', label: '6x/semana' },
  { value: '7', label: 'Todos os dias' },
];

const RESTRICTION_OPTIONS = [
  'Sem lactose', 'Sem glúten', 'Sem frutos do mar', 'Sem carne vermelha',
  'Sem porco', 'Vegetariano', 'Vegano', 'Sem ovo', 'Sem soja',
  'Diabético', 'Hipertenso', 'Intolerância à frutose', 'Alergia a amendoim',
];

const PREFERENCE_OPTIONS = [
  'Frango', 'Carne vermelha', 'Peixe', 'Ovos', 'Arroz integral',
  'Batata doce', 'Aveia', 'Whey no shake', 'Frutas', 'Pasta de amendoim',
  'Iogurte', 'Queijo cottage', 'Tapioca', 'Macarrão integral', 'Abacate',
];

const PROTOCOL_ADJUSTMENTS = [
  { id: 'calorie_adjust', label: 'Ajuste de Calorias', desc: 'Aumento ou redução calórica semanal', icon: SlidersHorizontal },
  { id: 'carb_adjust', label: 'Ajuste de Carboidrato', desc: 'Manipulação de carbs por dia da semana', icon: SlidersHorizontal },
  { id: 'sodium_adjust', label: 'Ajuste de Sódio', desc: 'Protocolo de manipulação de sódio', icon: SlidersHorizontal },
  { id: 'water_adjust', label: 'Ajuste de Água', desc: 'Protocolo de ingestão hídrica', icon: SlidersHorizontal },
  { id: 'meal_change', label: 'Mudança de Refeições', desc: 'Alterar número/distribuição de refeições', icon: SlidersHorizontal },
  { id: 'plato', label: 'Estratégia para Platô', desc: 'Quebrar estagnação metabólica', icon: Target },
  { id: 'refeed', label: 'Refeed', desc: 'Dias de recarga de carboidrato', icon: Zap },
  { id: 'diet_break', label: 'Diet Break', desc: 'Pausa programada na dieta', icon: Clock },
  { id: 'carb_cycling', label: 'Carb Cycling', desc: 'Ciclagem de carboidrato (high/medium/low)', icon: SlidersHorizontal },
];

const hasHormoneUse = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return !['não', 'nao', 'natural', 'false', '0', 'n'].includes(normalized);
};

const calculateMacroTargets = ({
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

  if (hormoneUse) proteinPerKg = Math.min(proteinPerKg + 0.2, proteinMax);
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

const DietaIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPlanId = searchParams.get('edit');

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
  const [result, setResult] = useState('');
  const [macroReport, setMacroReport] = useState<DietMacroValidationReport | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [macroPct, setMacroPct] = useState({ protein: 20, carbs: 50, fat: 30 });
  const [lastDietPlan, setLastDietPlan] = useState<any>(null);
  const [showCompare, setShowCompare] = useState(false);
  // Canonical structured plan (source of truth when structured generation succeeds).
  const [structuredPlan, setStructuredPlan] = useState<DietPlan | null>(null);
  // Variability controls + feedback (mirrors TreinoIA).
  const [variationIntensity, setVariationIntensity] = useState<DietVariationIntensity>(DEFAULT_DIET_INTENSITY);
  const [dietSimilarity, setDietSimilarity] = useState<SimilarityFeedback | null>(null);
  // Generation intent (new | update | regenerate). "new" is the default fresh path.
  const [lastIntent, setLastIntent] = useState<DietIntent>('new');
  // Viability score computed after structured generation.
  const [viability, setViability] = useState<{ score: number; breakdown: ViabilityBreakdown; notes: string[] } | null>(null);
  // Phase 2: g/kg overrides (optional). When null, defaults from phase/strategy are used.
  const [proteinPerKgOverride, setProteinPerKgOverride] = useState<string>('');
  const [fatPerKgOverride, setFatPerKgOverride] = useState<string>('');
  // Phase 2: enable structured carb cycling alongside the protocol checkbox.

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (editPlanId && studentId) loadEditPlan();
  }, [editPlanId]);

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
        }
      }
    }
  };

  useEffect(() => {
    if (result && resultRef.current) resultRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  const loadStudentData = async () => {
    setLoading(true);
    const [profileRes, spRes, assessRes, questRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('assessments').select('id').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
      supabase.from('diet_questionnaires').select('*').eq('student_id', studentId!).eq('status', 'completed').order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;
    const latestQuestionnaire = questRes.data?.[0] || null;

    let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null;
    let photos: any[] = [];
    let skinfolds: any = null, perfTests: any = null, posture: any = null;

    // Also fetch posture scans and HR zones (not assessment-dependent)
    const [postureScansRes, hrZonesRes] = await Promise.all([
      supabase.from('posture_scans').select('*').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
      supabase.from('hr_zones').select('*').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
    ]);
    const latestPostureScan = postureScansRes.data?.[0] || null;
    const latestHrZones = hrZonesRes.data?.[0] || null;

    if (latestAssessmentId) {
      const [anthroRes, compRes, vitalsRes, anRes, photosRes, skinRes, perfRes, postureRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('assessment_photos').select('*').eq('assessment_id', latestAssessmentId),
        supabase.from('skinfolds').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('posture').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      ]);
      anthro = anthroRes.data;
      comp = compRes.data;
      vitals = vitalsRes.data;
      anamnese = anRes.data;
      photos = photosRes.data ?? [];
      skinfolds = skinRes.data;
      perfTests = perfRes.data;
      posture = postureRes.data;
    }

    // ── HISTÓRICO LONGITUDINAL: última dieta, tendência, aderência, reajuste ──
    const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [lastDietRes, trendAssessRes, trackingRes, lastReadjustRes] = await Promise.all([
      supabase
        .from('ai_plans')
        .select('id, titulo, fase, conteudo, created_at, protocols')
        .eq('student_id', studentId!)
        .eq('tipo', 'dieta')
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('assessments')
        .select('id, created_at')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('daily_tracking')
        .select('date, meals_completed, water_glasses, workout_completed')
        .eq('student_id', studentId!)
        .gte('date', since14)
        .order('date', { ascending: false }),
      supabase
        .from('diet_readjustments')
        .select('*')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    // Última dieta — extrai resumo
    const lastDiet = lastDietRes.data?.[0] || null;
    setLastDietPlan(lastDiet);
    let ultima_dieta: any = null;
    if (lastDiet) {
      const c = lastDiet.conteudo || '';
      const grab = (re: RegExp) => {
        const m = c.match(re);
        return m ? Number(m[1].replace(/[^\d.]/g, '')) || null : null;
      };
      const totalKcal =
        grab(/total\s+di[áa]rio[^\n]*?(\d{3,5})\s*kcal/i) ||
        grab(/calorias?\s*(?:totais|alvo|consumo)?[:\s]+(\d{3,5})/i);
      const totalP = grab(/prote[íi]na[^\n]*?(\d{2,4})\s*g/i);
      const totalC = grab(/carboidrato[^\n]*?(\d{2,4})\s*g/i);
      const totalG = grab(/gordura[^\n]*?(\d{2,4})\s*g/i);
      const mealMatches = c.match(/(?:caf[eé]\s+da\s+manh[ãa]|almo[çc]o|jantar|lanche|ceia|p[óo]s[\s-]?treino|pr[eé][\s-]?treino)/gi) || [];
      const numRef = new Set(mealMatches.map(m => m.toLowerCase())).size;
      const dias = Math.floor((Date.now() - new Date(lastDiet.created_at).getTime()) / 86400000);
      ultima_dieta = {
        titulo: lastDiet.titulo,
        fase: lastDiet.fase,
        criada_em: lastDiet.created_at,
        dias_desde: dias,
        kcal_total: totalKcal,
        proteina_g: totalP,
        carbs_g: totalC,
        gordura_g: totalG,
        num_refeicoes: numRef || null,
        excerto: c.slice(0, 1800),
      };
    }

    // Tendência de peso/composição (últimas 3-4 avaliações)
    let tendencia_peso: any = null;
    const trendIds = (trendAssessRes.data || []).map(a => a.id);
    if (trendIds.length >= 1) {
      const [anthArr, compArr] = await Promise.all([
        supabase.from('anthropometrics').select('assessment_id, peso, cintura').in('assessment_id', trendIds),
        supabase.from('composition').select('assessment_id, percentual_gordura, massa_magra').in('assessment_id', trendIds),
      ]);
      const byAssId: Record<string, any> = {};
      (trendAssessRes.data || []).forEach(a => { byAssId[a.id] = { data: a.created_at }; });
      (anthArr.data || []).forEach(r => { Object.assign(byAssId[r.assessment_id] || {}, { peso: r.peso, cintura: r.cintura }); });
      (compArr.data || []).forEach(r => { Object.assign(byAssId[r.assessment_id] || {}, { percentual_gordura: r.percentual_gordura, massa_magra: r.massa_magra }); });
      const historico = trendIds.map(id => byAssId[id]).filter(x => x && x.peso != null);
      let direcao = 'estavel';
      let variacao_kg = 0;
      let intervalo_dias = 0;
      let velocidade_kg_semana = 0;
      let relevancia: 'irrelevante' | 'leve' | 'moderada' | 'alta' = 'irrelevante';
      if (historico.length >= 2) {
        variacao_kg = Number(historico[0].peso) - Number(historico[historico.length - 1].peso);
        const dRecent = new Date(historico[0].data).getTime();
        const dOldest = new Date(historico[historico.length - 1].data).getTime();
        intervalo_dias = Math.max(1, Math.round((dRecent - dOldest) / 86400000));
        velocidade_kg_semana = Number(((variacao_kg / intervalo_dias) * 7).toFixed(2));
        const pesoBase = Number(historico[historico.length - 1].peso) || 70;
        const pctVar = Math.abs(variacao_kg) / pesoBase;
        if (pctVar < 0.005) relevancia = 'irrelevante';
        else if (pctVar < 0.015) relevancia = 'leve';
        else if (pctVar < 0.04) relevancia = 'moderada';
        else relevancia = 'alta';
        if (variacao_kg > 0.5) direcao = 'subindo';
        else if (variacao_kg < -0.5) direcao = 'descendo';
      }
      tendencia_peso = {
        peso_atual: historico[0]?.peso ?? anthro?.peso ?? null,
        variacao_kg: Number(variacao_kg.toFixed(2)),
        direcao,
        intervalo_dias,
        velocidade_kg_semana,
        relevancia,
        historico,
      };
    }

    // Aderência 14 dias
    let aderencia_recente: any = null;
    const tracking = trackingRes.data || [];
    if (tracking.length > 0) {
      const totalRef = tracking.reduce((s, d: any) => s + (Array.isArray(d.meals_completed) ? d.meals_completed.length : 0), 0);
      const expectedPerDay = lastDiet ? (ultima_dieta?.num_refeicoes || 5) : 5;
      const expectedTotal = 14 * expectedPerDay;
      const aguaMedia = tracking.reduce((s, d: any) => s + (d.water_glasses || 0), 0) / tracking.length;
      // Consistência por índice de refeição (qual refeição é mais marcada/falhada)
      const consistencia_por_refeicao: Record<number, number> = {};
      for (let i = 0; i < expectedPerDay; i++) consistencia_por_refeicao[i] = 0;
      for (const d of tracking as any[]) {
        const arr = Array.isArray(d.meals_completed) ? d.meals_completed : [];
        for (const idx of arr) {
          const n = Number(idx);
          if (Number.isInteger(n) && n >= 0 && n < expectedPerDay) {
            consistencia_por_refeicao[n] = (consistencia_por_refeicao[n] || 0) + 1;
          }
        }
      }
      const refeicoes_mais_falhadas = Object.entries(consistencia_por_refeicao)
        .map(([idx, c]) => ({ indice: Number(idx), marcadas: c, falhadas: tracking.length - c }))
        .sort((a, b) => b.falhadas - a.falhadas)
        .slice(0, 3);
      aderencia_recente = {
        dias_com_registro: tracking.length,
        dias_total: 14,
        dias_com_registro_pct: Math.round((tracking.length / 14) * 100),
        refeicoes_marcadas: totalRef,
        refeicoes_esperadas: expectedTotal,
        percentual_aderencia: Math.round((totalRef / expectedTotal) * 100),
        agua_media_copos_dia: Number(aguaMedia.toFixed(1)),
        consistencia_por_refeicao,
        refeicoes_mais_falhadas,
      };
    }

    // Último reajuste
    let ultimo_reajuste: any = null;
    const lr = lastReadjustRes.data?.[0];
    if (lr) {
      const sintomas: string[] = [];
      if (lr.fome_excessiva) sintomas.push('fome excessiva');
      if (lr.insonia) sintomas.push('insônia');
      if (!lr.energia_ok) sintomas.push('energia baixa');
      if (!lr.humor_ok) sintomas.push('humor instável');
      if (!lr.intestino_ok) sintomas.push('desconforto intestinal');
      if (lr.perdeu_peso) sintomas.push('perdeu peso');
      if (lr.ganhou_massa) sintomas.push('ganhou massa');
      ultimo_reajuste = {
        data: lr.created_at,
        peso_atual: lr.peso_atual,
        sintomas,
        rendimento_treino: lr.rendimento_treino,
        satisfacao: lr.satisfacao,
        observacoes: lr.observacoes,
      };
    }

    // Score de confiança explicável (com fatores positivos e negativos)
    type Factor = { key: string; label: string; weight: number; status: 'positive' | 'negative' | 'neutral' };
    const factors: Factor[] = [];
    let score = 0;
    if (ultima_dieta) { factors.push({ key: 'last_diet', label: 'Dieta anterior encontrada', weight: 25, status: 'positive' }); score += 25; }
    else factors.push({ key: 'last_diet', label: 'Sem dieta anterior — geração inicial', weight: 0, status: 'neutral' });
    if (tendencia_peso && tendencia_peso.historico?.length >= 2) {
      factors.push({ key: 'weight_trend', label: `Tendência de peso disponível (${tendencia_peso.historico.length} avaliações em ${tendencia_peso.intervalo_dias}d)`, weight: 25, status: 'positive' });
      score += 25;
    } else {
      factors.push({ key: 'weight_trend', label: 'Tendência de peso indisponível (avaliações insuficientes)', weight: 0, status: 'negative' });
    }
    if (aderencia_recente && aderencia_recente.dias_com_registro >= 7) {
      factors.push({ key: 'adherence', label: `Aderência recente suficiente (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 25, status: 'positive' });
      score += 25;
    } else if (aderencia_recente && aderencia_recente.dias_com_registro >= 3) {
      factors.push({ key: 'adherence', label: `Aderência parcial (${aderencia_recente.dias_com_registro}/14 dias)`, weight: 10, status: 'neutral' });
      score += 10;
    } else {
      factors.push({ key: 'adherence', label: 'Sem aderência registrada nos últimos 14 dias', weight: 0, status: 'negative' });
    }
    if (ultimo_reajuste) { factors.push({ key: 'readjustment', label: 'Último reajuste/feedback encontrado', weight: 15, status: 'positive' }); score += 15; }
    else factors.push({ key: 'readjustment', label: 'Sem reajuste anterior registrado', weight: 0, status: 'neutral' });
    if (latestQuestionnaire) { factors.push({ key: 'questionnaire', label: 'Questionário de dieta recente', weight: 10, status: 'positive' }); score += 10; }
    else factors.push({ key: 'questionnaire', label: 'Sem questionário recente respondido', weight: 0, status: 'negative' });

    // Heurística de decisão recomendada (a IA pode override, mas isso vira input forte)
    let decisao_recomendada: 'manter' | 'ajustar' | 'nova' | 'pedir_dados' = 'nova';
    const motivos_decisao: string[] = [];
    if (!ultima_dieta) {
      decisao_recomendada = 'nova';
      motivos_decisao.push('Nenhuma dieta anterior — gerar do zero.');
    } else {
      const adesaoBaixa = aderencia_recente && aderencia_recente.percentual_aderencia < 60;
      const sintomasNeg = !!(ultimo_reajuste?.sintomas?.some((s: string) => /fome|insônia|insonia|energia baixa|humor/i.test(s)));
      const tendenciaContraria = tendencia_peso?.relevancia === 'alta' || tendencia_peso?.relevancia === 'moderada';
      const reajusteRecente = ultimo_reajuste && (Date.now() - new Date(ultimo_reajuste.data).getTime()) / 86400000 < 21;

      if (adesaoBaixa) { motivos_decisao.push('Aderência <60% — simplificar.'); decisao_recomendada = 'ajustar'; }
      if (sintomasNeg) { motivos_decisao.push('Sintomas negativos no último reajuste — revisar.'); decisao_recomendada = 'ajustar'; }
      if (tendenciaContraria) { motivos_decisao.push(`Tendência ${tendencia_peso.direcao} relevante (${tendencia_peso.velocidade_kg_semana}kg/sem) — calibrar.`); decisao_recomendada = 'ajustar'; }
      if (!adesaoBaixa && !sintomasNeg && !tendenciaContraria) {
        decisao_recomendada = 'manter';
        motivos_decisao.push('Sem variação relevante — preservar estrutura anterior.');
      }
      if (reajusteRecente && ultimo_reajuste?.satisfacao && /ruim|insatisf/i.test(String(ultimo_reajuste.satisfacao))) {
        decisao_recomendada = 'nova';
        motivos_decisao.push('Aluno insatisfeito no último reajuste — repensar plano.');
      }
    }

    const confianca = { score: Math.min(score, 100), factors, motivos: factors.filter(f => f.status === 'positive').map(f => f.label) };

    const ctx: StudentCtx = {
      nome: profile?.nome, sexo: sp?.sexo, data_nascimento: sp?.data_nascimento,
      raca: sp?.raca,
      altura: sp?.altura || anthro?.altura, objetivo: sp?.objetivo,
      restricoes: sp?.restricoes, lesoes: sp?.lesoes, observacoes: sp?.observacoes,
      peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
      quadril: anthro?.quadril, rcq: anthro?.rcq,
      // All anthropometric measurements
      antropometria_completa: anthro ? {
        pescoco: anthro.pescoco, torax: anthro.torax, ombro: anthro.ombro,
        abdomen: anthro.abdomen, braco_direito: anthro.braco_direito,
        braco_esquerdo: anthro.braco_esquerdo, antebraco: anthro.antebraco,
        antebraco_esquerdo: anthro.antebraco_esquerdo,
        biceps_contraido_direito: anthro.biceps_contraido_direito,
        biceps_contraido_esquerdo: anthro.biceps_contraido_esquerdo,
        coxa_direita: anthro.coxa_direita, coxa_esquerda: anthro.coxa_esquerda,
        panturrilha_direita: anthro.panturrilha_direita, panturrilha_esquerda: anthro.panturrilha_esquerda,
      } : null,
      percentual_gordura: comp?.percentual_gordura,
      massa_magra: comp?.massa_magra, massa_gorda: comp?.massa_gorda,
      composicao_obs: comp?.observacoes,
      // Skinfolds
      dobras_cutaneas: skinfolds ? {
        metodo: skinfolds.metodo, triceps: skinfolds.triceps, subescapular: skinfolds.subescapular,
        suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal,
        peitoral: skinfolds.peitoral, axilar_media: skinfolds.axilar_media, coxa: skinfolds.coxa,
      } : null,
      // Vitals
      sinais_vitais: vitals ? {
        fc_repouso: vitals.fc_repouso, pressao: vitals.pressao,
        spo2: vitals.spo2, glicemia: vitals.glicemia, observacoes: vitals.observacoes,
      } : null,
      fc_repouso: vitals?.fc_repouso,
      // Performance tests
      testes_performance: perfTests ? {
        pushup: perfTests.pushup, plank: perfTests.plank, cooper_12min: perfTests.cooper_12min,
        salto_vertical: perfTests.salto_vertical, agachamento_score: perfTests.agachamento_score,
        mobilidade_ombro: perfTests.mobilidade_ombro, mobilidade_quadril: perfTests.mobilidade_quadril,
        mobilidade_tornozelo: perfTests.mobilidade_tornozelo, observacoes: perfTests.observacoes,
      } : null,
      // Posture (from assessment)
      postura: posture ? {
        vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral,
        vista_posterior: posture.vista_posterior, observacoes: posture.observacoes,
      } : null,
      // Posture scan (latest)
      analise_postural: latestPostureScan ? {
        angles: latestPostureScan.angles_json, region_scores: latestPostureScan.region_scores_json,
        attention_points: latestPostureScan.attention_points_json, notes: latestPostureScan.notes,
      } : null,
      // HR zones
      zonas_fc: latestHrZones ? {
        fc_repouso: latestHrZones.fc_repouso, fcmax: latestHrZones.fcmax_estimada,
        formula: latestHrZones.fcmax_formula, zonas: latestHrZones.zonas_karvonen,
      } : null,
      anamnese: anamnese ? {
        historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao,
        suplementos: anamnese.suplementos, sono: anamnese.sono, stress: anamnese.stress,
        rotina: anamnese.rotina, treino_atual: anamnese.treino_atual,
        dores: anamnese.dores, cirurgias: anamnese.cirurgias,
        tabagismo: anamnese.tabagismo, alcool: anamnese.alcool,
      } : null,
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
      // ── HISTÓRICO LONGITUDINAL ──
      historico_processo: {
        ultima_dieta,
        tendencia_peso,
        aderencia_recente,
        ultimo_reajuste,
        confianca_geracao: confianca,
        decisao_recomendada,
        motivos_decisao,
      },
      questionario_dieta: latestQuestionnaire ? {
        estilo_dieta: latestQuestionnaire.estilo_dieta,
        fase_atual: latestQuestionnaire.fase_atual,
        num_refeicoes: latestQuestionnaire.num_refeicoes,
        horario_treino: latestQuestionnaire.horario_treino,
        dias_treino: latestQuestionnaire.dias_treino,
        usa_hormonios: latestQuestionnaire.usa_hormonios,
        restricoes_alimentares: latestQuestionnaire.restricoes_alimentares,
        preferencias_alimentares: latestQuestionnaire.preferencias_alimentares,
        alimentos_por_refeicao: latestQuestionnaire.alimentos_por_refeicao,
        como_se_sente: latestQuestionnaire.como_se_sente,
        fraqueza: latestQuestionnaire.fraqueza,
        dor_cabeca: latestQuestionnaire.dor_cabeca,
        reduziu_peso: latestQuestionnaire.reduziu_peso,
        pele_fina: latestQuestionnaire.pele_fina,
        fome_excessiva: latestQuestionnaire.fome_excessiva,
        insonia: latestQuestionnaire.insonia,
        baixa_energia: latestQuestionnaire.baixa_energia,
        irritabilidade: latestQuestionnaire.irritabilidade,
        observacoes: latestQuestionnaire.observacoes,
        respondido_em: latestQuestionnaire.responded_at,
      } : null,
    };

    setStudentCtx(ctx);
    setStudentName(profile?.nome || 'Aluno');

    // Pre-fill from questionnaire (only fields NOT handled by recommendation block)
    if (latestQuestionnaire) {
      if (latestQuestionnaire.num_refeicoes) setMealCount(String(latestQuestionnaire.num_refeicoes));
      if (latestQuestionnaire.horario_treino) {
        const timeMap: Record<string, string> = { '05:00': 'manha', '06:00': 'manha', '07:00': 'manha', '08:00': 'manha', '09:00': 'manha', '10:00': 'manha', '11:00': 'manha', '12:00': 'tarde', '13:00': 'tarde', '14:00': 'tarde', '15:00': 'tarde', '16:00': 'tarde', '17:00': 'noite', '18:00': 'noite', '19:00': 'noite', '20:00': 'noite', '21:00': 'noite', '22:00': 'madrugada' };
        if (timeMap[latestQuestionnaire.horario_treino]) setTrainingTime(timeMap[latestQuestionnaire.horario_treino]);
      }
      if (latestQuestionnaire.dias_treino) {
        const days = latestQuestionnaire.dias_treino.replace('x', '');
        if (['3','4','5','6','7'].includes(days)) setTrainingDays(days);
      }
      if (latestQuestionnaire.restricoes_alimentares) setCustomRestriction(latestQuestionnaire.restricoes_alimentares);
      if (latestQuestionnaire.preferencias_alimentares) setCustomPreference(latestQuestionnaire.preferencias_alimentares);
      if (latestQuestionnaire.usa_hormonios) {
        const uh = latestQuestionnaire.usa_hormonios;
        if (uh === 'Não' || uh === 'não' || uh === 'Natural') setUsesHormones(false);
        else { setUsesHormones(true); setHormoneDetails(uh); }
      }
    }

    // ── Compute AI recommendation based on all student data ──
    const peso = anthro?.peso ? Number(anthro.peso) : null;
    const altura = sp?.altura || anthro?.altura ? Number(sp?.altura || anthro?.altura) : null;
    const bf = comp?.percentual_gordura ? Number(comp.percentual_gordura) : null;
    const mlg = comp?.massa_magra ? Number(comp.massa_magra) : null;
    const isMale = sp?.sexo === 'masculino';
    let birthAge: number | null = null;
    if (sp?.data_nascimento) {
      birthAge = Math.floor((Date.now() - new Date(sp.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    }

    if (peso && altura && birthAge) {
      // Calculate TMB by multiple formulas
      const harrisBenedict = isMale
        ? 66.47 + 13.75 * peso + 5.003 * altura - 6.755 * birthAge
        : 655.1 + 9.563 * peso + 1.85 * altura - 4.676 * birthAge;
      const mifflin = isMale
        ? 10 * peso + 6.25 * altura - 5 * birthAge + 5
        : 10 * peso + 6.25 * altura - 5 * birthAge - 161;
      const _faoOms = isMale ? 15.3 * peso + 679 : 14.7 * peso + 496;
      const cunningham = mlg ? 500 + 22 * mlg : null;
      const _tinsleyMlg = mlg ? 25.9 * mlg + 284 : null;
      const _tinsleyPeso = 24.8 * peso + 10;

      // Choose best formula
      let bestTmb: number;
      let bestFormula: string;
      if (bf !== null && bf < (isMale ? 15 : 22) && mlg && cunningham) {
        bestTmb = cunningham;
        bestFormula = 'Cunningham (atleta, baixo %G)';
      } else if (bf !== null && bf > (isMale ? 25 : 32)) {
        bestTmb = mifflin;
        bestFormula = 'Mifflin (sobrepeso/obeso)';
      } else {
        bestTmb = harrisBenedict;
        bestFormula = 'Harris-Benedict (eutrófico)';
      }

      // Auto-suggest strategy based on body composition + objective + questionnaire symptoms
      let suggestedStrategy = 'manutencao';
      let suggestedPhase = 'manutencao';
      let suggestedDietStyle = 'convencional';

      if (bf !== null) {
        if ((isMale && bf > 20) || (!isMale && bf > 28)) { suggestedStrategy = 'deficit_moderado'; suggestedPhase = 'cutting'; }
        else if ((isMale && bf < 12) || (!isMale && bf < 18)) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
      }
      // Override from objective
      const obj = (sp?.objetivo || '').toLowerCase();
      if (obj.includes('emagrec') || obj.includes('perd') || obj.includes('defin')) { suggestedStrategy = 'deficit_leve'; suggestedPhase = 'cutting'; }
      if (obj.includes('hipertrofia') || obj.includes('massa') || obj.includes('ganho')) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
      if (obj.includes('recomp')) { suggestedStrategy = 'manutencao'; suggestedPhase = 'recomposicao'; }
      // Override from questionnaire phase
      if (latestQuestionnaire?.fase_atual) {
        const fase = latestQuestionnaire.fase_atual.toLowerCase();
        if (fase.includes('bulk')) { suggestedStrategy = 'superavit_leve'; suggestedPhase = 'bulking'; }
        if (fase.includes('cut')) { suggestedStrategy = 'deficit_moderado'; suggestedPhase = 'cutting'; }
        if (fase.includes('recomp')) { suggestedStrategy = 'manutencao'; suggestedPhase = 'recomposicao'; }
        if (fase.includes('manutenção') || fase.includes('manut')) { suggestedPhase = 'manutencao'; }
        if (fase.includes('pré-contest') || fase.includes('pre_contest') || fase.includes('contest')) { suggestedPhase = 'pre_contest'; suggestedStrategy = 'deficit_agressivo'; }
      }
      // Diet style from questionnaire
      if (latestQuestionnaire?.estilo_dieta) {
        const estiloMap: Record<string, string> = { 'Flexível (IIFYM)': 'flexivel', 'Low Carb': 'low_carb', 'Cetogênica': 'cetogenica', 'Mediterrânea': 'mediterranea', 'Paleolítica': 'paleolitica', 'Vegetariana': 'vegetariana', 'Vegana': 'vegana', 'Convencional': 'convencional' };
        suggestedDietStyle = estiloMap[latestQuestionnaire.estilo_dieta] || suggestedDietStyle;
      }
      // If cutting + high BF, suggest low carb
      if (suggestedPhase === 'cutting' && bf !== null && bf > (isMale ? 25 : 32) && !latestQuestionnaire?.estilo_dieta) {
        suggestedDietStyle = 'low_carb';
      }
      // Check symptoms: if low energy/weakness, ease up deficit
      if (latestQuestionnaire && (latestQuestionnaire.baixa_energia || latestQuestionnaire.fraqueza)) {
        if (suggestedStrategy === 'deficit_agressivo') suggestedStrategy = 'deficit_moderado';
        else if (suggestedStrategy === 'deficit_moderado') suggestedStrategy = 'deficit_leve';
      }

      if (!strategy) setStrategy(suggestedStrategy);
      if (!phase) setPhase(suggestedPhase);
      if (!dietStyle) setDietStyle(suggestedDietStyle);

      // Auto-suggest activity level from training days
      const tDays = Number(trainingDays || latestQuestionnaire?.dias_treino?.replace('x', '') || 0);
      let suggestedFA = 1.4;
      if (tDays >= 6) suggestedFA = 1.8;
      else if (tDays >= 5) suggestedFA = 1.6;
      else if (tDays >= 3) suggestedFA = 1.4;
      else suggestedFA = 1.2;
      // If anamnese shows active routine, bump
      if (anamnese?.rotina && (anamnese.rotina.toLowerCase().includes('pesado') || anamnese.rotina.toLowerCase().includes('físico'))) {
        suggestedFA = Math.min(suggestedFA + 0.2, 2.0);
      }
      if (!activityLevel) setActivityLevel(String(suggestedFA));

      const strategyPct = STRATEGIES.find(s => s.value === suggestedStrategy)?.pct ?? 0;
      const get = bestTmb * suggestedFA;
      const consumo = get * (1 + strategyPct / 100);

      const macros = calculateMacroTargets({
        calories: consumo,
        weight: peso,
        strategyValue: suggestedStrategy,
        phaseValue: suggestedPhase,
        hormoneUse: hasHormoneUse(latestQuestionnaire?.usa_hormonios),
      });

      ctx.recomendacao_ia = {
        tmb: Math.round(bestTmb),
        formula: bestFormula,
        fa: suggestedFA,
        get: Math.round(get),
        consumo: Math.round(consumo),
        estrategia: suggestedStrategy,
        proteina_g: macros.proteinGrams,
        carboidrato_g: macros.carbGrams,
        gordura_g: macros.fatGrams,
        proteina_kg: macros.proteinPerKg,
        gordura_kg: macros.fatPerKg,
        calorias_total: Math.round(consumo),
      };
      setStudentCtx({ ...ctx });
    } else {
      // Basic fallback - only strategy from BF
      if (bf !== null && !strategy) {
        if ((isMale && bf > 20) || (!isMale && bf > 28)) setStrategy('deficit_moderado');
        else if ((isMale && bf < 12) || (!isMale && bf < 18)) setStrategy('superavit_leve');
        else setStrategy('manutencao');
      }
    }

    // Pre-fill restrictions from profile (only if no questionnaire)
    if (!latestQuestionnaire && sp?.restricoes) setCustomRestriction(sp.restricoes);

    setLoading(false);
  };

  const toggleAdjustment = (id: string) => {
    setSelectedAdjustments(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
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

  const getRestrictionsText = () => {
    const parts = [...selectedRestrictions];
    if (customRestriction.trim()) parts.push(customRestriction.trim());
    return parts.join(', ');
  };

  const getPreferencesText = () => {
    const parts = [...selectedPreferences];
    if (customPreference.trim()) parts.push(customPreference.trim());
    return parts.join(', ');
  };

  const canGenerate = activityLevel && strategy && mealCount && phase;

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
  const generateStructuredPlan = async (
    userPrompt: string,
    dietConfig: { objective?: string; strategy?: string; style?: string; carbCyclePlan?: any },
    targets: { kcal: number; p: number; c: number; g: number; tmb?: number; get?: number },
    intent: DietIntent = 'new',
  ): Promise<DietPlan | null> => {
    // Latest training markdown → structured context
    let trainingContext: any = undefined;
    try {
      const { data: trainPlans } = await supabase
        .from('ai_plans')
        .select('conteudo')
        .eq('student_id', studentId!)
        .eq('tipo', 'treino')
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(1);
      const md = trainPlans?.[0]?.conteudo as string | undefined;
      if (md) {
        trainingContext = extractTrainingContext({
          trainingMarkdown: md,
          trainingTime: (['manha', 'tarde', 'noite'] as const).find((t) => trainingTime?.includes(t)) || null,
        });
      }
    } catch (e) {
      console.warn('structured: failed to load training context', e);
    }

    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        mode: 'structured',
        messages: [{ role: 'user', content: userPrompt }],
        studentContext: studentCtx,
        dietConfig,
        trainingContext,
        studentId,
        variationIntensity,
        intent,
        regenerateIntent: intent === 'regenerate',
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.warn('structured diet-agent non-200:', resp.status, err);
      return null;
    }
    const data = await resp.json().catch(() => null);
    const raw = data?.plan;
    if (!raw) return null;
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

    // Inject targets if model didn't echo them
    if (raw.targets) {
      raw.targets = { ...targets, ...raw.targets };
    } else {
      raw.targets = targets;
    }

    let parsed = parseDietPlanStrict(raw);
    if (!parsed.success) {
      // try a loose parse — tolerates extra/missing optional fields
      const loose = parseDietPlanLoose(raw);
      if (!loose) {
        console.warn('structured: schema rejected plan', parsed.error?.issues?.slice(0, 5));
        return null;
      }
      return finalizeDietPlan(loose, targets as any);
    }
    return finalizeDietPlan(parsed.data, targets as any);
  };

  const loadFoodMacroRecords = async (): Promise<FoodMacroRecord[]> => {
    const { data, error } = await supabase
      .from('foods')
      .select('name, calories, protein, carbs, fats, portion_size')
      .order('name');
    if (error) throw new Error('Erro ao carregar base alimentar: ' + error.message);
    return (data || []).map((food) => ({
      name: food.name,
      calories: Number(food.calories) || 0,
      protein: Number(food.protein) || 0,
      carbs: Number(food.carbs) || 0,
      fats: Number(food.fats) || 0,
      portion_size: Number(food.portion_size) || 100,
    }));
  };

  const generatePlan = async (opts: { regenerateIntent?: boolean; intent?: DietIntent } = {}) => {
    if (!canGenerate || !studentCtx) return;
    const intent: DietIntent = opts.intent ?? (opts.regenerateIntent ? 'regenerate' : 'new');
    setLastIntent(intent);
    setGenerating(true);
    setResult('');
    setMacroReport(null);
    setStructuredPlan(null);
    setDietSimilarity(null);
    setViability(null);

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

    // Recalculate recommendation using CURRENT wizard selections (not the initial suggestion)
    let recText = '';
    let currentTargets: DietMacroTargets | null = null;
    const baseRec = studentCtx.recomendacao_ia;
    if (baseRec) {
      const currentFA = parseFloat(activityLevel);
      const currentStrategyPct = selectedStrategy?.pct ?? 0;
      const currentGET = baseRec.tmb * currentFA;
      const currentCalories = Math.round(currentGET * (1 + currentStrategyPct / 100));

      const peso = studentCtx.peso || 70;
      const macros = calculateMacroTargets({
        calories: currentCalories,
        weight: peso,
        strategyValue: strategy,
        phaseValue: phase,
        hormoneUse: hasHormoneUse(usesHormones),
        proteinPerKgOverride: proteinPerKgOverride ? Number(proteinPerKgOverride.replace(',', '.')) : null,
        fatPerKgOverride: fatPerKgOverride ? Number(fatPerKgOverride.replace(',', '.')) : null,
      });
      currentTargets = {
        calories: currentCalories,
        protein: macros.proteinGrams,
        carbs: macros.carbGrams,
        fats: macros.fatGrams,
      };

      recText = `
=== RECOMENDAÇÃO CALCULADA (VALORES OBRIGATÓRIOS — NÃO RECALCULE) ===
- TMB: ${baseRec.tmb} kcal (calculado por ${baseRec.formula})
- Fator de Atividade: ${currentFA}
- GET: ${Math.round(currentGET)} kcal
- Estratégia: ${selectedStrategy?.label} (${currentStrategyPct > 0 ? '+' : ''}${currentStrategyPct}%)
- Calorias alvo EXATAS: ${currentCalories} kcal
- Proteína EXATA: ${macros.proteinGrams}g (${macros.proteinPerKg}g/kg)
- Carboidrato EXATO: ${macros.carbGrams}g
- Gordura EXATA: ${macros.fatGrams}g (${macros.fatPerKg}g/kg)
⚠️ OBRIGATÓRIO: O TOTAL DIÁRIO da tabela DEVE ser EXATAMENTE ${currentCalories} kcal (tolerância ±50 kcal). Proteína total = ${macros.proteinGrams}g, Carboidrato total = ${macros.carbGrams}g, Gordura total = ${macros.fatGrams}g. NÃO use outros valores. NÃO recalcule a TMB. Estes valores já são definitivos.
⚠️ REGRA DE CORREÇÃO: Se faltar caloria para bater a meta, ajuste CARBOIDRATO. NÃO aumente proteína acima de ${macros.proteinGrams}g para completar calorias.
⚠️ VALIDAÇÃO FINAL: Antes de responder, some alimento por alimento. A dieta só é aceitável se ficar entre ${currentCalories - 50} e ${currentCalories + 50} kcal, proteína entre ${macros.proteinGrams - 10} e ${macros.proteinGrams + 10}g, carboidrato entre ${macros.carbGrams - 15} e ${macros.carbGrams + 15}g e gordura entre ${macros.fatGrams - 8} e ${macros.fatGrams + 8}g.
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
=== SUBSTITUIÇÕES DE ALIMENTOS ===
OBRIGATÓRIO: Para CADA alimento na tabela de refeições, a coluna "Substituição" deve conter EXATAMENTE 3 opções de troca, cada uma com nome e quantidade (em gramas), que tenham macros e calorias equivalentes ao alimento principal.
Formato da coluna Substituição: "1) Alimento X (Xg); 2) Alimento Y (Xg); 3) Alimento Z (Xg)"
Exemplo: "1) Batata-doce (150g); 2) Inhame (140g); 3) Mandioca (120g)"
As 3 opções devem ser alimentos DIFERENTES entre si e diferentes do alimento principal, respeitando os macros e calorias equivalentes.
${substitutions.length > 0 ? `Use PREFERENCIALMENTE os alimentos abaixo como opções de substituição:\n${substitutions.map(s => `- ${s.food}: ${s.portion}`).join('\n')}` : ''}
${modelDiet.trim() ? `
=== DIETA MODELO (REFERÊNCIA) ===
O nutricionista colou uma dieta modelo abaixo. Use esta dieta como BASE/REFERÊNCIA: mantenha a estrutura e horários semelhantes, mas AJUSTE as quantidades (gramas) para que os macronutrientes e calorias totais batam com os valores calculados para este aluno.
IMPORTANTE: Se a dieta modelo contiver algum alimento que o aluno NÃO PODE comer (por restrição alimentar, alergia ou intolerância) ou que NÃO ESTÁ na lista de preferências alimentares do aluno, você DEVE substituir esse alimento por outro da lista de preferências/alimentos permitidos do aluno que tenha perfil nutricional semelhante, mantendo os macros equivalentes.
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
1) Tabela comparativa de TMB por todas as fórmulas
2) Escolha da fórmula mais adequada e justificativa
3) Cálculo do GET e Consumo Energético
4) Distribuição de macronutrientes (proteína, carboidrato, gordura)
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

    try {
      const foodRecords = await loadFoodMacroRecords();

      // ── 1) STRUCTURED MODE (primary path) ──
      let structured: DietPlan | null = null;
      if (currentTargets) {
        // Phase 2: build carb-cycle plan when the protocol is selected.
        const wantsCarbCycle = selectedAdjustments.includes('carb_cycling');
        const wantsRefeed = selectedAdjustments.includes('refeed');
        const cyclePlan = wantsCarbCycle
          ? buildCarbCyclePlan({
              baseKcal: currentTargets.calories,
              baseP: currentTargets.protein,
              baseC: currentTargets.carbs,
              baseG: currentTargets.fats,
              trainingDaysCount: trainingDays ? Number(trainingDays) : null,
              enableRefeed: wantsRefeed,
            })
          : null;
        try {
          structured = await generateStructuredPlan(
            prompt,
            {
              objective: phase || undefined,
              strategy: strategy || undefined,
              style: dietStyle || undefined,
              ...(cyclePlan ? { carbCyclePlan: cyclePlan } : {}),
            },
            {
              kcal: currentTargets.calories,
              p: currentTargets.protein,
              c: currentTargets.carbs,
              g: currentTargets.fats,
              tmb: studentCtx.recomendacao_ia?.tmb,
            },
            intent,
          );
        } catch (e) {
          console.warn('structured generation threw, falling back to streaming:', e);
        }
      }

      if (structured) {
        const md = dietPlanToMarkdown(structured);
        setStructuredPlan(structured);
        setResult(md);
        if (currentTargets) {
          const report = validateDietMacros(md, currentTargets, foodRecords);
          setMacroReport(report);
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
      toast.error(e.message || 'Erro ao gerar dieta');
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = async () => {
    if (!result) return;
    setSaving(true);
    const protocols = {
      adjustments: selectedAdjustments,
      extras: {
        fitoterapia: enableFitoterapia,
        suplementos: enableSuplementos,
        emagrecimento_rapido: enableEmagrecimentoRapido,
      },
    };
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
      const { error } = await supabase.from('ai_plans').update({
        conteudo: result,
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')} (editada)`,
        protocols,
        conteudo_json: canonicalPlan ?? (validation.success ? (validation.data as any) : null),
        migration_status: (validation.success ? 'completed' : 'failed') as any,
        migration_error: validation.error || null,
      }).eq('id', editPlanId);
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Dieta atualizada!');
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
      const { error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'dieta',
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo: result,
        protocols,
        cycle_status: 'em_dia',
        conteudo_json: canonicalPlan ?? null,
        migration_status: canonicalPlan ? 'completed' : 'pending',
        diet_strategy: strategy || null,
        strategy_source: 'manual',
        generation_intent: lastIntent,
        viability_score: viability?.score ?? null,
        viability_breakdown: viability?.breakdown ?? null,
      });
      if (error) {
        toast.error('Erro: ' + error.message);
      } else {
        // If we have a lastDietPlan, mark it as 'renovado'
        if (lastDietPlan?.id) {
          await supabase.from('ai_plans').update({
            cycle_status: 'renovado'
          }).eq('id', lastDietPlan.id);
        }
        toast.success('Dieta salva e ciclo atualizado!');
      }
    }
    setSaving(false);
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
        <Button variant="ghost" onClick={() => navigate(`/alunos/${studentId}`)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

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

        {/* AI Recommendation Card */}
        {studentCtx?.recomendacao_ia && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm">Recomendação da IA (baseada na avaliação completa)</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">TMB</span>
                  <span className="font-bold text-primary">{studentCtx.recomendacao_ia.tmb} kcal</span>
                  <span className="text-[10px] text-muted-foreground block">{studentCtx.recomendacao_ia.formula}</span>
                </div>
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">GET</span>
                  <span className="font-bold text-primary">{studentCtx.recomendacao_ia.get} kcal</span>
                  <span className="text-[10px] text-muted-foreground block">FA: {studentCtx.recomendacao_ia.fa}</span>
                </div>
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">Calorias Alvo</span>
                  <span className="font-bold text-primary">{studentCtx.recomendacao_ia.calorias_total} kcal</span>
                  <span className="text-[10px] text-muted-foreground block">{STRATEGIES.find(s => s.value === studentCtx.recomendacao_ia.estrategia)?.label}</span>
                </div>
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">Estratégia</span>
                  <span className="font-bold text-primary text-xs">{STRATEGIES.find(s => s.value === studentCtx.recomendacao_ia.estrategia)?.label}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">Proteína</span>
                  <span className="font-bold">{studentCtx.recomendacao_ia.proteina_g}g</span>
                  <span className="text-[10px] text-muted-foreground block">{studentCtx.recomendacao_ia.proteina_kg}g/kg</span>
                </div>
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">Carboidrato</span>
                  <span className="font-bold">{studentCtx.recomendacao_ia.carboidrato_g}g</span>
                  <span className="text-[10px] text-muted-foreground block">{Math.round(studentCtx.recomendacao_ia.carboidrato_g * 4)} kcal</span>
                </div>
                <div className="bg-background rounded-lg p-2 text-center border border-border">
                  <span className="text-muted-foreground text-xs block">Gordura</span>
                  <span className="font-bold">{studentCtx.recomendacao_ia.gordura_g}g</span>
                  <span className="text-[10px] text-muted-foreground block">{studentCtx.recomendacao_ia.gordura_kg}g/kg</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                * Valores calculados com base no perfil, avaliação física, composição corporal e ficha do aluno. Ajuste nos passos abaixo se necessário.
              </p>
            </CardContent>
          </Card>
        )}

        {(() => {
          const STEP_TITLES = [
            'Rotina e Treino',
            'Estilo, Fase e Hormônios',
            'Atividade e Estratégia',
            'Refeições e Preferências',
            'Ajustes do Protocolo',
            'Extras',
            'Substituições',
          ];
          const stepValid = [
            !!trainingTime && !!trainingDays,
            !!dietStyle && !!phase && usesHormones !== null,
            !!activityLevel && !!strategy,
            !!mealCount,
            true,
            true,
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
            <StepHeader step={1} title="Rotina e Treino" />
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
          </CardContent>
        </Card>
              )}

              {currentStep === 1 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={2} title="Estilo da Dieta, Fase e Hormônios" />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Estilo da dieta</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DIET_STYLES.map(d => (
                  <SelectionButton key={d.value} selected={dietStyle === d.value} onClick={() => setDietStyle(d.value)}>
                    <span className="font-semibold text-sm block">{d.label}</span>
                    <span className="text-xs text-muted-foreground">{d.desc}</span>
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
          </CardContent>
        </Card>
              )}

              {currentStep === 2 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={3} title="Atividade e Estratégia" />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Nível de atividade física</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ACTIVITY_LEVELS.map(a => (
                  <SelectionButton key={a.value} selected={activityLevel === a.value} onClick={() => setActivityLevel(a.value)}>
                    <span className="font-semibold text-sm block">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{a.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Estratégia nutricional</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STRATEGIES.map(s => (
                  <SelectionButton key={s.value} selected={strategy === s.value} onClick={() => setStrategy(s.value)}>
                    <span className="font-semibold text-sm block">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.desc}</span>
                  </SelectionButton>
                ))}
              </div>
            </div>

            {/* Phase 2: macros por g/kg (override opcional) */}
            <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-xs font-semibold">Macros por g/kg (opcional)</p>
              <p className="text-[10px] text-muted-foreground">
                Deixe em branco para usar os valores automáticos por fase/estratégia. Preencha para
                sobrescrever apenas proteína e/ou gordura — carboidrato é recalculado para fechar a meta calórica.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Proteína (g/kg)</span>
                  <input
                    inputMode="decimal"
                    value={proteinPerKgOverride}
                    onChange={(e) => setProteinPerKgOverride(e.target.value)}
                    placeholder="ex: 2.2"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-muted-foreground">Gordura (g/kg)</span>
                  <input
                    inputMode="decimal"
                    value={fatPerKgOverride}
                    onChange={(e) => setFatPerKgOverride(e.target.value)}
                    placeholder="ex: 0.8"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
              {(proteinPerKgOverride || fatPerKgOverride) && studentCtx?.peso && (
                <p className="text-[10px] text-primary">
                  Override ativo: P {proteinPerKgOverride || '—'} g/kg, G {fatPerKgOverride || '—'} g/kg
                  {' '}({Math.round((Number(proteinPerKgOverride.replace(',', '.')) || 0) * Number(studentCtx.peso)) || '—'}g P,
                  {' '}{Math.round((Number(fatPerKgOverride.replace(',', '.')) || 0) * Number(studentCtx.peso)) || '—'}g G).
                </p>
              )}
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 3 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={4} title="Refeições e Preferências" />
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
            <StepHeader step={5} title="Ajustes do Protocolo (opcional)" />
            <p className="text-xs text-muted-foreground">Selecione os ajustes que deseja incluir no plano</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROTOCOL_ADJUSTMENTS.map(adj => {
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

              {currentStep === 5 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <StepHeader step={6} title="Extras (opcional)" />
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
                    <span className="font-semibold text-sm block">Emagrecimento Rápido</span>
                    <span className="text-xs text-muted-foreground">Jejum intermitente, carb cycling, termogênicos</span>
                  </div>
                </div>
                <Switch checked={enableEmagrecimentoRapido} onCheckedChange={setEnableEmagrecimentoRapido} />
              </div>
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 6 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <StepHeader step={7} title="Alimentos para Substituição (opcional)" />
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
            </div>
          </CardContent>
        </Card>
              )}
            </AiWizard>
          );
        })()}

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
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                Plano Alimentar
                {structuredPlan?.validation && (
                  <DietValidationBadge report={structuredPlan.validation} className="ml-2" />
                )}
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
            {macroReport && (
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
                    <span>Gerado: <strong className="text-foreground">{formatDietMacroLine(macroReport.generated)}</strong></span>
                    <span>Diferença: <strong className="text-foreground">{formatDietMacroLine(macroReport.difference)}</strong></span>
                  </div>
                  {!macroReport.valid && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      Fora da meta. Pode ajustar automaticamente, regenerar ou salvar mesmo assim.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={adjustMacros} disabled={adjusting}>
                      {adjusting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <SlidersHorizontal className="h-3 w-3 mr-1" />}
                      Ajuste automático
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowMacroModal(true)}>
                      <Percent className="h-3 w-3 mr-1" /> Ajustar macros
                    </Button>
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
                const kcalTotal = macroReport?.target.calories ?? 2000;
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
