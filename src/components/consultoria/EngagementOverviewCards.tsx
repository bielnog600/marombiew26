import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Activity, UserCheck, Dumbbell, AlertOctagon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

type CardKey = 'openedToday' | 'workoutToday' | 'riskAbandon' | 'pendentes';

interface Stats {
  openedToday: number;
  workoutToday: number;
  riskAbandon: number;
  totalStudents: number;
}

interface StudentRow {
  id: string;
  name: string;
  detail?: string;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

interface Props {
  pendentes?: number;
  onPendentesClick?: () => void;
}

const EngagementOverviewCards: React.FC<Props> = ({ pendentes = 0, onPendentesClick }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [allStudents, setAllStudents] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<{
    openedEvents: { student_id: string; created_at: string }[];
    workoutSessions: { student_id: string; completed_at: string }[];
    recentOpenedIds: Set<string>;
  } | null>(null);
  const [openCard, setOpenCard] = useState<CardKey | null>(null);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      const total = ids.length;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .in('user_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
      setAllStudents((profiles ?? []).map((p) => ({ id: p.user_id, name: p.nome || 'Sem nome' })));

      const startOfDay = startOfTodayIso();
      const fiveDaysAgo = daysAgoIso(5);
      const safeIds = ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'];

      const [openedRes, workoutRes, eventsLastRes] = await Promise.all([
        supabase
          .from('student_events')
          .select('student_id, created_at')
          .eq('event_type', 'app_opened')
          .gte('created_at', startOfDay)
          .in('student_id', safeIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('workout_sessions')
          .select('student_id, completed_at')
          .gte('completed_at', startOfDay)
          .eq('status', 'completed')
          .in('student_id', safeIds)
          .order('completed_at', { ascending: false }),
        supabase
          .from('student_events')
          .select('student_id, created_at')
          .eq('event_type', 'app_opened')
          .gte('created_at', fiveDaysAgo)
          .in('student_id', safeIds),
      ]);

      const openedEvents = openedRes.data ?? [];
      const workoutSessions = workoutRes.data ?? [];
      const recentOpenedSet = new Set((eventsLastRes.data ?? []).map((e) => e.student_id));

      setStats({
        openedToday: new Set(openedEvents.map((e) => e.student_id)).size,
        workoutToday: new Set(workoutSessions.map((w) => w.student_id)).size,
        riskAbandon: ids.filter((id) => !recentOpenedSet.has(id)).length,
        totalStudents: total,
      });
      setData({ openedEvents, workoutSessions, recentOpenedIds: recentOpenedSet });
    })();
  }, []);

  const cards: { key: CardKey; label: string; value: number | undefined; icon: any; color: string }[] = [
    { key: 'openedToday', label: 'Acessaram hoje', value: stats?.openedToday, icon: UserCheck, color: 'text-emerald-500' },
    { key: 'workoutToday', label: 'Treinaram hoje', value: stats?.workoutToday, icon: Dumbbell, color: 'text-primary' },
    { key: 'riskAbandon', label: 'Em risco', value: stats?.riskAbandon, icon: AlertOctagon, color: 'text-destructive' },
    { key: 'pendentes', label: 'Pendentes', value: pendentes, icon: Activity, color: 'text-orange-500' },
  ];

  const nameOf = (id: string) => allStudents.find((s) => s.id === id)?.name ?? 'Aluno';
  const fmt = (iso: string) => format(new Date(iso), 'HH:mm', { locale: ptBR });

  const getRows = (key: CardKey): StudentRow[] => {
    if (!data) return [];
    if (key === 'openedToday') {
      const byStudent = new Map<string, string[]>();
      for (const e of data.openedEvents) {
        if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
        byStudent.get(e.student_id)!.push(e.created_at);
      }
      return Array.from(byStudent.entries()).map(([id, times]) => {
        const sorted = times.sort();
        const detail = sorted.length === 1
          ? `às ${fmt(sorted[0])}`
          : `${sorted.length} acessos · ${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`;
        return { id, name: nameOf(id), detail };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (key === 'workoutToday') {
      const byStudent = new Map<string, string>();
      for (const w of data.workoutSessions) {
        if (!byStudent.has(w.student_id)) byStudent.set(w.student_id, w.completed_at);
      }
      return Array.from(byStudent.entries())
        .map(([id, t]) => ({ id, name: nameOf(id), detail: `Concluído às ${fmt(t)}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (key === 'riskAbandon') {
      return allStudents
        .filter((s) => !data.recentOpenedIds.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, detail: 'Sem acesso há 5+ dias' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  };

  const currentCard = cards.find((c) => c.key === openCard);
  const rows = openCard ? getRows(openCard) : [];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((c) => (
          <Card
            key={c.label}
            className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => {
              if (c.key === 'pendentes') { onPendentesClick?.(); return; }
              if (stats) setOpenCard(c.key);
            }}
          >
            <CardContent className="p-2.5 flex items-center gap-2">
              <div className={`rounded-lg p-1.5 bg-secondary ${c.color}`}>
                <c.icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground leading-tight uppercase truncate">{c.label}</p>
                <p className="text-lg font-bold leading-tight">{c.value ?? '…'}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!openCard && openCard !== 'pendentes'} onOpenChange={(o) => !o && setOpenCard(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentCard && <currentCard.icon className={`h-5 w-5 ${currentCard.color}`} />}
              {currentCard?.label} ({rows.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum aluno nesta lista.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={`${r.id}-${r.detail}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40"
                  >
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground shrink-0 ml-2">{r.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EngagementOverviewCards;
