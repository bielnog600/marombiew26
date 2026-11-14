/**
 * Catálogo das falas da Correção ao vivo (lógica pura). Montado a partir das próprias
 * regras dos exercícios: mensagem nova no código vira fala nova aqui, sem lista manual.
 * A tela da câmera fala o texto do código; a chave (`phrase_key`) liga esse texto ao
 * áudio aprovado, então editar o texto da gravação não muda o que a câmera procura.
 */
import {
  AUTO_FINISH_MESSAGE, POSITION_MESSAGES, TURN_SIDEWAYS_MESSAGE, repNumberWord, type Side,
} from '../squatAnalysis';
import {
  EXERCISE_RULES, FACE_CAMERA_MESSAGE, LEG_LABELS,
  PLANK_FINISH_MESSAGE, PLANK_KNEE_DOWN_MESSAGE, PLANK_NOT_HORIZONTAL_MESSAGE,
  type ExerciseRuleId,
} from '../exercises';

export type VoiceCategory = 'numeros' | 'inicio_fim' | 'posicao' | 'pernas' | 'bracos' | 'prancha' | 'tabata';

export const VOICE_CATEGORY_ORDER: VoiceCategory[] = ['numeros', 'inicio_fim', 'posicao', 'pernas', 'bracos', 'prancha'];
export const VOICE_CATEGORY_LABELS: Record<VoiceCategory, string> = {
  numeros: 'Números',
  inicio_fim: 'Início/fim',
  posicao: 'Posição',
  pernas: 'Correções de pernas',
  bracos: 'Correções de braços/ombros',
  prancha: 'Prancha',
  tabata: 'TABATA',
};

export interface VoicePhrase {
  key: string;
  /** Texto que a câmera fala hoje (casa a fala com o áudio e é o texto da voz do celular). */
  text: string;
  /** Texto inicial da gravação (o admin pode editar). */
  voiceText: string;
  category: VoiceCategory;
}

/** Reps contadas em voz (1 a 30). */
export const SPOKEN_REP_MAX = 30;
/** Tempos da prancha falados a cada 10 s além de trinta. */
export const PLANK_SPOKEN_TENS = [40, 50, 60, 70, 80, 90, 100, 110, 120];

const LEG_RULES: ExerciseRuleId[] = ['squat', 'stiff', 'bulgaro', 'hip_thrust', 'leg_press'];
const ARM_RULES: ExerciseRuleId[] = ['lateral_raise', 'curl', 'triceps_french', 'shoulder_press', 'bench_press'];

/** Texto → forma comparável (sem acento, minúsculas, sem pontuação). */
export function normalizeSpeech(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Chave estável de uma fala a partir do texto do código. */
export function voicePhraseKey(text: string): string {
  return normalizeSpeech(text).replace(/ /g, '_').slice(0, 80);
}

export const numberPhraseKey = (n: number) => `numero_${n}`;

/** "Trocar perna" (búlgaro/afundo). */
export function legSwitchMessage(leg: Side): string {
  return `Agora a perna ${LEG_LABELS[leg].toLowerCase()} na frente`;
}

/** "Pode começar" é falado sem a exclamação da tela. */
export const START_MESSAGE = 'Pode começar';

/** Texto inicial da gravação quando a tela mostra com exclamação. */
const VOICE_TEXT_OVERRIDES: Record<string, string> = {
  [START_MESSAGE]: 'Pode começar!',
  [AUTO_FINISH_MESSAGE]: 'Fechou a série!',
  [PLANK_FINISH_MESSAGE]: 'Fechou!',
};

export function buildVoiceCatalog(): VoicePhrase[] {
  const out: VoicePhrase[] = [];
  const seen = new Set<string>();
  const add = (text: string, category: VoiceCategory, key = voicePhraseKey(text)) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, text, voiceText: VOICE_TEXT_OVERRIDES[text] ?? text, category });
  };

  const numbers = [...Array.from({ length: SPOKEN_REP_MAX }, (_, i) => i + 1), ...PLANK_SPOKEN_TENS];
  for (const n of numbers) add(repNumberWord(n), 'numeros', numberPhraseKey(n));

  add(START_MESSAGE, 'inicio_fim');
  add(AUTO_FINISH_MESSAGE, 'inicio_fim');
  add(PLANK_FINISH_MESSAGE, 'inicio_fim');

  add(POSITION_MESSAGES.cut, 'posicao');
  add(POSITION_MESSAGES.frontal, 'posicao');
  add(POSITION_MESSAGES.moving, 'posicao');
  add(TURN_SIDEWAYS_MESSAGE, 'posicao');
  add(FACE_CAMERA_MESSAGE, 'posicao');
  add(legSwitchMessage('left'), 'posicao');
  add(legSwitchMessage('right'), 'posicao');

  const byId = new Map(EXERCISE_RULES.map((r) => [r.id, r]));
  for (const id of LEG_RULES) for (const m of Object.values(byId.get(id)?.messages ?? {})) add(m, 'pernas');
  for (const id of ARM_RULES) for (const m of Object.values(byId.get(id)?.messages ?? {})) add(m, 'bracos');
  add(PLANK_NOT_HORIZONTAL_MESSAGE, 'prancha');
  add(PLANK_KNEE_DOWN_MESSAGE, 'prancha');
  // Regras novas, ainda fora das listas acima, entram aqui para nunca faltar fala.
  for (const r of EXERCISE_RULES) {
    const cat: VoiceCategory = r.timed ? 'prancha' : r.view === 'front' || ARM_RULES.includes(r.id) ? 'bracos' : 'pernas';
    for (const m of Object.values(r.messages)) add(m, cat);
  }
  return out;
}

export const VOICE_CATALOG: VoicePhrase[] = buildVoiceCatalog();

const KEY_BY_TEXT = new Map(VOICE_CATALOG.map((p) => [normalizeSpeech(p.text), p.key]));

/** Chave da fala para um texto falado pela câmera; null = fala fora do catálogo. */
export function phraseKeyForText(text: string): string | null {
  return KEY_BY_TEXT.get(normalizeSpeech(text)) ?? null;
}

/** Correções juntas ("Desce mais. Controla a descida") viram uma fala por arquivo. */
export function splitSpeech(text: string): string[] {
  return text.split(/\.\s+/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean);
}

/**
 * Ordem de download dos áudios: contagem 3-2-1, "Pode começar", correções do exercício
 * aberto, os outros números e só depois o resto do catálogo.
 */
export function voicePreloadPriority(ruleMessages: readonly string[]): string[] {
  const out: string[] = [];
  const push = (key: string | null) => { if (key && !out.includes(key)) out.push(key); };
  [3, 2, 1].forEach((n) => push(numberPhraseKey(n)));
  push(phraseKeyForText(START_MESSAGE));
  for (const m of ruleMessages) for (const part of splitSpeech(m)) push(phraseKeyForText(part));
  for (let n = 4; n <= SPOKEN_REP_MAX; n++) push(numberPhraseKey(n));
  return out;
}

/** Linhas aprovadas na ordem de download (prioridade primeiro, depois a ordem original). */
export function orderByPriority<T extends { phrase_key: string }>(rows: readonly T[], priority: readonly string[]): T[] {
  const rank = new Map(priority.map((k, i) => [k, i]));
  return rows
    .map((row, i) => ({ row, i, r: rank.get(row.phrase_key) ?? priority.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.row);
}
