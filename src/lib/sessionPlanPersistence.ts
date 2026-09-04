import { supabase } from '@/integrations/supabase/client';
import type { ParsedExercise, ParsedTrainingDay } from '@/lib/trainingResultParser';
import {
  normalizeWorkoutPlan,
  parsedDaysToWorkoutPlan,
  newId,
  type WorkoutPlan,
} from '@/lib/workoutSchema';
import { workoutPlanToMarkdown } from '@/lib/workoutMarkdownSerializer';

/**
 * Persistência das edições feitas dentro do "Modo Treino" (admin) de volta ao
 * plano do aluno (`ai_plans`), para que admin e aluno vejam as alterações na
 * próxima vez que abrirem o treino.
 *
 * Regras:
 * - Fonte de verdade é o JSON (`conteudo_json`); o markdown (`conteudo`) é derivado.
 * - O dia é localizado por nome normalizado (sem acento/caixa); se não encontrar,
 *   usa o índice do dia dentro da lista original como fallback.
 * - Apenas o dia da sessão é reescrito; os demais dias ficam intactos.
 */

const normalizeDayName = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parsePauseToSeconds = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === '-' || s === '—') return undefined;
  const min = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|m)\b/);
  if (min) return Math.round(Number(min[1].replace(',', '.')) * 60);
  const sec = s.match(/^(\d+)/);
  if (sec) return Number(sec[1]);
  return undefined;
};

export interface SessionExerciseState {
  exerciseName?: string;
  notes?: string;
  plan?: { kind: 'work' | 'recon'; targetReps?: string }[];
}

export interface PersistDayEditsInput {
  planId: string;
  /** Nome do dia editado na sessão. */
  dayName: string;
  /** Índice do dia na lista original (fallback quando o nome não bate). */
  dayIndex?: number | null;
  /** Exercícios atuais do dia (já com as edições do modal). */
  exercises: ParsedExercise[];
  /** Estado por índice de exercício (nome editado, notas, plano de séries). */
  states?: Record<number, SessionExerciseState | undefined>;
  /** Dias originais do plano, usados para reconstruir o JSON quando não existir. */
  fallbackDays?: ParsedTrainingDay[];
  /** Etapa 2B: quando informado, a edição manual é capturada após o save. */
  studentId?: string | null;
  /** Contexto adicional congelado no momento do save. */
  editContext?: PrescriptionContextInput;
}


export type PersistDayEditsResult =
  | { success: true; updated: true }
  | { success: true; updated: false; reason: string }
  | { success: false; error: string };

export const persistSessionDayEditsToPlan = async (
  input: PersistDayEditsInput,
): Promise<PersistDayEditsResult> => {
  const { planId, dayName, dayIndex, exercises, states = {}, fallbackDays = [] } = input;
  if (!planId) return { success: true, updated: false, reason: 'sem_plano' };
  if (!dayName) return { success: true, updated: false, reason: 'sem_dia' };

  const { data: planRow, error: loadErr } = await supabase
    .from('ai_plans')
    .select('id, conteudo, conteudo_json')
    .eq('id', planId)
    .maybeSingle();

  if (loadErr) return { success: false, error: loadErr.message };
  if (!planRow) return { success: true, updated: false, reason: 'plano_nao_encontrado' };

  let plan: WorkoutPlan | null = normalizeWorkoutPlan(planRow.conteudo_json);
  if (!plan || plan.days.length === 0) {
    if (fallbackDays.length === 0) return { success: true, updated: false, reason: 'plano_sem_dias' };
    plan = parsedDaysToWorkoutPlan(fallbackDays);
  }

  const target = normalizeDayName(dayName);
  let dayIdx = plan.days.findIndex((d) => normalizeDayName(d.day) === target);
  if (dayIdx < 0) dayIdx = plan.days.findIndex((d) => normalizeDayName(d.day).includes(target) || target.includes(normalizeDayName(d.day)));
  if (dayIdx < 0 && typeof dayIndex === 'number' && dayIndex >= 0 && dayIndex < plan.days.length) {
    dayIdx = dayIndex;
  }
  if (dayIdx < 0) return { success: true, updated: false, reason: 'dia_nao_encontrado' };

  const existingExercises = (plan.days[dayIdx]?.exercises || []) as any[];

  const rebuilt = exercises.map((ex, i) => {
    const st = states[i];
    const setPlan = st?.plan || [];
    const reconCount = setPlan.filter((p) => p.kind === 'recon').length;
    const workCount = setPlan.filter((p) => p.kind === 'work').length;
    const totalCount =
      setPlan.length || parseInt(ex.series2 || '', 10) || parseInt(ex.series || '', 10) || 0;
    const series = reconCount > 0 ? String(reconCount) : String(totalCount || ex.series || '');
    const series2 = reconCount > 0 ? String(workCount) : ex.series2 || '';
    const name = (st?.exerciseName || ex.exercise || '').trim();

    // Identidade: casa pelo `id` do slot quando disponível (plano v2).
    // Só cai para nome/índice em planos legacy sem id.
    const byId = ex.id ? existingExercises.find((p) => p?.id === ex.id) : undefined;
    const prevEx =
      byId ||
      (ex.id
        ? undefined
        : existingExercises.find(
            (p) => normalizeDayName(String(p?.exercise || '')) === normalizeDayName(name),
          ) || existingExercises[i]);
    const sameName =
      prevEx && normalizeDayName(String(prevEx.exercise || '')) === normalizeDayName(name);

    return {
      // Substituição mantém o id do slot; muda só o exercício/exerciseId.
      id: prevEx?.id || ex.id || newId('ex'),
      exercise: name,
      exerciseId: ex.exerciseId ?? (sameName ? prevEx?.exerciseId : undefined),
      series,
      series2,
      reps: ex.reps || '',
      rir: ex.rir || '',
      pause: ex.pause || '',
      restSeconds: parsePauseToSeconds(ex.pause) ?? (sameName ? prevEx?.restSeconds : undefined),
      description: ex.description || '',
      variation: ex.variation || '',
      tempo: sameName ? prevEx?.tempo : undefined,
      notes: st?.notes ? st.notes : sameName ? prevEx?.notes || '' : '',
      setScheme: ex.setScheme ?? (sameName ? prevEx?.setScheme : undefined),
    };
  }).filter((e) => e.exercise.length > 0);

  const updatedPlan: WorkoutPlan = {
    ...plan,
    days: plan.days.map((d, i) => (i === dayIdx ? { ...d, exercises: rebuilt as any } : d)),
  };

  const { error: updErr } = await supabase
    .from('ai_plans')
    .update({ conteudo: workoutPlanToMarkdown(updatedPlan), conteudo_json: updatedPlan as any })
    .eq('id', planId);

  if (updErr) return { success: false, error: updErr.message };
  return { success: true, updated: true };
};
