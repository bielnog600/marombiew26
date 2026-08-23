import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { selectBestSet } from '@/lib/weeklyProgression';
import type { QuantitativeRecommendation } from '@/lib/quantitativeProgression';

export interface StudentProgressionReview {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planId: string;
  currentPhase: string;
  lastContactedAt: string | null;
  recommendations: {
    exerciseName: string;
    nextAction: 'increase_load' | 'increase_reps' | 'maintain';
    suggestedIncrement: number;
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

      const { data: students, error: studentsError } = await supabase
        .from('students_profile')
        .select('id, nome, telefone')
        .eq('status', 'ativo' as any);

      if (studentsError) throw studentsError;

      const { data: plans, error: plansError } = await supabase
        .from('ai_plans')
        .select('*')
        .in('student_id', students.map(s => s.id))
        .eq('is_draft', false);

      if (plansError) throw plansError;

      const { data: contacts, error: contactsError } = await (supabase as any)
        .from('weekly_progression_contacts')
        .select('*');

      if (contactsError) throw contactsError;
      
      const weeklyContactedIds = new Set(
        (contacts as any[])
          .filter(c => c.week_start_date === weekStartStr)
          .map(c => c.student_id)
      );

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: allLogs, error: logsError } = await supabase
        .from('exercise_set_logs')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      const reviews: StudentProgressionReview[] = [];

      for (const student of students) {
        const studentPlans = plans.filter(p => p.student_id === student.id);
        const activePlan = studentPlans.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        if (!activePlan || !activePlan.workout_json) continue;

        const workoutData = typeof activePlan.workout_json === 'string' 
          ? JSON.parse(activePlan.workout_json) 
          : (activePlan.workout_json as any);
        const workouts = workoutData.workouts || [];
        const studentLogs = allLogs.filter(l => l.student_id === student.id);
        
        const phaseResolution = resolveCurrentTrainingPhase(activePlan as any, now);
        if (phaseResolution.phase === 'S4') continue; 

        const recs: StudentProgressionReview['recommendations'] = [];

        for (const workout of workouts) {
          for (const exercise of (workout.exercises || [])) {
            const exerciseLogs = studentLogs.filter(l => l.exercise_name === exercise.name);
            if (exerciseLogs.length === 0) continue;

            const bestSet = selectBestSet(exerciseLogs as any);
            if (!bestSet) continue;

            const recommendation = buildQuantitativeProgressionRecommendation({
              performance: {
                load: (bestSet as any).peso || 0,
                reps: (bestSet as any).reps || 0,
                rir: (bestSet as any).rir ?? undefined,
                repRange: exercise.reps ? { 
                  min: parseInt(exercise.reps.split('-')[0]) || 8, 
                  max: parseInt(exercise.reps.split('-')[1]) || 12 
                } : undefined
              },
              config: {
                isBodyweight: exercise.load_type === 'bodyweight',
                increment: 0 
              }
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
        }

        const lastContact = (contacts as any[])
          .filter(c => c.student_id === student.id)
          .sort((a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime())[0];

        if (recs.length > 0) {
          reviews.push({
            studentId: student.id,
            studentName: student.nome || 'Aluno',
            studentPhone: student.telefone,
            planId: activePlan.id,
            currentPhase: phaseResolution.phase,
            lastContactedAt: lastContact?.contacted_at || null,
            recommendations: recs,
            hasPendingReview: !weeklyContactedIds.has(student.id)
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
