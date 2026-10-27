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

/** Nutri-Score (algoritmo 2017, sólidos) a partir dos nutrientes, quando não vier pronto. */
export function computeNutriScore(n: Nutriments): number {
  const kj = num(n['energy-kcal_100g']) * 4.184;
  const sugar = num(n.sugars_100g);
  const sat = num(n['saturated-fat_100g']);
  const sodiumMg = n.sodium_100g != null ? num(n.sodium_100g) * 1000 : num(n.salt_100g) * 400;
  const fiber = num(n.fiber_100g);
  const prot = num(n.proteins_100g);
  const steps = (v: number, list: number[]) => list.filter((t) => v > t).length;
  const neg =
    steps(kj, [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350]) +
    steps(sugar, [4.5, 9, 13.5, 18, 22.5, 27, 31, 36, 40, 45]) +
    steps(sat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) +
    steps(sodiumMg, [90, 180, 270, 360, 450, 540, 630, 720, 810, 900]);
  const fib = steps(fiber, [0.9, 1.9, 2.8, 3.7, 4.7]);
  const pro = steps(prot, [1.6, 3.2, 4.8, 6.4, 8.0]);
  return neg >= 11 ? neg - fib : neg - fib - pro;
}

export function nutritionQuality(p: ProductData): number {
  const s = typeof p.nutriscore_score === 'number' ? p.nutriscore_score : computeNutriScore(p.nutriments ?? {});
  // -15 (melhor) … 40 (pior) → 100 … 0
  return clamp(((40 - s) / 55) * 100);
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
