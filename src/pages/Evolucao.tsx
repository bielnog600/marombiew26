import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageChrome } from '@/hooks/usePageChrome';
import { ArrowLeft, TrendingDown, TrendingUp, Minus, Scale, Plus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Period = '7D' | '1M' | '3M' | '6M' | '1A' | 'Todo';

interface WeightRecord {
  date: string;
  peso: number;
}

const PERIODS: Period[] = ['7D', '1M', '3M', '6M', '1A', 'Todo'];

function subtractPeriod(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case '7D': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case '1M': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3M': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6M': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '1A': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    default: return null;
  }
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const Evolucao = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [period, setPeriod] = useState<Period>('Todo');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pesoInput, setPesoInput] = useState('');
  const [dataInput, setDataInput] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  usePageChrome({
    safeAreaBackground: 'var(--gradient-chrome)',
    themeColor: 'hsl(45 100% 50%)',
  });

  const load = useCallback(async () => {
    if (!user) return;
    // Assessments + their anthropometrics
    const { data: assessments } = await supabase
      .from('assessments')
      .select('id, created_at')
      .eq('student_id', user.id)
      .order('created_at', { ascending: true });

    const recs: WeightRecord[] = [];
    if (assessments?.length) {
      const { data: anthros } = await supabase
        .from('anthropometrics')
        .select('assessment_id, peso')
        .in('assessment_id', assessments.map(a => a.id));
      const weightMap = new Map(anthros?.map(a => [a.assessment_id, a.peso]) ?? []);
      for (const a of assessments) {
        const peso = weightMap.get(a.id);
        if (peso) recs.push({ date: a.created_at.slice(0, 10), peso: Number(peso) });
      }
    }

    // Weight logs (manual entries)
    const { data: logs } = await supabase
      .from('weight_logs')
      .select('data, peso')
      .eq('student_id', user.id)
      .order('data', { ascending: true });
    if (logs) {
      for (const l of logs) recs.push({ date: l.data, peso: Number(l.peso) });
    }

    recs.sort((a, b) => a.date.localeCompare(b.date));
    setRecords(recs);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!user) return;
    const peso = Number(pesoInput.replace(',', '.'));
    if (!Number.isFinite(peso) || peso < 20 || peso > 400) {
      toast.error('Informe um peso válido entre 20 e 400 kg.');
      return;
    }
    if (!dataInput) {
      toast.error('Informe a data.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('weight_logs').insert({
      student_id: user.id,
      peso,
      data: dataInput,
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Peso registrado!');
    setDialogOpen(false);
    setPesoInput('');
    setDataInput(todayStr());
    load();
  };

  const filtered = useMemo(() => {
    const cutoff = subtractPeriod(period);
    if (!cutoff) return records;
    return records.filter(r => new Date(r.date) >= cutoff);
  }, [records, period]);

  const current = filtered.length ? filtered[filtered.length - 1].peso : null;
  const initial = filtered.length ? filtered[0].peso : null;
  const variation = current && initial ? +(current - initial).toFixed(1) : null;
  const trend = variation === null ? null : variation < 0 ? 'down' : variation > 0 ? 'up' : 'stable';
  const firstDate = records.length ? records[0].date : null;

  const chartData = filtered.map(r => ({
    date: r.date,
    peso: r.peso,
    label: new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="relative" style={{ background: 'var(--gradient-chrome)' }}>
        <div className="flex items-center gap-3 px-4 py-4">
          <button onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold text-primary-foreground flex-1 text-center pr-6">Evolução</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-28 space-y-5 animate-fade-in">
        {/* Period Filter */}
        <div className="flex gap-2 justify-center flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === p ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-10">Carregando...</div>
        ) : !records.length ? (
          <div className="text-center text-muted-foreground py-10">Nenhum peso registrado ainda. Toque em "Registrar peso em jejum" para começar.</div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Scale className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Peso</p>
                <div className="flex items-center gap-1">
                  {trend === 'down' && <TrendingDown className="h-4 w-4 text-green-500" />}
                  {trend === 'up' && <TrendingUp className="h-4 w-4 text-red-400" />}
                  {trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
                  <span className={`text-xs font-medium ${trend === 'down' ? 'text-green-500' : trend === 'up' ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {trend === 'down' ? 'Descendo' : trend === 'up' ? 'Subindo' : 'Estável'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-extrabold text-primary">{current}kg</p>
                {variation !== null && (
                  <p className={`text-sm font-bold ${variation < 0 ? 'text-green-500' : variation > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {variation > 0 ? '+' : ''}{variation}kg
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Inicial', value: initial ? `${initial}kg` : '-' },
                { label: 'Variação', value: variation !== null ? `${variation > 0 ? '+' : ''}${variation}kg` : '-', color: variation && variation < 0 ? 'text-green-500' : variation && variation > 0 ? 'text-red-400' : undefined },
                { label: 'Registros', value: String(filtered.length) },
              ].map((s, i) => (
                <div key={i} className="glass-card p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className={`text-sm font-bold ${s.color || 'text-foreground'}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {firstDate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                📅 Acompanhando desde: {new Date(firstDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}

            <div className="glass-card p-4">
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
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar peso em jejum</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
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
                value={pesoInput}
                onChange={(e) => setPesoInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={dataInput}
                max={todayStr()}
                onChange={(e) => setDataInput(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Recomendado: pesar pela manhã, em jejum, após urinar e sem roupa pesada.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Evolucao;
