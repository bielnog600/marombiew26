import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';
import { buildQuantitativeProgressionRecommendation } from '@/lib/quantitativeProgression';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { buildExercisePerformance, lastExerciseSessions, withPlannedSetTypes, repRangeFromPlanned } from '@/lib/weeklyProgression';
import { normalizeExerciseKey } from '@/lib/loadIncrement';
import { buildPrescribedWorkSets } from '@/lib/sessionProgression';
import { readConsultoriaTrainingData, groupByStudent } from '@/lib/consultoriaTrainingData';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import {
  buildAttentionPriority,
  sortProgressionReviews,
  type AttentionPriority,
  type IntensityStatus,
} from '@/lib/trainingIntensityAttention';

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
  /** Derivados da camada de intensidade (não persistidos). */
  latestSessionId: string | null;
  latestSessionDate: string | null;
  latestSessionStatus: string | null;
  latestSessionRpe: number | null;
  intensityStatus: IntensityStatus;
  attentionPriority: AttentionPriority;
  attentionReasons: string[];
}

export const useWeeklyProgressionReview = () => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['weekly-progression-review'],
    queryFn: async () => {
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');

      const shared = await readConsultoriaTrainingData(queryClient);
      const { ids: studentIds, profiles, plans, logs, sessions } = shared;
      if (studentIds.length === 0) return [];
      const contactsRes = await supabase.from('weekly_progression_contacts')
        .select('student_id, week_start, created_at').in('student_id', studentIds);
      if (contactsRes.error) throw contactsRes.error;
      const students = studentIds.map(user_id => ({ user_id }));
      const plansByStudent = groupByStudent(plans);
      const logsByStudent = groupByStudent(logs);
      const sessionsByStudent = groupByStudent(sessions.filter(s => s.created_at >= shared.historyStart));
      const sessionsById = new Map(sessions.map(s => [s.id, s]));
      const contactsByStudent = groupByStudent(contactsRes.data ?? []);

      const profileMap = new Map(profiles.map(p => [p.user_id, p]));
      // Coluna real confirmada no schema: weekly_progression_contacts.week_start
      const contactedIds = new Set(
        (contactsRes.data || [])
          .filter((c: any) => c.week_start === weekStartStr)
          .map((c: any) => c.student_id)
      );

      const reviews: StudentProgressionReview[] = [];

      for (const student of students) {
        const studentProfile = profileMap.get(student.user_id);
        const studentPlans = plansByStudent.get(student.user_id) ?? [];
        const activePlan = studentPlans[0];

        if (!activePlan || !activePlan.conteudo) continue;

        const studentLogs = logsByStudent.get(student.user_id) ?? [];
        const logsByExercise = new Map<string, typeof studentLogs>();
        for (const log of studentLogs) {
          const key = normalizeExerciseKey(log.exercise_name);
          const list = logsByExercise.get(key) ?? [];
          list.push(log);
          logsByExercise.set(key, list);
        }
        const phaseResolution = resolveCurrentTrainingPhase(activePlan as any, now);

        const parsed = parseTrainingSections(activePlan.conteudo);
        const exercises = parsed.flatMap(s => s.days || []).flatMap(d => d.exercises || []);

        const recs: any[] = [];

        for (const exercise of exercises) {
          const exerciseLogs = withPlannedSetTypes(logsByExercise.get(normalizeExerciseKey(exercise.exercise)) ?? [], exercise);
          const pair = lastExerciseSessions(exerciseLogs);
          const performance = buildExercisePerformance(exercise.exercise, pair.current, pair.previous, repRangeFromPlanned(exercise));
          const recommendation = buildQuantitativeProgressionRecommendation({
            performance, recentLogs: pair.current, previousLogs: pair.previous, historyLogs: exerciseLogs,
            prescribedSets: buildPrescribedWorkSets(exercise), activePhase: phaseResolution.phase,
            sessionAvgRpe: sessionsById.get(pair.current[0]?.session_id ?? '')?.avg_rpe ?? null,
          });

          const nextAction = recommendation.action === 'increase_load' ? 'increase_load' 
                          : recommendation.action === 'increase_reps' ? 'increase_reps' 
                          : 'maintain';

          if (nextAction !== 'maintain') {
            recs.push({
              exerciseName: exercise.exercise,
              nextAction,
              suggestedIncrement: recommendation.recommendedLoadKg ? (recommendation.recommendedLoadKg - (recommendation.currentLoadKg || 0)) : 0,
              recommendation
            });
          }
        }

        // Sessão comparável mais recente (completa) para leitura do RPE real.
        const studentSessions = sessionsByStudent.get(student.user_id) ?? [];
        const latestSession = studentSessions.find((s: any) => s.status === 'completed') || studentSessions[0] || null;

        const attention = buildAttentionPriority({
          sessionStatus: latestSession?.status ?? null,
          rpe: latestSession?.avg_rpe != null ? Number(latestSession.avg_rpe) : null,
          phase: String(phaseResolution.phase),
          actions: recs.map((r) => r.nextAction),
        });

        const lastContact = [...(contactsByStudent.get(student.user_id) ?? [])]
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (recs.length > 0 || attention.attentionPriority === 'attention_only') {
          reviews.push({
            studentId: student.user_id,
            studentName: studentProfile?.nome || 'Aluno',
            studentPhone: studentProfile?.telefone || null,
            planId: activePlan.id,
            currentPhase: phaseResolution.phase,
            lastContactedAt: lastContact?.created_at || null,
            recommendations: recs,
            hasPendingReview: !contactedIds.has(student.user_id),
            latestSessionId: latestSession?.id ?? null,
            latestSessionDate: latestSession?.completed_at ?? latestSession?.created_at ?? null,
            latestSessionStatus: latestSession?.status ?? null,
            latestSessionRpe: latestSession?.avg_rpe != null ? Number(latestSession.avg_rpe) : null,
            intensityStatus: attention.intensityStatus,
            attentionPriority: attention.attentionPriority,
            attentionReasons: attention.attentionReasons,
          });
        }
      }

      return sortProgressionReviews(reviews);
    }
  });
};
