import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Loader2, CalendarIcon, Camera, X, Upload, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROTOCOLS, sumOfFolds, resolveSex,
  type ProtocolId, type SkinfoldKey, type CalcProtocolId,
} from '@/lib/skinfoldProtocols';
import { evaluateFold, qualityStatusLabel, type FoldQuality } from '@/lib/measurementQuality';
import {
  recommendProtocol, isCalcProtocol, COMPATIBILITY_LABEL,
  POPULATION_CONTEXTS, TRAINING_PROFILES,
  type PopulationContext, type TrainingProfile,
} from '@/lib/protocolRecommendation';
import { calcSomatotype, caliperToCm, isPlausibleBreadth } from '@/lib/somatotype';
import ProtocolAnalysisCard from '@/components/assessment/ProtocolAnalysisCard';
import SomatotypeCard from '@/components/assessment/SomatotypeCard';

const steps = [
  'Anamnese',
  'Sinais Vitais',
  'Antropometria',
  'Dobras Cutâneas',
  'Estrutura Óssea',
  'Testes Físicos',
  'Fotos',
  'Resumo',
];

const skinfoldFieldLabels: Record<string, string> = {
  triceps: 'Tríceps',
  subescapular: 'Subescapular',
  suprailiaca: 'Suprailíaca',
  supraspinale: 'Supraespinal',
  abdominal: 'Abdominal',
  peitoral: 'Peitoral',
  axilar_media: 'Axilar Média',
  coxa: 'Coxa',
  biceps: 'Bíceps',
  panturrilha_medial: 'Panturrilha Medial',
};

const skinfoldFields = [
  'triceps', 'subescapular', 'suprailiaca', 'supraspinale', 'abdominal',
  'peitoral', 'axilar_media', 'coxa', 'biceps', 'panturrilha_medial',
] as const satisfies readonly SkinfoldKey[];

const emptyFolds = (): Record<string, string> => {
  const o: Record<string, string> = {};
  skinfoldFields.forEach((s) => { o[`${s}_1`] = ''; o[`${s}_2`] = ''; o[`${s}_3`] = ''; });
  return o;
};

const classifyIMC = (imc: number): { label: string; color: string } => {
  if (imc < 18.5) return { label: 'Abaixo do peso', color: 'text-yellow-500' };
  if (imc < 25) return { label: 'Peso normal', color: 'text-green-500' };
  if (imc < 30) return { label: 'Sobrepeso', color: 'text-yellow-500' };
  if (imc < 35) return { label: 'Obesidade I', color: 'text-orange-500' };
  if (imc < 40) return { label: 'Obesidade II', color: 'text-red-500' };
  return { label: 'Obesidade III', color: 'text-destructive' };
};

const classifyRCQ = (rcq: number): { label: string; color: string } => {
  if (rcq < 0.80) return { label: 'Baixo risco', color: 'text-green-500' };
  if (rcq < 0.86) return { label: 'Risco moderado', color: 'text-yellow-500' };
  if (rcq < 0.95) return { label: 'Risco alto', color: 'text-orange-500' };
  return { label: 'Risco muito alto', color: 'text-destructive' };
};

const toNum = (s: string | null | undefined): number | null => {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const InputField = ({ label, value, onChange, unit, type = 'text', placeholder = '' }: any) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label} {unit && <span className="text-primary">({unit})</span>}</Label>
    <Input
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      pattern={type === 'number' ? '[0-9]*[.,]?[0-9]*' : undefined}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  </div>
);

const PreviousValueHint = ({
  value,
  unit,
  onApply,
}: {
  value: number | null | undefined;
  unit: string;
  onApply?: () => void;
}) => {
  if (value === null || value === undefined) return null;
  const formatted = Number(value).toString().replace('.', ',');
  return (
    <button
      type="button"
      onClick={onApply}
      className="text-[10px] text-muted-foreground/80 hover:text-primary transition-colors text-left mt-0.5"
      title="Clique para preencher com o valor anterior"
    >
      Anterior: <span className="font-medium text-foreground/70">{formatted} {unit}</span>
    </button>
  );
};

const TextareaField = ({ label, value, onChange }: any) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Textarea value={value} onChange={onChange} rows={2} />
  </div>
);

