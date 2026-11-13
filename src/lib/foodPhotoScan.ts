/**
 * Scanner de alimentos por foto — regras puras. A IA (food-scanner,
 * `identify_photo`) diz o que é; aqui fica a ordem para achar os valores do
 * produto embalado (código lido → já conhecido no app → Open Food Facts →
 * tabela lida pela IA), o peso médio por unidade dos alimentos in natura e o
 * registro na refeição do dia (mesmo meal_weigh_logs da pesagem, origem
 * 'escaneado'). Nada aqui chama a IA, o banco ou o navegador.
 */
import { macrosFor, type ProductData } from '@/lib/foodScore';
import {
  buildUnweighedEntries, buildWeighLogRow, macrosForGrams, matchPlanFood, matchWeighFood,
  pendingPlanFoods, plannedFromMeal, round1,
  type PlannedMeal, type UnweighedChoice, type WeighFood, type WeighLogRecord, type WeighedItem,
} from '@/lib/mealWeigh';
import { startFromWeighLog, upsertWeighedItem } from '@/lib/mealWeigh/editItems';
import { replaceMealWithScan } from '@/lib/mealWeigh/scanApply';
import type { ParsedMeal } from '@/lib/dietResultParser';

export type PhotoKind = 'embalado' | 'in_natura' | 'prato';
export type UnitSize = 'pequeno' | 'medio' | 'grande';

interface TableMacros { kcal: number | null; proteina: number | null; carbo: number | null; gordura: number | null; acucar: number | null; fibra: number | null; sodio_mg: number | null }

/** Resposta do `identify_photo` (já normalizada no servidor). */
export interface PhotoIdentity {
  tipo: PhotoKind;
  marca: string | null;
  produto: string;
  variante: string | null;
  codigo_barras_visivel: string | null;
  tabela_nutricional_visivel: boolean;
  tabela: { porcao_g: number | null; por_100g: TableMacros | null; por_porcao: TableMacros | null } | null;
  alimento: string;
  tamanho: UnitSize;
  unidades: number;
  peso_balanca_g: number | null;
  confianca: number;
}

export const LABEL_PHOTO_MESSAGE = 'Tira uma foto da tabela nutricional';

/* ---------------- Produto embalado: ordem de busca ---------------- */

/** De onde vieram os valores — é a "origem" que o admin vê na revisão. */
export type ProductSource = 'openfoodfacts' | 'base' | 'cache' | 'openfoodfacts_busca' | 'tabela_ia' | 'foto_rotulo';

export const PRODUCT_SOURCE_LABEL: Record<string, string> = {
  openfoodfacts: 'Open Food Facts (código de barras)',
  openfoodfacts_busca: 'Open Food Facts (busca por nome)',
  tabela_ia: 'Tabela lida pela IA',
  foto_rotulo: 'Rótulo lido pela IA',
  base: 'Base de alimentos',
  cache: 'Já escaneado no app',
};

export interface OffCandidate { barcode: string | null; product: ProductData }

export type PackagedResolution =
  | { kind: 'product'; source: ProductSource; product: ProductData; barcode: string | null; foodId?: string | null }
  | { kind: 'candidates'; candidates: OffCandidate[] }
  | { kind: 'need_label' };

export interface PackagedDeps {
  /** Fluxo atual do código de barras (cache do servidor + Open Food Facts). */
  lookupBarcode: (barcode: string) => Promise<ProductData | null>;
  /** Mesma marca + produto já aprovado na base ou escaneado antes no app. */
  findKnown: (q: { brand: string | null; product: string; variant: string | null }) => Promise<{ source: 'base' | 'cache'; product: ProductData; barcode: string | null; foodId?: string | null } | null>;
  /** Open Food Facts por nome + marca. */
  searchOff: (q: { brand: string | null; product: string; variant: string | null }) => Promise<OffCandidate[]>;
}

/**
 * Ordem: (a) código de barras lido na foto → fluxo atual; (b) produto já
 * conhecido no app; (c) Open Food Facts por nome+marca (até 3 para o aluno
 * confirmar); (d) tabela nutricional visível na foto; senão pede a foto da tabela.
 */
