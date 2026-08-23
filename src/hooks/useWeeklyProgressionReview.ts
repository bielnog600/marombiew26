import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { selectBestSet } from '@/lib/weeklyProgression';

export const useWeeklyProgressionReview = () => {
  return useQuery({
    queryKey: ['weekly-progression-review'],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');

      const { data: students } = await (supabase as any)
        .from('students_profile')
        .select('id, nome, telefone')
        .eq('status', 'ativo');

      if (!students) return [];

      const { data: plans } = await (supabase as any)
        .from('ai_plans')
        .select('*')
        .in('student_id', students.map((s: any) => s.id))
        .eq('is_draft', false);

      const { data: contacts } = await (supabase as any)
        .from('weekly_progression_contacts')
        .select('*');

      const contactedIds = new Set(
        (contacts || [])
          .filter((c: any) => c.week_start_date === weekStartStr)
          .map((c: any) => c.student_id)
      );

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: allLogs } = await (supabase as any)
        .from('exercise_set_logs')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const reviews: any[] = [];

      for (const student of students) {
        const studentPlans = (plans || []).filter((p: any) => p.student_id === student.id);
        const activePlan = studentPlans.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        if (!activePlan || !activePlan.workout_json) continue;

        const workoutData = typeof activePlan.workout_json === 'string' 
          ? JSON.parse(activePlan.workout_json) 
          : activePlan.workout_json;
        const workouts = workoutData.workouts || [];
        const studentLogs = (allLogs || []).filter((l: any) => l.student_id === student.id);
        
        const phaseResolution = resolveCurrentTrainingPhase(activePlan as any, now);
        if (phaseResolution.phase === 'S4') continue; 

        const recs: any[] = [];

        for (const workout of workouts) {
          for (const exercise of (workout.exercises || [])) {
            const exerciseLogs = studentLogs.filter((l: any) => l.exercise_name === exercise.name);
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
              } as any,
              config: {
                isBodyweight: exercise.load_type === 'bodyweight',
                increment: 0 
              }
            });

            const action = (recommendation as any).action;
            const nextAction = action === 'increase_load' ? 'increase_load' 
                            : action === 'increase_reps' ? 'increase_reps' 
                            : 'maintain';

            if (nextAction !== 'maintain') {
              recs.push({
                exerciseName: exercise.name,
                nextAction,
                suggestedIncrement: (recommendation as any).recommendedLoadKg ? ((recommendation as any).recommendedLoadKg - ((recommendation as any).currentLoadKg || 0)) : 0,
                recommendation
              });
            }
          }
        }

        const lastContact = (contacts || [])
          .filter((c: any) => c.student_id === student.id)
          .sort((a: any, b: any) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime())[0];

        if (recs.length > 0) {
          reviews.push({
            studentId: student.id,
            studentName: student.nome || 'Aluno',
            studentPhone: student.telefone,
            planId: activePlan.id,
            currentPhase: phaseResolution.phase,
            lastContactedAt: lastContact?.contacted_at || null,
            recommendations: recs,
            hasPendingReview: !contactedIds.has(student.id)
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
