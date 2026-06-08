/**
 * Heurística para identificar exercícios que NÃO exigem registro de carga
 * (mobilidade, alongamento, ativação, estabilidade, isometria sem peso,
 * aquecimento técnico). Usada para evitar alertas falsos de
 * "treinou sem registrar cargas".
 *
 * Importante: tanto frontend quanto edge function precisam manter a mesma
 * lista — qualquer ajuste aqui deve ser refletido em
 * supabase/functions/behavioral-alerts-generator/index.ts.
 */

const NO_LOAD_KEYWORDS = [
  'MOBILIDAD', 'MOBILITY',
  'ALONGAMENT', 'STRETCH',
  'ATIVAC', 'ATIVAÇ', 'ACTIVATION',
  'ESTABILIDAD', 'STABILITY',
  'AQUECIMENT', 'WARM UP', 'WARMUP',
  'PRANCHA', 'PLANK',
  'BIRD DOG', 'DEAD BUG',
  'CAT COW', 'GATO CAMELO',
  'FOAM ROLL', 'LIBERAC', 'LIBERAÇ',
  'RESPIRAC', 'RESPIRAÇ', 'BREATHING',
  'POSTURAL', 'CORE ATIVAC',
];

const NO_LOAD_GROUPS = new Set(['MOBILIDADE', 'ALONGAMENTO', 'CORE']);

const norm = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface LoadTypeHint {
  requiresLoad?: boolean | null;
  grupo?: string | null;
}

/**
 * Retorna true quando o exercício NÃO precisa de registro de carga.
 * Prioriza a flag explícita da tabela `exercises.requires_load_logging`
 * quando disponível; senão usa heurística por nome/grupo.
 */
export const isNoLoadExercise = (
  exerciseName: string,
  hint?: LoadTypeHint,
): boolean => {
  if (hint?.requiresLoad === false) return true;
  if (hint?.requiresLoad === true) return false;

  const grupo = norm(hint?.grupo || '');
  // CORE só é "sem carga" quando combinado com nome de prancha/ativação;
  // por isso não tratamos só pelo grupo CORE — caímos no match por nome abaixo.
  if (grupo === 'MOBILIDADE' || grupo === 'ALONGAMENTO') return true;

  const n = norm(exerciseName);
  if (!n) return false;
  return NO_LOAD_KEYWORDS.some((k) => n.includes(k));
};

export const requiresLoadLogging = (
  exerciseName: string,
  hint?: LoadTypeHint,
): boolean => !isNoLoadExercise(exerciseName, hint);