export async function resolvePackagedProduct(id: PhotoIdentity, deps: PackagedDeps): Promise<PackagedResolution> {
  if (id.codigo_barras_visivel) {
    const p = await deps.lookupBarcode(id.codigo_barras_visivel).catch(() => null);
    if (p) return { kind: 'product', source: 'openfoodfacts', product: p, barcode: id.codigo_barras_visivel };
  }
  const q = { brand: id.marca, product: id.produto, variant: id.variante };
  if (id.produto) {
    const known = await deps.findKnown(q).catch(() => null);
    if (known) return { kind: 'product', source: known.source, product: known.product, barcode: known.barcode ?? id.codigo_barras_visivel, foodId: known.foodId ?? null };
    const candidates = (await deps.searchOff(q).catch(() => [] as OffCandidate[])).slice(0, 3);
    if (candidates.length > 0) return { kind: 'candidates', candidates };
  }
  const fromTable = tableToProduct(id);
  if (fromTable) return { kind: 'product', source: 'tabela_ia', product: fromTable, barcode: id.codigo_barras_visivel };
  return { kind: 'need_label' };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Tabela lida pela IA (por 100 g e/ou por porção) → formato do scanner (por 100 g). */
export function tableToProduct(id: PhotoIdentity): ProductData | null {
  const t = id.tabela;
  if (!id.tabela_nutricional_visivel || !t) return null;
  const portion = Number(t.porcao_g) || null;
  let base: TableMacros | null = t.por_100g;
  let k = 1;
  if (!base && t.por_porcao && portion) { base = t.por_porcao; k = 100 / portion; }
  if (!base || base.kcal == null) return null;
  const v = (x: number | null) => (x == null ? undefined : r1(x * k));
  const sodiumG = base.sodio_mg != null ? (base.sodio_mg * k) / 1000 : null;
  return {
    product_name: [id.produto, id.variante].filter(Boolean).join(' ') || 'Produto sem nome',
    brands: id.marca ?? undefined,
    nutriments: {
      'energy-kcal_100g': v(base.kcal), proteins_100g: v(base.proteina), carbohydrates_100g: v(base.carbo),
      fat_100g: v(base.gordura), sugars_100g: v(base.acucar), fiber_100g: v(base.fibra),
      ...(sodiumG != null ? { sodium_100g: Math.round(sodiumG * 1000) / 1000, salt_100g: Math.round(sodiumG * 2.5 * 100) / 100 } : {}),
    },
    serving_quantity: portion,
  } as ProductData;
}

/** Open Food Facts do país do aluno: Brasil pelo idioma do aparelho, senão Portugal. */
export const scanCountry = (lang: string | null | undefined): 'br' | 'pt' => (/^pt-br/i.test(String(lang ?? '')) ? 'br' : 'pt');

/* ---------------- In natura: peso médio por unidade ---------------- */

export interface UnitWeightRow { food_id: string; tamanho: UnitSize; gramas: number }

/** Peso da unidade no tamanho pedido; sem esse tamanho usa o médio, depois qualquer um. */
export function unitGramsFor(foodId: string | null | undefined, size: UnitSize, rows: UnitWeightRow[]): number | null {
  if (!foodId) return null;
  const mine = (rows ?? []).filter((r) => r.food_id === foodId && Number(r.gramas) > 0);
  const hit = mine.find((r) => r.tamanho === size) ?? mine.find((r) => r.tamanho === 'medio') ?? mine[0];
  return hit ? Number(hit.gramas) : null;
}

const SIZE_WORD: Record<UnitSize, [string, string]> = { pequeno: ['pequeno', 'pequena'], medio: ['médio', 'média'], grande: ['grande', 'grande'] };
/** "Banana média ≈ 120 g" / "Ovo médio ≈ 50 g" */
export function unitLabel(name: string, size: UnitSize, grams: number): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  const feminine = /(a|ã)$/i.test(first);
  return `${name} ${SIZE_WORD[size][feminine ? 1 : 0]} ≈ ${Math.round(grams)} g`;
}

export interface NaturaPortion {
  food: WeighFood | null;
  unitGrams: number | null;
  units: number;
  grams: number;
  /** As gramas vieram do visor da balança na foto. */
  fromScale: boolean;
}

/** Porção inicial: peso do visor se houver; senão unidades × peso médio; sem peso médio, 100 g. */
export function naturaPortion(id: PhotoIdentity, foods: WeighFood[], rows: UnitWeightRow[]): NaturaPortion {
  const food = matchWeighFood(id.alimento || id.produto, foods);
  const unitGrams = unitGramsFor(food?.id, id.tamanho, rows);
  const units = Math.max(1, Math.round(id.unidades || 1));
  if (id.peso_balanca_g != null && id.peso_balanca_g > 0) return { food, unitGrams, units, grams: round1(id.peso_balanca_g), fromScale: true };
  return { food, unitGrams, units, grams: unitGrams ? round1(unitGrams * units) : 100, fromScale: false };
}

/** Macros de uma unidade e de 100 g. */
export function naturaMacros(food: WeighFood, unitGrams: number | null) {
  return { perUnit: unitGrams ? macrosForGrams(food, unitGrams) : null, per100: macrosForGrams(food, 100) };
}

