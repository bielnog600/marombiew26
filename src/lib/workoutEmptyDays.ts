/**
 * Dias de treino sem exercícios são tratados como dia de descanso:
 * nunca são gravados nem exibidos como treino.
 */
type DayLike = { day?: string; exercises?: unknown[] | null };

const hasName = (e: unknown): boolean =>
  !!e && typeof e === "object" && typeof (e as { exercise?: unknown }).exercise === "string" &&
  ((e as { exercise: string }).exercise.trim().length > 0);

/** Remove itens nulos/sem nome e descarta dias que ficaram vazios. */
export const sanitizeTrainingDays = <D extends DayLike>(days: D[] | null | undefined): D[] =>
  (Array.isArray(days) ? days : [])
    .filter((d): d is D => !!d && typeof d === "object")
    .map((d) => ({ ...d, exercises: (Array.isArray(d.exercises) ? d.exercises : []).filter(hasName) }))
    .filter((d) => (d.exercises as unknown[]).length > 0);

/** Nomes dos dias sem nenhum exercício válido. */
export const findEmptyDays = (days: DayLike[] | null | undefined): string[] =>
  (Array.isArray(days) ? days : [])
    .filter((d) => !d || !(Array.isArray(d.exercises) && d.exercises.some(hasName)))
    .map((d) => String(d?.day || "Sem nome"));

export const removeEmptyDays = <P extends { days: DayLike[] }>(plan: P): P => ({
  ...plan,
  days: sanitizeTrainingDays(plan.days) as P["days"],
});

export const emptyDaysMessage = (names: string[]): string =>
  names.length === 1
    ? `O dia ${names[0]} não tem exercícios.`
    : `Os dias ${names.join(", ")} não têm exercícios.`;
