/**
 * Organização da tela "Voz da Correção ao vivo" em abas (lógica pura).
 * Só agrupa e filtra o catálogo para exibição: chaves, geração e reprodução não mudam.
 */
import { EXERCISE_RULE_ORDER, getExerciseRule, PLANK_KNEE_DOWN_MESSAGE, PLANK_NOT_HORIZONTAL_MESSAGE } from '@/lib/liveCorrection/exercises';
import { voicePhraseKey, type VoiceCategory, type VoicePhrase } from '@/lib/liveCorrection/voice/phrases';

export type VoiceTab = 'config' | 'numeros' | 'comandos' | 'correcoes' | 'motivacao' | 'nomes';
export const VOICE_TABS: VoiceTab[] = ['config', 'numeros', 'comandos', 'correcoes', 'motivacao', 'nomes'];
export const VOICE_TAB_LABELS: Record<VoiceTab, string> = {
  config: 'Configuração',
  numeros: 'Números',
  comandos: 'Comandos',
  correcoes: 'Correções',
  motivacao: 'Motivação',
  nomes: 'Com nome',
};
export const isVoiceTab = (v: unknown): v is VoiceTab => typeof v === 'string' && (VOICE_TABS as string[]).includes(v);

const TAB_CATEGORIES: Partial<Record<VoiceTab, VoiceCategory[]>> = {
  numeros: ['numeros'],
  comandos: ['inicio_fim', 'posicao'],
  correcoes: ['pernas', 'bracos', 'prancha'],
};

/** Falas do sistema de uma aba (vazio nas abas sem falas do sistema). */
export function systemPhrasesForTab(catalog: readonly VoicePhrase[], tab: VoiceTab): VoicePhrase[] {
  const cats = TAB_CATEGORIES[tab];
  return cats ? catalog.filter((p) => cats.includes(p.category)) : [];
}

export interface CorrectionGroup { id: string; label: string; phrases: VoicePhrase[] }

/**
 * Correções por exercício, na ordem do seletor do admin. Uma fala usada por mais de um
 * exercício aparece em cada um; o que não casar com nenhum fica em "Outras".
 */
export function correctionGroups(catalog: readonly VoicePhrase[]): CorrectionGroup[] {
  const corrections = systemPhrasesForTab(catalog, 'correcoes');
  const byKey = new Map(corrections.map((p) => [p.key, p]));
  const used = new Set<string>();
  const groups: CorrectionGroup[] = [];
  for (const id of EXERCISE_RULE_ORDER) {
    const rule = getExerciseRule(id);
    const texts = [...Object.values(rule.messages)];
    if (rule.timed) texts.push(PLANK_NOT_HORIZONTAL_MESSAGE, PLANK_KNEE_DOWN_MESSAGE);
    const keys = [...new Set(texts.map((t) => voicePhraseKey(t)))].filter((k) => byKey.has(k));
    if (!keys.length) continue;
    keys.forEach((k) => used.add(k));
    groups.push({ id, label: rule.label, phrases: keys.map((k) => byKey.get(k)!) });
  }
  const rest = corrections.filter((p) => !used.has(p.key));
  if (rest.length) groups.push({ id: 'outras', label: 'Outras', phrases: rest });
  return groups;
}

export type PhraseStatus = 'approved' | 'pending' | 'empty';
/** Aprovada só quando a versão aprovada ainda existe na lista de versões. */
export function phraseStatus(approvedTakeId: string | null | undefined, takeIds: readonly string[]): PhraseStatus {
  if (approvedTakeId && takeIds.includes(approvedTakeId)) return 'approved';
  return takeIds.length ? 'pending' : 'empty';
}

export type PhraseFilter = 'todas' | 'sem_audio' | 'para_aprovar' | 'aprovadas';
export const PHRASE_FILTERS: PhraseFilter[] = ['todas', 'sem_audio', 'para_aprovar', 'aprovadas'];
export const PHRASE_FILTER_LABELS: Record<PhraseFilter, string> = {
  todas: 'Todas',
  sem_audio: 'Sem áudio',
  para_aprovar: 'Para aprovar',
  aprovadas: 'Aprovadas',
};
const FILTER_STATUS: Record<Exclude<PhraseFilter, 'todas'>, PhraseStatus> = {
  sem_audio: 'empty', para_aprovar: 'pending', aprovadas: 'approved',
};
export function matchesFilter(status: PhraseStatus, filter: PhraseFilter): boolean {
  return filter === 'todas' || FILTER_STATUS[filter] === status;
}

/** Contador "X de Y aprovadas" de uma lista de chaves (repetidas contam uma vez). */
export function approvalCount(keys: readonly string[], statusOf: (key: string) => PhraseStatus): { approved: number; total: number } {
  const unique = [...new Set(keys)];
  return { approved: unique.filter((k) => statusOf(k) === 'approved').length, total: unique.length };
}

/** Chaves sem nenhuma versão (o "Gerar sem áudio desta aba"), sem repetir. */
export function emptyKeys(keys: readonly string[], statusOf: (key: string) => PhraseStatus): string[] {
  return [...new Set(keys)].filter((k) => statusOf(k) === 'empty');
}

export const VOICE_TAB_STORAGE_KEY = 'coachVoice.lastTab';
type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage = (): MinimalStorage | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
};

/** Última aba aberta; sem acesso ao armazenamento (modo privado etc.) → "Configuração". */
export function readLastVoiceTab(storage: MinimalStorage | null = browserStorage()): VoiceTab {
  try {
    const v = storage?.getItem(VOICE_TAB_STORAGE_KEY);
    return isVoiceTab(v) ? v : 'config';
  } catch {
    return 'config';
  }
}
export function saveLastVoiceTab(tab: VoiceTab, storage: MinimalStorage | null = browserStorage()): void {
  try { storage?.setItem(VOICE_TAB_STORAGE_KEY, tab); } catch { /* sem armazenamento: só não lembra */ }
}
