/**
 * nutritionCore — núcleo puro de cálculo nutricional, compartilhado entre o app
 * (via `src/lib/nutritionEngine.ts`) e as Edge Functions (diet-agent).
 *
 * NÃO existe segunda implementação matemática: qualquer consumidor usa este
 * arquivo.
 *
 * Regras (Fase 1):
 *  - o registro em `foods` é a autoridade durante geração/edição;
 *  - o `nutritionSnapshot` é a autoridade histórica de um plano publicado;
 *  - NUNCA substituir `foods.calories` por p*4 + c*4 + g*9 (a conta 4/4/9 só
 *    serve para coerência/distribuição/detecção de valor suspeito);
 *  - precisão integral nos cálculos; arredondar apenas na apresentação;
 *  - nenhum fuzzy match silencioso: sem correspondência exata → unresolved.
 */

export const NUTRITION_ENGINE_VERSION = '1.0';
export const NUTRITION_SNAPSHOT_VERSION = '1.0';

export interface EngineMacros {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

export const ZERO_MACROS: EngineMacros = { kcal: 0, p: 0, c: 0, g: 0 };

/** Registro da base alimentar (subset usado pelo motor). */
export interface FoodRecord {
  id: string;
  name: string;
  /** gramas correspondentes aos valores cadastrados (default 100). */
  portion_size?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  /** Metadata de identidade (Fase 4) — todos opcionais. */
  brand?: string | null;
  source?: string | null;
  barcode?: string | null;
  sourceFoodId?: string | null;
  /** Nome da coluna no banco; mantido para adapters diretos. */
  portion?: string | null;
}

export interface NutritionSnapshot {
  version: string;
  portionSize: number;
  kcal: number;
  p: number;
  c: number;
  g: number;
  brand?: string | null;
  source?: string | null;
}

export type ResolutionStatus =
  | 'resolved_by_id'
  | 'resolved_by_name'
  | 'unresolved'
  | 'snapshot';

/** Item mínimo que o motor sabe calcular. */
export interface EngineItem {
  foodId?: string | null;
  name: string;
  qtyGrams?: number | null;
  nutritionSnapshot?: NutritionSnapshot | null;
  /** Macros previamente armazenados (IA/legado) — nunca são autoridade. */
  macros?: Partial<EngineMacros> | null;
  manualLocked?: boolean;
}

/** Rascunho = base manda. Publicado = snapshot manda. */
export type PlanMode = 'draft' | 'published';

export interface FoodIndex {
  byId: Map<string, FoodRecord>;
  byName: Map<string, FoodRecord[]>;
}

/* -------------------------------------------------------------------------- */
/* Normalização e índice                                                      */
/* -------------------------------------------------------------------------- */

/** Só diferenças simples: caixa, acentos e espaços. Sem remoção semântica. */
export const normalizeFoodName = (value: string): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const buildFoodIndex = (foods: FoodRecord[]): FoodIndex => {
  const byId = new Map<string, FoodRecord>();
  const byName = new Map<string, FoodRecord[]>();
  for (const food of foods ?? []) {
    if (food?.id) byId.set(food.id, food);
    const key = normalizeFoodName(food?.name ?? '');
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(food);
    else byName.set(key, [food]);
  }
  return { byId, byName };
};

/* -------------------------------------------------------------------------- */
/* Resolução do alimento                                                      */
/* -------------------------------------------------------------------------- */

export interface ResolvedFood {
  status: ResolutionStatus;
  food: FoodRecord | null;
  snapshot: NutritionSnapshot | null;
  /** true quando havia mais de um registro com o mesmo nome normalizado. */
  ambiguous: boolean;
}

/**
 * Política de resolução (Fase 4):
 *  - `legacy` (default): plano antigo sem foodId → fallback por nome EXATO;
 *    zero match ou nome duplicado → unresolved (ambiguous quando duplicado).
 *  - `strict_id`: geração nova pelo contrato da IA → só o foodId resolve.
 *    Um ID inválido NUNCA é mascarado por um match de nome.
 */
export type ResolutionPolicy = 'legacy' | 'strict_id';

export const resolveFoodForItem = (
  item: EngineItem,
  index: FoodIndex,
  mode: PlanMode = 'draft',
  policy: ResolutionPolicy = 'legacy',
): ResolvedFood => {
  // Plano publicado com snapshot → autoridade histórica.
  if (mode === 'published' && item.nutritionSnapshot) {
    return {
      status: 'snapshot',
      food: item.foodId ? index.byId.get(item.foodId) ?? null : null,
      snapshot: item.nutritionSnapshot,
      ambiguous: false,
    };
  }

  if (item.foodId) {
    const byId = index.byId.get(item.foodId);
    if (byId) {
      return { status: 'resolved_by_id', food: byId, snapshot: null, ambiguous: false };
    }
  }

  if (policy === 'strict_id') {
    return { status: 'unresolved', food: null, snapshot: item.nutritionSnapshot ?? null, ambiguous: false };
  }

  const matches = index.byName.get(normalizeFoodName(item.name)) ?? [];
  if (matches.length === 1) {
    return { status: 'resolved_by_name', food: matches[0], snapshot: null, ambiguous: false };
  }

  return {
    status: 'unresolved',
    food: null,
    snapshot: item.nutritionSnapshot ?? null,
    ambiguous: matches.length > 1,
  };
};

/* -------------------------------------------------------------------------- */
/* Cálculo                                                                    */
/* -------------------------------------------------------------------------- */

const portionOf = (value?: number | null): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 100;
};

