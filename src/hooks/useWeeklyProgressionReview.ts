import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildQuantitativeProgressionRecommendation } from "@/lib/quantitativeProgression";
import { resolveCurrentTrainingPhase } from "@/lib/currentPhase";
import { startOfWeek, endOfWeek, format } from "date-fns";

export interface StudentProgressionReview {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planId: string | null;
  currentPhase: string;
  recommendations: any[];
  hasPendingReview: boolean;
  lastContactedAt: string | null;
}

export function useWeeklyProgressionReview() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['weekly-progression-review', weekStartStr],
    queryFn: async () => {
      // 1. Fetch active students
      const { data: students } = await supabase
        .from('students_profile')
        .select(\`
          user_id,
          profiles!inner(nome, telefone),
          active_plan:ai_plans(id, tipo, plan_data, cycle_days, created_at)
        \`)
        .eq('ativo', true);

      if (!students) return [];

      // 2. Fetch recent contacts for this week
      const { data: contacts } = await supabase
        .from('weekly_progression_contacts')
        .select('student_id, contacted_at')
        .eq('week_start_date', weekStartStr);

      const contactMap = new Map(contacts?.map(c => [c.student_id, c.contacted_at]) || []);

      const reviews: StudentProgressionReview[] = [];

      for (const student of students) {
        const plan = Array.isArray(student.active_plan) 
          ? student.active_plan.find(p => p.tipo === 'treino') 
          : (student.active_plan?.tipo === 'treino' ? student.active_plan : null);

        if (!plan) continue;

        // Resolve phase
        const phaseInfo = resolveCurrentTrainingPhase(plan, new Date());
        
        // Fetch last logs for recommendation engine (simplified for batch)
        const { data: logs } = await supabase
          .from('exercise_set_logs')
          .select('*')
          .eq('student_id', student.user_id)
          .order('performed_at', { ascending: false })
          .limit(100);

        const recs = buildQuantitativeProgressionRecommendation(logs || [], phaseInfo.phase);

        reviews.push({
          studentId: student.user_id,
          studentName: student.profiles.nome,
          studentPhone: student.profiles.telefone,
          planId: plan.id,
          currentPhase: phaseInfo.phase,
          recommendations: recs,
          hasPendingReview: !contactMap.has(student.user_id),
          lastContactedAt: contactMap.get(student.user_id) || null
        });
      }

      return reviews.sort((a, b) => {
        if (a.hasPendingReview && !b.hasPendingReview) return -1;
        if (!a.hasPendingReview && b.hasPendingReview) return 1;
        return a.studentName.localeCompare(b.studentName);
      });
    }
  });
}
