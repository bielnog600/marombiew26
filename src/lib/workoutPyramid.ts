import type { ParsedExercise } from './trainingResultParser';
import { buildSetPlan } from './setPlanBuilder';

export type PyramidType = 'crescente' | 'decrescente';

export function pyramidType(exercise: Pick<ParsedExercise, 'method'>): PyramidType | undefined {
  if (exercise.method?.slug === 'pyramid_up') return 'crescente';
  if (exercise.method?.slug === 'pyramid_down') return 'decrescente';
  return undefined;
}

/** Pyramid is a per-set prescription, not an intra-set intensity method. */
export function pyramidPatch(exercise: ParsedExercise, type: PyramidType): Partial<ParsedExercise> {
  const previous = pyramidType(exercise);
  const plan = buildSetPlan(exercise.series, exercise.series2, exercise.reps, exercise.setScheme);
  const existing = exercise.setScheme?.mode === 'per_set' ? plan.map(set => set.reps) : undefined;
  const descendingReps = plan.map((_, i) => String(Math.max(2, 12 - i * 2)));
  const targets = existing
    ? previous && previous !== type ? [...existing].reverse() : existing
    : type === 'crescente' ? descendingReps : [...descendingReps].reverse();
  return {
    method: { slug: type === 'crescente' ? 'pyramid_up' : 'pyramid_down' },
    metodo: 'nenhum',
    metodo_params: undefined,
    series: String(plan.length),
    series2: '',
    reps: targets.join(' / '),
    setScheme: {
      mode: 'per_set',
      sets: plan.map((set, i) => ({ set_number: i + 1, set_type: set.type, target_reps: targets[i] })),
    },
  };
}

export function pyramidSummary(exercise: ParsedExercise): string {
  const type = pyramidType(exercise);
  if (!type) return '';
  return `Pirâmide ${type} · ${type === 'crescente' ? 'carga sobe' : 'carga cai'} a cada série`;
}