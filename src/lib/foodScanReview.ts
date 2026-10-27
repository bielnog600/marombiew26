// Pure helpers for the admin "Alimentos escaneados" review screen.

export type ReviewStatus = 'pendente' | 'adicionado' | 'ignorado';

export interface ScanRow {
  id: string;
  aluno_id: string;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
  image_url: string | null;
  score: number | null;
  score_label: string | null;
  nutriments: any;
  created_at: string;
}

export interface Per100 { kcal: number | null; p: number | null; c: number | null; g: number | null; fibras: number | null; sal: number | null }

export interface ProductGroup {
  key: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  image_url: string | null;
  score: number | null;
  score_label: string | null;
  per100: Per100;
  count: number;
  alunoIds: string[];
  lastScanAt: string;
  servingQuantity: number | null;
  quantity: string | null;
}

export const normalizeText = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function productKey(s: { barcode: string | null; product_name: string | null; brand: string | null }): string {
  const bc = (s.barcode ?? '').trim();
  if (bc) return `bc:${bc}`;
  return `nm:${normalizeText(s.product_name)}|${normalizeText(s.brand)}`;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function per100(n: any): Per100 {
  n = n ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n['energy_100g']) != null) kcal = Math.round((num(n['energy_100g'])! / 4.184) * 10) / 10;
  let sal = num(n['salt_100g']);
  if (sal == null && num(n['sodium_100g']) != null) sal = Math.round(num(n['sodium_100g'])! * 2.5 * 100) / 100;
  return {
    kcal,
    p: num(n['proteins_100g']),
    c: num(n['carbohydrates_100g']),
    g: num(n['fat_100g']),
    fibras: num(n['fiber_100g']),
    sal,
  };
}

/** Groups scans by product; newest scan supplies the displayed data. */
export function groupScans(scans: ScanRow[]): ProductGroup[] {
  const sorted = [...scans].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const map = new Map<string, ProductGroup>();
  for (const s of sorted) {
    const key = productKey(s);
    const g = map.get(key);
    if (g) {
      g.count++;
      if (!g.alunoIds.includes(s.aluno_id)) g.alunoIds.push(s.aluno_id);
      if (!g.image_url && s.image_url) g.image_url = s.image_url;
      continue;
    }
    map.set(key, {
      key,
      barcode: s.barcode?.trim() || null,
      name: s.product_name?.trim() || 'Produto sem nome',
      brand: s.brand?.trim() || null,
      image_url: s.image_url,
      score: s.score,
      score_label: s.score_label,
      per100: per100(s.nutriments),
      count: 1,
      alunoIds: [s.aluno_id],
      lastScanAt: s.created_at,
      servingQuantity: num(s.nutriments?.serving_quantity),
      quantity: s.nutriments?.quantity ?? null,
    });
  }
  return [...map.values()];
}

export interface FoodDraft {
  name: string;
  portion: string;
  portion_size: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  brand: string | null;
  source: string | null;
  barcode: string | null;
  source_food_id: string | null;
}

const r1 = (v: number | null) => (v == null ? 0 : Math.round(v * 10) / 10);

/** Maps a scanned product to the foods table. Macros in foods are per portion_size grams. */
export function mapGroupToFood(g: ProductGroup): FoodDraft {
  const size = 100;
  const f = size / 100;
  return {
    name: g.name,
    portion: 'gramas',
    portion_size: size,
    calories: r1((g.per100.kcal ?? 0) * f),
    protein: r1((g.per100.p ?? 0) * f),
    carbs: r1((g.per100.c ?? 0) * f),
    fats: r1((g.per100.g ?? 0) * f),
    brand: g.brand,
    source: g.barcode ? 'openfoodfacts' : 'scanner_rotulo',
    barcode: g.barcode,
    source_food_id: g.barcode,
  };
}

/** Dice coefficient over word bigrams — cheap fuzzy similarity. */
export function nameSimilarity(a: string, b: string): number {
  const A = normalizeText(a), B = normalizeText(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const grams = (s: string) => { const out: string[] = []; const t = s.replace(/ /g, ''); for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
  const ga = grams(A), gb = grams(B);
  const counts = new Map<string, number>();
  ga.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  let hit = 0;
  gb.forEach((x) => { const c = counts.get(x) ?? 0; if (c > 0) { hit++; counts.set(x, c - 1); } });
  return (2 * hit) / (ga.length + gb.length || 1);
}

export interface ExistingFood { id: string; name: string; brand: string | null; barcode: string | null }

export function findDuplicates(draft: { name: string; barcode: string | null }, foods: ExistingFood[], threshold = 0.85) {
  const bc = (draft.barcode ?? '').trim();
  return foods.filter((f) =>
    (bc && (f.barcode ?? '').trim() === bc) || nameSimilarity(draft.name, f.name) >= threshold,
  );
}
