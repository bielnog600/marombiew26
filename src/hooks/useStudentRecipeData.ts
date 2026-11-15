import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchWithCache } from '@/lib/offlineCache';
import { buildFoodIndex, foodRecordFromRow, type FoodIndex, type FoodRecord } from '@/lib/nutritionEngine';
import { buildStudentMealContext, countryFromPhone, type BankMeal, type StudentCountry, type StudentMealContext } from '@/lib/mealBank';
import { fetchMealBank } from '@/hooks/useMealBank';

interface RawContext {
  telefone: string | null;
  restricoes: string | null;
  questionario: { restricoes_alimentares?: string | null; preferencias_alimentares?: string | null; alimentos_por_refeicao?: unknown } | null;
}

export interface StudentRecipeData {
  bank: BankMeal[];
  foods: FoodRecord[];
  index: FoodIndex;
  ctx: StudentMealContext;
  country: StudentCountry | null;
}

/**
 * Banco de refeições, tabela de alimentos e ficha do aluno (país, restrições,
 * alimentos) — só leitura, com cache offline. Usado para a Opção 2 automática e
 * para as Receitas da tela "Minhas dietas".
 */
export const useStudentRecipeData = (studentId?: string | null, enabled = true): StudentRecipeData | null => {
  const [raw, setRaw] = useState<{ bank: BankMeal[]; foods: FoodRecord[]; ctx: RawContext } | null>(null);
  useEffect(() => {
    if (!studentId || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [bank, foods, ctx] = await Promise.all([
          fetchWithCache('meal-bank:v1', fetchMealBank),
          fetchWithCache('foods:recipes:v1', async () => {
            const { data, error } = await supabase
              .from('foods')
              .select('id, name, calories, protein, carbs, fats, portion, portion_size, brand, source');
            if (error) throw error;
            return (data ?? []).map((row: any) => foodRecordFromRow(row));
          }),
          fetchWithCache(`meal-context:${studentId}`, async (): Promise<RawContext> => {
            const [profile, student, questionnaire] = await Promise.all([
              supabase.from('profiles').select('telefone').eq('user_id', studentId).maybeSingle(),
              supabase.from('students_profile').select('restricoes').eq('user_id', studentId).maybeSingle(),
              supabase
                .from('diet_questionnaires')
                .select('restricoes_alimentares, preferencias_alimentares, alimentos_por_refeicao')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            ]);
            return {
              telefone: (profile.data as any)?.telefone ?? null,
              restricoes: (student.data as any)?.restricoes ?? null,
              questionario: (questionnaire.data as any) ?? null,
            };
          }),
        ]);
        if (cancelled) return;
        if (Array.isArray(bank.data) && Array.isArray(foods.data) && bank.data.length > 0 && foods.data.length > 0) {
          setRaw({ bank: bank.data, foods: foods.data, ctx: ctx.data ?? { telefone: null, restricoes: null, questionario: null } });
        }
      } catch (error) {
        console.error('[Receitas] falha ao carregar o banco de refeições', error);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId, enabled]);

  return useMemo(() => {
    if (!raw) return null;
    const q = raw.ctx.questionario ?? {};
    return {
      bank: raw.bank,
      foods: raw.foods,
      index: buildFoodIndex(raw.foods),
      ctx: buildStudentMealContext({
        phone: raw.ctx.telefone,
        restricoes: [raw.ctx.restricoes, q.restricoes_alimentares],
        preferencias: [q.preferencias_alimentares],
        alimentos: q.alimentos_por_refeicao,
      }),
      country: countryFromPhone(raw.ctx.telefone),
    };
  }, [raw]);
};
