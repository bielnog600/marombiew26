import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, UtensilsCrossed, RotateCcw } from 'lucide-react';
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
  { value: 'superavit_leve', label: 'Superávit Leve (+10%)', desc: 'Ganho de massa gradual (lean bulk)', pct: 10 },
  { value: 'superavit_moderado', label: 'Superávit Moderado (+20%)', desc: 'Ganho de massa acelerado', pct: 20 },
];

const MEAL_COUNTS = [
  { value: '4', label: '4 refeições' },
  { value: '5', label: '5 refeições' },
  { value: '6', label: '6 refeições' },
  { value: '7', label: '7 refeições' },
];

const DIET_STYLES = [
  { value: 'flexivel', label: 'Flexível por Macros', desc: 'Opções variadas respeitando macros' },
  { value: 'estruturado', label: 'Cardápio Estruturado', desc: 'Refeições fixas e organizadas' },
  { value: 'ciclagem', label: 'Ciclagem de Carboidratos', desc: 'High/Medium/Low carb por dia' },
];

const DietaIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();

  const [studentCtx, setStudentCtx] = useState<StudentCtx | null>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [loading, setLoading] = useState(true);

  // Selections
  const [activityLevel, setActivityLevel] = useState('');
  const [strategy, setStrategy] = useState('');
  const [mealCount, setMealCount] = useState('');
  const [dietStyle, setDietStyle] = useState('');
  const [preferences, setPreferences] = useState('');

  // Result
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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

    // Auto-suggest strategy based on body fat
    if (comp?.percentual_gordura) {
      const bf = Number(comp.percentual_gordura);
      const isMale = sp?.sexo === 'masculino';
      if ((isMale && bf > 20) || (!isMale && bf > 28)) {
        setStrategy('deficit_moderado');
      } else if ((isMale && bf < 12) || (!isMale && bf < 18)) {
        setStrategy('superavit_leve');
      } else {
        setStrategy('manutencao');
      }
    }

    setLoading(false);
  };

  const canGenerate = activityLevel && strategy && mealCount && dietStyle;

  const generatePlan = async () => {
    if (!canGenerate || !studentCtx) return;
    setGenerating(true);
    setResult('');

    const selectedStrategy = STRATEGIES.find(s => s.value === strategy);
    const selectedActivity = ACTIVITY_LEVELS.find(a => a.value === activityLevel);
    const selectedStyle = DIET_STYLES.find(d => d.value === dietStyle);

    const prompt = `Gere o plano alimentar COMPLETO agora com as seguintes configurações:

- Fator de Atividade: ${selectedActivity?.label} (FA = ${activityLevel})
- Estratégia: ${selectedStrategy?.label} (${selectedStrategy?.pct! > 0 ? '+' : ''}${selectedStrategy?.pct}%)
- Número de refeições: ${mealCount} por dia
- Estilo de dieta: ${selectedStyle?.label}
${preferences ? `- Preferências/restrições adicionais: ${preferences}` : ''}

GERE TUDO DE UMA VEZ:
1) Tabela comparativa de TMB por todas as fórmulas
2) Escolha da fórmula mais adequada e justificativa
3) Cálculo do GET e Consumo Energético
4) Distribuição de macronutrientes (proteína, carboidrato, gordura)
5) 2-3 opções de cardápio completo em tabela com: Refeição | Horário | Alimento | Quantidade (g) | Kcal | P | C | G
6) Total de cada refeição e do dia
7) Dicas de timing nutricional (pré/pós treino)
8) Mensagens prontas para WhatsApp`;

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
      // flush
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

    const { error } = await supabase.from('ai_plans').insert({
      student_id: studentId!,
      tipo: 'dieta',
      titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
      conteudo: result,
    });
    if (error) toast.error('Erro: ' + error.message);
    else toast.success('Dieta salva!');
    setSaving(false);
  };

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
            {studentCtx?.restricoes && (
              <p className="text-sm text-muted-foreground mt-1">Restrições: <span className="text-foreground font-medium">{studentCtx.restricoes}</span></p>
            )}
          </CardContent>
        </Card>

        {/* Step 1: Activity Level */}
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
              Nível de Atividade Física
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTIVITY_LEVELS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setActivityLevel(a.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    activityLevel === a.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="font-semibold text-sm block">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.desc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Strategy */}
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              Estratégia Nutricional
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STRATEGIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStrategy(s.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    strategy === s.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="font-semibold text-sm block">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.desc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Meals & Style */}
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              Refeições e Estilo
            </h3>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Número de refeições por dia</p>
              <div className="flex gap-2 flex-wrap">
                {MEAL_COUNTS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMealCount(m.value)}
                    className={`rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all ${
                      mealCount === m.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Estilo de dieta</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DIET_STYLES.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setDietStyle(d.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      dietStyle === d.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <span className="font-semibold text-sm block">{d.label}</span>
                    <span className="text-xs text-muted-foreground">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Preferências alimentares (opcional)</p>
              <input
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Ex: sem lactose, prefere frango, não gosta de peixe..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Generate Button */}
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

        {/* Result - streaming raw markdown */}
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

        {/* Result - final cards view */}
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
                  <Save className="h-3 w-3 mr-1" /> Salvar
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
