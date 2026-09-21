/**
 * Métodos de treino aplicados a um exercício (`WorkoutExercise.method`).
 *
 * A fonte de verdade dos slugs é a tabela `training_methods` (slug, name,
 * default_parameters, active). Este módulo guarda apenas:
 * - rótulos de exibição (espelho de `training_methods.name`) para uso síncrono
 *   em markdown/UI sem depender de uma consulta;
 * - formatação curta dos parâmetros;
 * - validação de um método contra o catálogo carregado do banco.
 *
 * Regra de validação: o slug precisa existir e estar ativo; as chaves de
 * `params` só são validadas quando o método tem `default_parameters` — nesse
 * caso, apenas as chaves presentes ali são aceitas.
 */

export interface WorkoutMethodRef {
  slug: string;
  params?: Record<string, string | number>;
}

export interface TrainingMethodCatalogRow {
  slug: string;
  name: string;
  active?: boolean | null;
  default_parameters?: Record<string, unknown> | null;
}

/** Espelho de `training_methods.name` (PT-BR) para exibição offline. */
export const METHOD_LABELS: Record<string, string> = {
  amrap_with_rir_cap: 'AMRAP com RIR cap',
  antagonist_superset: 'Supersérie antagonista',
  blood_flow_restriction: 'BFR',
  cluster_set: 'Cluster set',
  complex_training: 'Complex training',
  contrast_training: 'Contrast training',
  density_sets: 'Densidade (EMOM/etc.)',
  double_progression: 'Dupla progressão',
  drop_set: 'Drop set',
  eccentric_overload: 'Sobrecarga excêntrica',
  isometric_hold: 'Isometria',
  lengthened_partials: 'Parciais em alongamento',
  mechanical_drop_set: 'Drop set mecânico',
  myo_reps: 'Myo-reps',
  non_competing_superset: 'Supersérie não-competitiva',
  one_and_half_reps: 'Reps 1½',
  paused_reps: 'Reps com pausa',
  post_exhaustion: 'Pós-exaustão',
  pre_exhaustion: 'Pré-exaustão',
  ramping_sets: 'Séries em rampa',
  rest_pause: 'Rest-pause',
  tempo_reps: 'Tempo controlado',
  top_set_backoff: 'Top set + back-off',
  traditional_sets: 'Séries tradicionais',
  velocity_based_training: 'VBT',
};

/** Métodos que emparelham dois exercícios do mesmo dia (param `com`). */
export const PAIRED_METHOD_SLUGS = [
  'antagonist_superset',
  'non_competing_superset',
  'pre_exhaustion',
  'post_exhaustion',
  'complex_training',
  'contrast_training',
  'mechanical_drop_set',
];

export const isPairedMethod = (slug?: string | null): boolean =>
  !!slug && PAIRED_METHOD_SLUGS.includes(slug);

export const methodLabel = (
  slug: string,
  catalog?: TrainingMethodCatalogRow[] | null,
): string => {
  const fromCatalog = catalog?.find((m) => m.slug === slug)?.name;
  return fromCatalog || METHOD_LABELS[slug] || slug.replace(/_/g, ' ');
};

const plural = (v: unknown, one: string, many: string) =>
  `${v} ${Number(v) === 1 ? one : many}`;

const PARAM_FORMATTERS: Record<string, (v: string | number) => string> = {
  drops: (v) => plural(v, 'queda', 'quedas'),
  reducao_pct: (v) => `−${v}%`,
  pausa_s: (v) => `pausa ${v}s`,
  minis: (v) => plural(v, 'mini', 'minis'),
  intra_s: (v) => `intra ${v}s`,
  direcao: (v) => String(v),
  tempo: (v) => `tempo ${v}`,
  reps: (v) => `${v} reps`,
  series: (v) => plural(v, 'série', 'séries'),
  segundos: (v) => `${v}s`,
};

/**
 * Texto curto dos parâmetros: "2 quedas, −20%".
 * `resolvePair` traduz o id do par (`params.com`) para o nome do exercício.
 */
export const formatMethodParams = (
  params?: Record<string, string | number> | null,
  resolvePair?: (idOrName: string) => string | null,
): string => {
  if (!params) return '';
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === null || raw === undefined || raw === '') continue;
    if (key === 'com') {
      const name = resolvePair?.(String(raw)) ?? String(raw);
      parts.push(`↔ ${name}`);
      continue;
    }
    const fmt = PARAM_FORMATTERS[key];
    parts.push(fmt ? fmt(raw as string | number) : `${key.replace(/_/g, ' ')}: ${raw}`);
  }
  return parts.join(', ');
};

/** "DROP SET (2 quedas, −20%)" — usado no markdown derivado. */
export const formatMethodForMarkdown = (
  method?: WorkoutMethodRef | null,
  resolvePair?: (idOrName: string) => string | null,
): string => {
  if (!method?.slug) return '';
  const label = methodLabel(method.slug).toUpperCase();
  const params = formatMethodParams(method.params, resolvePair);
  return params ? `${label} (${params})` : label;
};

/** Normaliza um valor cru vindo de JSON legado/IA. Retorna undefined se inválido. */
export const normalizeWorkoutMethod = (raw: unknown): WorkoutMethodRef | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const slug = String(o.slug ?? '').trim();
  if (!slug) return undefined;
  const out: WorkoutMethodRef = { slug };
  const p = o.params;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
      else if (typeof v === 'string' && v.trim() !== '') params[k] = v.trim();
    }
    if (Object.keys(params).length > 0) out.params = params;
  }
  return out;
};

export interface MethodValidationError {
  erro: 'metodo_invalido' | 'params_invalidos';
  slug?: string;
  slugs_validos?: string[];
  chaves_invalidas?: string[];
  chaves_validas?: string[];
}

/** Valida um método contra o catálogo ativo de `training_methods`. */
export const validateWorkoutMethod = (
  method: WorkoutMethodRef,
  catalog: TrainingMethodCatalogRow[],
): MethodValidationError | null => {
  const ativos = catalog.filter((m) => m.active !== false);
  const found = ativos.find((m) => m.slug === method.slug);
  if (!found) {
    return {
      erro: 'metodo_invalido',
      slug: method.slug,
      slugs_validos: ativos.map((m) => m.slug),
    };
  }
  const defaults = found.default_parameters;
  if (defaults && typeof defaults === 'object' && Object.keys(defaults).length > 0 && method.params) {
    const validKeys = Object.keys(defaults);
    const invalid = Object.keys(method.params).filter((k) => k !== 'com' && !validKeys.includes(k));
    if (invalid.length > 0) {
      return {
        erro: 'params_invalidos',
        slug: method.slug,
        chaves_invalidas: invalid,
        chaves_validas: validKeys,
      };
    }
  }
  return null;
};
