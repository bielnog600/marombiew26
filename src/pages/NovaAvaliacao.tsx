import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import { ArrowLeft, ArrowRight, Save, Loader2, CalendarIcon, Camera, X, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcAuto, calcProtocol, PROTOCOLS, type ProtocolId, type SkinfoldKey } from '@/lib/skinfoldProtocols';

const steps = [
  'Anamnese',
  'Sinais Vitais',
  'Antropometria',
  'Dobras Cutâneas',
  'Testes Físicos',
  'Fotos',
  'Resumo',
];

const skinfoldFieldLabels: Record<string, string> = {
  triceps: 'Tríceps',
  subescapular: 'Subescapular',
  suprailiaca: 'Suprailíaca',
  abdominal: 'Abdominal',
  peitoral: 'Peitoral',
  axilar_media: 'Axilar Média',
  coxa: 'Coxa',
  biceps: 'Bíceps',
  panturrilha_medial: 'Panturrilha Medial',
};

const skinfoldFields = ['triceps', 'subescapular', 'suprailiaca', 'abdominal', 'peitoral', 'axilar_media', 'coxa', 'biceps', 'panturrilha_medial'] as const;

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
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

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
      // Auto-fill height from profile if not editing and field is empty
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

  const [skinfolds, setSkinfolds] = useState({
    metodo: 'auto' as ProtocolId,
    triceps_1: '', triceps_2: '',
    subescapular_1: '', subescapular_2: '',
    suprailiaca_1: '', suprailiaca_2: '',
    abdominal_1: '', abdominal_2: '',
    peitoral_1: '', peitoral_2: '',
    axilar_media_1: '', axilar_media_2: '',
    coxa_1: '', coxa_2: '',
    biceps_1: '', biceps_2: '',
    panturrilha_medial_1: '', panturrilha_medial_2: '',
  });

  const avgSk = (key: string): string => {
    const v1 = parseFloat((skinfolds as any)[`${key}_1`]);
    const v2 = parseFloat((skinfolds as any)[`${key}_2`]);
    if (!isNaN(v1) && !isNaN(v2) && v1 > 0 && v2 > 0) return ((v1 + v2) / 2).toFixed(1);
    if (!isNaN(v1) && v1 > 0) return v1.toString();
    if (!isNaN(v2) && v2 > 0) return v2.toString();
    return '';
  };

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
        return;
      }
      setPreviousAssessmentDate(new Date(prev.created_at));

      const [aRes, sRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', prev.id).maybeSingle(),
        supabase.from('skinfolds').select('*').eq('assessment_id', prev.id).maybeSingle(),
      ]);
      setPreviousAnthro((aRes.data as any) ?? null);
      setPreviousSkinfolds((sRes.data as any) ?? null);
    };
    loadPrevious();
  }, [studentId, editId]);

  const str = (v: any) => (v != null && v !== '' ? String(v) : '');

  useEffect(() => {
    if (!editId) return;
    const loadExisting = async () => {
      setLoading(true);
      try {
        const [aRes, vRes, anthRes, skRes, perfRes, assessRes] = await Promise.all([
          supabase.from('anamnese').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('vitals').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('anthropometrics').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('skinfolds').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('performance_tests').select('*').eq('assessment_id', editId).maybeSingle(),
          supabase.from('assessments').select('notas_gerais, created_at').eq('id', editId).maybeSingle(),
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
        if (skRes.data) {
          const d = skRes.data;
          setSkinfolds({
            metodo: ((d.metodo as ProtocolId) || 'auto'),
            triceps_1: str(d.triceps), triceps_2: '',
            subescapular_1: str(d.subescapular), subescapular_2: '',
            suprailiaca_1: str(d.suprailiaca), suprailiaca_2: '',
            abdominal_1: str(d.abdominal), abdominal_2: '',
            peitoral_1: str(d.peitoral), peitoral_2: '',
            axilar_media_1: str(d.axilar_media), axilar_media_2: '',
            coxa_1: str(d.coxa), coxa_2: '',
            biceps_1: str((d as any).biceps), biceps_2: '',
            panturrilha_medial_1: str((d as any).panturrilha_medial), panturrilha_medial_2: '',
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

  // Cálculos
  const calcIMC = () => {
    const p = parseFloat(anthro.peso);
    const h = parseFloat(anthro.altura) / 100;
    if (p > 0 && h > 0) return (p / (h * h)).toFixed(1);
    return '-';
  };

  const calcRCQ = () => {
    const c = parseFloat(anthro.cintura);
    const q = parseFloat(anthro.quadril);
    if (c > 0 && q > 0) return (c / q).toFixed(3);
    return '-';
  };

  // Body fat calculation — uses skinfoldProtocols lib (supports auto-pick + 6 protocols).
  const computeBodyFat = (): { bf: number | null; protocol: ProtocolId; reason?: string } => {
    if (skinfolds.metodo === 'manual') return { bf: null, protocol: 'manual' };
    const calcAge = (): number | null => {
      if (!studentBirthDate) return null;
      let age = (dataAvaliacao || new Date()).getFullYear() - studentBirthDate.getFullYear();
      const ref = dataAvaliacao || new Date();
      const monthDiff = ref.getMonth() - studentBirthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < studentBirthDate.getDate())) age--;
      return age > 0 ? age : null;
    };
    const parseNum = (s: string) => {
      const n = parseFloat((s || '').replace(',', '.'));
      return isNaN(n) ? undefined : n;
    };
    const values: Partial<Record<SkinfoldKey, number>> = {};
    for (const k of skinfoldFields) {
      const v = parseNum(avgSk(k));
      if (v != null) (values as any)[k] = v;
    }
    const input = { sex: studentSex, ageYears: calcAge(), values };
    if (skinfolds.metodo === 'auto') {
      const r = calcAuto(input);
      return { bf: r.bodyFat, protocol: r.autoPicked, reason: r.reason };
    }
    const r = calcProtocol(skinfolds.metodo as any, input);
    return { bf: r.bodyFat, protocol: skinfolds.metodo, reason: r.reason };
  };

  const calcGordura = () => {
    const r = computeBodyFat();
    return r.bf != null ? r.bf.toFixed(1) : '-';
  };

  const handleSave = async () => {
    if (!studentId || !user) return;
    setSaving(true);

    try {
      const imc = calcIMC();
      const rcq = calcRCQ();
      const gordura = calcGordura();

      let aid: string;

      if (editId) {
        // Update existing assessment
        const { error: aErr } = await supabase
          .from('assessments')
          .update({ notas_gerais: notasGerais, created_at: dataAvaliacao.toISOString() })
          .eq('id', editId);
        if (aErr) throw aErr;
        aid = editId;

        // Delete existing sub-table data then re-insert
        await Promise.all([
          supabase.from('anamnese').delete().eq('assessment_id', aid),
          supabase.from('vitals').delete().eq('assessment_id', aid),
          supabase.from('anthropometrics').delete().eq('assessment_id', aid),
          supabase.from('skinfolds').delete().eq('assessment_id', aid),
          supabase.from('composition').delete().eq('assessment_id', aid),
          supabase.from('performance_tests').delete().eq('assessment_id', aid),
        ]);
      } else {
        // Create new assessment
        const { data: assessment, error: aErr } = await supabase
          .from('assessments')
          .insert({ student_id: studentId, avaliador_id: user.id, notas_gerais: notasGerais, created_at: dataAvaliacao.toISOString() } as any)
          .select()
          .single();
        if (aErr) throw aErr;
        aid = assessment.id;
      }

      // Insert sub-tables
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
          peso: anthro.peso ? parseFloat(anthro.peso) : null,
          altura: anthro.altura ? parseFloat(anthro.altura) : null,
          imc: imc !== '-' ? parseFloat(imc) : null,
          cintura: anthro.cintura ? parseFloat(anthro.cintura) : null,
          quadril: anthro.quadril ? parseFloat(anthro.quadril) : null,
          rcq: rcq !== '-' ? parseFloat(rcq) : null,
          pescoco: anthro.pescoco ? parseFloat(anthro.pescoco) : null,
          braco_direito: anthro.braco_direito ? parseFloat(anthro.braco_direito) : null,
          braco_esquerdo: anthro.braco_esquerdo ? parseFloat(anthro.braco_esquerdo) : null,
          antebraco: anthro.antebraco ? parseFloat(anthro.antebraco) : null,
          antebraco_esquerdo: anthro.antebraco_esquerdo ? parseFloat(anthro.antebraco_esquerdo) : null,
          ombro: anthro.ombro ? parseFloat(anthro.ombro) : null,
          torax: anthro.torax ? parseFloat(anthro.torax) : null,
          abdomen: anthro.abdomen ? parseFloat(anthro.abdomen) : null,
          coxa_direita: anthro.coxa_direita ? parseFloat(anthro.coxa_direita) : null,
          coxa_esquerda: anthro.coxa_esquerda ? parseFloat(anthro.coxa_esquerda) : null,
          panturrilha_direita: anthro.panturrilha_direita ? parseFloat(anthro.panturrilha_direita) : null,
          panturrilha_esquerda: anthro.panturrilha_esquerda ? parseFloat(anthro.panturrilha_esquerda) : null,
          biceps_contraido_direito: anthro.biceps_contraido_direito ? parseFloat(anthro.biceps_contraido_direito) : null,
          biceps_contraido_esquerdo: anthro.biceps_contraido_esquerdo ? parseFloat(anthro.biceps_contraido_esquerdo) : null,
        } as any),
        supabase.from('skinfolds').insert({
          assessment_id: aid,
          metodo: skinfolds.metodo,
          triceps: avgSk('triceps') ? parseFloat(avgSk('triceps')) : null,
          subescapular: avgSk('subescapular') ? parseFloat(avgSk('subescapular')) : null,
          suprailiaca: avgSk('suprailiaca') ? parseFloat(avgSk('suprailiaca')) : null,
          abdominal: avgSk('abdominal') ? parseFloat(avgSk('abdominal')) : null,
          peitoral: avgSk('peitoral') ? parseFloat(avgSk('peitoral')) : null,
          axilar_media: avgSk('axilar_media') ? parseFloat(avgSk('axilar_media')) : null,
          coxa: avgSk('coxa') ? parseFloat(avgSk('coxa')) : null,
        }),
        supabase.from('composition').insert({
          assessment_id: aid,
          percentual_gordura: gordura !== '-' ? parseFloat(gordura) : null,
          massa_magra: gordura !== '-' && anthro.peso ? parseFloat((parseFloat(anthro.peso) * (1 - parseFloat(gordura) / 100)).toFixed(1)) : null,
          massa_gorda: gordura !== '-' && anthro.peso ? parseFloat((parseFloat(anthro.peso) * parseFloat(gordura) / 100).toFixed(1)) : null,
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
      ]);

      // Upload photos
      if (photos.length > 0) {
        // Delete existing photos if editing
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
                <div className="space-y-2">
                  <Label>Método de Cálculo</Label>
                  <Select value={skinfolds.metodo} onValueChange={(v) => setSkinfolds({ ...skinfolds, metodo: v as ProtocolId })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">⚡ Automático (recomendado p/ aluno)</SelectItem>
                      <SelectItem value="jackson_pollock_3">Jackson & Pollock 3 Dobras</SelectItem>
                      <SelectItem value="jackson_pollock_7">Jackson & Pollock 7 Dobras</SelectItem>
                      <SelectItem value="guedes_3">Guedes 3 Dobras (BR)</SelectItem>
                      <SelectItem value="petroski_4">Petroski 4 Dobras (BR)</SelectItem>
                      <SelectItem value="faulkner_4">Faulkner 4 Dobras</SelectItem>
                      <SelectItem value="durnin_4">Durnin & Womersley 4 Dobras</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  {skinfolds.metodo !== 'manual' && skinfolds.metodo !== 'auto' && (
                    <p className="text-[11px] text-muted-foreground">
                      {PROTOCOLS[skinfolds.metodo as Exclude<ProtocolId,'auto'|'manual'>]?.description}
                    </p>
                  )}
                  {skinfolds.metodo === 'auto' && (
                    <p className="text-[11px] text-muted-foreground">
                      A IA escolhe o protocolo ideal com base em sexo, idade e dobras preenchidas.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="hidden md:grid md:grid-cols-[160px_1fr_1fr_90px] gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Dobra</span>
                    <span>Med. 1 (mm)</span>
                    <span>Med. 2 (mm)</span>
                    <span className="text-center">Média</span>
                  </div>

                  {skinfoldFields.map((key) => {
                    const avg = avgSk(key);
                    const prevValue = (previousSkinfolds as any)?.[key] ?? null;

                    return (
                      <div key={key} className="rounded-lg border border-border/60 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr_90px] gap-3 items-end">
                          <div className="text-sm font-medium text-foreground">{skinfoldFieldLabels[key]}</div>

                          <InputField
                            label="Med. 1"
                            value={(skinfolds as any)[`${key}_1`]}
                            onChange={(e: any) => setSkinfolds({ ...skinfolds, [`${key}_1`]: e.target.value })}
                            unit="mm"
                            type="number"
                          />

                          <InputField
                            label="Med. 2"
                            value={(skinfolds as any)[`${key}_2`]}
                            onChange={(e: any) => setSkinfolds({ ...skinfolds, [`${key}_2`]: e.target.value })}
                            unit="mm"
                            type="number"
                          />

                          <div className="pb-1 text-center min-w-[60px]">
                            <span className="text-[10px] text-muted-foreground block">Média</span>
                            <span className="font-bold text-sm text-primary">{avg || '-'}</span>
                          </div>
                        </div>
                        {prevValue !== null && prevValue !== undefined && (
                          <button
                            type="button"
                            onClick={() =>
                              setSkinfolds({
                                ...skinfolds,
                                [`${key}_1`]: String(prevValue),
                              })
                            }
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
                {previousAssessmentDate && (
                  <p className="text-[11px] text-muted-foreground">
                    Comparando dobras com avaliação de {format(previousAssessmentDate, "dd/MM/yyyy")}
                  </p>
                )}
                <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                  <div>
                    <span className="text-xs text-muted-foreground">% Gordura Estimado: </span>
                    <span className="font-bold text-primary">{calcGordura()}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Método: {skinfolds.metodo === 'jackson_pollock_7' ? 'Pollock 7' : skinfolds.metodo === 'jackson_pollock_3' ? 'Pollock 3' : 'Manual'} • Sexo: {studentSex || 'não informado'} • Idade: {studentBirthDate ? (() => {
                      let age = dataAvaliacao.getFullYear() - studentBirthDate.getFullYear();
                      const monthDiff = dataAvaliacao.getMonth() - studentBirthDate.getMonth();
                      if (monthDiff < 0 || (monthDiff === 0 && dataAvaliacao.getDate() < studentBirthDate.getDate())) age--;
                      return age;
                    })() : 'não informada'}
                  </p>
                </div>
              </div>
            )}

            {currentStep === 4 && (
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

            {currentStep === 5 && (
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

            {currentStep === 6 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Peso</span>
                    <span className="font-bold">{anthro.peso || '-'} kg</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">IMC</span>
                    <span className="font-bold">{calcIMC()}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">% Gordura</span>
                    <span className="font-bold text-primary">{calcGordura()}%</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Cintura</span>
                    <span className="font-bold">{anthro.cintura || '-'} cm</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">Quadril</span>
                    <span className="font-bold">{anthro.quadril || '-'} cm</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <span className="text-muted-foreground block text-xs">RCQ</span>
                    <span className="font-bold">{calcRCQ()}</span>
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
