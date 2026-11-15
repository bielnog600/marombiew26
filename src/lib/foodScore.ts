// Nota estilo Yuka (0–100): 60% nutrição, 30% aditivos, 10% orgânico.
// Puro e testável — usado pelo Scanner de Alimentos.

export type RiskLevel = 'alto' | 'moderado' | 'baixo';

/** E-numbers com risco conhecido (lista local, simplificada). */
export const ADDITIVE_RISK: Record<string, { level: RiskLevel; name: string }> = {
  e250: { level: 'alto', name: 'Nitrito de sódio' },
  e251: { level: 'alto', name: 'Nitrato de sódio' },
  e252: { level: 'alto', name: 'Nitrato de potássio' },
  e249: { level: 'alto', name: 'Nitrito de potássio' },
  e320: { level: 'alto', name: 'BHA' },
  e321: { level: 'alto', name: 'BHT' },
  e171: { level: 'alto', name: 'Dióxido de titânio' },
  e951: { level: 'alto', name: 'Aspartame' },
  e950: { level: 'moderado', name: 'Acessulfame K' },
  e955: { level: 'moderado', name: 'Sucralose' },
  e954: { level: 'moderado', name: 'Sacarina' },
  e952: { level: 'moderado', name: 'Ciclamato' },
  e150c: { level: 'moderado', name: 'Caramelo amoniacal' },
  e150d: { level: 'moderado', name: 'Caramelo sulfito-amoniacal' },
  e621: { level: 'moderado', name: 'Glutamato monossódico' },
  e627: { level: 'baixo', name: 'Guanilato dissódico' },
  e631: { level: 'baixo', name: 'Inosinato dissódico' },
  e102: { level: 'moderado', name: 'Tartrazina' },
  e110: { level: 'moderado', name: 'Amarelo crepúsculo' },
  e129: { level: 'moderado', name: 'Vermelho allura' },
  e211: { level: 'moderado', name: 'Benzoato de sódio' },
  e220: { level: 'moderado', name: 'Dióxido de enxofre' },
  e338: { level: 'moderado', name: 'Ácido fosfórico' },
  e450: { level: 'moderado', name: 'Difosfatos' },
  e407: { level: 'baixo', name: 'Carragena' },
  e466: { level: 'baixo', name: 'Carboximetilcelulose' },
  e471: { level: 'baixo', name: 'Mono e diglicerídeos' },
  e202: { level: 'baixo', name: 'Sorbato de potássio' },
  e330: { level: 'baixo', name: 'Ácido cítrico' },
};

export interface Nutriments {
  'energy-kcal_100g'?: number;
  sugars_100g?: number;
  'saturated-fat_100g'?: number;
  salt_100g?: number;
  sodium_100g?: number;
  proteins_100g?: number;
  fiber_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  [k: string]: unknown;
}

export interface ProductData {
  product_name?: string;
  brands?: string;
  image_front_url?: string;
  nutriments?: Nutriments;
  nutriscore_score?: number | null;
  nutriscore_grade?: string | null;
  additives_tags?: string[];
  labels_tags?: string[];
  ingredients_text?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number;
  /** Categoria do Nutri-Score informada pela IA (bebida, agua, gordura, queijo, geral). */
  nutriscore_category?: string | null;
  categories_tags?: string[];
}

export interface AdditiveInfo { code: string; name: string; level: RiskLevel | 'sem risco' }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function parseAdditives(tags: string[] | undefined): AdditiveInfo[] {
  const out: AdditiveInfo[] = [];
  for (const t of tags ?? []) {
    const code = String(t).replace(/^[a-z]{2}:/, '').toLowerCase().trim();
    if (!/^e\d/.test(code)) continue;
    const base = code.match(/^e\d+[a-z]?/)?.[0] ?? code;
    const known = ADDITIVE_RISK[base] ?? ADDITIVE_RISK[base.replace(/[a-z]$/, '')];
    out.push({ code: base.toUpperCase(), name: known?.name ?? base.toUpperCase(), level: known?.level ?? 'sem risco' });
  }
  return out;
}

/**
 * Categoria do Nutri-Score: as regras mudam para bebidas, gorduras/óleos/
 * oleaginosas e queijos. 'agua' é sempre A. A IA informa a categoria
 * (`nutriscore_category`); sem ela, as categorias do Open Food Facts decidem.
 */
