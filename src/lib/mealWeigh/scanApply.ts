/**
 * Concluir um scan (Prato pronto, Escanear prato ou scanner por foto) numa
 * refeição que tem alimentos do plano ou já tem pesagem: o aluno escolhe
 * Substituir a refeição / Adicionar ao que já tem / Revisar item por item.
 * Regras puras: nada aqui chama a IA, o banco ou o navegador (o armazenamento
 * da última escolha é recebido de fora e pode falhar sem quebrar nada).
 */
import { matchPlanFood, type PlannedMeal, type UnweighedChoice, type WeighedItem } from './index';

export type ScanApplyMode = 'replace' | 'add' | 'review';
export const SCAN_APPLY_PREF_KEY = 'meal-weigh:scan-apply';
export const DEFAULT_SCAN_APPLY: ScanApplyMode = 'replace';

export const SCAN_APPLY_OPTIONS: { mode: ScanApplyMode; title: string; hint: string }[] = [
  {
    mode: 'replace',
    title: 'Substituir a refeição pelo que escaneei',
    hint: 'O que foi escaneado vira a refeição. Itens do plano que não apareceram ficam como "Não comi".',
  },
  { mode: 'add', title: 'Adicionar ao que já tem', hint: 'Junta com os itens que já estavam registrados nessa refeição.' },
  { mode: 'review', title: 'Revisar item por item', hint: 'Você diz o que comeu sem pesar, o que não comeu e o que foi trocado.' },
];

const isMode = (v: unknown): v is ScanApplyMode => v === 'replace' || v === 'add' || v === 'review';

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

/** Última escolha do aluno (padrão: substituir). */
export function readScanApplyPref(storage: PrefStorage): ScanApplyMode {
  try {
    const v = storage?.getItem(SCAN_APPLY_PREF_KEY);
    return isMode(v) ? v : DEFAULT_SCAN_APPLY;
  } catch {
    return DEFAULT_SCAN_APPLY;
  }
}

export function writeScanApplyPref(storage: PrefStorage, mode: ScanApplyMode): void {
  try { storage?.setItem(SCAN_APPLY_PREF_KEY, mode); } catch { /* modo privado etc.: só não lembra */ }
}

/** Só pergunta quando há algo para substituir ou mesclar: alimentos do plano ou itens já registrados. */
export function needsScanApplyChoice(planned: Pick<PlannedMeal, 'alimentos'> | null | undefined, priorItems: unknown[] = []): boolean {
  return (planned?.alimentos?.length ?? 0) > 0 || (priorItems?.length ?? 0) > 0;
}

export interface ScanApplyResult {
  items: WeighedItem[];
  photos: string[];
  choices: Record<number, UnweighedChoice>;
}

/**
 * "Substituir a refeição pelo que escaneei": só os itens escaneados ficam (os
 * já registrados antes saem); cada escaneado que bate com um alimento do
 * plano casa com ele (sem perguntar), os demais entram como extra, e todo
 * alimento do plano que não apareceu vira "Não comi".
 */
export function replaceMealWithScan(planned: PlannedMeal, scanned: WeighedItem[], photos: string[] = []): ScanApplyResult {
  const total = planned?.alimentos?.length ?? 0;
  const taken = new Set<number>();
  const items = (scanned ?? []).map((it) => {
    const next: WeighedItem = { ...it };
    const idx = next.indice_plano;
    if (typeof idx === 'number' && idx >= 0 && idx < total) taken.add(idx);
    else next.indice_plano = null;
    return next;
  });
  for (const it of items) {
    if (typeof it.indice_plano === 'number') continue;
    const free = (planned?.alimentos ?? []).map((pf, pi) => ({ pf, pi })).filter(({ pi }) => !taken.has(pi));
    const hit = matchPlanFood(it.alimento, free.map((f) => f.pf));
    if (hit != null) {
      it.indice_plano = free[hit].pi;
      taken.add(free[hit].pi);
    }
  }
  for (const it of items) {
    if (typeof it.indice_plano === 'number') { it.substituiu = null; it.extra = false; continue; }
    // A troca já respondida continua valendo se aponta para um alimento do plano que não apareceu.
    const sub = it.substituiu;
    if (sub && typeof sub.indice_plano === 'number' && !taken.has(sub.indice_plano) && sub.indice_plano < total) { it.extra = false; continue; }
    it.substituiu = null;
    it.extra = true;
  }
  const choices: Record<number, UnweighedChoice> = {};
  for (let pi = 0; pi < total; pi++) if (!taken.has(pi)) choices[pi] = 'nao_comeu';
  return { items, photos: items.map((_, i) => photos?.[i] ?? ''), choices };
}

/** Itens (e fotos) desta sessão de scan: tudo o que não veio do registro salvo. */
export function sessionScanItems(items: WeighedItem[], photos: string[], prior: ReadonlySet<WeighedItem>): { items: WeighedItem[]; photos: string[] } {
  const out = { items: [] as WeighedItem[], photos: [] as string[] };
  (items ?? []).forEach((it, i) => {
    if (prior.has(it)) return;
    out.items.push(it);
    out.photos.push(photos?.[i] ?? '');
  });
  return out;
}
