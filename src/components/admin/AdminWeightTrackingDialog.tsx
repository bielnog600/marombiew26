import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Scale, TrendingDown, TrendingUp, Minus, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName?: string;
  onSaved?: () => void;
}

interface WeightRecord {
  date: string;
  peso: number;
  source: 'log' | 'assessment';
  id?: string;
  observacao?: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const AdminWeightTrackingDialog: React.FC<Props> = ({ open, onOpenChange, studentId, studentName, onSaved }) => {
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [peso, setPeso] = useState('');
  const [data, setData] = useState(todayStr());
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const recs: WeightRecord[] = [];

    const { data: assessments } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: true });

    if (assessments?.length) {
      const { data: anthros } = await supabase
        .from('anthropometrics')
        .select('assessment_id, peso')
        .in('assessment_id', assessments.map(a => a.id));
      const weightMap = new Map(anthros?.map(a => [a.assessment_id, a.peso]) ?? []);
      for (const a of assessments) {
        const p = weightMap.get(a.id);
        if (p) recs.push({ date: a.created_at.slice(0, 10), peso: Number(p), source: 'assessment' });
      }
    }

    const { data: logs } = await supabase
      .from('weight_logs')
      .select('id, data, peso, observacao')
      .eq('student_id', studentId)
      .order('data', { ascending: true });
    if (logs) {
      for (const l of logs) recs.push({ id: l.id, date: l.data, peso: Number(l.peso), source: 'log', observacao: l.observacao });
    }

    recs.sort((a, b) => a.date.localeCompare(b.date));
    setRecords(recs);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    if (open) {
      load();
      setPeso('');
      setObservacao('');
      setData(todayStr());
    }
  }, [open, load]);

  const handleSave = async () => {
    const pesoNum = Number(peso.replace(',', '.'));
    if (!Number.isFinite(pesoNum) || pesoNum < 20 || pesoNum > 400) {
      toast.error('Informe um peso válido entre 20 e 400 kg.');
      return;
    }
    if (!data) {
      toast.error('Informe a data.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('weight_logs').insert({
      student_id: studentId,
      peso: pesoNum,
      data,
      observacao: observacao.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Peso registrado. A IA usará este peso na próxima dieta.');
    setPeso('');
    setObservacao('');
    load();
    onSaved?.();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('weight_logs').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
      return;
    }
    toast.success('Registro removido.');
    load();
    onSaved?.();
  };

  const chartData = useMemo(
    () =>
      records.map(r => ({
        date: r.date,
        peso: r.peso,
        label: new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      })),
    [records]
  );

  const current = records.length ? records[records.length - 1].peso : null;
  const initial = records.length ? records[0].peso : null;
  const variation = current !== null && initial !== null ? +(current - initial).toFixed(1) : null;
  const trend = variation === null ? null : variation < 0 ? 'down' : variation > 0 ? 'up' : 'stable';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Peso do aluno
          </DialogTitle>
          <DialogDescription>
            {studentName ? `${studentName} — ` : ''}Registre o peso atual e acompanhe a evolução. A IA usará o peso mais recente para gerar dietas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Registrar novo peso */}
          <div className="rounded-lg border border-border/60 p-3 space-y-3">
            <p className="text-sm font-semibold">Registrar novo peso</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="peso">Peso (kg)</Label>
                <Input
                  id="peso"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="20"
                  max="400"
                  placeholder="Ex: 78.5"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" value={data} max={todayStr()} onChange={(e) => setData(e.target.value)} className="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs">Observação</Label>
                <Input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" className="w-full" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto font-semibold">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : <><Scale className="h-4 w-4 mr-2" /> Salvar peso</>}
            </Button>
          </div>

          {/* Resumo */}
          {loading ? (
            <div className="text-center text-muted-foreground py-6 text-sm">Carregando...</div>
          ) : records.length === 0 ? (
            <div className="text-center text-muted-foreground py-6 text-sm">Nenhum registro de peso ainda.</div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                <div className="h-11 w-11 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Scale className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Peso atual</p>
                  <p className="text-2xl font-extrabold text-primary leading-tight">{current}kg</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {trend === 'down' && <TrendingDown className="h-4 w-4 text-green-500" />}
                    {trend === 'up' && <TrendingUp className="h-4 w-4 text-red-400" />}
                    {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
                    <span className={`text-xs font-bold ${trend === 'down' ? 'text-green-500' : trend === 'up' ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {variation !== null ? `${variation > 0 ? '+' : ''}${variation}kg` : '-'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Inicial: {initial}kg</p>
                  <p className="text-[11px] text-muted-foreground">{records.length} registros</p>
                </div>
              </div>

              {/* Gráfico */}
              <div className="rounded-lg border border-border/60 p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${v}kg`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220 18% 10%)', border: '1px solid hsl(220 14% 18%)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: 'hsl(0 0% 85%)' }}
                      formatter={(v: number) => [`${v}kg`, 'Peso']}
                    />
                    <Line
                      type="monotone"
                      dataKey="peso"
                      stroke="hsl(45 100% 50%)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: 'hsl(45 100% 50%)', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: 'hsl(45 100% 50%)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Histórico */}
              <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-64 overflow-y-auto">
                {[...records].reverse().map((r, i) => (
                  <div key={`${r.source}-${r.id ?? i}-${r.date}`} className="flex items-center gap-2 p-2.5 text-sm">
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                    <span className="font-bold text-primary w-16">{r.peso}kg</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {r.source === 'log' ? 'registro' : 'avaliação'}
                    </span>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{r.observacao || ''}</span>
                    {r.source === 'log' && r.id && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r.id!)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminWeightTrackingDialog;