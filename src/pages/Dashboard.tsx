import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ClipboardList, TrendingUp, UserPlus, Bell, CalendarClock, Cake, Phone, MessageSquare, ChevronRight, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNotifications, NotificationType } from '@/hooks/useNotifications';

const Dashboard = () => {
  const [stats, setStats] = useState({ totalAlunos: 0, avaliacoesMes: 0 });
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const { notifications, count: notifCount } = useNotifications();
  const navigate = useNavigate();

  const notifIconMap: Record<NotificationType, React.ElementType> = {
    reavaliacao: CalendarClock,
    aniversario: Cake,
    mensagem_semanal: MessageSquare,
    sem_telefone: Phone,
    sem_treino: ClipboardList,
    sem_dieta: ClipboardList,
    ficha_mensal: ClipboardList,
  };
  const notifColorMap: Record<NotificationType, string> = {
    reavaliacao: 'text-orange-500',
    aniversario: 'text-pink-500',
    mensagem_semanal: 'text-blue-500',
    sem_telefone: 'text-red-500',
    sem_treino: 'text-amber-500',
    sem_dieta: 'text-emerald-500',
    ficha_mensal: 'text-violet-500',
  };

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const { count: totalAlunos } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'aluno');

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: avaliacoesMes } = await supabase
      .from('assessments')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());

    setStats({ totalAlunos: totalAlunos ?? 0, avaliacoesMes: avaliacoesMes ?? 0 });

    const { data: alunoRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'aluno');

    const alunoIds = (alunoRoles ?? []).map((r) => r.user_id);

    if (alunoIds.length === 0) {
      setRecentStudents([]);
    } else {
      const { data: recent } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', alunoIds)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentStudents(recent ?? []);
    }

    // Chart data - last 6 months
    const months = [];
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

    const chartPromises = months.map(async (m) => {
      const { count } = await supabase
        .from('assessments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', m.start)
        .lte('created_at', m.end);
      return { name: m.name, avaliacoes: count ?? 0 };
    });

    setChartData(await Promise.all(chartPromises));
  };

  const statCards = [
    { title: 'Total de Alunos', value: stats.totalAlunos, icon: Users, color: 'text-primary' },
    { title: 'Avaliações no Mês', value: stats.avaliacoesMes, icon: ClipboardList, color: 'text-chart-2' },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="glass-card">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl p-3 bg-secondary ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alerts Card */}
        {notifCount > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Alertas ({notifCount})
                </div>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('/consultoria')}>
                  Ver todos <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {notifications.slice(0, 5).map((n) => {
                  const Icon = notifIconMap[n.type];
                  const color = notifColorMap[n.type];
                  return (
                    <div
                      key={n.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-background/60 cursor-pointer hover:bg-background transition-colors"
                      onClick={() => navigate(`/alunos/${n.studentId}`)}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

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
                {recentStudents.length === 0 ? (
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
