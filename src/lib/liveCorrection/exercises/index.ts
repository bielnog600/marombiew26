/**
 * Registro das regras da Correção ao vivo. A ordem importa: as mais específicas primeiro,
 * para "AGACHAMENTO BÚLGARO" virar búlgaro e não agachamento.
 */
import { bulgaroRule, lungeAutoFinishRepCount } from './bulgaro';
import { curlRule } from './curl';
import { hipThrustRule } from './hipThrust';
import { lateralRaiseRule } from './lateralRaise';
import { shoulderPressRule } from './shoulderPress';
import { nameHasKeyword, normalizeExerciseName } from './common';
import { squatRule } from './squat';
import { stiffRule } from './stiff';
import { tricepsFrenchRule } from './tricepsFrench';
import type { ExerciseRule, ExerciseRuleId, LiveRep } from './types';

export const EXERCISE_RULES: ExerciseRule[] = [
  bulgaroRule, stiffRule, lateralRaiseRule, hipThrustRule, squatRule,
  // "ROSCA FRANCESA" é tríceps: o francês vem antes da rosca.
  tricepsFrenchRule, curlRule, shoulderPressRule,
];
/** Ordem do seletor de teste do admin. */
export const EXERCISE_RULE_ORDER: ExerciseRuleId[] = [
  'squat', 'stiff', 'bulgaro', 'lateral_raise', 'hip_thrust', 'curl', 'triceps_french', 'shoulder_press',
];
export const DEFAULT_EXERCISE_RULE: ExerciseRuleId = 'squat';

export function getExerciseRule(id: unknown): ExerciseRule {
  return EXERCISE_RULES.find((r) => r.id === id) ?? squatRule;
}

export function isExerciseRuleId(v: unknown): v is ExerciseRuleId {
  return EXERCISE_RULES.some((r) => r.id === v);
}

/** Regra que casa com o nome do exercício (sem diferenciar acento/maiúsculas); null = sem correção ao vivo. */
export function matchExerciseRule(name: string | null | undefined): ExerciseRule | null {
  const n = normalizeExerciseName(name);
  if (!n) return null;
  return EXERCISE_RULES.find((r) =>
    r.keywords.some((k) => nameHasKeyword(n, k)) && !r.excludeKeywords?.some((k) => nameHasKeyword(n, k)),
  ) ?? null;
}

/** Todas as mensagens de erro/aviso, para mostrar sessões salvas de qualquer regra. */
export const ALL_ERROR_MESSAGES: Record<string, string> = Object.assign(
  {},
  ...EXERCISE_RULES.map((r) => r.messages),
);

/** Reps que valem para o fim automático (búlgaro só depois das duas pernas). */
export function autoFinishRepCount(rule: ExerciseRule, reps: LiveRep[]): number {
  return rule.needsFrontLeg ? lungeAutoFinishRepCount(reps) : reps.length;
}

export * from './types';
export * from './common';
export { squatRule } from './squat';
export * from './stiff';
export * from './bulgaro';
export * from './lateralRaise';
export * from './hipThrust';
export * from './arms';
export * from './curl';
export * from './tricepsFrench';
export * from './shoulderPress';