const numberOr0 = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** kcal teóricas pelos macros — SOMENTE para coerência/distribuição. */
export const kcalFromMacros = (m: Pick<EngineMacros, 'p' | 'c' | 'g'>): number =>
  m.p * 4 + m.c * 4 + m.g * 9;

/** Divergência > 22% entre kcal cadastradas e 4/4/9. Não corrige nada. */
export const isMacroSetSuspicious = (m: EngineMacros): boolean => {
  const calc = kcalFromMacros(m);
  if (m.kcal <= 0) return calc > 0;
  const ratio = calc / m.kcal;
  return ratio < 0.78 || ratio > 1.22;
};

export interface ItemComputation {
  status: ResolutionStatus;
  food: FoodRecord | null;
  ambiguous: boolean;
  /** true quando os macros vieram da base ou do snapshot (não da IA/legado). */
  validated: boolean;
  qtyGrams: number;
  macros: EngineMacros;
  suspicious: boolean;
}

/**
 * Macros de UM item, em precisão integral.
 * Item unresolved usa os macros previamente armazenados apenas como estimativa
 * (validated = false) — nunca é apresentado como conferido pela base.
 */
export const computeItemMacros = (
  item: EngineItem,
  index: FoodIndex,
  mode: PlanMode = 'draft',
  policy: ResolutionPolicy = 'legacy',
): ItemComputation => {
  const resolved = resolveFoodForItem(item, index, mode, policy);
  const qtyGrams = Math.max(0, numberOr0(item.qtyGrams));

  if (resolved.status === 'snapshot' && resolved.snapshot) {
    const scale = qtyGrams / portionOf(resolved.snapshot.portionSize);
    const macros: EngineMacros = {
      kcal: resolved.snapshot.kcal * scale,
      p: resolved.snapshot.p * scale,
      c: resolved.snapshot.c * scale,
      g: resolved.snapshot.g * scale,
    };
    return {
      status: resolved.status,
      food: resolved.food,
      ambiguous: false,
      validated: true,
      qtyGrams,
      macros,
      suspicious: isMacroSetSuspicious(macros),
    };
  }

  if (resolved.food) {
    const scale = qtyGrams / portionOf(resolved.food.portion_size);
    const macros: EngineMacros = {
      kcal: numberOr0(resolved.food.calories) * scale,
      p: numberOr0(resolved.food.protein) * scale,
      c: numberOr0(resolved.food.carbs) * scale,
      g: numberOr0(resolved.food.fats) * scale,
    };
    return {
      status: resolved.status,
      food: resolved.food,
      ambiguous: false,
      validated: true,
      qtyGrams,
      macros,
      suspicious: isMacroSetSuspicious(macros),
    };
  }

  const fallback: EngineMacros = {
    kcal: numberOr0(item.macros?.kcal),
    p: numberOr0(item.macros?.p),
    c: numberOr0(item.macros?.c),
    g: numberOr0(item.macros?.g),
  };
  return {
    status: 'unresolved',
    food: null,
    ambiguous: resolved.ambiguous,
    validated: false,
    qtyGrams,
    macros: fallback,
    suspicious: isMacroSetSuspicious(fallback),
  };
};

const addMacros = (a: EngineMacros, b: EngineMacros): EngineMacros => ({
  kcal: a.kcal + b.kcal,
  p: a.p + b.p,
  c: a.c + b.c,
  g: a.g + b.g,
});

export interface MealComputation {
  items: ItemComputation[];
  totals: EngineMacros;
  unresolvedNames: string[];
}

/** Soma em precisão integral — nunca soma valores já arredondados. */
export const computeMealTotals = (
  items: EngineItem[],
  index: FoodIndex,
  mode: PlanMode = 'draft',
  policy: ResolutionPolicy = 'legacy',
): MealComputation => {
  const computed = (items ?? []).map((it) => computeItemMacros(it, index, mode, policy));
  const totals = computed.reduce<EngineMacros>((acc, it) => addMacros(acc, it.macros), ZERO_MACROS);
  return {
    items: computed,
    totals,
    // O nome acompanha o próprio item computado (índices alinhados com `items`).
    unresolvedNames: computed
      .map((c, i) => (c.status === 'unresolved' ? (items ?? [])[i]?.name : null))
      .filter((n): n is string => Boolean(n)),
  };
};

