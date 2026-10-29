import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { UserCheck, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildAccessRows } from '@/lib/studentOnlineStatus';

/** Início do dia local (o admin vê "hoje" no fuso dele). */
const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const AdminTodayOverview: React.FC = () => {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [activity, setActivity] = useState<{ student_id: string; at: string }[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<{ student_id: string; completed_at: string }[]>([]);
  const [presence, setPresence] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Reavalia "online" a cada 30 s (a janela de 5 min expira sozinha).
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let presenceCh: ReturnType<typeof supabase.channel> | null = null;
    let dataCh: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      const idSet = new Set(ids);
      const safeIds = ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'];

      const { data: profiles } = await supabase.from('profiles').select('user_id, nome').in('user_id', safeIds);
      if (cancelled) return;
      setStudents((profiles ?? []).map((p) => ({ id: p.user_id, name: p.nome || 'Sem nome' })));

      const startOfDay = startOfTodayIso();
      const [openedRes, workoutRes, activeRes] = await Promise.all([
        supabase.from('student_events').select('student_id, created_at')
          .eq('event_type', 'app_opened').gte('created_at', startOfDay).in('student_id', safeIds),
        supabase.from('workout_sessions').select('student_id, completed_at')
          .eq('status', 'completed').gte('completed_at', startOfDay).in('student_id', safeIds)
          .order('completed_at', { ascending: false }),
        // Atividade real durante o treino (last_active_at é renovado pelo player).
        supabase.from('workout_sessions').select('student_id, last_active_at')
          .gte('last_active_at', startOfDay).in('student_id', safeIds),
      ]);
      if (cancelled) return;
      setActivity([
        ...(openedRes.data ?? []).map((e) => ({ student_id: e.student_id, at: e.created_at })),
        ...(activeRes.data ?? []).filter((s) => s.last_active_at).map((s) => ({ student_id: s.student_id, at: s.last_active_at as string })),
      ]);
      setWorkoutSessions((workoutRes.data ?? []) as any);

      // Presença em tempo real — alunos entram em 'students-online' com o app aberto.
      presenceCh = supabase.channel('students-online', { config: { presence: { key: 'admin-watch' } } });
      presenceCh
        .on('presence', { event: 'sync' }, () => {
          const state = presenceCh!.presenceState() as Record<string, Array<{ user_id?: string; online_at?: string }>>;
          const map = new Map<string, string>();
          Object.values(state).forEach((arr) => arr.forEach((p) => {
            if (p.user_id) map.set(p.user_id, p.online_at || new Date().toISOString());
          }));
          setPresence(map);
        })
        .subscribe();

      // Novos acessos e atividade de treino ao vivo.
      dataCh = supabase
        .channel(`admin-today-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'student_events' }, (payload) => {
          const row = payload.new as any;
          if (row?.event_type !== 'app_opened' || !idSet.has(row.student_id)) return;
          setActivity((prev) => [...prev, { student_id: row.student_id, at: row.created_at }]);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_sessions' }, (payload) => {
          const row = payload.new as any;
          if (!row?.student_id || !idSet.has(row.student_id)) return;
          if (row.last_active_at) setActivity((prev) => [...prev, { student_id: row.student_id, at: row.last_active_at }]);
          if (row.status === 'completed' && row.completed_at) {
            setWorkoutSessions((prev) => [{ student_id: row.student_id, completed_at: row.completed_at }, ...prev]);
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (presenceCh) supabase.removeChannel(presenceCh);
      if (dataCh) supabase.removeChannel(dataCh);
    };
  }, []);

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? 'Aluno';
  const fmt = (iso: string) => format(new Date(iso), 'HH:mm', { locale: ptBR });
  const ago = (iso: string) => {
    if (now - new Date(iso).getTime() < 60000) return 'agora';
    return `há ${formatDistanceToNowStrict(new Date(iso), { locale: ptBR })}`;
  };

  const workoutByStudent = new Map<string, string>();
  for (const w of workoutSessions) if (!workoutByStudent.has(w.student_id)) workoutByStudent.set(w.student_id, w.completed_at);

  const byStudent = new Map<string, string[]>();
  for (const a of activity) {
    if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
    byStudent.get(a.student_id)!.push(a.at);
  }
  const startOfDay = startOfTodayIso();
  presence.forEach((at, id) => {
    if (!byStudent.has(id)) byStudent.set(id, []);
    byStudent.get(id)!.push(at < startOfDay ? new Date(now).toISOString() : at);
  });

  const rows = buildAccessRows(
    Array.from(byStudent.entries()).map(([id, times]) => ({ id, name: nameOf(id), activity: times, present: presence.has(id) })),
    now,
  );
  const onlineCount = rows.filter((r) => r.online).length;

  return (
    <>
      <Card className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setOpen(true)}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="rounded-lg p-2.5 bg-secondary text-primary relative">
            <UserCheck className="h-5 w-5" />
            {onlineCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse ring-2 ring-background" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight uppercase truncate">Acessaram hoje</p>
            <p className="text-2xl font-bold leading-tight">{rows.length}</p>
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
              {onlineCount > 0 && <span className="text-xs font-medium text-emerald-500">· {onlineCount} online agora</span>}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum aluno nesta lista.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const workoutTime = workoutByStudent.get(r.id);
                  return (
                    <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.online ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`}
                        title={r.online ? 'Online agora' : 'Offline'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        {r.firstAccess && r.accessCount > 1 && (
                          <p className="text-[10px] text-muted-foreground">Primeiro acesso às {fmt(r.firstAccess)}</p>
                        )}
                      </div>
                      {workoutTime && (
                        <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" aria-label={`Treinou às ${fmt(workoutTime)}`} />
                      )}
                      <p className={`text-xs shrink-0 ml-1 ${r.online ? 'text-emerald-500 font-medium' : 'text-muted-foreground'}`}>
                        {r.online ? 'Online agora' : r.lastAccess ? ago(r.lastAccess) : '—'}
                      </p>
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
