/**
 * Tipos de série do plano e dos registros (fonte única de rótulos, cores,
 * carga sugerida por tipo e montagem do atalho Aquecimento + preparatória +
 * trabalho). Funções puras: nada aqui grava em banco.
 *
 * Compatibilidade:
 *  - `recognition` continua válido (planos antigos) e é exibido "Reconhecimento";
 *  - valor desconhecido no plano vira `work`;
 *  - log com set_type NULL é legado e conta como trabalho.
 */

export type PlanSetType = 'warmup' | 'preparatory' | 'recognition' | 'work';

/** Ordem exibida no seletor do editor. */
export const PLAN_SET_TYPES: PlanSetType[] = ['warmup', 'preparatory', 'recognition', 'work'];

export const SET_TYPE_LABEL: Record<PlanSetType, string> = {
  warmup: 'Aquecimento',
  preparatory: 'Preparatória',
  recognition: 'Reconhecimento',
  work: 'Trabalho',
};

/** Rótulo curto por tipo ("Aquec.", "Prep."). */
export const SET_TYPE_SHORT: Record<PlanSetType, string> = {
  warmup: 'Aquec.',
  preparatory: 'Prep.',
  recognition: 'Rec.',
  work: 'Trabalho',
};

/** Etiqueta mínima para células estreitas. */
export const SET_TYPE_TAG: Record<PlanSetType, string> = {
  warmup: 'AQ',
  preparatory: 'PREP',
  recognition: 'REC',
  work: 'TRAB',
};

/** Classes de cor (tokens do tema) por tipo. */
export const SET_TYPE_BADGE_CLASS: Record<PlanSetType, string> = {
  warmup: 'bg-set-warmup/15 text-set-warmup border border-set-warmup/40',
  preparatory: 'bg-set-preparatory/15 text-set-preparatory border border-set-preparatory/40',
  recognition: 'bg-set-recognition/15 text-set-recognition border border-set-recognition/40',
  work: 'bg-set-work/15 text-set-work border border-set-work/40',
};
export const SET_TYPE_TEXT_CLASS: Record<PlanSetType, string> = {
  warmup: 'text-set-warmup',
  preparatory: 'text-set-preparatory',
  recognition: 'text-set-recognition',
  work: 'text-set-work',
};

/** Normaliza o tipo vindo do plano (setScheme) — desconhecido/vazio = trabalho. */
export const normalizePlanSetType = (raw: unknown): PlanSetType => {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t === 'warmup' || t === 'aquecimento') return 'warmup';
  if (t === 'preparatory' || t === 'preparatoria' || t === 'preparatória') return 'preparatory';
  if (t === 'recognition' || t === 'recon' || t === 'reconhecimento') return 'recognition';
  return 'work';
};

export const isWorkPlanSetType = (raw: unknown): boolean => normalizePlanSetType(raw) === 'work';

/**
 * Registro (exercise_set_logs.set_type) é série de trabalho?
 * NULL/vazio = legado = trabalho. 'top' também é trabalho. Aquecimento,
 * preparatória e reconhecimento nunca são; técnicas (drop, rest-pause…)
 * também não entram em histórico/recordes de trabalho.
 */
export const isWorkLogSetType = (raw: unknown): boolean => {
  const t = String(raw ?? '').trim().toLowerCase();
  return t === '' || t === 'work' || t === 'top';
};

/** Aquecimento/preparatória/reconhecimento — nunca representam performance. */
export const isPreparationLogSetType = (raw: unknown): boolean => {
  const t = String(raw ?? '').trim().toLowerCase();
  return t === 'warmup' || t === 'preparatory' || t === 'recognition' || t === 'recon';
};

/** Tipo que vai para exercise_set_logs.set_type ao registrar a série. */
export const logSetTypeFor = (planned: unknown): PlanSetType => normalizePlanSetType(planned);

// ---------- Modo Treino admin (kind interno do estado da sessão) ----------

/** `recon` é o nome legado do reconhecimento no estado do Modo Treino. */
export type SetPlanKind = 'warmup' | 'preparatory' | 'recon' | 'work';

export const setTypeToKind = (t: unknown): SetPlanKind => {
  const n = normalizePlanSetType(t);
  return n === 'recognition' ? 'recon' : n;
};
export const kindToSetType = (k: unknown): PlanSetType => normalizePlanSetType(k);