const NovaAvaliacao = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [studentSex, setStudentSex] = useState<string | null>(null);
  const [studentBirthDate, setStudentBirthDate] = useState<Date | null>(null);
  const [photos, setPhotos] = useState<{ tipo: string; file: File; preview: string }[]>([]);

  const photoTypes = [
    { value: 'frente', label: 'Frente' },
    { value: 'costas', label: 'Costas' },
    { value: 'lado_direito', label: 'Lado Direito' },
    { value: 'lado_esquerdo', label: 'Lado Esquerdo' },
  ];

  useEffect(() => {
    if (!studentId) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from('students_profile')
        .select('sexo, data_nascimento, altura')
        .eq('user_id', studentId)
        .maybeSingle();

      if (!data) return;

      setStudentSex(data.sexo);
      if (data.data_nascimento) {
        setStudentBirthDate(new Date(`${data.data_nascimento}T00:00:00`));
      }
      if (!editId && data.altura) {
        setAnthro(prev => prev.altura ? prev : { ...prev, altura: String(data.altura) });
      }
    };
    loadProfile();
  }, [studentId, editId]);

  const [anamnese, setAnamnese] = useState({
    sono: '', stress: '', rotina: '', treino_atual: '', medicacao: '',
    suplementos: '', historico_saude: '', dores: '', cirurgias: '',
    tabagismo: false, alcool: '',
  });

  const [vitals, setVitals] = useState({
    pressao: '', fc_repouso: '', spo2: '', glicemia: '', observacoes: '',
  });

  const [anthro, setAnthro] = useState({
    peso: '', altura: '', cintura: '', quadril: '', pescoco: '',
    braco_direito: '', braco_esquerdo: '', antebraco: '', antebraco_esquerdo: '', torax: '', abdomen: '',
    coxa_direita: '', coxa_esquerda: '', panturrilha_direita: '', panturrilha_esquerda: '',
    biceps_contraido_direito: '', biceps_contraido_esquerdo: '', ombro: '',
  });

  // Dobras: até 3 aferições por local
  const [folds, setFolds] = useState<Record<string, string>>(emptyFolds);
  const [metodo, setMetodo] = useState<ProtocolId>('auto');
  const [selectedManually, setSelectedManually] = useState(false);

  // Contexto da avaliação
  const [populationContext, setPopulationContext] = useState<PopulationContext>('nao_informado');
  const [trainingProfile, setTrainingProfile] = useState<TrainingProfile>('nao_informado');

  // Estrutura óssea (paquímetro)
  const [caliperUnit, setCaliperUnit] = useState<'mm' | 'cm'>('mm');
  const [breadths, setBreadths] = useState({ umero: '', femur: '' });

  const [performance, setPerformance] = useState({
    pushup: '', plank: '', cooper_12min: '', salto_vertical: '',
    agachamento_score: '', mobilidade_ombro: '', mobilidade_quadril: '',
    mobilidade_tornozelo: '', observacoes: '',
  });

  const [notasGerais, setNotasGerais] = useState('');
  const [dataAvaliacao, setDataAvaliacao] = useState<Date>(new Date());

  const [previousAnthro, setPreviousAnthro] = useState<Record<string, number | null> | null>(null);
  const [previousSkinfolds, setPreviousSkinfolds] = useState<Record<string, number | null> | null>(null);
  const [previousAssessmentDate, setPreviousAssessmentDate] = useState<Date | null>(null);
  const [previousProtocol, setPreviousProtocol] = useState<CalcProtocolId | null>(null);

  useEffect(() => {
    if (!studentId) return;
    const loadPrevious = async () => {
      let query = supabase
        .from('assessments')
        .select('id, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (editId) query = query.neq('id', editId);

      const { data: prev } = await query.maybeSingle();
      if (!prev) {
        setPreviousAnthro(null);
        setPreviousSkinfolds(null);
        setPreviousAssessmentDate(null);
        setPreviousProtocol(null);
        return;
      }
      setPreviousAssessmentDate(new Date(prev.created_at));

      const [aRes, sRes, anRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', prev.id).maybeSingle(),
        supabase.from('skinfolds').select('*').eq('assessment_id', prev.id).maybeSingle(),
        supabase.from('assessment_bodycomp_analysis').select('selected_protocol').eq('assessment_id', prev.id).maybeSingle(),
      ]);
      setPreviousAnthro((aRes.data as any) ?? null);
      setPreviousSkinfolds((sRes.data as any) ?? null);
      const prot = (anRes.data as any)?.selected_protocol ?? (sRes.data as any)?.metodo ?? null;
      setPreviousProtocol(isCalcProtocol(prot) ? prot : null);
    };
    loadPrevious();
  }, [studentId, editId]);

  const str = (v: any) => (v != null && v !== '' ? String(v) : '');

  useEffect(() => {
    if (!editId) return;
    const loadExisting = async () => {
      setLoading(true);
      try {
        const [aRes, vRes, anthRes, skRes, perfRes, assessRes, measRes, analysisRes] = await Promise.all([
          supabase.from('anamnese').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('vitals').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('anthropometrics').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('skinfolds').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('performance_tests').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('assessments').select('notas_gerais, created_at').eq('id', editId).maybeSingle(),
          supabase.from('skinfold_measurements').select('*').eq('assessment_id', editId),
          supabase.from('assessment_bodycomp_analysis').select('*').eq('assessment_id', editId).maybeSingle(),
        ]);

        if (aRes.data) {
          const d = aRes.data;
          setAnamnese({
            sono: str(d.sono), stress: str(d.stress), rotina: str(d.rotina),
            treino_atual: str(d.treino_atual), medicacao: str(d.medicacao),
            suplementos: str(d.suplementos), historico_saude: str(d.historico_saude),
            dores: str(d.dores), cirurgias: str(d.cirurgias),
            tabagismo: d.tabagismo ?? false, alcool: str(d.alcool),
          });
        }
        if (vRes.data) {
          const d = vRes.data;
          setVitals({
            pressao: str(d.pressao), fc_repouso: str(d.fc_repouso),
            spo2: str(d.spo2), glicemia: str(d.glicemia), observacoes: str(d.observacoes),
          });
        }
        if (anthRes.data) {
          const d = anthRes.data;
          setAnthro({
            peso: str(d.peso), altura: str(d.altura), cintura: str(d.cintura),
            quadril: str(d.quadril), pescoco: str(d.pescoco),
            braco_direito: str(d.braco_direito), braco_esquerdo: str(d.braco_esquerdo),
            antebraco: str(d.antebraco), antebraco_esquerdo: str(d.antebraco_esquerdo),
            torax: str(d.torax), abdomen: str(d.abdomen),
            coxa_direita: str(d.coxa_direita), coxa_esquerda: str(d.coxa_esquerda),
            panturrilha_direita: str(d.panturrilha_direita), panturrilha_esquerda: str(d.panturrilha_esquerda),
            biceps_contraido_direito: str(d.biceps_contraido_direito), biceps_contraido_esquerdo: str(d.biceps_contraido_esquerdo),
            ombro: str(d.ombro),
          });
        }

        const next = emptyFolds();
        if (skRes.data) {
          const d: any = skRes.data;
          skinfoldFields.forEach((k) => { next[`${k}_1`] = str(d[k]); });
          setMetodo(((d.metodo as ProtocolId) || 'auto'));
        }
        // Aferições detalhadas sobrescrevem o valor consolidado, quando existirem
        (measRes.data ?? []).forEach((m: any) => {
          if (!skinfoldFields.includes(m.site)) return;
          next[`${m.site}_1`] = str(m.measurement_1);
          next[`${m.site}_2`] = str(m.measurement_2);
          next[`${m.site}_3`] = str(m.measurement_3);
        });
        setFolds(next);

        if (analysisRes.data) {
          const a: any = analysisRes.data;
          setPopulationContext((a.population_context as PopulationContext) ?? 'nao_informado');
          setTrainingProfile((a.training_profile as TrainingProfile) ?? 'nao_informado');
          setSelectedManually(!!a.selected_manually);
          if (a.selected_manually && isCalcProtocol(a.selected_protocol)) setMetodo(a.selected_protocol);
          setCaliperUnit('cm');
          setBreadths({
            umero: a.humerus_breadth_cm != null ? String(a.humerus_breadth_cm) : '',
            femur: a.femur_breadth_cm != null ? String(a.femur_breadth_cm) : '',
          });
        }

        if (perfRes.data) {
          const d = perfRes.data;
          setPerformance({
            pushup: str(d.pushup), plank: str(d.plank),
            cooper_12min: str(d.cooper_12min), salto_vertical: str(d.salto_vertical),
            agachamento_score: str(d.agachamento_score),
            mobilidade_ombro: str(d.mobilidade_ombro), mobilidade_quadril: str(d.mobilidade_quadril),
            mobilidade_tornozelo: str(d.mobilidade_tornozelo), observacoes: str(d.observacoes),
          });
        }
        if (assessRes.data) {
          setNotasGerais(str(assessRes.data.notas_gerais));
          if (assessRes.data.created_at) {
            setDataAvaliacao(new Date(assessRes.data.created_at));
          }
        }
      } catch (err: any) {
        toast.error('Erro ao carregar avaliação: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    loadExisting();
  }, [editId]);

  // ---------- Cálculos ----------
  const ageYears = useMemo(() => {
    if (!studentBirthDate) return null;
    const ref = dataAvaliacao || new Date();
    let age = ref.getFullYear() - studentBirthDate.getFullYear();
    const monthDiff = ref.getMonth() - studentBirthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < studentBirthDate.getDate())) age--;
    return age > 0 ? age : null;
  }, [studentBirthDate, dataAvaliacao]);

  const foldQuality = useMemo(() => {
    const q: Partial<Record<SkinfoldKey, FoldQuality>> = {};
    skinfoldFields.forEach((s) => {
      q[s] = evaluateFold(folds[`${s}_1`], folds[`${s}_2`], folds[`${s}_3`]);
    });
    return q;
  }, [folds]);

  const usedValues = useMemo(() => {
    const v: Partial<Record<SkinfoldKey, number>> = {};
    skinfoldFields.forEach((s) => {
      const q = foldQuality[s];
      if (q?.usable && q.usedValue != null) v[s] = q.usedValue;
    });
    return v;
  }, [foldQuality]);

  const recommendation = useMemo(() => recommendProtocol({
    sex: studentSex,
    ageYears,
    values: usedValues,
    quality: foldQuality,
    populationContext,
    trainingProfile,
    previousProtocol,
  }), [studentSex, ageYears, usedValues, foldQuality, populationContext, trainingProfile, previousProtocol]);

  const selectedProtocol: CalcProtocolId | null = useMemo(() => {
    if (metodo === 'manual') return null;
    if (metodo === 'auto') return recommendation.recommended?.protocol ?? null;
    return isCalcProtocol(metodo) ? metodo : null;
  }, [metodo, recommendation]);

  const selectedEvaluation = useMemo(
    () => recommendation.evaluations.find((e) => e.protocol === selectedProtocol) ?? null,
    [recommendation, selectedProtocol],
  );

  const bodyFat = selectedEvaluation?.bodyFat ?? null;

  const totalSum = useMemo(() => sumOfFolds(usedValues), [usedValues]);

  const breadthCm = useMemo(() => {
    const u = toNum(breadths.umero);
    const f = toNum(breadths.femur);
    return {
      umero: u != null ? Number(caliperToCm(u, caliperUnit).toFixed(2)) : null,
      femur: f != null ? Number(caliperToCm(f, caliperUnit).toFixed(2)) : null,
    };
  }, [breadths, caliperUnit]);

  const somatotype = useMemo(() => calcSomatotype({
    alturaCm: toNum(anthro.altura),
    pesoKg: toNum(anthro.peso),
    tricepsMm: usedValues.triceps ?? null,
    subescapularMm: usedValues.subescapular ?? null,
    supraspinaleMm: usedValues.supraspinale ?? null,
    panturrilhaMedialMm: usedValues.panturrilha_medial ?? null,
    bracoContraidoCm: toNum(anthro.biceps_contraido_direito),
    panturrilhaPerimetroCm: toNum(anthro.panturrilha_direita),
    umeroCm: breadthCm.umero,
    femurCm: breadthCm.femur,
  }), [anthro, usedValues, breadthCm]);

  const calcIMC = () => {
    const p = toNum(anthro.peso);
    const h = toNum(anthro.altura);
    if (p && h) return (p / ((h / 100) * (h / 100))).toFixed(1);
    return '-';
  };

  const calcRCQ = () => {
    const c = toNum(anthro.cintura);
    const q = toNum(anthro.quadril);
    if (c && q) return (c / q).toFixed(3);
    return '-';
  };

  const massaGorda = bodyFat != null && toNum(anthro.peso)
    ? Number(((toNum(anthro.peso) as number) * bodyFat / 100).toFixed(1)) : null;
  const massaMagra = bodyFat != null && toNum(anthro.peso)
    ? Number(((toNum(anthro.peso) as number) * (1 - bodyFat / 100)).toFixed(1)) : null;

  const pendingThird = skinfoldFields.filter((s) => foldQuality[s]?.status === 'needs_third');

  const handleSave = async () => {
    if (!studentId || !user) return;
    setSaving(true);

    try {
      const imc = calcIMC();
      const rcq = calcRCQ();

      let aid: string;

      if (editId) {
        const { error: aErr } = await supabase
          .from('assessments')
          .update({ notas_gerais: notasGerais, created_at: dataAvaliacao.toISOString() })
          .eq('id', editId);
        if (aErr) throw aErr;
        aid = editId;

        await Promise.all([
          supabase.from('anamnese').delete().eq('assessment_id', aid),
          supabase.from('vitals').delete().eq('assessment_id', aid),
          supabase.from('anthropometrics').delete().eq('assessment_id', aid),
          supabase.from('skinfolds').delete().eq('assessment_id', aid),
          supabase.from('composition').delete().eq('assessment_id', aid),
          supabase.from('performance_tests').delete().eq('assessment_id', aid),
          supabase.from('skinfold_measurements').delete().eq('assessment_id', aid),
          supabase.from('assessment_bodycomp_analysis').delete().eq('assessment_id', aid),
        ]);
      } else {
        const { data: assessment, error: aErr } = await supabase
          .from('assessments')
          .insert({ student_id: studentId, avaliador_id: user.id, notas_gerais: notasGerais, created_at: dataAvaliacao.toISOString() } as any)
          .select()
          .single();
        if (aErr) throw aErr;
        aid = assessment.id;
      }

      const skinfoldRow: Record<string, unknown> = {
        assessment_id: aid,
        metodo: selectedProtocol ?? (metodo === 'manual' ? 'manual' : 'auto'),
      };
      skinfoldFields.forEach((k) => { skinfoldRow[k] = foldQuality[k]?.usedValue ?? null; });

      const measurementRows = skinfoldFields
        .filter((k) => (foldQuality[k]?.measurements.length ?? 0) > 0)
        .map((k) => {
          const q = foldQuality[k] as FoldQuality;
          return {
            assessment_id: aid,
            site: k,
            measurement_1: toNum(folds[`${k}_1`]),
            measurement_2: toNum(folds[`${k}_2`]),
            measurement_3: toNum(folds[`${k}_3`]),
            used_value: q.usedValue,
            variation_percent: q.variationPercent,
            quality_status: q.status,
          };
        });

      const analysisRow = {
        assessment_id: aid,
        recommended_protocol: recommendation.recommended?.protocol ?? null,
        selected_protocol: selectedProtocol ?? (metodo === 'manual' ? 'manual' : null),
        previous_protocol: previousProtocol,
        protocol_changed: !!(previousProtocol && selectedProtocol && selectedProtocol !== previousProtocol),
        selected_manually: selectedManually || metodo !== 'auto',
        compatibility: selectedEvaluation?.compatibility ?? null,
        population_context: populationContext,
        training_profile: trainingProfile,
        humerus_breadth_cm: breadthCm.umero,
        femur_breadth_cm: breadthCm.femur,
        protocol_comparison: recommendation.evaluations.map((e) => ({
          protocol: e.protocol,
          eligible: e.eligible,
          compatibility: e.compatibility,
          body_fat: e.bodyFat,
          sum: e.sum,
          reasons: e.reasons,
          warnings: e.warnings,
        })),
        measurement_quality: skinfoldFields.reduce((acc, k) => {
          const q = foldQuality[k];
          if (q && q.measurements.length > 0) {
            acc[k] = { status: q.status, variation_percent: q.variationPercent, used_value: q.usedValue };
          }
          return acc;
        }, {} as Record<string, unknown>),
        skinfold_sums: {
          sum_all_measured: totalSum.sum,
          sites: totalSum.sites,
          sum_protocol: selectedEvaluation?.sum ?? null,
          protocol: selectedProtocol,
        },
        somatotype: somatotype.available
          ? { endomorfia: somatotype.endomorfia, mesomorfia: somatotype.mesomorfia, ectomorfia: somatotype.ectomorfia, dominance: somatotype.dominance }
          : null,
      };

      await Promise.all([
        supabase.from('anamnese').insert({ assessment_id: aid, ...anamnese }),
        supabase.from('vitals').insert({
          assessment_id: aid,
          pressao: vitals.pressao,
          fc_repouso: vitals.fc_repouso ? parseInt(vitals.fc_repouso) : null,
          spo2: vitals.spo2 ? parseFloat(vitals.spo2) : null,
          glicemia: vitals.glicemia ? parseFloat(vitals.glicemia) : null,
          observacoes: vitals.observacoes,
        }),
        supabase.from('anthropometrics').insert({
          assessment_id: aid,
          peso: toNum(anthro.peso),
          altura: toNum(anthro.altura),
          imc: imc !== '-' ? parseFloat(imc) : null,
          cintura: toNum(anthro.cintura),
          quadril: toNum(anthro.quadril),
          rcq: rcq !== '-' ? parseFloat(rcq) : null,
          pescoco: toNum(anthro.pescoco),
          braco_direito: toNum(anthro.braco_direito),
          braco_esquerdo: toNum(anthro.braco_esquerdo),
          antebraco: toNum(anthro.antebraco),
          antebraco_esquerdo: toNum(anthro.antebraco_esquerdo),
          ombro: toNum(anthro.ombro),
          torax: toNum(anthro.torax),
          abdomen: toNum(anthro.abdomen),
          coxa_direita: toNum(anthro.coxa_direita),
          coxa_esquerda: toNum(anthro.coxa_esquerda),
          panturrilha_direita: toNum(anthro.panturrilha_direita),
          panturrilha_esquerda: toNum(anthro.panturrilha_esquerda),
          biceps_contraido_direito: toNum(anthro.biceps_contraido_direito),
          biceps_contraido_esquerdo: toNum(anthro.biceps_contraido_esquerdo),
        } as any),
        supabase.from('skinfolds').insert(skinfoldRow as any),
        supabase.from('composition').insert({
          assessment_id: aid,
          percentual_gordura: bodyFat,
          massa_magra: massaMagra,
          massa_gorda: massaGorda,
        } as any),
        supabase.from('performance_tests').insert({
          assessment_id: aid,
          pushup: performance.pushup ? parseInt(performance.pushup) : null,
          plank: performance.plank ? parseInt(performance.plank) : null,
          cooper_12min: performance.cooper_12min ? parseFloat(performance.cooper_12min) : null,
          salto_vertical: performance.salto_vertical ? parseFloat(performance.salto_vertical) : null,
          agachamento_score: performance.agachamento_score ? parseInt(performance.agachamento_score) : null,
          mobilidade_ombro: performance.mobilidade_ombro,
          mobilidade_quadril: performance.mobilidade_quadril,
          mobilidade_tornozelo: performance.mobilidade_tornozelo,
          observacoes: performance.observacoes,
        }),
        measurementRows.length > 0
          ? supabase.from('skinfold_measurements').insert(measurementRows as any)
          : Promise.resolve({ error: null } as any),
        supabase.from('assessment_bodycomp_analysis').insert(analysisRow as any),
      ]);

      if (photos.length > 0) {
        if (editId) {
          await supabase.from('assessment_photos').delete().eq('assessment_id', aid);
        }

        for (const photo of photos) {
          const ext = photo.file.name.split('.').pop() || 'jpg';
          const path = `${studentId}/${aid}/${photo.tipo}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('assessment-photos')
            .upload(path, photo.file, { upsert: true });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('assessment-photos')
              .getPublicUrl(path);

            await supabase.from('assessment_photos').insert({
              assessment_id: aid,
              url: urlData.publicUrl,
              tipo: photo.tipo,
            });
          }
        }
      }

      toast.success(editId ? 'Avaliação atualizada!' : 'Avaliação salva com sucesso!');
      navigate(`/relatorio/${aid}`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Carregando Avaliação...">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando dados...
        </div>
      </AppLayout>
    );
  }

  const umeroPlausible = breadthCm.umero == null || isPlausibleBreadth('umero', breadthCm.umero);
  const femurPlausible = breadthCm.femur == null || isPlausibleBreadth('femur', breadthCm.femur);

  return (
    <AppLayout title={editId ? 'Editar Avaliação' : 'Nova Avaliação'}>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {/* Data da Avaliação */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium whitespace-nowrap">Data da Avaliação:</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dataAvaliacao, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dataAvaliacao}
                onSelect={(d) => d && setDataAvaliacao(d)}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {steps.map((step, i) => (
            <button
              key={step}
              onClick={() => setCurrentStep(i)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                i === currentStep ? 'bg-primary text-primary-foreground' : i < currentStep ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-background/20">
                {i + 1}
              </span>
              <span className="hidden sm:inline">{step}</span>
            </button>
          ))}
        </div>

        {/* Step Content */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">{steps[currentStep]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentStep === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextareaField label="Qualidade do Sono" value={anamnese.sono} onChange={(e: any) => setAnamnese({ ...anamnese, sono: e.target.value })} />
                <TextareaField label="Nível de Stress" value={anamnese.stress} onChange={(e: any) => setAnamnese({ ...anamnese, stress: e.target.value })} />
                <TextareaField label="Rotina Diária" value={anamnese.rotina} onChange={(e: any) => setAnamnese({ ...anamnese, rotina: e.target.value })} />
                <TextareaField label="Treino Atual" value={anamnese.treino_atual} onChange={(e: any) => setAnamnese({ ...anamnese, treino_atual: e.target.value })} />
                <TextareaField label="Medicação" value={anamnese.medicacao} onChange={(e: any) => setAnamnese({ ...anamnese, medicacao: e.target.value })} />
                <TextareaField label="Suplementos" value={anamnese.suplementos} onChange={(e: any) => setAnamnese({ ...anamnese, suplementos: e.target.value })} />
                <TextareaField label="Histórico de Saúde" value={anamnese.historico_saude} onChange={(e: any) => setAnamnese({ ...anamnese, historico_saude: e.target.value })} />
                <TextareaField label="Dores" value={anamnese.dores} onChange={(e: any) => setAnamnese({ ...anamnese, dores: e.target.value })} />
                <TextareaField label="Cirurgias" value={anamnese.cirurgias} onChange={(e: any) => setAnamnese({ ...anamnese, cirurgias: e.target.value })} />
                <TextareaField label="Álcool" value={anamnese.alcool} onChange={(e: any) => setAnamnese({ ...anamnese, alcool: e.target.value })} />
                <div className="flex items-center gap-3">
                  <Switch checked={anamnese.tabagismo} onCheckedChange={(v) => setAnamnese({ ...anamnese, tabagismo: v })} />
                  <Label>Tabagismo</Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Perfil de treinamento</Label>
                  <Select value={trainingProfile} onValueChange={(v) => setTrainingProfile(v as TrainingProfile)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRAINING_PROFILES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Contexto populacional / região de referência (opcional)</Label>
                  <Select value={populationContext} onValueChange={(v) => setPopulationContext(v as PopulationContext)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POPULATION_CONTEXTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Usado apenas como contexto de evidência das equações. Não define raça/etnia nem escolhe protocolo sozinho.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Pressão Arterial" value={vitals.pressao} onChange={(e: any) => setVitals({ ...vitals, pressao: e.target.value })} placeholder="120/80" />
                <InputField label="FC Repouso" value={vitals.fc_repouso} onChange={(e: any) => setVitals({ ...vitals, fc_repouso: e.target.value })} unit="bpm" type="number" />
                <InputField label="SpO2" value={vitals.spo2} onChange={(e: any) => setVitals({ ...vitals, spo2: e.target.value })} unit="%" type="number" />
                <InputField label="Glicemia" value={vitals.glicemia} onChange={(e: any) => setVitals({ ...vitals, glicemia: e.target.value })} unit="mg/dL" type="number" />
                <div className="col-span-full">
                  <TextareaField label="Observações" value={vitals.observacoes} onChange={(e: any) => setVitals({ ...vitals, observacoes: e.target.value })} />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                {previousAssessmentDate && (
                  <p className="text-[11px] text-muted-foreground">
                    Comparando com avaliação de {format(previousAssessmentDate, "dd/MM/yyyy")} • clique no valor anterior para preencher
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <InputField label="Peso" value={anthro.peso} onChange={(e: any) => setAnthro({ ...anthro, peso: e.target.value })} unit="kg" type="number" />
                    <PreviousValueHint value={previousAnthro?.peso ?? null} unit="kg" onApply={() => setAnthro({ ...anthro, peso: String(previousAnthro?.peso ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Altura" value={anthro.altura} onChange={(e: any) => setAnthro({ ...anthro, altura: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.altura ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, altura: String(previousAnthro?.altura ?? '') })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">IMC <span className="text-primary">(calculado)</span></Label>
                    <div className="h-10 flex items-center px-3 rounded-md bg-secondary text-sm font-medium gap-2">
                      {calcIMC()}
                      {calcIMC() !== '-' && (() => {
                        const c = classifyIMC(parseFloat(calcIMC()));
                        return <span className={`text-xs ${c.color}`}>• {c.label}</span>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <InputField label="Pescoço" value={anthro.pescoco} onChange={(e: any) => setAnthro({ ...anthro, pescoco: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.pescoco ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, pescoco: String(previousAnthro?.pescoco ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Tórax" value={anthro.torax} onChange={(e: any) => setAnthro({ ...anthro, torax: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.torax ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, torax: String(previousAnthro?.torax ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Ombro" value={anthro.ombro} onChange={(e: any) => setAnthro({ ...anthro, ombro: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.ombro ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, ombro: String(previousAnthro?.ombro ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Cintura" value={anthro.cintura} onChange={(e: any) => setAnthro({ ...anthro, cintura: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.cintura ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, cintura: String(previousAnthro?.cintura ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Abdômen" value={anthro.abdomen} onChange={(e: any) => setAnthro({ ...anthro, abdomen: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.abdomen ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, abdomen: String(previousAnthro?.abdomen ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Quadril" value={anthro.quadril} onChange={(e: any) => setAnthro({ ...anthro, quadril: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.quadril ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, quadril: String(previousAnthro?.quadril ?? '') })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">RCQ <span className="text-primary">(calculado)</span></Label>
                    <div className="h-10 flex items-center px-3 rounded-md bg-secondary text-sm font-medium gap-2">
                      {calcRCQ()}
                      {calcRCQ() !== '-' && (() => {
                        const c = classifyRCQ(parseFloat(calcRCQ()));
                        return <span className={`text-xs ${c.color}`}>• {c.label}</span>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <InputField label="Braço Direito" value={anthro.braco_direito} onChange={(e: any) => setAnthro({ ...anthro, braco_direito: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.braco_direito ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, braco_direito: String(previousAnthro?.braco_direito ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Braço Esquerdo" value={anthro.braco_esquerdo} onChange={(e: any) => setAnthro({ ...anthro, braco_esquerdo: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.braco_esquerdo ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, braco_esquerdo: String(previousAnthro?.braco_esquerdo ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Bíceps Contraído Dir." value={anthro.biceps_contraido_direito} onChange={(e: any) => setAnthro({ ...anthro, biceps_contraido_direito: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.biceps_contraido_direito ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, biceps_contraido_direito: String(previousAnthro?.biceps_contraido_direito ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Bíceps Contraído Esq." value={anthro.biceps_contraido_esquerdo} onChange={(e: any) => setAnthro({ ...anthro, biceps_contraido_esquerdo: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.biceps_contraido_esquerdo ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, biceps_contraido_esquerdo: String(previousAnthro?.biceps_contraido_esquerdo ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Antebraço Dir." value={anthro.antebraco} onChange={(e: any) => setAnthro({ ...anthro, antebraco: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.antebraco ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, antebraco: String(previousAnthro?.antebraco ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Antebraço Esq." value={anthro.antebraco_esquerdo} onChange={(e: any) => setAnthro({ ...anthro, antebraco_esquerdo: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.antebraco_esquerdo ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, antebraco_esquerdo: String(previousAnthro?.antebraco_esquerdo ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Coxa Direita" value={anthro.coxa_direita} onChange={(e: any) => setAnthro({ ...anthro, coxa_direita: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.coxa_direita ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, coxa_direita: String(previousAnthro?.coxa_direita ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Coxa Esquerda" value={anthro.coxa_esquerda} onChange={(e: any) => setAnthro({ ...anthro, coxa_esquerda: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.coxa_esquerda ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, coxa_esquerda: String(previousAnthro?.coxa_esquerda ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Panturrilha Direita" value={anthro.panturrilha_direita} onChange={(e: any) => setAnthro({ ...anthro, panturrilha_direita: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.panturrilha_direita ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, panturrilha_direita: String(previousAnthro?.panturrilha_direita ?? '') })} />
                  </div>
                  <div>
                    <InputField label="Panturrilha Esquerda" value={anthro.panturrilha_esquerda} onChange={(e: any) => setAnthro({ ...anthro, panturrilha_esquerda: e.target.value })} unit="cm" type="number" />
                    <PreviousValueHint value={previousAnthro?.panturrilha_esquerda ?? null} unit="cm" onApply={() => setAnthro({ ...anthro, panturrilha_esquerda: String(previousAnthro?.panturrilha_esquerda ?? '') })} />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <p className="text-[11px] text-muted-foreground">
                  Realize duas aferições por dobra. Se a variação passar de 5%, uma terceira aferição é solicitada e a
                  mediana passa a ser o valor utilizado. Sexo: {studentSex || 'não informado'} • Idade: {ageYears ?? 'não informada'}
                </p>

                <div className="space-y-3">
                  <div className="hidden md:grid md:grid-cols-[150px_1fr_1fr_1fr_110px] gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Dobra</span>
                    <span>Med. 1 (mm)</span>
                    <span>Med. 2 (mm)</span>
                    <span>Med. 3 (mm)</span>
                    <span className="text-center">Utilizado</span>
                  </div>

                  {skinfoldFields.map((key) => {
                    const q = foldQuality[key] as FoldQuality;
                    const prevValue = (previousSkinfolds as any)?.[key] ?? null;
                    const showThird = q.needsThird || !!folds[`${key}_3`];

                    return (
                      <div key={key} className="rounded-lg border border-border/60 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-[150px_1fr_1fr_1fr_110px] gap-3 items-end">
                          <div className="text-sm font-medium text-foreground">{skinfoldFieldLabels[key]}</div>

                          <InputField
                            label="Med. 1" unit="mm" type="number"
                            value={folds[`${key}_1`]}
                            onChange={(e: any) => setFolds({ ...folds, [`${key}_1`]: e.target.value })}
                          />
                          <InputField
                            label="Med. 2" unit="mm" type="number"
                            value={folds[`${key}_2`]}
                            onChange={(e: any) => setFolds({ ...folds, [`${key}_2`]: e.target.value })}
                          />
                          {showThird ? (
                            <InputField
                              label="Med. 3" unit="mm" type="number"
                              value={folds[`${key}_3`]}
                              onChange={(e: any) => setFolds({ ...folds, [`${key}_3`]: e.target.value })}
                            />
                          ) : <div className="hidden md:block" />}

                          <div className="pb-1 text-center min-w-[60px]">
                            <span className="text-[10px] text-muted-foreground block">Utilizado</span>
                            <span className="font-bold text-sm text-primary">
                              {q.usedValue != null ? q.usedValue.toFixed(1).replace('.', ',') : '-'}
                            </span>
                          </div>
                        </div>

                        {q.measurements.length > 0 && (
                          <p className={`mt-2 text-[11px] flex items-center gap-1.5 ${q.status === 'needs_third' ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {q.status === 'needs_third'
                              ? <AlertTriangle className="h-3 w-3" />
                              : <Check className="h-3 w-3 text-primary" />}
                            {q.variationPercent != null && <>Diferença: {q.variationPercent.toFixed(1).replace('.', ',')}% • </>}
                            {qualityStatusLabel(q.status)}
                          </p>
                        )}

                        {prevValue !== null && prevValue !== undefined && (
                          <button
                            type="button"
                            onClick={() => setFolds({ ...folds, [`${key}_1`]: String(prevValue) })}
                            className="mt-2 text-[10px] text-muted-foreground/80 hover:text-primary transition-colors text-left"
                            title="Clique para preencher Med. 1 com o valor anterior"
                          >
                            Anterior: <span className="font-medium text-foreground/70">{String(prevValue).replace('.', ',')} mm</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {pendingThird.length > 0 && (
                  <p className="text-[11px] text-yellow-500">
                    Qualidade da aferição insuficiente em: {pendingThird.map((k) => skinfoldFieldLabels[k]).join(', ')}.
                    Realize a terceira aferição.
                  </p>
                )}

                <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                  <div>
                    <span className="text-xs text-muted-foreground">Soma das dobras medidas: </span>
                    <span className="font-bold text-primary">
                      {totalSum.sum != null ? `${totalSum.sum.toFixed(1).replace('.', ',')} mm` : '—'}
                    </span>
                    <span className="text-[11px] text-muted-foreground"> ({totalSum.sites.length} locais)</span>
                  </div>
                  {selectedEvaluation?.sum != null && (
                    <p className="text-[11px] text-muted-foreground">
                      Σ do protocolo selecionado: {selectedEvaluation.sum.toFixed(1).replace('.', ',')} mm
                    </p>
                  )}
                </div>

                <ProtocolAnalysisCard
                  recommendation={recommendation}
                  selected={metodo}
                  selectedEvaluation={selectedEvaluation}
                  previousProtocol={previousProtocol}
                  onSelect={(value, manual) => { setMetodo(value); setSelectedManually(manual); }}
                />
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-[11px] text-muted-foreground">
                  Medidas de diâmetro ósseo com paquímetro. Não entram no cálculo de % de gordura — são usadas no
                  somatotipo Heath-Carter.
                </p>

                <div className="space-y-1 max-w-[220px]">
                  <Label className="text-xs text-muted-foreground">Unidade do paquímetro</Label>
                  <Select value={caliperUnit} onValueChange={(v) => setCaliperUnit(v as 'mm' | 'cm')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mm">mm</SelectItem>
                      <SelectItem value="cm">cm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <InputField
                      label="Diâmetro biepicondilar do úmero" unit={caliperUnit} type="number"
                      value={breadths.umero}
                      onChange={(e: any) => setBreadths({ ...breadths, umero: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Distância entre os epicôndilos medial e lateral do úmero.
                      {breadthCm.umero != null && ` Armazenado: ${breadthCm.umero.toFixed(2).replace('.', ',')} cm.`}
                    </p>
                    {!umeroPlausible && <p className="text-[11px] text-yellow-500">Valor fora da faixa plausível (4,5–9 cm). Confira a unidade.</p>}
                  </div>
                  <div>
                    <InputField
                      label="Diâmetro biepicondilar do fêmur" unit={caliperUnit} type="number"
                      value={breadths.femur}
                      onChange={(e: any) => setBreadths({ ...breadths, femur: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Distância entre os epicôndilos medial e lateral do fêmur.
                      {breadthCm.femur != null && ` Armazenado: ${breadthCm.femur.toFixed(2).replace('.', ',')} cm.`}
                    </p>
                    {!femurPlausible && <p className="text-[11px] text-yellow-500">Valor fora da faixa plausível (6–12 cm). Confira a unidade.</p>}
                  </div>
                </div>

                <SomatotypeCard somatotype={somatotype} />
              </div>
            )}

            {currentStep === 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Flexões (repetições)" value={performance.pushup} onChange={(e: any) => setPerformance({ ...performance, pushup: e.target.value })} type="number" />
                <InputField label="Prancha (segundos)" value={performance.plank} onChange={(e: any) => setPerformance({ ...performance, plank: e.target.value })} unit="seg" type="number" />
                <InputField label="Cooper 12min (distância)" value={performance.cooper_12min} onChange={(e: any) => setPerformance({ ...performance, cooper_12min: e.target.value })} unit="m" type="number" />
                <InputField label="Salto Vertical" value={performance.salto_vertical} onChange={(e: any) => setPerformance({ ...performance, salto_vertical: e.target.value })} unit="cm" type="number" />
                <InputField label="Agachamento Score (1-5)" value={performance.agachamento_score} onChange={(e: any) => setPerformance({ ...performance, agachamento_score: e.target.value })} type="number" />
                <InputField label="Mobilidade Ombro" value={performance.mobilidade_ombro} onChange={(e: any) => setPerformance({ ...performance, mobilidade_ombro: e.target.value })} />
                <InputField label="Mobilidade Quadril" value={performance.mobilidade_quadril} onChange={(e: any) => setPerformance({ ...performance, mobilidade_quadril: e.target.value })} />
                <InputField label="Mobilidade Tornozelo" value={performance.mobilidade_tornozelo} onChange={(e: any) => setPerformance({ ...performance, mobilidade_tornozelo: e.target.value })} />
                <div className="col-span-full">
                  <TextareaField label="Observações" value={performance.observacoes} onChange={(e: any) => setPerformance({ ...performance, observacoes: e.target.value })} />
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Adicione fotos do aluno para comparação antes/depois nos relatórios.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {photoTypes.map(pt => {
                    const existing = photos.find(p => p.tipo === pt.value);
                    return (
                      <div key={pt.value} className="space-y-1.5">
                        <Label className="text-xs">{pt.label}</Label>
                        {existing ? (
                          <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-secondary/30">
                            <img src={existing.preview} className="w-full h-full object-cover" alt={pt.label} />
                            <button
                              type="button"
                              onClick={() => {
                                URL.revokeObjectURL(existing.preview);
                                setPhotos(prev => prev.filter(p => p.tipo !== pt.value));
                              }}
                              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/30 bg-secondary/10 gap-2 p-2">
                            <label className="flex flex-col items-center justify-center cursor-pointer hover:text-primary transition-colors w-full">
                              <Camera className="w-6 h-6 text-muted-foreground mb-0.5" />
                              <span className="text-[10px] text-muted-foreground">Tirar Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setPhotos(prev => [...prev.filter(p => p.tipo !== pt.value), {
                                      tipo: pt.value,
                                      file,
                                      preview: URL.createObjectURL(file),
                                    }]);
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <div className="w-full border-t border-muted-foreground/20" />
                            <label className="flex flex-col items-center justify-center cursor-pointer hover:text-primary transition-colors w-full">
                              <Upload className="w-6 h-6 text-muted-foreground mb-0.5" />
                              <span className="text-[10px] text-muted-foreground">Galeria</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setPhotos(prev => [...prev.filter(p => p.tipo !== pt.value), {
                                      tipo: pt.value,
                                      file,
                                      preview: URL.createObjectURL(file),
                                    }]);
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Análise física integrada</h3>

                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">1. Composição corporal</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Protocolo</span>
                        <span className="font-bold">{selectedProtocol ? PROTOCOLS[selectedProtocol].label : (metodo === 'manual' ? 'Manual' : '—')}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">% Gordura (estimativa)</span>
                        <span className="font-bold text-primary">{bodyFat != null ? `${bodyFat.toFixed(1).replace('.', ',')}%` : '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Compatibilidade</span>
                        <span className="font-bold">{selectedEvaluation ? COMPATIBILITY_LABEL[selectedEvaluation.compatibility] : '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Massa gorda</span>
                        <span className="font-bold">{massaGorda != null ? `${massaGorda} kg` : '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Massa livre de gordura</span>
                        <span className="font-bold">{massaMagra != null ? `${massaMagra} kg` : '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Soma das dobras</span>
                        <span className="font-bold">{totalSum.sum != null ? `${totalSum.sum.toFixed(1).replace('.', ',')} mm` : '—'}</span>
                      </div>
                    </div>
                    {previousProtocol && selectedProtocol && previousProtocol !== selectedProtocol && (
                      <p className="text-[11px] text-yellow-500">Protocolo diferente da avaliação anterior.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">2. Perfil antropométrico</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Peso</span>
                        <span className="font-bold">{anthro.peso || '-'} kg</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Altura</span>
                        <span className="font-bold">{anthro.altura || '-'} cm</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">IMC</span>
                        <span className="font-bold">{calcIMC()}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Cintura</span>
                        <span className="font-bold">{anthro.cintura || '-'} cm</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Quadril</span>
                        <span className="font-bold">{anthro.quadril || '-'} cm</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">RCQ</span>
                        <span className="font-bold">{calcRCQ()}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50">
                        <span className="block text-[10px] text-muted-foreground">Úmero / Fêmur</span>
                        <span className="font-bold">
                          {breadthCm.umero != null ? `${breadthCm.umero.toFixed(2).replace('.', ',')}` : '—'} /{' '}
                          {breadthCm.femur != null ? `${breadthCm.femur.toFixed(2).replace('.', ',')}` : '—'} cm
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 p-3 space-y-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">3. Somatotipo</span>
                    <SomatotypeCard somatotype={somatotype} compact />
                  </div>
                </div>

                <TextareaField label="Notas Gerais" value={notasGerais} onChange={(e: any) => setNotasGerais(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={() => setCurrentStep(currentStep + 1)}>
              Próximo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="font-semibold">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {editId ? 'Atualizar Avaliação' : 'Salvar Avaliação'}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default NovaAvaliacao;
