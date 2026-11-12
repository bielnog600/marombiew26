/**
 * Pesar refeição — editar e apagar itens já confirmados (durante a pesagem ou
 * numa pesagem já salva no dia). Regras puras: nada aqui chama a IA, o banco
 * ou o navegador. Totais, previsto × pesado e o acumulado da tara continuam
 * derivados da lista de itens, então basta trocar a lista.
 */
import { normalizeFoodName } from '@/lib/nutritionEngine';
import {
  buildWeighedItem, pendingPlanFoods, planFoodToWeighFood, plannedFromMeal, round1,
  type PlannedFood, type PlannedMeal, type UnweighedChoice, type WeighFood, type WeighLogRecord, type WeighedItem,
} from './index';

/**
 * Alimento ("por 100 g") que gerou o item, para recalcular só as gramas:
 * o do plano quando o item é aquele alimento do plano, senão o da base pelo id;
 * sem nenhum dos dois, os próprios macros do item escalados.
 */
export function weighFoodForItem(item: WeighedItem, planned: PlannedMeal, foods: WeighFood[]): WeighFood {
  const idx = item.indice_plano;
  const pf = idx != null ? planned?.alimentos?.[idx] : undefined;
  if (pf && normalizeFoodName(pf.alimento) === normalizeFoodName(item.alimento)) {
    const fromPlan = planFoodToWeighFood(pf, foods);
    if (fromPlan) return fromPlan;
  }
  if (item.food_id) {
    const base = (foods ?? []).find((f) => f.id === item.food_id);
    if (base) return base;
  }
  const grams = Number(item.gramas) || 0;
  const per100 = grams > 0 ? 100 / grams : 0;
  return {
    id: `plano:${normalizeFoodName(item.alimento)}`,
    name: item.alimento,
    calories: (Number(item.kcal) || 0) * per100,
    protein: (Number(item.p) || 0) * per100,
    carbs: (Number(item.c) || 0) * per100,
    fats: (Number(item.g) || 0) * per100,
    portion_size: 100,
  };
}

export interface WeighItemChange {
  food: WeighFood;
  grams: number;
  /** Alimento do plano que o item passa a ser; null = fora do plano. */
  planIndex: number | null;
}

/** Item editado: macros recalculados para o novo alimento/gramas; o que a IA leu fica guardado. */
export function rebuildWeighedItem(item: WeighedItem, change: WeighItemChange): WeighedItem {
  const next = buildWeighedItem(change.food, change.grams, {
    edited: true,
    fotoUrl: item.foto_url ?? null,
    aiName: item.alimento_ia ?? null,
    readGrams: item.gramas_lidas ?? null,
    planIndex: change.planIndex,
  });
  const sameFood = normalizeFoodName(next.alimento) === normalizeFoodName(item.alimento);
  // Alimento trocado pelo aluno: o que a IA viu fica só como registro, sem valer para casar/repetir.
  if (item.alimento_corrigido || (!sameFood && item.alimento_ia)) next.alimento_corrigido = true;
  // A troca "substituiu X" só continua valendo se o item segue o mesmo alimento fora do plano.
  const sameOutOfPlan = change.planIndex == null && sameFood;
  if (sameOutOfPlan) {
    if (item.substituiu) next.substituiu = item.substituiu;
    if (item.extra) next.extra = item.extra;
  }
  return next;
}

export function editWeighedItem(items: WeighedItem[], index: number, change: WeighItemChange): WeighedItem[] {
  return (items ?? []).map((it, i) => (i === index ? rebuildWeighedItem(it, change) : it));
}

export interface WeighItemRemoval {
  items: WeighedItem[];
  photos: string[];
  choices: Record<number, UnweighedChoice>;
}

/**
 * Apaga o item (e a foto dele). O alimento do plano que deixa de estar pesado
 * entra como "Não comi" — o aluno tirou da refeição, então não volta a contar
 * o previsto; na revisão ele ainda pode trocar para "Comi sem pesar".
 */
export function removeWeighedItem(
  planned: PlannedMeal,
  items: WeighedItem[],
  photos: string[],
  index: number,
  choices: Record<number, UnweighedChoice> = {},
): WeighItemRemoval {
  const before = new Set(pendingPlanFoods(planned, items).map((p) => p.index));
  const nextItems = (items ?? []).filter((_, i) => i !== index);
  const nextPhotos = (photos ?? []).filter((_, i) => i !== index);
  const nextChoices = { ...choices };
  for (const p of pendingPlanFoods(planned, nextItems)) {
    if (!before.has(p.index)) nextChoices[p.index] = 'nao_comeu';
  }
  return { items: nextItems, photos: nextPhotos, choices: nextChoices };
}

/** Índices do plano já ocupados por OUTROS itens (para não casar dois alimentos diferentes no mesmo). */
export function takenPlanIndexes(items: WeighedItem[], exceptIndex: number): Set<number> {
  const out = new Set<number>();
  (items ?? []).forEach((it, i) => {
    if (i !== exceptIndex && typeof it.indice_plano === 'number') out.add(it.indice_plano);
  });
  return out;
}

export interface WeighEditStart {
  planned: PlannedMeal;
  items: WeighedItem[];
  photos: string[];
  choices: Record<number, UnweighedChoice>;
}

/**
 * "Editar pesagem" de uma refeição já salva: parte do registro do dia (o
 * previsto guardado nele, os itens e as escolhas dos não pesados). As fotos
 * não são guardadas, então a lista de fotos fica vazia para cada item.
 */
export function startFromWeighLog(log: WeighLogRecord, fallback: PlannedMeal = plannedFromMeal(null)): WeighEditStart {
  const snap = log.planned;
  const alimentos: PlannedFood[] = Array.isArray(snap?.alimentos) && snap!.alimentos!.length > 0 ? snap!.alimentos! : fallback.alimentos;
  const sum = alimentos.reduce((a, f) => ({
    kcal: a.kcal + (Number(f.kcal) || 0), p: a.p + (Number(f.p) || 0), c: a.c + (Number(f.c) || 0), g: a.g + (Number(f.g) || 0),
  }), { kcal: 0, p: 0, c: 0, g: 0 });
  const planned: PlannedMeal = {
    nome: String(snap?.nome ?? fallback.nome ?? ''),
    horario: (snap?.horario ?? fallback.horario ?? null) as string | null,
    alimentos,
    kcal: Math.round(sum.kcal), p: round1(sum.p), c: round1(sum.c), g: round1(sum.g),
  };
  const items = Array.isArray(log.items) ? log.items.map((it) => ({ ...it })) : [];
  const choices: Record<number, UnweighedChoice> = {};
  for (const u of log.unweighed ?? []) {
    if (typeof u?.indice_plano === 'number' && (u.escolha === 'nao_comeu' || u.escolha === 'comeu_sem_pesar')) choices[u.indice_plano] = u.escolha;
  }
  return { planned, items, photos: items.map(() => ''), choices };
}
