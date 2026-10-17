import type { ParsedExercise } from './trainingResultParser';
import { buildSetPlan } from './setPlanBuilder';

export type SeriesMethod = 'nenhum' | 'dropset' | 'restpause' | 'cluster';
export interface MethodParameters {
  aplicar: 'ultima' | 'todas';
  drops: number;
  reducao_pct: number;
  pausa_s: number;
  minis: number;
  blocos: number;
  reps_bloco: number;
}
export interface ExecutionMethodFields {
  grupo_id?: string;
  tipo_grupo?: 'superset' | 'biset';
  ordem_grupo?: 'A' | 'B';
  pausa_grupo_s?: number;
  metodo?: SeriesMethod;
  metodo_params?: MethodParameters;
}
export interface SubRecord {
  label: string;
  weight: string;
  reps: string;
  completed: boolean;
}
export interface MethodSetEntry {
  weight: string;
  reps: string;
  completed?: boolean;
  rir?: string;
  subRecords?: SubRecord[];
  pauseUntil?: number;
}
const slugs: Record<string, SeriesMethod> = { drop_set: 'dropset', rest_pause: 'restpause', cluster_set: 'cluster' };
export const methodSlug = (method: SeriesMethod): string | undefined =>
  ({ dropset: 'drop_set', restpause: 'rest_pause', cluster: 'cluster_set', nenhum: undefined })[method];
export const seriesMethod = (ex: Pick<ParsedExercise, 'metodo' | 'method'>): SeriesMethod =>
  ex.metodo ?? slugs[ex.method?.slug ?? ''] ?? 'nenhum';
export const methodDefaults = (method: SeriesMethod): MethodParameters => ({
  aplicar: 'ultima', drops: 2, reducao_pct: 25, pausa_s: method === 'cluster' ? 20 : 15,
  minis: 2, blocos: 3, reps_bloco: 3,
});
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
export const methodParameters = (ex: ParsedExercise): MethodParameters => {
  const method = seriesMethod(ex);
  const p: Record<string, unknown> = { ...ex.method?.params, ...ex.metodo_params };
  const d = methodDefaults(method);
  return {
    aplicar: p.aplicar === 'todas' ? 'todas' : 'ultima',
    drops: bounded(p.drops, d.drops, 1, 3), reducao_pct: bounded(p.reducao_pct, d.reducao_pct, 1, 90),
    pausa_s: bounded(p.pausa_s ?? p.intra_s, d.pausa_s, method === 'cluster' ? 15 : 10, method === 'cluster' ? 30 : 20),
    minis: bounded(p.minis, d.minis, 1, 5), blocos: bounded(p.blocos, d.blocos, 2, 6),
    reps_bloco: bounded(p.reps_bloco, d.reps_bloco, 1, 20),
  };
};
/** Chaves de parâmetro que cada método usa — as demais são descartadas ao salvar/trocar. */
const PARAM_KEYS_BY_METHOD: Record<Exclude<SeriesMethod, 'nenhum'>, (keyof MethodParameters)[]> = {
  dropset: ['aplicar', 'drops', 'reducao_pct'],
  restpause: ['aplicar', 'minis', 'pausa_s'],
  cluster: ['aplicar', 'blocos', 'reps_bloco', 'pausa_s'],
};
export const cleanMethodParams = (method: SeriesMethod, params: MethodParameters): MethodParameters => {
  if (method === 'nenhum') return params;
  const keys = PARAM_KEYS_BY_METHOD[method];
  const d = methodDefaults(method);
  // Só as chaves do método entram; o resto é descartado (evita misturar params).
  return Object.fromEntries(keys.map(k => [k, params[k] ?? d[k]])) as unknown as MethodParameters;
};
export const methodPatch = (method: SeriesMethod, params = methodDefaults(method)): Partial<ParsedExercise> => {
  const clean = cleanMethodParams(method, params);
  return {
    metodo: method, metodo_params: method === 'nenhum' ? undefined : clean,
    method: method === 'nenhum' ? undefined : { slug: methodSlug(method) ?? '', params: { ...clean } },
  };
};
export const methodOnSet = (ex: ParsedExercise, index: number, count: number, recognition = false): boolean =>
  !recognition && seriesMethod(ex) !== 'nenhum' && (methodParameters(ex).aplicar === 'todas' || index === count - 1);
export const methodSummary = (ex: ParsedExercise): string => {
  const m = seriesMethod(ex);
  if (m === 'nenhum') return '';
  const p = methodParameters(ex);
  const application = p.aplicar === 'todas' ? 'todas as séries' : 'última série';
  if (m === 'dropset') return `Drop set (${application}) · ${p.drops} drops · −${p.reducao_pct}%`;
  if (m === 'restpause') return `Rest-pause (${application}) · ${p.minis} mini-séries · ${p.pausa_s}s`;
  return `Cluster (${application}) · ${p.blocos} × ${p.reps_bloco} reps · ${p.pausa_s}s`;
};
export const groupSummary = (ex: ParsedExercise): string => ex.grupo_id && ex.tipo_grupo
  ? `${ex.ordem_grupo === 'B' ? 'A2' : 'A1'} — ${ex.tipo_grupo === 'superset' ? 'Superset' : 'Bi-set'}` : '';
