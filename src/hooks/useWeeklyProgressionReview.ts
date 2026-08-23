import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { selectBestSet } from '@/lib/weeklyProgression';
import { parseTrainingSections } from '@/lib/trainingResultParser';

export interface StudentProgressionReview {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planId: string | null;
  currentPhase: string;
  lastContactedAt: string | null;
  recommendations: {
    exerciseName: string;
    nextAction: 'increase_load' | 'increase_reps' | 'maintain';
    suggestedIncrement: number;
    recommendation: any;
  }[];
  hasPendingReview: boolean;
}

export const useWeeklyProgressionReview = () => {
  return useQuery({
    queryKey: ['weekly-progression-review'],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');

      const { data: students } = await supabase
        .from('students_profile')
        .select('user_id, ativo')
        .eq('ativo', true);

      if (!students || students.length === 0) return [];
      const studentIds = students.map(s => s.user_id);

      const [profilesRes, plansRes, contactsRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('user_id, nome, telefone').in('user_id', studentIds),
        supabase.from('ai_plans').select('*').in('student_id', studentIds).eq('is_draft', false).order('created_at', { ascending: false }),
        supabase.from('weekly_progression_contacts').select('*').in('student_id', studentIds),
        supabase.from('exercise_set_logs').select('*').in('student_id', studentIds).gte('performed_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('performed_at', { ascending: false })
      ]);

      const profileMap = new Map(profilesRes.data?.map(p => [p.user_id, p]) || []);
      const contactedIds = new Set(
        (contactsRes.data || [])
          .filter((c: any) => c.week_start_date === weekStartStr)
          .map((c: any) => c.student_id)
      );

      const reviews: StudentProgressionReview[] = [];

      for (const student of students) {
        const studentProfile = profileMap.get(student.user_id);
        const studentPlans = (plansRes.data || []).filter((p: any) => p.student_id === student.user_id);
        const activePlan = studentPlans[0];

        if (!activePlan || !activePlan.conteudo) continue;

        const studentLogs = (logsRes.data || []).filter((l: any) => l.student_id === student.user_id);
        const phaseResolution = resolveCurrentTrainingPhase(activePlan as any, now);
        
        // Corrigindo comparação de TrainingPhase
        if (String(phaseResolution.phase) === 'S4') continue;

        const parsed = parseTrainingSections(activePlan.conteudo);
        const exercises = parsed.flatMap(s => s.days || []).flatMap(d => d.exercises || []);
        
        const recs: any[] = [];

        for (const exercise of exercises) {
          const exerciseLogs = studentLogs.filter((l: any) => l.exercise_name === exercise.name);
          if (exerciseLogs.length === 0) continue;

          const bestSet = selectBestSet(exerciseLogs as any);
          if (!bestSet) continue;

          const recommendation = buildQuantitativeProgressionRecommendation({
            performance: {
              exerciseName: exercise.name,
              nextAction: 'maintain', // Placeholder, idealmente viria de buildWeeklyTrainingReport
              bestSet: {
                reps: bestSet.reps,
                weightKg: bestSet.weight_kg,
                rir: (bestSet as any).rir
              },
              status: 'ok'
            } as any,
            historyLogs: exerciseLogs as any,
            activePhase: phaseResolution.phase
          });

          const nextAction = recommendation.action === 'increase_load' ? 'increase_load' 
                          : recommendation.action === 'increase_reps' ? 'increase_reps' 
                          : 'maintain';

          if (nextAction !== 'maintain') {
            recs.push({
              exerciseName: exercise.name,
              nextAction,
              suggestedIncrement: recommendation.recommendedLoadKg ? (recommendation.recommendedLoadKg - (recommendation.currentLoadKg || 0)) : 0,
              recommendation
            });
          }
        }

        const lastContact = (contactsRes.data || [])
          .filter((c: any) => c.student_id === student.user_id)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (recs.length > 0) {
          reviews.push({
            studentId: student.user_id,
            studentName: studentProfile?.nome || 'Aluno',
            studentPhone: studentProfile?.telefone || null,
            planId: activePlan.id,
            currentPhase: phaseResolution.phase,
            lastContactedAt: lastContact?.created_at || null,
            recommendations: recs,
            hasPendingReview: !contactedIds.has(student.user_id)
          });
        }
      }

      return reviews.sort((a, b) => {
        if (a.hasPendingReview && !b.hasPendingReview) return -1;
        if (!a.hasPendingReview && b.hasPendingReview) return 1;
        return a.studentName.localeCompare(b.studentName);
      });
    }
  });
};