/* ---------------- Registrar na refeição do dia ---------------- */

/** Item "Escaneado" de um produto embalado (macros do rótulo, por 100 g). */
export function scannedProductItem(name: string, brand: string | null, product: ProductData, grams: number, foodId: string | null = null): WeighedItem {
  const g = round1(Math.max(0, Number(grams) || 0));
  const m = macrosFor(product.nutriments ?? {}, g);
  return {
    alimento: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    food_id: foodId, gramas: g, kcal: Math.round(m.kcal), p: round1(m.protein), c: round1(m.carbs), g: round1(m.fat),
    foto_url: null, editado_pelo_aluno: false, indice_plano: null, origem: 'escaneado',
  };
}

/** Item "Escaneado" de um alimento da base (in natura). */
export function scannedFoodItem(food: WeighFood, grams: number): WeighedItem {
  const g = round1(Math.max(0, Number(grams) || 0));
  const m = macrosForGrams(food, g);
  return {
    alimento: food.name, food_id: String(food.id ?? '').startsWith('plano:') ? null : food.id, gramas: g,
    kcal: Math.round(m.kcal), p: round1(m.p), c: round1(m.c), g: round1(m.g),
    foto_url: null, editado_pelo_aluno: false, indice_plano: null, origem: 'escaneado',
  };
}

/** Linha nova de meal_weigh_logs (sem student/date) com o item escaneado. */
export interface ScanMealLogRow {
  items: WeighedItem[];
  unweighed: ReturnType<typeof buildUnweighedEntries>;
  planned: PlannedMeal & { comparacao: unknown[] };
  total_kcal: number;
  total_p: number;
  total_c: number;
  total_g: number;
}

/**
 * O item escaneado entra na refeição do dia. 'add' (padrão) = pesagem
 * incremental: parte do registro mais recente (itens e escolhas preservados)
 * ou, sem registro, do plano com os outros alimentos como "Comi sem pesar";
 * um alimento do plano ainda não registrado com o mesmo nome passa a ser esse
 * item. 'replace' = o escaneado vira a refeição: os itens antigos saem e os
 * alimentos do plano que não batem com ele ficam "Não comi".
 */
export function buildScanMealLog(
  meal: ParsedMeal | null,
  existing: WeighLogRecord | null,
  item: WeighedItem,
  mode: 'add' | 'replace' = 'add',
): ScanMealLogRow {
  const start = existing ? startFromWeighLog(existing, plannedFromMeal(meal)) : null;
  const planned = start?.planned ?? plannedFromMeal(meal);
  if (mode === 'replace') {
    const r = replaceMealWithScan(planned, [{ ...item, indice_plano: null }]);
    return buildWeighLogRow(planned, r.items, r.choices);
  }
  const items = start?.items ?? [];
  const choices: Record<number, UnweighedChoice> = start?.choices ?? {};
  const pending = pendingPlanFoods(planned, items);
  const hit = matchPlanFood(item.alimento, pending.map((p) => p.food));
  const next: WeighedItem = { ...item, indice_plano: hit != null ? pending[hit].index : null };
  const merged = upsertWeighedItem(items, items.map(() => ''), next, '').items;
  return buildWeighLogRow(planned, merged, choices);
}

/** Refeição sugerida: a última cujo horário já passou (a primeira se nenhuma). */
export function suggestedMealIndex(meals: { time?: string | null }[], now: Date): number {
  let best = -1;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  meals.forEach((m, i) => {
    const t = String(m.time ?? '').match(/(\d{1,2})[:h](\d{2})/);
    if (t && Number(t[1]) * 60 + Number(t[2]) <= nowMin) best = i;
  });
  return best >= 0 ? best : meals.length > 0 ? 0 : -1;
}

/* ---------------- Revisão do admin ---------------- */

/** Linha nova de food_scans para um produto (vai para "Escaneados" como pendente). */
export function foodScanInsert(input: {
  alunoId: string; product: ProductData; barcode: string | null; source: ProductSource; photoPaths?: string[];
  score: number; label: string; additives: unknown;
}) {
  const p = input.product;
  return {
    aluno_id: input.alunoId,
    barcode: input.barcode,
    product_name: p.product_name || 'Produto sem nome',
    brand: p.brands ?? null,
    image_url: p.image_front_url ?? null,
    score: input.score,
    score_label: input.label,
    nutriments: { ...(p.nutriments ?? {}), serving_quantity: (p as any).serving_quantity ?? null, quantity: (p as any).quantity ?? null },
    additives: input.additives,
    source: input.source,
    photo_paths: input.photoPaths ?? [],
  };
}
