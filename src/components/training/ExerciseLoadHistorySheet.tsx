import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SetLog {
  id: string;
  performed_at: string;
  session_id: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  phase: string | null;
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
        .select('id, performed_at, session_id, set_number, reps, weight_kg, rpe, phase')
        .eq('student_id', studentId)
        .ilike('exercise_name', exerciseName)
        .order('performed_at', { ascending: false })
        .limit(200);

      const map = new Map<string, SessionGroup>();
      (data || []).forEach((row) => {
        const key = row.session_id || row.performed_at;
        if (!map.has(key)) {
          map.set(key, {
            sessionId: key,
            date: row.performed_at,
            phase: row.phase,
            sets: [],
            topWeight: 0,
            totalVolume: 0,
          });
        }
        const g = map.get(key)!;
        g.sets.push(row as SetLog);
        const w = Number(row.weight_kg) || 0;
        const r = Number(row.reps) || 0;
        if (w > g.topWeight) g.topWeight = w;
        g.totalVolume += w * r;
      });

      const arr = Array.from(map.values()).sort((a, b) => +new Date(b.date) - +new Date(a.date));
      arr.forEach((g) => g.sets.sort((a, b) => a.set_number - b.set_number));
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

        <div className="mt-4 space-y-3">
          {loading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}
          {!loading && groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro anterior encontrado.</p>
          )}
          {!loading && groups.map((g, idx) => {
            const prev = groups[idx + 1];
            return (
              <div key={g.sessionId} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {format(new Date(g.date), "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </p>
                    {g.phase && <p className="text-[10px] uppercase tracking-wider text-primary">{g.phase}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      {renderTrend(g.topWeight, prev?.topWeight)}
                      <span className="font-bold text-foreground">{g.topWeight}kg</span>
                      <span className="text-muted-foreground text-[10px]">top</span>
                    </div>
                    <div className="text-muted-foreground">
                      Vol: <span className="font-semibold text-foreground">{Math.round(g.totalVolume)}kg</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[28px_1fr_1fr_44px] gap-1 text-[10px] uppercase text-muted-foreground font-semibold px-1">
                  <span>#</span><span className="text-center">Reps</span><span className="text-center">Carga</span><span className="text-center">RPE</span>
                </div>
                <div className="space-y-1 mt-1">
                  {g.sets.map((s) => (
                    <div key={s.id} className="grid grid-cols-[28px_1fr_1fr_44px] gap-1 items-center bg-background/50 rounded px-1 py-1.5 text-xs tabular-nums">
                      <span className="font-bold text-center">{s.set_number}</span>
                      <span className="text-center">{s.reps ?? '—'}</span>
                      <span className="text-center font-semibold">{s.weight_kg != null ? `${s.weight_kg}kg` : '—'}</span>
                      <span className="text-center text-muted-foreground">{s.rpe ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
};
