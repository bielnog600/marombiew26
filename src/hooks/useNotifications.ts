import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, format } from 'date-fns';
import { normalizeWhatsAppPhone } from '@/lib/phone';

export type NotificationType = 'reavaliacao' | 'aniversario' | 'sem_telefone' | 'sem_treino' | 'sem_dieta' | 'ficha_mensal';

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
    avgWaterGlasses: number;
    daysWithMeals: number;
    weighedThisWeek: boolean;
    hasTreinoPlan: boolean;
    hasDietaPlan: boolean;
    totalSetsLogged: number;
    trackingDays: number;
    presencial?: boolean;
  };
}

export function buildWhatsAppUrl(phone: string, message: string) {
  const num = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const dismissListeners = new Set<(id: string) => void>();
const refreshListeners = new Set<() => void>();

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

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

      const { data: dismissed } = await supabase
        .from('dismissed_notifications')
        .select('notification_key')
        .eq('dismissed_month', currentMonth);

      const dismissedSet = new Set<string>((dismissed ?? []).map(d => d.notification_key));
      setDismissedKeys(dismissedSet);

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

      const { data: assessments } = await supabase
        .from('assessments')
        .select('student_id, created_at')
        .in('student_id', userIds)
        .order('created_at', { ascending: false });

      const { data: aiPlans } = await supabase
        .from('ai_plans')
        .select('student_id, tipo')
        .in('student_id', userIds);

      const { data: questionnaires } = await supabase
        .from('diet_questionnaires')
        .select('student_id, created_at, status')
        .in('student_id', userIds)
        .order('created_at', { ascending: false });

      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      const studentPlansMap = new Map<string, Set<string>>();
      aiPlans?.forEach(p => {
        if (!studentPlansMap.has(p.student_id)) {
          studentPlansMap.set(p.student_id, new Set());
        }
        studentPlansMap.get(p.student_id)!.add(p.tipo);
      });

      let weeklyStatsMap = new Map<string, NonNullable<Notification['weeklyStats']>>();

      if (today.getDay() === 6) {
        const [sessionsRes, setLogsRes, trackingRes, weightsRes] = await Promise.all([
          supabase
            .from('workout_sessions')
            .select('student_id, completed_at, status')
            .in('student_id', userIds)
            .gte('completed_at', sevenDaysAgoISO),
          supabase
            .from('exercise_set_logs')
            .select('student_id, weight_kg, reps, performed_at, source')
            .in('student_id', userIds)
            .gte('performed_at', sevenDaysAgoISO),
          supabase
            .from('daily_tracking')
            .select('student_id, date, water_glasses, meals_completed')
            .in('student_id', userIds)
            .gte('date', sevenDaysAgo.toISOString().slice(0, 10)),
          supabase
            .from('weight_logs')
            .select('student_id, data')
            .in('student_id', userIds)
            .gte('data', sevenDaysAgo.toISOString().slice(0, 10)),
        ]);

        for (const uid of userIds) {
          const sessions = (sessionsRes.data ?? []).filter(s => s.student_id === uid && s.status === 'completed');
          const logs = (setLogsRes.data ?? []).filter(l => l.student_id === uid);
          const tracking = (trackingRes.data ?? []).filter(t => t.student_id === uid);
          const weights = (weightsRes.data ?? []).filter(w => w.student_id === uid);

          const setsWithoutLoad = logs.filter(l => l.weight_kg == null || Number(l.weight_kg) === 0).length;
          const setsWithoutReps = logs.filter(l => l.reps == null || Number(l.reps) === 0).length;
          
          const totalWater = tracking.reduce((sum, t) => sum + (t.water_glasses ?? 0), 0);
          const avgWaterGlasses = tracking.length > 0 ? Math.round(totalWater / tracking.length) : 0;
          const daysWithMeals = tracking.filter(t => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length;

          const studentPlanTypes = studentPlansMap.get(uid) ?? new Set<string>();

          weeklyStatsMap.set(uid, {
            workoutsCompleted: sessions.length,
            setsWithoutLoad,
            setsWithoutReps,
            avgWaterGlasses,
            daysWithMeals,
            weighedThisWeek: weights.length > 0,
            hasTreinoPlan: studentPlanTypes.has('treino'),
            hasDietaPlan: studentPlanTypes.has('dieta'),
            totalSetsLogged: logs.length,
            trackingDays: tracking.length,
            presencial: (() => {
              const adminLogs = logs.filter((l: any) => l.source === 'admin').length;
              const studentLogs = logs.filter((l: any) => (l.source ?? 'student') !== 'admin').length;
              return adminLogs > 0 && studentLogs === 0;
            })(),
          });
        }
      }

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const latestAssessmentMap = new Map<string, string>();
      assessments?.forEach(a => { if (!latestAssessmentMap.has(a.student_id)) latestAssessmentMap.set(a.student_id, a.created_at); });
      const latestQuestionnaireMap = new Map<string, string>();
      questionnaires?.forEach(q => { if (q.status === 'completed' && !latestQuestionnaireMap.has(q.student_id)) latestQuestionnaireMap.set(q.student_id, q.created_at); });
      const latestPendingMap = new Map<string, string>();
      questionnaires?.forEach(q => { if (q.status === 'pending' && !latestPendingMap.has(q.student_id)) latestPendingMap.set(q.student_id, q.created_at); });

      const notifs: Notification[] = [];
      for (const student of students) {
        const profile = profileMap.get(student.user_id);
        const name = profile?.nome || 'Aluno';
        const phone = profile?.telefone;

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

        const lastQ = latestQuestionnaireMap.get(student.user_id);
        const pendingQ = latestPendingMap.get(student.user_id);
        const daysSincePending = pendingQ ? differenceInDays(today, parseISO(pendingQ)) : null;
        if (daysSincePending === null || daysSincePending >= 2) {
          if (daysSincePending !== null) {
            notifs.push({
              id: `ficha-pend-${student.user_id}`,
              type: 'ficha_mensal',
              title: 'Ficha pendente sem resposta',
              description: `${name} — ficha enviada há ${daysSincePending} dias.`,
              studentId: student.user_id,
              studentName: name,
              studentPhone: phone,
              date: pendingQ,
              priority: daysSincePending >= 5 ? 'high' : 'medium',
            });
          } else if (lastQ) {
            const daysSinceQ = differenceInDays(today, parseISO(lastQ));
            if (daysSinceQ >= 30) {
              notifs.push({
                id: `ficha-${student.user_id}`,
                type: 'ficha_mensal',
                title: 'Ficha alimentar desatualizada',
                description: `${name} — última ficha há ${daysSinceQ} dias.`,
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

      notifs.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      setNotifications(notifs.filter(n => !dismissedSet.has(n.id)));
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
    setDismissedKeys(prev => new Set(Array.from(prev)).add(notificationId));
  };

  const highPriorityCount = notifications.filter(n => n.priority === 'high').length;

  return { notifications, loading, count: notifications.length, highPriorityCount, refresh: loadNotifications, dismissNotification };
}
