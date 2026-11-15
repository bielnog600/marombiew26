/**
 * Scanner único — regras puras da tela que junta o scanner de produtos com o
 * Pesar refeição: chips de modo (lembrados), dica por modo, o caminho do
 * modo Automático (produto embalado / um alimento na balança / prato), as
 * gramas do produto (visor → porção do rótulo → 100 g), o alimento novo
 * criado pela IA com macros de referência (TACO/INSA), a leitura ao vivo do
 * código de barras e as linhas da lista da refeição (nota, chips de origem,
 * previsto / no lugar de). Nada aqui chama a IA, o banco ou o navegador.
 */
import { computeFoodScore, type ProductData } from '@/lib/foodScore';
import { normalizeText } from '../../../supabase/functions/_shared/foodCatalogRules';
import type { PhotoIdentity } from '@/lib/foodPhotoScan';
import { round1, type PlannedMeal, type WeighAiResult, type WeighFood, type WeighedItem } from './index';
import type { PlateAiItem, PlateAiResult } from './plateEstimate';

/* ---------------- Modos ---------------- */

export type ScanChipMode = 'auto' | 'label' | 'scale' | 'plate';
export const SCAN_MODE_CHIPS: { mode: ScanChipMode; label: string }[] = [
  { mode: 'auto', label: 'Automático' },
  { mode: 'label', label: 'Código / rótulo' },
  { mode: 'scale', label: 'Balança' },
  { mode: 'plate', label: 'Prato pronto' },
];
export const AUTO_HINT = 'Aponta para o prato, a balança ou o produto — a IA descobre o que é';
export const LABEL_HINT = 'Mostra o código de barras ou a tabela nutricional do produto';
export const SCAN_MODE_STORAGE_KEY = 'scanner:mode';

