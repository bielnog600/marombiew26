import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import { resolveActiveWeek } from '@/lib/weeklyAdherence';
import { selectBestSet } from '@/lib/weeklyProgression';
import type { QuantitativeRecommendation } from '@/lib/quantitativeProgression';

export interface WeeklyProgressionReview {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planId: string;
  recommendations: {
    exerciseName: string;
    recommendation: QuantitativeRecommendation;
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

      // 1. Fetch active students with plans
      const { data: students, error: studentsError } = await supabase
        .from('students_profile')
        .select(`
          id,
          nome,
          telefone,
          ai_plans (
            id,
            workout_json,
            cycle_days,
            created_at
          )
        `)
        .eq('status', 'ativo');

      if (studentsError) throw studentsError;

      // 2. Fetch already contacted students this week
      const { data: contacted, error: contactedError } = await supabase
        .from('weekly_progression_contacts')
        .select('student_id')
        .eq('week_start_date', weekStartStr);

      if (contactedError) throw contactedError;
      const contactedIds = new Set(contacted.map(c => c.student_id));

      // 3. Fetch logs for these students (30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: allLogs, error: logsError } = await supabase
        .from('exercise_set_logs')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      const reviews: WeeklyProgressionReview[] = [];

      for (const student of students) {
        const activePlan = student.ai_plans?.[0];
        if (!activePlan || !activePlan.workout_json) continue;

        const workouts = (activePlan.workout_json as any).workouts || [];
        const studentLogs = allLogs.filter(l => l.student_id === student.id);
        
        const phase = resolveActiveWeek(activePlan as any, now);
        if (phase.phase === 'S4') continue; // Skip deload for proactive review

        const recs: { exerciseName: string; recommendation: QuantitativeRecommendation }[] = [];

        for (const workout of workouts) {
          for (const exercise of workout.exercises || []) {
            const exerciseLogs = studentLogs.filter(l => l.exercise_name === exercise.name);
            if (exerciseLogs.length === 0) continue;

            const bestSet = selectBestSet(exerciseLogs);
            if (!bestSet) continue;

            const recommendation = buildQuantitativeProgressionRecommendation({
              performance: {
                weight: bestSet.peso,
                reps: bestSet.reps,
                rir: bestSet.rir ?? undefined,
                repRange: exercise.reps ? { min: parseInt(exercise.reps.split('-')[0]), max: parseInt(exercise.reps.split('-')[1]) } : undefined
              },
              config: {
                isBodyweight: exercise.load_type === 'bodyweight',
                increment: 0 // Will use internal defaults
              }
            });

            if (recommendation.nextAction === 'increase_load' || recommendation.nextAction === 'increase_reps') {
              recs.push({
                exerciseName: exercise.name,
                recommendation
              });
            }
          }
        }

        if (recs.length > 0) {
          reviews.push({
            studentId: student.id,
            studentName: student.nome || 'Aluno',
            studentPhone: student.telefone,
            planId: activePlan.id,
            recommendations: recs,
            hasPendingReview: !contactedIds.has(student.id)
          });
        }
      }

      return reviews;
    }
  });
};
