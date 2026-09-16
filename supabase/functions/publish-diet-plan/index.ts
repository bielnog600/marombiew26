/**
 * FASE 6 — publicação ATÔMICA de dieta structured.
 *
 * O browser envia apenas o ID do plano. O servidor relê o rascunho, relê
 * `foods`, revalida o contrato, rehidrata tudo pelo nutritionCore, valida as
 * metas, cria os snapshots e commita via RPC transacional.
 *
 * ZERO chamadas de IA. ZERO ajuste de quantidades. Falhou → nada é publicado.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { loadFoodCatalog } from "../_shared/foodCatalog.ts";
import { validateFoodContract } from "../_shared/foodContract.ts";
import { hydrateDietPlanFromFoods } from "../_shared/dietHydration.ts";
import { canonicalDietPlanToMarkdown } from "../_shared/canonicalDietMarkdown.ts";
import {
  resolvePublicationTargets,
  validatePublicationNutrition,
} from "../_shared/publicationTargets.ts";
import {
  buildPublishedSnapshotPlan,
  collectFoodAssertions,
  collectPublicationBlockers,
  isStructuredPlan,
  validatePublicationDailyAdjustments,
  validatePublicationPlan,

  validateSnapshotAssertionIntegrity,
  type PublicationErrorCode,
} from "../_shared/dietPublication.ts";
import { shouldDiscardRedundantDraft } from "../_shared/dietSemanticFingerprint.ts";


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (code: PublicationErrorCode, status: number, details?: unknown) =>
  json({ error_code: code, details: details ?? null }, status);

const RPC_ERROR_CODES: PublicationErrorCode[] = [
  "not_authorized",
  "plan_not_found",
  "structured_plan_required",
  "already_published",
  "draft_changed_refresh_required",
  "food_catalog_changed",
  "publication_schema_invalid",
];

const rpcErrorCode = (message: string): PublicationErrorCode => {
  for (const code of RPC_ERROR_CODES) if (message.includes(code)) return code;
  return "publication_failed";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("publication_failed", 405);

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return fail("not_authorized", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return fail("not_authorized", 401);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) return fail("not_authorized", 403);

    const body = await req.json().catch(() => ({}));
    const planId = String(body?.planId ?? "");
    if (!planId) return fail("plan_not_found", 400);

    const { data: row, error: rowError } = await supabase
      .from("ai_plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (rowError || !row) return fail("plan_not_found", 404);
    if (row.tipo !== "dieta") return fail("structured_plan_required", 400);
    if (row.is_draft !== true) return fail("already_published", 409);
    if (!row.conteudo_json || !isStructuredPlan(row.conteudo_json)) {
      return fail("structured_plan_required", 400);
    }

    // MICRO-HOTFIX — publicar um rascunho idêntico ao pai publicado NÃO cria
    // uma nova versão. Nada do contrato da Fase 6 muda: só evitamos o no-op.
    if (row.parent_plan_id) {
      const { data: parent } = await supabase
        .from("ai_plans")
        .select("*")
        .eq("id", row.parent_plan_id)
        .maybeSingle();
      if (
        parent &&
        isStructuredPlan(parent.conteudo_json) &&
        shouldDiscardRedundantDraft(row, parent)
      ) {
        const { error: discardError } = await supabase
          .from("ai_plans")
          .delete()
          .eq("id", planId)
          .eq("is_draft", true)
          .eq("parent_plan_id", parent.id);
        if (discardError) {
          console.warn("[publish-diet-plan] no-op draft discard failed:", discardError.message);
        }
        return json({
          ok: true,
          noChanges: true,
          plan: parent,
          discardedDraftId: discardError ? null : planId,
        });
      }
    }

    const expectedRevision = Number(row.content_revision ?? 1);

    const attempt = async () => {
      const catalog = await loadFoodCatalog(supabase);

      // Contrato de publicação: nenhum unresolved autorizado.
      // Contrato STRICT: foodId obrigatório, qtyGrams > 0, zero unresolved,
      // inclusive nos ajustes diários.
      const contract = validateFoodContract(row.conteudo_json, catalog, {
        mode: "fresh",
        allowedUnresolved: [],
      });
      const blockers = collectPublicationBlockers(row.conteudo_json, catalog);
      if (blockers.length > 0) {
        return { error: fail("unresolved_foods", 422, blockers.slice(0, 20)) };
      }
      if (contract.invalidFoodIds.length > 0 || contract.missingFoodIds.length > 0) {
        return {
          error: fail("food_contract_invalid", 422, {
            invalidFoodIds: contract.invalidFoodIds,
            missingFoodIds: contract.missingFoodIds,
          }),
        };
      }

      // Rehidratação do zero — macros/totais do draft não são autoridade.
      const hydrated = hydrateDietPlanFromFoods(row.conteudo_json, catalog, "strict_id");
      if (hydrated.requiresResolution) {
        return { error: fail("unresolved_foods", 422, hydrated.unresolvedItems.slice(0, 20)) };
      }

      const resolution = resolvePublicationTargets(hydrated.plan, row.protocols);
      if (!resolution.ok) {
        return { error: fail("publication_targets_invalid", 422, resolution.issues) };
      }

      const nutrition = validatePublicationNutrition(hydrated.plan, resolution);
      if (!nutrition.ok) {
        return { error: fail("nutrition_target_invalid", 422, nutrition.issues) };
      }

      const adjustments = validatePublicationDailyAdjustments(row.protocols, catalog);
      if (!adjustments.ok) {
        return { error: fail("daily_adjustments_invalid", 422, adjustments.issues) };
      }

      // FASE 6.1 — os ajustes recalculados pela base ATUAL são persistidos
      // na mesma transação da publicação.
      const finalProtocols = row.protocols
        ? JSON.parse(JSON.stringify(row.protocols))
        : row.protocols ?? null;
      if (finalProtocols?.weekly_energy_schedule && adjustments.adjustments) {
        finalProtocols.weekly_energy_schedule.generated_adjustments = adjustments.adjustments;
      }
      const normalizedAdjustments =
        finalProtocols?.weekly_energy_schedule?.generated_adjustments ?? null;

      const { plan: snapshotPlan } = buildPublishedSnapshotPlan(hydrated.plan, catalog);
      const schema = validatePublicationPlan(snapshotPlan);
      if (!schema.ok) {
        return { error: fail("publication_schema_invalid", 422, schema.issues.slice(0, 20)) };
      }

      const markdown = canonicalDietPlanToMarkdown(snapshotPlan);
      const assertions = collectFoodAssertions(snapshotPlan, catalog, normalizedAdjustments);

      const integrity = validateSnapshotAssertionIntegrity(
        snapshotPlan,
        assertions,
        normalizedAdjustments,
      );
      if (!integrity.ok) {
        return { error: fail("publication_schema_invalid", 422, integrity.issues.slice(0, 20)) };
      }

      const { data, error } = await supabase.rpc("publish_diet_plan_atomic", {
        p_plan_id: planId,
        p_expected_revision: expectedRevision,
        p_final_plan: snapshotPlan,
        p_final_markdown: markdown,
        p_final_protocols: finalProtocols,
        p_food_assertions: assertions,
      });

      if (error) return { rpcError: rpcErrorCode(String(error.message ?? "")), raw: error.message };
      return { data };
    };

    let result = await attempt();
    // Retry ÚNICO e apenas para mudança da base entre o cálculo e o commit.
    if ("rpcError" in result && result.rpcError === "food_catalog_changed") {
      result = await attempt();
    }

    if ("error" in result && result.error) return result.error;
    if ("rpcError" in result && result.rpcError) {
      const status = result.rpcError === "not_authorized"
        ? 403
        : result.rpcError === "plan_not_found"
        ? 404
        : result.rpcError === "publication_failed"
        ? 500
        : 409;
      return fail(result.rpcError, status, result.raw ?? null);
    }

    return json({ ok: true, plan: (result as any).data ?? null });
  } catch (e) {
    console.error("[publish-diet-plan] failure:", e);
    return fail("publication_failed", 500, String((e as Error)?.message ?? e));
  }
});
