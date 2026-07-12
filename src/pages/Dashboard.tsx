import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ClipboardList, TrendingUp, UserPlus, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminTodayOverview from '@/components/admin/AdminTodayOverview';
import StudentActivityCard from '@/components/admin/StudentActivityCard';
import BirthdaysCard from '@/components/admin/BirthdaysCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

function logQueryError(where: string, error: unknown) {
  // Structured, non-sensitive log. Never surface these strings to end users.
  const e = error as { code?: string; message?: string; details?: string } | null;
  console.error('[Dashboard]', where, {
    code: e?.code,
    message: e?.message,
    details: e?.details,
  });
}

const Dashboard = () => {
  const [state, setState] = useState<LoadState>('idle');
  const [stats, setStats] = useState<{ totalAlunos: number | null; avaliacoesMes: number | null }>({
    totalAlunos: null,
    avaliacoesMes: null,
  });
  const [recentStudents, setRecentStudents] = useState<any[] | null>(null);
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [failedQueries, setFailedQueries] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setState('loading');
    const failures: string[] = [];

    // 1) Total de alunos
    const totalAlunosRes = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'aluno');
    if (totalAlunosRes.error) {
      logQueryError('user_roles.count', totalAlunosRes.error);
      failures.push('user_roles');
    }

    // 2) Avaliações no mês
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const avaliacoesMesRes = await supabase
      .from('assessments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());
    if (avaliacoesMesRes.error) {
      logQueryError('assessments.count(month)', avaliacoesMesRes.error);
      failures.push('assessments');
    }

    setStats({
      totalAlunos: totalAlunosRes.error ? null : (totalAlunosRes.count ?? 0),
      avaliacoesMes: avaliacoesMesRes.error ? null : (avaliacoesMesRes.count ?? 0),
    });

    // 3) Últimos alunos
    const alunoRolesRes = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'aluno');
    if (alunoRolesRes.error) {
      logQueryError('user_roles.list', alunoRolesRes.error);
      failures.push('user_roles(list)');
      setRecentStudents(null);
    } else {
      const alunoIds = (alunoRolesRes.data ?? []).map((r: any) => r.user_id);
      if (alunoIds.length === 0) {
        setRecentStudents([]);
      } else {
        const recentRes = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', alunoIds)
          .order('created_at', { ascending: false })
          .limit(5);
        if (recentRes.error) {
          logQueryError('profiles.recent', recentRes.error);
          failures.push('profiles');
          setRecentStudents(null);
        } else {
          setRecentStudents(recentRes.data ?? []);
        }
      }
    }

    // 4) Gráfico — 6 últimos meses
    const months: Array<{ name: string; start: string; end: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        name: start.toLocaleDateString('pt-BR', { month: 'short' }),
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
    let chartFailed = false;
    const chartResults = await Promise.all(
      months.map(async (m) => {
        const res = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', m.start)
          .lte('created_at', m.end);
        if (res.error) {
          logQueryError(`assessments.chart(${m.name})`, res.error);
          chartFailed = true;
        }
        return { name: m.name, avaliacoes: res.error ? null : (res.count ?? 0) };
      })
    );
    if (chartFailed) failures.push('assessments(chart)');
    setChartData(chartFailed ? null : chartResults);

    setFailedQueries(failures);
    setState(failures.length > 0 ? 'error' : 'success');
  };

  const statCards = [
    { title: 'Total de Alunos', value: stats.totalAlunos, icon: Users, color: 'text-primary' },
    { title: 'Avaliações no Mês', value: stats.avaliacoesMes, icon: ClipboardList, color: 'text-chart-2' },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6 animate-fade-in">
        {state === 'error' && (
          <Card className="glass-card border-destructive/60 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-destructive">Não foi possível carregar os dados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Uma ou mais consultas ao servidor falharam. Os valores exibidos como “—” indicam falha, não zero real.
                  Tente novamente em instantes.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadStats} disabled={state === 'loading'}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${state === 'loading' ? 'animate-spin' : ''}`} />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Student activity overview — online, today's accesses, today's workouts */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Atividade dos alunos hoje
          </h2>
          <AdminTodayOverview />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="glass-card">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 bg-secondary ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  {state === 'loading' ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : stat.value === null ? (
                    <p className="text-3xl font-bold text-destructive" title="Falha ao carregar">—</p>
                  ) : (
                    <p className="text-3xl font-bold">{stat.value}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Activity ranking + Birthdays */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StudentActivityCard />
          <BirthdaysCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-primary" />
                Avaliações por Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {state === 'loading' ? (
                  <Skeleton className="h-full w-full" />
                ) : chartData === null ? (
                  <div className="h-full flex items-center justify-center text-sm text-destructive">
                    Não foi possível carregar os dados
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="name" stroke="hsl(220 10% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(220 18% 10%)',
                        border: '1px solid hsl(220 14% 18%)',
                        borderRadius: '8px',
                        color: 'hsl(0 0% 95%)',
                      }}
                    />
                    <Bar dataKey="avaliacoes" fill="hsl(45 100% 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-5 w-5 text-primary" />
                Últimos Alunos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {state === 'loading' ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : recentStudents === null ? (
                  <p className="text-sm text-destructive">Não foi possível carregar os dados.</p>
                ) : recentStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado ainda.</p>
                ) : (
                  recentStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm">
                        {(s.nome || s.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.nome || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
