import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, TrendingDown, TrendingUp, Minus, Scale } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

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

const Evolucao = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [period, setPeriod] = useState<Period>('Todo');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Get all assessments for this student with their weight
      const { data: assessments } = await supabase
        .from('assessments')
        .select('id, created_at')
        .eq('student_id', user.id)
        .order('created_at', { ascending: true });

      if (!assessments?.length) { setLoading(false); return; }

      const { data: anthros } = await supabase
        .from('anthropometrics')
        .select('assessment_id, peso')
        .in('assessment_id', assessments.map(a => a.id));

      const weightMap = new Map(anthros?.map(a => [a.assessment_id, a.peso]) ?? []);

      const recs: WeightRecord[] = [];
      for (const a of assessments) {
        const peso = weightMap.get(a.id);
        if (peso) recs.push({ date: a.created_at.slice(0, 10), peso });
      }
      setRecords(recs);
      setLoading(false);
    })();
  }, [user]);

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
      {/* Gradient Header */}
      <div
        className="relative"
        style={{
          background: 'var(--gradient-chrome)',
        }}
      >
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
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-10">Carregando...</div>
        ) : !records.length ? (
          <div className="text-center text-muted-foreground py-10">Nenhuma avaliação com peso registrado.</div>
        ) : (
          <>
            {/* Weight Highlight */}
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

            {/* Stats Row */}
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

            {/* Since Date */}
            {firstDate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                📅 Acompanhando desde: {new Date(firstDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}

            {/* Chart */}
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
    </div>
  );
};

export default Evolucao;
