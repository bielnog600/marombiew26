import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    let posture: any = null;
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

    // Load posture scans
    const { data: postureScans } = await supabase
      .from('posture_scans')
      .select('*')
      .eq('student_id', studentId!)
      .order('created_at', { ascending: false })
      .limit(1);
    const latestPostureScan = postureScans?.[0] ?? null;

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
      percentual_gordura: comp?.percentual_gordura,
      massa_magra: comp?.massa_magra,
      massa_gorda: comp?.massa_gorda,
      fc_repouso: vitals?.fc_repouso,
      pressao: vitals?.pressao,
      spo2: vitals?.spo2,
      glicemia: vitals?.glicemia,
      skinfolds: skinfolds ? { metodo: skinfolds.metodo, triceps: skinfolds.triceps, peitoral: skinfolds.peitoral, subescapular: skinfolds.subescapular, axilar_media: skinfolds.axilar_media, suprailiaca: skinfolds.suprailiaca, abdominal: skinfolds.abdominal, coxa: skinfolds.coxa } : null,
      anamnese: anamnese ? { historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao, suplementos: anamnese.suplementos, cirurgias: anamnese.cirurgias, dores: anamnese.dores, sono: anamnese.sono, stress: anamnese.stress, rotina: anamnese.rotina, treino_atual: anamnese.treino_atual, tabagismo: anamnese.tabagismo, alcool: anamnese.alcool } : null,
      performance: performance ? { cooper_12min: performance.cooper_12min, pushup: performance.pushup, plank: performance.plank, salto_vertical: performance.salto_vertical, agachamento_score: performance.agachamento_score, mobilidade_ombro: performance.mobilidade_ombro, mobilidade_quadril: performance.mobilidade_quadril, mobilidade_tornozelo: performance.mobilidade_tornozelo } : null,
      // Posture data
      posture: posture ? { vista_anterior: posture.vista_anterior, vista_lateral: posture.vista_lateral, vista_posterior: posture.vista_posterior, observacoes: posture.observacoes } : null,
      posture_scan: latestPostureScan ? {
        angles: latestPostureScan.angles_json,
        attention_points: latestPostureScan.attention_points_json,
        region_scores: latestPostureScan.region_scores_json,
        notes: latestPostureScan.notes,
      } : null,
      // Photos
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
      fotos_perfil: sp?.fotos ?? null,
    };

    setStudentContext(ctx);
    setStudentName(profile?.nome || 'Aluno');

    const dataPoints: string[] = [];
    if (ctx.objetivo) dataPoints.push(`objetivo: **${ctx.objetivo}**`);
    if (ctx.peso) dataPoints.push(`peso: ${ctx.peso}kg`);
    if (ctx.altura) dataPoints.push(`altura: ${ctx.altura}cm`);
    if (ctx.percentual_gordura) dataPoints.push(`gordura: ${ctx.percentual_gordura}%`);
    if (ctx.lesoes) dataPoints.push(`lesões: ${ctx.lesoes}`);
    if (ctx.restricoes) dataPoints.push(`restrições: ${ctx.restricoes}`);
    if (ctx.posture || ctx.posture_scan) dataPoints.push('análise postural ✅');
    if (ctx.fotos_avaliacao) dataPoints.push(`${ctx.fotos_avaliacao.length} foto(s) da avaliação`);

    const dataStr = dataPoints.length > 0 ? `\n\nDados já carregados: ${dataPoints.join(', ')}.` : '';

    setMessages([{
      role: 'assistant',
      content: `Olá! Sou seu assistente de treino e dieta. Já tenho **todos os dados** do(a) **${profile?.nome || 'aluno'}** carregados do sistema (perfil, avaliação física, anamnese, composição corporal, sinais vitais, testes de performance${ctx.posture_scan ? ', análise postural' : ''}${ctx.fotos_avaliacao ? ', fotos' : ''}).${dataStr}\n\nVou usar essas informações para montar um protocolo personalizado sem perguntar o que já sei. Vamos começar!\n\nQual é o **nível** desse aluno? (iniciante, intermediário ou avançado)`
    }]);
  };

  const extractTablesOnly = (content: string): string => {
    const lines = content.split('\n');
    const tables: string[] = [];
    let inTable = false;
    let currentTable: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // A markdown table row starts with |
      if (trimmed.startsWith('|')) {
        if (!inTable) inTable = true;
        currentTable.push(line);
      } else {
        if (inTable) {
          tables.push(currentTable.join('\n'));
          currentTable = [];
          inTable = false;
        }
      }
    }
    if (currentTable.length > 0) {
      tables.push(currentTable.join('\n'));
    }

    return tables.length > 0 ? tables.join('\n\n') : content;
  };

  const saveAsPlan = async (type: 'treino' | 'dieta') => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    setSaving(true);
    
    const extracted = extractTablesOnly(lastAssistant.content);
    
    const { error } = await supabase.from('ai_plans').insert({
      student_id: studentId!,
      tipo: type,
      titulo: `${type === 'treino' ? 'Treino' : 'Dieta'} - ${new Date().toLocaleDateString('pt-BR')}`,
      conteudo: extracted,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-background"  >
        <Button variant="ghost" size="sm" onClick={() => navigate(`/alunos/${studentId}`)} className="gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">{studentName}</span>
        </div>
        {hasAssistantMessages && !isLoading ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => saveAsPlan('treino')} disabled={saving} className="text-xs px-2">
              <Save className="h-3 w-3 mr-1" /> Treino
            </Button>
            <Button variant="ghost" size="sm" onClick={() => saveAsPlan('dieta')} disabled={saving} className="text-xs px-2">
              <Save className="h-3 w-3 mr-1" /> Dieta
            </Button>
          </div>
        ) : <div className="w-20" />}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary mt-1">
                <Bot className="h-3.5 w-3.5" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground mt-1">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2 justify-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="bg-secondary rounded-2xl px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2 shrink-0 safe-area-bottom bg-background">
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="resize-none min-h-[44px] max-h-[100px] text-base"
            rows={1}
            disabled={isLoading}
          />
          <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-[44px] w-[44px]">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TreinoIA;
