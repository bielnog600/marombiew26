import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Dumbbell, Activity, Flame, BarChart3, TrendingUp, TrendingDown, Minus,
  Share2,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  AreaChart, Area, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';
import type { TrainingPhase } from '@/lib/trainingPhase';

type Period = '7d' | '1m' | '3m' | '6m' | '1y' | 'all';

interface SetLog {
  id: string;
  exercise_name: string;
  muscle_group: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  phase: string | null;
  day_name: string | null;
  performed_at: string;
  session_id: string | null;
}

interface Session {
  id: string;
  duration_minutes: number;
  exercises_completed: number;
  total_exercises: number;
  total_sets: number | null;
  total_volume_kg: number | null;
  avg_rpe: number | null;
  completed_at: string;
  day_name: string | null;
  phase: string | null;
}

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7D',
  '1m': '1M',
  '3m': '3M',
  '6m': '6M',
  '1y': '1A',
  'all': 'Todo',
};

const periodToDate = (p: Period): Date | null => {
  const now = new Date();
  switch (p) {
    case '7d': return new Date(now.getTime() - 7 * 86400000);
    case '1m': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case '3m': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case '6m': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case '1y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case 'all': return null;
  }
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const EmptyState = ({ message }: { message: string }) => (
  <Card className="glass-card">
    <CardContent className="p-8 text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </CardContent>
  </Card>
);

const StatCard = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) => (
  <Card className="glass-card">
    <CardContent className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </CardContent>
  </Card>
);

