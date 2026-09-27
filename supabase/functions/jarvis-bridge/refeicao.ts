/**
 * Sugestões de refeição para o Jarvis (operação ADITIVA da ponte).
 *
 *   sugerir_refeicao { plan_id, refeicao, dia?, prioridade?: "varied" | "similar" | "simple" }
 *
 * É o mesmo botão de IA do card de refeição do editor do app (MealAiSuggestionsDialog):
 * chama a edge function diet-edit-agent em mode "meal_suggestions" com o mesmo payload,
 * e valida cada sugestão pelo catálogo (só foodId real, macros recalculados pelo motor
 * de hidratação do app, "dentro da meta" pela tolerância oficial). NÃO grava nada.
 */
import { loadFoodCatalog } from "../_shared/foodCatalog.ts";
import { hydrateDietPlanFromFoods } from "../_shared/dietHydration.ts";
import { isStructuredPlan } from "../_shared/dietPublication.ts";
import { resolvePublicationTargets } from "../_shared/publicationTargets.ts";
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
// deno-lint-ignore no-explicit-any
type Any = any;

const PRIORIDADES = ["varied", "similar", "simple"] as const;
const MAX_QTD = 2000;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const macros = (m: Any) => ({ kcal: n(m?.kcal), p: n(m?.p), c: n(m?.c), g: n(m?.g) });

