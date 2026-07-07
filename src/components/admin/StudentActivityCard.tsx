import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Flame, MoonStar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StudentActivity {
  id: string;
  name: string;
  accesses: number;
  lastAccess?: string;
  daysSinceLast: number;
}

const DAYS_WINDOW = 30;

const StudentActivityCard: React.FC = () => {
  const [data, setData] = useState<StudentActivity[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'aluno');
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .in('user_id', ids);
      const nameById = new Map<string, string>(
        (profiles ?? []).map((p) => [p.user_id, p.nome || 'Sem nome']),
      );

      const since = new Date();
      since.setDate(since.getDate() - DAYS_WINDOW);

      const { data: events } = await supabase
        .from('student_events')
        .select('student_id, created_at')
        .eq('event_type', 'app_opened')
        .gte('created_at', since.toISOString())
        .in('student_id', ids)
        .order('created_at', { ascending: false });

      const stats = new Map<string, { count: number; last: string }>();
      for (const e of events ?? []) {
        const cur = stats.get(e.student_id);
        if (!cur) stats.set(e.student_id, { count: 1, last: e.created_at });
        else cur.count += 1;
      }

      const now = Date.now();
      const list: StudentActivity[] = ids.map((id) => {
        const s = stats.get(id);
        const last = s?.last;
        const daysSinceLast = last
          ? Math.floor((now - new Date(last).getTime()) / 86400000)
          : 999;
        return {
          id,
          name: nameById.get(id) || 'Sem nome',
          accesses: s?.count ?? 0,
          lastAccess: last,
          daysSinceLast,
        };
      });

      setData(list);
    })();
  }, []);

  const topActive = [...data]
    .filter((s) => s.accesses > 0)
    .sort((a, b) => b.accesses - a.accesses)
    .slice(0, 5);

  const inactive = [...data]
    .filter((s) => s.daysSinceLast >= 3)
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast)
    .slice(0, 5);

  const lastLabel = (iso?: string) =>
    iso
      ? formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true })
      : 'Nunca acessou';

  return (
    <>
      <Card
        className="glass-card cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(true)}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-primary" />
            Atividade dos alunos
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              últimos {DAYS_WINDOW}d
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
              <Flame className="h-3 w-3 text-amber-500" /> Mais ativos
            </p>
            {topActive.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem acessos recentes.</p>
            ) : (
              <div className="space-y-1">
                {topActive.slice(0, 3).map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="text-xs w-4 text-muted-foreground">{i + 1}º</span>
                    <span className="truncate flex-1">{s.name}</span>
                    <span className="text-xs font-semibold text-amber-500 shrink-0">
                      {s.accesses}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border/60 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-1.5">
              <MoonStar className="h-3 w-3 text-red-400" /> Sumidos há dias
            </p>
            {inactive.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todos acessaram há pouco.</p>
            ) : (
              <div className="space-y-1">
                {inactive.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="truncate flex-1">{s.name}</span>
                    <span className="text-xs font-medium text-red-400 shrink-0">
                      {s.daysSinceLast >= 999 ? 'nunca' : `${s.daysSinceLast}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Atividade dos alunos ({DAYS_WINDOW}d)
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5 text-amber-500" /> Mais ativos
                </p>
                <div className="space-y-1.5">
                  {topActive.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40"
                    >
                      <span className="text-xs w-5 text-muted-foreground">{i + 1}º</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {lastLabel(s.lastAccess)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-amber-500">
                        {s.accesses}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <MoonStar className="h-3.5 w-3.5 text-red-400" /> Sumidos há dias
                </p>
                <div className="space-y-1.5">
                  {inactive.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {lastLabel(s.lastAccess)}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-red-400">
                        {s.daysSinceLast >= 999 ? 'nunca' : `${s.daysSinceLast}d`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentActivityCard;