import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpDown,
  Bell,
  Dumbbell,
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Video,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import EngagementOverviewCards from '@/components/consultoria/EngagementOverviewCards';
import ConsultoriaStudentSearch from '@/components/consultoria/ConsultoriaStudentSearch';
import AllExecutionVideos from '@/components/consultoria/AllExecutionVideos';
import PushNotificationsToday from '@/components/consultoria/PushNotificationsToday';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConsultoriaPlans, type ConsultoriaCycleStudent } from '@/hooks/useConsultoriaPlans';
import {
  compareConsultoriaCycleStudents,
  getCycleInfo,
  normalizeConsultoriaTab,
  planBaseDate,
  type CycleStatus,
} from '@/lib/consultoriaMetrics';
import { cn } from '@/lib/utils';

const CycleStatusBadge: React.FC<{ status: CycleStatus; remaining: number }> = ({ status, remaining }) => {
  if (status === 'vencido') return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
  if (status === 'atencao') return <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/30">⚠ {remaining}d restantes</Badge>;
  return <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{remaining}d restantes</Badge>;
};

interface PlanCycleListProps {
  kind: 'dieta' | 'treino';
  students: ConsultoriaCycleStudent[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

const PlanCycleList: React.FC<PlanCycleListProps> = ({ kind, students, loading, error, onRetry }) => {
  const navigate = useNavigate();
  const [sort, setSort] = useState<'name' | 'overdue'>('name');
  const isDiet = kind === 'dieta';
  const label = isDiet ? 'dieta' : 'treino';

  const sorted = useMemo(
    () => [...students].sort((a, b) => compareConsultoriaCycleStudents(a, b, kind, sort)),
    [students, kind, sort],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ciclo de {isDiet ? 'Dietas' : 'Treinos'} (45 dias)</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] gap-1.5"
          onClick={() => setSort(previous => previous === 'name' ? 'overdue' : 'name')}
        >
          <ArrowUpDown className="h-3 w-3" />
          {sort === 'name' ? 'Ordenar por Vencimento' : 'Ordenar por Nome'}
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
      ) : error ? (
        <Card><CardContent className="p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os ciclos.</p>
          <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {sorted.map(student => {
            const plan = student[kind];
            if (!plan) return (
              <Card key={student.studentId} className="glass-card hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/alunos/${student.studentId}?tab=${isDiet ? 'dietas' : 'treinos'}`)}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-sm">{student.studentName}</h4>
                    <p className="text-[10px] text-muted-foreground">Nenhum{isDiet ? 'a dieta' : ' treino'} publicado{isDiet ? 'a' : ''}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/30">Sem {label}</Badge>
                </CardContent>
              </Card>
            );
            const baseDate = planBaseDate(plan.titulo, plan.created_at);
            const cycle = getCycleInfo(baseDate);
            return (
              <Card key={student.studentId} className="glass-card hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/alunos/${student.studentId}?tab=${isDiet ? 'dietas' : 'treinos'}`)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-sm">{student.studentName}</h4>
                      <p className="text-[10px] text-muted-foreground">Início do plano: {format(new Date(baseDate), 'dd/MM/yy')}</p>
                    </div>
                    <CycleStatusBadge status={cycle.status} remaining={cycle.remaining} />
                  </div>
                  <Progress value={cycle.progress} className={cn('h-1.5', cycle.status === 'vencido' ? 'bg-destructive/20' : cycle.status === 'atencao' ? 'bg-orange-500/20' : 'bg-emerald-500/20')} />
                  <p className="text-[10px] text-right text-muted-foreground">{cycle.days}d / 45d</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Consultoria: React.FC = () => {
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [tab, setTab] = useState(() => normalizeConsultoriaTab(initialParams.get('tab')));
  const needsPlans = tab === 'dashboard' || tab === 'dietas' || tab === 'treinos';
  const { students, loading, error, reload } = useConsultoriaPlans(needsPlans);

  const stats = useMemo(() => ({
    semDieta: students.filter(student => !student.dieta).length,
    semTreino: students.filter(student => !student.treino).length,
    dietasVencidas: students.filter(student => student.dieta && getCycleInfo(planBaseDate(student.dieta.titulo, student.dieta.created_at)).status === 'vencido').length,
    treinosVencidas: students.filter(student => student.treino && getCycleInfo(planBaseDate(student.treino.titulo, student.treino.created_at)).status === 'vencido').length,
  }), [students]);

  const statValue = (value: number) => loading ? '…' : error ? '—' : value;
  const statsCards = [
    { label: 'Sem Dieta', value: stats.semDieta, icon: UtensilsCrossed, color: 'text-primary' },
    { label: 'Sem Treino', value: stats.semTreino, icon: Dumbbell, color: 'text-primary' },
    { label: 'Dietas Vencidas', value: stats.dietasVencidas, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Treinos Vencidos', value: stats.treinosVencidas, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <AppLayout title="Consultoria">
      <div className="max-w-6xl mx-auto space-y-6">
        <Tabs value={tab} onValueChange={value => setTab(normalizeConsultoriaTab(value))} className="w-full">
          <div className="overflow-x-auto w-full mb-6 no-scrollbar">
            <TabsList className="inline-flex w-max h-auto p-1 bg-secondary/50 rounded-xl border border-border/50">
              <TabsTrigger value="dashboard" className="px-4 py-2 text-xs gap-2"><LayoutDashboard className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
              <TabsTrigger value="estudantes" className="px-4 py-2 text-xs gap-2"><Users className="h-3.5 w-3.5" /> Alunos</TabsTrigger>
              <TabsTrigger value="dietas" className="px-4 py-2 text-xs gap-2"><UtensilsCrossed className="h-3.5 w-3.5" /> Dietas</TabsTrigger>
              <TabsTrigger value="treinos" className="px-4 py-2 text-xs gap-2"><Dumbbell className="h-3.5 w-3.5" /> Treinos</TabsTrigger>
              <TabsTrigger value="videos" className="px-4 py-2 text-xs gap-2"><Video className="h-3.5 w-3.5" /> Vídeos</TabsTrigger>
              <TabsTrigger value="notificacoes" className="px-4 py-2 text-xs gap-2"><Bell className="h-3.5 w-3.5" /> Notificações</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            {tab === 'dashboard' && <>
              <EngagementOverviewCards />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statsCards.map(card => <Card key={card.label} className="glass-card">
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <card.icon className={cn('h-6 w-6', card.color)} />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">{card.label}</p>
                      <p className="text-2xl font-bold">{statValue(card.value)}</p>
                    </div>
                  </CardContent>
                </Card>)}
              </div>
            </>}
          </TabsContent>

          <TabsContent value="estudantes" className="mt-6">
            {tab === 'estudantes' && <ConsultoriaStudentSearch />}
          </TabsContent>
          <TabsContent value="dietas" className="mt-6">
            {tab === 'dietas' && <PlanCycleList kind="dieta" students={students} loading={loading} error={error} onRetry={() => void reload()} />}
          </TabsContent>
          <TabsContent value="treinos" className="mt-6">
            {tab === 'treinos' && <PlanCycleList kind="treino" students={students} loading={loading} error={error} onRetry={() => void reload()} />}
          </TabsContent>
          <TabsContent value="videos" className="mt-6">
            {tab === 'videos' && <AllExecutionVideos />}
          </TabsContent>
          <TabsContent value="notificacoes" className="mt-6">
            {tab === 'notificacoes' && <PushNotificationsToday />}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Consultoria;
