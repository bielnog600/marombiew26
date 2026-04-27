import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, format } from 'date-fns';

export type NotificationType = 'reavaliacao' | 'aniversario' | 'mensagem_semanal' | 'sem_telefone' | 'sem_treino' | 'sem_dieta' | 'ficha_mensal';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  studentId: string;
  studentName: string;
  studentPhone?: string | null;
  date?: string;
  priority: 'high' | 'medium' | 'low';
  weeklyStats?: {
    workoutsCompleted: number;
    setsWithoutLoad: number;
    setsWithoutReps: number;
    setsWithoutRpe: number;
    avgWaterGlasses: number;
    daysWithMeals: number;
    weighedThisWeek: boolean;
    hasTreinoPlan: boolean;
    hasDietaPlan: boolean;
    totalSetsLogged: number;
    trackingDays: number;
    progression?: {
      tone: 'progress' | 'maintain' | 'caution';
      avgRpe: number;
      muscleLabel: string;
      summary: string;
    } | null;
  };
}

/**
 * Builds a WhatsApp URL detecting country code from the phone number.
 * Supports Brazil (+55) and Portugal (+351). If the number already starts
 * with a country code it is kept; otherwise we try to infer from length:
 *   - 10-11 digits → Brazil (55)
 *   - 9 digits → Portugal (351)
 * Falls back to raw number (no prefix) when unsure.
 */
export function buildWhatsAppUrl(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, '');

  let num = cleaned;

  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    // Already has Brazil code
    num = cleaned;
  } else if (cleaned.startsWith('351') && cleaned.length >= 12) {
    // Already has Portugal code
    num = cleaned;
  } else if (cleaned.length === 10 || cleaned.length === 11) {
    // Brazilian local number (DDD + 8-9 digits)
    num = `55${cleaned}`;
  } else if (cleaned.length === 9) {
    // Portuguese mobile number (9 digits)
    num = `351${cleaned}`;
  }
  // else: keep as-is (could be already formatted or another country)

  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Simple event bus so all hook instances stay in sync
