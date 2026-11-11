/**
 * Estado da voz gravada para o selo de diagnóstico da tela da câmera (lógica pura).
 */
export type CoachVoiceProblem = 'loading' | 'no_clips' | 'blocked' | 'download_error' | null;

export interface CoachVoiceStatus {
  /** Lista de aprovados já veio do servidor. */
  listed: boolean;
  /** Falas aprovadas no servidor. */
  approved: number;
  /** Falas com áudio pronto para tocar. */
  ready: number;
  /** Falhas ao listar ou baixar. */
  loadErrors: number;
  /** Estado atual do AudioContext ('running', 'suspended', 'interrupted', 'closed' ou 'none'). */
  contextState: string;
  /** Já houve um toque que liberou o áudio nesta tela. */
  unlocked: boolean;
  /** A última tentativa de tocar um áudio não tocou de jeito nenhum. */
  lastPlayFailed: boolean;
}

export const INITIAL_COACH_VOICE_STATUS: CoachVoiceStatus = {
  listed: false, approved: 0, ready: 0, loadErrors: 0, contextState: 'none', unlocked: false, lastPlayFailed: false,
};

/** Motivo de a voz gravada não estar tocando; null = tocando com a voz gravada. */
export function coachVoiceProblem(s: CoachVoiceStatus): CoachVoiceProblem {
  if (!s.listed) return s.loadErrors > 0 ? 'download_error' : 'loading';
  if (s.approved === 0) return 'no_clips';
  if (s.ready === 0) return s.loadErrors > 0 ? 'download_error' : 'loading';
  if (s.lastPlayFailed) return 'blocked';
  if (s.contextState !== 'running' && !s.unlocked) return 'blocked';
  return null;
}

const PROBLEM_LABELS: Record<Exclude<CoachVoiceProblem, null>, string> = {
  loading: 'baixando áudios',
  no_clips: 'sem áudios',
  blocked: 'áudio bloqueado',
  download_error: 'erro ao baixar',
};

/** Texto do selo: "Voz: Fabiew (N/77)" ou "Voz: celular · motivo". */
export function coachVoiceBadgeLabel(s: CoachVoiceStatus, total: number, voiceName = 'Fabiew'): string {
  const problem = coachVoiceProblem(s);
  if (problem == null) return `Voz: ${voiceName} (${s.ready}/${total})`;
  return `Voz: celular · ${PROBLEM_LABELS[problem]}`;
}

/** Contas que veem o selo de diagnóstico da voz além do admin (conta de aluno do Fabiew Aires). */
export const VOICE_DIAGNOSTIC_USER_IDS: readonly string[] = ['0feb5458-15cb-490a-9341-90bd57795495'];

export function canSeeVoiceDiagnostic(userId: string | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || (!!userId && VOICE_DIAGNOSTIC_USER_IDS.includes(userId));
}
