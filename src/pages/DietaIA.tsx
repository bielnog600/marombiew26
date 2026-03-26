import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, UtensilsCrossed, RotateCcw, Leaf, Pill, Zap, Dumbbell, Clock, Syringe, Target, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import DietResultCards from '@/components/DietResultCards';

type StudentCtx = Record<string, any>;

const ACTIVITY_LEVELS = [
  { value: '1.0', label: 'Sedentário', desc: 'Pouca ou nenhuma atividade' },
  { value: '1.2', label: 'Super Leve', desc: 'Atividade leve ocasional' },
  { value: '1.4', label: 'Leve', desc: '1-3x/semana exercício leve' },
  { value: '1.6', label: 'Moderado', desc: '3-5x/semana exercício moderado' },
  { value: '1.8', label: 'Alto', desc: '5-7x/semana exercício intenso' },
  { value: '2.0', label: 'Extremo', desc: 'Atleta, 2x/dia' },
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

  // Step 2 - Fase & Hormônios
  const [phase, setPhase] = useState('');
  const [usesHormones, setUsesHormones] = useState<boolean | null>(null);
  const [hormoneDetails, setHormoneDetails] = useState('');

  // Step 3 - Atividade & Estratégia
  const [activityLevel, setActivityLevel] = useState('');
  const [strategy, setStrategy] = useState('');

  // Step 4 - Refeições & Preferências
  const [mealCount, setMealCount] = useState('');
  const [preferences, setPreferences] = useState('');
  const [restrictions, setRestrictions] = useState('');

  // Step 5 - Ajustes do Protocolo
  const [selectedAdjustments, setSelectedAdjustments] = useState<string[]>([]);

  // Step 6 - Extras
  const [enableFitoterapia, setEnableFitoterapia] = useState(false);
  const [enableSuplementos, setEnableSuplementos] = useState(false);
  const [enableEmagrecimentoRapido, setEnableEmagrecimentoRapido] = useState(false);

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
    const [profileRes, spRes, assessRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('assessments').select('id').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;

    let anthro: any = null, comp: any = null, vitals: any = null, anamnese: any = null;
    let photos: any[] = [];

    if (latestAssessmentId) {
      const [anthroRes, compRes, vitalsRes, anRes, photosRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('assessment_photos').select('*').eq('assessment_id', latestAssessmentId),
      ]);
      anthro = anthroRes.data;
      comp = compRes.data;
      vitals = vitalsRes.data;
      anamnese = anRes.data;
      photos = photosRes.data ?? [];
    }

    const ctx: StudentCtx = {
      nome: profile?.nome, sexo: sp?.sexo, data_nascimento: sp?.data_nascimento,
      altura: sp?.altura || anthro?.altura, objetivo: sp?.objetivo,
      restricoes: sp?.restricoes, lesoes: sp?.lesoes, observacoes: sp?.observacoes,
      peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
      quadril: anthro?.quadril, rcq: anthro?.rcq,
      percentual_gordura: comp?.percentual_gordura,
      massa_magra: comp?.massa_magra, massa_gorda: comp?.massa_gorda,
      fc_repouso: vitals?.fc_repouso,
      anamnese: anamnese ? {
        historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao,
        suplementos: anamnese.suplementos, sono: anamnese.sono, stress: anamnese.stress,
        rotina: anamnese.rotina, treino_atual: anamnese.treino_atual,
      } : null,
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
    };

    setStudentCtx(ctx);
    setStudentName(profile?.nome || 'Aluno');

    if (comp?.percentual_gordura) {
      const bf = Number(comp.percentual_gordura);
      const isMale = sp?.sexo === 'masculino';
      if ((isMale && bf > 20) || (!isMale && bf > 28)) setStrategy('deficit_moderado');
      else if ((isMale && bf < 12) || (!isMale && bf < 18)) setStrategy('superavit_leve');
      else setStrategy('manutencao');
    }

    // Pre-fill restrictions from profile
    if (sp?.restricoes) setRestrictions(sp.restricoes);

    setLoading(false);
  };

  const toggleAdjustment = (id: string) => {
    setSelectedAdjustments(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
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

    const adjustmentLabels = selectedAdjustments.map(id => PROTOCOL_ADJUSTMENTS.find(a => a.id === id)?.label).filter(Boolean);

    const prompt = `Gere o plano alimentar COMPLETO para fisiculturismo com as seguintes configurações:

=== ROTINA DO ALUNO ===
- Rotina diária: ${dailyRoutine || 'Não informada'}
- Horário de treino: ${selectedTrainingTime?.label || 'Não informado'}
- Dias de treino: ${trainingDays ? `${trainingDays}x/semana` : 'Não informado'}

=== FASE ATUAL ===
- Fase: ${selectedPhase?.label} — ${selectedPhase?.desc}
- Uso de hormônios: ${usesHormones === null ? 'Não informado' : usesHormones ? `Sim — ${hormoneDetails || 'detalhes não especificados'}` : 'Não (natural)'}

=== PARÂMETROS NUTRICIONAIS ===
- Fator de Atividade: ${selectedActivity?.label} (FA = ${activityLevel})
- Estratégia: ${selectedStrategy?.label} (${selectedStrategy?.pct! > 0 ? '+' : ''}${selectedStrategy?.pct}%)
- Número de refeições: ${mealCount} por dia
${restrictions ? `- Restrições alimentares: ${restrictions}` : ''}
${preferences ? `- Preferências alimentares: ${preferences}` : ''}

=== AJUSTES DO PROTOCOLO ===
${adjustmentLabels.length > 0 ? adjustmentLabels.map(a => `- ${a}`).join('\n') : '- Nenhum ajuste selecionado'}

=== EXTRAS ===
${enableFitoterapia ? '- INCLUIR RECEITAS DE FITOTERAPIA: Sugira chás, infusões e preparações fitoterápicas complementares. Inclua dosagens, horários e benefícios.' : ''}
${enableSuplementos ? '- INCLUIR SUPLEMENTAÇÃO COMPLETA: Protocolo de suplementos com dosagem, horário e justificativa.' : ''}
${enableEmagrecimentoRapido ? '- ESTRATÉGIA DE EMAGRECIMENTO RÁPIDO: Estratégias avançadas (jejum intermitente, HIIT, termogênicos).' : ''}

GERE TUDO DE UMA VEZ:
1) Tabela comparativa de TMB por todas as fórmulas
2) Escolha da fórmula mais adequada e justificativa
3) Cálculo do GET e Consumo Energético
4) Distribuição de macronutrientes (proteína, carboidrato, gordura)
5) 2-3 opções de cardápio completo em tabela com: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G
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

        {/* Step 2: Fase Atual & Hormônios */}
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <StepHeader step={2} title="Fase Atual e Hormônios" />
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
              <input
                value={restrictions}
                onChange={(e) => setRestrictions(e.target.value)}
                placeholder="Ex: sem lactose, sem glúten, alergia a frutos do mar..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Preferências alimentares (opcional)</p>
              <input
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Ex: prefere frango, gosta de arroz integral, não come peixe..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setResult(''); generatePlan(); }}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Regenerar
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
