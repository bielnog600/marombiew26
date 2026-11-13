/**
 * Grava a refeição do dia editada no card como um novo meal_weigh_logs (o
 * registro mais recente vale; os anteriores ficam de histórico) e manda as
 * correções de itens estimados para a calibração (melhor esforço).
 */
import { supabase } from '@/integrations/supabase/client';
import { buildWeighLogRow, type WeighLogRecord } from '@/lib/mealWeigh';
import { correctionsFromItems } from '@/lib/mealWeigh/calibration';
import type { DayWeighState } from '@/lib/mealWeigh/dayEdit';
import { saveEstimateCorrections } from './calibrationApi';

export interface DayLogContext {
  studentId: string;
  logDate: string;
  dietPlanId: string | null;
  mealIndex: number;
  mealName: string;
  mealTime: string | null;
}

export async function insertDayWeighLog(ctx: DayLogContext, state: DayWeighState): Promise<{ log: WeighLogRecord | null; error: string | null }> {
  const row = buildWeighLogRow(state.planned, state.items, state.choices);
  const { data, error } = await supabase.from('meal_weigh_logs').insert({
    student_id: ctx.studentId,
    log_date: ctx.logDate,
    diet_plan_id: ctx.dietPlanId,
    meal_index: ctx.mealIndex,
    meal_name: ctx.mealName || '',
    meal_time: ctx.mealTime ?? null,
    items: row.items as any,
    unweighed: row.unweighed as any,
    planned: row.planned as any,
    total_kcal: row.total_kcal,
    total_p: row.total_p,
    total_c: row.total_c,
    total_g: row.total_g,
  }).select('id, log_date, meal_index, items, unweighed, planned, created_at').single();
  if (error || !data) return { log: null, error: error?.message ?? 'sem resposta' };
  const mealLogId = (data as { id?: string }).id ?? null;
  const { upserts, removeIds } = correctionsFromItems(row.items, { studentId: ctx.studentId, mealLogId, fonte: 'aluno' });
  void saveEstimateCorrections(ctx.studentId, upserts, removeIds);
  return { log: data as unknown as WeighLogRecord, error: null };
}
