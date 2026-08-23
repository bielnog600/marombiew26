import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Utensils, Dumbbell, ClipboardList, Users, Bell, MessageSquare, CalendarClock, Cake, Phone, AlertTriangle, RefreshCw, ExternalLink, X, UtensilsCrossed, Activity, Sparkles, Send, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications, NotificationType, buildWhatsAppUrl, Notification } from '@/hooks/useNotifications';
import { useBehavioralAlerts } from '@/hooks/useBehavioralAlerts';
import EngagementOverviewCards from '@/components/consultoria/EngagementOverviewCards';
import WeeklyAlertOverviewCards from '@/components/consultoria/WeeklyAlertOverviewCards';
import StudentWeeklyCard from '@/components/consultoria/StudentWeeklyCard';
import InactiveStudentCard from '@/components/consultoria/InactiveStudentCard';
import { useInactiveStudents } from '@/hooks/useInactiveStudents';
import type { FollowupFilter } from '@/components/consultoria/WeeklyAlertOverviewCards';
import OtherAlertsSection from '@/components/consultoria/OtherAlertsSection';
import { useStudentsWeeklySummary } from '@/hooks/useStudentsWeeklySummary';
import { useStudentFollowups, bucketFor, type FollowupBucket } from '@/hooks/useStudentFollowups';
import { useWeeklyProgressionReview } from '@/hooks/useWeeklyProgressionReview';
import WeeklyProgressionReviewCard from '@/components/consultoria/WeeklyProgressionReviewCard';
import ConsultoriaStudentSearch from '@/components/consultoria/ConsultoriaStudentSearch';
import PushNotificationsToday from '@/components/consultoria/PushNotificationsToday';
import AllExecutionVideos from '@/components/consultoria/AllExecutionVideos';

const CYCLE_MIN_DAYS = 35; // Pré-renovação aos 35d (faltam 10)
const CYCLE_MAX_DAYS = 45;

type CycleStatus = 'ok' | 'atencao' | 'vencido';

function getCycleInfo(dateStr: string | null): { days: number; remaining: number; status: CycleStatus; progress: number } {
  if (!dateStr) return { days: 0, remaining: 0, status: 'vencido', progress: 100 };
  const days = differenceInDays(new Date(), new Date(dateStr));
  const remaining = CYCLE_MAX_DAYS - days;
  let status: CycleStatus = 'ok';
  if (days >= CYCLE_MAX_DAYS) status = 'vencido';
  else if (days >= CYCLE_MIN_DAYS) status = 'atencao';
  const progress = Math.min(100, Math.round((days / CYCLE_MAX_DAYS) * 100));
  return { days, remaining, status, progress };
}

function cycleStatusBadge(status: CycleStatus, remaining: number) {
  switch (status) {
    case 'ok': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">{remaining}d restantes</Badge>;
    case 'atencao': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">⚠ {remaining > 0 ? `${remaining}d restantes` : 'Renovar'}</Badge>;
    case 'vencido': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Vencido</Badge>;
  }
}

function cycleProgressColor(status: CycleStatus) {
  switch (status) {
    case 'ok': return '[&>div]:bg-emerald-500';
    case 'atencao': return '[&>div]:bg-orange-500';
    case 'vencido': return '[&>div]:bg-destructive';
  }
}

const notifTypeConfig: Record<NotificationType, { icon: React.ElementType; label: string; color: string }> = {
  reavaliacao: { icon: CalendarClock, label: 'Reavaliação', color: 'text-orange-500' },
  aniversario: { icon: Cake, label: 'Aniversário', color: 'text-pink-500' },
  
  sem_telefone: { icon: Phone, label: 'Sem Telefone', color: 'text-red-500' },
  sem_treino: { icon: Dumbbell, label: 'Sem Treino', color: 'text-amber-500' },
  sem_dieta: { icon: UtensilsCrossed, label: 'Sem Dieta', color: 'text-emerald-500' },
  ficha_mensal: { icon: FileText, label: 'Ficha Mensal', color: 'text-violet-500' },
};

