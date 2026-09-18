// jarvis-bridge — endpoint somente leitura para o projeto "Jarvis Marombiew".
// Autenticação por header X-Jarvis-Token (secret JARVIS_BRIDGE_TOKEN).
// Nunca registra o token em logs. Puramente aditivo: não altera nada do projeto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRIDGE_TOKEN = Deno.env.get("JARVIS_BRIDGE_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const TIPO_MAP: Record<string, string> = { treino: "treino", dieta: "dieta" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const token = req.headers.get("X-Jarvis-Token") ?? req.headers.get("x-jarvis-token") ?? "";
  if (!BRIDGE_TOKEN || !timingSafeEqual(token, BRIDGE_TOKEN)) {
    return json({ erro: "unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ erro: "corpo_invalido" }, 400);
  }

  const operacao = String(body.operacao ?? "");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (operacao === "buscar_aluno") {
      const nome = String(body.nome ?? "").trim();
      if (!nome) return json({ erro: "nome_obrigatorio" }, 400);

      const { data: perfis, error } = await supabase
        .from("profiles")
        .select("user_id, nome")
        .ilike("nome", `%${nome}%`)
        .limit(10);
      if (error) return json({ erro: error.message }, 500);

      const ids = (perfis ?? []).map((p) => p.user_id);
      let extras: Record<string, Record<string, unknown>> = {};
      if (ids.length > 0) {
        const { data: sp, error: spError } = await supabase
          .from("students_profile")
          .select("user_id, ativo, objetivo, lesoes, restricoes")
          .in("user_id", ids);
        if (spError) return json({ erro: spError.message }, 500);
        extras = Object.fromEntries((sp ?? []).map((s) => [s.user_id, s]));
      }

      return json({
        alunos: (perfis ?? []).map((p) => ({
          user_id: p.user_id,
          nome: p.nome,
          ativo: extras[p.user_id]?.ativo ?? null,
          objetivo: extras[p.user_id]?.objetivo ?? null,
          lesoes: extras[p.user_id]?.lesoes ?? null,
          restricoes: extras[p.user_id]?.restricoes ?? null,
        })),
      });
    }

    if (operacao === "consultar_plano") {
      const studentId = String(body.student_id ?? "").trim();
      const tipoRaw = String(body.tipo ?? "").trim().toLowerCase();
      const tipo = TIPO_MAP[tipoRaw];
      if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
      if (!tipo) return json({ erro: "tipo_invalido" }, 400);

      const { data, error } = await supabase
        .from("ai_plans")
        .select("id, tipo, titulo, fase, version, content_revision, published_at, created_at, conteudo_json, conteudo")
        .eq("student_id", studentId)
        .eq("tipo", tipo)
        .eq("is_draft", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) return json({ erro: error.message }, 500);

      return json({ plano: data?.[0] ?? null });
    }

    if (operacao === "consultar_cargas") {
      const studentId = String(body.student_id ?? "").trim();
      if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
      const exercicio = typeof body.exercicio === "string" ? body.exercicio.trim() : "";

      let query = supabase
        .from("exercise_set_logs")
        .select("exercise_name, weight_kg, reps, rpe, set_number, performed_at")
        .eq("student_id", studentId)
        .order("performed_at", { ascending: false })
        .limit(20);
      if (exercicio) query = query.ilike("exercise_name", `%${exercicio}%`);

      const { data, error } = await query;
      if (error) return json({ erro: error.message }, 500);
      return json({ cargas: data ?? [] });
    }

    return json({ erro: "operacao_desconhecida" }, 400);
  } catch (e) {
    console.error("[jarvis-bridge] falha:", String((e as Error)?.message ?? e));
    return json({ erro: "erro_interno" }, 500);
  }
});
