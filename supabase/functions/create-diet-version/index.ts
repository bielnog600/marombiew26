/**
 * FASE 6 — nova versão em RASCUNHO a partir de uma dieta structured publicada.
 *
 * Dieta publicada é imutável: qualquer edição cria uma nova linha (draft),
 * com snapshots removidos e macros rehidratados pela base ATUAL.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { loadFoodCatalog } from "../_shared/foodCatalog.ts";
import { hydrateDietPlanFromFoods } from "../_shared/dietHydration.ts";
import { canonicalDietPlanToMarkdown } from "../_shared/canonicalDietMarkdown.ts";
import { isStructuredPlan, stripPublicationSnapshots } from "../_shared/dietPublication.ts";
import { normalizeDietTitle } from "../_shared/dietTitle.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error_code: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return json({ error_code: "not_authorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error_code: "not_authorized" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) return json({ error_code: "not_authorized" }, 403);

    const body = await req.json().catch(() => ({}));
    const planId = String(body?.planId ?? "");
    if (!planId) return json({ error_code: "plan_not_found" }, 400);

    const { data: source, error } = await supabase
      .from("ai_plans")
      .select("*")
      .eq("id", planId)
      .maybeSingle();
    if (error || !source) return json({ error_code: "plan_not_found" }, 404);
    if (source.tipo !== "dieta" || !isStructuredPlan(source.conteudo_json)) {
      return json({ error_code: "structured_plan_required" }, 400);
    }
    // FASE 6.1 — apenas uma dieta PUBLICADA pode ser parent de nova versão.
    if (source.is_draft !== false) {
      return json({ error_code: "published_plan_required" }, 409);
    }


    // Nunca duplicar a mesma versão: reutiliza o draft existente.
    const { data: existing } = await supabase
      .from("ai_plans")
      .select("*")
      .eq("parent_plan_id", planId)
      .eq("tipo", "dieta")
      .eq("is_draft", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ ok: true, reused: true, plan: existing[0] });
    }

    const catalog = await loadFoodCatalog(supabase);
    const stripped = stripPublicationSnapshots(source.conteudo_json);
    const hydrated = hydrateDietPlanFromFoods(stripped, catalog, "strict_id");
    const markdown = canonicalDietPlanToMarkdown(hydrated.plan);

    const { data: inserted, error: insertError } = await supabase
      .from("ai_plans")
      .insert({
        student_id: source.student_id,
        tipo: "dieta",
        // Título canônico: a versão vive na coluna `version`, nunca no título.
        titulo: normalizeDietTitle(source.titulo) || "Dieta",
        conteudo: markdown,
        conteudo_json: hydrated.plan,
        protocols: source.protocols,
        fase: source.fase,
        diet_strategy: source.diet_strategy,
        strategy_source: source.strategy_source,
        generation_intent: source.generation_intent,
        viability_score: source.viability_score,
        viability_breakdown: source.viability_breakdown,
        parent_plan_id: source.id,
        version: Number(source.version ?? 1) + 1,
        is_draft: true,
        migration_status: "completed",
        whatsapp_notified_at: null,
        whatsapp_notified_count: 0,
      })
      .select("*")
      .single();
    if (insertError) {
      // FASE 6.1 — corrida entre duas chamadas: o índice único protege o banco
      // e nós devolvemos o draft vencedor (idempotência sob concorrência).
      const { data: raced } = await supabase
        .from("ai_plans")
        .select("*")
        .eq("parent_plan_id", planId)
        .eq("tipo", "dieta")
        .eq("is_draft", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (raced && raced.length > 0) return json({ ok: true, reused: true, plan: raced[0] });
      return json({ error_code: "version_failed", details: insertError.message }, 400);
    }


    return json({
      ok: true,
      reused: false,
      plan: inserted,
      unresolvedItems: hydrated.unresolvedItems.slice(0, 20),
      requiresResolution: hydrated.requiresResolution,
    });
  } catch (e) {
    console.error("[create-diet-version] failure:", e);
    return json({ error_code: "version_failed", details: String((e as Error)?.message ?? e) }, 500);
  }
});
