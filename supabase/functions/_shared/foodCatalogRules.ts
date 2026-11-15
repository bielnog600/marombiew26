/**
 * Regras puras do banco de alimentos usadas pelo scanner (servidor) e pelo
 * admin (app): nome normalizado, duplicados, produto completo para entrar
 * sozinho no banco e validação dos macros de referência devolvidos pela IA.
 * Sem imports de Deno/npm: o app importa este arquivo direto.
 */

export const normalizeText = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Chave da revisão (food_scan_reviews.product_key): código de barras, senão nome + marca. */
export function productKey(s: { barcode: string | null; product_name: string | null; brand: string | null }): string {
  const bc = String(s.barcode ?? '').trim();
  if (bc) return `bc:${bc}`;
  return `nm:${normalizeText(s.product_name)}|${normalizeText(s.brand)}`;
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

export function findDuplicates<F extends ExistingFood>(draft: { name: string; barcode: string | null }, foods: F[], threshold = 0.85): F[] {
  const bc = String(draft.barcode ?? '').trim();
  return (foods ?? []).filter((f) =>
    (bc && String(f.barcode ?? '').trim() === bc) || nameSimilarity(draft.name, f.name) >= threshold,
  );
}

/** Duplicado de produto de marca: mesmo código, ou nome parecido E mesma marca. */
export function findProductDuplicates<F extends ExistingFood>(draft: { name: string; brand: string | null; barcode: string | null }, foods: F[]): F[] {
  const bc = String(draft.barcode ?? '').trim();
  const brand = normalizeText(draft.brand);
  return (foods ?? []).filter((f) => {
    if (bc && String(f.barcode ?? '').trim() === bc) return true;
    if (!brand) return false;
    const fb = normalizeText(f.brand);
    return !!fb && (fb === brand || fb.includes(brand) || brand.includes(fb)) && nameSimilarity(draft.name, f.name) >= 0.85;
  });
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(x) ? null : x;
};

/** Macros por 100 g de um produto no formato do Open Food Facts. */
export function productPer100(nutriments: any) {
  const m = nutriments ?? {};
  let kcal = n(m['energy-kcal_100g']);
  if (kcal == null && n(m['energy_100g']) != null) kcal = Math.round((n(m['energy_100g'])! / 4.184) * 10) / 10;
  return { kcal, p: n(m.proteins_100g), c: n(m.carbohydrates_100g), g: n(m.fat_100g), fibras: n(m.fiber_100g) };
}

/** Fontes de valores lidas pela IA (rótulo/tabela na foto). */
export const AI_READ_SOURCES = new Set(['tabela_ia', 'foto_rotulo']);
/** Abaixo disto, um rótulo lido pela IA vai para o admin revisar. */
export const AUTO_ADD_MIN_CONFIDENCE = 0.75;

export type AutoAddReason = 'ok' | 'incompleto' | 'duplicado' | 'baixa_confianca' | 'ja_revisado' | 'macros_suspeitos';

export interface AutoAddInput {
  name: string | null | undefined;
  brand: string | null | undefined;
  barcode: string | null | undefined;
  nutriments: any;
  servingQuantity: number | null | undefined;
  source: string | null | undefined;
  /** Confiança da IA quando os valores foram lidos dela (0–1); ausente = não veio da IA. */
  confidence?: number | null;
}

/** kcal ≈ 4P + 4C + 9G (tolerância larga: fibra, álcool e arredondamento do rótulo). */
export function macrosPlausible(m: { kcal: number | null; p: number | null; c: number | null; g: number | null }): boolean {
  if (m.kcal == null || m.p == null || m.c == null || m.g == null) return false;
  if ([m.kcal, m.p, m.c, m.g].some((x) => x < 0)) return false;
  if (m.kcal > 900 || m.p > 100 || m.c > 100 || m.g > 100 || m.p + m.c + m.g > 105) return false;
  const atwater = 4 * m.p + 4 * m.c + 9 * m.g;
  return Math.abs(atwater - m.kcal) <= Math.max(25, m.kcal * 0.25);
}

/**
 * Produto escaneado entra sozinho no banco quando tem nome, marca, kcal/P/C/G,
 * porção, macros coerentes, não tem duplicado (código ou nome+marca), ainda não
 * foi revisado e, se lido pela IA, com confiança alta.
 */
export function autoAddDecision(input: AutoAddInput, foods: ExistingFood[], alreadyReviewed: boolean): { add: boolean; reason: AutoAddReason; duplicates: ExistingFood[] } {
  if (alreadyReviewed) return { add: false, reason: 'ja_revisado', duplicates: [] };
  const name = String(input.name ?? '').trim();
  const brand = String(input.brand ?? '').trim();
  const m = productPer100(input.nutriments);
  const serving = n(input.servingQuantity);
  if (!name || /sem nome/i.test(name) || !brand || m.kcal == null || m.p == null || m.c == null || m.g == null || !(serving != null && serving > 0)) {
    return { add: false, reason: 'incompleto', duplicates: [] };
  }
  if (!macrosPlausible(m)) return { add: false, reason: 'macros_suspeitos', duplicates: [] };
  if (AI_READ_SOURCES.has(String(input.source ?? '')) && !(Number(input.confidence) >= AUTO_ADD_MIN_CONFIDENCE)) {
    return { add: false, reason: 'baixa_confianca', duplicates: [] };
  }
  const dups = findProductDuplicates({ name, brand, barcode: input.barcode ?? null }, foods);
  if (dups.length > 0) return { add: false, reason: 'duplicado', duplicates: dups };
  return { add: true, reason: 'ok', duplicates: [] };
}

/** Linha de foods para um produto adicionado automaticamente (macros por 100 g). */
export function autoAddFoodRow(input: AutoAddInput) {
  const m = productPer100(input.nutriments);
  const r1 = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
  const bc = String(input.barcode ?? '').replace(/\D/g, '') || null;
  return {
    name: String(input.name ?? '').trim().slice(0, 200),
    brand: String(input.brand ?? '').trim().slice(0, 120) || null,
    barcode: bc,
    portion: 'gramas',
    portion_size: 100,
    calories: r1(m.kcal), protein: r1(m.p), carbs: r1(m.c), fats: r1(m.g),
    fiber: m.fibras != null ? r1(m.fibras) : null,
    source: String(input.source ?? '') === 'tabela_ia' ? 'tabela_ia' : bc ? 'openfoodfacts' : 'scanner_rotulo',
    source_food_id: bc,
  };
}

/* ---------- Alimento in natura que não existe no banco ---------- */

export interface ReferenceMacros { kcal: number; p: number; c: number; g: number; fibras: number | null }

/** Tabela citada: TACO (Brasil) ou INSA/PortFIR (Portugal); outra citação da IA é mantida curta. */
export function referenceTableFor(country: 'br' | 'pt', cited?: string | null): string {
  const c = String(cited ?? '').trim();
  if (/taco/i.test(c)) return 'TACO';
  if (/insa|portfir/i.test(c)) return 'INSA/PortFIR';
  if (c) return c.slice(0, 40);
  return country === 'br' ? 'TACO' : 'INSA/PortFIR';
}

/** Macros por 100 g de referência, validados; null quando faltam ou não fazem sentido. */
export function cleanReferenceMacros(raw: any): ReferenceMacros | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = {
    kcal: n(raw.kcal), p: n(raw.proteina ?? raw.p), c: n(raw.carbo ?? raw.c), g: n(raw.gordura ?? raw.g),
  };
  if (!macrosPlausible(m)) return null;
  const f = n(raw.fibra ?? raw.fibras);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { kcal: r1(m.kcal!), p: r1(m.p!), c: r1(m.c!), g: r1(m.g!), fibras: f != null && f >= 0 && f <= 100 ? r1(f) : null };
}

/** Nome do alimento novo: simples, sem marca, com a primeira letra maiúscula. */
export function referenceFoodName(name: string): string {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Antes de criar: já existe um alimento com o mesmo nome normalizado (ou muito parecido)? */
export function findReferenceDuplicate<F extends ExistingFood>(name: string, foods: F[]): F | null {
  const key = normalizeText(name);
  if (!key) return null;
  const exact = (foods ?? []).find((f) => normalizeText(f.name) === key);
  if (exact) return exact;
  return findDuplicates({ name, barcode: null }, (foods ?? []).filter((f) => !f.brand))[0] ?? null;
}
