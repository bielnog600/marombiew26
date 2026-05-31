/**
 * Extract a structured TrainingContext from the latest workout plan.
 *
 * The dietitian-style AI needs to know: which days are training days, which
 * are off, dominant pattern (upper/lower/full/cardio), and approximate
 * intensity. This avoids dumping raw markdown into the diet prompt.
 */
import type { TrainingContext, DayLoad, DayLoadType, Weekday } from './dietSchema';
import { parseTrainingSections, type ParsedTrainingDay, type ParsedExercise } from './trainingResultParser';

const WEEKDAY_MAP: Record<string, Weekday> = {
  seg: 'seg', segunda: 'seg', 'segunda-feira': 'seg',
  ter: 'ter', terca: 'ter', 'terça': 'ter', 'terça-feira': 'ter',
  qua: 'qua', quarta: 'qua', 'quarta-feira': 'qua',
  qui: 'qui', quinta: 'qui', 'quinta-feira': 'qui',
  sex: 'sex', sexta: 'sex', 'sexta-feira': 'sex',
  sab: 'sab', sabado: 'sab', 'sábado': 'sab',
  dom: 'dom', domingo: 'dom',
};

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const detectWeekday = (label: string): Weekday | undefined => {
  const n = normalize(label);
  for (const key of Object.keys(WEEKDAY_MAP)) {
    if (n.includes(normalize(key))) return WEEKDAY_MAP[key];
  }
  return undefined;
};

const classifyDayType = (day: ParsedTrainingDay): DayLoadType => {
  const label = normalize(day.day);
  if (/(off|descanso|rest|folga|livre)/.test(label)) return 'rest';
  if (/(cardio|esteira|bike|caminhada)/.test(label)) return 'cardio';
  if (/(tabata|hiit|emom|amrap)/.test(label)) return 'tabata';
  if (/(corrida|running|trote)/.test(label)) return 'corrida';

  const exercisesText = day.exercises.map((e: ParsedExercise) => normalize(e.exercise)).join(' ');

  const lowerKeywords = /(agacha|leg ?press|stiff|levantam|terra|cadeira|panturri|gluteo|gl[uú]teo|hack|afundo)/;
  const upperKeywords = /(supino|remada|desenv|rosca|tr[ií]ceps|b[ií]ceps|crucifix|elevac|puxada|encolhimento|press)/;
  const hasLower = lowerKeywords.test(label) || lowerKeywords.test(exercisesText);
  const hasUpper = upperKeywords.test(label) || upperKeywords.test(exercisesText);

  if (hasLower && !hasUpper) return 'lower';
  if (hasUpper && !hasLower) return 'upper';
  if (hasUpper && hasLower) return 'full';

  // Push/Pull/Legs heuristics from label
  if (/(push|empurr)/.test(label)) return 'push';
  if (/(pull|puxar)/.test(label)) return 'pull';
  if (/(legs|perna)/.test(label)) return 'legs';

  return 'mixed';
};

const estimateIntensity = (day: ParsedTrainingDay): DayLoad['intensity'] => {
  const exCount = day.exercises.length;
  if (exCount === 0) return 'low';
  if (exCount <= 4) return 'low';
  if (exCount <= 8) return 'medium';
  return 'high';
};

const inferSplit = (days: ParsedTrainingDay[]): string => {
  const types = days.map(classifyDayType);
  const u = types.filter((t) => t === 'upper').length;
  const l = types.filter((t) => t === 'lower').length;
  const f = types.filter((t) => t === 'full').length;
  const ppl = types.filter((t) => t === 'push' || t === 'pull' || t === 'legs').length;
  if (ppl >= 3) return 'PPL';
  if (u >= 1 && l >= 1) return 'Upper/Lower';
  if (f >= 2) return 'Full Body';
  if (days.length === 3) return 'ABC';
  if (days.length === 4) return 'ABCD';
  if (days.length === 5) return 'ABCDE';
  return 'Custom';
};

export interface ExtractTrainingContextInput {
  trainingMarkdown?: string | null;
  trainingTime?: 'manha' | 'tarde' | 'noite' | null;
}

export const extractTrainingContext = (
  input: ExtractTrainingContextInput,
): TrainingContext | undefined => {
  if (!input.trainingMarkdown) return undefined;
  const sections = parseTrainingSections(input.trainingMarkdown);
  const days = sections.flatMap((s) => s.days ?? []);
  if (days.length === 0) return undefined;

  const daysOfWeek: Partial<Record<Weekday, DayLoad>> = {};
  for (const day of days) {
    const wd = detectWeekday(day.day);
    const load: DayLoad = {
      type: classifyDayType(day),
      intensity: estimateIntensity(day),
      timeOfDay: input.trainingTime || undefined,
    };
    if (wd) daysOfWeek[wd] = load;
  }

  const splitType = inferSplit(days);
  const weeklySessions = days.filter((d) => classifyDayType(d) !== 'rest').length;

  const summary =
    `${splitType} · ${weeklySessions}x/sem` +
    (input.trainingTime ? ` · ${input.trainingTime}` : '');

  return {
    splitType,
    weeklySessions,
    defaultTime: input.trainingTime || undefined,
    daysOfWeek: Object.keys(daysOfWeek).length > 0 ? (daysOfWeek as Record<Weekday, DayLoad>) : undefined,
    summary,
  };
};