/**
 * FASE 6 — cliente único de publicação atômica de dieta structured.
 *
 * O app NUNCA publica escrevendo em `ai_plans`. Ele envia apenas o ID do
 * plano; o servidor relê o rascunho, revalida tudo e commita em transação.
 */
import { supabase } from '@/integrations/supabase/client';

export const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'Você não tem permissão para publicar esta dieta.',
  plan_not_found: 'Dieta não encontrada.',
  structured_plan_required: 'Esta dieta não está no formato estruturado.',
  already_published: 'Esta dieta já está publicada.',
  food_contract_invalid: 'Há alimentos inválidos na dieta. Revise antes de publicar.',
  unresolved_foods: 'Resolva todos os alimentos antes de publicar.',
  publication_targets_invalid: 'Falta a meta de algum dia. Defina as metas antes de publicar.',
  nutrition_target_invalid: 'A dieta está fora da meta. Ajuste as porções antes de publicar.',
  daily_adjustments_invalid: 'Os ajustes diários estão incompletos ou fora da tolerância.',
  food_catalog_changed: 'A base alimentar mudou durante a publicação. Tente novamente.',
  draft_changed_refresh_required: 'Este rascunho foi alterado em outra sessão. Atualize a página.',
  publication_schema_invalid: 'A dieta não passou na verificação final de integridade.',
  publication_failed: 'Não foi possível publicar esta dieta.',
};

export interface PublishDietPlanResult {
  ok: boolean;
  plan: any | null;
  /** true quando o rascunho era idêntico à versão publicada (nada foi criado). */
  noChanges: boolean;
  discardedDraftId: string | null;
  errorCode: string | null;
  message: string | null;
}

/** Lê o `error_code` estável mesmo quando a Edge Function responde 4xx/5xx. */
const readErrorCode = async (data: any, error: any): Promise<string | null> => {
  if (data && typeof data === 'object' && data.error_code) return String(data.error_code);
  const res = (error as any)?.context;
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.json();
      if (body?.error_code) return String(body.error_code);
    } catch { /* corpo não-JSON */ }
  }
  return error ? 'publication_failed' : null;
};

export async function publishDietPlan(planId: string): Promise<PublishDietPlanResult> {
  const { data, error } = await supabase.functions.invoke('publish-diet-plan', {
    body: { planId },
  });
  const errorCode = await readErrorCode(data, error);
  if (errorCode) {
    return {
      ok: false,
      plan: null,
      noChanges: false,
      discardedDraftId: null,
      errorCode,
      message: PUBLISH_ERROR_MESSAGES[errorCode] ?? PUBLISH_ERROR_MESSAGES.publication_failed,
    };
  }
  const noChanges = (data as any)?.noChanges === true;
  return {
    ok: true,
    plan: (data as any)?.plan ?? null,
    noChanges,
    discardedDraftId: (data as any)?.discardedDraftId ?? null,
    errorCode: null,
    message: noChanges ? 'Nenhuma alteração na dieta. A versão publicada foi mantida.' : null,
  };
}

export interface CreateDietVersionResult {
  ok: boolean;
  plan: any | null;
  reused: boolean;
  message: string | null;
}

/** FASE 6 — editar dieta publicada cria uma NOVA versão em rascunho. */
export async function createDietVersion(planId: string): Promise<CreateDietVersionResult> {
  const { data, error } = await supabase.functions.invoke('create-diet-version', {
    body: { planId },
  });
  const errorCode = await readErrorCode(data, error);
  if (errorCode || !(data as any)?.plan) {
    return {
      ok: false,
      plan: null,
      reused: false,
      message: 'Não foi possível criar a nova versão desta dieta.',
    };
  }
  return { ok: true, plan: (data as any).plan, reused: Boolean((data as any).reused), message: null };
}
