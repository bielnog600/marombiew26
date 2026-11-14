// Voz do Fabiew no Player do TABATA — regras puras (sem áudio, sem banco).
// Cada momento tem um grupo de variações; o Player sorteia uma aprovada sem repetir a anterior
// e fala só de vez em quando (contagem em toda rodada; descanso e "Respira" espaçados).
import type { TabataIntensity } from './tabataProgression';
import type { PlayerPhase } from './tabataPlayerView';

/**
 * Grupos de falas. `contagembora` é a fala antiga "3, 2, 1… bora!" (contagem + largada num
 * clipe só), usada enquanto a contagem separada e alguma largada não estiverem aprovadas.
 * `blocosobe` só toca quando a intensidade sobe; `blocomax` só antes do bloco Máximo.
 */
export type TabataVoiceGroup =
  | 'preparar' | 'contagem' | 'largada' | 'descanso' | 'respira'
  | 'bloco' | 'blocosobe' | 'blocomax' | 'contagembora';

export type TabataMoment = 'preparar' | 'contagem' | 'largada' | 'descanso' | 'respira' | 'bloco';

const GROUPS: readonly TabataVoiceGroup[] = [
  'preparar', 'contagem', 'largada', 'descanso', 'respira', 'bloco', 'blocosobe', 'blocomax', 'contagembora',
];
const isGroup = (g: string): g is TabataVoiceGroup => (GROUPS as readonly string[]).includes(g);

/** Chaves das 5 falas originais (já aprovadas) → grupo. */
const LEGACY_KEYS: Record<string, TabataVoiceGroup> = {
  tabata_preparado: 'preparar',
  tabata_321_bora: 'contagembora',
  tabata_descanse: 'descanso',
  tabata_respira: 'respira',
  tabata_proximo_bloco: 'bloco',
};

/** Variações: `tabatav_<grupo>_<id>` (o banco só aceita a-z, 0-9 e _). */
const VARIATION_KEY = /^tabatav_([a-z]+)_[a-z0-9_]+$/;

export function tabataVoiceGroup(key: string): TabataVoiceGroup | null {
  if (LEGACY_KEYS[key]) return LEGACY_KEYS[key];
  const m = VARIATION_KEY.exec(key);
  return m && isGroup(m[1]) ? m[1] : null;
}
export const isTabataVoiceKey = (key: string) => tabataVoiceGroup(key) != null;

export function tabataVariationKey(group: TabataVoiceGroup, id: string): string {
  const clean = id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'x';
  return `tabatav_${group}_${clean}`;
}

/** Falas sugeridas (as 5 originais + variações novas, criadas sem áudio). */
export const TABATA_VOICE_SEEDS: ReadonlyArray<{ key: string; text: string }> = [
  { key: 'tabata_preparado', text: 'Tá preparado?' },
  { key: 'tabatav_preparar_vamoscomecar', text: 'Preparado? Vamos começar' },
  { key: 'tabatav_contagem_321', text: '3, 2, 1…' },
  { key: 'tabata_321_bora', text: '3, 2, 1… bora!' },
  { key: 'tabatav_largada_bora', text: 'Bora!' },
  { key: 'tabatav_largada_vamos', text: 'Vamos!' },
  { key: 'tabatav_largada_vai', text: 'Vai!' },
  { key: 'tabatav_largada_agora', text: 'Agora!' },
  { key: 'tabatav_largada_boraforca', text: 'Bora, força!' },
  { key: 'tabatav_descanso_umpouco', text: 'Descansa um pouco' },
  { key: 'tabata_descanse', text: 'Descanse agora!' },
  { key: 'tabatav_descanso_boa', text: 'Boa! Descansa' },
  { key: 'tabatav_descanso_soltacorpo', text: 'Isso! Solta o corpo' },
  { key: 'tabata_respira', text: 'Respira.' },
  { key: 'tabatav_respira_fundo', text: 'Respira fundo' },
  { key: 'tabatav_respira_folego', text: 'Recupera o fôlego' },
  { key: 'tabata_proximo_bloco', text: 'Vamos para o próximo bloco.' },
  { key: 'tabatav_blocosobe_intensidade', text: 'Próximo bloco, sobe a intensidade!' },
  { key: 'tabatav_blocomax_comtudo', text: 'Bloco novo, vamos com tudo!' },
];

