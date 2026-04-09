import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, format } from 'date-fns';

export type NotificationType = 'reavaliacao' | 'aniversario' | 'mensagem_semanal' | 'sem_telefone' | 'sem_treino' | 'sem_dieta';

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

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
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

      const dismissedSet = new Set((dismissed ?? []).map(d => d.notification_key));
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

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Build latest assessment map
      const latestAssessmentMap = new Map<string, string>();
      assessments?.forEach(a => {
        if (!latestAssessmentMap.has(a.student_id)) {
          latestAssessmentMap.set(a.student_id, a.created_at);
        }
      });

      // Build AI plans map
      const studentPlansMap = new Map<string, Set<string>>();
      aiPlans?.forEach(p => {
        if (!studentPlansMap.has(p.student_id)) {
          studentPlansMap.set(p.student_id, new Set());
        }
        studentPlansMap.get(p.student_id)!.add(p.tipo);
      });

      const today = new Date();
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

        // 4. Weekly message reminder (every Monday)
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 1) {
          notifs.push({
            id: `weekly-${student.user_id}`,
            type: 'mensagem_semanal',
            title: 'Mensagem semanal',
            description: `Envie uma mensagem de acompanhamento para ${name}.`,
            studentId: student.user_id,
            studentName: name,
            studentPhone: phone,
            priority: 'low',
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
      }

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      notifs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      setNotifications(notifs);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const count = notifications.length;
  const highPriorityCount = notifications.filter(n => n.priority === 'high').length;

  return { notifications, loading, count, highPriorityCount, refresh: loadNotifications };
}
