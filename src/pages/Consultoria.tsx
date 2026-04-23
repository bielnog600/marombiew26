import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Utensils, Dumbbell, ClipboardList, Users, ChevronRight, Bell, MessageSquare, CalendarClock, Cake, Phone, AlertTriangle, RefreshCw, ExternalLink, X, UtensilsCrossed, Activity, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications, NotificationType, buildWhatsAppUrl, Notification } from '@/hooks/useNotifications';
import { useBehavioralAlerts } from '@/hooks/useBehavioralAlerts';
import BehavioralAlertCard from '@/components/consultoria/BehavioralAlertCard';
import EngagementOverviewCards from '@/components/consultoria/EngagementOverviewCards';
import ConsultoriaStudentSearch from '@/components/consultoria/ConsultoriaStudentSearch';

const CYCLE_MIN_DAYS = 28;
const CYCLE_MAX_DAYS = 42;

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
  mensagem_semanal: { icon: MessageSquare, label: 'Mensagem Semanal', color: 'text-blue-500' },
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
  const [totals, setTotals] = useState({ dietas: 0, treinos: 0, fichas: 0, fichasPendentes: 0, alunos: 0, dietasVencidas: 0, treinosVencidos: 0 });
  const [tab, setTab] = useState('alertas');
  const navigate = useNavigate();

  const { notifications, loading: notifLoading, count: notifCount, refresh: refreshNotifs, dismissNotification } = useNotifications();
  const { alerts: behavioralAlerts, loading: behavioralLoading, generating: behavioralGenerating, generate: generateBehavioral, updateStatus: updateBehavioralStatus } = useBehavioralAlerts();
  const [notifFilter, setNotifFilter] = useState('all');
  const [alertCategory, setAlertCategory] = useState<'todos' | 'operacional' | 'comportamental'>('todos');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
    const alunoIds = (roles ?? []).map(r => r.user_id);
    if (alunoIds.length === 0) { setLoading(false); return; }

    const [profilesRes, plansRes, assessmentsRes, questionnairesRes] = await Promise.all([
      supabase.from('profiles').select('*').in('user_id', alunoIds),
      supabase.from('ai_plans').select('student_id, tipo, created_at').in('student_id', alunoIds).order('created_at', { ascending: false }),
      supabase.from('assessments').select('student_id, created_at').in('student_id', alunoIds),
      supabase.from('diet_questionnaires').select('student_id, status, created_at, responded_at').in('student_id', alunoIds).order('created_at', { ascending: false }),
    ]);

    const profiles = profilesRes.data ?? [];
    const plans = plansRes.data ?? [];
    const assessments = assessmentsRes.data ?? [];
    const questionnaires = questionnairesRes.data ?? [];

    let totalDietas = 0, totalTreinos = 0, totalFichas = 0, totalFichasPendentes = 0, dietasVencidas = 0, treinosVencidos = 0;

    const summaries: StudentSummary[] = profiles.map(p => {
      const studentPlans = plans.filter(pl => pl.student_id === p.user_id);
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
    setTotals({ dietas: totalDietas, treinos: totalTreinos, fichas: totalFichas, fichasPendentes: totalFichasPendentes, alunos: profiles.length, dietasVencidas, treinosVencidos });
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
    mensagem_semanal: notifications.filter(n => n.type === 'mensagem_semanal').length,
    sem_telefone: notifications.filter(n => n.type === 'sem_telefone').length,
    sem_treino: notifications.filter(n => n.type === 'sem_treino').length,
    sem_dieta: notifications.filter(n => n.type === 'sem_dieta').length,
    ficha_mensal: notifications.filter(n => n.type === 'ficha_mensal').length,
  };

  const getQuickMessage = (n: Notification) => {
    switch (n.type) {
      case 'reavaliacao':
        return `Olá ${n.studentName}! 😊 Está na hora da sua reavaliação. Vamos agendar? Entre em contato para marcarmos o melhor horário!`;
      case 'aniversario':
        return `Parabéns ${n.studentName}! 🎂🎉 Desejo tudo de melhor nesse novo ciclo! Continue firme nos treinos! 💪`;
      case 'mensagem_semanal':
        return `Olá ${n.studentName}! Como foi a semana de treinos? Alguma dúvida ou feedback? Estou aqui para ajudar! 💪`;
      case 'ficha_mensal':
        return `Olá ${n.studentName}! 📋 Enviei uma ficha alimentar para você preencher. Pode responder quando puder? É rapidinho e vai me ajudar a montar seu plano! 💪`;
      default:
        return '';
    }
  };

  const renderNotifAction = (n: Notification) => {
    if (n.type === 'sem_telefone') {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos?edit=${n.studentId}`)}>
          <ExternalLink className="h-3 w-3 mr-1" />
          Editar cadastro
        </Button>
      );
    }
    if (n.type === 'sem_treino' || n.type === 'sem_dieta') {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${n.studentId}`)}>
          <ExternalLink className="h-3 w-3 mr-1" />
          {n.type === 'sem_treino' ? 'Gerar treino' : 'Gerar dieta'}
        </Button>
      );
    }
    if (n.type === 'aniversario') {
      if (n.studentPhone) {
        return (
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10" asChild>
            <a href={buildWhatsAppUrl(n.studentPhone, getQuickMessage(n))} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="h-3 w-3 mr-1" />
              Parabenizar
            </a>
          </Button>
        );
      }
      return (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Sem telefone
        </div>
      );
    }
    if (n.type === 'ficha_mensal') {
      if (n.id.startsWith('ficha-pend') && n.studentPhone) {
        return (
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10" asChild>
            <a href={buildWhatsAppUrl(n.studentPhone, getQuickMessage(n))} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="h-3 w-3 mr-1" />
              Lembrar
            </a>
          </Button>
        );
      }
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/alunos/${n.studentId}?tab=fichas`)}>
          <FileText className="h-3 w-3 mr-1" />
          Enviar ficha
        </Button>
      );
    }
    if (n.studentPhone) {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10" asChild>
          <a href={buildWhatsAppUrl(n.studentPhone, getQuickMessage(n))} target="_blank" rel="noopener noreferrer">
            <MessageSquare className="h-3 w-3 mr-1" />
            WhatsApp
          </a>
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Sem telefone
      </div>
    );
  };

  const statCards = [
    { title: 'Alunos', value: totals.alunos, icon: Users, color: 'text-primary' },
    { title: 'Alertas', value: notifCount, icon: Bell, color: 'text-orange-500' },
    { title: 'Sem Dieta', value: semDieta.length, icon: Utensils, color: 'text-destructive' },
    { title: 'Sem Treino', value: semTreino.length, icon: Dumbbell, color: 'text-destructive' },
  ];

  const fichaStatusBadge = (status: string) => {
    switch (status) {
      case 'respondida': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Respondida</Badge>;
      case 'pendente': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">Pendente</Badge>;
      default: return <Badge variant="outline" className="bg-muted text-muted-foreground">Sem ficha</Badge>;
    }
  };

  const renderPlanRow = (s: StudentSummary, tipo: 'dieta' | 'treino') => {
    const date = tipo === 'dieta' ? s.ultimaDieta : s.ultimoTreino;
    const total = tipo === 'dieta' ? s.totalDietas : s.totalTreinos;
    const cycle = getCycleInfo(date);
    const Icon = tipo === 'dieta' ? Utensils : Dumbbell;
    const iconColor = tipo === 'dieta' ? 'text-emerald-500' : 'text-blue-500';

    return (
      <div
        key={s.userId}
        className="p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
        onClick={() => navigate(`/alunos/${s.userId}?tab=ia`)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{s.nome}</p>
              <p className="text-xs text-muted-foreground">Última: {fmtDate(date)} · {total} {tipo}{total > 1 ? 's' : ''}</p>
            </div>
          </div>
          {cycleStatusBadge(cycle.status, cycle.remaining)}
        </div>
        <div className="flex items-center gap-2">
          <Progress value={cycle.progress} className={`h-1.5 flex-1 ${cycleProgressColor(cycle.status)}`} />
          <span className="text-[10px] text-muted-foreground w-14 text-right">
            {cycle.days}d / {CYCLE_MAX_DAYS}d
          </span>
        </div>
      </div>
    );
  };

  const mainTabs = [
    { value: 'alertas', label: 'Alertas', icon: Bell, count: notifCount },
    { value: 'overview', label: 'Visão Geral', icon: FileText, count: null },
    { value: 'alunos', label: 'Alunos', icon: Users, count: null },
    { value: 'dietas', label: 'Dietas', icon: Utensils, count: null },
    { value: 'treinos', label: 'Treinos', icon: Dumbbell, count: null },
    { value: 'sem-dieta', label: 'Sem Dieta', icon: Utensils, count: semDieta.length },
    { value: 'sem-treino', label: 'Sem Treino', icon: Dumbbell, count: semTreino.length },
    { value: 'fichas', label: 'Fichas', icon: ClipboardList, count: totals.fichasPendentes },
  ];

  const notifFilterTabs = [
    { value: 'all', label: 'Todos', count: notifTabCounts.all, icon: null },
    { value: 'reavaliacao', label: 'Reavaliação', count: notifTabCounts.reavaliacao, icon: CalendarClock },
    { value: 'aniversario', label: 'Aniversário', count: notifTabCounts.aniversario, icon: Cake },
    { value: 'mensagem_semanal', label: 'Semanal', count: notifTabCounts.mensagem_semanal, icon: MessageSquare },
    { value: 'sem_telefone', label: 'Sem Tel', count: notifTabCounts.sem_telefone, icon: Phone },
    { value: 'sem_treino', label: 'Sem Treino', count: notifTabCounts.sem_treino, icon: Dumbbell },
    { value: 'sem_dieta', label: 'Sem Dieta', count: notifTabCounts.sem_dieta, icon: UtensilsCrossed },
    { value: 'ficha_mensal', label: 'Ficha', count: notifTabCounts.ficha_mensal, icon: FileText },
  ];

  return (
    <AppLayout title="Consultoria">
      <div className="space-y-4 animate-fade-in">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(stat => (
            <Card key={stat.title} className="glass-card">
              <CardContent className="flex items-center gap-3 p-3">
                <div className={`rounded-xl p-2 bg-secondary ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{stat.title}</p>
                  <p className="text-xl font-bold">{loading ? '…' : stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main scrollable tabs */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
          <div className="flex gap-2 w-max">
            {mainTabs.map((t) => {
              const isActive = tab === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20'
                      : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.count !== null && t.count > 0 && (
                    <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        {tab === 'alertas' && (
          <div className="space-y-4">
            {/* Engagement overview cards */}
            <EngagementOverviewCards />

            {/* Category filter */}
            <div className="flex gap-2 flex-wrap items-center">
              {([
                { value: 'todos', label: 'Todos', count: notifCount + behavioralAlerts.length },
                { value: 'operacional', label: 'Operacionais', count: notifCount },
                { value: 'comportamental', label: 'Comportamentais', count: behavioralAlerts.length },
              ] as const).map((c) => {
                const isActive = alertCategory === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setAlertCategory(c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border ${
                      isActive
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
                    }`}
                  >
                    {c.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${isActive ? 'bg-background/20' : 'bg-muted'}`}>
                      {c.count}
                    </span>
                  </button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => { refreshNotifs(); generateBehavioral(); }}
                disabled={notifLoading || behavioralGenerating}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${(notifLoading || behavioralGenerating) ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {/* Behavioral alerts */}
            {(alertCategory === 'todos' || alertCategory === 'comportamental') && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Comportamentais & Engajamento</h3>
                </div>
                {behavioralLoading ? (
                  <Skeleton className="h-20 w-full rounded-lg" />
                ) : behavioralAlerts.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground text-sm">
                      Nenhum alerta comportamental ativo. Clique em "Atualizar" para gerar.
                    </CardContent>
                  </Card>
                ) : (
                  behavioralAlerts.map((a) => (
                    <BehavioralAlertCard key={a.id} alert={a} onUpdateStatus={updateBehavioralStatus} />
                  ))
                )}
              </div>
            )}

            {(alertCategory === 'todos' || alertCategory === 'operacional') && (
              <div className="flex items-center gap-2 pt-2">
                <Activity className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-semibold">Operacionais</h3>
              </div>
            )}
          </div>
        )}

        {tab === 'alertas' && (alertCategory === 'todos' || alertCategory === 'operacional') && (
          <div className="space-y-4 -mt-2">

            {/* Notification sub-filter tabs */}
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
              <div className="flex gap-2 w-max">
                {notifFilterTabs.map((t) => {
                  const isActive = notifFilter === t.value;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setNotifFilter(t.value)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-all border ${
                        isActive
                          ? 'bg-foreground/10 text-foreground border-foreground/20'
                          : 'bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/60'
                      }`}
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {t.label}
                      {t.count > 0 && (
                        <span className={`ml-0.5 rounded-full px-1 py-0.5 text-[9px] font-bold leading-none ${
                          isActive ? 'bg-foreground/10' : 'bg-muted'
                        }`}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notification cards */}
            <div className="space-y-3">
              {notifLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))
              ) : groupedNotifs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum alerta nesta categoria 🎉
                  </CardContent>
                </Card>
              ) : (
                groupedNotifs.map((group) => (
                  <Card key={group.studentId} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                          onClick={() => navigate(`/alunos/${group.studentId}`)}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-xs">
                            {group.studentName[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium text-sm">{group.studentName}</span>
                          <Badge variant="outline" className={`text-[10px] ${priorityBadge[group.highestPriority]}`}>
                            {group.notifications.length} alerta{group.notifications.length > 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => navigate(`/alunos/${group.studentId}`)}
                        >
                          Ver aluno
                        </Button>
                      </div>

                      <div className="space-y-2 pl-10">
                        {group.notifications.map((n) => {
                          const config = notifTypeConfig[n.type];
                          const Icon = config.icon;
                          return (
                            <div key={n.id} className="flex items-start sm:items-center gap-3 p-2 rounded-lg bg-secondary/30">
                              <Icon className={`h-4 w-4 shrink-0 mt-0.5 sm:mt-0 ${config.color}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">{n.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {renderNotifAction(n)}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => dismissNotification(n.id)}
                                  title="Dispensar até o próximo mês"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'overview' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Resumo por Aluno
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : students.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {students.map(s => {
                    const dietaCycle = getCycleInfo(s.ultimaDieta);
                    const treinoCycle = getCycleInfo(s.ultimoTreino);
                    return (
                      <div
                        key={s.userId}
                        className="p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                        onClick={() => navigate(`/alunos/${s.userId}?tab=ia`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm shrink-0">
                            {s.nome[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.nome}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                              {s.totalDietas > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  🍽 {s.totalDietas}
                                  <span className={`text-[10px] ${dietaCycle.status === 'vencido' ? 'text-destructive' : dietaCycle.status === 'atencao' ? 'text-orange-500' : 'text-emerald-500'}`}>
                                    ({dietaCycle.remaining > 0 ? `${dietaCycle.remaining}d` : 'vencida'})
                                  </span>
                                </span>
                              )}
                              {s.totalTreinos > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  🏋️ {s.totalTreinos}
                                  <span className={`text-[10px] ${treinoCycle.status === 'vencido' ? 'text-destructive' : treinoCycle.status === 'atencao' ? 'text-orange-500' : 'text-emerald-500'}`}>
                                    ({treinoCycle.remaining > 0 ? `${treinoCycle.remaining}d` : 'vencido'})
                                  </span>
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">📋 {s.totalAvaliacoes}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {fichaStatusBadge(s.fichaStatus)}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'alunos' && (
          <ConsultoriaStudentSearch />
        )}

        {tab === 'dietas' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-5 w-5 text-emerald-500" />
                Ciclo de Dietas (4-6 semanas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="space-y-2">
                  {students.filter(s => s.totalDietas > 0).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma dieta gerada ainda.</p>
                  ) : (
                    students.filter(s => s.totalDietas > 0)
                      .sort((a, b) => getCycleInfo(b.ultimaDieta).days - getCycleInfo(a.ultimaDieta).days)
                      .map(s => renderPlanRow(s, 'dieta'))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'treinos' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-blue-500" />
                Ciclo de Treinos (4-6 semanas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="space-y-2">
                  {students.filter(s => s.totalTreinos > 0).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum treino gerado ainda.</p>
                  ) : (
                    students.filter(s => s.totalTreinos > 0)
                      .sort((a, b) => getCycleInfo(b.ultimoTreino).days - getCycleInfo(a.ultimoTreino).days)
                      .map(s => renderPlanRow(s, 'treino'))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'sem-dieta' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-5 w-5 text-destructive" />
                Alunos Sem Dieta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : semDieta.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os alunos possuem dieta gerada. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {semDieta.map(s => (
                    <div
                      key={s.userId}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => navigate(`/alunos/${s.userId}?tab=ia`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Utensils className="h-4 w-4 text-destructive shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.nome}</p>
                          <p className="text-xs text-muted-foreground">Nenhuma dieta gerada</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Gerar dieta →</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'sem-treino' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-destructive" />
                Alunos Sem Treino
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : semTreino.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os alunos possuem treino gerado. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {semTreino.map(s => (
                    <div
                      key={s.userId}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => navigate(`/alunos/${s.userId}?tab=ia`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Dumbbell className="h-4 w-4 text-destructive shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.nome}</p>
                          <p className="text-xs text-muted-foreground">Nenhum treino gerado</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">Gerar treino →</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'fichas' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-orange-500" />
                Fichas (Questionários de Dieta)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="space-y-2">
                  {students.map(s => (
                    <div
                      key={s.userId}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => navigate(`/alunos/${s.userId}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ClipboardList className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.ultimaFicha ? `Enviada: ${fmtDate(s.ultimaFicha)}` : 'Nunca enviada'}
                          </p>
                        </div>
                      </div>
                      {fichaStatusBadge(s.fichaStatus)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Consultoria;
