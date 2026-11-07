import React, { useEffect, useState } from 'react';
import { buildLoadHistorySessions, formatHistoryKg, historySetDisplay } from '@/lib/setHistoryDisplay';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';

const normalizeExName = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();
import { ptBR } from 'date-fns/locale';
import type { SubRecord } from '@/lib/workoutExecutionMethods';

interface SetLog {
  id: string;
  performed_at: string;
  session_id: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  phase: string | null;
  set_type?: string | null;
  sub_records?: SubRecord[] | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  exerciseName: string;
}

interface SessionGroup {
  sessionId: string;
  date: string;
  phase: string | null;
  sets: SetLog[];
  topWeight: number;
  totalVolume: number;
  hasWork: boolean;
}

export const ExerciseLoadHistorySheet: React.FC<Props> = ({ open, onOpenChange, studentId, exerciseName }) => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SessionGroup[]>([]);

  useEffect(() => {
    if (!open || !studentId || !exerciseName) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('exercise_set_logs')
        .select('id, performed_at, session_id, set_number, reps, weight_kg, rpe, phase, sub_records, set_type')
        .eq('student_id', studentId)
        .ilike('exercise_name', normalizeExName(exerciseName))
        .order('performed_at', { ascending: false })
        .limit(200);

      // Exibição: TODAS as séries da sessão, com o tipo. Top/volume/recordes
      // seguem só das séries de trabalho (nulo = legado = trabalho).
      const arr: SessionGroup[] = buildLoadHistorySessions((data || []) as unknown as SetLog[]).map((g) => ({
        ...g,
        phase: g.sets[0]?.phase ?? null,
      }));
      setGroups(arr);
      setLoading(false);
    })();
  }, [open, studentId, exerciseName]);

  const renderTrend = (curr: number, prev: number | undefined) => {
    if (prev === undefined || prev === 0) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    if (curr > prev) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
    if (curr < prev) return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            Cargas — {exerciseName}
          </SheetTitle>
          <SheetDescription>Histórico de progresso deste exercício</SheetDescription>
        </SheetHeader>

        {(() => {
          const workGroups = groups.filter((g) => g.hasWork);
          if (loading || workGroups.length === 0) return null;
          const lastTop = workGroups[0]?.topWeight ?? 0;
          const bestTop = workGroups.reduce((m, g) => Math.max(m, g.topWeight), 0);
          const recent = workGroups.slice(0, 5);
          const avgTop = recent.length
            ? recent.reduce((s, g) => s + g.topWeight, 0) / recent.length
            : 0;
          return (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-secondary/40 border border-border/40 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Última</p>
                <p className="text-base font-bold text-foreground tabular-nums">{lastTop ? `${lastTop}kg` : '—'}</p>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Melhor</p>
                <p className="text-base font-bold text-foreground tabular-nums">{bestTop ? `${bestTop}kg` : '—'}</p>
              </div>
              <div className="rounded-lg bg-secondary/40 border border-border/40 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Média 5</p>
                <p className="text-base font-bold text-foreground tabular-nums">{avgTop ? `${avgTop.toFixed(1)}kg` : '—'}</p>
              </div>
            </div>
          );
        })()}

        <div className="mt-4 space-y-3">
          {loading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}
          {!loading && groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro anterior encontrado.</p>
          )}
          {!loading && groups.map((g, idx) => {
            // Tendência compara com a sessão anterior que teve séries de trabalho.
            const prev = groups.slice(idx + 1).find((p) => p.hasWork);
            return (
              <div key={g.sessionId} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {format(new Date(g.date), "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </p>
                    {g.phase && <p className="text-[10px] uppercase tracking-wider text-primary">{g.phase}</p>}
                  </div>
                  {g.hasWork && <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      {renderTrend(g.topWeight, prev?.topWeight)}
                      <span className="font-bold text-foreground">{g.topWeight}kg</span>
                      <span className="text-muted-foreground text-[10px]">top</span>
                    </div>
                    <div className="text-muted-foreground">
                      Vol: <span className="font-semibold text-foreground">{Math.round(g.totalVolume)}kg</span>
                    </div>
                  </div>}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_48px_64px_40px] gap-1 text-[10px] uppercase text-muted-foreground font-semibold px-1">
                  <span>Série</span><span className="text-center">Reps</span><span className="text-center">Carga</span><span className="text-center">RPE</span>
                </div>
                <div className="space-y-1 mt-1">
                  {g.sets.map((s) => {
                    const tipo = historySetDisplay(s.set_type);
                    return (
                    <div key={s.id} data-set-type={tipo.type}>
                    <div className="grid grid-cols-[minmax(0,1fr)_48px_64px_40px] gap-1 items-center bg-background/50 rounded px-1 py-1.5 text-xs tabular-nums">
                      <span className="min-w-0 truncate">
                        <span className="font-bold">{s.set_number}</span>
                        <span className={`ml-1.5 font-semibold ${tipo.textClass}`}>{tipo.label}</span>
                      </span>
                      <span className="text-center">{s.reps ?? '—'}</span>
                      <span className="text-center font-semibold">{formatHistoryKg(s.weight_kg)}</span>
                      <span className="text-center text-muted-foreground">{s.rpe ?? '—'}</span>
                    </div>
                    {s.sub_records?.filter(part => part.completed).map((part, i) => <p key={i} className="pl-8 py-1 text-xs text-muted-foreground">{part.label} · {part.weight || '—'} kg × {part.reps || '—'}</p>)}
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
