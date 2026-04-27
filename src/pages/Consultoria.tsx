import React, { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Utensils, Dumbbell, ClipboardList, Users, Bell, MessageSquare, CalendarClock, Cake, Phone, AlertTriangle, RefreshCw, ExternalLink, X, UtensilsCrossed, Activity, Sparkles } from 'lucide-react';
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
import BehavioralAlertCard from '@/components/consultoria/BehavioralAlertCard';
import EngagementOverviewCards from '@/components/consultoria/EngagementOverviewCards';
import ConsultoriaStudentSearch from '@/components/consultoria/ConsultoriaStudentSearch';
import DietRenewalPanel from '@/components/consultoria/DietRenewalPanel';
import WorkoutRenewalPanel from '@/components/consultoria/WorkoutRenewalPanel';

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
  const [tab, setTab] = useState('dashboard');
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

  // Variantes da mensagem semanal
  type WeeklyVariant = 'completa' | 'checkin' | 'registros' | 'motivacional' | 'sugestao_dia';

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const getQuickMessage = (n: Notification, weeklyVariant: WeeklyVariant = 'completa') => {
    switch (n.type) {
      case 'reavaliacao':
        return `Olá ${n.studentName}! 😊 Está na hora da sua reavaliação. Vamos agendar? Entre em contato para marcarmos o melhor horário!`;
      case 'aniversario':
        return `Parabéns ${n.studentName}! 🎂🎉 Desejo tudo de melhor nesse novo ciclo! Continue firme nos treinos! 💪`;
      case 'mensagem_semanal': {
        const firstName = (n.studentName ?? 'aluno').split(' ')[0];
        const s = n.weeklyStats;
        const hasTreino = s?.hasTreinoPlan ?? false;
        const hasDieta = s?.hasDietaPlan ?? false;
        const treinouAlgo = (s?.workoutsCompleted ?? 0) > 0;
        const registrouSets = (s?.totalSetsLogged ?? 0) > 0;
        const usouTracking = (s?.trackingDays ?? 0) > 0;

        // ============================================================
        // VARIANTE: SUGESTÃO DO DIA (antes de treinar — progressão de carga)
        // ============================================================
        if (weeklyVariant === 'sugestao_dia') {
          const prog = s?.progression;
          const saud = pick([
            `Oi ${firstName}! 💪`,
            `E aí ${firstName}, bora treinar? 🔥`,
            `Fala ${firstName}! Antes do treino de hoje 👇`,
          ]);

          if (!prog) {
            return `${saud}\n\nDica pro treino de hoje: foca em ativação — aquecimento específico (1–2 séries leves), capricha na técnica e tenta *+1 rep* ou um pouquinho mais de carga vs. a última vez. Bora! 🚀`;
          }

          const exs = prog.topExercises ?? [];
          const exemplos = exs
            .map((e) => {
              const w = e.weight ? `*${e.weight}kg*` : '';
              const r = e.reps ? `*${e.reps} reps*` : '';
              const detalhe = [w, r].filter(Boolean).join(' x ');
              return detalhe ? `• ${e.name} — semana passada: ${detalhe}${e.rpe ? ` (RPE ${e.rpe})` : ''}` : null;
            })
            .filter(Boolean)
            .join('\n');

          let sugestao = '';
          if (prog.avgRpe === 0) {
            sugestao = `Hoje é *${prog.muscleLabel}* — sem histórico recente desse treino. Vai com calma no aquecimento, capricha na técnica e tenta *+1 rep* ou pequena progressão de carga vs. a última vez.`;
          } else if (prog.tone === 'progress') {
            sugestao = `Hoje é *${prog.muscleLabel}*. Semana passada esse treino ficou com RPE médio *${prog.avgRpe}* (folga 👀). Bora subir: *+2,5 a 5 kg* ou *+1–2 reps* nos principais. Se a carga subir e travar, tudo bem — usa *rest-pause* (descansa 10–15s e tenta mais 2–3 reps) ou *drop-set* na última série.`;
          } else if (prog.tone === 'caution') {
            sugestao = `Hoje é *${prog.muscleLabel}*. Semana passada ficou bem puxado (RPE *${prog.avgRpe}*). Vamos *manter as cargas* e focar em técnica e cadência (3s na descida). Sem se cobrar.`;
          } else {
            sugestao = `Hoje é *${prog.muscleLabel}*. Semana passada ficou em zona ideal (RPE *${prog.avgRpe}*). Pode manter as cargas ou tentar *+1 rep* nos principais. Se sobrar gás, fecha com uma *série até a falha técnica*.`;
          }

          const fecho = pick([
            `Anota como sentir cada exercício pra eu ajustar a próxima semana. Bora! 🚀`,
            `Qualquer dor ou desconforto, recua e me avisa. Bom treino! 💪`,
            `Se precisar de ajuste no meio do treino, me chama. Manda ver! 🔥`,
          ]);

          return exemplos
            ? `${saud}\n\n${sugestao}\n\n📊 *Referências da semana passada:*\n${exemplos}\n\n${fecho}`
            : `${saud}\n\n${sugestao}\n\n${fecho}`;
        }

        // ============================================================
        // VARIANTE: APENAS CHECK-IN (como foi a semana, sem nada mais)
        // ============================================================
        if (weeklyVariant === 'checkin') {
          const saudacoes = [
            `Oi ${firstName}, tudo certo por aí? 😊`,
            `E aí ${firstName}, beleza? 🙌`,
            `Oi ${firstName}! Passando rapidinho 👋`,
            `Fala ${firstName}, tudo bem contigo? 😄`,
          ];
          const perguntasGerais = [
            `Só queria saber: como foi a semana pra você?`,
            `Conta pra mim: como tá se sentindo essa semana?`,
            `Como foi sua semana? Bora fazer um check-in rapidinho.`,
            `Queria saber como você tá — semana foi tranquila ou pesada?`,
          ];
          const fechos = [
            `Sem cobrança nenhuma, tá? Só quero saber se tá tudo bem. Bom fim de semana! 🚀`,
            `Pode responder quando der, sem pressa. Bom descanso! 💙`,
            `Tô por aqui se precisar de qualquer coisa. Bom fim de semana! ✨`,
            `Qualquer coisa me chama, viu? Aproveita o fim de semana! 🙌`,
          ];
          return `${pick(saudacoes)}\n\n${pick(perguntasGerais)}\n\n${pick(fechos)}`;
        }

        // ============================================================
        // VARIANTE: APENAS REGISTROS FALTANTES (sem check-in geral)
        // ============================================================
        if (weeklyVariant === 'registros') {
          const tipsR: string[] = [];
          if (s) {
            if (hasTreino && registrouSets && s.setsWithoutLoad > 0) {
              tipsR.push('🏋️ *Cargas* — algumas séries ficaram sem o peso anotado.\n👉 *Treino de hoje → tocar no exercício → Carga (kg)*.');
            }
            if (hasTreino && registrouSets && s.setsWithoutReps > 0) {
              tipsR.push('🔢 *Repetições* — algumas séries ficaram sem reps.\n👉 *Treino de hoje → tocar no exercício → Reps*.');
            }
            if (hasTreino && treinouAlgo && s.setsWithoutRpe > 0) {
              tipsR.push('💪 *RPE* — ao terminar o treino aparece a tela pra marcar o esforço (1 a 10). É 1 toque.');
            }
            if (!s.weighedThisWeek) {
              tipsR.push('⚖️ *Pesagem* — consegue se pesar amanhã em jejum?\n👉 *Perfil → Meu Progresso → Registrar peso*.');
            }
            if (hasDieta && s.daysWithMeals < 3) {
              tipsR.push('🍽️ *Refeições* — marca como concluída quando comer.\n👉 *Home → Dieta de hoje → tocar na refeição*.');
            }
            if (hasDieta && usouTracking && s.avgWaterGlasses < 6) {
              tipsR.push('💧 *Água* — vai marcando os copos no dia.\n👉 *Home → card Água → +*.');
            }
          }
          if (tipsR.length === 0) {
            return `Oi ${firstName}! 🙌\n\nTá tudo em dia com seus registros essa semana — parabéns pelo capricho! Continua assim. 💪`;
          }
          const intros = [
            `Oi ${firstName}, tudo bem? 😊\n\nTô passando só pra te lembrar de uns registros que ajudam muito a ajustar seu plano:`,
            `E aí ${firstName}! 👋\n\nVi alguns registros que ficaram em branco essa semana. Quando der, dá uma olhadinha:`,
            `Oi ${firstName}! 🙌\n\nPra eu conseguir te ajudar melhor na próxima semana, se conseguir registrar:`,
          ];
          return `${pick(intros)}\n\n${tipsR.join('\n\n')}\n\nSem pressão — qualquer coisa me chama. 💙`;
        }

        // ============================================================
        // VARIANTE: MOTIVACIONAL (elogio + leve incentivo)
        // ============================================================
        if (weeklyVariant === 'motivacional') {
          const aberturas = [
            treinouAlgo
              ? `Oi ${firstName}! 🔥 Vi que você treinou *${s!.workoutsCompleted}x* essa semana — isso é resultado de constância, não de sorte. Tô orgulhoso(a)!`
              : `Oi ${firstName}! 💙 Sei que essa semana pode não ter saído como planejado, e tudo bem. O que importa é não desistir.`,
            treinouAlgo
              ? `E aí ${firstName}! 🙌 *${s!.workoutsCompleted}* treino${s!.workoutsCompleted > 1 ? 's' : ''} essa semana — cada um deles te coloca um passo à frente. Manda muito!`
              : `E aí ${firstName}! 🌱 Toda semana é uma nova chance. A gente recomeça quantas vezes precisar — sem culpa.`,
          ];
          const fechos = [
            `Bora pra próxima semana com tudo? Tô aqui se precisar de qualquer ajuste. 🚀`,
            `Lembra: progresso é jornada, não corrida. Continua firme! 💪`,
            `Qualquer coisa me chama. Bom fim de semana! ✨`,
          ];
          return `${pick(aberturas)}\n\n${pick(fechos)}`;
        }

        // ============================================================
        // VARIANTE: COMPLETA (padrão atual — check-in + tips)
        // ============================================================
        const tips: string[] = [];
        if (s) {
          // === Bloco TREINO — só se tem plano de treino ===
          if (hasTreino && registrouSets && s.setsWithoutLoad > 0) {
            tips.push(
              '🏋️ *Cargas* — vi que algumas séries ficaram sem o peso anotado. ' +
              'Da próxima vez é só registrar enquanto treina.\n' +
              '👉 No app: *Treino de hoje → tocar no exercício → campo Carga (kg)*. ' +
              'Isso me ajuda a planejar a progressão certinha pra você.'
            );
          }
          if (hasTreino && registrouSets && s.setsWithoutReps > 0) {
            tips.push(
              '🔢 *Repetições* — algumas séries ficaram sem o número de reps.\n' +
              '👉 No app: *Treino de hoje → tocar no exercício → campo Reps*. ' +
              'Mesmo um número aproximado já me ajuda muito.'
            );
          }
          if (hasTreino && treinouAlgo && s.setsWithoutRpe > 0) {
            tips.push(
              '💪 *RPE (esforço de 1 a 10)* — ao terminar o treino aparece a tela pra marcar o quanto foi puxado. ' +
              'É 1 toque e me ajuda a ajustar a intensidade.'
            );
          }
          if (hasTreino && !treinouAlgo) {
            tips.push(
              '🏋️ *Treinos* — não vi treinos registrados essa semana. Tudo bem? ' +
              'Se rolou de treinar fora do app, me avisa que eu ajusto. ' +
              'Se algo travou (tempo, motivação, dor), me conta — a gente reorganiza junto.'
            );
          }

          // === Bloco PESAGEM — independente de treino/dieta ===
          if (!s.weighedThisWeek) {
            tips.push(
              '⚖️ *Pesagem* — consegue se pesar amanhã pela manhã, em jejum?\n' +
              '👉 No app: *Perfil → Meu Progresso → Registrar peso*. Leva 10 segundos.'
            );
          }

          // === Bloco DIETA — só se tem plano de dieta ===
          if (hasDieta && s.daysWithMeals < 3) {
            tips.push(
              '🍽️ *Refeições* — quando fizer cada refeição, é só marcar como concluída.\n' +
              '👉 No app: *Home → Dieta de hoje → tocar na refeição → Marcar como feita*. ' +
              'Não precisa ser perfeito.'
            );
          }
          if (hasDieta && usouTracking && s.avgWaterGlasses < 6) {
            tips.push(
              '💧 *Hidratação* — vai marcando os copos de água ao longo do dia.\n' +
              '👉 No app: *Home → card Água → tocar no copo +*.'
            );
          }
        }

        // Intro personalizada (variantes para diversidade)
        let intro: string;
        if (treinouAlgo) {
          intro = pick([
            `Vi aqui que você treinou *${s!.workoutsCompleted}x* essa semana — parabéns pelo compromisso! 🙌`,
            `Boa! *${s!.workoutsCompleted}* treino${s!.workoutsCompleted > 1 ? 's' : ''} essa semana. Constância é tudo. 💪`,
            `Caprichou — *${s!.workoutsCompleted}x* na academia essa semana. Tô orgulhoso(a)! 🔥`,
          ]);
        } else if (hasTreino) {
          intro = pick([
            `Tô passando pra saber como foi sua semana. 🙌`,
            `Queria fazer um check-in rapidinho com você. 😊`,
            `Passando aqui pra saber como você tá. 💙`,
          ]);
        } else {
          intro = pick([
            `Tô passando só pra dar um oi e saber como você tá. 🙌`,
            `Oi! Só um check-in pra saber como tá tudo. 😊`,
            `Passando pra saber como você tá essa semana. 💙`,
          ]);
        }

        // Pergunta personalizada conforme o que o aluno tem
        const perguntas: string[] = [];
        if (hasTreino) perguntas.push('algum exercício que travou ou pegou pesado');
        if (hasDieta) perguntas.push('fome fora de hora, alguma refeição difícil de encaixar');
        perguntas.push('sono, energia, humor');
        const perguntaTxt = perguntas.join(', ');

        const tipsBlock = tips.length > 0
          ? `\n\nPra eu te ajudar melhor na próxima semana, se conseguir:\n\n${tips.join('\n\n')}`
          : '';

        const prog = s?.progression;
        const progressionBlock = prog
          ? (prog.avgRpe === 0
              ? `\n\n🚀 *Sugestão pro treino de hoje (${prog.muscleLabel})*: foca em uma boa ativação — aquecimento específico (1–2 séries leves), capricha na técnica e tenta *+1 rep* ou pequena progressão de carga vs. a última vez. Anota como sentir cada exercício.`
              : prog.tone === 'progress'
              ? `\n\n🚀 *Sugestão pro treino de hoje (${prog.muscleLabel})*: na semana passada esse treino ficou com RPE médio *${prog.avgRpe}* (folga). Que tal subir *+2,5 a 5 kg* ou *+1–2 reps* nos principais exercícios pra ativar mais? Anota como sentir.`
              : prog.tone === 'caution'
                ? `\n\n⚠️ *Treino de hoje (${prog.muscleLabel})*: semana passada ficou bem puxado (RPE médio *${prog.avgRpe}*). Vamos *manter as cargas* e focar em técnica e execução. Sem se cobrar.`
                : `\n\n💪 *Treino de hoje (${prog.muscleLabel})*: semana passada ficou em zona ideal (RPE médio *${prog.avgRpe}*). Pode manter as cargas ou tentar *+1 rep* nos principais.`)
          : '';

        const saudacoesIniciais = [
          `Oi ${firstName}, tudo bem? 😊`,
          `E aí ${firstName}, beleza? 🙌`,
          `Fala ${firstName}, tudo certo? 😄`,
        ];
        const fechosFinais = [
          `Sem pressão e sem cobrança, tá? Tô aqui pra te ajudar. Bom fim de semana! 🚀`,
          `Qualquer coisa me chama. Bom descanso e bom fim de semana! 💙`,
          `Tô na torcida por você. Aproveita o fim de semana! ✨`,
        ];

        return (
          `${pick(saudacoesIniciais)}\n\n` +
          `${intro}\n\n` +
          `Como foi a semana pra você? Teve alguma dificuldade — ${perguntaTxt}? ` +
          `Me conta qualquer detalhe, ajuda muito a gente a ajustar.${progressionBlock}${tipsBlock}\n\n` +
          `${pick(fechosFinais)}`
        );
      }
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
      // Mensagem semanal: dropdown com variantes
      if (n.type === 'mensagem_semanal') {
        const phone = n.studentPhone;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10">
                <MessageSquare className="h-3 w-3 mr-1" />
                WhatsApp
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">Tipo de mensagem</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={buildWhatsAppUrl(phone, getQuickMessage(n, 'sugestao_dia'))} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">🚀 Sugestão do dia</span>
                    <span className="text-[10px] text-muted-foreground">Antes de treinar — carga, reps, técnica</span>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={buildWhatsAppUrl(phone, getQuickMessage(n, 'checkin'))} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">👋 Apenas check-in</span>
                    <span className="text-[10px] text-muted-foreground">"Como foi a semana?" — sem cobrança</span>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={buildWhatsAppUrl(phone, getQuickMessage(n, 'registros'))} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">📋 Registros faltantes</span>
                    <span className="text-[10px] text-muted-foreground">Lembrar de cargas, peso, refeições</span>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={buildWhatsAppUrl(phone, getQuickMessage(n, 'motivacional'))} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">🔥 Motivacional</span>
                    <span className="text-[10px] text-muted-foreground">Elogio + incentivo curto</span>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={buildWhatsAppUrl(phone, getQuickMessage(n, 'completa'))} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">✨ Completa</span>
                    <span className="text-[10px] text-muted-foreground">Check-in + perguntas + registros</span>
                  </div>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
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

  const totalAlerts = notifCount + behavioralAlerts.length;
  const dashboardCards = [
    { title: 'Alunos', value: totals.alunos, icon: Users, color: 'text-primary', onClick: () => setTab('alunos') },
    { title: 'Alertas ativos', value: totalAlerts, icon: Bell, color: 'text-orange-500', onClick: () => setTab('alertas') },
    { title: 'Sem dieta', value: semDieta.length, icon: Utensils, color: 'text-destructive', onClick: () => setTab('sem-dieta') },
    { title: 'Sem treino', value: semTreino.length, icon: Dumbbell, color: 'text-destructive', onClick: () => setTab('sem-treino') },
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
    { value: 'dashboard', label: 'Dashboard', icon: FileText, count: null },
    { value: 'alertas', label: 'Alertas', icon: Bell, count: totalAlerts || null },
    { value: 'alunos', label: 'Alunos', icon: Users, count: null },
    { value: 'dietas', label: 'Dietas', icon: Utensils, count: null },
    { value: 'treinos', label: 'Treinos', icon: Dumbbell, count: null },
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
        {tab === 'dashboard' && (
          <div className="space-y-4">
            {/* KPIs principais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dashboardCards.map(stat => (
                <Card
                  key={stat.title}
                  className="glass-card cursor-pointer hover:bg-secondary/40 transition-colors"
                  onClick={stat.onClick}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className={`rounded-xl p-2 bg-secondary ${stat.color}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                      <p className="text-xl font-bold">{loading ? '…' : stat.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bloco resumido de comportamento/aderência */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Comportamento de hoje</h3>
              </div>
              <EngagementOverviewCards />
            </div>
          </div>
        )}

        {tab === 'alertas' && (
          <div className="space-y-4">
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

        {tab === 'alunos' && (
          <ConsultoriaStudentSearch />
        )}

        {tab === 'dietas' && (
          <div className="space-y-4">
          <DietRenewalPanel />
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-5 w-5 text-emerald-500" />
                Ciclo de Dietas (45 dias)
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
          </div>
        )}

        {tab === 'treinos' && (
          <div className="space-y-4">
          <WorkoutRenewalPanel />
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
          </div>
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
