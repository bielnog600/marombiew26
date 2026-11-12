import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatMoney, periodRange, summarizeAiUsage, usdToEur, type AiUsageRow } from '@/lib/aiCosts';
import { loadEurRate, loadUsageSince } from '@/components/admin/aiCosts/aiCostsApi';

/** Ficha do aluno: gasto de IA dele no mês (o que ele usou + o que foi gerado para ele). */
export default function StudentAiCostCard({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);
  const [rate, setRate] = useState(0);
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const range = useMemo(() => periodRange('mes', now), [now]);

  useEffect(() => {
    let cancelled = false;
    loadUsageSince(range.from, studentId).then((r) => { if (!cancelled) setRows(r); }).catch(() => { if (!cancelled) setRows([]); });
    loadEurRate().then(setRate);
    return () => { cancelled = true; };
  }, [studentId, range.from]);

  const summary = useMemo(() => (rows ? summarizeAiUsage(rows, range) : null), [rows, range]);
  const own = useMemo(() => (rows ?? []).filter((r) => r.student_id === studentId), [rows, studentId]);
  const ownUsd = own.reduce((a, r) => a + (Number(r.cost_usd) || 0), 0);
  const month = now.toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <Card className="glass-card" data-testid="student-ai-cost-card">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /><p className="font-semibold">Gasto de IA em {month}</p></div>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => navigate(`/custos-ia?aluno=${studentId}`)}>Ver detalhes</Button>
        </div>
        {!summary ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(summary.totalUsd, 'USD')} <span className="text-sm font-normal text-muted-foreground">{formatMoney(usdToEur(summary.totalUsd, rate), 'EUR')}</span></p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Uso do aluno {formatMoney(ownUsd, 'USD')} · gerado para ele {formatMoney(Math.max(0, summary.totalUsd - ownUsd), 'USD')} · {summary.uses} usos
            </p>
            {summary.byFeature.slice(0, 4).map((f) => (
              <div key={f.feature} className="flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground truncate">{f.label} ({f.uses})</span>
                <span className="tabular-nums shrink-0">{formatMoney(f.costUsd, 'USD')}</span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