// ---------- Carga sugerida por tipo ----------

/** Fração da carga de trabalho sugerida por tipo de série. */
export const SET_TYPE_LOAD_PCT: Record<PlanSetType, number> = {
  warmup: 0.5,
  preparatory: 0.85,
  recognition: 0.85,
  work: 1,
};

/** Halter: incremento de 1 kg; demais: 2,5 kg. */
export const isDumbbellExercise = (name: unknown): boolean =>
  /\bhalter(es)?\b|\bdumb ?bells?\b|\bdb\b/i.test(String(name ?? ''));

export const loadStepFor = (exerciseName: unknown): number => (isDumbbellExercise(exerciseName) ? 1 : 2.5);

/** Arredonda para o incremento do equipamento (nunca abaixo de um degrau). */
export const roundLoadToStep = (kg: number, exerciseName: unknown): number => {
  const step = loadStepFor(exerciseName);
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  const rounded = Math.round(kg / step) * step;
  return Math.max(step, Math.round(rounded * 100) / 100);
};

/**
 * Carga sugerida para a série a partir da carga de TRABALHO sugerida.
 * Trabalho = a própria carga (sem arredondar, para não alterar a sugestão do
 * motor); demais tipos = % arredondada ao incremento do equipamento.
 */
export const suggestedLoadForSetType = (workKg: number | null | undefined, type: unknown, exerciseName: unknown): number | null => {
  if (workKg == null || !Number.isFinite(workKg) || workKg <= 0) return null;
  const t = normalizePlanSetType(type);
  if (t === 'work') return workKg;
  return roundLoadToStep(workKg * SET_TYPE_LOAD_PCT[t], exerciseName);
};

// ---------- Atalho "Aquecimento + preparatória + trabalho" ----------

export interface TypedSchemeSet { set_number: number; set_type: PlanSetType; target_reps: string }

export const WARMUP_DEFAULT_REPS = '12-15';
export const PREPARATORY_DEFAULT_REPS = '10';
export const WORK_DEFAULT_REPS = '6-8';

export const buildWarmupPrepWorkSets = (opts: { warmup: boolean; workSets: number; workReps?: string }): TypedSchemeSet[] => {
  const types: PlanSetType[] = [
    ...(opts.warmup ? (['warmup'] as PlanSetType[]) : []),
    'preparatory',
    ...Array.from({ length: Math.max(1, Math.trunc(opts.workSets) || 1) }, () => 'work' as PlanSetType),
  ];
  const repsFor = (t: PlanSetType) => t === 'warmup' ? WARMUP_DEFAULT_REPS : t === 'preparatory' ? PREPARATORY_DEFAULT_REPS : (opts.workReps?.trim() || WORK_DEFAULT_REPS);
  return types.map((t, i) => ({ set_number: i + 1, set_type: t, target_reps: repsFor(t) }));
};

/** O esquema por série tem tipos além de "trabalho" (para decidir o resumo). */
export const hasTypedSets = (sets: Array<{ set_type?: unknown }> | null | undefined): boolean =>
  (sets ?? []).some((s) => normalizePlanSetType(s.set_type) !== 'work');

/**
 * Resumo série a série, numa linha: "1 set: 12-15 · 2 set: 10 · 3 set: 6-8".
 * `compact` é a forma curta para telas estreitas: "1: 12-15 · 2: 10 · 3: 6-8".
 * A numeração segue a ordem das séries no plano.
 */
export const typedSetsSummary = (
  sets: Array<{ set_type?: unknown; target_reps?: unknown }> | null | undefined,
  variant: 'full' | 'compact' = 'full',
): string =>
  (sets ?? [])
    .map((s, i) => {
      const reps = String(s.target_reps ?? '').trim() || '?';
      return variant === 'compact' ? `${i + 1}: ${reps}` : `${i + 1} set: ${reps}`;
    })
    .join(' · ');

/** Séries de trabalho de um esquema por série (volume). */
export const countWorkSchemeSets = (sets: Array<{ set_type?: unknown }> | null | undefined): number =>
  (sets ?? []).filter((s) => normalizePlanSetType(s.set_type) === 'work').length;