export async function tratarRefeicao(operacao: string, body: Rec, supabase: Db): Promise<Response | null> {
  if (operacao !== "sugerir_refeicao") return null;

  const planId = String(body.plan_id ?? "").trim();
  const refeicaoPedida = String(body.refeicao ?? "").trim();
  const diaPedido = String(body.dia ?? "").trim();
  const prioridade = PRIORIDADES.includes(body.prioridade as Any) ? String(body.prioridade) : "varied";
  if (!planId) return json({ erro: "plan_id_obrigatorio" }, 400);
  if (!refeicaoPedida) return json({ erro: "refeicao_obrigatoria" }, 400);

  const { data: row, error } = await supabase.from("ai_plans").select("*").eq("id", planId).maybeSingle();
  if (error) return json({ erro: error.message }, 500);
  if (!row) return json({ erro: "plano_nao_encontrado" }, 404);
  if (row.tipo !== "dieta" || !isStructuredPlan(row.conteudo_json)) {
    return json({ erro: "dieta_estruturada_obrigatoria" }, 400);
  }

  const catalog = await loadFoodCatalog(supabase);
  const hydrated = hydrateDietPlanFromFoods(JSON.parse(JSON.stringify(row.conteudo_json)), catalog, "strict_id");
  const plan = hydrated.plan as Any;
  const days: Any[] = Array.isArray(plan?.days) ? plan.days : [];
  if (days.length === 0) return json({ erro: "plano_sem_dias" }, 400);

  // Dia: com um dia só, ignora o nome; com vários, casa por weekday ou label.
  let dayIndex = 0;
  if (days.length > 1) {
    if (!diaPedido) {
      return json({ erro: "dia_obrigatorio", dias: days.map((d) => d?.label ?? d?.weekday) }, 400);
    }
    const alvo = norm(diaPedido);
    dayIndex = days.findIndex((d) => norm(d?.weekday) === alvo || norm(d?.label) === alvo);
    if (dayIndex < 0) dayIndex = days.findIndex((d) => norm(d?.label).startsWith(alvo) || alvo.startsWith(norm(d?.weekday)));
    if (dayIndex < 0) return json({ erro: "dia_nao_encontrado", dias: days.map((d) => d?.label ?? d?.weekday) }, 404);
  }
  const day = days[dayIndex];
  const meals: Any[] = Array.isArray(day?.meals) ? day.meals : [];
  const alvoRef = norm(refeicaoPedida);
  let mealIndex = meals.findIndex((m) => norm(m?.name) === alvoRef);
  if (mealIndex < 0) mealIndex = meals.findIndex((m) => norm(m?.name).includes(alvoRef) || alvoRef.includes(norm(m?.name)));
  if (mealIndex < 0) return json({ erro: "refeicao_nao_encontrada", refeicoes: meals.map((m) => m?.name) }, 404);
  const meal = meals[mealIndex];

  // Meta do dia: mesma resolução da publicação (metas por dia da semana quando existem).
  const resolution = resolvePublicationTargets(plan, row.protocols);
  const wd = String(day?.weekday ?? "").toLowerCase();
  const target: Any = resolution.mode === "daily" ? (resolution.byWeekday[wd] ?? null) : resolution.global;

  let studentContext: Rec | null = null;
  if (row.student_id) {
    const { data: sp } = await supabase
      .from("students_profile")
      .select("objetivo, restricoes, lesoes")
      .eq("user_id", row.student_id)
      .maybeSingle();
    if (sp) studentContext = { objetivo: sp.objetivo ?? null, restricoes: sp.restricoes ?? null };
  }

  const foods: Any[] = Array.isArray((catalog as Any).foods) ? (catalog as Any).foods : [];
  const payload = {
    mode: "meal_suggestions",
    priority: prioridade,
    meal: {
      name: String(meal?.name ?? ""),
      time: meal?.time ?? null,
      items: (meal?.items ?? []).map((it: Any) => ({
        foodId: it?.foodId ?? null,
        name: String(it?.name ?? ""),
        qtyGrams: n(it?.qtyGrams),
        macros: macros(it?.macros),
      })),
      totals: macros(meal?.totals),
    },
    otherMeals: meals
      .filter((_, i) => i !== mealIndex)
      .map((m) => ({
        name: String(m?.name ?? ""),
        items: (m?.items ?? []).map((it: Any) => ({
          foodId: it?.foodId ?? null,
          name: String(it?.name ?? ""),
          qtyGrams: n(it?.qtyGrams),
        })),
      })),
    usedFoods: meals.flatMap((m, i) =>
      i === mealIndex
        ? []
        : (m?.items ?? []).map((it: Any) => ({ meal: String(m?.name ?? ""), foodId: it?.foodId ?? null, name: String(it?.name ?? "") })),
    ),
    dayTarget: target,
    dayTotals: macros(day?.totals),
    dayType: day?.dayType ?? day?.type ?? null,
    studentContext,
    trainingContext: null,
    foodCatalog: foods.map((f) => ({
      id: String(f.id),
      name: f.name,
      calories: n(f.calories),
      protein: n(f.protein),
      carbs: n(f.carbs),
      fats: n(f.fats),
      portion_size: n(f.portion_size) || 100,
      brand: f.brand ?? null,
      source: f.source ?? null,
    })),
  };

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/diet-edit-agent`;
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}`, apikey: chave },
    body: JSON.stringify(payload),
  });
  const bruto: Any = await resp.json().catch(() => null);
  if (!resp.ok || bruto?.error) {
    return json({ erro: "sugestao_falhou", detalhes: bruto?.error ?? `HTTP ${resp.status}` }, 502);
  }

  const lista: Any[] = Array.isArray(bruto?.suggestions) ? bruto.suggestions : [];
  const byId = (catalog as Any).index?.byId as Map<string, Any>;
  const sugestoes: Rec[] = [];
  let descartadas = 0;

  for (const [si, sug] of lista.entries()) {
    const itensBrutos: Any[] = Array.isArray(sug?.items) ? sug.items : [];
    const itens: Array<{ foodId: string; qtyGrams: number }> = [];
    let invalida = itensBrutos.length === 0;
    for (const it of itensBrutos) {
      const id = String(it?.foodId ?? "").trim();
      const q = Number(String(it?.qtyGrams ?? "").replace(",", "."));
      if (!id || !byId?.get(id) || !Number.isFinite(q) || q <= 0 || q > MAX_QTD) {
        invalida = true;
        break;
      }
      itens.push({ foodId: id, qtyGrams: Math.round(q * 10) / 10 });
    }
    if (invalida) {
      descartadas += 1;
      continue;
    }

    // Recalcula pelo motor do app: troca só essa refeição e rehidrata.
    const candidato = JSON.parse(JSON.stringify(row.conteudo_json));
    const refCand = candidato.days?.[dayIndex]?.meals?.[mealIndex];
    if (!refCand) {
      descartadas += 1;
      continue;
    }
    refCand.items = itens.map((it) => ({
      foodId: it.foodId,
      name: byId.get(it.foodId)?.name ?? "",
      qtyGrams: it.qtyGrams,
      resolutionStatus: "resolved_by_id",
      manualLocked: false,
      macros: { kcal: 0, p: 0, c: 0, g: 0 },
    }));
    const h = hydrateDietPlanFromFoods(candidato, catalog, "strict_id");
    const diaDepois = h.plan?.days?.[dayIndex];
    const refDepois = diaDepois?.meals?.[mealIndex];
    if (h.requiresResolution || !refDepois) {
      descartadas += 1;
      continue;
    }
    const totDia = macros(diaDepois?.totals);
    const dentro = target
      ? Math.abs(totDia.kcal - n(target.kcal)) <= OFFICIAL_MACRO_TOLERANCE.kcal &&
        Math.abs(totDia.p - n(target.p)) <= OFFICIAL_MACRO_TOLERANCE.p &&
        Math.abs(totDia.c - n(target.c)) <= OFFICIAL_MACRO_TOLERANCE.c &&
        Math.abs(totDia.g - n(target.g)) <= OFFICIAL_MACRO_TOLERANCE.g
      : null;

    sugestoes.push({
      opcao: sugestoes.length + 1,
      titulo: String(sug?.title ?? "").trim() || `Opção ${si + 1}`,
      motivo: String(sug?.reason ?? "").trim(),
      itens: (refDepois.items ?? []).map((it: Any) => ({
        food_id: String(it?.foodId ?? ""),
        alimento: String(it?.name ?? ""),
        quantidade_g: n(it?.qtyGrams),
        ...macros(it?.macros),
      })),
      totais_refeicao: macros(refDepois.totals),
      totais_dia_depois: totDia,
      dentro_da_meta: dentro,
    });
  }

  return json({
    ok: true,
    plan_id: planId,
    is_draft: row.is_draft === true,
    content_revision: row.content_revision ?? null,
    dia: String(day?.label ?? day?.weekday ?? "Dia"),
    dia_chave: String(day?.weekday ?? day?.label ?? ""),
    total_dias: days.length,
    refeicao: String(meal?.name ?? refeicaoPedida),
    horario: meal?.time ?? null,
    prioridade,
    meta_do_dia: target,
    itens_atuais: (meal?.items ?? []).map((it: Any) => ({
      alimento: String(it?.name ?? ""),
      quantidade_g: n(it?.qtyGrams),
      ...macros(it?.macros),
    })),
    totais_refeicao_atual: macros(meal?.totals),
    totais_dia_atual: macros(day?.totals),
    sugestoes,
    descartadas,
  });
}
