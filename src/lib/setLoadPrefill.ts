/**
 * Pré-preenchimento da CARGA de cada série (execução do aluno e Modo Treino do
 * admin). Funções puras: preencher nunca registra a série — ela só é gravada
 * quando confirmada, como antes.
 *
 * Regras:
 *  - só preenche campo vazio; nunca sobrescreve o que foi digitado;
 *  - o valor preenchido fica marcado em `weightAuto` (valor exato que o app
 *    colocou). Enquanto `weight === weightAuto`, o valor é "do app" e pode ser
 *    recalculado (ex.: chegou a sugestão de progressão, mudou o tipo da série);
 *  - se a pessoa apagar o valor preenchido, o campo fica vazio (não volta);
 *  - se a 1ª série de TRABALHO receber uma carga digitada, as séries de
 *    trabalho seguintes ainda não confirmadas e com valor do app passam a usar
 *    essa carga;
 *  - série confirmada (ou com sub-registros de método) nunca é tocada.
 */
import { isWorkLogSetType, normalizePlanSetType } from './setTypes';

export interface PrefillableSet {
  weight: string;
  reps?: string;
  completed?: boolean;
  /** Valor exato que o app colocou no campo de carga. */
  weightAuto?: string;
  subRecords?: unknown[];
}

export interface WorkLogRow {
  weight_kg: number | null;
  set_type?: string | null;
  set_number?: number | null;
  performed_at?: string | null;
}

const positive = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Carga da ÚLTIMA série de trabalho registrada (set_type nulo = legado =
 * trabalho). Mais recente por horário; empate → maior número da série.
 */
export const lastWorkSetLoad = (rows: WorkLogRow[] | null | undefined): number | null => {
  const ts = (r: WorkLogRow) => {
    const t = Date.parse(String(r.performed_at ?? ''));
    return Number.isFinite(t) ? t : 0;
  };
  let best: WorkLogRow | null = null;
  for (const r of rows ?? []) {
    if (!isWorkLogSetType(r.set_type) || positive(r.weight_kg) == null) continue;
    if (!best || ts(r) > ts(best) || (ts(r) === ts(best) && (r.set_number ?? 0) >= (best.set_number ?? 0))) best = r;
  }
  return best ? positive(best.weight_kg) : null;
};

/** Aluno digita com vírgula (campo texto); admin usa campo numérico (ponto). */
export type LoadFormat = 'comma' | 'dot';
export const formatPrefillKg = (kg: number, format: LoadFormat): string =>
  format === 'comma' ? String(kg).replace('.', ',') : String(kg);

export const isAutoWeight = (s: PrefillableSet | null | undefined): boolean =>
  !!s && !!s.weightAuto && s.weight === s.weightAuto;

/** Série só com a carga preenchida pelo app (sem reps, não confirmada): não é registro. */
export const isPrefillOnlySet = (s: PrefillableSet | null | undefined): boolean =>
  !!s && !s.completed && isAutoWeight(s) && !String(s.reps ?? '').trim();

const locked = (s: PrefillableSet) => !!s.completed || (Array.isArray(s.subRecords) && s.subRecords.length > 0);

/**
 * Aplica as cargas padrão (`defaults[i]`, já calculadas por tipo) às séries.
 * Retorna `null` quando nada muda (evita re-render/gravação desnecessária).
 */
export function applyLoadPrefill<T extends PrefillableSet>(
  sets: T[],
  defaults: Array<number | null>,
  types: Array<string | null | undefined>,
  format: LoadFormat,
): T[] | null {
  const typeOf = (i: number) => normalizePlanSetType(types[i]);
  const firstWork = sets.findIndex((_, i) => typeOf(i) === 'work');
  let override: number | null = null;
  const first = firstWork >= 0 ? sets[firstWork] : null;
  if (first && first.weight.trim() && !isAutoWeight(first)) override = positive(first.weight.replace(',', '.'));

  let changed = false;
  const next = sets.map((s, i) => {
    if (!s || locked(s)) return s;
    const auto = isAutoWeight(s);
    const untouchedEmpty = !s.weight.trim() && !s.weightAuto;
    if (!auto && !untouchedEmpty) return s;
    const kg = override != null && i > firstWork && typeOf(i) === 'work' ? override : positive(defaults[i]);
    if (kg == null) return s;
    const text = formatPrefillKg(kg, format);
    if (s.weight === text && s.weightAuto === text) return s;
    changed = true;
    return { ...s, weight: text, weightAuto: text };
  });
  return changed ? next : null;
}
