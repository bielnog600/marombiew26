/**
 * Falas de motivação da Correção ao vivo (lógica pura, com sorteio injetável).
 * - Cada fala aprovada tem um momento ("quando tocar") e uma frequência.
 * - Sorteia entre as falas do momento, sem repetir a mesma duas vezes seguidas,
 *   preferindo as com o nome do aluno quando existirem.
 * - Nas reps, no máximo 1 motivação a cada MOTIVATION_REP_GAP reps.
 * - Motivação entra sempre depois do número e da correção (nunca no lugar deles).
 */

export type VoiceMoment = 'rep_completa' | 'penultima_ultima' | 'inicio_serie' | 'fim_serie' | 'rep_incompleta';
export type VoiceFrequency = 'sempre' | 'as_vezes' | 'raramente';

export const VOICE_MOMENT_ORDER: VoiceMoment[] = ['inicio_serie', 'rep_completa', 'penultima_ultima', 'rep_incompleta', 'fim_serie'];
export const VOICE_MOMENT_LABELS: Record<VoiceMoment, string> = {
  inicio_serie: 'Início da série (depois de "Pode começar!")',
  rep_completa: 'Rep completa sem erro (depois do número)',
  penultima_ultima: 'Penúltima e última rep previstas',
  rep_incompleta: 'Depois de uma correção',
  fim_serie: 'Fim da série (depois de "Fechou a série!")',
};
export const VOICE_FREQUENCY_ORDER: VoiceFrequency[] = ['sempre', 'as_vezes', 'raramente'];
export const VOICE_FREQUENCY_LABELS: Record<VoiceFrequency, string> = {
  sempre: 'Sempre',
  as_vezes: 'Às vezes (~1 em 3)',
  raramente: 'Raramente (~1 em 6)',
};
/** Chance de cada frequência tocar quando o momento acontece. */
export const FREQUENCY_CHANCE: Record<VoiceFrequency, number> = { sempre: 1, as_vezes: 1 / 3, raramente: 1 / 6 };
/** Nas reps: no máximo 1 motivação a cada tantas reps. */
export const MOTIVATION_REP_GAP = 3;

const REP_MOMENTS: ReadonlySet<VoiceMoment> = new Set(['rep_completa', 'penultima_ultima', 'rep_incompleta']);

export const isVoiceMoment = (v: unknown): v is VoiceMoment =>
  typeof v === 'string' && (VOICE_MOMENT_ORDER as string[]).includes(v);
export const isVoiceFrequency = (v: unknown): v is VoiceFrequency =>
  typeof v === 'string' && (VOICE_FREQUENCY_ORDER as string[]).includes(v);

export interface MotivationClip {
  key: string;
  /** Texto gravado (voz do celular se o áudio não tocar). */
  text: string;
  moment: VoiceMoment;
  frequency: VoiceFrequency;
  /** Fala com o nome do aluno. */
  personal: boolean;
}

/** Linha do servidor → fala de motivação (null = fala do sistema ou dados inválidos). */
export function motivationClipFromRow(row: {
  phrase_key: string; tipo?: string | null; momento?: string | null; frequencia?: string | null; texto?: string | null;
}): MotivationClip | null {
  if (row.tipo !== 'personalizada' && row.tipo !== 'nome') return null;
  if (!isVoiceMoment(row.momento)) return null;
  return {
    key: row.phrase_key,
    text: (row.texto ?? '').trim(),
    moment: row.momento,
    frequency: isVoiceFrequency(row.frequencia) ? row.frequencia : 'sempre',
    personal: row.tipo === 'nome',
  };
}

/**
 * Meta de reps da série do plano ("12" → 12, "8-10" → 10, "10 a 12" → 12).
 * Sem número, tempo ("30s", "1 min") ou "falha" → null (o momento penúltima/última não é usado).
 */
