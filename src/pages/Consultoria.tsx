import { useNavigate } from "react-router-dom";
import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  RefreshCw, 
  LayoutDashboard,
  AlertCircle,
  Users,
  UtensilsCrossed,
  Dumbbell,
  ClipboardList,
  Video,
  Bell,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { differenceInDays, startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { startOfToday } from 'date-fns';



// Shared Hooks
import { useStudentsWeeklySummary } from '@/hooks/useStudentsWeeklySummary';
import { useBehavioralAlerts } from '@/hooks/useBehavioralAlerts';
import { useNotifications } from '@/hooks/useNotifications';
import { useStudentFollowups, bucketFor } from '@/hooks/useStudentFollowups';
import { useWeeklyProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import { useInactiveStudents } from '@/hooks/useInactiveStudents';

// Components
import EngagementOverviewCards from '@/components/consultoria/EngagementOverviewCards';
import WeeklyAlertOverviewCards, { type FollowupFilter } from '@/components/consultoria/WeeklyAlertOverviewCards';
import StudentWeeklyCard from '@/components/consultoria/StudentWeeklyCard';
import WeeklyProgressionReviewCard from '@/components/consultoria/WeeklyProgressionReviewCard';
import InactiveStudentCard from '@/components/consultoria/InactiveStudentCard';
import OtherAlertsSection from '@/components/consultoria/OtherAlertsSection';
import ConsultoriaStudentSearch from '@/components/consultoria/ConsultoriaStudentSearch';
import AllExecutionVideos from '@/components/consultoria/AllExecutionVideos';
import PushNotificationsToday from '@/components/consultoria/PushNotificationsToday';

const CYCLE_MIN_DAYS = 35;
const CYCLE_MAX_DAYS = 45;

type CycleStatus = 'ok' | 'atencao' | 'vencido';

const getCycleInfo = (dateStr: string | null) => {
  if (!dateStr) return { days: 0, remaining: 0, status: 'vencido' as const, progress: 100 };
  const days = differenceInDays(new Date(), new Date(dateStr));
  const remaining = Math.max(0, CYCLE_MAX_DAYS - days);
  let status: CycleStatus = 'ok';
  if (days >= CYCLE_MAX_DAYS) status = 'vencido';
  else if (days >= CYCLE_MIN_DAYS) status = 'atencao';
  const progress = Math.min(100, (days / CYCLE_MAX_DAYS) * 100);
  return { days, remaining, status, progress };
};

const CycleStatusBadge: React.FC<{ status: CycleStatus; remaining: number }> = ({ status, remaining }) => {
  if (status === 'vencido') return <Badge variant="destructive" className="text-[10px]">Vencido</Badge>;
  if (status === 'atencao') return <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500 border-orange-500/30">⚠ {remaining}d restantes</Badge>;
  return <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">{remaining}d restantes</Badge>;
};

const Consultoria: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('alertas');
  const [alertFilter, setAlertFilter] = useState<FollowupFilter>('hoje');
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const { summaries: weeklySummaries = [], loading: weeklyLoading, reload: reloadWeekly } = useStudentsWeeklySummary();
  const { alerts: behavioralAlerts, loading: behavioralLoading, generate: generateBehavioral, generating: behavioralGenerating, updateStatus: updateBehavioralStatus, reload: refreshBehavioral } = useBehavioralAlerts();
  const { notifications, loading: notifLoading, refresh: refreshNotifs, dismissNotification } = useNotifications();
  const { followups, loading: followupsLoading, reload: reloadFollowups, markAsDone, reopen, archive } = useStudentFollowups();
  const { data: progressionReviews, isLoading: progressionLoading, refetch: reloadProgression } = useWeeklyProgressionReview();
  const { students: inactiveStudents, loading: inactiveLoading, reload: reloadInactive } = useInactiveStudents(3);

  const loadPlans = async () => {
    setLoadingPlans(true);
    const { data } = await supabase
      .from('ai_plans')
      .select('student_id, tipo, created_at, is_draft')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });
    setPlans(data || []);
    setLoadingPlans(false);
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const studentPlansMap = useMemo(() => {
    const map = new Map<string, { latestDieta: string | null, latestTreino: string | null, totalDietas: number, totalTreinos: number }>();
    plans.forEach(p => {
      if (!map.has(p.student_id)) {
        map.set(p.student_id, { latestDieta: null, latestTreino: null, totalDietas: 0, totalTreinos: 0 });
      }
      const data = map.get(p.student_id)!;
      if (p.tipo === 'dieta') {
        data.totalDietas++;
        if (!data.latestDieta) data.latestDieta = p.created_at;
      } else if (p.tipo === 'treino') {
        data.totalTreinos++;
        if (!data.latestTreino) data.latestTreino = p.created_at;
      }
    });
    return map;
  }, [plans]);

  const stats = useMemo(() => {
    const totalStudents = weeklySummaries.length;
    const semDieta = weeklySummaries.filter(s => !studentPlansMap.get(s.studentId)?.latestDieta).length;
    const semTreino = weeklySummaries.filter(s => !studentPlansMap.get(s.studentId)?.latestTreino).length;
    
    let dietasVencidas = 0;
    let treinosVencidas = 0;
    studentPlansMap.forEach(d => {
      if (getCycleInfo(d.latestDieta).status === 'vencido') dietasVencidas++;
      if (getCycleInfo(d.latestTreino).status === 'vencido') treinosVencidas++;
    });

    return { totalStudents, semDieta, semTreino, dietasVencidas, treinosVencidas };
  }, [weeklySummaries, studentPlansMap]);

  return (
    <AppLayout title="Consultoria">
      <div className="max-w-6xl mx-auto space-y-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="overflow-x-auto w-full mb-6 no-scrollbar">
            <TabsList className="inline-flex w-max h-auto p-1 bg-secondary/50 rounded-xl border border-border/50">
              <TabsTrigger value="dashboard" className="px-4 py-2 text-xs gap-2"><LayoutDashboard className="h-3.5 w-3.5" /> Dashboard</TabsTrigger>
              <TabsTrigger value="alertas" className="px-4 py-2 text-xs gap-2"><AlertCircle className="h-3.5 w-3.5" /> Alertas</TabsTrigger>
              <TabsTrigger value="estudantes" className="px-4 py-2 text-xs gap-2"><Users className="h-3.5 w-3.5" /> Alunos</TabsTrigger>
              <TabsTrigger value="dietas" className="px-4 py-2 text-xs gap-2"><UtensilsCrossed className="h-3.5 w-3.5" /> Dietas</TabsTrigger>
              <TabsTrigger value="treinos" className="px-4 py-2 text-xs gap-2"><Dumbbell className="h-3.5 w-3.5" /> Treinos</TabsTrigger>
              <TabsTrigger value="fichas" className="px-4 py-2 text-xs gap-2"><ClipboardList className="h-3.5 w-3.5" /> Fichas</TabsTrigger>
              <TabsTrigger value="videos" className="px-4 py-2 text-xs gap-2"><Video className="h-3.5 w-3.5" /> Vídeos</TabsTrigger>
              <TabsTrigger value="notificacoes" className="px-4 py-2 text-xs gap-2"><Bell className="h-3.5 w-3.5" /> Notificações</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-6">
            <EngagementOverviewCards />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-card">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <UtensilsCrossed className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Sem Dieta</p>
                    <p className="text-2xl font-bold">{stats.semDieta}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Dumbbell className="h-6 w-6 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Sem Treino</p>
                    <p className="text-2xl font-bold">{stats.semTreino}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Dietas Vencidas</p>
                    <p className="text-2xl font-bold">{stats.dietasVencidas}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Treinos Vencidos</p>
                    <p className="text-2xl font-bold">{stats.treinosVencidas}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alertas" className="mt-6 space-y-6">
            {(() => {
              const relevant = weeklySummaries.filter((s) => s.attention !== 'ok');
              const withBucket = relevant
                .map((s) => ({ s, b: bucketFor(followups.get(s.studentId)) }))
                .filter((x) => x.b !== 'arquivado');
              
              const inactiveVisible = inactiveStudents.filter((s) => {
                const f = followups.get(s.studentId);
                if (bucketFor(f) === 'arquivado') return false;
                if (!f?.last_contacted_at) return true;
                const ref = Math.max(
                  new Date(f.last_contacted_at).getTime(),
                  s.lastActivity ? new Date(s.lastActivity).getTime() : 0,
                );
                return (Date.now() - ref) / 86400000 > 3;
              });

              const handleProgressionContact = async (studentId: string, planId: string) => {
                const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                const { data: { user } } = await supabase.auth.getUser();
                await supabase.from('weekly_progression_contacts').upsert({
                  student_id: studentId,
                  plan_id: planId,
                  week_start: format(weekStart, 'yyyy-MM-dd'),
                  admin_id: user?.id
                } as any);


                reloadProgression();
              };

              const counts = {
                hoje: withBucket.filter((x) => x.b === 'hoje').length,
                falados: withBucket.filter((x) => x.b === 'falados').length,
                espera: withBucket.filter((x) => x.b === 'espera').length,
                inativos: inactiveVisible.length,
                progressao: progressionReviews?.filter(r => r.hasPendingReview).length || 0,
              };

              const filtered = withBucket.filter((x) => x.b === alertFilter).map((x) => x.s);

              return (
                <div className="space-y-4">
                  <WeeklyAlertOverviewCards
                    counts={counts}
                    active={alertFilter}
                    onChange={setAlertFilter}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">
                        {alertFilter === 'hoje' && 'Para falar hoje'}
                        {alertFilter === 'falados' && 'Já falados hoje'}
                        {alertFilter === 'espera' && 'Voltam depois'}
                        {alertFilter === 'inativos' && 'Inativos há mais de 3 dias'}
                        {alertFilter === 'progressao' && 'Análise de Progressão Semanal'}
                      </h3>
                      <Badge variant="outline" className="text-[10px]">
                        {alertFilter === 'inativos' ? inactiveVisible.length : 
                         alertFilter === 'progressao' ? (progressionReviews?.length || 0) : 
                         filtered.length}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { refreshNotifs(); generateBehavioral(); reloadWeekly(); reloadFollowups(); reloadProgression(); reloadInactive(); }}
                      disabled={notifLoading || behavioralGenerating || weeklyLoading || followupsLoading || progressionLoading || inactiveLoading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${(notifLoading || behavioralGenerating || weeklyLoading || followupsLoading || progressionLoading || inactiveLoading) ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>

                  {alertFilter === 'progressao' ? (
                    progressionLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-32 w-full rounded-lg" />
                        <Skeleton className="h-32 w-full rounded-lg" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {progressionReviews?.map((r) => (
                          <WeeklyProgressionReviewCard 
                            key={r.studentId} 
                            review={r} 
                            onContacted={handleProgressionContact}
                          />
                        ))}
                        {progressionReviews?.length === 0 && (
                          <Card>
                            <CardContent className="py-6 text-center text-xs text-muted-foreground">
                              Nenhuma sugestão de progressão pendente.
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )
                  ) : alertFilter === 'inativos' ? (
                    inactiveLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-24 w-full rounded-lg" />
                      </div>
                    ) : inactiveVisible.length === 0 ? (
                      <Card>
                        <CardContent className="py-6 text-center text-xs text-muted-foreground">
                          Nenhum aluno inativo há mais de 3 dias 🎉
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {inactiveVisible.map((s) => (
                          <InactiveStudentCard
                            key={s.studentId}
                            student={s}
                            onArchive={archive}
                            onContacted={(id) => markAsDone(id, '3d')}
                          />
                        ))}
                      </div>
                    )
                  ) : filtered.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center text-xs text-muted-foreground">
                        Nenhum aluno nesta categoria agora 🎉
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((s) => (
                        <StudentWeeklyCard
                          key={s.studentId}
                          summary={s}
                          followup={followups.get(s.studentId)}
                          onMarkDone={markAsDone}
                          onReopen={reopen}
                          onArchive={archive}
                        />
                      ))}
                    </div>
                  )}

                  <OtherAlertsSection
                    notifications={notifications}
                    behavioralAlerts={behavioralAlerts}
                    onDismiss={dismissNotification}
                    onUpdateBehavioral={updateBehavioralStatus}
                  />
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="estudantes" className="mt-6">
            <ConsultoriaStudentSearch />
          </TabsContent>

          <TabsContent value="dietas" className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ciclo de Dietas (45 dias)</h3>
            <div className="space-y-2">
              {loadingPlans ? <Skeleton className="h-20 w-full" /> : 
                weeklySummaries.filter(s => s.active).map(s => {

                  const d = studentPlansMap.get(s.studentId);
                  if (!d?.latestDieta) return null;
                  const cycle = getCycleInfo(d.latestDieta);
                  return (
                    <Card key={s.studentId} className="glass-card hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/alunos/${s.studentId}?tab=dietas`)}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{s.studentName}</h4>
                            <p className="text-[10px] text-muted-foreground">Última: {format(new Date(d.latestDieta), 'dd/MM/yy')} · {d.totalDietas} dietas</p>
                          </div>
                          <CycleStatusBadge status={cycle.status} remaining={cycle.remaining} />
                        </div>
                        <Progress value={cycle.progress} className={cn("h-1.5", cycle.status === 'vencido' ? "bg-destructive/20" : cycle.status === 'atencao' ? "bg-orange-500/20" : "bg-emerald-500/20")} />

                        <p className="text-[10px] text-right text-muted-foreground">{cycle.days}d / 45d</p>
                      </CardContent>
                    </Card>
                  );
                })
              }
            </div>
          </TabsContent>

          <TabsContent value="treinos" className="mt-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ciclo de Treinos (45 dias)</h3>
            <div className="space-y-2">
              {loadingPlans ? <Skeleton className="h-20 w-full" /> : 
                weeklySummaries.map(s => {
                  const d = studentPlansMap.get(s.studentId);
                  if (!d?.latestTreino) return null;
                  const cycle = getCycleInfo(d.latestTreino);
                  return (
                    <Card key={s.studentId} className="glass-card hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/alunos/${s.studentId}?tab=treinos`)}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{s.studentName}</h4>
                            <p className="text-[10px] text-muted-foreground">Última: {format(new Date(d.latestTreino), 'dd/MM/yy')} · {d.totalTreinos} planos</p>
                          </div>
                          <CycleStatusBadge status={cycle.status} remaining={cycle.remaining} />
                        </div>
                        <Progress value={cycle.progress} className={cn("h-1.5", cycle.status === 'vencido' ? "bg-destructive/20" : cycle.status === 'atencao' ? "bg-orange-500/20" : "bg-emerald-500/20")} />
                        <p className="text-[10px] text-right text-muted-foreground">{cycle.days}d / 45d</p>
                      </CardContent>
                    </Card>
                  );
                })
              }
            </div>
          </TabsContent>

          <TabsContent value="fichas" className="mt-6">
            <div className="text-center py-10 text-muted-foreground italic text-sm">
              Fluxo de Fichas (Anamnese) em desenvolvimento para visualização em lote.
            </div>
          </TabsContent>

          <TabsContent value="videos" className="mt-6">
            <AllExecutionVideos />
          </TabsContent>

          <TabsContent value="notificacoes" className="mt-6">
            <PushNotificationsToday />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Consultoria;