const dismissListeners = new Set<(id: string) => void>();
const refreshListeners = new Set<() => void>();

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  // Listen for cross-instance dismiss events
  useEffect(() => {
    const onDismiss = (id: string) => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    };
    const onRefresh = () => { loadNotifications(); };
    dismissListeners.add(onDismiss);
    refreshListeners.add(onRefresh);
    return () => { dismissListeners.delete(onDismiss); refreshListeners.delete(onRefresh); };
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const currentMonth = getCurrentMonth();

      // Fetch dismissed notifications for this month
      const { data: dismissed } = await supabase
        .from('dismissed_notifications')
        .select('notification_key')
        .eq('dismissed_month', currentMonth);

      const dismissedSet = new Set<string>((dismissed ?? []).map(d => d.notification_key));
      setDismissedKeys(dismissedSet);

      // Fetch students with profiles
      const { data: students } = await supabase
        .from('students_profile')
        .select('id, user_id, data_nascimento, ativo')
        .eq('ativo', true);

      if (!students?.length) { setLoading(false); return; }

      const userIds = students.map(s => s.user_id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome, telefone')
        .in('user_id', userIds);

      // Get latest assessment per student
      const { data: assessments } = await supabase
        .from('assessments')
        .select('student_id, created_at')
        .in('student_id', userIds)
        .order('created_at', { ascending: false });

      // Get AI plans per student
      const { data: aiPlans } = await supabase
        .from('ai_plans')
        .select('student_id, tipo')
        .in('student_id', userIds);

      // Get all questionnaires per student (completed + pending)
      const { data: questionnaires } = await supabase
        .from('diet_questionnaires')
        .select('student_id, created_at, status')
        .in('student_id', userIds)
        .order('created_at', { ascending: false });

      // Weekly engagement data (last 7 days) — used by Saturday weekly message
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();
      const sevenDaysAgoDate = sevenDaysAgoISO.slice(0, 10);

      const isSaturday = today.getDay() === 6;

      // Build AI plans map early so weekly stats can use it
      const studentPlansMap = new Map<string, Set<string>>();
      aiPlans?.forEach(p => {
        if (!studentPlansMap.has(p.student_id)) {
          studentPlansMap.set(p.student_id, new Set());
        }
        studentPlansMap.get(p.student_id)!.add(p.tipo);
      });

      let weeklyStatsMap = new Map<string, NonNullable<Notification['weeklyStats']>>();

      // Janela "mesmo dia da semana passada" para sugestão de progressão diária
      const lastWeekSameDayStart = new Date(today);
      lastWeekSameDayStart.setDate(lastWeekSameDayStart.getDate() - 7);
      lastWeekSameDayStart.setHours(0, 0, 0, 0);
      const lastWeekSameDayEnd = new Date(lastWeekSameDayStart);
      lastWeekSameDayEnd.setHours(23, 59, 59, 999);
      const todayDateStr = today.toISOString().slice(0, 10);

      // Buscar logs/sessões da semana passada (mesmo dia) — sempre, p/ sugestão diária
      const eightDaysAgoISO = new Date(today.getTime() - 8 * 86400000).toISOString();
      const [lastWeekSessionsRes, lastWeekLogsRes, todaySessionsRes] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id, student_id, day_name, avg_rpe, completed_at')
          .in('student_id', userIds)
          .gte('completed_at', lastWeekSameDayStart.toISOString())
          .lte('completed_at', lastWeekSameDayEnd.toISOString()),
        supabase
          .from('exercise_set_logs')
          .select('student_id, session_id, muscle_group, exercise_name, weight_kg, reps, rpe, performed_at')
          .in('student_id', userIds)
          .gte('performed_at', eightDaysAgoISO),
        supabase
          .from('workout_sessions')
          .select('student_id, completed_at')
          .in('student_id', userIds)
          .gte('completed_at', `${todayDateStr}T00:00:00`),
      ]);

      const progressionMap = new Map<string, NonNullable<NonNullable<Notification['weeklyStats']>['progression']>>();
      for (const uid of userIds) {
        const alreadyToday = (todaySessionsRes.data ?? []).some(s => s.student_id === uid);
        if (alreadyToday) continue;
        // Só gera sugestão para alunos que possuem plano de treino ativo
        const hasTreino = studentPlansMap.get(uid)?.has('treino');
        if (!hasTreino) continue;

        const lwSession = (lastWeekSessionsRes.data ?? []).find(s => s.student_id === uid);
        const lwDateStr = lastWeekSameDayStart.toISOString().slice(0, 10);
        const lwLogs = lwSession
          ? (lastWeekLogsRes.data ?? []).filter(l => {
              if (l.student_id !== uid) return false;
              if (l.session_id && lwSession.id && l.session_id === lwSession.id) return true;
              return l.performed_at?.slice(0, 10) === lwDateStr;
            })
          : [];
        const rpes = lwLogs.map(l => Number(l.rpe)).filter(r => Number.isFinite(r) && r > 0);
        const avgRpe = rpes.length > 0
          ? rpes.reduce((a, b) => a + b, 0) / rpes.length
          : (lwSession?.avg_rpe ? Number(lwSession.avg_rpe) : NaN);

        // Determinar grupo muscular (preferir histórico; senão usar day_name da sessão; senão genérico)
        const muscleCounts: Record<string, number> = {};
        for (const l of lwLogs) {
          const m = (l.muscle_group || '').trim();
          if (m) muscleCounts[m] = (muscleCounts[m] || 0) + 1;
        }
        const topMuscles = Object.entries(muscleCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([m]) => m);
        const muscleLabel = topMuscles.length > 0
          ? topMuscles.join(' / ')
          : (lwSession?.day_name || 'treino de hoje');

        let tone: 'progress' | 'maintain' | 'caution' = 'maintain';
        let summary = '';
        let avgRpeOut = 0;

        if (Number.isFinite(avgRpe)) {
          avgRpeOut = Number((avgRpe as number).toFixed(1));
          if ((avgRpe as number) <= 7) {
            tone = 'progress';
            summary = `Semana passada esse treino teve RPE médio ${avgRpeOut} (folga). Sugerir +2,5 a 5 kg ou +1–2 reps nos principais.`;
          } else if ((avgRpe as number) >= 9) {
            tone = 'caution';
            summary = `RPE médio ${avgRpeOut} na semana passada (muito alto). Manter cargas e focar em técnica/recuperação.`;
          } else {
            tone = 'maintain';
            summary = `RPE médio ${avgRpeOut} na semana passada (zona ideal). Manter cargas ou +1 rep.`;
          }
        } else {
          // Sem histórico do mesmo dia da semana passada → dica preparatória genérica
          tone = 'progress';
          summary = `Sem histórico recente desse treino. Foque em ativação: aquecimento específico (1–2 séries leves), boa técnica e tente +1 rep ou pequena progressão de carga vs. a última vez.`;
        }

        progressionMap.set(uid, { tone, avgRpe: avgRpeOut, muscleLabel, summary });
      }

      if (isSaturday) {
        const [sessionsRes, setLogsRes, trackingRes, weightsRes] = await Promise.all([
          supabase
            .from('workout_sessions')
            .select('student_id, completed_at, status')
            .in('student_id', userIds)
            .gte('completed_at', sevenDaysAgoISO),
          supabase
            .from('exercise_set_logs')
            .select('student_id, weight_kg, reps, rpe, performed_at')
            .in('student_id', userIds)
            .gte('performed_at', sevenDaysAgoISO),
          supabase
            .from('daily_tracking')
            .select('student_id, date, water_glasses, meals_completed')
            .in('student_id', userIds)
            .gte('date', sevenDaysAgoDate),
          supabase
            .from('weight_logs')
            .select('student_id, data')
            .in('student_id', userIds)
            .gte('data', sevenDaysAgoDate),
        ]);

        for (const uid of userIds) {
          const sessions = (sessionsRes.data ?? []).filter(s => s.student_id === uid && s.status === 'completed');
          const logs = (setLogsRes.data ?? []).filter(l => l.student_id === uid);
          const tracking = (trackingRes.data ?? []).filter(t => t.student_id === uid);
          const weights = (weightsRes.data ?? []).filter(w => w.student_id === uid);

          const setsWithoutLoad = logs.filter(l => l.weight_kg == null || Number(l.weight_kg) === 0).length;
          const setsWithoutReps = logs.filter(l => l.reps == null || Number(l.reps) === 0).length;
          const setsWithoutRpe = logs.filter(l => l.rpe == null).length;

          const totalWater = tracking.reduce((sum, t) => sum + (t.water_glasses ?? 0), 0);
          const avgWaterGlasses = tracking.length > 0 ? Math.round(totalWater / tracking.length) : 0;
          const daysWithMeals = tracking.filter(t => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length;

          const studentPlanTypes = studentPlansMap.get(uid) ?? new Set<string>();

          weeklyStatsMap.set(uid, {
            workoutsCompleted: sessions.length,
            setsWithoutLoad,
            setsWithoutReps,
            setsWithoutRpe,
            avgWaterGlasses,
            daysWithMeals,
            weighedThisWeek: weights.length > 0,
            hasTreinoPlan: studentPlanTypes.has('treino'),
            hasDietaPlan: studentPlanTypes.has('dieta'),
            totalSetsLogged: logs.length,
            trackingDays: tracking.length,
            progression: progressionMap.get(uid) ?? null,
          });
        }
      }

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Build latest assessment map
      const latestAssessmentMap = new Map<string, string>();
      assessments?.forEach(a => {
        if (!latestAssessmentMap.has(a.student_id)) {
          latestAssessmentMap.set(a.student_id, a.created_at);
        }
      });

      // Build latest completed questionnaire map
      const latestQuestionnaireMap = new Map<string, string>();
      questionnaires?.forEach(q => {
        if (q.status === 'completed' && !latestQuestionnaireMap.has(q.student_id)) {
          latestQuestionnaireMap.set(q.student_id, q.created_at);
        }
      });

      // Build latest pending questionnaire map
      const latestPendingMap = new Map<string, string>();
      questionnaires?.forEach(q => {
        if (q.status === 'pending' && !latestPendingMap.has(q.student_id)) {
          latestPendingMap.set(q.student_id, q.created_at);
        }
      });

      const notifs: Notification[] = [];

      for (const student of students) {
        const profile = profileMap.get(student.user_id);
        const name = profile?.nome || 'Aluno';
        const phone = profile?.telefone;

        // 1. Missing phone alert
        if (!phone || phone.trim() === '') {
          notifs.push({
            id: `phone-${student.user_id}`,
            type: 'sem_telefone',
            title: 'Telefone não cadastrado',
            description: `${name} não possui número de telefone cadastrado. Adicione para enviar mensagens.`,
            studentId: student.user_id,
            studentName: name,
            studentPhone: null,
            priority: 'medium',
          });
        }

        // 2. Re-assessment alert (60 days)
        const lastAssessment = latestAssessmentMap.get(student.user_id);
        if (lastAssessment) {
          const daysSince = differenceInDays(today, parseISO(lastAssessment));
          if (daysSince >= 55) {
            notifs.push({
              id: `reav-${student.user_id}`,
              type: 'reavaliacao',
              title: daysSince >= 60 ? 'Reavaliação pendente' : 'Reavaliação próxima',
              description: `${name} — última avaliação há ${daysSince} dias (${format(parseISO(lastAssessment), 'dd/MM/yyyy')}).`,
              studentId: student.user_id,
              studentName: name,
              studentPhone: phone,
              date: lastAssessment,
              priority: daysSince >= 60 ? 'high' : 'medium',
            });
          }
        } else {
          notifs.push({
            id: `reav-never-${student.user_id}`,
            type: 'reavaliacao',
            title: 'Nunca avaliado',
            description: `${name} ainda não possui nenhuma avaliação registrada.`,
            studentId: student.user_id,
            studentName: name,
            studentPhone: phone,
            priority: 'high',
          });
        }

        // 3. Birthday alert
        if (student.data_nascimento) {
          const birth = parseISO(student.data_nascimento);
          const thisYearBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
          const daysUntil = differenceInDays(thisYearBirthday, today);

          if (daysUntil >= 0 && daysUntil <= 7) {
            notifs.push({
              id: `bday-${student.user_id}`,
              type: 'aniversario',
              title: daysUntil === 0 ? '🎂 Aniversário hoje!' : `🎂 Aniversário em ${daysUntil} dia${daysUntil > 1 ? 's' : ''}`,
              description: `${name} faz aniversário ${daysUntil === 0 ? 'hoje' : `em ${format(thisYearBirthday, 'dd/MM')}`}!`,
              studentId: student.user_id,
              studentName: name,
              studentPhone: phone,
              date: thisYearBirthday.toISOString(),
              priority: daysUntil === 0 ? 'high' : 'low',
            });
          }
        }

        // 4. Weekly message reminder (every Saturday) — personalized per student
        const progressionTip = progressionMap.get(student.user_id);
        if (isSaturday || progressionTip) {
          let stats = weeklyStatsMap.get(student.user_id);
          if (!stats && progressionTip) {
            const studentPlanTypes = studentPlansMap.get(student.user_id) ?? new Set<string>();
            stats = {
              workoutsCompleted: 0,
              setsWithoutLoad: 0,
              setsWithoutReps: 0,
              setsWithoutRpe: 0,
              avgWaterGlasses: 0,
              daysWithMeals: 0,
              weighedThisWeek: false,
              hasTreinoPlan: studentPlanTypes.has('treino'),
              hasDietaPlan: studentPlanTypes.has('dieta'),
              totalSetsLogged: 0,
              trackingDays: 0,
              progression: progressionTip,
            };
          }
          const baseDesc = stats && stats.workoutsCompleted > 0
            ? `${name} treinou ${stats.workoutsCompleted}x essa semana. Pergunte como foi e ajude com registros faltantes.`
            : `${name} sem treinos registrados essa semana. Mande um oi e veja se precisa de ajuda.`;
          const progDesc = progressionTip
            ? `Sugestão p/ hoje (${progressionTip.muscleLabel}): ${progressionTip.summary}`
            : null;
          notifs.push({
            id: isSaturday ? `weekly-${student.user_id}` : `weekly-prog-${student.user_id}-${todayDateStr}`,
            type: 'mensagem_semanal',
            title: progressionTip ? `Sugestão de progressão — ${progressionTip.muscleLabel}` : 'Mensagem semanal',
            description: progDesc ?? baseDesc,
            studentId: student.user_id,
            studentName: name,
            studentPhone: phone,
            priority: progressionTip ? 'medium' : 'low',
            weeklyStats: stats,
          });
        }

        // 5. Missing training plan
        const plans = studentPlansMap.get(student.user_id);
        if (!plans || !plans.has('treino')) {
          notifs.push({
            id: `no-treino-${student.user_id}`,
            type: 'sem_treino',
            title: 'Sem treino gerado',
            description: `${name} ainda não possui um plano de treino gerado pela IA.`,
            studentId: student.user_id,
            studentName: name,
            studentPhone: phone,
            priority: 'medium',
          });
        }

        // 6. Missing diet plan
        if (!plans || !plans.has('dieta')) {
          notifs.push({
            id: `no-dieta-${student.user_id}`,
            type: 'sem_dieta',
            title: 'Sem dieta gerada',
            description: `${name} ainda não possui um plano de dieta gerado pela IA.`,
            studentId: student.user_id,
            studentName: name,
            studentPhone: phone,
            priority: 'medium',
          });
        }

        // 7. Monthly questionnaire renewal
        const lastQ = latestQuestionnaireMap.get(student.user_id);
        const pendingQ = latestPendingMap.get(student.user_id);
        const daysSincePending = pendingQ ? differenceInDays(today, parseISO(pendingQ)) : null;

        // If there's a pending questionnaire sent less than 2 days ago, skip notification
        const hasFreshPending = daysSincePending !== null && daysSincePending < 2;

        if (!hasFreshPending) {
          // If pending exists but older than 2 days → remind to follow up
          if (daysSincePending !== null && daysSincePending >= 2) {
            notifs.push({
              id: `ficha-pend-${student.user_id}`,
              type: 'ficha_mensal',
              title: 'Ficha pendente sem resposta',
              description: `${name} — ficha enviada há ${daysSincePending} dias e ainda não respondeu. Envie um lembrete!`,
              studentId: student.user_id,
              studentName: name,
              studentPhone: phone,
              date: pendingQ,
              priority: daysSincePending >= 5 ? 'high' : 'medium',
            });
          } else if (lastQ) {
            const qDate = parseISO(lastQ);
            const daysSinceQ = differenceInDays(today, qDate);
            if (daysSinceQ >= 30) {
              notifs.push({
                id: `ficha-${student.user_id}`,
                type: 'ficha_mensal',
                title: 'Ficha alimentar desatualizada',
                description: `${name} — última ficha respondida há ${daysSinceQ} dias (${format(qDate, 'dd/MM/yyyy')}). Envie uma nova ficha.`,
                studentId: student.user_id,
                studentName: name,
                studentPhone: phone,
                date: lastQ,
                priority: daysSinceQ >= 40 ? 'high' : 'medium',
              });
            }
          } else {
            notifs.push({
              id: `ficha-never-${student.user_id}`,
              type: 'ficha_mensal',
              title: 'Sem ficha alimentar',
              description: `${name} nunca respondeu um questionário de dieta.`,
              studentId: student.user_id,
              studentName: name,
              studentPhone: phone,
              priority: 'medium',
            });
          }
        }
      }

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      notifs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      // Filter out dismissed notifications
      const activeNotifs = notifs.filter(n => !dismissedSet.has(n.id));

      setNotifications(activeNotifs);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    const currentMonth = getCurrentMonth();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('dismissed_notifications').upsert({
      user_id: user.id,
      notification_key: notificationId,
      dismissed_month: currentMonth,
    }, { onConflict: 'user_id,notification_key,dismissed_month' });

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setDismissedKeys(prev => { const next = new Set(Array.from(prev)); next.add(notificationId); return next; });

    // Notify all other hook instances
    dismissListeners.forEach(fn => fn(notificationId));
  };

  const count = notifications.length;
  const highPriorityCount = notifications.filter(n => n.priority === 'high').length;

  return { notifications, loading, count, highPriorityCount, refresh: loadNotifications, dismissNotification };
}
