import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dumbbell, Droplet, UtensilsCrossed, CheckCircle2, Radio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ActivityKind = 'workout_start' | 'workout_end' | 'water' | 'meal' | 'workout_done';

interface FeedItem {
  key: string;
  studentId: string;
  studentName: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  at: string; // ISO
}

const KIND_META: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  workout_start: { icon: Dumbbell, color: 'text-primary', bg: 'bg-primary/10' },
  workout_end: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  workout_done: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  water: { icon: Droplet, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  meal: { icon: UtensilsCrossed, color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

const MAX_ITEMS = 40;

const LiveActivityFeed: React.FC = () => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const nameRef = useRef(names);
  nameRef.current = names;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);

  const resolveName = async (studentId: string): Promise<string> => {
    if (nameRef.current.has(studentId)) return nameRef.current.get(studentId)!;
    const { data } = await supabase
      .from('profiles')
      .select('nome')
      .eq('user_id', studentId)
      .maybeSingle();
    const nm = (data?.nome as string) || 'Aluno';
    setNames((prev) => {
      const next = new Map(prev);
      next.set(studentId, nm);
      return next;
    });
    return nm;
  };

  const push = (it: FeedItem) => {
    setItems((prev) => {
      if (prev.some((p) => p.key === it.key)) return prev;
      return [it, ...prev].slice(0, MAX_ITEMS);
    });
  };

  // Initial load — last 24h
  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data: sessions }, { data: tracking }] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id, student_id, status, started_at, completed_at, day_name')
          .or(`started_at.gte.${since},completed_at.gte.${since}`)
          .order('started_at', { ascending: false })
          .limit(30),
        supabase
          .from('daily_tracking')
          .select('id, student_id, date, water_glasses, meals_completed, workout_completed, updated_at')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(30),
      ]);

      const ids = new Set<string>();
      (sessions ?? []).forEach((s) => ids.add(s.student_id));
      (tracking ?? []).forEach((t) => ids.add(t.student_id));
      if (ids.size) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, nome')
          .in('user_id', Array.from(ids));
        const map = new Map<string, string>();
        (profs ?? []).forEach((p) => map.set(p.user_id, p.nome || 'Aluno'));
        setNames(map);
      }

      const initial: FeedItem[] = [];
      const nm = (_id: string) => '';
      (sessions ?? []).forEach((s) => {
        if (s.started_at) {
          initial.push({
            key: `ws-start-${s.id}`,
            studentId: s.student_id,
            studentName: nm(s.student_id) || 'Aluno',
            kind: s.status === 'in_progress' ? 'workout_start' : 'workout_start',
            label: 'iniciou treino',
            detail: s.day_name || undefined,
            at: s.started_at,
          });
        }
        if (s.completed_at && s.status === 'completed') {
          initial.push({
            key: `ws-end-${s.id}`,
            studentId: s.student_id,
            studentName: nm(s.student_id) || 'Aluno',
            kind: 'workout_end',
            label: 'finalizou treino',
            detail: s.day_name || undefined,
            at: s.completed_at,
          });
        }
      });
      (tracking ?? []).forEach((t) => {
        if ((t.water_glasses ?? 0) > 0) {
          initial.push({
            key: `dt-water-${t.id}-${t.water_glasses}`,
            studentId: t.student_id,
            studentName: 'Aluno',
            kind: 'water',
            label: 'registrou água',
            detail: `${t.water_glasses} copo${t.water_glasses > 1 ? 's' : ''}`,
            at: t.updated_at,
          });
        }
        const meals = Array.isArray(t.meals_completed) ? t.meals_completed : [];
        if (meals.length > 0) {
          initial.push({
            key: `dt-meal-${t.id}-${meals.length}`,
            studentId: t.student_id,
            studentName: 'Aluno',
            kind: 'meal',
            label: 'registrou refeição',
            detail: `${meals.length} de hoje`,
            at: t.updated_at,
          });
        }
        if (t.workout_completed) {
          initial.push({
            key: `dt-wdone-${t.id}`,
            studentId: t.student_id,
            studentName: 'Aluno',
            kind: 'workout_done',
            label: 'marcou treino concluído',
            at: t.updated_at,
          });
        }
      });
      initial.sort((a, b) => (a.at < b.at ? 1 : -1));
      setItems(initial.slice(0, MAX_ITEMS));
    })();
  }, []);

  // Fill in names once loaded
  useEffect(() => {
    if (names.size === 0) return;
    setItems((prev) =>
      prev.map((it) => ({ ...it, studentName: names.get(it.studentId) || it.studentName })),
    );
  }, [names]);

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel('live-activity-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workout_sessions' },
        async (payload) => {
          const row = (payload.new || payload.old) as any;
          if (!row?.student_id) return;
          const nm = await resolveName(row.student_id);
          const oldRow = (payload.old || {}) as any;
          const now = new Date().toISOString();
          if (payload.eventType === 'INSERT' || (oldRow.started_at == null && row.started_at)) {
            if (row.started_at) {
              push({
                key: `ws-start-${row.id}`,
                studentId: row.student_id,
                studentName: nm,
                kind: 'workout_start',
                label: 'iniciou treino',
                detail: row.day_name || undefined,
                at: row.started_at || now,
              });
            }
          }
          if (row.status === 'completed' && oldRow.status !== 'completed' && row.completed_at) {
            push({
              key: `ws-end-${row.id}`,
              studentId: row.student_id,
              studentName: nm,
              kind: 'workout_end',
              label: 'finalizou treino',
              detail: row.day_name || undefined,
              at: row.completed_at || now,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_tracking' },
        async (payload) => {
          const row = (payload.new || {}) as any;
          const oldRow = (payload.old || {}) as any;
          if (!row?.student_id) return;
          const nm = await resolveName(row.student_id);
          const at = row.updated_at || new Date().toISOString();

          const newWater = row.water_glasses ?? 0;
          const oldWater = oldRow.water_glasses ?? 0;
          if (newWater > oldWater) {
            push({
              key: `dt-water-${row.id}-${newWater}-${at}`,
              studentId: row.student_id,
              studentName: nm,
              kind: 'water',
              label: 'registrou água',
              detail: `${newWater} copo${newWater > 1 ? 's' : ''}`,
              at,
            });
          }
          const newMeals = Array.isArray(row.meals_completed) ? row.meals_completed.length : 0;
          const oldMeals = Array.isArray(oldRow.meals_completed) ? oldRow.meals_completed.length : 0;
          if (newMeals > oldMeals) {
            push({
              key: `dt-meal-${row.id}-${newMeals}-${at}`,
              studentId: row.student_id,
              studentName: nm,
              kind: 'meal',
              label: 'registrou refeição',
              detail: `${newMeals} de hoje`,
              at,
            });
          }
          if (row.workout_completed && !oldRow.workout_completed) {
            push({
              key: `dt-wdone-${row.id}-${at}`,
              studentId: row.student_id,
              studentName: nm,
              kind: 'workout_done',
              label: 'marcou treino concluído',
              at,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (!pausedRef.current && el.scrollHeight > el.clientHeight) {
        el.scrollTop += 0.4;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          el.scrollTop = 0;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const visible = useMemo(() => items, [items]);

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-primary" />
          Atividade em tempo real
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma atividade recente. Assim que um aluno iniciar treino ou registrar água/refeição, aparecerá aqui automaticamente.
          </p>
        ) : (
          <div
            ref={scrollRef}
            onMouseEnter={() => (pausedRef.current = true)}
            onMouseLeave={() => (pausedRef.current = false)}
            className="max-h-64 overflow-hidden space-y-2 pr-1"
          >
            {visible.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              return (
                <div
                  key={it.key}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-secondary/30 px-3 py-2 animate-fade-in"
                >
                  <div className={`rounded-lg p-2 ${meta.bg} ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-semibold">{it.studentName}</span>{' '}
                      <span className="text-muted-foreground">{it.label}</span>
                      {it.detail ? <span className="text-muted-foreground"> · {it.detail}</span> : null}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNowStrict(new Date(it.at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;