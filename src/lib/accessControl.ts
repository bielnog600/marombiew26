// Controle de acesso do aluno: inatividade, suspensão e reativação.
// Fonte canônica no banco: public.students_profile
// (access_status, suspension_reason, suspended_at, suspended_by, last_active_at)

export const INACTIVITY_SUSPENSION_DAYS = 15;

/** Throttle client-side do heartbeat (o banco também limita a 1 write/12h). */
export const LAST_ACTIVE_THROTTLE_MS = 6 * 60 * 60 * 1000;

export const TRAINER_REACTIVATION_WHATSAPP = '351939184666';

export type AccessStatus = 'active' | 'suspended';
export type SuspensionReason = 'inactivity' | 'manual';

export interface StudentAccessState {
  status: AccessStatus;
  reason: SuspensionReason | null;
  suspendedAt: string | null;
  lastActiveAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Regra dos 15 dias (determinística):
 * - só alunos (nunca admin/professor);
 * - só quem está ativo;
 * - só quem já acessou alguma vez (last_active_at != null);
 * - só quando ULTRAPASSA 15 dias (exatamente 15 dias ainda não suspende).
 */
export function isEligibleForInactivitySuspension(params: {
  accessStatus: AccessStatus;
  lastActiveAt: string | Date | null;
  isAdmin?: boolean;
  now?: Date;
}): boolean {
  const { accessStatus, lastActiveAt, isAdmin = false } = params;
  if (isAdmin) return false;
  if (accessStatus !== 'active') return false;
  if (!lastActiveAt) return false;
  const now = params.now ?? new Date();
  const last = lastActiveAt instanceof Date ? lastActiveAt : new Date(lastActiveAt);
  if (Number.isNaN(last.getTime())) return false;
  return now.getTime() - last.getTime() > INACTIVITY_SUSPENSION_DAYS * DAY_MS;
}

export function suspensionReasonLabel(reason: SuspensionReason | null): string {
  if (reason === 'inactivity') return 'Inatividade';
  if (reason === 'manual') return 'Manual';
  return 'Não informado';
}

/** Link do WhatsApp para solicitar reativação. Nenhum dado sensível é incluído. */
export function buildReactivationWhatsAppUrl(studentName?: string | null): string {
  const name = (studentName ?? '').trim();
  const message = name
    ? `Olá Fabiel! Sou ${name}. Meu acesso ao MAROMBIEW está suspenso e gostaria de solicitar a reativação da minha conta.`
    : 'Olá Fabiel! Meu acesso ao MAROMBIEW está suspenso e gostaria de solicitar a reativação da minha conta.';
  return `https://wa.me/${TRAINER_REACTIVATION_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