export function readScanModePref(storage: Pick<Storage, 'getItem'> | null | undefined): ScanChipMode {
  try {
    const v = storage?.getItem(SCAN_MODE_STORAGE_KEY);
    return v === 'label' || v === 'scale' || v === 'plate' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}
export function writeScanModePref(storage: Pick<Storage, 'setItem'> | null | undefined, mode: ScanChipMode): void {
  try { storage?.setItem(SCAN_MODE_STORAGE_KEY, mode); } catch { /* armazenamento bloqueado */ }
}

/** Modo interno da tela → chip: "Balança" cobre o um-por-vez com tara e a lista do plano. */
export const chipForMode = (mode: string): ScanChipMode =>
  mode === 'plan' || mode === 'scan' ? 'scale' : mode === 'plate' ? 'plate' : mode === 'label' ? 'label' : 'auto';

/* ---------------- Automático ---------------- */

export interface RefMacros { kcal: number; proteina: number; carbo: number; gordura: number; fibra: number | null; tabela: string | null }
export interface AutoScanItem extends PlateAiItem { ref_100g?: RefMacros | null }

/** Resposta do `scan_auto` (já normalizada no servidor). */
export interface AutoScanResult {
  tipo: 'embalado' | 'in_natura' | 'prato' | 'balanca';
  itens: AutoScanItem[];
  gramas_lidas: number | null;
  visor_legivel: boolean;
  confianca_leitura: number;
  prato_tarado: boolean | null;
  balanca_sem_visor: boolean;
  observacao: string;
  marca: string | null;
  produto: string;
  variante: string | null;
  codigo_barras_visivel: string | null;
  tabela_nutricional_visivel: boolean;
  tabela: PhotoIdentity['tabela'];
  categoria_nutriscore: string;
  frutas_legumes_pct: number | null;
  confianca: number;
}

export type AutoRoute = 'product' | 'scale_item' | 'plate';

/**
 * Caminho sem o aluno escolher: embalado (ou chip Código/rótulo, ou código lido
 * ao vivo sem comida na foto) → produto; um alimento na balança → item pesado;
 * in natura e prato → revisão do prato (estimado, com o visor repartido).
 */
export function routeAutoScan(r: Pick<AutoScanResult, 'tipo' | 'itens'>, hint: 'auto' | 'label' = 'auto'): AutoRoute {
  if (hint === 'label' || r.tipo === 'embalado') return 'product';
  if (r.tipo === 'balanca' && r.itens.length <= 1) return 'scale_item';
  return 'plate';
}

/** Um alimento na balança → mesma resposta do "Escanear prato" (repetidos, tara, chips do plano). */
export function autoToWeighAi(r: AutoScanResult): WeighAiResult & { ref_100g?: RefMacros | null } {
  const it = r.itens[0];
  return {
    alimento: it?.alimento ?? r.produto ?? '',
    alimento_alternativas: it?.alternativas ?? [],
    gramas_lidas: r.visor_legivel ? r.gramas_lidas : null,
    confianca_alimento: it?.confianca ?? r.confianca,
    confianca_leitura: r.confianca_leitura,
    visor_legivel: r.visor_legivel,
    observacao: r.observacao,
    ref_100g: it?.ref_100g ?? null,
  };
}

/** In natura / prato → resposta do "Prato pronto" (o visor legível vira o peso total a repartir). */
export function autoToPlateAi(r: AutoScanResult): PlateAiResult {
  const total = r.visor_legivel && r.gramas_lidas != null && r.gramas_lidas > 0 ? r.gramas_lidas : null;
  return {
    itens: r.itens,
    peso_total_lido: total,
    prato_tarado: total != null ? r.prato_tarado : null,
    observacao: r.observacao,
    balanca_sem_visor: total == null && r.balanca_sem_visor,
  };
}

/** Embalado → identidade do scanner por foto (ordem código → base/cache → Open Food Facts → tabela). */
export function autoToIdentity(r: AutoScanResult, liveBarcode: string | null = null): PhotoIdentity {
  return {
    tipo: 'embalado',
    marca: r.marca,
    produto: r.produto || r.itens[0]?.alimento || '',
    variante: r.variante,
    codigo_barras_visivel: r.codigo_barras_visivel ?? liveBarcode,
    tabela_nutricional_visivel: r.tabela_nutricional_visivel,
    tabela: r.tabela,
    alimento: r.itens[0]?.alimento ?? r.produto,
    tamanho: 'medio',
    unidades: 1,
    peso_balanca_g: r.visor_legivel ? r.gramas_lidas : null,
    confianca: r.confianca,
  };
}

/** Categoria do Nutri-Score que a IA informou entra no produto (só quando ele ainda não tem). */
export function withScoreCategory(product: ProductData, r: Pick<AutoScanResult, 'categoria_nutriscore' | 'frutas_legumes_pct'> | null): ProductData {
  if (!r) return product;
  const n = { ...(product.nutriments ?? {}) };
  if (r.frutas_legumes_pct != null && n['fruits-vegetables-nuts_100g'] == null) n['fruits-vegetables-nuts_100g'] = r.frutas_legumes_pct;
  return { ...product, nutriscore_category: product.nutriscore_category ?? r.categoria_nutriscore ?? null, nutriments: n };
}

export type GramsSource = 'balanca' | 'porcao' | 'padrao';
/** Gramas do produto: visor da balança na foto → porção do rótulo → 100 g. */
export function productGrams(readGrams: number | null | undefined, product: Pick<ProductData, 'serving_quantity'> | null): { grams: number; from: GramsSource } {
  if (readGrams != null && readGrams > 0) return { grams: round1(readGrams), from: 'balanca' };
  const s = Number(product?.serving_quantity);
  if (s > 0) return { grams: round1(s), from: 'porcao' };
  return { grams: 100, from: 'padrao' };
}
export const GRAMS_SOURCE_LABEL: Record<GramsSource, string> = {
  balanca: 'lido no visor da balança',
  porcao: 'porção do rótulo',
  padrao: 'sem porção no rótulo — confira',
};

/** Nota + rótulo do produto (Nutri-Score com a categoria, aditivos, orgânico). */
export function productScore(product: ProductData) {
  const { score, label, additives } = computeFoodScore(product);
  return { score, label, additives };
}

/* ---------------- Alimento novo criado pela IA ---------------- */

export const REF_FOOD_PREFIX = 'ia:';
export const isReferenceDraftFood = (f: Pick<WeighFood, 'id'> | null | undefined) => String(f?.id ?? '').startsWith(REF_FOOD_PREFIX);

/** Alimento provisório (antes de existir em foods) com os macros de referência por 100 g. */
export function referenceWeighFood(name: string, ref: RefMacros): WeighFood {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
  return {
    id: `${REF_FOOD_PREFIX}${normalizeText(clean)}`,
    name: clean ? clean[0].toUpperCase() + clean.slice(1) : clean,
    calories: ref.kcal, protein: ref.proteina, carbs: ref.carbo, fats: ref.gordura,
    portion: 'gramas', portion_size: 100, brand: null, source: 'ia_referencia',
    reference_table: ref.tabela,
  } as WeighFood;
}

/** Item com alimento provisório: marca "novo · criado pela IA" e a tabela citada. */
export function markReferenceItem(item: WeighedItem, food: WeighFood): WeighedItem {
  if (!isReferenceDraftFood(food) && (food as any).source !== 'ia_referencia') return item;
  return { ...item, novo_ia: true, tabela_referencia: (food as any).reference_table ?? null };
}

/** Pedidos de criação: um por alimento provisório distinto. */
export function referenceRequests(items: WeighedItem[], drafts: Map<string, WeighFood>): { draftId: string; food: WeighFood }[] {
  const ids = new Set(items.map((i) => i.food_id).filter((id): id is string => !!id && id.startsWith(REF_FOOD_PREFIX)));
  return [...ids].map((draftId) => ({ draftId, food: drafts.get(draftId)! })).filter((r) => !!r.food);
}

/** Troca o id provisório pelo do alimento criado (ou já existente); sem resposta, fica sem food_id. */
export function applyCreatedFoods(items: WeighedItem[], created: Map<string, { id: string; name: string; created: boolean }>): WeighedItem[] {
  return items.map((it) => {
    if (!it.food_id || !it.food_id.startsWith(REF_FOOD_PREFIX)) return it;
    const hit = created.get(it.food_id);
    if (!hit) return { ...it, food_id: null };
    return { ...it, food_id: hit.id, novo_ia: hit.created ? true : undefined, tabela_referencia: hit.created ? it.tabela_referencia ?? null : undefined };
  });
}

/* ---------------- Leitura ao vivo do código de barras ---------------- */

/** Código EAN/UPC válido (8–14 dígitos com dígito verificador certo). */
export function acceptLiveBarcode(raw: string | null | undefined): string | null {
  const code = String(raw ?? '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? code : null;
}

/** Busca de novo só quando o código muda (ou o mesmo volta depois de 20 s). */
export function shouldLookupLive(last: { code: string; at: number } | null, code: string, now: number): boolean {
  return !last || last.code !== code || now - last.at > 20000;
}

/** Cartão por cima da câmera: "Iogurte grego · nota 78 Excelente". */
export function liveProductLine(p: { name: string; score: number | null; label: string | null }): string {
  return p.score == null ? p.name : `${p.name} · nota ${p.score} ${p.label ?? ''}`.trim();
}

/* ---------------- Lista da refeição ---------------- */

export type ScoreTone = 'excellent' | 'good' | 'poor' | 'bad' | 'none';
/** Verde ≥ 75, lima ≥ 50, laranja ≥ 25, vermelho abaixo; sem nota (in natura) = "—". */
export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score == null || !Number.isFinite(Number(score))) return 'none';
  const s = Number(score);
  return s >= 75 ? 'excellent' : s >= 50 ? 'good' : s >= 25 ? 'poor' : 'bad';
}

