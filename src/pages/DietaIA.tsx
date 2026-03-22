import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Send, Bot, User, Loader2, Save, UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

const DietaIA = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [studentContext, setStudentContext] = useState<any>(null);
  const [studentName, setStudentName] = useState('Aluno');
  const [saving, setSaving] = useState(false);
  const [viewportHeight, setViewportHeight] = useState('100dvh');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (studentId) loadStudentData();
  }, [studentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setViewportHeight(`${vv.height}px`);
      if (containerRef.current) {
        containerRef.current.style.height = `${vv.height}px`;
        containerRef.current.style.transform = `translateY(${vv.offsetTop}px)`;
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  const loadStudentData = async () => {
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

    const ctx = {
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
      cintura: anthro?.cintura,
      quadril: anthro?.quadril,
      rcq: anthro?.rcq,
      percentual_gordura: comp?.percentual_gordura,
      massa_magra: comp?.massa_magra,
      massa_gorda: comp?.massa_gorda,
      fc_repouso: vitals?.fc_repouso,
      anamnese: anamnese ? {
        historico_saude: anamnese.historico_saude, medicacao: anamnese.medicacao,
        suplementos: anamnese.suplementos, sono: anamnese.sono, stress: anamnese.stress,
        rotina: anamnese.rotina, treino_atual: anamnese.treino_atual,
      } : null,
      fotos_avaliacao: photos.length > 0 ? photos.map(p => ({ tipo: p.tipo, url: p.url })) : null,
    };

    setStudentContext(ctx);
    setStudentName(profile?.nome || 'Aluno');

    const dataPoints: string[] = [];
    if (ctx.objetivo) dataPoints.push(`objetivo: **${ctx.objetivo}**`);
    if (ctx.peso) dataPoints.push(`peso: ${ctx.peso}kg`);
    if (ctx.altura) dataPoints.push(`altura: ${ctx.altura}cm`);
    if (ctx.percentual_gordura) dataPoints.push(`gordura: ${ctx.percentual_gordura}%`);
    if (ctx.massa_magra) dataPoints.push(`massa magra: ${ctx.massa_magra}kg`);
    if (ctx.restricoes) dataPoints.push(`restrições: ${ctx.restricoes}`);

    const dataStr = dataPoints.length > 0 ? `\n\nDados carregados: ${dataPoints.join(', ')}.` : '';

    setMessages([{
      role: 'assistant',
      content: `🍽️ Olá! Sou seu assistente de **nutrição esportiva**. Já tenho todos os dados do(a) **${profile?.nome || 'aluno'}** carregados (perfil, avaliação física, composição corporal, anamnese${ctx.fotos_avaliacao ? ', fotos' : ''}).${dataStr}\n\nVou calcular a TMB por várias fórmulas e sugerir estratégias nutricionais personalizadas.\n\nPrimeiro, qual o **nível de atividade física** desse aluno?\n- Sedentário\n- Super Levemente Ativo\n- Levemente Ativo\n- Moderadamente Ativo\n- Altamente Ativo\n- Extremamente Ativo`
    }]);
  };

  const extractTablesOnly = (content: string): string => {
    const lines = content.split('\n');
    const tables: string[] = [];
    let inTable = false;
    let currentTable: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
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
    if (currentTable.length > 0) tables.push(currentTable.join('\n'));
    return tables.length > 0 ? tables.join('\n\n') : content;
  };

  const saveAsPlan = async () => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    setSaving(true);
    const extracted = extractTablesOnly(lastAssistant.content);
    const { error } = await supabase.from('ai_plans').insert({
      student_id: studentId!,
      tipo: 'dieta',
      titulo: `Dieta - ${new Date().toLocaleDateString('pt-BR')}`,
      conteudo: extracted,
    });
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Dieta salva com sucesso!');
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`,
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const hasAssistantMessages = messages.some(m => m.role === 'assistant' && messages.some(u => u.role === 'user'));

  return (
    <div ref={containerRef} className="fixed inset-x-0 top-0 z-50 flex flex-col bg-background overflow-hidden" style={{ height: viewportHeight, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-background">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/alunos/${studentId}`)} className="gap-1 px-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <UtensilsCrossed className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm truncate">Dieta - {studentName}</span>
        </div>
        {hasAssistantMessages && !isLoading ? (
          <Button variant="ghost" size="sm" onClick={saveAsPlan} disabled={saving} className="text-xs px-2">
            <Save className="h-3 w-3 mr-1" /> Salvar
          </Button>
        ) : <div className="w-16" />}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary mt-1">
                <UtensilsCrossed className="h-3.5 w-3.5" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm ${
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
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
              <UtensilsCrossed className="h-3.5 w-3.5" />
            </div>
            <div className="bg-secondary rounded-2xl px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

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

export default DietaIA;