/** Momentos na tela do admin (ordem do treino), com os grupos de cada um. */
export const TABATA_VOICE_MOMENT_INFO: ReadonlyArray<{
  id: TabataMoment; title: string; when: string; groups: TabataVoiceGroup[];
}> = [
  { id: 'preparar', title: 'Fique pronto', when: 'Na tela "Fique pronto", antes de começar.', groups: ['preparar'] },
  { id: 'contagem', title: 'Contagem "3, 2, 1"', when: 'Em toda rodada, nos 3 s antes do exercício. Depois toca a palavra de largada.', groups: ['contagem', 'contagembora'] },
  { id: 'largada', title: 'Largada', when: 'Logo depois do "3, 2, 1", quando o exercício começa. Sorteada a cada rodada.', groups: ['largada'] },
  { id: 'descanso', title: 'Início do descanso', when: 'De vez em quando (1 a cada 2–3 descansos). Nunca nos descansos curtos de 5 s.', groups: ['descanso'] },
  { id: 'respira', title: 'Respira', when: 'No meio de alguns descansos (cerca de 1 a cada 3) e sempre no descanso entre blocos.', groups: ['respira'] },
  { id: 'bloco', title: 'Transição entre blocos', when: 'Sempre, na tela entre um bloco e outro.', groups: ['bloco', 'blocosobe', 'blocomax'] },
];

export const TABATA_GROUP_NOTE: Partial<Record<TabataVoiceGroup, string>> = {
  contagembora: 'Versão antiga com "bora!" junto: só toca enquanto "3, 2, 1…" e alguma largada não estiverem aprovadas.',
  blocosobe: 'Só quando sobe a intensidade',
  blocomax: 'Só antes do bloco Máximo',
};

/** Ao adicionar uma variação: em que grupo ela entra (a transição tem a condição). */
export const TABATA_ADD_OPTIONS: Partial<Record<TabataMoment, Array<{ group: TabataVoiceGroup; label: string }>>> = {
  bloco: [
    { group: 'bloco', label: 'Sempre' },
    { group: 'blocosobe', label: 'Só quando sobe a intensidade' },
    { group: 'blocomax', label: 'Só antes do bloco Máximo' },
  ],
};
export const defaultAddGroup = (m: TabataMoment): TabataVoiceGroup => (TABATA_ADD_OPTIONS[m]?.[0].group ?? m);

export type VoiceBank = Partial<Record<TabataVoiceGroup, string[]>>;

/** Agrupa as chaves com áudio pronto. */
export function voiceBank(readyKeys: Iterable<string>): VoiceBank {
  const bank: VoiceBank = {};
  for (const k of readyKeys) {
    const g = tabataVoiceGroup(k);
    if (g) (bank[g] ??= []).push(k);
  }
  for (const g of Object.keys(bank) as TabataVoiceGroup[]) bank[g]!.sort();
  return bank;
}

/** split = "3, 2, 1…" + largada; legacy = "3, 2, 1… bora!"; beep = sem voz. */
export type CountdownMode = 'split' | 'legacy' | 'beep';
export function countdownMode(bank: VoiceBank): CountdownMode {
  if (bank.contagem?.length && bank.largada?.length) return 'split';
  if (bank.contagembora?.length) return 'legacy';
  return 'beep';
}

const RANK: Record<TabataIntensity, number> = { leve: 0, moderado: 1, forte: 2, maximo: 3 };

/** Candidatas do momento (a transição filtra pela intensidade do próximo bloco). */
export function momentCandidates(
  bank: VoiceBank, moment: TabataMoment,
  ctx: { from?: TabataIntensity; to?: TabataIntensity } = {},
): string[] {
  switch (moment) {
    case 'contagem': {
      const mode = countdownMode(bank);
      return mode === 'split' ? bank.contagem! : mode === 'legacy' ? bank.contagembora! : [];
    }
    case 'bloco': {
      const out = [...(bank.bloco ?? [])];
      if (ctx.from && ctx.to && RANK[ctx.to] > RANK[ctx.from]) out.push(...(bank.blocosobe ?? []));
      if (ctx.to === 'maximo') out.push(...(bank.blocomax ?? []));
      return out;
    }
    default:
      return [...(bank[moment] ?? [])];
  }
}

