import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Wallet } from 'lucide-react';
import {
  formatMoney, effectivePaymentStatus, isDueSoon, daysUntilDue, packageIsEnding,
} from '@/lib/financial';

type Row = {
  id: string;
  studentName: string;
  label: string;
  detail: string;
  tone: 'overdue' | 'due-soon' | 'package';
};

const TONE_CLASS: Record<Row['tone'], string> = {
  overdue: 'bg-red-500/20 text-red-300 border-red-500/30',
  'due-soon': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  package: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const FinancialAttentionCard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const today = new Date();
        const [{ data: payments }, { data: packages }] = await Promise.all([
          supabase.from('payments').select('id, student_id, amount, currency, status, due_date'),
          supabase.from('class_packages').select('id, student_id, package_name, status, remaining_classes'),
        ]);

        const ids = [
          ...new Set([...(payments || []).map(p => p.student_id), ...(packages || []).map(p => p.student_id)]),
        ];
        const nameMap: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('user_id, nome').in('user_id', ids);
          profiles?.forEach(p => { nameMap[p.user_id] = p.nome; });
        }

        const out: Row[] = [];
        for (const p of payments || []) {
          const status = effectivePaymentStatus(p as any, today);
          if (status === 'vencido') {
            const d = daysUntilDue(p.due_date, today);
            out.push({
              id: `pay-${p.id}`,
              studentName: nameMap[p.student_id] || 'Aluno',
              label: 'Vencido',
              detail: `${formatMoney(p.amount, p.currency)}${d !== null ? ` — ${Math.abs(d)} dia(s) em atraso` : ''}`,
              tone: 'overdue',
            });
          } else if (status === 'pendente' && isDueSoon(p.due_date, today)) {
            const d = daysUntilDue(p.due_date, today);
            out.push({
              id: `pay-${p.id}`,
              studentName: nameMap[p.student_id] || 'Aluno',
              label: 'Vence em breve',
              detail: `${formatMoney(p.amount, p.currency)} — em ${d} dia(s)`,
              tone: 'due-soon',
            });
          }
        }
        for (const pkg of packages || []) {
          if (packageIsEnding(pkg as any)) {
            out.push({
              id: `pkg-${pkg.id}`,
              studentName: nameMap[pkg.student_id] || 'Aluno',
              label: 'Pacote a acabar',
              detail: `${pkg.remaining_classes} aula(s) restantes — ${pkg.package_name}`,
              tone: 'package',
            });
          }
        }

        const order: Record<Row['tone'], number> = { overdue: 0, 'due-soon': 1, package: 2 };
        out.sort((a, b) => order[a.tone] - order[b.tone]);
        if (active) setRows(out);
      } catch (err) {
        console.error('[FinancialAttentionCard]', err);
        if (active) setRows(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-5 w-5 text-primary" />
          Atenção financeira
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => navigate('/financeiro')}>Abrir</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : rows === null ? (
          <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada a cobrar e nenhum pacote a acabar.</p>
        ) : (
          rows.slice(0, 8).map(r => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border border-border/40 bg-secondary/30 p-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{r.studentName}</p>
                  <Badge variant="outline" className={`text-[10px] ${TONE_CLASS[r.tone]}`}>{r.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default FinancialAttentionCard;