export function parseTargetReps(reps: string | null | undefined): number | null {
  if (!reps) return null;
  const text = String(reps).toLowerCase();
  if (/\d\s*(s|seg|segundos?|min|minutos?)\b/.test(text) || /["'″]/.test(text)) return null;
  const nums = (text.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0 && n <= 100);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/** Penúltima/última: a fala toca logo antes das 2 últimas reps previstas (feitas = meta−2 ou meta−1). */
export function isFinalStretch(completeCount: number, targetReps: number | null | undefined): boolean {
  if (!targetReps || targetReps < 3) return false;
  return completeCount === targetReps - 2 || completeCount === targetReps - 1;
}

export class MotivationPicker {
  private lastKey: string | null = null;
  private lastRepIndex = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly source: () => readonly MotivationClip[],
    private readonly random: () => number = Math.random,
  ) {}

  /** Série nova: o limite de reps recomeça (o "sem repetir seguida" continua). */
  resetSeries(): void {
    this.lastRepIndex = Number.NEGATIVE_INFINITY;
  }

  /** Sorteia uma fala do momento; `repIndex` = reps já registradas (para o limite). */
  pick(moment: VoiceMoment, repIndex?: number): MotivationClip | null {
    const isRep = REP_MOMENTS.has(moment);
    if (isRep && repIndex != null && repIndex - this.lastRepIndex < MOTIVATION_REP_GAP) return null;
    const candidates = this.source().filter((c) => c.moment === moment);
    if (!candidates.length) return null;
    let passing = candidates.filter((c) => this.random() < FREQUENCY_CHANCE[c.frequency]);
    if (passing.length > 1) passing = passing.filter((c) => c.key !== this.lastKey);
    if (!passing.length) return null;
    const personal = passing.filter((c) => c.personal);
    const pool = personal.length ? personal : passing;
    const chosen = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    this.lastKey = chosen.key;
    if (isRep && repIndex != null) this.lastRepIndex = repIndex;
    return chosen;
  }

  /**
   * Motivação depois de uma rep:
   * - correção falada → "rep_incompleta" (incentivo depois da correção);
   * - rep completa sem erro → "penultima_ultima" nas 2 últimas previstas, senão "rep_completa";
   * - correção calada pelo limite de 3 s → nada (não fala motivação no lugar da correção).
   */
  forRep(rep: {
    complete: boolean; hasErrors: boolean; correctionSpoken: boolean;
    completeCount: number; repIndex: number; targetReps?: number | null;
  }): MotivationClip | null {
    if (rep.correctionSpoken) return this.pick('rep_incompleta', rep.repIndex);
    if (!rep.complete || rep.hasErrors) return null;
    if (isFinalStretch(rep.completeCount, rep.targetReps)) {
      const last = this.pick('penultima_ultima', rep.repIndex);
      if (last) return last;
    }
    return this.pick('rep_completa', rep.repIndex);
  }
}

// ---------------------------------------------------------------------------
// Falas com nome (admin)
// ---------------------------------------------------------------------------

export const NAME_PLACEHOLDER = '{nome}';

/** "Bora, {nome}!" + "Rafa" → "Bora, Rafa!". */
export function renderNameTemplate(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name.trim()).replace(/\s+/g, ' ').trim();
}

/** Primeiro nome do perfil ("Rafael Souza" → "Rafael"). */
export function defaultVoiceName(profileName: string | null | undefined): string {
  return (profileName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Nome falado: o "Como falar o nome" do admin, senão o primeiro nome do perfil. */
export function spokenName(voiceName: string | null | undefined, profileName: string | null | undefined): string {
  const custom = (voiceName ?? '').trim();
  return custom || defaultVoiceName(profileName);
}

const hex = (uuid: string) => uuid.toLowerCase().replace(/[^a-f0-9]/g, '');

/** Chave da fala com nome: pasta `nome_<modelo>_<aluno>` (o servidor libera o arquivo só para o aluno). */
export function namePhraseKey(templateId: string, studentId: string): string {
  return `nome_${hex(templateId)}_${hex(studentId)}`;
}

/** Chave de uma fala personalizada nova. */
export function customPhraseKey(id: string): string {
  return `motiv_${hex(id)}`;
}

export interface NameTemplate { id: string; texto: string; momento: VoiceMoment; frequencia: VoiceFrequency; ativo: boolean }
export interface NameStudent { user_id: string; nome: string | null; voice_name: string | null }
export interface NamePhraseRow {
  phrase_key: string; texto: string; tipo: string;
  momento: string | null; frequencia: string; template_id: string | null; student_id: string | null;
}

/**
 * Linhas que faltam ou mudaram para "modelo × aluno premium": texto com o nome falado,
 * momento/frequência/ativo do modelo. Alunos sem nome ficam de fora até o admin preencher.
 */
export function planNamePhrases(
  templates: readonly NameTemplate[],
  students: readonly NameStudent[],
  existing: readonly NamePhraseRow[],
): { upserts: Array<NamePhraseRow & { ativo: boolean; categoria: string }> } {
  const byKey = new Map(existing.map((r) => [r.phrase_key, r]));
  const upserts: Array<NamePhraseRow & { ativo: boolean; categoria: string }> = [];
  for (const t of templates) {
    for (const s of students) {
      const name = spokenName(s.voice_name, s.nome);
      if (!name) continue;
      const key = namePhraseKey(t.id, s.user_id);
      const texto = renderNameTemplate(t.texto, name);
      const prev = byKey.get(key);
      if (prev && prev.texto === texto && prev.momento === t.momento && prev.frequencia === t.frequencia) continue;
      upserts.push({
        phrase_key: key, texto, tipo: 'nome', momento: t.momento, frequencia: t.frequencia,
        template_id: t.id, student_id: s.user_id, ativo: true, categoria: 'Falas com nome',
      });
    }
  }
  return { upserts };
}
