/**
 * Card da refeição do dia: editar, apagar e marcar "Não comi"/"Comi sem pesar"
 * em qualquer linha de uma refeição já registrada (pesada, estimada,
 * escaneada, fora do plano, comi sem pesar, não comeu). Regras puras sobre o
 * registro do dia; salvar grava a lista nova como um novo meal_weigh_logs
 * (o mais recente vale), então totais e rebalanceamento seguem na hora.
 */
import {
  buildUnweighedEntries, buildWeighedItem, dropStaleSubstitutions, pendingPlanFoods, plannedFromMeal,
  type DayFoodWeigh, type PlannedMeal, type UnweighedChoice, type WeighLogRecord, type WeighedItem,
} from './index';
import { rebuildWeighedItem, startFromWeighLog, type WeighItemChange } from './editItems';

export interface DayWeighState {
  planned: PlannedMeal;
  items: WeighedItem[];
  choices: Record<number, UnweighedChoice>;
}

/** Linha do card: o alimento do plano (se houver) e os itens do registro que a formam. */
export interface DayRowRef {
  planIndex: number | null;
  itemIndexes: number[];
}

export const dayRowRef = (w: Pick<DayFoodWeigh, 'planIndex' | 'itemIndexes'> | null | undefined): DayRowRef => ({
  planIndex: typeof w?.planIndex === 'number' ? w.planIndex : null,
  itemIndexes: Array.isArray(w?.itemIndexes) ? w!.itemIndexes!.filter((i) => typeof i === 'number') : [],
});

export function dayStateFromLog(log: WeighLogRecord, fallback: PlannedMeal = plannedFromMeal(null)): DayWeighState {
  const s = startFromWeighLog(log, fallback);
  return { planned: s.planned, items: s.items, choices: s.choices };
}

/** Troca respondida que deixou de valer (o alimento do plano voltou a contar) sai. */
function settle(state: DayWeighState): DayWeighState {
  const unweighed = buildUnweighedEntries(pendingPlanFoods(state.planned, state.items), state.choices);
  return { ...state, items: dropStaleSubstitutions(state.items, unweighed) };
}

/** Tira itens; o alimento do plano que deixa de estar registrado por eles vira "Não comi". */
function withoutItems(state: DayWeighState, indexes: number[]): DayWeighState {
  const drop = new Set(indexes);
  const before = new Set(pendingPlanFoods(state.planned, state.items).map((p) => p.index));
  const items = state.items.filter((_, i) => !drop.has(i));
  const choices = { ...state.choices };
  for (const p of pendingPlanFoods(state.planned, items)) if (!before.has(p.index)) choices[p.index] = 'nao_comeu';
  return { ...state, items, choices };
}

/** "Apagar item": a linha sai do registro (o alimento do plano, se era um, fica "Não comi"). */
export function removeDayRow(state: DayWeighState, ref: DayRowRef): DayWeighState {
  if (ref.itemIndexes.length === 0) return state;
  return settle(withoutItems(state, ref.itemIndexes));
}

/** "Não comi" / "Comi sem pesar" num alimento do plano: tira o que estava registrado nele e grava a escolha. */
export function setDayRowChoice(state: DayWeighState, ref: DayRowRef, choice: UnweighedChoice): DayWeighState {
  if (ref.planIndex == null) return state;
  const next = withoutItems(state, ref.itemIndexes);
  return settle({ ...next, choices: { ...next.choices, [ref.planIndex]: choice } });
}

/**
 * Trocar alimento e/ou gramas de uma linha. Linha com itens: o primeiro é
 * refeito (estimado continua estimado e guarda a estimativa original, para a
 * calibração) e os outros da mesma linha saem. Linha do plano sem item
 * (comi sem pesar / não comeu): entra um item informado pelo aluno. Se um
 * alimento do plano passa a ser outro fora do plano, ele fica "Não comi" e o
 * novo item aparece "no lugar de" dele.
 */
export function editDayRow(state: DayWeighState, ref: DayRowRef, change: WeighItemChange): DayWeighState {
  const [first, ...rest] = ref.itemIndexes.filter((i) => i >= 0 && i < state.items.length);
  const drop = new Set(rest);
  let item: WeighedItem;
  let items: WeighedItem[];
  if (first != null) {
    item = rebuildWeighedItem(state.items[first], change);
    items = state.items.map((it, i) => (i === first ? item : it)).filter((_, i) => !drop.has(i));
  } else {
    item = { ...buildWeighedItem(change.food, change.grams, { edited: true, planIndex: change.planIndex }), origem: 'manual' };
    items = [...state.items, item];
  }
  const choices = { ...state.choices };
  if (ref.planIndex != null && change.planIndex !== ref.planIndex) {
    choices[ref.planIndex] = 'nao_comeu';
    if (change.planIndex == null) {
      const pf = state.planned.alimentos[ref.planIndex];
      const at = items.indexOf(item);
      if (pf && at >= 0) items[at] = { ...item, substituiu: { indice_plano: ref.planIndex, alimento: pf.alimento }, extra: false };
    }
  }
  return settle({ ...state, items, choices });
}

export interface DayRowView<T> { food: T; index: number }

/**
 * Card mais limpo: primeiro o que foi consumido (pesados, estimados,
 * escaneados, fora do plano), depois "comi sem pesar"; os alimentos do plano
 * marcados "Não comeu" ficam agrupados no fim (recolhidos).
 */
export function groupDayMealFoods<T extends { weigh?: Pick<DayFoodWeigh, 'status'> | null }>(foods: T[]): {
  consumed: DayRowView<T>[];
  notEaten: DayRowView<T>[];
} {
  const rows = (foods ?? []).map((food, index) => ({ food, index }));
  const status = (r: DayRowView<T>) => r.food?.weigh?.status;
  const registered = rows.filter((r) => status(r) === 'pesado' || status(r) === 'fora_do_plano');
  const others = rows.filter((r) => status(r) !== 'pesado' && status(r) !== 'fora_do_plano' && status(r) !== 'nao_comeu');
  return { consumed: [...registered, ...others], notEaten: rows.filter((r) => status(r) === 'nao_comeu') };
}
