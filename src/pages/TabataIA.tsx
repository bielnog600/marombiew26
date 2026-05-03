import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, Flame, Shield, Zap, Sparkles, Play, Pencil, Check, X, Plus, Trash2, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseTabata, type ParsedTabata } from '@/lib/tabataParser';
import { serializeTabata } from '@/lib/tabataSerializer';
import { TabataStructuredEditor } from '@/components/tabata/TabataStructuredEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AiWizard from '@/components/AiWizard';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import { Badge } from '@/components/ui/badge';

type StudentCtx = Record<string, any>;

const INTENSITIES = [
  { value: 'auto', label: 'Automático', desc: 'IA decide com base no perfil', icon: Sparkles, color: 'text-primary' },
  { value: 'adaptado', label: 'Adaptado', desc: 'Baixo impacto, seguro', icon: Shield, color: 'text-green-500' },
  { value: 'moderado', label: 'Moderado', desc: 'Intensidade média', icon: Flame, color: 'text-orange-500' },
  { value: 'intenso', label: 'Intenso', desc: 'Alta intensidade', icon: Zap, color: 'text-red-500' },
];

const STYLES = [
  { value: 'auto', label: 'Automático (IA decide)' },
  { value: 'complementar_musculacao', label: 'Complementar à Musculação (full body)' },
  { value: 'em_casa', label: 'Em Casa (peso corporal, sem equipamento)' },
  { value: 'queima_gordura', label: 'Queima de Gordura (alto gasto calórico)' },
  { value: 'condicionamento', label: 'Condicionamento Cardiovascular' },
  { value: 'forca_resistencia', label: 'Força-Resistência (com halteres/kettlebell)' },
  { value: 'core_abs', label: 'Core / Abdômen' },
  { value: 'membros_inferiores', label: 'Foco em Membros Inferiores' },
  { value: 'membros_superiores', label: 'Foco em Membros Superiores' },
];

const WORK_OPTIONS = ['auto', '20', '30', '40', '45'];
const REST_OPTIONS = ['auto', '10', '15', '20', '30'];
const DURATION_OPTIONS = ['auto', '10', '15', '20', '25', '30', '40'];
const ROUNDS_OPTIONS = ['auto', '4', '6', '8', '10'];

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const FOCUS_OPTIONS = [
  { value: 'auto', label: 'Automático (IA decide)' },
  { value: 'inferiores', label: 'Mais Inferiores' },
  { value: 'superiores', label: 'Mais Superiores' },
  { value: 'core_abs', label: 'Mais Abdominais / Core' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'posterior', label: 'Mais Posterior (Costas/Glúteos)' },
  { value: 'cardio_puro', label: 'Cardio Puro' },
];

interface TabataDayConfig {
  dayLabel: string;
  focus: string;
  fromWorkout?: string; // original workout day name if auto-detected
}

const TabataIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPlanId = searchParams.get('edit');

  const [studentCtx, setStudentCtx] = useState<StudentCtx | null>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [loading, setLoading] = useState(true);
  const [intensity, setIntensity] = useState('auto');
  const [style, setStyle] = useState('auto');
  const [workSec, setWorkSec] = useState('auto');
  const [restSec, setRestSec] = useState('auto');
  const [totalDuration, setTotalDuration] = useState('auto');
  const [rounds, setRounds] = useState('auto');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<ParsedTabata | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  // Multi-day state
  const [workoutDays, setWorkoutDays] = useState<{ dayName: string; muscleHint: string }[]>([]);
  const [hasWorkoutPlan, setHasWorkoutPlan] = useState(false);
  const [tabataDays, setTabataDays] = useState<TabataDayConfig[]>([]);
  const [multiResults, setMultiResults] = useState<{ dayLabel: string; content: string }[]>([]);
  const [currentGenDay, setCurrentGenDay] = useState(0);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (editPlanId) loadEditPlan();
  }, [editPlanId]);

  useEffect(() => {
    if ((result || multiResults.length) && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result, multiResults]);

  const loadEditPlan = async () => {
    const { data } = await supabase.from('ai_plans').select('*').eq('id', editPlanId!).maybeSingle();
    if (data) setResult(data.conteudo);
  };

  const loadStudentData = async () => {
    setLoading(true);
    const [profileRes, spRes, assessRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('assessments').select('id').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;

    let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null;
    let performance: any = null;

    if (latestAssessmentId) {
      const [a, c, v, an, pf] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      ]);
      anthro = a.data; comp = c.data; vitals = v.data; anamnese = an.data; performance = pf.data;
    }

    setStudentCtx({
      nome: profile?.nome,
      sexo: sp?.sexo,
      data_nascimento: sp?.data_nascimento,
      altura: sp?.altura || anthro?.altura,
      objetivo: sp?.objetivo,
      restricoes: sp?.restricoes,
      lesoes: sp?.lesoes,
      observacoes: sp?.observacoes,
      peso: anthro?.peso,
      imc: anthro?.imc,
      percentual_gordura: comp?.percentual_gordura,
      vitals,
      anamnese,
      performance,
    });
    setStudentName(profile?.nome || 'Aluno');
    setLoading(false);

    // Check for existing workout (musculação) plan
    const { data: treinoPlan } = await supabase
      .from('ai_plans')
      .select('conteudo')
      .eq('student_id', studentId!)
      .eq('tipo', 'treino')
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (treinoPlan?.conteudo) {
      const sections = parseTrainingSections(treinoPlan.conteudo);
      const trainingSection = sections.find(s => s.type === 'training' && s.days?.length);
      if (trainingSection?.days?.length) {
        const detected = trainingSection.days.map(d => {
          const dayName = d.day || '';
          const muscleHint = detectMuscleGroup(dayName);
          return { dayName, muscleHint };
        });
        setWorkoutDays(detected);
        setHasWorkoutPlan(true);
        // Auto-configure tabata days from workout
        setTabataDays(detected.map((d, i) => ({
          dayLabel: WEEKDAYS[i] || `Dia ${i + 1}`,
          focus: muscleToFocus(d.muscleHint),
          fromWorkout: d.dayName,
        })));
        return;
      }
    }

    // No workout plan — default to 3 days
    setHasWorkoutPlan(false);
    setTabataDays([
      { dayLabel: 'Segunda', focus: 'auto' },
      { dayLabel: 'Quarta', focus: 'auto' },
      { dayLabel: 'Sexta', focus: 'auto' },
    ]);
  };

  // Helper: detect muscle group from day name like "Segunda - Inferiores (A)"
  function detectMuscleGroup(dayName: string): string {
    const lower = dayName.toLowerCase();
    if (/inferior|perna|quadr[ií]cep|glút|glute|posterior|panturr/i.test(lower)) return 'inferiores';
    if (/superior|peito|peitoral|costas|dorsal|ombro|delt[oó]id|b[ií]cep|tr[ií]cep|bra[çc]o/i.test(lower)) return 'superiores';
    if (/abd[oô]m|core|prancha/i.test(lower)) return 'core_abs';
    if (/full|completo|corpo todo|total/i.test(lower)) return 'full_body';
    return 'auto';
  }

  function muscleToFocus(muscle: string): string {
    if (FOCUS_OPTIONS.some(f => f.value === muscle)) return muscle;
    return 'auto';
  }

  const addDay = () => {
    const usedDays = new Set(tabataDays.map(d => d.dayLabel));
    const nextDay = WEEKDAYS.find(d => !usedDays.has(d)) || `Dia ${tabataDays.length + 1}`;
    setTabataDays(prev => [...prev, { dayLabel: nextDay, focus: 'auto' }]);
  };

  const removeDay = (index: number) => {
    setTabataDays(prev => prev.filter((_, i) => i !== index));
  };

  const updateDayFocus = (index: number, focus: string) => {
    setTabataDays(prev => prev.map((d, i) => i === index ? { ...d, focus } : d));
  };

  const updateDayLabel = (index: number, dayLabel: string) => {
    setTabataDays(prev => prev.map((d, i) => i === index ? { ...d, dayLabel } : d));
  };

  const generateTabata = async () => {
    if (!studentCtx) return;
    if (tabataDays.length === 0) {
      toast.error('Adicione pelo menos 1 dia de TABATA');
      return;
    }
    setGenerating(true);
    setResult('');
    setMultiResults([]);

    try {
      // Fetch functional exercises with video — exclude machines/bars
      const { data: allEx } = await supabase
        .from('exercises')
        .select('nome, grupo_muscular, video_embed')
        .not('video_embed', 'is', null);

      const FORBIDDEN = /\b(SMITH|HACK|MÁQ|MAQ|MACHINE|GRAVITON|PECK|CROSSOVER|MESA FLEXORA|CADEIRA|POLIA|CABO|LEG PRESS|PULL DOWN|PULLDOWN|BARRA(?!\s+W$)|FIXA)\b/i;
      const ALLOWED_GROUPS = new Set(['CARDIO', 'ABDOMEN', 'ADUTORES', 'GLÚTEOS', 'GLUTEOS', 'POSTERIOR', 'QUADRÍCEPS', 'QUADRICEPS', 'PEITORAL', 'DORSAL', 'DELTÓIDES', 'DELTOIDES', 'BÍCEPS', 'BICEPS', 'TRÍCEPS', 'TRICEPS', 'PANTURRILHA']);

      const availableExercises = (allEx || []).filter(ex => {
        if (!ex?.nome || !ex?.video_embed) return false;
        if (FORBIDDEN.test(ex.nome)) return false;
        // Allow halteres/kettlebell/peso corporal/livre/cardio/abdomen
        const isFunctional = /HALTER|KETTLEBELL|CORDA|SWING|BURPEE|MOUTAIN|MOUNTAIN|POLICHINELO|SKIP|JUMPING|PRANCHA|FLEX|AGACH|AFUNDO|ABDOMINAL|ABS|ALONGAMENTO|MOBILIDADE|BIKE|REMO|ESCADA|ESTEIRA|PASSADEIRA|ELÍPTICO|ELIPTICO|SKI|AIR BIKE/i.test(ex.nome);
        return isFunctional || ALLOWED_GROUPS.has((ex.grupo_muscular || '').toUpperCase());
      });

      const results: { dayLabel: string; content: string }[] = [];

      for (let i = 0; i < tabataDays.length; i++) {
        const day = tabataDays[i];
        setCurrentGenDay(i);

        // Build focus instruction for this day
        const focusMap: Record<string, string> = {
          inferiores: 'FOCO OBRIGATÓRIO: Membros INFERIORES (agachamentos, lunges, jumps, glúteos). Pode incluir abdominais como complemento.',
          superiores: 'FOCO OBRIGATÓRIO: Membros SUPERIORES (flexões, push press, renegade row, pike push-up, ombros, braços).',
          core_abs: 'FOCO OBRIGATÓRIO: CORE e ABDOMINAIS (pranchas, mountain climbers, sit-ups, russian twists, v-ups).',
          full_body: 'FOCO: FULL BODY funcional, misturando membros superiores, inferiores e core.',
          posterior: 'FOCO: CADEIA POSTERIOR (glúteos, isquiotibiais, costas). Stiff com halteres, hip thrust, good morning, renegade row.',
          cardio_puro: 'FOCO: CARDIO PURO (burpees, jumping jacks, mountain climbers, skips, corrida estacionária). Máximo gasto calórico.',
        };

        const dayFocusNote = day.focus !== 'auto' ? focusMap[day.focus] || '' : '';
        const workoutRef = day.fromWorkout ? `Este TABATA é para o dia "${day.fromWorkout}" da musculação do aluno. Gere exercícios que COMPLEMENTEM esse treino de musculação.` : '';
        const dayNotes = [
          `DIA: ${day.dayLabel}${day.fromWorkout ? ` (Musculação: ${day.fromWorkout})` : ''}`,
          dayFocusNote,
          workoutRef,
          notes,
        ].filter(Boolean).join('\n');

        const dayStyle = day.focus !== 'auto' && day.focus !== 'full_body' && day.focus !== 'cardio_puro'
          ? (day.focus === 'inferiores' ? 'membros_inferiores' :
             day.focus === 'superiores' ? 'membros_superiores' :
             day.focus === 'core_abs' ? 'core_abs' :
             day.focus === 'posterior' ? 'membros_inferiores' : style)
          : style;

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tabata-agent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              studentContext: studentCtx,
              intensity,
              notes: dayNotes,
              availableExercises,
              style: dayStyle,
              workSec,
              restSec,
              totalDuration,
              rounds,
            }),
          }
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: 'Erro' }));
          if (resp.status === 429) { toast.error('Muitas requisições. Aguarde um momento.'); break; }
          else if (resp.status === 402) { toast.error('Créditos esgotados.'); break; }
          else throw new Error(err.error || `Erro ${resp.status}`);
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
              if (content) {
                accumulated += content;
                setResult(accumulated);
              }
            } catch {
              textBuffer = line + '\n' + textBuffer;
              break;
            }
          }
        }

        results.push({ dayLabel: day.dayLabel, content: accumulated });
        setMultiResults([...results]);
        setResult('');
      }

      setMultiResults(results);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao gerar TABATA');
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = async () => {
    if (multiResults.length === 0) return;
    setSavingAll(true);

    let errCount = 0;
    for (const mr of multiResults) {
      const parsed = parseTabata(mr.content);
      const titulo = `${mr.dayLabel} — ${parsed.title || 'TABATA'}`;

      const { error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'tabata',
        titulo,
        conteudo: mr.content,
      });
      if (error) { errCount++; console.error(error); }
    }

    if (errCount === 0) toast.success(`${multiResults.length} TABATA(s) salvos!`);
    else toast.error(`${errCount} erro(s) ao salvar`);

    setSavingAll(false);
  };

  if (loading) {
    return (
      <AppLayout title="TABATA IA">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`TABATA IA - ${studentName}`}>
      <div className="space-y-6 animate-fade-in pb-24">
        <Button variant="ghost" onClick={() => navigate(`/alunos/${studentId}`)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        <Card className="glass-card border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Flame className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold">TABATA IA</h2>
                <p className="text-xs text-muted-foreground">Treino HIIT personalizado para {studentName}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!editPlanId && (() => {
          const STEP_TITLES = ['Dias de Treino', 'Intensidade', 'Estilo', 'Tempo e Estrutura', 'Observações'];
          const stepValid = [
            tabataDays.length > 0,
            !!intensity,
            !!style,
            !!workSec && !!restSec && !!rounds && !!totalDuration,
            true,
          ];
          return (
            <AiWizard
              steps={STEP_TITLES}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              stepValid={stepValid}
              canGenerate={!!intensity}
              generating={generating}
              onGenerate={generateTabata}
              generateLabel={`Gerar ${tabataDays.length} TABATA(s)`}
              generateIcon={<Sparkles className="h-5 w-5" />}
            >
              {currentStep === 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Dias de TABATA
          </Label>

          {hasWorkoutPlan && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
              <Dumbbell className="h-4 w-4 text-green-400 shrink-0" />
              <p className="text-xs text-green-300">
                Treino de musculação detectado! Os dias e focos foram preenchidos automaticamente.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {tabataDays.map((day, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
                <Select value={day.dayLabel} onValueChange={(v) => updateDayLabel(i, v)}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {WEEKDAYS.map(w => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={day.focus} onValueChange={(v) => updateDayFocus(i, v)}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {FOCUS_OPTIONS.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {day.fromWorkout && (
                  <Badge variant="secondary" className="text-[10px] shrink-0 hidden sm:inline-flex">
                    {day.fromWorkout}
                  </Badge>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeDay(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {tabataDays.length < 7 && (
            <Button variant="outline" size="sm" onClick={addDay} className="gap-1 w-full">
              <Plus className="h-3.5 w-3.5" /> Adicionar Dia
            </Button>
          )}
        </div>
              )}

              {currentStep === 1 && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Intensidade</Label>
          <div className="grid grid-cols-2 gap-2">
            {INTENSITIES.map(opt => {
              const Icon = opt.icon;
              const selected = intensity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIntensity(opt.value)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    selected
                      ? "border-primary bg-primary/10 shadow-md"
                      : "border-border bg-card hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", opt.color)} />
                    <span className="text-sm font-bold">{opt.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
              )}

              {currentStep === 2 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Estilo do TABATA (opcional)
          </Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Ex.: "Em Casa" para alunos sem acesso ao ginásio; "Complementar à Musculação" para finalizar treinos de academia.
          </p>
        </div>
              )}

              {currentStep === 3 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Tempo &amp; Estrutura (opcional)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Trabalho (s)</Label>
              <Select value={workSec} onValueChange={setWorkSec}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {WORK_OPTIONS.map(v => <SelectItem key={v} value={v}>{v === 'auto' ? 'Auto' : `${v}s`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Descanso (s)</Label>
              <Select value={restSec} onValueChange={setRestSec}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {REST_OPTIONS.map(v => <SelectItem key={v} value={v}>{v === 'auto' ? 'Auto' : `${v}s`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Rounds por bloco</Label>
              <Select value={rounds} onValueChange={setRounds}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {ROUNDS_OPTIONS.map(v => <SelectItem key={v} value={v}>{v === 'auto' ? 'Auto' : v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Duração total (min)</Label>
              <Select value={totalDuration} onValueChange={setTotalDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {DURATION_OPTIONS.map(v => <SelectItem key={v} value={v}>{v === 'auto' ? 'Auto' : `${v} min`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
              )}

              {currentStep === 4 && (
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Observações (opcional)
          </Label>
          <Textarea
            id="notes"
            placeholder="Foco específico, ex: 'priorizar membros inferiores', 'treino curto de 15min'..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
              )}
            </AiWizard>
          );
        })()}

        {/* Streaming current day */}
        {/* Edit single plan */}
        {editPlanId && result && !generating && (
          <div ref={resultRef} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Edição</h3>
              <div className="flex gap-2 flex-wrap">
                {editing ? (
                  <>
                    <Button onClick={() => { if (editDraft) { setResult(serializeTabata(editDraft)); toast.success('Edições aplicadas'); } setEditing(false); }} size="sm" className="gap-1"><Check className="h-4 w-4" /> Aplicar</Button>
                    <Button onClick={() => { setEditing(false); setEditDraft(null); }} size="sm" variant="outline" className="gap-1"><X className="h-4 w-4" /> Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => { setEditDraft(parseTabata(result)); setEditing(true); }} size="sm" variant="outline" className="gap-1"><Pencil className="h-4 w-4" /> Editar</Button>
                    <Button onClick={async () => { setSaving(true); const p = parseTabata(result); const t = p.title || `TABATA`; const { error } = await supabase.from('ai_plans').update({ conteudo: result, titulo: `${t} (editado)` }).eq('id', editPlanId); if (error) toast.error('Erro: ' + error.message); else toast.success('TABATA atualizado!'); setSaving(false); }} disabled={saving} size="sm" className="gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                  </>
                )}
              </div>
            </div>
            {editing && editDraft ? <TabataStructuredEditor value={editDraft} onChange={setEditDraft} /> : (
              <Card className="glass-card"><CardContent className="p-4 prose prose-sm prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></CardContent></Card>
            )}
          </div>
        )}

        {/* Streaming current day */}
        {generating && result && (
          <div ref={resultRef} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Gerando {tabataDays[currentGenDay]?.dayLabel || ''} ({currentGenDay + 1}/{tabataDays.length})...
            </h3>
            <Card className="glass-card">
              <CardContent className="p-4 prose prose-sm prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Multi-day results */}
        {!generating && multiResults.length > 0 && (
          <div ref={resultRef} className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {multiResults.length} TABATA(s) Gerados
              </h3>
              <Button onClick={savePlan} disabled={savingAll} size="sm" className="gap-1">
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Todos
              </Button>
            </div>

            {multiResults.map((mr, idx) => {
              const parsed = parseTabata(mr.content);
              return (
                <Card key={idx} className="glass-card">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-primary/20 text-primary">{mr.dayLabel}</Badge>
                      <Button
                        onClick={() => navigate('/tabata-execucao', { state: { tabata: parsed, preview: true } })}
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs"
                        disabled={!parsed.blocks.length}
                      >
                        <Play className="h-3.5 w-3.5" /> Visualizar
                      </Button>
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{mr.content}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TabataIA;
