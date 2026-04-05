import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, UtensilsCrossed, RotateCcw, Leaf, Pill, Zap, Clock, Target, SlidersHorizontal, FileDown, Plus, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import DietResultCards from '@/components/DietResultCards';
import { generateDietPDF } from '@/lib/generateDietPDF';

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

  // Result
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (editPlanId && studentId) loadEditPlan();
  }, [editPlanId]);

  const loadEditPlan = async () => {
    const { data } = await supabase.from('ai_plans').select('*').eq('id', editPlanId!).maybeSingle();
    if (data) setResult(data.conteudo);
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

      // Macros based on phase
      let protPerKg = 2.0, fatPerKg = 0.9;
      if (suggestedStrategy.includes('deficit')) { protPerKg = 2.4; fatPerKg = 0.7; }
      if (suggestedStrategy.includes('superavit')) { protPerKg = 1.8; fatPerKg = 1.0; }
      if (latestQuestionnaire?.usa_hormonios && latestQuestionnaire.usa_hormonios !== 'Não') {
        protPerKg = Math.min(protPerKg + 0.3, 3.0);
      }

      const protGrams = Math.round(protPerKg * peso);
      const fatGrams = Math.round(fatPerKg * peso);
      const protCal = protGrams * 4;
      const fatCal = fatGrams * 9;
      const carbCal = Math.max(consumo - protCal - fatCal, 0);
      const carbGrams = Math.round(carbCal / 4);

      ctx.recomendacao_ia = {
        tmb: Math.round(bestTmb),
        formula: bestFormula,
        fa: suggestedFA,
        get: Math.round(get),
        consumo: Math.round(consumo),
        estrategia: suggestedStrategy,
        proteina_g: protGrams,
        carboidrato_g: carbGrams,
        gordura_g: fatGrams,
        proteina_kg: protPerKg,
        gordura_kg: fatPerKg,
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

  const generatePlan = async () => {
    if (!canGenerate || !studentCtx) return;
    setGenerating(true);
    setResult('');

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
    const baseRec = studentCtx.recomendacao_ia;
    if (baseRec) {
      const currentFA = parseFloat(activityLevel);
      const currentStrategyPct = selectedStrategy?.pct ?? 0;
      const currentGET = baseRec.tmb * currentFA;
      const currentCalories = Math.round(currentGET * (1 + currentStrategyPct / 100));

      // Recalculate macros based on current phase/strategy
      const peso = studentCtx.peso || 70;
      let protPerKg = 2.0, fatPerKg = 0.9;
      if (strategy.includes('deficit')) { protPerKg = 2.4; fatPerKg = 0.7; }
      if (strategy.includes('superavit')) { protPerKg = 1.8; fatPerKg = 1.0; }
      if (phase === 'pre_contest') { protPerKg = 2.8; fatPerKg = 0.6; }
      if (phase === 'recomposicao') { protPerKg = 2.3; fatPerKg = 0.8; }
      if (usesHormones) { protPerKg = Math.min(protPerKg + 0.3, 3.0); }

      const protGrams = Math.round(protPerKg * peso);
      const fatGrams = Math.round(fatPerKg * peso);
      const protCal = protGrams * 4;
      const fatCal = fatGrams * 9;
      const carbCal = Math.max(currentCalories - protCal - fatCal, 0);
      const carbGrams = Math.round(carbCal / 4);

      recText = `
=== RECOMENDAÇÃO CALCULADA (VALORES OBRIGATÓRIOS — NÃO RECALCULE) ===
- TMB: ${baseRec.tmb} kcal (calculado por ${baseRec.formula})
- Fator de Atividade: ${currentFA}
- GET: ${Math.round(currentGET)} kcal
- Estratégia: ${selectedStrategy?.label} (${currentStrategyPct > 0 ? '+' : ''}${currentStrategyPct}%)
- Calorias alvo EXATAS: ${currentCalories} kcal
- Proteína EXATA: ${protGrams}g (${protPerKg}g/kg)
- Carboidrato EXATO: ${carbGrams}g
- Gordura EXATA: ${fatGrams}g (${fatPerKg}g/kg)
⚠️ OBRIGATÓRIO: O TOTAL DIÁRIO da tabela DEVE ser EXATAMENTE ${currentCalories} kcal (tolerância ±50 kcal). Proteína total = ${protGrams}g, Carboidrato total = ${carbGrams}g, Gordura total = ${fatGrams}g. NÃO use outros valores. NÃO recalcule a TMB. Estes valores já são definitivos.
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
IMPORTANTE: Siga RIGOROSAMENTE o estilo de dieta selecionado. Se Low Carb, mantenha carboidratos abaixo de 100g/dia. Se Cetogênica, abaixo de 30g/dia. Se Flexível, foque nos macros. Se Vegetariana/Vegana, respeite as restrições proteicas.

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
${studentCtx.questionario_dieta?.preferencias_alimentares ? `Considere as preferências do aluno: ${studentCtx.questionario_dieta.preferencias_alimentares}` : ''}
${studentCtx.questionario_dieta?.restricoes_alimentares ? `Respeite as restrições: ${studentCtx.questionario_dieta.restricoes_alimentares}` : ''}
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
5) EXATAMENTE 3 opções de cardápio completo e DIVERSIFICADO em tabela com: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G | Substituição. As 3 opções devem ser SIGNIFICATIVAMENTE diferentes entre si (proteínas, carboidratos e preparações variadas).
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
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            studentContext: studentCtx,
          }),
        }
      );

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

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) { accumulated += content; setResult(accumulated); }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) { accumulated += content; setResult(accumulated); }
          } catch { /* ignore */ }
        }
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
    if (editPlanId) {
      const { error } = await supabase.from('ai_plans').update({
        conteudo: result,
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')} (editada)`,
      }).eq('id', editPlanId);
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Dieta atualizada!');
    } else {
      const { error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'dieta',
        titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo: result,
      });
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Dieta salva!');
    }
    setSaving(false);
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

        {/* Step 1: Rotina e Treino */}
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

        {/* Step 2: Estilo, Fase Atual & Hormônios */}
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

        {/* Step 3: Atividade & Estratégia */}
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
          </CardContent>
        </Card>

        {/* Step 4: Refeições & Preferências */}
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

        {/* Step 5: Ajustes do Protocolo */}
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

        {/* Step 6: Extras */}
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

        {/* Step 7: Substituições */}
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
          </CardContent>
        </Card>

        <Button
          onClick={generatePlan}
          disabled={!canGenerate || generating}
          className="w-full font-bold text-base py-6 rounded-xl"
          size="lg"
        >
          {generating ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Gerando Plano Alimentar...</>
          ) : (
            <><UtensilsCrossed className="mr-2 h-5 w-5" /> Gerar Plano Alimentar</>
          )}
        </Button>

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
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                Plano Alimentar
              </h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => { setResult(''); generatePlan(); }}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Regenerar
                </Button>
                <Button variant="outline" size="sm" onClick={() => generateDietPDF(result, studentName)}>
                  <FileDown className="h-3 w-3 mr-1" /> PDF
                </Button>
                <Button size="sm" onClick={savePlan} disabled={saving}>
                  <Save className="h-3 w-3 mr-1" /> {editPlanId ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </div>
            <DietResultCards markdown={result} />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default DietaIA;
