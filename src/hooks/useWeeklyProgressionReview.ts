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
        .select(`
          id,
          nome,
          telefone,
          ai_plans (
            id,
            workout_json,
            cycle_days,
            created_at,
            phase_start_date
          )
        `)
        .eq('status', 'ativo');

      if (studentsError) throw studentsError;

      const { data: contacts, error: contactsError } = await supabase
        .from('weekly_progression_contacts')
        .select('student_id, contacted_at, week_start_date');

      if (contactsError) throw contactsError;
      
      const weeklyContactedIds = new Set(
        contacts
          .filter(c => c.week_start_date === weekStartStr)
          .map(c => c.student_id)
      );

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: allLogs, error: logsError } = await supabase
        .from('exercise_set_logs')
        .select('student_id, exercise_name, peso, reps, rir, set_type, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;

      const reviews: StudentProgressionReview[] = [];

      for (const student of students) {
        const activePlan = student.ai_plans?.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        if (!activePlan || !activePlan.workout_json) continue;

        const workoutData = typeof activePlan.workout_json === 'string' 
          ? JSON.parse(activePlan.workout_json) 
          : activePlan.workout_json;
        const workouts = workoutData.workouts || [];
        const studentLogs = allLogs.filter(l => l.student_id === student.id);
        
        const phaseResolution = resolveCurrentTrainingPhase(activePlan as any, now);
        if (phaseResolution.phase === 'S4') continue; 

        const recs: StudentProgressionReview['recommendations'] = [];

        for (const workout of workouts) {
          for (const exercise of workout.exercises || []) {
            const exerciseLogs = studentLogs.filter(l => l.exercise_name === exercise.name);
            if (exerciseLogs.length === 0) continue;

            const bestSet = selectBestSet(exerciseLogs as any);
            if (!bestSet) continue;

            const recommendation = buildQuantitativeProgressionRecommendation({
              performance: {
                load: bestSet.peso,
                reps: bestSet.reps,
                rir: bestSet.rir ?? undefined,
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
                suggestedIncrement: recommendation.incrementKg || 0,
                recommendation
              });
            }
          }
        }

        const lastContact = contacts
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
