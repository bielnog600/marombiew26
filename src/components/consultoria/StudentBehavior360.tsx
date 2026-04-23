import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow, differenceInDays, startOfWeek, endOfWeek, subDays, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity, Calendar, Dumbbell, Utensils, GlassWater, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Clock, Flame, Send, History, CheckCircle2, XCircle, Sparkles
} from 'lucide-react';
import SendNotificationDialog from './SendNotificationDialog';
import { Button } from '@/components/ui/button';

interface Props {
  studentId: string;
  studentName?: string;
}

interface Data {
  events: { event_type: string; created_at: string; metadata: any }[];
  sessions: { id: string; status: string; completed_at: string; started_at: string | null; day_name: string | null; duration_minutes: number; total_volume_kg: number | null; avg_rpe: number | null; total_sets: number | null; exercises_completed: number; total_exercises: number }[];
  setLogs: { exercise_name: string; weight_kg: number | null; reps: number | null; performed_at: string; rpe: number | null }[];
  tracking: { date: string; water_glasses: number; meals_completed: any; workout_completed: boolean }[];
  alerts: { id: string; title: string; description: string | null; priority: string; status: string; created_at: string; category: string }[];
  adminNotifs: { id: string; title: string; created_at: string; viewed_at: string | null; priority: string; active: boolean }[];
}

const StatCard: React.FC<{ icon: any; label: string; value: React.ReactNode; sub?: string; color?: string }> = ({ icon: Icon, label, value, sub, color = 'text-primary' }) => (
  <Card className="glass-card">
    <CardContent className="p-3">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 bg-secondary ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-muted-foreground leading-tight truncate">{label}</p>
          <p className="text-base font-bold leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const Empty: React.FC<{ icon: any; text: string }> = ({ icon: Icon, text }) => (
  <div className="text-center py-8 text-muted-foreground">
    <Icon className="h-8 w-8 mx-auto mb-2 opacity-40" />
    <p className="text-sm">{text}</p>
  </div>
);