const MeuProgresso: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('1m');
  const [exerciseFilter, setExerciseFilter] = useState<string>('all');
  const [muscleFilter, setMuscleFilter] = useState<string>('all');
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [shareSession, setShareSession] = useState<Session | null>(null);

  useEffect(() => {
    if (user) load();
  }, [user, period]);

  const load = async () => {
    setLoading(true);
    const since = periodToDate(period);

    let logsQuery = supabase
      .from('exercise_set_logs')
      .select('*')
      .eq('student_id', user!.id)
      .order('performed_at', { ascending: true });
    if (since) logsQuery = logsQuery.gte('performed_at', since.toISOString());

    let sessionsQuery = supabase
      .from('workout_sessions')
      .select('*')
      .eq('student_id', user!.id)
      .order('completed_at', { ascending: true });
    if (since) sessionsQuery = sessionsQuery.gte('completed_at', since.toISOString());

    const [logsRes, sessionsRes] = await Promise.all([logsQuery, sessionsQuery]);
    setLogs((logsRes.data ?? []) as SetLog[]);
    setSessions((sessionsRes.data ?? []) as Session[]);
    setLoading(false);
  };

  const exerciseOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.exercise_name && set.add(l.exercise_name));
    return Array.from(set).sort();
  }, [logs]);

  const muscleOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => l.muscle_group && set.add(l.muscle_group));
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (exerciseFilter !== 'all' && l.exercise_name !== exerciseFilter) return false;
      if (muscleFilter !== 'all' && l.muscle_group !== muscleFilter) return false;
      return true;
    });
  }, [logs, exerciseFilter, muscleFilter]);

  // ============ CARGAS ============
  const cargasData = useMemo(() => {
    if (filteredLogs.length === 0) return null;
    // For each exercise, get max weight per session date
    const byExercise: Record<string, { date: string; max: number; avg: number; count: number }[]> = {};
    const grouped: Record<string, Record<string, number[]>> = {}; // exercise -> date -> [weights]

    filteredLogs.forEach((l) => {
      if (!l.weight_kg || l.weight_kg <= 0) return;
      const dateKey = l.performed_at.slice(0, 10);
      grouped[l.exercise_name] = grouped[l.exercise_name] || {};
      grouped[l.exercise_name][dateKey] = grouped[l.exercise_name][dateKey] || [];
      grouped[l.exercise_name][dateKey].push(Number(l.weight_kg));
    });

    Object.entries(grouped).forEach(([ex, dates]) => {
      byExercise[ex] = Object.entries(dates)
        .map(([date, weights]) => ({
          date,
          max: Math.max(...weights),
          avg: weights.reduce((a, b) => a + b, 0) / weights.length,
          count: weights.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });

    // Stats per exercise: initial / current / best
    const stats = Object.entries(byExercise).map(([ex, points]) => {
      const initial = points[0].max;
      const current = points[points.length - 1].max;
      const best = Math.max(...points.map((p) => p.max));
      return { exercise: ex, initial, current, best, points };
    });

    return stats.sort((a, b) => b.best - a.best);
  }, [filteredLogs]);

  // ============ VOLUME ============
  const volumeData = useMemo(() => {
    // Per-session volume from filteredLogs
    const bySession: Record<string, { date: string; volume: number }> = {};
    filteredLogs.forEach((l) => {
      if (!l.weight_kg || !l.reps) return;
      const sid = l.session_id || l.performed_at.slice(0, 10);
      if (!bySession[sid]) {
        bySession[sid] = { date: l.performed_at.slice(0, 10), volume: 0 };
      }
      bySession[sid].volume += Number(l.weight_kg) * Number(l.reps);
    });
    const sessionPoints = Object.values(bySession).sort((a, b) => a.date.localeCompare(b.date));

    // Weekly
    const weekly: Record<string, number> = {};
    sessionPoints.forEach(({ date, volume }) => {
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
      const wkKey = monday.toISOString().slice(0, 10);
      weekly[wkKey] = (weekly[wkKey] || 0) + volume;
    });
    const weeklyPoints = Object.entries(weekly)
      .map(([date, volume]) => ({ date, volume }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Monthly
    const monthly: Record<string, number> = {};
    sessionPoints.forEach(({ date, volume }) => {
      const m = date.slice(0, 7);
      monthly[m] = (monthly[m] || 0) + volume;
    });
    const monthlyPoints = Object.entries(monthly)
      .map(([date, volume]) => ({ date, volume }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // By muscle group
    const byMuscle: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      if (!l.weight_kg || !l.reps || !l.muscle_group) return;
      byMuscle[l.muscle_group] = (byMuscle[l.muscle_group] || 0) + Number(l.weight_kg) * Number(l.reps);
    });
    const musclePoints = Object.entries(byMuscle)
      .map(([muscle, volume]) => ({ muscle, volume: Math.round(volume) }))
      .sort((a, b) => b.volume - a.volume);

    const totalVolume = sessionPoints.reduce((s, p) => s + p.volume, 0);

    return { sessionPoints, weeklyPoints, monthlyPoints, musclePoints, totalVolume };
  }, [filteredLogs]);

  // ============ PERFORMANCE ============
  const perfData = useMemo(() => {
    const totalSessions = sessions.length;
    const totalExercises = sessions.reduce((s, x) => s + (x.exercises_completed || 0), 0);
    const totalSets = sessions.reduce((s, x) => s + (x.total_sets || 0), 0);
    const avgDuration = totalSessions > 0
      ? Math.round(sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0) / totalSessions)
      : 0;

    // Weekly frequency
    const weeks: Record<string, number> = {};
    sessions.forEach((s) => {
      const d = new Date(s.completed_at);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const wkKey = monday.toISOString().slice(0, 10);
      weeks[wkKey] = (weeks[wkKey] || 0) + 1;
    });
    const weekValues = Object.values(weeks);
    const avgWeekly = weekValues.length > 0
      ? (weekValues.reduce((a, b) => a + b, 0) / weekValues.length).toFixed(1)
      : '0';

    return { totalSessions, totalExercises, totalSets, avgDuration, avgWeekly };
  }, [sessions]);

  // ============ ESTRESSE FISIOLÓGICO ============
  const stressData = useMemo(() => {
    // Per-session stress = volume * avg_rpe (sRPE-like)
    // Fallback if no rpe: volume / 100
    const points = sessions
      .filter((s) => s.completed_at)
      .map((s) => {
        const volume = Number(s.total_volume_kg || 0);
        const rpe = Number(s.avg_rpe || 0);
        const duration = Number(s.duration_minutes || 0);
        // Internal load: prefer volume * rpe, else duration * rpe (or just duration*5)
        const load = volume > 0 && rpe > 0
          ? volume * rpe / 1000  // normalized in kg·RPE/1000
          : duration * (rpe || 5) / 10;
        return {
          date: s.completed_at.slice(0, 10),
          load: Math.round(load),
          volume,
          rpe,
          duration,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const recent = points.slice(-7);
    const earlier = points.slice(-14, -7);
    const recentAvg = recent.length > 0 ? recent.reduce((s, p) => s + p.load, 0) / recent.length : 0;
    const earlierAvg = earlier.length > 0 ? earlier.reduce((s, p) => s + p.load, 0) / earlier.length : 0;

    let trend: 'low' | 'moderate' | 'high' = 'moderate';
    let trendIcon = Minus;
    let trendLabel = 'Estável';
    if (recentAvg > 0) {
      if (recentAvg < 50) { trend = 'low'; trendLabel = 'Baixo'; }
      else if (recentAvg > 200) { trend = 'high'; trendLabel = 'Alto'; }
      else { trend = 'moderate'; trendLabel = 'Moderado'; }

      if (earlierAvg > 0) {
        const diff = ((recentAvg - earlierAvg) / earlierAvg) * 100;
        if (diff > 15) trendIcon = TrendingUp;
        else if (diff < -15) trendIcon = TrendingDown;
      }
    }

    return { points, recentAvg: Math.round(recentAvg), trend, trendIcon, trendLabel };
  }, [sessions]);

  if (loading) {
    return (
      <AppLayout title="Meu Progresso">
        <div className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  const noData = logs.length === 0 && sessions.length === 0;

  return (
    <AppLayout title="Meu Progresso">
      <div className="space-y-4 animate-fade-in pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2"
          onClick={() => navigate('/perfil')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        {/* Period filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {noData ? (
          <EmptyState message="Ainda não há treinos registrados. Conclua um treino para começar a ver sua evolução." />
        ) : (
          <>
          {/* Compartilhar treinos recentes */}
          {sessions.length > 0 && (
            <Card className="glass-card">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Compartilhar treinos recentes</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Esqueceu de postar? Escolha um treino abaixo e compartilhe nos stories.
                </p>
                <div className="space-y-1.5 pt-1">
                  {[...sessions]
                    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
                    .slice(0, 5)
                    .map((s) => {
                      const d = new Date(s.completed_at);
                      const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                      const dur = s.duration_minutes || 0;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setShareSession(s)}
                          className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg bg-background/40 hover:bg-background/70 border border-border/40 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                              {s.day_name || 'Treino'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {dateLabel} · {dur} min · {s.exercises_completed}/{s.total_exercises} exerc.
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-primary text-[10px] font-bold uppercase tracking-wider shrink-0">
                            <Share2 className="h-3.5 w-3.5" />
                            Postar
                          </div>
                        </button>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="cargas" className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="cargas" className="text-xs">Cargas</TabsTrigger>
              <TabsTrigger value="volume" className="text-xs">Volume</TabsTrigger>
              <TabsTrigger value="performance" className="text-xs">Perform.</TabsTrigger>
              <TabsTrigger value="estresse" className="text-xs">Estresse</TabsTrigger>
            </TabsList>

            {/* CARGAS */}
            <TabsContent value="cargas" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                <Select value={exerciseFilter} onValueChange={setExerciseFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Exercício" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todos exercícios</SelectItem>
                    {exerciseOptions.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={muscleFilter} onValueChange={setMuscleFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos grupos</SelectItem>
                    {muscleOptions.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!cargasData || cargasData.length === 0 ? (
                <EmptyState message="Nenhuma carga registrada no período. Anote o peso de cada série ao treinar." />
              ) : (
                <div className="space-y-3">
                  {cargasData.slice(0, 8).map((stat) => {
                    const evol = stat.current - stat.initial;
                    const evolPct = stat.initial > 0 ? (evol / stat.initial) * 100 : 0;
                    return (
                      <Card key={stat.exercise} className="glass-card">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-foreground line-clamp-1 flex-1">{stat.exercise}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${evol > 0 ? 'bg-primary/20 text-primary' : evol < 0 ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                              {evol > 0 ? '+' : ''}{evol.toFixed(1)}kg ({evolPct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-background/50 rounded p-1.5">
                              <p className="text-[9px] text-muted-foreground uppercase">Inicial</p>
                              <p className="text-sm font-bold text-foreground tabular-nums">{stat.initial}kg</p>
                            </div>
                            <div className="bg-primary/10 rounded p-1.5">
                              <p className="text-[9px] text-muted-foreground uppercase">Atual</p>
                              <p className="text-sm font-bold text-primary tabular-nums">{stat.current}kg</p>
                            </div>
                            <div className="bg-background/50 rounded p-1.5">
                              <p className="text-[9px] text-muted-foreground uppercase">Melhor</p>
                              <p className="text-sm font-bold text-foreground tabular-nums">{stat.best}kg</p>
                            </div>
                          </div>
                          {stat.points.length > 1 && (
                            <div className="h-20">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stat.points.map((p) => ({ ...p, label: fmtDate(p.date) }))}>
                                  <Line type="monotone" dataKey="max" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                  <YAxis hide domain={['auto', 'auto']} />
                                  <Tooltip
                                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                                    formatter={(v: number) => [`${v}kg`, 'Carga máx.']}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* VOLUME */}
            <TabsContent value="volume" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={Dumbbell} label="Volume total" value={`${(volumeData.totalVolume / 1000).toFixed(1)}t`} sub="no período" />
                <StatCard icon={Activity} label="Sessões" value={volumeData.sessionPoints.length} sub="com carga" />
              </div>

              {volumeData.sessionPoints.length === 0 ? (
                <EmptyState message="Sem volume registrado. Anote carga e reps em cada série." />
              ) : (
                <>
                  <Card className="glass-card">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-semibold text-foreground">Volume semanal (kg)</p>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={volumeData.weeklyPoints.map((p) => ({ ...p, label: fmtDate(p.date) }))}>
                            <defs>
                              <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="volume" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#volGrad)" />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={36} />
                            <Tooltip
                              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                              formatter={(v: number) => [`${Math.round(v)}kg`, 'Volume']}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {volumeData.musclePoints.length > 0 && (
                    <Card className="glass-card">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Volume por grupo muscular</p>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={volumeData.musclePoints} layout="vertical">
                              <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                              <XAxis type="number" hide />
                              <YAxis type="category" dataKey="muscle" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={80} />
                              <Tooltip
                                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                                formatter={(v: number) => [`${v}kg`, 'Volume']}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* PERFORMANCE */}
            <TabsContent value="performance" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={Activity} label="Sessões concluídas" value={perfData.totalSessions} />
                <StatCard icon={Dumbbell} label="Exercícios" value={perfData.totalExercises} />
                <StatCard icon={BarChart3} label="Séries" value={perfData.totalSets} />
                <StatCard icon={Activity} label="Tempo médio" value={`${perfData.avgDuration}min`} />
                <StatCard icon={TrendingUp} label="Frequência" value={`${perfData.avgWeekly}x`} sub="por semana" />
              </div>

              {sessions.length > 0 && (
                <Card className="glass-card">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Duração por sessão (min)</p>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sessions.map((s) => ({ label: fmtDate(s.completed_at), duration: s.duration_minutes }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <Line type="monotone" dataKey="duration" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: number) => [`${v}min`, 'Duração']}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ESTRESSE */}
            <TabsContent value="estresse" className="space-y-3 mt-0">
              <Card className="glass-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carga interna recente</p>
                      <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{stressData.recentAvg}</p>
                      <p className="text-[10px] text-muted-foreground">média últimas 7 sessões</p>
                    </div>
                    <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${
                      stressData.trend === 'high' ? 'bg-destructive/15 text-destructive'
                      : stressData.trend === 'low' ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/15 text-primary'
                    }`}>
                      <Flame className="h-5 w-5" />
                      <span className="text-[10px] font-bold uppercase">{stressData.trendLabel}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Calculado com base no volume × RPE de cada sessão (sRPE).
                    Baixo &lt; 50 · Moderado 50–200 · Alto &gt; 200
                  </p>
                </CardContent>
              </Card>

              {stressData.points.length === 0 ? (
                <EmptyState message="Registre RPE em cada série para acompanhar seu estresse fisiológico." />
              ) : (
                <Card className="glass-card">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Evolução da carga interna</p>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stressData.points.map((p) => ({ ...p, label: fmtDate(p.date) }))}>
                          <defs>
                            <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="load" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#stressGrad)" />
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                            formatter={(v: number) => [v, 'Carga interna']}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
          </>
        )}
      </div>

      {shareSession && (
        <WorkoutSummaryShare
          dayName={shareSession.day_name || 'Treino'}
          durationSeconds={(shareSession.duration_minutes || 0) * 60}
          exercisesCompleted={shareSession.exercises_completed || 0}
          totalExercises={shareSession.total_exercises || 0}
          phase={(shareSession.phase as TrainingPhase | null) ?? null}
          onClose={() => setShareSession(null)}
        />
      )}
    </AppLayout>
  );
};

export default MeuProgresso;