const priorityBadge: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  medium: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  low: 'bg-muted text-muted-foreground',
};

interface GroupedStudent {
  studentId: string;
  studentName: string;
  studentPhone?: string | null;
  notifications: Notification[];
  highestPriority: 'high' | 'medium' | 'low';
}

interface StudentSummary {
  userId: string;
  nome: string;
  email: string;
  telefone: string | null;
  totalDietas: number;
  totalTreinos: number;
  totalAvaliacoes: number;
  fichaStatus: 'respondida' | 'pendente' | 'sem_ficha';
  ultimaDieta: string | null;
  ultimoTreino: string | null;
  ultimaFicha: string | null;
}

const Consultoria = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ dietas: 0, treinos: 0, fichas: 0, fichasPendentes: 0, alunos: 0, dietasVencidas: 0, treinosVencidos: 0, migration: { completed: 0, pending: 0, failed: 0 } });
  const [tab, setTab] = useState('dashboard');
  const navigate = useNavigate();

  const { notifications, loading: notifLoading, count: notifCount, refresh: refreshNotifs, dismissNotification } = useNotifications();
  const { alerts: behavioralAlerts, loading: behavioralLoading, generating: behavioralGenerating, generate: generateBehavioral, updateStatus: updateBehavioralStatus } = useBehavioralAlerts();
  const [notifFilter, setNotifFilter] = useState('all');
  const { summaries: weeklySummaries, loading: weeklyLoading, reload: reloadWeekly } = useStudentsWeeklySummary();
  const { followups, loading: followupsLoading, reload: reloadFollowups, markAsDone, reopen, archive } = useStudentFollowups();
  const { data: progressionReviews, isLoading: progressionLoading, refetch: reloadProgression } = useWeeklyProgressionReview();
  const { students: inactiveStudents, loading: inactiveLoading, reload: reloadInactive } = useInactiveStudents(3);
  const [alertFilter, setAlertFilter] = useState<FollowupFilter>('hoje');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
    const allAlunoIds = (roles ?? []).map(r => r.user_id);
    if (allAlunoIds.length === 0) { setLoading(false); return; }
    // Considerar apenas alunos ativos (students_profile.ativo = true)
    const { data: activeProfiles } = await supabase
      .from('students_profile')
      .select('user_id')
      .eq('ativo', true)
      .in('user_id', allAlunoIds);
    const alunoIds = (activeProfiles ?? []).map(p => p.user_id);
    if (alunoIds.length === 0) { setLoading(false); return; }

    const [profilesRes, plansRes, assessmentsRes, questionnairesRes] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', alunoIds),
      supabase.from('ai_plans').select('student_id, tipo, created_at, migration_status').in('student_id', alunoIds).order('created_at', { ascending: false }),
      supabase.from('assessments').select('student_id, created_at').in('student_id', alunoIds),
      supabase.from('diet_questionnaires').select('student_id, status, created_at, responded_at').in('student_id', alunoIds).order('created_at', { ascending: false }),
    ]);

    const profiles = profilesRes.data ?? [];
    const plans = plansRes.data ?? [];
    const assessments = assessmentsRes.data ?? [];
    const questionnaires = questionnairesRes.data ?? [];

    let totalDietas = 0, totalTreinos = 0, totalFichas = 0, totalFichasPendentes = 0, dietasVencidas = 0, treinosVencidos = 0;
    let migrationStats = { completed: 0, pending: 0, failed: 0 };

    const summaries: StudentSummary[] = profiles.map(p => {
      const studentPlans = plans.filter(pl => pl.student_id === p.user_id);
      
      // Update migration stats based on most recent plans
      studentPlans.forEach(pl => {
        if (pl.migration_status === 'completed') migrationStats.completed++;
        else if (pl.migration_status === 'failed') migrationStats.failed++;
        else migrationStats.pending++;
      });

      const dietas = studentPlans.filter(pl => pl.tipo === 'dieta');
      const treinos = studentPlans.filter(pl => pl.tipo === 'treino');
      const studentAssessments = assessments.filter(a => a.student_id === p.user_id);
      const studentFichas = questionnaires.filter(q => q.student_id === p.user_id);
      const lastFicha = studentFichas[0];

      totalDietas += dietas.length;
      totalTreinos += treinos.length;
      totalFichas += studentFichas.length;
      if (lastFicha?.status === 'pending') totalFichasPendentes++;

      const dietaCycle = getCycleInfo(dietas[0]?.created_at ?? null);
      const treinoCycle = getCycleInfo(treinos[0]?.created_at ?? null);
      if (dietas.length > 0 && dietaCycle.status === 'vencido') dietasVencidas++;
      if (treinos.length > 0 && treinoCycle.status === 'vencido') treinosVencidos++;

      let fichaStatus: 'respondida' | 'pendente' | 'sem_ficha' = 'sem_ficha';
      if (lastFicha) fichaStatus = lastFicha.status === 'pending' ? 'pendente' : 'respondida';

      return {
        userId: p.user_id, nome: p.nome || 'Sem nome', email: p.email, telefone: p.telefone,
        totalDietas: dietas.length, totalTreinos: treinos.length, totalAvaliacoes: studentAssessments.length,
        fichaStatus, ultimaDieta: dietas[0]?.created_at ?? null, ultimoTreino: treinos[0]?.created_at ?? null, ultimaFicha: lastFicha?.created_at ?? null,
      };
    });

    setStudents(summaries.sort((a, b) => a.nome.localeCompare(b.nome)));
    setTotals({ dietas: totalDietas, treinos: totalTreinos, fichas: totalFichas, fichasPendentes: totalFichasPendentes, alunos: profiles.length, dietasVencidas, treinosVencidos, migration: migrationStats });
    setLoading(false);
  };

  const fmtDate = (d: string | null) => d ? format(new Date(d), "dd/MM/yy", { locale: ptBR }) : '—';

  const semDieta = students.filter(s => s.totalDietas === 0);
  const semTreino = students.filter(s => s.totalTreinos === 0);

  // Notifications filtering and grouping
  const filteredNotifs = notifFilter === 'all' ? notifications : notifications.filter(n => n.type === notifFilter);

  const groupedNotifs = useMemo(() => {
    const map = new Map<string, GroupedStudent>();
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    for (const n of filteredNotifs) {
      if (!map.has(n.studentId)) {
        map.set(n.studentId, {
          studentId: n.studentId,
          studentName: n.studentName,
          studentPhone: n.studentPhone,
          notifications: [],
          highestPriority: n.priority,
        });
      }
      const group = map.get(n.studentId)!;
      group.notifications.push(n);
      if (priorityOrder[n.priority] < priorityOrder[group.highestPriority]) {
        group.highestPriority = n.priority;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => priorityOrder[a.highestPriority] - priorityOrder[b.highestPriority]
    );
  }, [filteredNotifs]);

  const notifTabCounts = {
    all: notifCount,
    reavaliacao: notifications.filter(n => n.type === 'reavaliacao').length,
    aniversario: notifications.filter(n => n.type === 'aniversario').length,
    
    sem_telefone: notifications.filter(n => n.type === 'sem_telefone').length,
    sem_treino: notifications.filter(n => n.type === 'sem_treino').length,
    sem_dieta: notifications.filter(n => n.type === 'sem_dieta').length,
    ficha_mensal: notifications.filter(n => n.type === 'ficha_mensal').length,
  };

  // Variantes da mensagem semanal
  type WeeklyVariant = 'completa' | 'checkin' | 'registros' | 'motivacional';

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const getQuickMessage = (n: Notification, weeklyVariant: WeeklyVariant = 'completa') => {
    switch (n.type) {
      case 'reavaliacao':
        return `Olá ${n.studentName}! 😊 Está na hora da sua reavaliação. Vamos agendar? Entre em contato para marcarmos o melhor horário!`;
      case 'aniversario':
        return `Parabéns ${n.studentName}! 🎂🎉 Desejo tudo de melhor nesse novo ciclo! Continue firme nos treinos! 💪`;
