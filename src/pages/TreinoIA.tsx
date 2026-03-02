import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Send, Bot, User, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const TreinoIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [studentContext, setStudentContext] = useState<any>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const loadStudentData = async () => {
    const [profileRes, spRes, assessRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('students_profile').select('*').eq('user_id', studentId!).maybeSingle(),
      supabase.from('assessments').select('id').eq('student_id', studentId!).order('created_at', { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data;
    const sp = spRes.data;
    const latestAssessmentId = assessRes.data?.[0]?.id;

    let anthro: any = null;
    let comp: any = null;
    let vitals: any = null;
    let skinfolds: any = null;
    let anamnese: any = null;
    let performance: any = null;

    if (latestAssessmentId) {
      const [anthroRes, compRes, vitalsRes, sfRes, anRes, perfRes] = await Promise.all([
        supabase.from('anthropometrics').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('composition').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('vitals').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('skinfolds').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('anamnese').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
        supabase.from('performance_tests').select('*').eq('assessment_id', latestAssessmentId).maybeSingle(),
      ]);
      anthro = anthroRes.data;
      comp = compRes.data;
      vitals = vitalsRes.data;
      skinfolds = sfRes.data;
      anamnese = anRes.data;
      performance = perfRes.data;
    }

    const ctx = {
      nome: profile?.nome,
      email: profile?.email,
      sexo: sp?.sexo,
      data_nascimento: sp?.data_nascimento,
      altura: sp?.altura || anthro?.altura,
      objetivo: sp?.objetivo,
      restricoes: sp?.restricoes,
      lesoes: sp?.lesoes,
      observacoes: sp?.observacoes,
      raca: sp?.raca,
      // Anthropometrics
      peso: anthro?.peso,
      imc: anthro?.imc,
      cintura: anthro?.cintura,
      quadril: anthro?.quadril,
      rcq: anthro?.rcq,
      torax: anthro?.torax,
      abdomen: anthro?.abdomen,
      ombro: anthro?.ombro,
      pescoco: anthro?.pescoco,
      braco_direito: anthro?.braco_direito,
      braco_esquerdo: anthro?.braco_esquerdo,
      coxa_direita: anthro?.coxa_direita,
      coxa_esquerda: anthro?.coxa_esquerda,
      panturrilha_direita: anthro?.panturrilha_direita,
      panturrilha_esquerda: anthro?.panturrilha_esquerda,
      // Composition
      percentual_gordura: comp?.percentual_gordura,
      massa_magra: comp?.massa_magra,
      massa_gorda: comp?.massa_gorda,
      // Vitals
      fc_repouso: vitals?.fc_repouso,
      pressao: vitals?.pressao,
      spo2: vitals?.spo2,
      glicemia: vitals?.glicemia,
      // Full objects
      skinfolds: skinfolds ? { metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral, subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media, suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa } : null,
      anamnese: anamnese ? { historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao, suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias, dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress, rotina: anamnese.rotina, treino_atual: anamnese.treino_atual, tabagismo: anamnese.tabagismo, alcool: anamnese.alcool } : null,
      performance: performance ? { cooper_12min: performance.cooper_12min, pushup: performance.pushup, plank: performance.plank, salto_vertical: performance.salto_vertical, agachamento_score: performance.agachamento_score, mobilidade_ombro: performance.mobilidade_ombro, mobilidade_quadril: performance.mobilidade_quadril, mobilidade_tornozelo: performance.mobilidade_tornozelo } : null,
    };

    setStudentContext(ctx);
    setStudentName(profile?.nome || 'Aluno');

    // Build summary of available data
    const dataPoints: string[] = [];
    if (ctx.objetivo) dataPoints.push(`objetivo: **${ctx.objetivo}**`);
    if (ctx.peso) dataPoints.push(`peso: ${ctx.peso}kg`);
    if (ctx.altura) dataPoints.push(`altura: ${ctx.altura}cm`);
    if (ctx.percentual_gordura) dataPoints.push(`gordura: ${ctx.percentual_gordura}%`);
    if (ctx.lesoes) dataPoints.push(`lesões: ${ctx.lesoes}`);
    if (ctx.restricoes) dataPoints.push(`restrições: ${ctx.restricoes}`);

    const dataStr = dataPoints.length > 0 ? `\n\nDados já carregados: ${dataPoints.join(', ')}.` : '';

    setMessages([{
      role: 'assistant',
      content: `Olá! Sou seu assistente de treino e dieta. Já tenho **todos os dados** do(a) **${profile?.nome || 'aluno'}** carregados do sistema (perfil, avaliação física, anamnese, composição corporal, sinais vitais e testes de performance).${dataStr}\n\nVou usar essas informações para montar um protocolo personalizado sem perguntar o que já sei. Vamos começar!\n\nQual é o **nível** desse aluno? (iniciante, intermediário ou avançado)`
    }]);
  };

  const saveAsPlan = async (type: 'treino' | 'dieta') => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    setSaving(true);
    const { error } = await supabase.from('ai_plans').insert({
      student_id: studentId!,
      tipo: type,
      titulo: `${type === 'treino' ? 'Treino' : 'Dieta'} - ${new Date().toLocaleDateString('pt-BR')}`,
      conteudo: lastAssistant.content,
    });
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success(`${type === 'treino' ? 'Treino' : 'Dieta'} salvo(a) com sucesso!`);
    setSaving(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';
    const allMessages = [...messages, userMsg];

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
            messages: allMessages.map(m => ({ role: m.role, content: m.content })),
            studentContext,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      if (!resp.body) throw new Error('Sem resposta do servidor');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && prev.length > 1 && prev[prev.length - 2]?.role === 'user') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: 'assistant', content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao gerar resposta');
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasAssistantMessages = messages.some(m => m.role === 'assistant' && messages.some(u => u.role === 'user'));

  return (
    <AppLayout title={`Treino IA - ${studentName}`}>
      <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" onClick={() => navigate(`/alunos/${studentId}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          {hasAssistantMessages && !isLoading && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => saveAsPlan('treino')} disabled={saving}>
                <Save className="mr-1 h-3 w-3" /> Salvar Treino
              </Button>
              <Button variant="outline" size="sm" onClick={() => saveAsPlan('dieta')} disabled={saving}>
                <Save className="mr-1 h-3 w-3" /> Salvar Dieta
              </Button>
            </div>
          )}
        </div>

        <Card className="glass-card flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-2 [&_td]:p-2 [&_td]:border [&_th]:border">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-3 justify-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-secondary rounded-2xl px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                className="resize-none min-h-[44px] max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />
              <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon" className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default TreinoIA;
