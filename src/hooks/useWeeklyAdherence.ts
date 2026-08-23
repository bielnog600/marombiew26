import { useWeeklyTraining } from './useWeeklyTraining';
import type { TrainingPhase } from '@/lib/trainingPhase';

interface PlanLike {
  id: string;
  student_id: string;
  conteudo?: string | null;
}

/**
 * Compatibilidade: wrapper fino sobre useWeeklyTraining.
 * Toda a busca/cálculo vive em um único lugar — este hook só expõe a
 * aderência para consumidores que não precisam da performance.
 */
export const useWeeklyAdherence = (
  plan: PlanLike | null | undefined,
  plannedPhase: TrainingPhase = 'semana_1',
) => {
  const { report, loading } = useWeeklyTraining(plan, plannedPhase);
  return { report, loading };
};
