import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import {
  ADHERENCE_BADGE_CLASS,
  ADHERENCE_SHORT_LABEL,
  type AdherenceReport,
  type AdherenceStatus,
} from '@/lib/weeklyAdherence';

interface Props {
  report: AdherenceReport | null;
  loading?: boolean;
  compact?: boolean;
}

const ICONS: Record<AdherenceStatus, React.ReactNode> = {
  apto_avancar: <CheckCircle2 className="h-4 w-4" />,
  manter_semana: <AlertTriangle className="h-4 w-4" />,
  repetir_semana: <RefreshCw className="h-4 w-4" />,
  dados_insuficientes: <Info className="h-4 w-4" />,
  sugerir_reanalise: <Activity className="h-4 w-4" />,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

const WeeklyAdherenceBanner: React.FC<Props> = ({ report, loading, compact }) => {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <Card className="glass-card p-3 animate-pulse">
        <div className="h-3 w-32 bg-muted rounded mb-2" />
        <div className="h-2 w-48 bg-muted rounded" />
      </Card>
    );
  }
  if (!report) return null;

  const badge = ADHERENCE_BADGE_CLASS[report.status];

  return (
    <>
      <Card className={`glass-card p-3 border ${badge}`}>
        <div className="flex items-start gap-2.5">
          <div className={`shrink-0 mt-0.5 ${badge.split(' ').find(c => c.startsWith('text-')) || ''}`}>
            {ICONS[report.status]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider">
                {ADHERENCE_SHORT_LABEL[report.status]}
              </p>
              {!compact && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setOpen(true)}
                >
                  Ver detalhes
                </Button>
              )}
            </div>
            <p className="text-xs mt-1 text-foreground/90">{report.reasonLabel}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{report.detailLabel}</p>
          </div>
        </div>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Aderência da semana anterior</SheetTitle>
            <SheetDescription>
              A progressão semanal depende da execução real, não apenas do calendário.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className={`p-3 rounded-lg border ${badge}`}>
              <p className="text-sm font-semibold">{report.reasonLabel}</p>
              <p className="text-xs mt-1 text-foreground/80">{report.detailLabel}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="Sessões"
                value={`${report.sessionsExecuted}/${report.sessionsPlanned || '?'}`}
                sub={pct(report.sessionsPct)}
              />
              <Stat
                label="Exercícios"
                value={`${report.exercisesLogged}/${report.exercisesPlanned || '?'}`}
                sub={pct(report.exercisesPct)}
              />
              <Stat
                label="Séries c/ carga+reps"
                value={`${report.setsWithLoad}/${report.setsTotal}`}
                sub={pct(report.setsPct)}
              />
            </div>

            <div className="text-[11px] text-muted-foreground space-y-1 pt-2 border-t border-border">
              <p><span className="font-semibold text-foreground">Apto para avançar:</span> ≥75% sessões + ≥70% exercícios + ≥70% séries registradas.</p>
              <p><span className="font-semibold text-foreground">Manter semana:</span> execução parcial (50–74%).</p>
              <p><span className="font-semibold text-foreground">Repetir semana:</span> pouca execução (25–49%).</p>
              <p><span className="font-semibold text-foreground">Dados insuficientes:</span> &lt;25% ou nenhum registro.</p>
              <p><span className="font-semibold text-foreground">Sugerir reanálise:</span> treinou mas registrou muito pouco — coach deve revisar.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

const Stat: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-border bg-card/60 p-2 text-center">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-base font-bold mt-0.5">{value}</p>
    <p className="text-[10px] text-muted-foreground">{sub}</p>
  </div>
);

export default WeeklyAdherenceBanner;