import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { loadStudentTabataSessions, type TabataSessionSummary } from '@/lib/tabataSessionApi';
import { clock, RPE_LABELS } from '@/lib/tabataPlayerView';

/** Últimos TABATAs feitos pelo aluno, com o RPE que ele mandou no fim (só leitura). */
const TabataSessionsCard: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [rows, setRows] = useState<TabataSessionSummary[] | null>(null);
  useEffect(() => {
    let off = false;
    loadStudentTabataSessions(studentId).then((r) => { if (!off) setRows(r); }, () => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [studentId]);
  if (!rows || rows.length === 0) return null;
  return (
    <Card className="glass-card" data-testid="tabata-sessions-card">
      <CardContent className="p-4 space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" /> TABATAs feitos
        </p>
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.tabata_name || 'TABATA'}</p>
              <p className="text-[11px] text-muted-foreground">
                {r.completed_at ? new Date(r.completed_at).toLocaleDateString('pt-BR') : ''} · {clock(r.duration_seconds)} · {r.completed_rounds}/{r.total_rounds} rodadas
                {r.kcal_estimate ? ` · ~${r.kcal_estimate} kcal` : ''}{r.status === 'abandoned' ? ' · encerrado antes' : ''}
              </p>
            </div>
            {r.rpe ? (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary" title={RPE_LABELS[r.rpe]}>
                RPE {r.rpe}
              </span>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default TabataSessionsCard;