export interface DayComputation {
  meals: MealComputation[];
  totals: EngineMacros;
  unresolvedNames: string[];
}

export const computeDayTotals = (
  meals: Array<{ items: EngineItem[] }>,
  index: FoodIndex,
  mode: PlanMode = 'draft',
): DayComputation => {
  const computedMeals = (meals ?? []).map((m) => computeMealTotals(m.items ?? [], index, mode));
  const totals = computedMeals.reduce<EngineMacros>((acc, m) => addMacros(acc, m.totals), ZERO_MACROS);
  const unresolvedNames = Array.from(
    new Set(computedMeals.flatMap((m) => m.unresolvedNames)),
  );
  return { meals: computedMeals, totals, unresolvedNames };
};

/** current − target, em precisão integral. */
export const diffToTarget = (current: EngineMacros, target: EngineMacros): EngineMacros => ({
  kcal: current.kcal - target.kcal,
  p: current.p - target.p,
  c: current.c - target.c,
  g: current.g - target.g,
});

/* -------------------------------------------------------------------------- */
/* Apresentação                                                               */
/* -------------------------------------------------------------------------- */

const round = (n: number, decimals: number) => {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
};

/** Arredondamento SOMENTE de apresentação (kcal inteiro, macros 1 casa). */
export const roundForDisplay = (m: EngineMacros): EngineMacros => ({
  kcal: Math.round(m.kcal),
  p: round(m.p, 1),
  c: round(m.c, 1),
  g: round(m.g, 1),
});

/** Distribuição energética (%) — usa 4/4/9, apenas informativo. */
export const energyDistribution = (m: EngineMacros) => {
  const total = kcalFromMacros(m);
  if (total <= 0) return { p: 0, c: 0, g: 0 };
  return {
    p: round((m.p * 4 * 100) / total, 1),
    c: round((m.c * 4 * 100) / total, 1),
    g: round((m.g * 9 * 100) / total, 1),
  };
};

/* -------------------------------------------------------------------------- */
/* Papel do alimento (macro_role)                                             */
/* -------------------------------------------------------------------------- */

export type MacroRole = 'protein' | 'carb' | 'fat' | 'mixed' | 'low_calorie';

/** Classifica pelo perfil energético do alimento (por porção ou por item). */
export const classifyMacroRole = (m: EngineMacros): MacroRole => {
  const kcal = m.kcal > 0 ? m.kcal : kcalFromMacros(m);
  if (kcal < 30) return 'low_calorie';
  const shares = {
    protein: (m.p * 4) / kcal,
    carb: (m.c * 4) / kcal,
    fat: (m.g * 9) / kcal,
  };
  const entries = Object.entries(shares) as Array<[Exclude<MacroRole, 'mixed' | 'low_calorie'>, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topValue] = entries[0];
  const secondValue = entries[1][1];
  if (topValue >= 0.5 && topValue - secondValue >= 0.2) return topKey;
  return 'mixed';
};

export const foodMacroRole = (food: FoodRecord): MacroRole =>
  classifyMacroRole({
    kcal: numberOr0(food.calories),
    p: numberOr0(food.protein),
    c: numberOr0(food.carbs),
    g: numberOr0(food.fats),
  });

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

export const makeNutritionSnapshot = (food: FoodRecord): NutritionSnapshot => ({
  version: NUTRITION_SNAPSHOT_VERSION,
  portionSize: portionOf(food.portion_size),
  kcal: numberOr0(food.calories),
  p: numberOr0(food.protein),
  c: numberOr0(food.carbs),
  g: numberOr0(food.fats),
  ...(food.brand != null ? { brand: food.brand } : {}),
  ...(food.source != null ? { source: food.source } : {}),
});

export interface SnapshotDivergence {
  diverged: boolean;
  /** Valores por porção: snapshot × base atual. */
  snapshot: NutritionSnapshot;
  current: NutritionSnapshot | null;
  fields: Array<'portionSize' | 'kcal' | 'p' | 'c' | 'g'>;
}

/**
 * Compara o snapshot salvo com o registro atual da base.
 * NÃO altera nada — a atualização é sempre decisão explícita do treinador.
 */
export const compareSnapshotToFood = (
  snapshot: NutritionSnapshot,
  food: FoodRecord | null,
): SnapshotDivergence => {
  if (!food) return { diverged: false, snapshot, current: null, fields: [] };
  const current = makeNutritionSnapshot(food);
  const fields: SnapshotDivergence['fields'] = [];
  const keys: SnapshotDivergence['fields'] = ['portionSize', 'kcal', 'p', 'c', 'g'];
  for (const key of keys) {
    if (Math.abs(numberOr0(snapshot[key]) - numberOr0(current[key])) > 0.05) fields.push(key);
  }
  return { diverged: fields.length > 0, snapshot, current, fields };
};
