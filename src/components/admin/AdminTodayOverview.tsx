import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { UserCheck, Wifi, Dumbbell } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type CardKey = 'online' | 'openedToday' | 'workoutToday';

interface Row { id: string; name: string; detail?: string }

const todayStr = () => new Date().toISOString().slice(0, 10);

const AdminTodayOverview: React.FC = () => {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [openedEvents, setOpenedEvents] = useState<{ student_id: string; created_at: string }[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<{ student_id: string; completed_at: string }[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [openCard, setOpenCard] = useState<CardKey | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      const safeIds = ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .in('user_id', safeIds);
      setStudents((profiles ?? []).map((p) => ({ id: p.user_id, name: p.nome || 'Sem nome' })));

      const startOfDay = `${todayStr()}T00:00:00.000Z`;
      const [openedRes, workoutRes] = await Promise.all([
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
          .in('student_id', safeIds)
          .order('completed_at', { ascending: false }),
      ]);
      setOpenedEvents(openedRes.data ?? []);
      setWorkoutSessions(workoutRes.data ?? []);

      // Realtime presence — students join 'students-online' from MinhaArea
      channel = supabase.channel('students-online', { config: { presence: { key: 'admin-watch' } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState() as Record<string, Array<{ user_id?: string }>>;
          const ids = new Set<string>();
          Object.values(state).forEach((arr) => arr.forEach((p) => p.user_id && ids.add(p.user_id)));
          setOnlineIds(ids);
        })
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Aluno';
  const fmt = (iso: string) => format(new Date(iso), 'HH:mm', { locale: ptBR });

  const openedSet = new Set(openedEvents.map((e) => e.student_id));
  const workoutSet = new Set(workoutSessions.map((w) => w.student_id));

  const cards = [
    { key: 'online' as CardKey, label: 'Online agora', value: onlineIds.size, icon: Wifi, color: 'text-emerald-500' },
    { key: 'openedToday' as CardKey, label: 'Acessaram hoje', value: openedSet.size, icon: UserCheck, color: 'text-primary' },
    { key: 'workoutToday' as CardKey, label: 'Treinaram hoje', value: workoutSet.size, icon: Dumbbell, color: 'text-amber-500' },
  ];

  const getRows = (key: CardKey): Row[] => {
    if (key === 'online') {
      return Array.from(onlineIds)
        .map((id) => ({ id, name: nameOf(id), detail: 'Online agora' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (key === 'openedToday') {
      const byStudent = new Map<string, string[]>();
      for (const e of openedEvents) {
        if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
        byStudent.get(e.student_id)!.push(e.created_at);
      }
      return Array.from(byStudent.entries())
        .map(([id, times]) => {
          const sorted = times.sort();
          const detail = sorted.length === 1
            ? `às ${fmt(sorted[0])}`
            : `${sorted.length}× · ${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`;
          return { id, name: nameOf(id), detail };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    // workoutToday
    const byStudent = new Map<string, string>();
    for (const w of workoutSessions) {
      if (!byStudent.has(w.student_id)) byStudent.set(w.student_id, w.completed_at);
    }
    return Array.from(byStudent.entries())
      .map(([id, t]) => ({ id, name: nameOf(id), detail: `Concluído às ${fmt(t)}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const currentCard = cards.find((c) => c.key === openCard);
  const rows = openCard ? getRows(openCard) : [];

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c) => (
          <Card
            key={c.key}
            className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => setOpenCard(c.key)}
          >
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`rounded-lg p-2 bg-secondary ${c.color} relative`}>
                <c.icon className="h-4 w-4" />
                {c.key === 'online' && c.value > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground leading-tight uppercase truncate">{c.label}</p>
                <p className="text-xl font-bold leading-tight">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!openCard} onOpenChange={(o) => !o && setOpenCard(null)}>
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

export default AdminTodayOverview;