/** Sorteia uma fala sem repetir a última (quando houver outra). */
export function pickVariation(keys: readonly string[], last: string | null | undefined, rng: () => number = Math.random): string | null {
  if (!keys.length) return null;
  const pool = keys.length > 1 && last ? keys.filter(k => k !== last) : [...keys];
  const list = pool.length ? pool : [...keys];
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Descanso mínimo para a fala de início (os de 5 s do aquecimento ficam só no bipe). */
export const REST_CALL_MIN_SECONDS = 6;
/** Descanso mínimo para o "Respira" no meio. */
export const BREATHE_MIN_SECONDS = 8;
/** A contagem começa com 3 s para a largada cair no início do trabalho. */
export const COUNTDOWN_VOICE_AT = 3;

export interface PhaseCue { at: number; moment: TabataMoment }

export interface CuePlanner {
  /** Falas desta fase (segundos restantes em que cada uma toca). Chamar uma vez por fase. */
  plan(phase: PlayerPhase, total: number): PhaseCue[];
}

/**
 * Decide, no começo de cada fase, o que vai ser falado:
 * - contagem em toda fase antes de um exercício (≥ 3 s); largada no início de todo exercício;
 * - "Fique pronto" sempre; transição entre blocos sempre, com "Respira" no meio;
 * - início do descanso (≥ 6 s) a cada 2 ou 3 descansos (sorteado);
 * - "Respira" no meio de descansos ≥ 8 s, em média 1 a cada 3, nunca no mesmo descanso da fala de início.
 */
export function createCuePlanner(rng: () => number = Math.random): CuePlanner {
  let restCallIn = Math.floor(rng() * 2);      // 0–1 descansos até a primeira fala
  let breatheIn = 1 + Math.floor(rng() * 2);   // 1–2 descansos até o primeiro "Respira"
  const middleOf = (total: number) => {
    const m = Math.ceil(total / 2);
    return m > COUNTDOWN_VOICE_AT && m < total ? m : null;
  };
  return {
    plan(phase, total) {
      const cues: PhaseCue[] = [];
      if (phase === 'work') {
        if (total > 0) cues.push({ at: total, moment: 'largada' });
        return cues;
      }
      if (phase !== 'prep' && phase !== 'rest' && phase !== 'block_rest') return cues;
      const startFree = total > COUNTDOWN_VOICE_AT;
      if (phase === 'prep' && startFree) cues.push({ at: total, moment: 'preparar' });
      if (phase === 'block_rest') {
        if (startFree) cues.push({ at: total, moment: 'bloco' });
        const mid = total >= BREATHE_MIN_SECONDS ? middleOf(total) : null;
        if (mid) cues.push({ at: mid, moment: 'respira' });
      }
      if (phase === 'rest') {
        let called = false;
        if (total >= REST_CALL_MIN_SECONDS) {
          if (restCallIn <= 0) {
            cues.push({ at: total, moment: 'descanso' });
            called = true;
            restCallIn = 1 + Math.floor(rng() * 2); // pula 1–2 → 1 a cada 2–3
          } else restCallIn--;
        }
        if (total >= BREATHE_MIN_SECONDS) {
          const mid = middleOf(total);
          if (breatheIn > 0) breatheIn--;
          if (breatheIn <= 0 && !called && mid) {
            cues.push({ at: mid, moment: 'respira' });
            breatheIn = 1 + Math.floor(rng() * 3); // pula 0–2 depois → média 1 a cada 3
          }
        }
      }
      if (total >= COUNTDOWN_VOICE_AT) cues.push({ at: COUNTDOWN_VOICE_AT, moment: 'contagem' });
      return cues;
    },
  };
}