export type NutriScoreCategory = 'geral' | 'bebida' | 'agua' | 'gordura' | 'queijo';
export const NUTRISCORE_CATEGORIES: NutriScoreCategory[] = ['geral', 'bebida', 'agua', 'gordura', 'queijo'];

export function nutriScoreCategory(p: Pick<ProductData, 'nutriscore_category' | 'categories_tags'> | null | undefined): NutriScoreCategory {
  const own = String(p?.nutriscore_category ?? '').toLowerCase();
  if ((NUTRISCORE_CATEGORIES as string[]).includes(own)) return own as NutriScoreCategory;
  const tags = (p?.categories_tags ?? []).map((t) => String(t).toLowerCase());
  const has = (re: RegExp) => tags.some((t) => re.test(t));
  if (has(/:(waters|mineral-waters|spring-waters)$/)) return 'agua';
  if (has(/:cheeses?$/)) return 'queijo';
  if (has(/:(fats|vegetable-oils|olive-oils|oils|butters|margarines|nuts|nut-butters|peanut-butters|seeds)$/)) return 'gordura';
  if (has(/:(milks)$/)) return 'geral';
  if (has(/:(beverages|sodas|juices|fruit-juices|carbonated-drinks|teas|iced-teas|energy-drinks|plant-based-milk-alternatives)$/)) return 'bebida';
  return 'geral';
}

const steps = (v: number, list: number[]) => list.filter((t) => v > t).length;