const StudentBehavior360: React.FC<Props> = ({ studentId, studentName }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = subDays(new Date(), 60).toISOString();
    const trackingSince = format(subDays(new Date(), 60), 'yyyy-MM-dd');

    const [evRes, sesRes, logsRes, trkRes, alertsRes, notifRes] = await Promise.all([
      supabase.from('student_events').select('event_type, created_at, metadata').eq('student_id', studentId).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      supabase.from('workout_sessions').select('id, status, completed_at, started_at, day_name, duration_minutes, total_volume_kg, avg_rpe, total_sets, exercises_completed, total_exercises').eq('student_id', studentId).order('completed_at', { ascending: false }).limit(50),
      supabase.from('exercise_set_logs').select('exercise_name, weight_kg, reps, performed_at, rpe').eq('student_id', studentId).gte('performed_at', since).order('performed_at', { ascending: false }).limit(500),
      supabase.from('daily_tracking').select('date, water_glasses, meals_completed, workout_completed').eq('student_id', studentId).gte('date', trackingSince).order('date', { ascending: false }),
      supabase.from('behavioral_alerts').select('id, title, description, priority, status, created_at, category').eq('student_id', studentId).order('created_at', { ascending: false }).limit(20),
      supabase.from('admin_notifications').select('id, title, created_at, viewed_at, priority, active').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10),
    ]);

    setData({
      events: evRes.data ?? [],
      sessions: sesRes.data ?? [],
      setLogs: logsRes.data ?? [],
      tracking: trkRes.data ?? [],
      alerts: alertsRes.data ?? [],
      adminNotifs: notifRes.data ?? [],
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [studentId]);

  // Realtime: refresh quando aluno marcar uma notificação
  useEffect(() => {
    const ch = supabase
      .channel(`behavior-${studentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications', filter: `student_id=eq.${studentId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [studentId]);

  const computed = useMemo(() => {
    if (!data) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    const last7 = subDays(new Date(), 7);
    const last14 = subDays(new Date(), 14);
    const last30 = subDays(new Date(), 30);

    // App usage
    const appOpens = data.events.filter(e => e.event_type === 'app_opened');
    const openedToday = appOpens.some(e => e.created_at.slice(0, 10) === today);
    const lastOpen = appOpens[0]?.created_at ?? null;
    const daysSinceOpen = lastOpen ? differenceInDays(new Date(), new Date(lastOpen)) : null;
    const opensLast7 = appOpens.filter(e => new Date(e.created_at) >= last7).length;
    const opensLast30 = appOpens.filter(e => new Date(e.created_at) >= last30).length;
    const uniqueOpenDaysLast30 = new Set(appOpens.filter(e => new Date(e.created_at) >= last30).map(e => e.created_at.slice(0, 10))).size;

    // Workouts
    const completed = data.sessions.filter(s => s.status === 'completed');
    const abandoned = data.sessions.filter(s => s.status === 'abandoned');
    const workoutToday = completed.some(s => s.completed_at.slice(0, 10) === today);
    const compLast7 = completed.filter(s => new Date(s.completed_at) >= last7);
    const compLast14 = completed.filter(s => new Date(s.completed_at) >= last14 && new Date(s.completed_at) < last7);
    const totalVolumeLast7 = compLast7.reduce((acc, s) => acc + (Number(s.total_volume_kg) || 0), 0);
    const totalVolumePrev = compLast14.reduce((acc, s) => acc + (Number(s.total_volume_kg) || 0), 0);
    const volumeTrend = totalVolumePrev > 0 ? ((totalVolumeLast7 - totalVolumePrev) / totalVolumePrev) * 100 : 0;
    const avgDuration = completed.length > 0 ? Math.round(completed.reduce((a, s) => a + s.duration_minutes, 0) / completed.length) : 0;
    const avgRpe = (() => {
      const withRpe = completed.filter(s => s.avg_rpe != null);
      return withRpe.length > 0 ? (withRpe.reduce((a, s) => a + Number(s.avg_rpe), 0) / withRpe.length).toFixed(1) : null;
    })();

    // Tracking
    const todayTrk = data.tracking.find(t => t.date === today);
    const trkLast7 = data.tracking.filter(t => new Date(t.date) >= last7);
    const mealsDays7 = trkLast7.filter(t => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length;
    const waterDays7 = trkLast7.filter(t => t.water_glasses > 0).length;
    const totalGlassesLast7 = trkLast7.reduce((a, t) => a + (t.water_glasses || 0), 0);
    const avgGlasses = trkLast7.length > 0 ? (totalGlassesLast7 / trkLast7.length).toFixed(1) : '0';

    // Aderência: workouts completed in last 30 / planned (approx 4/week = ~17)
    const compLast30 = completed.filter(s => new Date(s.completed_at) >= last30).length;
    const adherence = Math.min(100, Math.round((compLast30 / 17) * 100));

    // Risco abandono
    const risk = !lastOpen || daysSinceOpen! >= 5 ? 'alto' : daysSinceOpen! >= 3 ? 'medio' : 'baixo';

    // Score engajamento (0-100)
    const score = Math.round(
      Math.min(40, uniqueOpenDaysLast30 * 1.5) +
      Math.min(35, compLast30 * 2.5) +
      Math.min(15, mealsDays7 * 2) +
      Math.min(10, waterDays7 * 1.5)
    );

    // Progressão por exercício (top 5 mais frequentes)
    const byExercise = new Map<string, { weight_kg: number | null; reps: number | null; performed_at: string }[]>();
    for (const log of data.setLogs) {
      if (!byExercise.has(log.exercise_name)) byExercise.set(log.exercise_name, []);
      byExercise.get(log.exercise_name)!.push(log);
    }
    const exerciseProgress = Array.from(byExercise.entries())
      .map(([name, logs]) => {
        const sorted = [...logs].sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const maxFirst = Math.max(...sorted.slice(0, Math.min(3, sorted.length)).map(l => Number(l.weight_kg) || 0));
        const maxLast = Math.max(...sorted.slice(-3).map(l => Number(l.weight_kg) || 0));
        const delta = maxFirst > 0 ? ((maxLast - maxFirst) / maxFirst) * 100 : 0;
        return { name, sets: logs.length, lastWeight: Number(last.weight_kg) || 0, lastReps: Number(last.reps) || 0, delta };
      })
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 5);

    // Heatmap 14 dias
    const heatmap = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() }).map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const trk = data.tracking.find(t => t.date === ds);
      const trained = completed.some(s => s.completed_at.slice(0, 10) === ds);
      const opened = appOpens.some(e => e.created_at.slice(0, 10) === ds);
      return {
        date: d, label: format(d, 'EEE', { locale: ptBR }).slice(0, 1).toUpperCase(),
        opened, trained,
        meals: Array.isArray(trk?.meals_completed) ? (trk!.meals_completed as any[]).length : 0,
        water: trk?.water_glasses ?? 0,
      };
    });

    // Timeline merging
    type TLEvent = { ts: string; type: string; label: string; icon: any; color: string };
    const tl: TLEvent[] = [];
    for (const e of appOpens.slice(0, 30)) tl.push({ ts: e.created_at, type: 'open', label: 'Abriu o app', icon: Activity, color: 'text-emerald-500' });
    for (const s of completed.slice(0, 30)) tl.push({ ts: s.completed_at, type: 'workout', label: `Concluiu ${s.day_name || 'treino'} · ${s.duration_minutes}min`, icon: Dumbbell, color: 'text-primary' });
    for (const s of abandoned.slice(0, 10)) tl.push({ ts: s.completed_at, type: 'abandon', label: `Abandonou ${s.day_name || 'treino'}`, icon: XCircle, color: 'text-destructive' });
    for (const a of data.alerts.slice(0, 10)) tl.push({ ts: a.created_at, type: 'alert', label: `⚠ ${a.title}`, icon: AlertTriangle, color: 'text-orange-500' });
    for (const n of data.adminNotifs.slice(0, 10)) tl.push({ ts: n.created_at, type: 'notif', label: `Você enviou: "${n.title}"`, icon: Send, color: 'text-violet-500' });
    tl.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    return {
      openedToday, lastOpen, daysSinceOpen, opensLast7, opensLast30, uniqueOpenDaysLast30,
      workoutToday, completedCount: completed.length, abandonedCount: abandoned.length,
      compLast7: compLast7.length, compLast30, totalVolumeLast7, volumeTrend,
      avgDuration, avgRpe, todayTrk, mealsDays7, waterDays7, avgGlasses,
      adherence, risk, score, exerciseProgress, heatmap, timeline: tl.slice(0, 50),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  if (!computed || !data) return <Empty icon={Activity} text="Sem dados de comportamento ainda." />;

  const c = computed;
  const trendIcon = c.volumeTrend > 5 ? TrendingUp : c.volumeTrend < -5 ? TrendingDown : Minus;
  const trendColor = c.volumeTrend > 5 ? 'text-emerald-500' : c.volumeTrend < -5 ? 'text-destructive' : 'text-muted-foreground';
  const riskColor = c.risk === 'alto' ? 'text-destructive' : c.risk === 'medio' ? 'text-orange-500' : 'text-emerald-500';

  return (
    <div className="space-y-4">
      {/* Header com ações */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Comportamento 360°</h3>
        </div>
        <SendNotificationDialog studentId={studentId} studentName={studentName} onSent={load} />
      </div>

      <Tabs defaultValue="resumo" data-no-swipe>
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <TabsList className="bg-secondary w-max min-w-full">
            <TabsTrigger value="resumo" className="text-xs">Resumo</TabsTrigger>
            <TabsTrigger value="app" className="text-xs">Uso do App</TabsTrigger>
            <TabsTrigger value="treino" className="text-xs">Treino</TabsTrigger>
            <TabsTrigger value="progressao" className="text-xs">Progressão</TabsTrigger>
            <TabsTrigger value="alimentacao" className="text-xs">Alimentação</TabsTrigger>
            <TabsTrigger value="agua" className="text-xs">Água</TabsTrigger>
            <TabsTrigger value="alertas" className="text-xs">Alertas</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
          </TabsList>
        </div>

        {/* RESUMO */}
        <TabsContent value="resumo" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Activity} label="Score engajamento" value={`${c.score}/100`} color={c.score >= 70 ? 'text-emerald-500' : c.score >= 40 ? 'text-orange-500' : 'text-destructive'} />
            <StatCard icon={AlertTriangle} label="Risco abandono" value={c.risk.toUpperCase()} color={riskColor} sub={c.daysSinceOpen != null ? `${c.daysSinceOpen}d sem abrir` : 'Nunca abriu'} />
            <StatCard icon={Dumbbell} label="Aderência 30d" value={`${c.adherence}%`} sub={`${c.compLast30} treinos`} color="text-primary" />
            <StatCard icon={Flame} label="Treinos 7d" value={c.compLast7} color="text-orange-500" />
          </div>

          {/* Heatmap 14 dias */}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Atividade — últimos 14 dias</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                {c.heatmap.map((d, i) => {
                  const intensity = (d.trained ? 2 : 0) + (d.opened ? 1 : 0) + (d.meals > 0 ? 1 : 0) + (d.water > 0 ? 1 : 0);
                  const bg = intensity >= 4 ? 'bg-primary' : intensity === 3 ? 'bg-primary/70' : intensity === 2 ? 'bg-primary/40' : intensity === 1 ? 'bg-primary/20' : 'bg-secondary';
                  return (
                    <div key={i} className="flex flex-col items-center gap-1" title={`${format(d.date, 'dd/MM')} · ${d.trained ? 'Treinou ' : ''}${d.opened ? '· Abriu ' : ''}${d.meals ? `· ${d.meals} refs ` : ''}${d.water ? `· ${d.water} copos` : ''}`}>
                      <div className={`w-full aspect-square rounded ${bg}`} />
                      <span className="text-[8px] text-muted-foreground">{format(d.date, 'd')}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Menos</span>
                <div className="w-3 h-3 rounded bg-secondary" />
                <div className="w-3 h-3 rounded bg-primary/20" />
                <div className="w-3 h-3 rounded bg-primary/40" />
                <div className="w-3 h-3 rounded bg-primary/70" />
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Mais</span>
              </div>
            </CardContent>
          </Card>

          {/* Notificações enviadas */}
          {data.adminNotifs.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4" /> Suas notificações</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.adminNotifs.slice(0, 5).map(n => (
                  <div key={n.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                    {n.viewed_at ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Visto {formatDistanceToNow(new Date(n.viewed_at), { locale: ptBR, addSuffix: true })}
                      </Badge>
                    ) : !n.active ? (
                      <Badge variant="outline" className="text-[10px] shrink-0">Cancelada</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-[10px] shrink-0">Pendente</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* APP */}
        <TabsContent value="app" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Activity} label="Hoje" value={c.openedToday ? 'Sim' : 'Não'} color={c.openedToday ? 'text-emerald-500' : 'text-destructive'} />
            <StatCard icon={Clock} label="Última vez" value={c.lastOpen ? formatDistanceToNow(new Date(c.lastOpen), { locale: ptBR, addSuffix: true }) : '—'} />
            <StatCard icon={Calendar} label="Acessos 7d" value={c.opensLast7} />
            <StatCard icon={Calendar} label="Dias ativos 30d" value={c.uniqueOpenDaysLast30} />
          </div>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico recente</CardTitle></CardHeader>
            <CardContent>
              {data.events.filter(e => e.event_type === 'app_opened').length === 0 ? (
                <Empty icon={Activity} text="Aluno ainda não abriu o app" />
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {data.events.filter(e => e.event_type === 'app_opened').slice(0, 30).map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/30">
                      <span>{format(new Date(e.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
                      <span className="text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { locale: ptBR, addSuffix: true })}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TREINO */}
        <TabsContent value="treino" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={CheckCircle2} label="Treino hoje" value={c.workoutToday ? 'Sim' : 'Não'} color={c.workoutToday ? 'text-emerald-500' : 'text-muted-foreground'} />
            <StatCard icon={Dumbbell} label="Concluídos" value={c.completedCount} color="text-primary" />
            <StatCard icon={XCircle} label="Abandonados" value={c.abandonedCount} color="text-destructive" />
            <StatCard icon={Clock} label="Duração média" value={`${c.avgDuration}min`} sub={c.avgRpe ? `RPE médio ${c.avgRpe}` : undefined} />
          </div>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Sessões recentes</CardTitle></CardHeader>
            <CardContent>
              {data.sessions.length === 0 ? <Empty icon={Dumbbell} text="Nenhuma sessão registrada" /> : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.sessions.slice(0, 20).map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{s.day_name || 'Treino'}</p>
                          {s.status === 'completed' ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px]">OK</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[9px]">{s.status}</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(s.completed_at), "dd/MM HH:mm", { locale: ptBR })} · {s.duration_minutes}min · {s.exercises_completed}/{s.total_exercises} ex · {s.total_sets ?? 0} séries
                          {s.avg_rpe ? ` · RPE ${s.avg_rpe}` : ''}
                          {s.total_volume_kg ? ` · ${Math.round(Number(s.total_volume_kg))}kg vol` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROGRESSÃO */}
        <TabsContent value="progressao" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={trendIcon}
              label="Tendência volume"
              value={`${c.volumeTrend > 0 ? '+' : ''}${c.volumeTrend.toFixed(0)}%`}
              sub="vs semana anterior"
              color={trendColor}
            />
            <StatCard icon={Dumbbell} label="Volume 7d" value={`${Math.round(c.totalVolumeLast7)}kg`} />
            <StatCard icon={Activity} label="Aderência" value={`${c.adherence}%`} color={c.adherence >= 70 ? 'text-emerald-500' : c.adherence >= 40 ? 'text-orange-500' : 'text-destructive'} />
          </div>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top exercícios — evolução de carga</CardTitle></CardHeader>
            <CardContent>
              {c.exerciseProgress.length === 0 ? <Empty icon={Dumbbell} text="Sem registros de cargas" /> : (
                <div className="space-y-3">
                  {c.exerciseProgress.map(ex => {
                    const TI = ex.delta > 5 ? TrendingUp : ex.delta < -5 ? TrendingDown : Minus;
                    const tc = ex.delta > 5 ? 'text-emerald-500' : ex.delta < -5 ? 'text-destructive' : 'text-muted-foreground';
                    return (
                      <div key={ex.name} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium truncate">{ex.name}</p>
                          <div className={`flex items-center gap-1 text-xs ${tc}`}>
                            <TI className="h-3 w-3" /> {ex.delta > 0 ? '+' : ''}{ex.delta.toFixed(0)}%
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{ex.sets} séries</span>
                          <span>·</span>
                          <span>Última: {ex.lastWeight}kg × {ex.lastReps}</span>
                        </div>
                        <Progress value={Math.min(100, Math.max(0, 50 + ex.delta * 2))} className="h-1" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ALIMENTAÇÃO */}
        <TabsContent value="alimentacao" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard icon={Utensils} label="Refeições hoje" value={Array.isArray(c.todayTrk?.meals_completed) ? (c.todayTrk!.meals_completed as any[]).length : 0} color="text-emerald-500" />
            <StatCard icon={Calendar} label="Dias com registro 7d" value={c.mealsDays7} sub="de 7" />
            <StatCard icon={Activity} label="Consistência" value={`${Math.round((c.mealsDays7 / 7) * 100)}%`} color={c.mealsDays7 >= 5 ? 'text-emerald-500' : c.mealsDays7 >= 3 ? 'text-orange-500' : 'text-destructive'} />
          </div>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico de refeições</CardTitle></CardHeader>
            <CardContent>
              {data.tracking.filter(t => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length === 0 ? (
                <Empty icon={Utensils} text="Sem registros de refeições" />
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {data.tracking.filter(t => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).slice(0, 30).map(t => (
                    <div key={t.date} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/30">
                      <span>{format(new Date(t.date + 'T12:00'), "dd/MM (EEE)", { locale: ptBR })}</span>
                      <Badge variant="outline" className="text-[10px]">{(t.meals_completed as any[]).length} refeições</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ÁGUA */}
        <TabsContent value="agua" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard icon={GlassWater} label="Hoje" value={`${c.todayTrk?.water_glasses ?? 0} copos`} color="text-blue-500" />
            <StatCard icon={Calendar} label="Dias 7d" value={c.waterDays7} sub="com registro" />
            <StatCard icon={Activity} label="Média diária" value={`${c.avgGlasses}`} sub="copos/dia" />
          </div>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico de hidratação</CardTitle></CardHeader>
            <CardContent>
              {data.tracking.filter(t => t.water_glasses > 0).length === 0 ? (
                <Empty icon={GlassWater} text="Sem registros de água" />
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {data.tracking.filter(t => t.water_glasses > 0).slice(0, 30).map(t => (
                    <div key={t.date} className="flex items-center justify-between text-xs p-1.5 rounded bg-secondary/30">
                      <span>{format(new Date(t.date + 'T12:00'), "dd/MM (EEE)", { locale: ptBR })}</span>
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/30">{t.water_glasses} copos</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ALERTAS */}
        <TabsContent value="alertas" className="space-y-3">
          {data.alerts.length === 0 ? <Empty icon={CheckCircle2} text="Nenhum alerta para este aluno" /> : (
            <div className="space-y-2">
              {data.alerts.map(a => (
                <Card key={a.id} className="glass-card">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-[9px] ${
                            a.priority === 'alta' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                            a.priority === 'media' ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
                            'bg-muted text-muted-foreground'
                          }`}>{a.priority}</Badge>
                          <Badge variant="outline" className="text-[9px]">{a.category}</Badge>
                          <Badge variant="outline" className={`text-[9px] ${a.status === 'pendente' ? 'bg-orange-500/10 text-orange-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{a.status}</Badge>
                        </div>
                        <p className="text-sm font-medium">{a.title}</p>
                        {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(a.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="space-y-3">
          {c.timeline.length === 0 ? <Empty icon={History} text="Sem eventos registrados" /> : (
            <Card className="glass-card">
              <CardContent className="p-3">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {c.timeline.map((e, i) => {
                    const I = e.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 text-xs">
                        <div className={`mt-0.5 ${e.color}`}><I className="h-3.5 w-3.5" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{e.label}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(e.ts), "dd/MM/yy 'às' HH:mm", { locale: ptBR })} · {formatDistanceToNow(new Date(e.ts), { locale: ptBR, addSuffix: true })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StudentBehavior360;