/**
 * IA de treino do app para o Jarvis (operação ADITIVA da ponte, NÃO grava).
 *
 *   sugerir_treino_dia { student_id, dia, instrucao, plan_id? }
 *
 * É o mesmo recurso do editor de treino do app (AiEditAllDaysDialog): chama a edge
 * function training-edit-agent com { dayName, currentExercises, instruction,
 * exerciseCatalog (tabela exercises), studentContext (students_profile) }.
 * Aqui só validamos as ações contra o banco de exercícios (nome canônico) e
 * devolvemos para o Jarvis montar a proposta; a gravação segue pelo editar_treino.
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

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const CAMPOS = ["series", "series2", "reps", "rir", "pause", "description", "variation"] as const;

export async function tratarTreinoIa(operacao: string, body: Rec, supabase: Db): Promise<Response | null> {
  if (operacao !== "sugerir_treino_dia") return null;

  const studentId = String(body.student_id ?? "").trim();
  const planIdPedido = String(body.plan_id ?? "").trim();
  const diaPedido = String(body.dia ?? "").trim();
  const instrucao = String(body.instrucao ?? "").trim();
  if (!studentId && !planIdPedido) return json({ erro: "student_id_obrigatorio" }, 400);
  if (!diaPedido) return json({ erro: "dia_obrigatorio" }, 400);
  if (!instrucao) return json({ erro: "instrucao_obrigatoria" }, 400);

  let consulta = supabase.from("ai_plans").select("id, student_id, content_revision, is_draft, conteudo_json").eq("tipo", "treino");
  consulta = planIdPedido
    ? consulta.eq("id", planIdPedido)
    : consulta.eq("student_id", studentId).eq("is_draft", false).order("created_at", { ascending: false }).limit(1);
  const { data: linhas, error } = await consulta;
  if (error) return json({ erro: error.message }, 500);
  const plano = (linhas ?? [])[0];
  if (!plano) return json({ erro: "plano_nao_encontrado" }, 404);

  const dias: Any[] = Array.isArray(plano.conteudo_json?.days) ? plano.conteudo_json.days : [];
  const alvo = norm(diaPedido);
  const primeira = alvo.split(" ")[0] ?? alvo;
  let dia = dias.find((d) => norm(d?.day) === alvo);
  if (!dia) dia = dias.find((d) => norm(d?.day).startsWith(primeira) || norm(d?.focus) === alvo);
  const atuais: Any[] = Array.isArray(dia?.exercises) ? dia.exercises : [];

  const [{ data: catalogo, error: catErr }, { data: perfil }] = await Promise.all([
    supabase.from("exercises").select("nome, grupo_muscular").order("nome"),
    supabase
      .from("students_profile")
      .select("lesoes, restricoes, observacoes, objetivo")
      .eq("user_id", plano.student_id)
      .maybeSingle(),
  ]);
  if (catErr) return json({ erro: catErr.message }, 500);
  const porNome = new Map<string, Any>();
  for (const e of catalogo ?? []) porNome.set(norm(e.nome), e);

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/training-edit-agent`;
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}`, apikey: chave },
    body: JSON.stringify({
      dayName: dia?.focus ? `${dia.day} — ${dia.focus}` : (dia?.day ?? diaPedido),
      currentExercises: atuais.map((e) => ({
        exercise: e?.exercise,
        series: e?.series,
        series2: e?.series2,
        reps: e?.reps,
        rir: e?.rir,
        pause: e?.pause,
        description: e?.description,
        variation: e?.variation,
      })),
      instruction: instrucao,
      exerciseCatalog: catalogo ?? [],
      studentContext: perfil ?? undefined,
    }),
  });
  const bruto: Any = await resp.json().catch(() => null);
  if (!resp.ok || bruto?.error) {
    return json({ erro: "ia_falhou", detalhes: bruto?.error ?? `HTTP ${resp.status}` }, 502);
  }

  const acoes: Rec[] = [];
  const descartadas: Rec[] = [];
  for (const a of Array.isArray(bruto?.actions) ? bruto.actions : []) {
    const op = String(a?.op ?? "");
    if (!["add", "modify", "remove", "replace"].includes(op)) continue;
    const ex = a?.exercise ?? {};
    let nome: string | null = null;
    if (op === "add" || op === "replace") {
      const cat = porNome.get(norm(ex.exercise));
      if (!cat) {
        descartadas.push({ op, exercicio: ex.exercise ?? null, motivo: "fora_do_banco" });
        continue;
      }
      nome = cat.nome;
    }
    // Alvo de modify/remove/replace: pelo match ou pelo índice no dia atual.
    let alvoAtual: string | null = null;
    if (op !== "add") {
      const idx = Number.isInteger(a?.index) ? Number(a.index) : -1;
      const porMatch = a?.match ? atuais.find((e) => norm(e?.exercise) === norm(a.match)) : null;
      alvoAtual = porMatch?.exercise ?? atuais[idx]?.exercise ?? null;
      if (!alvoAtual) {
        descartadas.push({ op, exercicio: a?.match ?? null, motivo: "alvo_nao_encontrado" });
        continue;
      }
    }
    const campos: Rec = {};
    for (const k of CAMPOS) {
      const v = ex?.[k];
      if (v === undefined || v === null || String(v).trim() === "") continue;
      if (k === "variation") {
        const cv = porNome.get(norm(v));
        if (cv) campos[k] = cv.nome;
        continue;
      }
      campos[k] = String(v).trim();
    }
    acoes.push({
      op,
      ...(nome ? { exercicio: nome, grupo: porNome.get(norm(nome))?.grupo_muscular ?? null } : {}),
      ...(alvoAtual ? { alvo: alvoAtual } : {}),
      ...(Number.isInteger(a?.index) ? { indice: a.index } : {}),
      campos,
    });
  }

  return json({
    ok: true,
    plan_id: plano.id,
    is_draft: plano.is_draft === true,
    content_revision: plano.content_revision ?? null,
    dia_existente: dia?.day ?? null,
    dia_pedido: diaPedido,
    exercicios_atuais: atuais.map((e) => String(e?.exercise ?? "")),
    acoes,
    descartadas,
    resumo: typeof bruto?.summary === "string" ? bruto.summary : null,
  });
}
