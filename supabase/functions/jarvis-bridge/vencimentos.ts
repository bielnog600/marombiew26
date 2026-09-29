/**
 * Vencimento de dietas e treinos para o Jarvis (operação ADITIVA da ponte, só leitura).
 *
 *   planos_vencendo { tipo?: "dieta" | "treino" | "ambos" }
 *
 * MESMA regra da aba Consultoria (DietRenewalPanel / WorkoutRenewalPanel):
 *  - último plano publicado de cada aluno (created_at mais novo, is_draft = false);
 *  - dias restantes = (cycle_days ?? 45) − dias desde created_at;
 *  - entra na lista se faltam ≤ 15 dias OU cycle_status ≠ 'em_dia', e não está 'renovado';
 *  - status efetivo: 'vencido' se dias ≤ 0; 'pronto_revisar' se há rascunho filho;
 *  - prioridade: vencido +1000, ≤ 5 dias +500, análise IA alta +300, rascunho +200.
 */

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

const DIA_MS = 86_400_000;
const STATUS_LABEL: Record<string, string> = {
  em_dia: "Em dia",
  pre_renovacao: "Pré-renovação",
  aguardando_dados: "Aguardando dados",
  renovacao_sugerida: "Renovação sugerida",
  rascunho_gerado: "Rascunho gerado",
  pronto_revisar: "Pronto para revisar",
  renovado: "Renovado",
  vencido: "Vencido",
};

/** differenceInDays do date-fns: dias inteiros, truncando. */
function diasDesde(iso: string, agora: number): number {
  return Math.trunc((agora - new Date(iso).getTime()) / DIA_MS);
}

async function listarTipo(tipo: "dieta" | "treino", supabase: Db, agora: number) {
  const { data: planRows, error } = await supabase
    .from("ai_plans")
    .select("id, student_id, titulo, created_at, cycle_days, cycle_status, version")
    .eq("tipo", tipo)
    .eq("is_draft", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ultimo = new Map<string, Any>();
  for (const p of planRows ?? []) if (!ultimo.has(p.student_id)) ultimo.set(p.student_id, p);

  const foco = [...ultimo.values()].filter((p) => {
    const restantes = (p.cycle_days ?? 45) - diasDesde(p.created_at, agora);
    return (restantes <= 15 || p.cycle_status !== "em_dia") && p.cycle_status !== "renovado";
  });
  if (foco.length === 0) return [];

  const alunos = [...new Set(foco.map((p) => p.student_id))];
  const ids = foco.map((p) => p.id);
  const tabelaAnalise = tipo === "dieta" ? "diet_renewal_analysis" : "workout_renewal_analysis";

  const [{ data: perfis }, { data: extras }, { data: analises }, { data: rascunhos }] = await Promise.all([
    supabase.from("profiles").select("user_id, nome").in("user_id", alunos),
    supabase.from("students_profile").select("user_id, ativo").in("user_id", alunos),
    supabase
      .from(tabelaAnalise)
      .select("plan_id, priority, suggested_action, summary_reason, created_at")
      .in("plan_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_plans")
      .select("id, parent_plan_id, created_at, version")
      .eq("tipo", tipo)
      .eq("is_draft", true)
      .in("parent_plan_id", ids),
  ]);

  const nome = new Map((perfis ?? []).map((p: Any) => [p.user_id, p.nome]));
  const ativo = new Map((extras ?? []).map((s: Any) => [s.user_id, s.ativo]));
  const analise = new Map<string, Any>();
  for (const a of analises ?? []) if (!analise.has(a.plan_id)) analise.set(a.plan_id, a);
  const rascunho = new Map<string, Any>();
  for (const d of rascunhos ?? []) if (d.parent_plan_id) rascunho.set(d.parent_plan_id, d);

  return foco
    .map((p) => {
      const cicloDias = p.cycle_days ?? 45;
      const restantes = cicloDias - diasDesde(p.created_at, agora);
      const r = rascunho.get(p.id) ?? null;
      const a = analise.get(p.id) ?? null;
      let status = p.cycle_status as string;
      if (restantes <= 0 && status !== "renovado") status = "vencido";
      else if (r && status !== "renovado") status = "pronto_revisar";
      let prioridade = 0;
      if (status === "vencido") prioridade += 1000;
      if (restantes <= 5) prioridade += 500;
      if (a?.priority === "alta") prioridade += 300;
      if (status === "pronto_revisar") prioridade += 200;
      const vence = new Date(new Date(p.created_at).getTime() + cicloDias * DIA_MS);
      return {
        tipo,
        plan_id: p.id,
        student_id: p.student_id,
        aluno: nome.get(p.student_id) ?? "Aluno",
        aluno_ativo: ativo.get(p.student_id) ?? null,
        titulo: p.titulo ?? null,
        version: p.version ?? null,
        publicado_em: p.created_at,
        ciclo_dias: cicloDias,
        dias_restantes: restantes,
        vence_em: vence.toISOString().slice(0, 10),
        status,
        status_label: STATUS_LABEL[status] ?? status,
        prioridade,
        prioridade_ia: a?.priority ?? null,
        sugestao_ia: a?.suggested_action ?? null,
        motivo_ia: a?.summary_reason ?? null,
        rascunho_id: r?.id ?? null,
      };
    })
    .sort((x, y) => y.prioridade - x.prioridade || x.dias_restantes - y.dias_restantes);
}

export async function tratarVencimentos(operacao: string, body: Rec, supabase: Db): Promise<Response | null> {
  if (operacao !== "planos_vencendo") return null;
  const pedido = String(body.tipo ?? "ambos").toLowerCase();
  const tipos: Array<"dieta" | "treino"> =
    pedido === "dieta" ? ["dieta"] : pedido === "treino" ? ["treino"] : ["dieta", "treino"];
  const agora = Date.now();
  try {
    const listas = await Promise.all(tipos.map((t) => listarTipo(t, supabase, agora)));
    return json({
      ok: true,
      gerado_em: new Date(agora).toISOString(),
      ...(tipos.includes("dieta") ? { dietas: listas[tipos.indexOf("dieta")] } : {}),
      ...(tipos.includes("treino") ? { treinos: listas[tipos.indexOf("treino")] } : {}),
    });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
}
