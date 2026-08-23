import { useNavigate } from "react-router-dom";
import React, { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  RefreshCw, 
  Search,
  ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useStudentsWeeklySummary } from '@/hooks/useStudentsWeeklySummary';
import StudentWeeklyCard from '@/components/consultoria/StudentWeeklyCard';
import { useBehavioralAlerts } from '@/hooks/useBehavioralAlerts';
import OtherAlertsSection from '@/components/consultoria/OtherAlertsSection';
import { useNotifications } from '@/hooks/useNotifications';
import { useStudentFollowups, bucketFor } from '@/hooks/useStudentFollowups';
import InactiveStudentCard from '@/components/consultoria/InactiveStudentCard';
import WeeklyAlertOverviewCards, { type FollowupFilter } from '@/components/consultoria/WeeklyAlertOverviewCards';
import { useWeeklyProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import WeeklyProgressionReviewCard from '@/components/consultoria/WeeklyProgressionReviewCard';
import { startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useInactiveStudents } from '@/hooks/useInactiveStudents';

const Consultoria: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('alertas');
  const [searchTerm, setSearchTerm] = useState('');
  const [alertFilter, setAlertFilter] = useState<FollowupFilter>('hoje');

  const { summaries: weeklySummaries = [], loading: weeklyLoading, reload: reloadWeekly } = useStudentsWeeklySummary();
  const { alerts: behavioralAlerts, loading: behavioralLoading, refresh: refreshBehavioral, generate: generateBehavioral, generating: behavioralGenerating, updateStatus: updateBehavioralStatus } = useBehavioralAlerts();
  const { notifications, loading: notifLoading, refresh: refreshNotifs, dismissNotification } = useNotifications();
  const { followups, loading: followupsLoading, reload: reloadFollowups, markAsDone, reopen, archive } = useStudentFollowups();
  const { data: progressionReviews, isLoading: progressionLoading, refetch: reloadProgression } = useWeeklyProgressionReview();
  const { students: inactiveStudents, loading: inactiveLoading, reload: reloadInactive } = useInactiveStudents(3);

  return (
    <AppLayout title="Consultoria">
      <div className="max-w-6xl mx-auto space-y-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="alertas">Alertas e Follow-up</TabsTrigger>
            <TabsTrigger value="estudantes">Lista de Alunos</TabsTrigger>
          </TabsList>

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
                const { data: { user } } = await (supabase as any).auth.getUser();
                await (supabase as any).from('weekly_progression_contacts').upsert({
                  student_id: studentId,
                  plan_id: planId,
                  week_start_date: format(weekStart, 'yyyy-MM-dd'),
                  trainer_id: user?.id
                });
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

          <TabsContent value="estudantes" className="mt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar alunos..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              {weeklySummaries
                .filter(s => s.studentName.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(s => (
                  <Card key={s.studentId} className="glass-card hover:bg-secondary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {s.studentName[0]}
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{s.studentName}</h4>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/alunos/${s.studentId}`)}>
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Consultoria;
