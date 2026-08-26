import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Scale, TrendingDown, TrendingUp, Minus, Plus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import {
  MAX_VALID_WEIGHT_KG,
  MIN_VALID_WEIGHT_KG,
  isValidWeightKg,
  isCheckinActionable,
  resolveWeightCheckin,
  todayIso,
} from '@/lib/weightCheckin';
import { normalizeWeights, type WeightEntry } from '@/lib/weightReview';

interface Props {
  studentId: string;
}

const CHART_POINTS = 8;

const fmtKg = (v: number) => `${v.toFixed(1).replace('.', ',')} kg`;
const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

const StudentWeightCard: React.FC<Props> = ({ studentId }) => {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [peso, setPeso] = useState('');
  const [data, setData] = useState(todayIso());
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const collected: WeightEntry[] = [];

    // Fonte canônica: weight_logs (janela limitada por performance)
    const { data: logs } = await supabase
      .from('weight_logs')
      .select('peso, data')
      .eq('student_id', studentId)
      .order('data', { ascending: false })
      .limit(CHART_POINTS + 4);
    for (const l of logs ?? []) collected.push({ date: String(l.data), kg: Number(l.peso) });

    // Complemento apenas para o gráfico inicial (mesma origem do AdminWeightTrackingDialog)
    if (collected.length < 2) {
      const { data: assessments } = await supabase
        .from('assessments')
        .select('id, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(CHART_POINTS);
      if (assessments?.length) {
        const { data: anthros } = await supabase
          .from('anthropometrics')
          .select('assessment_id, peso')
          .in(
            'assessment_id',
            assessments.map((a) => a.id),
          );
        const map = new Map(anthros?.map((a) => [a.assessment_id, a.peso]) ?? []);
        for (const a of assessments) {
          const p = map.get(a.id);
          if (p != null) collected.push({ date: String(a.created_at).slice(0, 10), kg: Number(p) });
        }
      }
    }

    setEntries(normalizeWeights(collected));
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const current = entries[0] ?? null;
  const previous = entries[1] ?? null;
  const delta = current && previous ? Number((current.kg - previous.kg).toFixed(1)) : null;
  const checkin = useMemo(() => resolveWeightCheckin(current?.date ?? null), [current?.date]);
  const highlight = isCheckinActionable(checkin.state);

  const chartData = useMemo(
    () =>
      [...entries]
        .slice(0, CHART_POINTS)
        .reverse()
        .map((e) => ({ label: fmtDate(e.date), peso: e.kg })),
    [entries],
  );

  const handleSave = async () => {
    const pesoNum = Number(peso.replace(',', '.'));
    if (!isValidWeightKg(pesoNum)) {
      toast.error(`Informe um peso válido entre ${MIN_VALID_WEIGHT_KG} e ${MAX_VALID_WEIGHT_KG} kg.`);
      return;
    }
    if (!data) {
      toast.error('Informe a data.');
      return;
    }
    if (data > todayIso()) {
      toast.error('Não é possível registrar uma data futura.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('Sem conexão. Tente novamente quando estiver online.');
      return;
    }

    setSaving(true);
    // student_id derivado exclusivamente da sessão autenticada
    const { data: auth } = await supabase.auth.getUser();
    const authedId = auth?.user?.id;
    if (!authedId) {
      setSaving(false);
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }

    const { error } = await supabase.from('weight_logs').insert({
      student_id: authedId,
      peso: pesoNum,
      data,
      observacao: observacao.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }

    toast.success('Peso registrado com sucesso.');
    setOpen(false);
    setPeso('');
    setObservacao('');
    setData(todayIso());
    await load();

    // Gate determinístico + eventual revisão da dieta roda no servidor.
    supabase.functions.invoke('weight-checkin-review', { body: {} }).catch(() => {});
  };

  const deltaIcon =
    delta == null ? null : delta < 0 ? (
      <TrendingDown className="h-4 w-4" />
    ) : delta > 0 ? (
      <TrendingUp className="h-4 w-4" />
    ) : (
      <Minus className="h-4 w-4" />
    );

  return (
    <>
      <Card className={`glass-card ${highlight ? 'ring-1 ring-primary/50' : ''}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">
              Evolução do Peso
            </p>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </div>

          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !current ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Comece a acompanhar sua evolução</p>
              <Button className="w-full" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Registrar primeiro peso
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-foreground leading-none">
                    {fmtKg(current.kg)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Peso atual • {fmtDate(current.date)}</p>
                </div>
                <div className="text-right">
                  {delta == null ? (
                    <p className="text-xs text-muted-foreground">Primeiro registro</p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1 justify-end">
                        {deltaIcon}
                        {delta > 0 ? '+' : delta < 0 ? '-' : ''}
                        {Math.abs(delta).toFixed(1).replace('.', ',')} kg
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Anterior: {fmtKg(previous!.kg)} • {fmtDate(previous!.date)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {chartData.length >= 2 && (
                <div className="h-20 -mx-1" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                      <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [fmtKg(Number(v)), 'Peso']}
                      />
                      <Line
                        type="monotone"
                        dataKey="peso"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: 'hsl(var(--primary))' }}
                        activeDot={{ r: 4 }}
                        isAnimationActive
                        animationDuration={600}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs ${highlight ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {checkin.message}
                </p>
                <Button
                  size="sm"
                  variant={highlight ? 'default' : 'secondary'}
                  onClick={() => setOpen(true)}
                >
                  {highlight ? 'Registrar agora' : 'Registrar peso'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar peso</DialogTitle>
            <DialogDescription>
              Para acompanhar melhor a evolução, tente registrar o peso em condições semelhantes às
              pesagens anteriores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="weight-kg">Peso atual (kg)</Label>
              <Input
                id="weight-kg"
                inputMode="decimal"
                placeholder="67,4"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight-date">Data</Label>
              <Input
                id="weight-date"
                type="date"
                max={todayIso()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight-obs">Observação (opcional)</Label>
              <Textarea
                id="weight-obs"
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar peso
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentWeightCard;
