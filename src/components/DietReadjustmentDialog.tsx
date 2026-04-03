import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck, Sparkles, ArrowLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  studentId: string;
  onSaved?: () => void;
}

const RENDIMENTO_OPTIONS = [
  { value: 'melhorou', label: 'Melhorou' },
  { value: 'manteve', label: 'Manteve' },
  { value: 'piorou', label: 'Piorou' },
];

const SATISFACAO_OPTIONS = [
  { value: 'muito_satisfeito', label: 'Muito satisfeito' },
  { value: 'satisfeito', label: 'Satisfeito' },
  { value: 'neutro', label: 'Neutro' },
  { value: 'insatisfeito', label: 'Insatisfeito' },
];

const DietReadjustmentDialog = ({ open, onOpenChange, planId, studentId, onSaved }: Props) => {
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);

  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [showAiResult, setShowAiResult] = useState(false);
  const aiResultRef = useRef<HTMLDivElement>(null);

  const [pesoAtual, setPesoAtual] = useState('');
  const [perdeuPeso, setPerdeuPeso] = useState(false);
  const [ganhouMassa, setGanhouMassa] = useState(false);
  const [energiaOk, setEnergiaOk] = useState(true);
  const [fomeExcessiva, setFomeExcessiva] = useState(false);
  const [insonia, setInsonia] = useState(false);
  const [intestinoOk, setIntestinoOk] = useState(true);
  const [humorOk, setHumorOk] = useState(true);
  const [rendimentoTreino, setRendimentoTreino] = useState('manteve');
  const [satisfacao, setSatisfacao] = useState('satisfeito');
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    if (open) {
      loadHistory();
      setShowForm(false);
      setShowAiResult(false);
      setAiAnalysis('');
    }
  }, [open, planId]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('diet_readjustments')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false });
    setHistory(data ?? []);
    setLoadingHistory(false);
  };

  const resetForm = () => {
    setPesoAtual('');
    setPerdeuPeso(false);
    setGanhouMassa(false);
    setEnergiaOk(true);
    setFomeExcessiva(false);
    setInsonia(false);
    setIntestinoOk(true);
    setHumorOk(true);
    setRendimentoTreino('manteve');
    setSatisfacao('satisfeito');
    setObservacoes('');
  };

  const runAiAnalysis = async (readjustmentData: Record<string, any>) => {
    setAnalyzingAi(true);
    setShowAiResult(true);
    setAiAnalysis('');

    try {
      // Fetch the current plan content
      const { data: plan } = await supabase
        .from('ai_plans')
        .select('conteudo, titulo')
        .eq('id', planId)
        .maybeSingle();

      if (!plan) {
        setAiAnalysis('Erro: Plano não encontrado.');
        setAnalyzingAi(false);
        return;
      }

      // Fetch student context
      const [profileRes, spRes] = await Promise.all([
        supabase.from('profiles').select('nome').eq('user_id', studentId).maybeSingle(),
        supabase.from('students_profile').select('sexo, data_nascimento, altura, objetivo').eq('user_id', studentId).maybeSingle(),
      ]);

      // Also fetch all previous readjustments for this plan
      const { data: allReadjustments } = await supabase
        .from('diet_readjustments')
        .select('*')
        .eq('plan_id', planId)
        .order('created_at', { ascending: true });

      const readjustmentHistory = (allReadjustments ?? []).map((r: any) => {
        const date = new Date(r.created_at).toLocaleDateString('pt-BR');
        return `[${date}] Peso: ${r.peso_atual ?? '?'}kg | Perdeu peso: ${r.perdeu_peso ? 'Sim' : 'Não'} | Ganhou massa: ${r.ganhou_massa ? 'Sim' : 'Não'} | Energia OK: ${r.energia_ok ? 'Sim' : 'Não'} | Fome excessiva: ${r.fome_excessiva ? 'Sim' : 'Não'} | Insônia: ${r.insonia ? 'Sim' : 'Não'} | Intestino OK: ${r.intestino_ok ? 'Sim' : 'Não'} | Humor OK: ${r.humor_ok ? 'Sim' : 'Não'} | Rendimento: ${r.rendimento_treino} | Satisfação: ${r.satisfacao} | Obs: ${r.observacoes || '-'}`;
      }).join('\n');

      const prompt = `
O aluno ${profileRes.data?.nome || 'sem nome'} (${spRes.data?.sexo || '?'}, objetivo: ${spRes.data?.objetivo || '?'}) respondeu o questionário de reajuste da dieta "${plan.titulo}".

=== DADOS DO QUESTIONÁRIO ATUAL ===
- Peso atual: ${readjustmentData.peso_atual ?? 'Não informado'} kg
- Perdeu peso: ${readjustmentData.perdeu_peso ? 'Sim' : 'Não'}
- Ganhou massa: ${readjustmentData.ganhou_massa ? 'Sim' : 'Não'}
- Energia OK: ${readjustmentData.energia_ok ? 'Sim' : 'Não'}
- Fome excessiva: ${readjustmentData.fome_excessiva ? 'Sim' : 'Não'}
- Insônia: ${readjustmentData.insonia ? 'Sim' : 'Não'}
- Intestino OK: ${readjustmentData.intestino_ok ? 'Sim' : 'Não'}
- Humor OK: ${readjustmentData.humor_ok ? 'Sim' : 'Não'}
- Rendimento no treino: ${readjustmentData.rendimento_treino}
- Satisfação com a dieta: ${readjustmentData.satisfacao}
- Observações: ${readjustmentData.observacoes || 'Nenhuma'}

=== HISTÓRICO DE REAJUSTES ANTERIORES ===
${readjustmentHistory || 'Nenhum reajuste anterior.'}

=== DIETA ATUAL ===
${plan.conteudo}

Com base nos dados acima, faça uma análise detalhada e sugira ajustes específicos na dieta:

1. **Análise dos Resultados**: Interprete os dados do questionário (positivos e negativos)
2. **Diagnóstico**: Identifique possíveis problemas (ex: déficit muito agressivo, falta de fibras, baixo carb peri-treino, etc.)
3. **Sugestões de Ajuste**: Liste alterações específicas recomendadas:
   - Ajuste calórico (aumentar/diminuir e quanto)
   - Ajuste de macros (qual macro ajustar e por quê)
   - Troca de alimentos específicos
   - Timing nutricional
   - Suplementação adicional se necessário
4. **Próximos Passos**: O que monitorar nas próximas semanas

Seja direto e específico nas recomendações. Use os dados reais da dieta atual para propor mudanças concretas.
`.trim();

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diet-agent`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          studentContext: {
            nome: profileRes.data?.nome,
            sexo: spRes.data?.sexo,
            data_nascimento: spRes.data?.data_nascimento,
            altura: spRes.data?.altura,
            objetivo: spRes.data?.objetivo,
          },
        }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text();
        console.error('AI error:', errText);
        setAiAnalysis('Erro ao analisar com IA. Tente novamente.');
        setAnalyzingAi(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let accumulated = '';

      while (true) {
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
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setAiAnalysis(accumulated);
            }
          } catch { /* partial */ }
        }
      }
    } catch (err) {
      console.error('AI analysis error:', err);
      setAiAnalysis('Erro ao conectar com a IA. Tente novamente.');
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);

    const readjustmentData = {
      plan_id: planId,
      student_id: studentId,
      peso_atual: pesoAtual ? Number(pesoAtual) : null,
      perdeu_peso: perdeuPeso,
      ganhou_massa: ganhouMassa,
      energia_ok: energiaOk,
      fome_excessiva: fomeExcessiva,
      insonia: insonia,
      intestino_ok: intestinoOk,
      humor_ok: humorOk,
      rendimento_treino: rendimentoTreino,
      satisfacao: satisfacao,
      observacoes: observacoes || null,
    };

    const { error } = await supabase.from('diet_readjustments').insert(readjustmentData as any);
    setLoading(false);

    if (error) {
      toast.error('Erro ao salvar questionário');
      return;
    }

    toast.success('Questionário salvo! Analisando com IA...');
    setShowForm(false);
    loadHistory();
    onSaved?.();

    // Trigger AI analysis
    runAiAnalysis(readjustmentData);
  };

  const handleAnalyzeExisting = async (readjustment: any) => {
    runAiAnalysis(readjustment);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Reajuste de Dieta
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          {showAiResult ? (
            <div className="space-y-4" ref={aiResultRef}>
              <Button variant="outline" size="sm" onClick={() => setShowAiResult(false)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                <h4 className="font-semibold text-sm">Análise e Sugestões da IA</h4>
              </div>
              {analyzingAi && !aiAnalysis && (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span className="text-sm">Analisando dados e gerando sugestões...</span>
                </div>
              )}
              {aiAnalysis && (
                <div className="prose prose-sm prose-invert max-w-none rounded-lg border border-border p-4 bg-muted/30">
                  <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                </div>
              )}
              {analyzingAi && aiAnalysis && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="animate-spin h-3 w-3" />
                  <span className="text-xs">Gerando...</span>
                </div>
              )}
            </div>
          ) : !showForm ? (
            <div className="space-y-4">
              <Button onClick={() => { resetForm(); setShowForm(true); }} className="w-full">
                Novo Questionário de Reajuste
              </Button>

              {loadingHistory ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum reajuste registrado ainda.</p>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico</h4>
                  {history.map((h: any) => (
                    <div key={h.id} className="rounded-lg border border-border p-3 space-y-1 text-sm">
                      <p className="text-xs text-muted-foreground">{formatDate(h.created_at)}</p>
                      {h.peso_atual && <p><span className="font-medium">Peso:</span> {h.peso_atual} kg</p>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {h.perdeu_peso && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Perdeu peso</span>}
                        {h.ganhou_massa && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Ganhou massa</span>}
                        {!h.energia_ok && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">Baixa energia</span>}
                        {h.fome_excessiva && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Fome excessiva</span>}
                        {h.insonia && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Insônia</span>}
                        {!h.intestino_ok && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Intestino irregular</span>}
                        {!h.humor_ok && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Humor alterado</span>}
                      </div>
                      <p><span className="font-medium">Rendimento:</span> {h.rendimento_treino === 'melhorou' ? 'Melhorou' : h.rendimento_treino === 'piorou' ? 'Piorou' : 'Manteve'}</p>
                      <p><span className="font-medium">Satisfação:</span> {h.satisfacao?.replace('_', ' ')}</p>
                      {h.observacoes && <p className="text-muted-foreground italic">{h.observacoes}</p>}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-2 w-full"
                        onClick={() => handleAnalyzeExisting(h)}
                      >
                        <Sparkles className="h-3 w-3" />
                        Analisar com IA
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Peso Atual (kg)</Label>
                <Input type="number" step="0.1" value={pesoAtual} onChange={e => setPesoAtual(e.target.value)} placeholder="Ex: 82.5" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Perdeu peso?</Label>
                  <Switch checked={perdeuPeso} onCheckedChange={setPerdeuPeso} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Ganhou massa?</Label>
                  <Switch checked={ganhouMassa} onCheckedChange={setGanhouMassa} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Energia OK?</Label>
                  <Switch checked={energiaOk} onCheckedChange={setEnergiaOk} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Fome excessiva?</Label>
                  <Switch checked={fomeExcessiva} onCheckedChange={setFomeExcessiva} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Insônia?</Label>
                  <Switch checked={insonia} onCheckedChange={setInsonia} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Intestino OK?</Label>
                  <Switch checked={intestinoOk} onCheckedChange={setIntestinoOk} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="text-sm">Humor OK?</Label>
                  <Switch checked={humorOk} onCheckedChange={setHumorOk} />
                </div>
              </div>

              <div>
                <Label>Rendimento no treino</Label>
                <Select value={rendimentoTreino} onValueChange={setRendimentoTreino}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RENDIMENTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Satisfação com a dieta</Label>
                <Select value={satisfacao} onValueChange={setSatisfacao}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SATISFACAO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Detalhes sobre resultados, dificuldades..." rows={3} />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                  {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Salvar & Analisar
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default DietReadjustmentDialog;
