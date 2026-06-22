/**
 * Load the last N non-draft plans for a student so the AI can avoid
 * regenerating something nearly identical.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HISTORY_LIMIT } from "./variationProfiles.ts";

export type HistoryPlan = {
  id: string;
  titulo: string | null;
  created_at: string;
  fase: string | null;
  conteudo_json: unknown;
  conteudo: string | null;
};

export async function loadPlanHistory(
  studentId: string,
  tipo: "treino" | "dieta",
  limit = HISTORY_LIMIT,
): Promise<HistoryPlan[]> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.warn("planHistory: missing service role env, returning empty.");
    return [];
  }
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("ai_plans")
      .select("id, titulo, created_at, fase, conteudo_json, conteudo")
      .eq("student_id", studentId)
      .eq("tipo", tipo)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("planHistory: query error", error.message);
      return [];
    }
    return (data ?? []) as HistoryPlan[];
  } catch (e) {
    console.warn("planHistory: exception", e);
    return [];
  }
}

/** Compact, prompt-friendly summary of one plan. */
export function summarizeWorkoutForPrompt(p: HistoryPlan, index: number): string {
  const json = p.conteudo_json as any;
  const days = Array.isArray(json?.days) ? json.days : [];
  const dayLines = days.slice(0, 7).map((d: any) => {
    const focus = d?.focus ? ` (${d.focus})` : "";
    const ex = (d?.exercises ?? [])
      .map((e: any) => e?.exercise)
      .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 12)
      .join(", ");
    return `  • ${d?.day ?? "?"}${focus}: ${ex || "(sem exercícios)"}`;
  });
  const head = `#${index + 1} "${p.titulo ?? "Treino"}" — ${new Date(p.created_at).toLocaleDateString("pt-BR")}${p.fase ? ` | fase ${p.fase}` : ""}`;
  return [head, ...dayLines].join("\n");
}

export function summarizeDietForPrompt(p: HistoryPlan, index: number): string {
  const json = p.conteudo_json as any;
  const days = Array.isArray(json?.days) ? json.days : [];
  const meals: any[] = [];
  for (const d of days) for (const m of d?.meals ?? []) meals.push(m);
  const mealLines = meals.slice(0, 8).map((m: any) => {
    const items = (m?.items ?? [])
      .map((it: any) => it?.name)
      .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      .slice(0, 8)
      .join(", ");
    return `  • ${m?.name ?? m?.id ?? "Refeição"}: ${items || "(sem itens)"}`;
  });
  const head = `#${index + 1} "${p.titulo ?? "Dieta"}" — ${new Date(p.created_at).toLocaleDateString("pt-BR")}`;
  if (mealLines.length === 0 && typeof p.conteudo === "string" && p.conteudo.trim()) {
    return `${head}\n  (apenas markdown legado disponível)`;
  }
  return [head, ...mealLines].join("\n");
}