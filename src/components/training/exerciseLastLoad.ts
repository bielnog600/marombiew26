import { supabase } from '@/integrations/supabase/client';
import { isPreparationLogSetType } from '@/lib/setTypes';
import { referenceWorkSetLoad } from '@/lib/setLoadPrefill';
import { normalizeExName } from './TrainerLogSheetUtils';

export interface ExerciseLastLoad {
  lastWeight: number | null;
  lastReps: number | null;
  lastDate: string | null;
  /** MAIOR carga de TRABALHO da última sessão (referência do pré-preenchimento). */
  lastWorkLoad: number | null;
}

export const EMPTY_LAST_LOAD: ExerciseLastLoad = { lastWeight: null, lastReps: null, lastDate: null, lastWorkLoad: null };

type Row = { weight_kg: number | null; reps: number | null; performed_at: string; session_id?: string | null; set_type?: string | null; set_number?: number | null };

/**
 * Resumo da última sessão de um exercício (Modo Treino admin): maior carga das
 * séries de trabalho e carga da última série de trabalho. Linhas mais recentes
 * primeiro. Aquecimento/preparatória/reconhecimento nunca viram "última carga".
 */
export const summarizeLastSession = (rows: Row[] | null | undefined): ExerciseLastLoad => {
  const linhas = rows ?? [];
  if (linhas.length === 0) return EMPTY_LAST_LOAD;
  const sessaoDe = (r: Row) => r.session_id || String(r.performed_at).slice(0, 10);
  const daSessao = linhas.filter((r) => sessaoDe(r) === sessaoDe(linhas[0]));
  const trabalho = daSessao.filter((r) => !isPreparationLogSetType(r.set_type));
  const pool = trabalho.length > 0 ? trabalho : daSessao;
  const melhor = pool.reduce((a, b) => ((Number(b.weight_kg) || 0) > (Number(a.weight_kg) || 0) ? b : a), pool[0]);
  return {
    lastWeight: melhor.weight_kg,
    lastReps: melhor.reps,
    lastDate: melhor.performed_at,
    lastWorkLoad: referenceWorkSetLoad(daSessao),
  };
};

/** Busca o histórico do exercício pelo NOME registrado (variação tem o próprio). */
export const fetchExerciseLastLoad = async (studentId: string, exerciseName: string): Promise<ExerciseLastLoad> => {
  if (!exerciseName.trim()) return EMPTY_LAST_LOAD;
  const { data } = await supabase
    .from('exercise_set_logs')
    .select('weight_kg, reps, performed_at, session_id, set_type, set_number')
    .eq('student_id', studentId)
    .ilike('exercise_name', normalizeExName(exerciseName))
    .order('performed_at', { ascending: false })
    .limit(30);
  return summarizeLastSession((data as Row[] | null) ?? []);
};
