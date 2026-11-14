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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  tabataDayFromTitle, resolveTabataDayChange, latestTabataPlanByDay, tabataCatalogForDay,
  trainingDayKind, enforceQuickSetup, tabataPlanWarnings, tabataBlockExerciseNames,
  type TabataPlanRef, type TabataDayChange,
} from '@/lib/tabataRules';
import {
  normalizeWarmupSection, ensureBlockIntensities, progressionWarnings, fitWarmupBlock, replaceWarmupSection,
  maxWarmupExercises, formatWarmupClock, WARMUP_DEFAULT,
} from '@/lib/tabataProgression';

const WARMUP_WORK_OPTIONS = [20, 25, 30];
const WARMUP_REST_OPTIONS = [5, 10];
const WARMUP_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8];
import { Switch } from '@/components/ui/switch';

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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [includeWarmupBlock, setIncludeWarmupBlock] = useState(true);
  const [intensityProgression, setIntensityProgression] = useState(true);
  const [warmupWork, setWarmupWork] = useState<number>(WARMUP_DEFAULT.work);
  const [warmupRest, setWarmupRest] = useState<number>(WARMUP_DEFAULT.rest);
  const [warmupCount, setWarmupCount] = useState<number>(WARMUP_DEFAULT.count);
  // Aquecimento de no máximo 3 min: com esses tempos, cabe no máximo `warmupMax` exercícios.
  const warmupMax = maxWarmupExercises(warmupWork, warmupRest);
  const warmupCountUsed = Math.min(warmupCount, warmupMax);
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
  const [multiResults, setMultiResults] = useState<{ dayLabel: string; content: string; warnings?: string[] }[]>([]);
  const [currentGenDay, setCurrentGenDay] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [editDay, setEditDay] = useState('');
  // editDay uses 'none' for no day, or a weekday name
  // Ajuste Rápido: o que foi carregado do banco, para saber se há alterações e trocar de dia com segurança.
  const [dayPlans, setDayPlans] = useState<TabataPlanRef[]>([]);
  const [loadedContent, setLoadedContent] = useState('');
  const [loadedDay, setLoadedDay] = useState('none');
  const [editBaseline, setEditBaseline] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [pendingDay, setPendingDay] = useState<{ day: string; action: TabataDayChange } | null>(null);
  const loadSeq = useRef(0);

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
    const seq = ++loadSeq.current;
    // Trocar de plano sempre sai do modo edição: o rascunho era do dia anterior.
    setEditing(false);
    setEditDraft(null);
    setPlanLoading(true);
    const [planRes, listRes] = await Promise.all([
      supabase.from('ai_plans').select('*').eq('id', editPlanId!).maybeSingle(),
      supabase.from('ai_plans').select('id, titulo, created_at')
        .eq('student_id', studentId!).eq('tipo', 'tabata').eq('is_draft', false)
        .order('created_at', { ascending: false }),
    ]);
    if (seq !== loadSeq.current) return; // resposta de um dia que já foi trocado
    const data = planRes.data;
    setDayPlans((listRes.data as TabataPlanRef[] | null) ?? []);
    if (data) {
      const day = tabataDayFromTitle(data.titulo) ?? 'none';
      setResult(data.conteudo);
      setLoadedContent(data.conteudo);
      setEditDay(day);
      setLoadedDay(day);
    }
    setPlanLoading(false);
  };

  const hasUnsavedChanges = () =>
    result !== loadedContent ||
    (editDay || 'none') !== loadedDay ||
    (editing && !!editDraft && serializeTabata(editDraft) !== editBaseline);

  const applyDayChange = (day: string, action: TabataDayChange) => {
    setPendingDay(null);
    if (action.kind === 'load') {
      setEditing(false);
      setEditDraft(null);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('edit', action.planId);
        return next;
      }, { replace: true });
      return;
    }
    if (action.kind === 'same') {
      setEditDay(day);
      return;
    }
    // Dia sem TABATA: este plano passa para o dia escolhido quando salvar.
    setEditing(false);
    setEditDraft(null);
    setEditDay(day);
  };

  const requestDayChange = (day: string) => {
    if (day === (editDay || 'none')) return;
    const action = resolveTabataDayChange(dayPlans, editPlanId, day);
    if (action.kind === 'same') return applyDayChange(day, action);
    if (action.kind === 'move' || hasUnsavedChanges()) {
      setPendingDay({ day, action });
      return;
    }
    applyDayChange(day, action);
  };

  const saveEditedPlan = async () => {
    if (!editPlanId) return;
    setSaving(true);
    const p = parseTabata(result);
    const baseName = p.title || 'TABATA';
    const titulo = editDay && editDay !== 'none' ? `${editDay} — ${baseName} (editado)` : `${baseName} (editado)`;
    const { error } = await supabase.from('ai_plans').update({ conteudo: result, titulo }).eq('id', editPlanId);
    if (error) toast.error('Erro: ' + error.message);
    else {
      toast.success('TABATA atualizado!');
      setLoadedContent(result);
      setLoadedDay(editDay || 'none');
      setDayPlans(prev => prev.map(pl => (pl.id === editPlanId ? { ...pl, titulo } : pl)));
    }
    setSaving(false);
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
          // O TABATA complementa a musculação do dia (regras por dia no gerador), não repete o mesmo foco.
          focus: 'auto',
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
  const detectMuscleGroup = (dayName: string): string => trainingDayKind(dayName);

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

      // Só montagem rápida (peso corporal, halter, kettlebell, corda naval, elástico); a lista de cada dia
      // ainda tira o apoio pesado de braço quando a musculação do dia é de superiores.
      const catalog = (allEx || []).filter(ex => !!ex?.nome && !!ex?.video_embed);
      const catalogNames = catalog.map(ex => ex.nome);

      // Semana: exercícios dos TABATAs já salvos nos outros dias (os dias gerados agora são substituídos).
      const generatingDays = new Set(tabataDays.map(d => d.dayLabel));
      const { data: savedPlans } = await supabase
        .from('ai_plans')
        .select('id, titulo, created_at, conteudo')
        .eq('student_id', studentId!)
        .eq('tipo', 'tabata')
        .eq('is_draft', false)
        .order('created_at', { ascending: false });
      const savedByDay = latestTabataPlanByDay((savedPlans as (TabataPlanRef & { conteudo: string })[] | null) ?? []);
      const otherWeekExercises: string[] = [];
      savedByDay.forEach((plan, day) => {
        if (generatingDays.has(day)) return;
        const full = (savedPlans || []).find(p => p.id === plan.id);
        for (const n of tabataBlockExerciseNames(parseTabata(full?.conteudo || ''))) {
          if (!otherWeekExercises.includes(n)) otherWeekExercises.push(n);
        }
      });

      const results: { dayLabel: string; content: string; warnings?: string[] }[] = [];
      const usedExercises: string[] = [...otherWeekExercises];

      for (let i = 0; i < tabataDays.length; i++) {
        const day = tabataDays[i];
        setCurrentGenDay(i);
        const dayKind = trainingDayKind(day.fromWorkout);
        const availableExercises = tabataCatalogForDay(catalog, dayKind);
        const avoidForDay = [...usedExercises];

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
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              studentId,
              studentContext: studentCtx,
              intensity,
              notes: dayNotes,
              availableExercises,
              style: dayStyle,
              workSec,
              restSec,
              totalDuration,
              rounds,
              avoidExercises: avoidForDay,
              trainingDay: dayKind,
              trainingDayName: day.fromWorkout || '',
              warmupBlock: includeWarmupBlock,
              warmupWork,
              warmupRest,
              warmupCount: warmupCountUsed,
              progression: intensityProgression,
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

        // Correção determinística: barra/smith/máquina → versão de montagem rápida do catálogo.
        const fixed = enforceQuickSetup(accumulated, catalogNames);
        // Bloco 0 cronometrado (ou sem aquecimento) e Moderado → Forte → Máximo nos blocos sem intensidade.
        const warmupTarget = { work: warmupWork, rest: warmupRest, count: warmupCountUsed };
        let dayMarkdown = normalizeWarmupSection(fixed.markdown, includeWarmupBlock, warmupTarget);
        // Aquecimento sempre dentro de 3 min e com os tempos escolhidos (trabalho 20–30s, intervalo 5–10s).
        const generatedWarmup = includeWarmupBlock ? parseTabata(dayMarkdown).warmupBlock : null;
        const warmFit = generatedWarmup ? fitWarmupBlock(generatedWarmup, warmupTarget) : null;
        if (warmFit?.changed) dayMarkdown = replaceWarmupSection(dayMarkdown, warmFit.block);
        if (intensityProgression) dayMarkdown = ensureBlockIntensities(dayMarkdown);
        const parsedDay = parseTabata(dayMarkdown);
        const warnings = [
          ...(warmFit?.removed.length ? [`Aquecimento limitado a 3 min: saiu ${warmFit.removed.join(', ')}.`] : []),
          ...fixed.replaced.map(([from, to]) => `Trocado ${from} por ${to} (montagem rápida).`),
          ...tabataPlanWarnings(parsedDay, { dayKind, otherDaysExercises: avoidForDay }),
          ...(intensityProgression ? progressionWarnings(parsedDay) : []),
        ];
        results.push({ dayLabel: day.dayLabel, content: dayMarkdown, warnings });
        for (const n of tabataBlockExerciseNames(parsedDay)) {
          if (!usedExercises.includes(n)) usedExercises.push(n);
        }
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
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
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
              autoAdvanceDelay={0}
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
          <div className="space-y-2 pt-2">
            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
              <span>
                <span className="block text-sm font-semibold">Incluir bloco de aquecimento</span>
                <span className="block text-[11px] text-muted-foreground">Bloco 0 cronometrado no Player, leve: mobilidade, estabilidade e agachamento livre. Máximo 3 min.</span>
              </span>
              <Switch checked={includeWarmupBlock} onCheckedChange={setIncludeWarmupBlock} aria-label="Incluir bloco de aquecimento" />
            </label>
            {includeWarmupBlock && (
              <div className="p-3 rounded-lg border border-border bg-card space-y-2" data-testid="tabata-wizard-warmup">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Trabalho</Label>
                    <Select value={String(warmupWork)} onValueChange={v => setWarmupWork(Number(v))}>
                      <SelectTrigger aria-label="Trabalho do aquecimento"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {WARMUP_WORK_OPTIONS.map(v => <SelectItem key={v} value={String(v)}>{v}s</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Intervalo</Label>
                    <Select value={String(warmupRest)} onValueChange={v => setWarmupRest(Number(v))}>
                      <SelectTrigger aria-label="Intervalo do aquecimento"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {WARMUP_REST_OPTIONS.map(v => <SelectItem key={v} value={String(v)}>{v}s</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Exercícios</Label>
                    <Select value={String(warmupCount)} onValueChange={v => setWarmupCount(Number(v))}>
                      <SelectTrigger aria-label="Exercícios do aquecimento"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {WARMUP_COUNT_OPTIONS.map(v => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {warmupCountUsed} × {warmupWork}s / {warmupRest}s = <span className="font-semibold text-foreground">{formatWarmupClock(warmupCountUsed * (warmupWork + warmupRest))}</span> (máximo 3:00)
                </p>
                {warmupCount > warmupMax && (
                  <p role="alert" className="text-[11px] text-destructive">
                    {warmupCount} exercícios passam de 3 min ({formatWarmupClock(warmupCount * (warmupWork + warmupRest))}). Com esses tempos cabem {warmupMax} — o aquecimento vai sair com {warmupMax}.
                  </p>
                )}
              </div>
            )}
            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card">
              <span>
                <span className="block text-sm font-semibold">Progressão de intensidade entre blocos</span>
                <span className="block text-[11px] text-muted-foreground">Moderado → Forte → Máximo: simples e controlados primeiro, explosivos no fim.</span>
              </span>
              <Switch checked={intensityProgression} onCheckedChange={setIntensityProgression} aria-label="Progressão de intensidade entre blocos" />
            </label>
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
        {editPlanId && (result || planLoading) && !generating && (
          <div ref={resultRef} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Edição</h3>
              <Select value={editDay || 'none'} onValueChange={requestDayChange} disabled={planLoading}>
                  <SelectTrigger className="w-[120px] h-8 text-xs" aria-label="Dia do TABATA">
                    <SelectValue placeholder="Dia..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="none">Sem dia</SelectItem>
                    {WEEKDAYS.map(w => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {planLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex gap-2 flex-wrap">
                {editing ? (
                  <>
                    <Button onClick={() => { if (editDraft) { setResult(serializeTabata(editDraft)); toast.success('Edições aplicadas'); } setEditing(false); setEditDraft(null); }} size="sm" className="gap-1"><Check className="h-4 w-4" /> Aplicar</Button>
                    <Button onClick={() => { setEditing(false); setEditDraft(null); }} size="sm" variant="outline" className="gap-1"><X className="h-4 w-4" /> Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => { const draft = parseTabata(result); setEditDraft(draft); setEditBaseline(serializeTabata(draft)); setEditing(true); }} disabled={planLoading} size="sm" variant="outline" className="gap-1"><Pencil className="h-4 w-4" /> Editar</Button>
                    <Button onClick={saveEditedPlan} disabled={saving || planLoading} size="sm" className="gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
                  </>
                )}
              </div>
            </div>
            {planLoading ? (
              <Card className="glass-card"><CardContent className="p-6 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando o TABATA do dia...</CardContent></Card>
            ) : editing && editDraft ? <TabataStructuredEditor value={editDraft} onChange={setEditDraft} /> : (
              <Card className="glass-card" data-testid="tabata-edit-view"><CardContent className="p-4 prose prose-sm prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></CardContent></Card>
            )}
          </div>
        )}

        <AlertDialog open={!!pendingDay} onOpenChange={(open) => { if (!open) setPendingDay(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingDay?.action.kind === 'load'
                  ? `Abrir o TABATA de ${pendingDay.day}?`
                  : pendingDay?.day === 'none' ? 'Tirar o dia deste TABATA?' : `Mover este TABATA para ${pendingDay?.day}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDay?.action.kind === 'load'
                  ? 'Você tem alterações que ainda não foram salvas neste dia. Elas serão descartadas.'
                  : `${pendingDay?.day === 'none' ? 'Este TABATA fica sem dia' : `Ainda não existe TABATA de ${pendingDay?.day}. Este TABATA passa para ${pendingDay?.day}`} quando você tocar em Salvar.${editing && editDraft && serializeTabata(editDraft) !== editBaseline ? ' As edições não aplicadas serão descartadas.' : ''}`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => pendingDay && applyDayChange(pendingDay.day, pendingDay.action)}>
                {pendingDay?.action.kind === 'load' ? 'Descartar e abrir' : 'Mover'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                    {!!mr.warnings?.length && (
                      <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2 space-y-0.5" data-testid="tabata-day-warnings">
                        <p className="text-[11px] font-semibold text-orange-400">Conferir antes de salvar</p>
                        {mr.warnings.map((w, wi) => <p key={wi} className="text-[11px] text-orange-300">{w}</p>)}
                      </div>
                    )}
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