/** Nutri-Score (algoritmo 2017) a partir dos nutrientes, com as regras da categoria. */
export function computeNutriScore(n: Nutriments, category: NutriScoreCategory = 'geral'): number {
  const kcal = num(n['energy-kcal_100g']);
  const kj = kcal * 4.184;
  const sugar = num(n.sugars_100g);
  const sat = num(n['saturated-fat_100g']);
  const fat = num(n.fat_100g);
  const sodiumMg = n.sodium_100g != null ? num(n.sodium_100g) * 1000 : num(n.salt_100g) * 400;
  const fiber = num(n.fiber_100g);
  const prot = num(n.proteins_100g);
  const fv = num(n['fruits-vegetables-nuts_100g'] ?? n['fruits-vegetables-nuts-estimate-from-ingredients_100g']);
  const beverage = category === 'bebida' || category === 'agua';
  const energyPts = beverage
    ? steps(kj, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270])
    : steps(kj, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]);
  const sugarPts = beverage
    ? steps(sugar, [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5])
    : steps(sugar, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]);
  // Gorduras: a gordura saturada conta pela proporção saturada / gordura total.
  const satPts = category === 'gordura'
    ? steps(fat > 0 ? (sat / fat) * 100 : 0, [10, 16, 22, 28, 34, 40, 46, 52, 58, 64])
    : steps(sat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const neg = energyPts + sugarPts + satPts + steps(sodiumMg, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
  const fvPts = beverage ? (fv > 80 ? 10 : fv > 60 ? 4 : fv > 40 ? 2 : 0) : (fv > 80 ? 5 : fv > 60 ? 2 : fv > 40 ? 1 : 0);
  const fib = steps(fiber, [0.9, 1.9, 2.8, 3.7, 4.7]);
  const pro = steps(prot, [1.6, 3.2, 4.8, 6.4, 8.0]);
  // Queijo: a proteína sempre conta. Demais: com 11+ pontos negativos só conta se frutas/legumes ≥ 5 pontos.
  const countProtein = category === 'queijo' || beverage || neg < 11 || fvPts >= 5;
  return neg - fib - fvPts - (countProtein ? pro : 0);
}

export type NutriGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/** Letra do Nutri-Score pela pontuação e categoria (bebidas têm faixas próprias; água é A). */
export function nutriScoreGrade(score: number, category: NutriScoreCategory = 'geral'): NutriGrade {
  if (category === 'agua') return 'A';
  if (category === 'bebida') return score <= 1 ? 'B' : score <= 5 ? 'C' : score <= 9 ? 'D' : 'E';
  return score <= -1 ? 'A' : score <= 2 ? 'B' : score <= 10 ? 'C' : score <= 18 ? 'D' : 'E';
}

/** Faixas de pontos (sólidos) de cada letra; a nota 0–100 vem da posição dentro da faixa. */
const SOLID_BANDS: Record<NutriGrade, [number, number]> = { A: [-15, -1], B: [0, 2], C: [3, 10], D: [11, 18], E: [19, 40] };
const BEVERAGE_BANDS: Record<NutriGrade, [number, number]> = { A: [-15, -15], B: [-15, 1], C: [2, 5], D: [6, 9], E: [10, 40] };
const solidQuality = (s: number) => clamp(((40 - s) / 55) * 100);

/** Pontos do Nutri-Score → qualidade 0–100 (bebidas entram na mesma escala pela letra). */
export function nutriPointsToQuality(score: number, category: NutriScoreCategory = 'geral'): number {
  if (category === 'agua') return 100;
  if (category !== 'bebida') return solidQuality(score);
  const grade = nutriScoreGrade(score, 'bebida');
  const [lo, hi] = BEVERAGE_BANDS[grade];
  const [slo, shi] = SOLID_BANDS[grade];
  const t = hi > lo ? (Math.max(lo, Math.min(hi, score)) - lo) / (hi - lo) : 0;
  return solidQuality(slo + t * (shi - slo));
}

export function nutritionQuality(p: ProductData): number {
  // Nota oficial do Open Food Facts vale como veio; sem ela, calcula com as regras da categoria.
  if (typeof p.nutriscore_score === 'number') return solidQuality(p.nutriscore_score);
  const category = nutriScoreCategory(p);
  return nutriPointsToQuality(computeNutriScore(p.nutriments ?? {}, category), category);
}

export function additivesQuality(list: AdditiveInfo[]): number {
  let q = 100;
  for (const a of list) {
    if (a.level === 'alto') q -= 60;
    else if (a.level === 'moderado') q -= 30;
    else if (a.level === 'baixo') q -= 10;
  }
  return clamp(q);
}

export const isOrganic = (labels?: string[]) =>
  (labels ?? []).some((l) => /organic|bio|organico|orgânico/i.test(String(l)));

export type ScoreLabel = 'Mau' | 'Medíocre' | 'Bom' | 'Excelente';

export function scoreLabel(score: number): ScoreLabel {
  if (score < 25) return 'Mau';
  if (score < 50) return 'Medíocre';
  if (score < 75) return 'Bom';
  return 'Excelente';
}

export function computeFoodScore(p: ProductData) {
  const additives = parseAdditives(p.additives_tags);
  const nutrition = nutritionQuality(p);
  const add = additivesQuality(additives);
  const organic = isOrganic(p.labels_tags) ? 100 : 0;
  let score = Math.round(nutrition * 0.6 + add * 0.3 + organic * 0.1);
  if (additives.some((a) => a.level === 'alto')) score = Math.min(score, 49);
  score = clamp(score);
  return { score, label: scoreLabel(score), additives, organic: organic > 0 };
}

export type Level = 'baixo' | 'moderado' | 'alto';

/** Limiares por 100 g (inspirados no Nutri-Score/Yuka). */
export function classifyNutrient(key: 'kcal' | 'sugar' | 'satfat' | 'salt', v: number): Level {
  const t = { kcal: [160, 360], sugar: [9, 18], satfat: [2, 4], salt: [0.46, 0.92] }[key];
  return v < t[0] ? 'baixo' : v < t[1] ? 'moderado' : 'alto';
}

export function classifyPositive(key: 'protein' | 'fiber', v: number): 'bom' | 'razoável' | 'pouco' {
  const t = { protein: [4.8, 8], fiber: [1.9, 3.5] }[key];
  return v >= t[1] ? 'bom' : v >= t[0] ? 'razoável' : 'pouco';
}

export function saltOf(n: Nutriments): number {
  if (n.salt_100g != null) return num(n.salt_100g);
  if (n.sodium_100g != null) return num(n.sodium_100g) * 2.5;
  return 0;
}

export function macrosFor(n: Nutriments, grams: number) {
  const f = grams / 100;
  const r = (v: unknown) => Math.round(num(v) * f * 10) / 10;
  return {
    kcal: Math.round(num(n['energy-kcal_100g']) * f),
    protein: r(n.proteins_100g),
    carbs: r(n.carbohydrates_100g),
    fat: r(n.fat_100g),
  };
}
