/**
 * Catálogo de alimentos com IDs reais (Fase 4).
 *
 * UMA única leitura da tabela `foods` por geração — nunca N+1.
 * O catálogo é enviado à IA com os IDs reais; a IA escolhe `foodId + qtyGrams`
 * e NÃO é autoridade de nenhum valor nutricional.
 */
import {
  buildFoodIndex,
  foodRecordFromRow,
  normalizeFoodName,
  type FoodIndex,
  type FoodRecord,
  type FoodRow,
} from "./nutritionCore.ts";

export interface FoodCatalog {
  foods: FoodRecord[];
  index: FoodIndex;
  /** Quantas leituras da tabela foram feitas (usado em teste anti N+1). */
  queryCount: number;
}

export const buildFoodCatalog = (rows: FoodRow[], queryCount = 1): FoodCatalog => {
  const foods = (rows ?? []).map(foodRecordFromRow);
  return { foods, index: buildFoodIndex(foods), queryCount };
};

export const FOOD_CATALOG_COLUMNS =
  "id, name, calories, protein, carbs, fats, portion, portion_size, brand, source, barcode, source_food_id";

export async function loadFoodCatalog(supabase: any): Promise<FoodCatalog> {
  const { data, error } = await supabase
    .from("foods")
    .select(FOOD_CATALOG_COLUMNS)
    .order("name");
  if (error) {
    console.error("[foodCatalog] load error:", error);
    return buildFoodCatalog([], 1);
  }
  return buildFoodCatalog((data ?? []) as FoodRow[], 1);
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** Bloco compacto enviado ao modelo: identidade + macros por porção base. */
export function formatFoodCatalogPrompt(catalog: FoodCatalog): string {
  if (!catalog.foods.length) {
    return "\nFOOD CATALOG: vazio. Não é possível gerar a dieta sem alimentos cadastrados.\n";
  }
  const lines = catalog.foods.map((f) => {
    const base = Number(f.portion_size) > 0 ? Number(f.portion_size) : 100;
    const brand = f.brand ? ` (${f.brand})` : "";
    return `[id=${f.id}] ${f.name}${brand} | ${fmt(f.calories)} kcal | P${fmt(f.protein)} C${fmt(f.carbs)} G${fmt(f.fats)} | base ${base}g`;
  });
  return `
========================================
FOOD CATALOG (base oficial — ${catalog.foods.length} alimentos)
========================================

Cada item traz o ID REAL do alimento. Use SOMENTE estes IDs.
Os macros abaixo servem para você escolher alimento e estimar quantidade —
o servidor recalcula tudo pela base e IGNORA qualquer macro que você devolver.

${lines.join("\n")}
`;
}

/**
 * Nomes explicitamente exigidos (dieta modelo / alimentos obrigatórios) que não
 * possuem correspondência ÚNICA na base. Só estes podem voltar com foodId null.
 */
export function resolveAllowedUnresolvedNames(
  requiredNames: string[],
  catalog: FoodCatalog,
): string[] {
  const out: string[] = [];
  for (const raw of requiredNames ?? []) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const matches = catalog.index.byName.get(normalizeFoodName(name)) ?? [];
    if (matches.length !== 1) out.push(name);
  }
  return Array.from(new Set(out));
}
