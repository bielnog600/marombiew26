/**
 * Meta da dieta para o Jarvis (operação ADITIVA da ponte).
 *
 *   checar_meta_dieta { plan_id }  → mesma checagem do botão Publicar do app
 *
 * Usa EXATAMENTE a regra da publicação (publish-diet-plan):
 * rehidrata pelo catálogo → resolvePublicationTargets → validatePublicationNutrition
 * (tolerância oficial de macroTolerances.ts; metas por dia da semana quando existem).
 * Devolve também os itens rehidratados de cada dia, para o Jarvis sugerir o reajuste.
 */
import { loadFoodCatalog } from "../_shared/foodCatalog.ts";
import { hydrateDietPlanFromFoods } from "../_shared/dietHydration.ts";
import { isStructuredPlan } from "../_shared/dietPublication.ts";
import {
  resolvePublicationTargets,
  validatePublicationNutrition,
} from "../_shared/publicationTargets.ts";
import { OFFICIAL_MACRO_TOLERANCE } from "../_shared/macroTolerances.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-jarvis-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Rec = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Db = any;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Checagem de meta de uma linha de ai_plans (rascunho ou publicada).
 * `catalog` é opcional para reaproveitar o já carregado na publicação.
 */
export async function checarMetaDoPlano(
  row: Rec,
  supabase: Db,
  catalog?: Awaited<ReturnType<typeof loadFoodCatalog>>,
) {
  const cat = catalog ?? (await loadFoodCatalog(supabase));
  const hydrated = hydrateDietPlanFromFoods(
    JSON.parse(JSON.stringify(row.conteudo_json)),
    cat,
    "strict_id",
  );
  const resolution = resolvePublicationTargets(hydrated.plan, row.protocols);
  const nutrition = resolution.ok
    ? validatePublicationNutrition(hydrated.plan, resolution)
    : { ok: false, mode: resolution.mode, issues: resolution.issues };

  // deno-lint-ignore no-explicit-any
  const days: any[] = Array.isArray(hydrated.plan?.days) ? hydrated.plan.days : [];
  const dias = days.map((day, i) => {
    const wd = String(day?.weekday ?? "").toLowerCase();
    const meta = resolution.mode === "daily" ? (resolution.byWeekday[wd] ?? null) : resolution.global;
    const t = day?.totals ?? {};
    return {
      dia: String(day?.label ?? day?.weekday ?? `Dia ${i + 1}`),
      weekday: wd || null,
      // Como editar_dieta acha o dia (weekday ou label).
      chave: String(day?.weekday ?? day?.label ?? ""),
      meta,
      totais: { kcal: n(t.kcal), p: n(t.p), c: n(t.c), g: n(t.g) },
      // deno-lint-ignore no-explicit-any
      refeicoes: (Array.isArray(day?.meals) ? day.meals : []).map((meal: any) => ({
        refeicao: String(meal?.name ?? "Refeição"),
        // deno-lint-ignore no-explicit-any
        itens: (Array.isArray(meal?.items) ? meal.items : []).map((it: any) => ({
          alimento: String(it?.name ?? "-"),
          quantidade_g: n(it?.qtyGrams),
          kcal: n(it?.macros?.kcal),
          p: n(it?.macros?.p),
          c: n(it?.macros?.c),
          g: n(it?.macros?.g),
        })),
      })),
    };
  });

  return {
    ok: true,
    plan_id: row.id ?? null,
    is_draft: row.is_draft === true,
    content_revision: row.content_revision ?? null,
    modo: resolution.mode === "daily" ? "diario" : "global",
    dentro_da_meta: resolution.ok && nutrition.ok && !hydrated.requiresResolution,
    alimentos_nao_resolvidos: hydrated.unresolvedItems.slice(0, 20),
    problemas: nutrition.issues,
    tolerancia: OFFICIAL_MACRO_TOLERANCE,
    dias,
  };
}

export async function tratarMeta(operacao: string, body: Rec, supabase: Db): Promise<Response | null> {
  if (operacao !== "checar_meta_dieta") return null;

  const planId = String(body.plan_id ?? "").trim();
  if (!planId) return json({ erro: "plan_id_obrigatorio" }, 400);

  const { data: row, error } = await supabase.from("ai_plans").select("*").eq("id", planId).maybeSingle();
  if (error) return json({ erro: error.message }, 500);
  if (!row) return json({ erro: "plano_nao_encontrado" }, 404);
  if (row.tipo !== "dieta" || !isStructuredPlan(row.conteudo_json)) {
    return json({ erro: "dieta_estruturada_obrigatoria" }, 400);
  }

  return json(await checarMetaDoPlano(row, supabase));
}