export const executionSummary = (ex: ParsedExercise): string => [groupSummary(ex), methodSummary(ex)].filter(Boolean).join(' · ');
export const exerciseSetCount = (ex: ParsedExercise): number => buildSetPlan(ex.series, ex.series2, ex.reps, ex.setScheme).length;
export interface ExerciseBlock { id: string; indices: number[] }
export const exerciseBlocks = (exercises: ParsedExercise[]): ExerciseBlock[] => {
  const used = new Set<number>();
  return exercises.flatMap((ex, i) => {
    if (used.has(i)) return [];
    const indices = ex.grupo_id ? exercises.flatMap((peer, j) => peer.grupo_id === ex.grupo_id ? [j] : []) : [i];
    const valid = indices.length === 2 && indices.every(j => exercises[j].tipo_grupo === ex.tipo_grupo)
      && !!ex.tipo_grupo && new Set(indices.map(j => exercises[j].ordem_grupo)).size === 2
      && exerciseSetCount(exercises[indices[0]]) === exerciseSetCount(exercises[indices[1]]);
    const members = valid ? indices.sort((a, b) => exercises[a].ordem_grupo === 'A' ? -1 : exercises[b].ordem_grupo === 'A' ? 1 : a - b) : [i];
    members.forEach(j => used.add(j));
    return [{ id: valid ? ex.grupo_id ?? String(i) : ex.id ?? `legacy-${i}`, indices: members }];
  });
};
export const validateGroups = (exercises: ParsedExercise[]): string | null => {
  for (const id of new Set(exercises.map(ex => ex.grupo_id).filter(Boolean))) {
    const members = exercises.filter(ex => ex.grupo_id === id);
    if (members.length !== 2) return 'Cada grupo precisa de exatamente 2 exercícios.';
    if (exerciseSetCount(members[0]) !== exerciseSetCount(members[1])) return 'Os dois exercícios do grupo precisam ter o mesmo número de séries.';
    if (new Set(members.map(ex => ex.ordem_grupo)).size !== 2 || !members.some(ex => ex.ordem_grupo === 'A') || !members.some(ex => ex.ordem_grupo === 'B')) return 'O grupo precisa de um exercício A e um B.';
    if (!members[0].tipo_grupo || members[0].tipo_grupo !== members[1].tipo_grupo) return 'O tipo dos dois exercícios do grupo deve ser igual.';
    if (members.some(ex => (ex.pausa_grupo_s ?? 0) < 0 || (ex.pausa_grupo_s ?? 0) > 10)) return 'A pausa entre A e B deve ficar entre 0 e 10 segundos.';
  }
  return null;
};
export const groupExercises = (exercises: ParsedExercise[], ids: string[], type: 'superset' | 'biset', groupId: string): ParsedExercise[] => {
  const chosen = exercises.filter(ex => ids.includes(ex.id ?? ''));
  if (chosen.length !== 2 || chosen.some(ex => ex.grupo_id)) throw new Error('Selecione 2 exercícios sem grupo.');
  if (exerciseSetCount(chosen[0]) !== exerciseSetCount(chosen[1])) throw new Error('Os dois exercícios precisam ter o mesmo número de séries.');
  const first = exercises.indexOf(chosen[0]);
  const others = exercises.filter(ex => !ids.includes(ex.id ?? ''));
  others.splice(first, 0, ...chosen.map((ex, i) => ({ ...ex, grupo_id: groupId, tipo_grupo: type, ordem_grupo: i === 0 ? 'A' as const : 'B' as const, pausa_grupo_s: 0 })));
  return others;
};
export const ungroupExercises = (exercises: ParsedExercise[], groupId: string): ParsedExercise[] => exercises.map(ex => ex.grupo_id === groupId
  ? { ...ex, grupo_id: undefined, tipo_grupo: undefined, ordem_grupo: undefined, pausa_grupo_s: undefined } : ex);
export const moveExerciseBlock = (exercises: ParsedExercise[], active: string, over: string): ParsedExercise[] => {
  const blocks = exerciseBlocks(exercises);
  const from = blocks.findIndex(b => b.id === active), to = blocks.findIndex(b => b.id === over);
  if (from < 0 || to < 0) return exercises;
  const [block] = blocks.splice(from, 1); blocks.splice(to, 0, block);
  return blocks.flatMap(b => b.indices.map(i => exercises[i]));
};
export const makeSubRecords = (ex: ParsedExercise, set: MethodSetEntry): SubRecord[] => {
  const m = seriesMethod(ex), p = methodParameters(ex);
  const count = m === 'dropset' ? p.drops + 1 : m === 'restpause' ? p.minis + 1 : m === 'cluster' ? p.blocos : 1;
  const weight = Number(set.weight.replace(',', '.'));
  // Drops arredondados em 0,5 kg (halteres/anilhas).
  const dropWeight = (i: number) => String(Math.round(weight * (1 - p.reducao_pct / 100) ** i * 2) / 2).replace('.', ',');
  return Array.from({ length: count }, (_, i) => ({
    label: m === 'cluster' ? `Bloco ${i + 1}` : i === 0 ? 'Principal' : m === 'dropset' ? `Drop ${i}` : `Mini-série ${i}`,
    weight: i === 0 ? set.weight : m === 'dropset' && weight > 0 ? dropWeight(i) : '',
    reps: i === 0 ? set.reps : '', completed: false,
  }));
};
export const methodLogFields = (ex: ParsedExercise, set: MethodSetEntry) => set.subRecords?.length ? {
  sub_records: set.subRecords.map(part => ({ ...part })), exercise_slot_id: ex.id ?? null, training_method: seriesMethod(ex),
} : {};
export const subRecordVolume = (set: MethodSetEntry): number => (set.subRecords?.length ? set.subRecords : [set])
  .filter(s => s.completed !== false).reduce((sum, s) => sum + (Number(s.weight.replace(',', '.')) || 0) * (Number(s.reps) || 0), 0);