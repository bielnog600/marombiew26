/**
 * Acesso ao banco da configuração explícita de incremento de carga
 * (aluno + exercício). Camada fina e isolada: a lógica de resolução
 * (`resolveLoadIncrement`) permanece pura e sem queries.
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeExerciseKey, validateIncrementInput } from './loadIncrement';

export interface StudentLoadIncrement {
  exerciseKey: string;
  exerciseName: string;
  incrementKg: number;
}

/**
 * Mapa chave-normalizada → incremento (kg) do aluno, com sinal de erro
 * explícito: "sem configuração" (ok + mapa vazio) é diferente de "falha ao
 * buscar" (ok = false), que nunca pode virar snapshot vazio.
 */
export const fetchStudentLoadIncrementsResult = async (
  studentId: string,
): Promise<{ ok: boolean; increments: Record<string, number> }> => {
  if (!studentId) return { ok: true, increments: {} };
  const { data, error } = await supabase
    .from('student_load_increments')
    .select('exercise_key, increment_kg')
    .eq('student_id', studentId);
  if (error) return { ok: false, increments: {} };
  const map: Record<string, number> = {};
  (data ?? []).forEach((row) => {
    const v = Number(row.increment_kg);
    if (Number.isFinite(v) && v > 0) map[row.exercise_key] = v;
  });
  return { ok: true, increments: map };
};

/** Mapa chave-normalizada → incremento (kg) do aluno. */
export const fetchStudentLoadIncrements = async (
  studentId: string,
): Promise<Record<string, number>> =>
  (await fetchStudentLoadIncrementsResult(studentId)).increments;

/** Grava (ou remove, quando o valor é vazio) o incremento de um exercício. */
export const saveStudentLoadIncrement = async (
  studentId: string,
  exerciseName: string,
  raw: string | number | null,
): Promise<{ ok: boolean; error?: string; value: number | null }> => {
  const key = normalizeExerciseKey(exerciseName);
  if (!studentId || !key) return { ok: false, error: 'Exercício inválido.', value: null };

  const validation = validateIncrementInput(raw);
  if (!validation.valid) return { ok: false, error: validation.error, value: null };

  if (validation.value === null) {
    const { error } = await supabase
      .from('student_load_increments')
      .delete()
      .eq('student_id', studentId)
      .eq('exercise_key', key);
    return error ? { ok: false, error: error.message, value: null } : { ok: true, value: null };
  }

  const { error } = await supabase
    .from('student_load_increments')
    .upsert(
      {
        student_id: studentId,
        exercise_key: key,
        exercise_name: exerciseName.trim(),
        increment_kg: validation.value,
      },
      { onConflict: 'student_id,exercise_key' },
    );
  return error
    ? { ok: false, error: error.message, value: null }
    : { ok: true, value: validation.value };
};
