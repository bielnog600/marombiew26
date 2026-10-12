export type PlanWhatsAppGender = 'm' | 'f';
export type PlanWhatsAppState = 'new' | 'adjusted';

export const PLAN_WHATSAPP_VARIATION_COUNT = 6;

export interface BuildPlanWhatsAppMessageInput {
  firstName: string;
  noun: string;
  gender: PlanWhatsAppGender;
  titulo: string;
  state: PlanWhatsAppState;
  /** Deterministic variation index. Randomness and storage belong to the caller. */
  seed?: number;
}

export function normalizeMessageSeed(seed: number, count: number): number {
  return Number.isFinite(seed) ? ((Math.trunc(seed) % count) + count) % count : 0;
}

/** Pure selection: sample uniformly from every index except the previous one. */
export function chooseMessageIndex(count: number, previous: number | null, random: number): number {
  const validPrevious = previous !== null && Number.isInteger(previous) && previous >= 0 && previous < count;
  const available = count - (validPrevious ? 1 : 0);
  if (available <= 0) return 0;
  const sample = Number.isFinite(random) ? Math.max(0, Math.min(random, 1 - Number.EPSILON)) : 0;
  const index = Math.floor(sample * available);
  return validPrevious && index >= previous ? index + 1 : index;
}

const lastIndices = new Map<string, number>();

/** Browser boundary; denied/unavailable storage still avoids repetition in this session. */
export function nextPlanWhatsAppMessageIndex(studentId: string, planType: string, count: number): number {
  const key = `whatsapp:plan-message:${encodeURIComponent(studentId)}:${encodeURIComponent(planType)}`;
  let previous = lastIndices.get(key) ?? null;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null && /^\d+$/.test(stored)) previous = Number(stored);
  } catch { /* Storage may be blocked by the browser. */ }
  const index = chooseMessageIndex(count, previous, Math.random());
  lastIndices.set(key, index);
  try { localStorage.setItem(key, String(index)); } catch { /* Keep session fallback. */ }
  return index;
}

export function buildPlanWhatsAppMessage({ firstName, noun, gender, titulo, state, seed = 0 }: BuildPlanWhatsAppMessageInput): string {
  const name = firstName.trim().split(' ')[0] || 'aluno';
  const g = gender === 'f'
    ? { possessive: 'sua', newPlan: 'Sua nova', lowerNew: 'sua nova', article: 'a', inPossessive: 'na sua', released: 'liberada', adjusted: 'ajustada', ready: 'pronta', fresh: 'nova' }
    : { possessive: 'seu', newPlan: 'Seu novo', lowerNew: 'seu novo', article: 'o', inPossessive: 'no seu', released: 'liberado', adjusted: 'ajustado', ready: 'pronto', fresh: 'novo' };
  const plan = `*${noun}* ("${titulo}")`;
  const messages = state === 'new' ? [
    `Oi ${name}! ${g.newPlan} ${plan} já está ${g.released} no app. É só abrir e começar. Qualquer dúvida, me chama aqui.`,
    `${name}, montei ${g.lowerNew} ${plan}. Já está no app — dá uma olhada nos exercícios antes de ir pra academia.`,
    `E aí, ${name}! Chegou ${g.lowerNew} ${plan}. Abre no app, confere tudo e me avisa se algo não encaixar na tua rotina.`,
    `${name}, ${g.article} ${plan} está no app, com a programação ${g.fresh}. Lê com calma e, se tiver exercício que você não conhece, me chama que eu explico.`,
    `Oi ${name}! ${g.newPlan} ${plan} está ${g.ready} no app. Confere os tempos e as orientações antes de começar; se precisar adaptar algo, me avisa aqui.`,
    `${name}, deixei ${g.possessive} ${plan} ${g.released} no app. Abre e confere a sequência antes da próxima sessão. Se surgir dúvida, me chama.`,
  ] : [
    `Oi ${name}! Fiz uns ajustes ${g.inPossessive} ${plan} e já está no app. Confere as mudanças antes do próximo treino.`,
    `${name}, ${g.article} ${plan} foi ${g.adjusted}. Abre o app pra ver o que mudou. Qualquer dúvida, me chama.`,
    `Atualizei ${g.article} ${plan}, ${name}. Já está no app — dá uma conferida nas séries e nas cargas.`,
    `Oi ${name}! Revisei ${g.possessive} ${plan}. Os ajustes já estão no app; confere a sequência e os tempos antes de começar.`,
    `${name}, ${g.possessive} ${plan} já está ${g.adjusted} no app. Lê as orientações atualizadas e me avisa se precisar adaptar alguma coisa.`,
    `E aí, ${name}! As mudanças ${g.inPossessive} ${plan} já estão no app. Abre antes da próxima sessão e confere o que foi ${g.adjusted}. Se tiver dúvida, fala comigo aqui.`,
  ];
  return messages[normalizeMessageSeed(seed, messages.length)];
}