export type OriginChip = 'balanca' | 'rotulo' | 'estimado' | 'do_plano' | 'fora_do_plano' | 'novo_ia' | 'informado';
export const ORIGIN_CHIP_LABEL: Record<OriginChip, string> = {
  balanca: 'balança', rotulo: 'rótulo', estimado: 'estimado', do_plano: 'do plano', fora_do_plano: 'fora do plano',
  novo_ia: 'novo · criado pela IA', informado: 'informado',
};

export function itemOriginChips(item: WeighedItem, planned: PlannedMeal): OriginChip[] {
  const out: OriginChip[] = [];
  const weighed = !item.origem || item.origem === 'pesado' || item.fonte_gramas === 'balanca';
  if (item.origem === 'escaneado' && (item.nota != null || item.fonte_gramas)) out.push('rotulo');
  if (weighed) out.push('balanca');
  if (item.origem === 'estimado') out.push('estimado');
  if (item.origem === 'manual') out.push('informado');
  if (typeof item.indice_plano === 'number') out.push('do_plano');
  else if ((planned?.alimentos ?? []).length > 0) out.push('fora_do_plano');
  if (item.novo_ia) out.push('novo_ia');
  return out;
}

/** "previsto 150 g" (alimento do plano) ou "no lugar de Arroz" (fora do plano que substituiu). */
export function itemPlanLine(item: WeighedItem, planned: PlannedMeal): string | null {
  if (typeof item.indice_plano === 'number') {
    const pf = planned?.alimentos?.[item.indice_plano];
    if (!pf) return null;
    return pf.gramas != null ? `previsto ${Math.round(pf.gramas)} g` : pf.qty ? `previsto ${pf.qty}` : null;
  }
  return item.substituiu ? `no lugar de ${item.substituiu.alimento}` : null;
}
