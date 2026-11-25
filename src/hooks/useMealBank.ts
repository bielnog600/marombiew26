import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildStudentMealContext, type BankMeal, type StudentMealContext } from '@/lib/mealBank';

export const MEAL_BANK_QUERY_KEY = ['meal-bank'] as const;

export const fetchMealBank = async (): Promise<BankMeal[]> => {
  const { data, error } = await supabase
    .from('meal_bank')
    .select('id, code, slot, name, origin, tags, prep, active, meal_bank_items(food_id, grams, ordem)')
    .order('code');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    code: row.code,
    slot: row.slot,
    name: row.name,
    origin: row.origin,
    tags: row.tags ?? [],
    prep: row.prep ?? null,
    active: row.active !== false,
    items: (row.meal_bank_items ?? [])
      .map((i: any) => ({ foodId: String(i.food_id), grams: Number(i.grams) || 0, ordem: Number(i.ordem) || 0 }))
      .sort((a: any, b: any) => a.ordem - b.ordem),
  }));
};

export const useMealBank = (enabled = true) =>
  useQuery({ queryKey: MEAL_BANK_QUERY_KEY, queryFn: fetchMealBank, enabled, staleTime: 60_000 });

/** País (telefone), restrições e alimentos da ficha do aluno — só leitura. */
export const useStudentMealContext = (studentId?: string | null) =>
  useQuery({
    queryKey: ['student-meal-context', studentId ?? null],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async (): Promise<StudentMealContext & { objetivo: string | null }> => {
      const [profile, student, questionnaire] = await Promise.all([
        supabase.from('profiles').select('telefone').eq('user_id', studentId!).maybeSingle(),
        supabase.from('students_profile').select('restricoes, objetivo').eq('user_id', studentId!).maybeSingle(),
        supabase
          .from('diet_questionnaires')
          .select('restricoes_alimentares, preferencias_alimentares, alimentos_por_refeicao')
          .eq('student_id', studentId!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const q: any = questionnaire.data ?? {};
      return {
        ...buildStudentMealContext({
          phone: (profile.data as any)?.telefone ?? null,
          restricoes: [(student.data as any)?.restricoes, q.restricoes_alimentares],
          preferencias: [q.preferencias_alimentares],
          alimentos: q.alimentos_por_refeicao,
        }),
        objetivo: (student.data as any)?.objetivo ?? null,
      };
    },
  });
