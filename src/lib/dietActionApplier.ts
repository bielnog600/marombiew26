/**
 * Diet Action Applier — Fase 4
 *
 * Pure helpers for the assisted-action flow. Building the application
 * record and resolving action metadata are factored out of the dialog
 * so they can be tested deterministically.
 */
import {
  actionLabel,
  type DietAction,
  type DietDecisionResult,
} from './dietDecisionEngine';

export type ApplicationStatus =
  | 'pending_generation'
  | 'completed'
  | 'failed'
  | 'dismissed';

export interface ActionMeta {
  title: string;
  preview: string;
  needsGenerator: boolean;
  intent?: 'update' | 'regenerate';
}

export const ACTION_META: Record<DietAction, ActionMeta> = {
  manter: {
    title: 'Manter plano atual',
    preview:
      'Nenhuma alteração será feita no plano. O check-in é registrado como resolvido e o histórico guarda a decisão de manter.',
    needsGenerator: false,
  },
  atualizar_dieta: {
    title: 'Atualizar dieta (ajuste fino)',
    preview:
      'Abre o gerador em modo UPDATE com o aluno pré-selecionado. O plano atual NÃO é sobrescrito — uma nova versão será gerada a partir do plano vigente.',
    needsGenerator: true,
    intent: 'update',
  },
  regenerar_dieta: {
    title: 'Regenerar dieta (do zero)',
    preview:
      'Abre o gerador em modo REGENERATE. Um novo plano será criado mantendo objetivo e metas, sem apagar o histórico do plano atual.',
    needsGenerator: true,
    intent: 'regenerate',
  },
  subir_proteina: {
    title: 'Subir proteína',
    preview:
      'Abre o gerador em modo UPDATE com a diretriz de elevar proteína em almoço/jantar (e lanche se necessário). Você revisa antes de salvar.',
    needsGenerator: true,
    intent: 'update',
  },
  reduzir_densidade: {
    title: 'Reduzir densidade calórica',
    preview:
      'Abre o gerador em modo UPDATE com a diretriz de trocar alimentos densos por opções de maior volume/saciedade, sem mexer nas metas.',
    needsGenerator: true,
    intent: 'update',
  },
  aliviar_agressividade: {
    title: 'Aliviar agressividade do déficit',
    preview:
      'Abre o gerador em modo UPDATE com a diretriz de reduzir o corte calórico (subir carbo no treino) e preservar proteína.',
    needsGenerator: true,
    intent: 'update',
  },
  aplicar_refeed: {
    title: 'Aplicar refeed',
    preview:
      'Abre o gerador em modo UPDATE com a diretriz de 1-2 dias de carbo elevado (refeed) antes de qualquer corte adicional.',
    needsGenerator: true,
    intent: 'update',
  },
  revisar_manual: {
    title: 'Marcar para revisão manual',
    preview:
      'Sinaliza que o caso precisa de análise humana. Nenhuma alteração automática é feita no plano.',
    needsGenerator: false,
  },
};

export interface ApplicationContext {
  checkinId: string;
  studentId: string;
  adminId: string | null;
  targetPlanId: string | null;
  now?: Date;
}

export interface ApplicationRecord {
  checkin_id: string;
  student_id: string;
  scenario: string;
  suggested_action: DietAction;
  applied_action: DietAction;
  rationale: string;
  confidence: number;
  applied_by: string | null;
  target_plan_id: string | null;
  notes: string;
  status: ApplicationStatus;
  completed_at: string | null;
}

/**
 * Builds the persistence payload for a single assisted-action attempt.
 *
 * Status semantics:
 *  - Non-generator actions (`manter`, `revisar_manual`, `dismissed`) close
 *    the loop immediately and are marked `completed` with completed_at.
 *  - Generator actions are marked `pending_generation` so the history
 *    never claims success before the new plan actually exists.
 */
export function buildApplicationRecord(
  decision: DietDecisionResult,
  action: DietAction,
  ctx: ApplicationContext
): ApplicationRecord {
  const meta = ACTION_META[action];
  const closesImmediately = !meta.needsGenerator;
  const now = ctx.now ?? new Date();
  return {
    checkin_id: ctx.checkinId,
    student_id: ctx.studentId,
    scenario: decision.scenario,
    suggested_action: decision.action,
    applied_action: action,
    rationale: decision.rationale,
    confidence: decision.confidence,
    applied_by: ctx.adminId,
    target_plan_id: ctx.targetPlanId,
    notes: `[${actionLabel(action)}] ${decision.rationale}`,
    status: closesImmediately ? 'completed' : 'pending_generation',
    completed_at: closesImmediately ? now.toISOString() : null,
  };
}

export function getActionMeta(action: DietAction): ActionMeta {
  return ACTION_META[action];
}

// =============================================================
// Lifecycle closure helpers (Fase 5)
// =============================================================

/**
 * Threshold (hours) above which a pending_generation application is
 * considered orphaned and should be auto-dismissed.
 */
export const ORPHAN_PENDING_HOURS = 48;

export interface CloseApplicationInput {
  applicationId: string;
  resultPlanId: string;
  now?: Date;
}

export interface CloseApplicationPatch {
  status: 'completed';
  result_plan_id: string;
  completed_at: string;
}

/**
 * Builds the UPDATE patch that closes a pending application after the
 * resulting plan has been persisted.
 */
export function buildClosePatch(input: CloseApplicationInput): CloseApplicationPatch {
  return {
    status: 'completed',
    result_plan_id: input.resultPlanId,
    completed_at: (input.now ?? new Date()).toISOString(),
  };
}

export interface FailApplicationInput {
  applicationId: string;
  reason: string;
  now?: Date;
}

export interface FailApplicationPatch {
  status: 'failed';
  failure_reason: string;
  completed_at: string;
}

export function buildFailPatch(input: FailApplicationInput): FailApplicationPatch {
  return {
    status: 'failed',
    failure_reason: input.reason.slice(0, 500),
    completed_at: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * Computes the timestamp before which pending_generation rows should be
 * dismissed (orphans). Pure to keep it testable.
 */
export function orphanCutoffISO(now: Date = new Date(), hours: number = ORPHAN_PENDING_HOURS): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}