import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  const handleSubmit = async () => {
    setLoading(true);
    const { error } = await supabase.from('diet_readjustments').insert({
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
    } as any);
    setLoading(false);

    if (error) {
      toast.error('Erro ao salvar questionário');
      return;
    }

    toast.success('Questionário de reajuste salvo!');
    resetForm();
    setShowForm(false);
    loadHistory();
    onSaved?.();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Reajuste de Dieta
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-3">
          {!showForm ? (
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
                  {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                  Salvar
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
