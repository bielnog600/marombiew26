/**
 * Chamadas do scanner único (food-scanner, banco e fotos). As regras ficam em
 * `@/lib/mealWeigh/unifiedScan` e `@/lib/foodPhotoScan`; aqui só o transporte.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ProductData } from '@/lib/foodScore';
import {
  foodScanInsert, resolvePackagedProduct, type OffCandidate, type PackagedResolution, type PhotoIdentity, type ProductSource,
} from '@/lib/foodPhotoScan';
import type { WeighFood, WeighedItem } from '@/lib/mealWeigh';
import { productScore, referenceRequests, type RefMacros } from '@/lib/mealWeigh/unifiedScan';

export async function invokeScanner<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('food-scanner', { body });
  if (error) {
    let msg = 'Não foi possível analisar a foto agora.';
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

/** Produto pelo código de barras (cache do servidor → Open Food Facts), sem IA. */
export async function lookupBarcode(barcode: string): Promise<ProductData | null> {
  const d = await invokeScanner<{ found?: boolean; product?: ProductData }>({ action: 'lookup', barcode });
  return d?.found && d.product ? d.product : null;
}

/** Mesmo caminho do scanner de produtos: código → base/cache → Open Food Facts → tabela lida pela IA. */
export function resolveProduct(identity: PhotoIdentity, country: 'br' | 'pt'): Promise<PackagedResolution> {
  return resolvePackagedProduct(identity, {
    lookupBarcode,
    findKnown: async (q) => {
      const d = await invokeScanner<any>({ action: 'find_product', brand: q.brand, product: q.product, variant: q.variant });
      return d?.found ? { source: d.source, product: d.product, barcode: d.barcode ?? null, foodId: d.food_id ?? null } : null;
    },
    searchOff: async (q) => (await invokeScanner<{ candidates?: OffCandidate[] }>({ action: 'search_off', brand: q.brand, product: q.product, variant: q.variant, country }))?.candidates ?? [],
  });
}

/** Foto do produto (privada) para o admin conferir; falha não impede nada. */
export async function uploadScanPhoto(userId: string | null, dataUrl: string | null): Promise<string[]> {
  if (!userId || !dataUrl) return [];
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('food-scan-photos').upload(path, blob, { contentType: 'image/jpeg' });
    return error ? [] : [path];
  } catch {
    return [];
  }
}

/**
 * Produto confirmado: entra no histórico/"Produtos escaneados" e, completo e
 * sem duplicado, no banco de alimentos sozinho (decisão no servidor). Best-effort.
 */
export async function recordProductScan(input: {
  studentId: string; product: ProductData; barcode: string | null; source: ProductSource | string; photo: string | null;
  confidence: number | null; grams: number;
}): Promise<void> {
  try {
    const { score, label, additives } = productScore(input.product);
    const photoPaths = await uploadScanPhoto(input.studentId, input.photo);
    await supabase.from('food_scans').insert({
      ...foodScanInsert({ alunoId: input.studentId, product: input.product, barcode: input.barcode, source: input.source as ProductSource, photoPaths, score, label, additives }),
      consumed_grams: input.grams, consumed_at: new Date().toISOString(),
    } as any);
    await registerProduct(input.product, input.barcode, input.source, input.confidence);
  } catch {
    /* histórico é complementar: a refeição já foi registrada */
  }
}

/** Auto-adicionar ao banco (o servidor decide: completo, coerente, sem duplicado, confiança). */
export async function registerProduct(product: ProductData, barcode: string | null, source: string, confidence: number | null) {
  try {
    return await invokeScanner<{ added: boolean; reason?: string }>({ action: 'register_product', product, barcode, source, confidence });
  } catch {
    return { added: false };
  }
}

/** Cria (ou reaproveita, se já existe com o mesmo nome) cada alimento novo da IA. */
export async function createReferenceFoods(
  items: WeighedItem[], drafts: Map<string, WeighFood>, country: 'br' | 'pt',
): Promise<Map<string, { id: string; name: string; created: boolean }>> {
  const out = new Map<string, { id: string; name: string; created: boolean }>();
  for (const { draftId, food } of referenceRequests(items, drafts)) {
    try {
      const ref: Partial<RefMacros> = { kcal: Number(food.calories), proteina: Number(food.protein), carbo: Number(food.carbs), gordura: Number(food.fats) };
      const d = await invokeScanner<{ food: { id: string; name: string }; created: boolean }>({
        action: 'reference_food', name: food.name, ref, tabela: (food as any).reference_table ?? null, country,
      });
      if (d?.food?.id) out.set(draftId, { id: d.food.id, name: d.food.name, created: !!d.created });
    } catch {
      /* sem o alimento criado, o item fica com os macros e sem food_id */
    }
  }
  return out;
}
