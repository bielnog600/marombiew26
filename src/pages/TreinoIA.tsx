import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Save, Dumbbell, RotateCcw, AlertTriangle, ChevronDown, ChevronUp, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import TrainingResultCards from '@/components/TrainingResultCards';

type StudentCtx = Record<string, any>;

const LEVELS = [
  { value: 'iniciante', label: 'Iniciante', desc: 'Menos de 6 meses de treino' },
  { value: 'intermediario', label: 'Intermediário', desc: '6 meses a 2 anos' },
  { value: 'avancado', label: 'Avançado', desc: 'Mais de 2 anos consistentes' },
];

const DAYS_PER_WEEK = [
  { value: '3', label: '3 dias' },
  { value: '4', label: '4 dias' },
  { value: '5', label: '5 dias' },
  { value: '6', label: '6 dias' },
  { value: '7', label: '7 dias' },
];

const SPLITS = [
  { value: 'fullbody', label: 'Full Body', desc: 'Corpo inteiro por sessão' },
  { value: 'upper_lower', label: 'Upper/Lower', desc: 'Superior e inferior alternados' },
  { value: 'push_pull_legs', label: 'Push/Pull/Legs', desc: 'Empurrar/Puxar/Pernas' },
  { value: 'abcde', label: 'ABCDE', desc: 'Um grupo muscular por dia' },
  { value: 'decida', label: 'Decida por mim', desc: 'IA escolhe a melhor divisão' },
  { value: 'custom', label: 'Selecione grupos', desc: 'Escolher grupos por dia' },
];

const WEEKS = [
  { value: '1', label: 'Semana 1', desc: 'Adaptação / Volume base' },
  { value: '2', label: 'Semana 2', desc: 'Progressão de carga' },
  { value: '3', label: 'Semana 3', desc: 'Intensificação' },
  { value: '4', label: 'Semana 4', desc: 'Deload / Recuperação' },
];

const EQUIPMENT = [
  { value: 'completa', label: 'Academia Completa', desc: 'Todos os equipamentos' },
  { value: 'limitado', label: 'Equipamento Limitado', desc: 'Halteres, barras e poucos aparelhos' },
  { value: 'casa', label: 'Home Gym', desc: 'Treino em casa com básico' },
];

const TreinoIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPlanId = searchParams.get('edit');

  const [studentCtx, setStudentCtx] = useState<StudentCtx | null>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [loading, setLoading] = useState(true);

  // Selections
  const [level, setLevel] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState('');
  const [split, setSplit] = useState('');
  const [week, setWeek] = useState('');
  const [equipment, setEquipment] = useState('');
  const [notes, setNotes] = useState('');
  const [treinoReferencia, setTreinoReferencia] = useState('');
  // Custom split: muscle groups per day (optional)
  const [customSplit, setCustomSplit] = useState<Record<number, string[]>>({});
  const [showCustomSplit, setShowCustomSplit] = useState(false);

  // Health & Injuries
  const [hasLesao, setHasLesao] = useState(false);
  const [lesaoLocal, setLesaoLocal] = useState<string[]>([]);
  const [hasDor, setHasDor] = useState(false);
  const [dorLocal, setDorLocal] = useState('');
  const [limitacaoArticular, setLimitacaoArticular] = useState(false);
  const [limitacaoLocal, setLimitacaoLocal] = useState('');
  const [hipercifose, setHipercifose] = useState(false);
  const [escoliose, setEscoliose] = useState(false);
  const [hiperlordose, setHiperlordose] = useState(false);
  const [protrusaoOmbro, setProtrusaoOmbro] = useState(false);
  const [valgoJoelho, setValgoJoelho] = useState(false);
  const [tabagismo, setTabagismo] = useState(false);
  const [stressAlto, setStressAlto] = useState(false);
  const [sonoRuim, setSonoRuim] = useState(false);

  // Result
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [configCollapsed, setConfigCollapsed] = useState(!!editPlanId);
  const [currentStep, setCurrentStep] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

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
    }
  };

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result]);

  // Avanço entre etapas é manual: o usuário precisa clicar em "Avançar".
  // A geração do treino também só ocorre ao clicar em "Gerar Treino" na última etapa.

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
    let skinfolds: any = null, performance: any = null, posture: any = null;
    let photos: any[] = [];

    if (latestAssessmentId) {
      const [anthroRes, compRes, vitalsRes, sfRes, anRes, perfRes, postureRes, photosRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('skinfolds').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('posture').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('assessment_photos').select('*').eq('assessment_id', latestAssessmentId),
      ]);
      anthro = anthroRes.data;
      comp = compRes.data;
      vitals = vitalsRes.data;
      skinfolds = sfRes.data;
      anamnese = anRes.data;
      performance = perfRes.data;
      posture = postureRes.data;
      photos = photosRes.data ?? [];
    }

    const { data: postureScans } = await supabase
      .from('posture_scans').select('*').eq('student_id', studentId!)
      .order('created_at', { ascending: false }).limit(1);

    const ctx: StudentCtx = {
      nome: profile?.nome, email: profile?.email, sexo: sp?.sexo,
      data_nascimento: sp?.data_nascimento, altura: sp?.altura || anthro?.altura,
      objetivo: sp?.objetivo, restricoes: sp?.restricoes, lesoes: sp?.lesoes,
      observacoes: sp?.observacoes, raca: sp?.raca,
      peso: anthro?.peso, imc: anthro?.imc, cintura: anthro?.cintura,
      quadril: anthro?.quadril, rcq: anthro?.rcq, torax: anthro?.torax,
      abdomen: anthro?.abdomen, ombro: anthro?.ombro, pescoco: anthro?.pescoco,
      braco_direito: anthro?.braco_direito, braco_esquerdo: anthro?.braco_esquerdo,
      coxa_direita: anthro?.coxa_direita, coxa_esquerda: anthro?.coxa_esquerda,
      panturrilha_direita: anthro?.panturrilha_direita, panturrilha_esquerda: anthro?.panturrilha_esquerda,
      percentual_gordura: comp?.percentual_gordura, massa_magra: comp?.massa_magra, massa_gorda: comp?.massa_gorda,
      fc_repouso: vitals?.fc_repouso, pressao: vitals?.pressao, spo2: vitals?.spo2, glicemia: vitals?.glicemia,
      skinfolds: skinfolds ? { metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral, subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media, suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa } : null,
      anamnese: anamnese ? { historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao, suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias, dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress, rotina: anamnese.rotina, treino_atual: anamnese.treino_atual, tabagismo: anamnese.tabagismo, alcool: anamnese.alcool } : null,
      performance: performance ? { cooper_12min: performance.cooper_12min, pushup: performance.pushup, plank: performance.plank, salto_vertical: performance.salto_vertical, agachamento_score: performance.agachamento_score, mobilidade_ombro: performance.mobilidade_ombro, mobilidade_quadril: performance.mobilidade_quadril, mobilidade_tornozelo: performance.mobilidade_tornozelo } : null,
      posture: posture ? { vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral, vista_posterior: posture.vista_posterior, observacoes: posture.observacoes } : null,
      posture_scan: postureScans?.[0] ? { angles: postureScans[0].angles_json, attention_points: postureScans[0].attention_points_json, region_scores: postureScans[0].region_scores_json, notes: postureScans[0].notes } : null,
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
      fotos_perfil: sp?.fotos ?? null,
    };

    setStudentCtx(ctx);
    setStudentName(profile?.nome || 'Aluno');

    // Auto-fill health conditions from student data
    if (sp?.lesoes) { setHasLesao(true); }
    if (anamnese?.dores) { setHasDor(true); setDorLocal(anamnese.dores); }
    if (anamnese?.tabagismo) { setTabagismo(true); }
    if (anamnese?.stress && ['alto', 'muito alto'].some(s => anamnese.stress?.toLowerCase().includes(s))) { setStressAlto(true); }
    if (anamnese?.sono && ['ruim', 'péssimo', 'insônia', 'pouco'].some(s => anamnese.sono?.toLowerCase().includes(s))) { setSonoRuim(true); }

    // Auto-fill from posture scan
    const attentionPoints = postureScans?.[0]?.attention_points_json as any[] | null;
    if (attentionPoints?.length) {
      const labels = attentionPoints.map((p: any) => (p.label || p.name || '').toLowerCase());
      if (labels.some(l => l.includes('cifose') || l.includes('kyphosis'))) setHipercifose(true);
      if (labels.some(l => l.includes('escoliose') || l.includes('scoliosis'))) setEscoliose(true);
      if (labels.some(l => l.includes('lordose') || l.includes('lordosis'))) setHiperlordose(true);
      if (labels.some(l => l.includes('ombro') || l.includes('shoulder'))) setProtrusaoOmbro(true);
      if (labels.some(l => l.includes('valgo') || l.includes('valgus'))) setValgoJoelho(true);
    }

    setLoading(false);
  };

  const canGenerate = level && daysPerWeek && split && week && equipment;

  const generatePlan = async () => {
    if (!canGenerate || !studentCtx) return;
    setGenerating(true);
    setResult('');

    const selectedLevel = LEVELS.find(l => l.value === level);
    const selectedSplit = SPLITS.find(s => s.value === split);
    const selectedEquip = EQUIPMENT.find(e => e.value === equipment);

    // Build health conditions string
    const healthLines: string[] = [];
    if (hasLesao) {
      healthLines.push(`- LESÃO: ${lesaoLocal.length > 0 ? lesaoLocal.join(', ') : 'Sim (local não especificado)'}`);
    }
    if (hasDor) {
      healthLines.push(`- DOR: ${dorLocal || 'Sim (local não especificado)'}`);
    }
    if (limitacaoArticular) {
      healthLines.push(`- LIMITAÇÃO ARTICULAR: ${limitacaoLocal || 'Sim (local não especificado)'}`);
    }
    if (hipercifose) healthLines.push('- DESVIO POSTURAL: Hipercifose');
    if (escoliose) healthLines.push('- DESVIO POSTURAL: Escoliose');
    if (hiperlordose) healthLines.push('- DESVIO POSTURAL: Hiperlordose');
    if (protrusaoOmbro) healthLines.push('- DESVIO POSTURAL: Protrusão de ombros');
    if (valgoJoelho) healthLines.push('- DESVIO POSTURAL: Valgo de joelho');
    if (tabagismo) healthLines.push('- HÁBITO: Tabagismo (considerar capacidade cardiorrespiratória reduzida)');
    if (stressAlto) healthLines.push('- HÁBITO: Stress alto (priorizar exercícios com efeito ansiolítico)');
    if (sonoRuim) healthLines.push('- HÁBITO: Sono ruim (evitar treinos muito intensos, priorizar recuperação)');

    const healthBlock = healthLines.length > 0
      ? `\n\nCONDIÇÕES DE SAÚDE E RESTRIÇÕES DO ALUNO (ADAPTAR O TREINO OBRIGATORIAMENTE):\n${healthLines.join('\n')}\n\nIMPORTANTE: Adapte exercícios, amplitude, carga e volume considerando as condições acima. Inclua exercícios corretivos/compensatórios quando houver desvios posturais. Evite exercícios que agravem lesões ou dores reportadas.`
      : '';

    // Custom muscle group split per day (overrides "Divisão" when defined)
    const numDays = parseInt(daysPerWeek || '0', 10);
    const customLines: string[] = [];
    for (let i = 0; i < numDays; i++) {
      const groups = customSplit[i];
      if (groups && groups.length > 0) {
        customLines.push(`- Dia ${i + 1}: ${groups.join(' + ')}`);
      }
    }
    const customSplitBlock = customLines.length > 0
      ? `\n\nDIVISÃO PERSONALIZADA POR DIA (USE EXATAMENTE ESTA ESTRUTURA, sobrepõe a divisão padrão):\n${customLines.join('\n')}\n\nMonte cada dia com os grupos musculares listados acima, respeitando volume adequado para o nível.`
      : '';

    const prompt = `Gere o TREINO COMPLETO agora com as seguintes configurações:

- Nível: ${selectedLevel?.label}
- Dias por semana: ${daysPerWeek}
- Divisão: ${split === 'decida'
      ? 'IA DEVE ESCOLHER a melhor divisão (Full Body, Upper/Lower, Push/Pull/Legs ou ABCDE) com base no nível, dias por semana, objetivo e condições de saúde do aluno. Justifique brevemente a escolha no Resumo do protocolo.'
      : selectedSplit?.label}
- Semana do ciclo: ${week} de 4
- Equipamento: ${selectedEquip?.label}
${notes ? `- Observações adicionais: ${notes}` : ''}${customSplitBlock}${healthBlock}
${treinoReferencia ? `\n\nREFERÊNCIA DE TREINO FORNECIDA PELO PROFESSOR (USE COMO BASE EXATA para estruturar o treino, exercícios, divisão, volume e faixas de repetição):\n---\n${treinoReferencia}\n---\nSiga essa estrutura o mais fielmente possível, adaptando apenas para as condições de saúde e equipamento informados.` : ''}

GERE TUDO DE UMA VEZ:
1) Resumo do protocolo e foco da semana
2) Tabela completa do treino com TODAS as colunas: TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO
3) Inclua mobilidade no início de cada dia
4) Use técnicas avançadas conforme o nível
5) Mensagens prontas para WhatsApp explicando o protocolo`;

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trainer-agent`,
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
      toast.error(e.message || 'Erro ao gerar treino');
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
        titulo: `Treino - ${new Date().toLocaleDateString('pt-BR')} (editado)`,
      }).eq('id', editPlanId);
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Treino atualizado!');
    } else {
      const { error } = await supabase.from('ai_plans').insert({
        student_id: studentId!,
        tipo: 'treino',
        titulo: `Treino - ${new Date().toLocaleDateString('pt-BR')}`,
        conteudo: result,
      });
      if (error) toast.error('Erro: ' + error.message);
      else toast.success('Treino salvo!');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <AppLayout title="Treino IA">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dados...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Treino IA - ${studentName}`}>
      <div className="space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(`/alunos/${studentId}`)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {/* Student Summary */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Dumbbell className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-bold">Protocolo de Treino - {studentName}</h2>
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
            {studentCtx?.lesoes && (
              <p className="text-sm text-muted-foreground mt-1">Lesões: <span className="text-foreground font-medium">{studentCtx.lesoes}</span></p>
            )}
          </CardContent>
        </Card>

        {editPlanId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigCollapsed(v => !v)}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Configurações do protocolo
            </span>
            {configCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        )}

        {!configCollapsed && (() => {
          const STEP_TITLES = ['Nível', 'Frequência e Divisão', 'Periodização e Equipamento', 'Saúde e Restrições', 'Referência (opcional)'];
          const stepValid = [
            !!level,
            !!daysPerWeek && !!split,
            !!week && !!equipment,
            true, // saúde é opcional
            true, // referência é opcional
          ];
          const totalSteps = STEP_TITLES.length;
          const isLast = currentStep === totalSteps - 1;
          const goNext = () => setCurrentStep((s) => Math.min(totalSteps - 1, s + 1));
          const goBack = () => setCurrentStep((s) => Math.max(0, s - 1));
          return (
            <div className="space-y-4">
              {/* Stepper indicator */}
              <div className="flex items-center gap-1.5">
                {STEP_TITLES.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => setCurrentStep(i)}
                    className={`flex-1 h-1.5 rounded-full transition-all ${
                      i === currentStep ? 'bg-primary' : i < currentStep ? 'bg-primary/60' : 'bg-secondary'
                    }`}
                    title={`${i + 1}. ${t}`}
                    aria-label={t}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Etapa {currentStep + 1} de {totalSteps} — <span className="text-foreground font-medium">{STEP_TITLES[currentStep]}</span>
              </p>

              {currentStep === 0 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
              Nível do Aluno
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LEVELS.map(l => (
                <button key={l.value} onClick={() => setLevel(l.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${level === l.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                  <span className="font-semibold text-sm block">{l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.desc}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 1 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
              Frequência e Divisão
            </h3>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Dias por semana</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS_PER_WEEK.map(d => (
                  <button key={d.value} onClick={() => setDaysPerWeek(d.value)}
                    className={`rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all ${daysPerWeek === d.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Divisão de treino</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SPLITS.map(s => (
                  <button key={s.value} onClick={() => setSplit(s.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${split === s.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <span className="font-semibold text-sm block">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {daysPerWeek && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">
                  Grupos musculares por dia <span className="text-[10px]">(opcional — sobrepõe a divisão acima)</span>
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomSplit(v => !v)}
                    className={`rounded-xl border-2 px-3 py-2 text-xs font-medium transition-all ${
                      showCustomSplit ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {showCustomSplit ? 'Ocultar grupos' : 'Selecionar grupos'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSplit({});
                      setShowCustomSplit(false);
                    }}
                    className={`rounded-xl border-2 px-3 py-2 text-xs font-medium transition-all ${
                      !showCustomSplit && Object.keys(customSplit).length === 0
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    Decida por mim
                  </button>
                  {showCustomSplit && Object.keys(customSplit).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomSplit({})}
                      className="ml-auto text-[11px] text-primary hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                {showCustomSplit && (
                <div className="space-y-2">
                  {Array.from({ length: parseInt(daysPerWeek, 10) }).map((_, i) => {
                    const MUSCLE_GROUPS = [
                      'Peito', 'Costas', 'Ombro', 'Bíceps', 'Tríceps',
                      'Antebraço', 'Quadríceps', 'Posterior', 'Glúteo',
                      'Panturrilha', 'Abdômen', 'Lombar', 'Trapézio', 'Cardio',
                    ];
                    const selected = customSplit[i] ?? [];
                    const toggle = (g: string) => {
                      setCustomSplit(prev => {
                        const cur = prev[i] ?? [];
                        const next = cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g];
                        const copy = { ...prev };
                        if (next.length === 0) delete copy[i];
                        else copy[i] = next;
                        return copy;
                      });
                    };
                    return (
                      <div key={i} className="rounded-xl border border-border p-2">
                        <p className="text-xs font-semibold mb-1.5">Dia {i + 1}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {MUSCLE_GROUPS.map(g => {
                            const isOn = selected.includes(g);
                            return (
                              <button
                                key={g}
                                type="button"
                                onClick={() => toggle(g)}
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                                  isOn
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background hover:border-primary/50'
                                }`}
                              >
                                {g}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
              )}

              {currentStep === 2 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
              Periodização e Equipamento
            </h3>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Semana do ciclo (periodização de 4 semanas)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WEEKS.map(w => (
                  <button key={w.value} onClick={() => setWeek(w.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${week === w.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <span className="font-semibold text-sm block">{w.label}</span>
                    <span className="text-xs text-muted-foreground">{w.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Equipamento disponível</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EQUIPMENT.map(e => (
                  <button key={e.value} onClick={() => setEquipment(e.value)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${equipment === e.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                    <span className="font-semibold text-sm block">{e.label}</span>
                    <span className="text-xs text-muted-foreground">{e.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Observações adicionais (opcional)</p>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: foco em glúteos, evitar supino reto, treino anterior foi PPL..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 3 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Saúde e Restrições
            </h3>
            {(studentCtx?.lesoes || studentCtx?.anamnese?.dores) && (
              <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                ℹ️ Algumas opções foram pré-selecionadas com base na ficha do aluno.
              </p>
            )}

            {/* Lesão */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="lesao" className="text-sm font-medium">Possui Lesão</Label>
                <Switch id="lesao" checked={hasLesao} onCheckedChange={setHasLesao} />
              </div>
              {hasLesao && (
                <div className="pl-2 space-y-2">
                  <p className="text-xs text-muted-foreground">Local da lesão (selecione)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['Ombro', 'Cotovelo', 'Punho', 'Coluna Cervical', 'Coluna Lombar', 'Coluna Torácica', 'Quadril', 'Joelho', 'Tornozelo', 'Outro'].map(loc => (
                      <button key={loc} onClick={() => setLesaoLocal(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${lesaoLocal.includes(loc) ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:border-primary/50'}`}>
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="dor" className="text-sm font-medium">Sente Dor</Label>
                <Switch id="dor" checked={hasDor} onCheckedChange={setHasDor} />
              </div>
              {hasDor && (
                <input value={dorLocal} onChange={(e) => setDorLocal(e.target.value)}
                  placeholder="Ex: dor no ombro direito ao elevar o braço..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              )}
            </div>

            {/* Limitação Articular */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="limitacao" className="text-sm font-medium">Limitação Articular</Label>
                <Switch id="limitacao" checked={limitacaoArticular} onCheckedChange={setLimitacaoArticular} />
              </div>
              {limitacaoArticular && (
                <input value={limitacaoLocal} onChange={(e) => setLimitacaoLocal(e.target.value)}
                  placeholder="Ex: limitação de flexão de ombro, extensão de joelho..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              )}
            </div>

            {/* Desvios Posturais */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Desvios Posturais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'hipercifose', label: 'Hipercifose', desc: 'Curvatura torácica acentuada', checked: hipercifose, set: setHipercifose },
                  { id: 'escoliose', label: 'Escoliose', desc: 'Desvio lateral da coluna', checked: escoliose, set: setEscoliose },
                  { id: 'hiperlordose', label: 'Hiperlordose', desc: 'Curvatura lombar acentuada', checked: hiperlordose, set: setHiperlordose },
                  { id: 'protrusao', label: 'Protrusão de Ombros', desc: 'Ombros projetados à frente', checked: protrusaoOmbro, set: setProtrusaoOmbro },
                  { id: 'valgo', label: 'Valgo de Joelho', desc: 'Joelhos convergem para dentro', checked: valgoJoelho, set: setValgoJoelho },
                ].map(item => (
                  <div key={item.id} className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all ${item.checked ? 'border-orange-400 bg-orange-500/10' : 'border-border'}`}>
                    <div>
                      <span className="text-sm font-medium block">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                    </div>
                    <Switch checked={item.checked} onCheckedChange={item.set} />
                  </div>
                ))}
              </div>
            </div>

            {/* Hábitos */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Hábitos e Condições</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'tabagismo2', label: 'Tabagismo', checked: tabagismo, set: setTabagismo },
                  { id: 'stress2', label: 'Stress Alto', checked: stressAlto, set: setStressAlto },
                  { id: 'sono2', label: 'Sono Ruim', checked: sonoRuim, set: setSonoRuim },
                ].map(item => (
                  <div key={item.id} className={`flex items-center justify-between rounded-xl border-2 p-3 transition-all ${item.checked ? 'border-orange-400 bg-orange-500/10' : 'border-border'}`}>
                    <span className="text-sm font-medium">{item.label}</span>
                    <Switch checked={item.checked} onCheckedChange={item.set} />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
              )}

              {currentStep === 4 && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
              Referência de Treino (opcional)
            </h3>
            <p className="text-xs text-muted-foreground">
              Cole aqui um treino base, estrutura de divisão, faixa de volume ou dicas para a IA seguir como referência exata.
            </p>
            <textarea
              value={treinoReferencia}
              onChange={(e) => setTreinoReferencia(e.target.value)}
              placeholder={"Ex:\nSegunda – Lower 1 / quadríceps + glúteo\n  Agachamento goblet\n  Afundo\n  Leg press\n  Extensora\n  Flexora\n  Panturrilha\n\nFaixa de volume semanal:\n  Quadríceps: 10–14 séries\n  Glúteos: 12–16 séries..."}
              rows={8}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-y min-h-[100px]"
            />
          </CardContent>
        </Card>
              )}

              {/* Wizard navigation */}
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={goBack}
                  disabled={currentStep === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </Button>
                {!isLast ? (
                  <Button
                    onClick={goNext}
                    disabled={!stepValid[currentStep]}
                    className="gap-1"
                  >
                    Avançar <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={generatePlan}
                    disabled={!canGenerate || generating}
                    className="gap-2 font-bold"
                  >
                    {generating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                    ) : (
                      <><Dumbbell className="h-4 w-4" /> Gerar Treino</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Result - streaming raw markdown */}
        {result && generating && (
          <Card className="glass-card" ref={resultRef}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <h3 className="font-bold text-sm">Gerando treino...</h3>
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
                <Dumbbell className="h-5 w-5 text-primary" />
                Protocolo de Treino
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
            <TrainingResultCards markdown={result} editable={!!editPlanId} onMarkdownChange={setResult} />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TreinoIA;
