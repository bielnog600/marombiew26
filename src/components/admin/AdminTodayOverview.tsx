import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { UserCheck, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Row {
  id: string;
  name: string;
  firstAccess?: string;
  lastAccess?: string;
  accessCount: number;
  online: boolean;
  workedOut: boolean;
  workoutTime?: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const AdminTodayOverview: React.FC = () => {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [openedEvents, setOpenedEvents] = useState<{ student_id: string; created_at: string }[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<{ student_id: string; completed_at: string }[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

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

  const buildRows = (): Row[] => {
    const byStudent = new Map<string, string[]>();
    for (const e of openedEvents) {
      if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
      byStudent.get(e.student_id)!.push(e.created_at);
    }
    const workoutByStudent = new Map<string, string>();
    for (const w of workoutSessions) {
      if (!workoutByStudent.has(w.student_id)) workoutByStudent.set(w.student_id, w.completed_at);
    }
    // Include online students even if no event recorded today
    const allIds = new Set<string>([...byStudent.keys(), ...onlineIds]);
    return Array.from(allIds)
      .map((id) => {
        const times = (byStudent.get(id) ?? []).sort();
        return {
          id,
          name: nameOf(id),
          firstAccess: times[0],
          lastAccess: times[times.length - 1],
          accessCount: times.length,
          online: onlineIds.has(id),
          workedOut: workoutByStudent.has(id),
          workoutTime: workoutByStudent.get(id),
        };
      })
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  };

  const rows = buildRows();
  const totalAccessed = rows.length;
  const onlineCount = rows.filter((r) => r.online).length;

  return (
    <>
      <Card
        className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="rounded-lg p-2.5 bg-secondary text-primary relative">
            <UserCheck className="h-5 w-5" />
            {onlineCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-background" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight uppercase truncate">
              Acessaram hoje
            </p>
            <p className="text-2xl font-bold leading-tight">{totalAccessed}</p>
          </div>
          {onlineCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {onlineCount} online
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Acessaram hoje ({rows.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum aluno nesta lista.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const accessLabel = r.firstAccess
                    ? r.accessCount > 1
                      ? `${fmt(r.firstAccess)} – ${fmt(r.lastAccess!)}`
                      : `às ${fmt(r.firstAccess)}`
                    : 'Online agora';
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40"
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          r.online ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'
                        }`}
                        title={r.online ? 'Online agora' : 'Offline'}
                      />
                      <p className="text-sm font-medium truncate flex-1">{r.name}</p>
                      {r.workedOut && (
                        <CheckCircle2
                          className="h-4 w-4 text-amber-500 shrink-0"
                          aria-label={r.workoutTime ? `Treinou às ${fmt(r.workoutTime)}` : 'Treinou hoje'}
                        />
                      )}
                      <p className="text-xs text-muted-foreground shrink-0 ml-1">{accessLabel}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminTodayOverview;