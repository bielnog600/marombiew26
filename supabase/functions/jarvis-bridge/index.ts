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
const BRIDGE_TOKEN = (Deno.env.get("JARVIS_BRIDGE_TOKEN") ?? "").trim();

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

// ---------- helpers compartilhados (editar_treino) ----------
type Rec = Record<string, unknown>;

const normalizeName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Campos editáveis — espelham WorkoutExerciseSchema (src/lib/workoutSchema.ts)
const CAMPOS_VALIDOS = [
  "series",
  "series2",
  "reps",
  "rir",
  "pause",
  "restSeconds",
  "variation",
  "description",
  "tempo",
  "notes",
  "setScheme",
] as const;

// Espelho de src/lib/workoutMarkdownSerializer.ts (edge functions não podem importar src/)
const mdCell = (v: unknown): string => {
  if (v == null) return "-";
  const s = String(v).trim();
  return s.length === 0 ? "-" : s.replace(/\|/g, "/");
};

const mdRest = (ex: Rec): string => {
  const rs = ex.restSeconds;
  if (typeof rs === "number" && rs > 0) return `${rs}s`;
  return mdCell(ex.pause);
};

const setSchemeSets = (ex: Rec): Rec[] => {
  const ss = ex.setScheme as { mode?: string; sets?: Rec[] } | undefined | null;
  if (ss && ss.mode === "per_set" && Array.isArray(ss.sets) && ss.sets.length > 0) return ss.sets;
  return [];
};

const mdReps = (ex: Rec): string => {
  const sets = setSchemeSets(ex);
  if (sets.length > 0) return sets.map((s) => s.target_reps).join(" / ");
  return mdCell(ex.reps);
};

const mdSeries = (ex: Rec): string => {
  const sets = setSchemeSets(ex);
  if (sets.length > 0) return String(sets.length);
  return mdCell(ex.series);
};

function workoutJsonToMarkdown(plan: Rec): string | null {
  const days = Array.isArray(plan.days) ? (plan.days as Rec[]) : null;
  if (!days) return null;
  const metadata = (plan.metadata ?? null) as Rec | null;
  const lines: string[] = [];
  if (metadata?.goal) {
    lines.push(`**Objetivo:** ${metadata.goal}`);
    lines.push("");
  }
  lines.push(
    "| TREINO DO DIA | EXERCÍCIO | SÉRIE | SÉRIE 2 | REPETIÇÕES | RIR | PAUSA | DESCRIÇÃO | VARIAÇÃO |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const day of days) {
    const exercises = Array.isArray(day.exercises) ? (day.exercises as Rec[]) : [];
    for (const ex of exercises) {
      lines.push(
        `| ${mdCell(day.day)} | ${mdCell(ex.exercise)} | ${mdSeries(ex)} | ${mdCell(ex.series2)} | ${mdReps(ex)} | ${mdCell(ex.rir)} | ${mdRest(ex)} | ${mdCell(ex.description)} | ${mdCell(ex.variation)} |`,
      );
    }
  }
  lines.push("");
  if (metadata?.notes) {
    lines.push("");
    lines.push(`> ${metadata.notes}`);
  }
  return lines.join("\n");
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const token = (req.headers.get("X-Jarvis-Token") ?? "").trim();
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

    if (operacao === "definir_carga_alvo") {
      const planId = String(body.plan_id ?? "").trim();
      const dia = String(body.dia ?? "").trim();
      const exercicio = String(body.exercicio ?? "").trim();
      const expectedRevision = Number(body.expected_revision);
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
      const rawTarget = body.target_load_kg;
      let targetLoadKg: number | null = null;
      if (rawTarget !== null && rawTarget !== undefined && rawTarget !== "") {
        const n = Number(rawTarget);
        if (!Number.isFinite(n) || n <= 0) return json({ erro: "target_load_kg_invalido" }, 400);
        targetLoadKg = n;
      }

      // carga alvo por série (prioridade sobre targetLoadKg quando enviada)
      const rawPerSet = body.target_load_per_set;
      let targetLoadPerSet: Array<{ set_number: number; load_kg: number }> | null = null;
      if (rawPerSet !== null && rawPerSet !== undefined) {
        if (!Array.isArray(rawPerSet)) return json({ erro: "target_load_per_set_invalido" }, 400);
        const parsed: Array<{ set_number: number; load_kg: number }> = [];
        for (let i = 0; i < rawPerSet.length; i++) {
          const item = rawPerSet[i];
          if (!item || typeof item !== "object") return json({ erro: "target_load_per_set_invalido" }, 400);
          const o = item as Record<string, unknown>;
          const load = Number(o.load_kg);
          if (!Number.isFinite(load) || load <= 0) return json({ erro: "target_load_per_set_invalido" }, 400);
          const sn = Number(o.set_number);
          parsed.push({
            set_number: Number.isFinite(sn) && sn > 0 ? Math.trunc(sn) : i + 1,
            load_kg: load,
          });
        }
        if (parsed.length > 0) {
          parsed.sort((a, b) => a.set_number - b.set_number);
          targetLoadPerSet = parsed;
        }
      }
      if (targetLoadPerSet) targetLoadKg = null;
      if (!planId) return json({ erro: "plan_id_obrigatorio" }, 400);
      if (!dia) return json({ erro: "dia_obrigatorio" }, 400);
      if (!exercicio) return json({ erro: "exercicio_obrigatorio" }, 400);
      if (!Number.isFinite(expectedRevision)) return json({ erro: "expected_revision_obrigatorio" }, 400);

      const { data: plan, error: planError } = await supabase
        .from("ai_plans")
        .select("id, student_id, titulo, conteudo, conteudo_json, fase, version, content_revision, tipo")
        .eq("id", planId)
        .maybeSingle();
      if (planError) return json({ erro: planError.message }, 500);
      if (!plan) return json({ erro: "plano_nao_encontrado" }, 404);
      if (plan.tipo !== "treino") return json({ erro: "plano_nao_e_treino" }, 400);

      const currentRevision = Number(plan.content_revision ?? 0);
      if (currentRevision !== expectedRevision) {
        return json({ erro: "revisao_desatualizada", content_revision: currentRevision }, 409);
      }

      const planJson = plan.conteudo_json as Record<string, unknown> | null;
      const days = Array.isArray((planJson as { days?: unknown })?.days)
        ? ((planJson as { days: Record<string, unknown>[] }).days)
        : null;
      if (!days) return json({ erro: "plano_sem_conteudo_json" }, 400);

      const norm = (s: unknown) =>
        String(s ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();

      const dayMatches = days
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => norm((d as { day?: unknown }).day) === norm(dia));
      if (dayMatches.length === 0) {
        return json({ erro: "dia_nao_encontrado", dias: days.map((d) => (d as { day?: unknown }).day) }, 404);
      }
      if (dayMatches.length > 1) {
        return json({ erro: "dia_ambiguo", dias: days.map((d) => (d as { day?: unknown }).day) }, 404);
      }

      const dayIdx = dayMatches[0].i;
      const dayObj = days[dayIdx] as { day?: unknown; exercises?: Record<string, unknown>[] };
      const exercises = Array.isArray(dayObj.exercises) ? dayObj.exercises : [];
      const nomesDoDia = exercises.map((e) => e.exercise);
      const exMatches = exercises
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => norm(e.exercise) === norm(exercicio));
      if (exMatches.length === 0) {
        return json({ erro: "exercicio_nao_encontrado", exercicios: nomesDoDia }, 404);
      }
      if (exMatches.length > 1) {
        return json({ erro: "exercicio_ambiguo", exercicios: nomesDoDia }, 404);
      }

      const exIdx = exMatches[0].i;
      const beforeExercise = { ...(exercises[exIdx] as Record<string, unknown>) };
      const antes = (beforeExercise.targetLoadKg ?? null) as number | null;
      const antesPerSet = (beforeExercise.targetLoadPerSet ?? null) as unknown;
      const hasTarget = targetLoadPerSet !== null || targetLoadKg !== null;
      const afterExercise = {
        ...beforeExercise,
        targetLoadKg: targetLoadPerSet ? null : targetLoadKg,
        targetLoadPerSet: targetLoadPerSet,
        targetLoadNote: hasTarget ? note : null,
      };

      const nextExercises = exercises.slice();
      nextExercises[exIdx] = afterExercise;
      const nextDays = days.slice();
      nextDays[dayIdx] = { ...dayObj, exercises: nextExercises };
      const nextJson = { ...(planJson as Record<string, unknown>), days: nextDays };

      // admin (professor) responsável pelo registro de edição
      const { data: adminRole, error: adminError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (adminError) return json({ erro: adminError.message }, 500);
      const professorId = adminRole?.user_id ?? null;

      const depoisLabel = targetLoadPerSet
        ? targetLoadPerSet.map((s2) => `S${s2.set_number} ${s2.load_kg}kg`).join(" / ")
        : String(targetLoadKg ?? "null");
      const antesLabel = Array.isArray(antesPerSet) && antesPerSet.length > 0
        ? (antesPerSet as Array<{ set_number?: unknown; load_kg?: unknown }>)
            .map((s2) => `S${s2.set_number} ${s2.load_kg}kg`)
            .join(" / ")
        : String(antes ?? "null");
      const reason = `carga alvo ${exercicio}: ${antesLabel} → ${depoisLabel}`;

      const { error: versionError } = await supabase.from("workout_plan_versions").insert({
        plan_id: plan.id,
        student_id: plan.student_id,
        version_number: Number(plan.version ?? 1),
        status: "archived",
        generated_by: "jarvis",
        titulo: plan.titulo ?? "Treino",
        conteudo: plan.conteudo ?? "",
        fase: plan.fase ?? null,
        snapshot_json: planJson,
        reason_summary: reason,
        archived_at: new Date().toISOString(),
      });
      if (versionError) return json({ erro: versionError.message }, 500);

      if (professorId) {
        const { error: editError } = await supabase.from("workout_prescription_edits").insert({
          professor_id: professorId,
          student_id: plan.student_id,
          plan_id: plan.id,
          plan_version: Number(plan.version ?? 1),
          // constraint do banco só aceita os valores manuais; origem real fica no snapshot
          source: "manual_training_mode",
          action_origin: "manual",
          before_json: beforeExercise,
          after_json: afterExercise,
          changes: {
            targetLoadKg: { from: antes, to: afterExercise.targetLoadKg },
            targetLoadPerSet: { from: antesPerSet ?? null, to: targetLoadPerSet },
          },
          context_snapshot: { origin: "jarvis", channel: "voice", dia: dayObj.day, note },
        });
        if (editError) return json({ erro: editError.message }, 500);
      }

      const { data: updated, error: updateError } = await supabase
        .from("ai_plans")
        .update({ conteudo_json: nextJson, content_revision: currentRevision + 1 })
        .eq("id", plan.id)
        .eq("content_revision", currentRevision)
        .select("content_revision")
        .maybeSingle();
      if (updateError) return json({ erro: updateError.message }, 500);
      if (!updated) return json({ erro: "revisao_desatualizada", content_revision: currentRevision }, 409);

      return json({
        ok: true,
        antes,
        antes_por_serie: antesPerSet ?? null,
        depois: afterExercise.targetLoadKg,
        depois_por_serie: targetLoadPerSet,
        content_revision: updated.content_revision,
      });
    }

    if (operacao === "listar_exercicios") {
      const busca = typeof body.busca === "string" ? body.busca.trim() : "";
      let q = supabase.from("exercises").select("id, nome, grupo_muscular").order("nome").limit(30);
      if (busca) q = q.ilike("nome", `%${busca}%`);
      const { data, error } = await q;
      if (error) return json({ erro: error.message }, 500);
      return json({ exercicios: data ?? [] });
    }

    if (operacao === "editar_treino") {
      const planId = String(body.plan_id ?? "").trim();
      const expectedRevision = Number(body.expected_revision);
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
      const mudancas = Array.isArray(body.mudancas) ? (body.mudancas as Rec[]) : null;
      if (!planId) return json({ erro: "plan_id_obrigatorio" }, 400);
      if (!Number.isFinite(expectedRevision)) return json({ erro: "expected_revision_obrigatorio" }, 400);
      if (!mudancas || mudancas.length === 0) return json({ erro: "mudancas_obrigatorias" }, 400);

      const { data: plan, error: planError } = await supabase
        .from("ai_plans")
        .select("id, student_id, titulo, conteudo, conteudo_json, fase, version, content_revision, tipo")
        .eq("id", planId)
        .maybeSingle();
      if (planError) return json({ erro: planError.message }, 500);
      if (!plan) return json({ erro: "plano_nao_encontrado" }, 404);
      if (plan.tipo !== "treino") return json({ erro: "plano_nao_e_treino" }, 400);

      const currentRevision = Number(plan.content_revision ?? 0);
      if (currentRevision !== expectedRevision) {
        return json({ erro: "revisao_desatualizada", content_revision: currentRevision }, 409);
      }

      const planJson = plan.conteudo_json as Rec | null;
      const originalDays = Array.isArray((planJson as { days?: unknown })?.days)
        ? ((planJson as { days: Rec[] }).days)
        : null;
      if (!planJson || !originalDays) return json({ erro: "plano_sem_conteudo_json" }, 400);

      // cópia profunda de trabalho — nada é gravado antes de todas as mudanças validarem
      const working = JSON.parse(JSON.stringify(planJson)) as Rec;
      const days = working.days as Rec[];

      const catalog = await supabase.from("exercises").select("id, nome");
      if (catalog.error) return json({ erro: catalog.error.message }, 500);
      const catalogRows = (catalog.data ?? []) as { id: string; nome: string }[];

      const findCatalog = (nome: string) => {
        const alvo = normalizeName(nome);
        return catalogRows.filter((r) => normalizeName(r.nome) === alvo);
      };
      const similares = (nome: string) => {
        const alvo = normalizeName(nome);
        const palavras = alvo.split(" ").filter((w) => w.length > 2);
        return catalogRows
          .filter((r) => {
            const n = normalizeName(r.nome);
            return n.includes(alvo) || palavras.some((w) => n.includes(w));
          })
          .slice(0, 5)
          .map((r) => r.nome);
      };

      const findDay = (dia: string) => {
        const matches = days
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => normalizeName((d as { day?: unknown }).day) === normalizeName(dia));
        return matches;
      };

      const aplicadas: Rec[] = [];
      const touchedBefore: Rec[] = [];
      const touchedAfter: Rec[] = [];

      for (let idx = 0; idx < mudancas.length; idx++) {
        const m = mudancas[idx] ?? {};
        const fail = (erro: string, extra: Rec = {}, status = 400) =>
          json({ erro, indice: idx, ...extra }, status);

        const tipo = String(m.tipo ?? "").trim();
        const dia = String(m.dia ?? "").trim();
        const exercicio = String(m.exercicio ?? "").trim();
        if (!dia) return fail("dia_obrigatorio");
        if (!exercicio) return fail("exercicio_obrigatorio");

        const dayMatches = findDay(dia);
        if (dayMatches.length === 0) {
          return fail("dia_nao_encontrado", { dias: days.map((d) => (d as Rec).day) }, 404);
        }
        if (dayMatches.length > 1) {
          return fail("dia_ambiguo", { dias: days.map((d) => (d as Rec).day) }, 404);
        }
        const dayObj = dayMatches[0].d as { day?: unknown; exercises?: Rec[] };
        if (!Array.isArray(dayObj.exercises)) dayObj.exercises = [];
        const exercises = dayObj.exercises as Rec[];
        const nomesDoDia = exercises.map((e) => e.exercise);

        const locate = () => {
          const ms = exercises
            .map((e, i) => ({ e, i }))
            .filter(({ e }) => normalizeName(e.exercise) === normalizeName(exercicio));
          return ms;
        };

        if (tipo === "adicionar_exercicio") {
          const cat = findCatalog(exercicio);
          if (cat.length === 0) {
            return fail("exercicio_inexistente_na_base", { sugestoes: similares(exercicio) }, 404);
          }
          const campos = (m.campos ?? {}) as Rec;
          const invalidas = Object.keys(campos).filter(
            (k) => !(CAMPOS_VALIDOS as readonly string[]).includes(k),
          );
          if (invalidas.length > 0) {
            return fail("campos_invalidos", { invalidas, validos: CAMPOS_VALIDOS });
          }
          const novo: Rec = {
            id: `ex-jarvis-${Date.now()}-${idx}`,
            exercise: cat[0].nome,
            exerciseId: cat[0].id,
            series: "",
            reps: "",
            ...campos,
          };
          const posicao = String(m.posicao ?? "fim").trim().toLowerCase();
          if (posicao === "inicio" || posicao === "início") exercises.unshift(novo);
          else exercises.push(novo);
          touchedBefore.push({ dia: dayObj.day, exercise: null });
          touchedAfter.push({ dia: dayObj.day, ...novo });
          aplicadas.push({ indice: idx, antes: null, depois: novo });
          continue;
        }

        const ms = locate();
        if (ms.length === 0) return fail("exercicio_nao_encontrado", { exercicios: nomesDoDia }, 404);
        if (ms.length > 1) return fail("exercicio_ambiguo", { exercicios: nomesDoDia }, 404);
        const exIdx = ms[0].i;
        const before = JSON.parse(JSON.stringify(exercises[exIdx])) as Rec;

        if (tipo === "ajustar_exercicio") {
          const campos = (m.campos ?? {}) as Rec;
          const keys = Object.keys(campos);
          if (keys.length === 0) return fail("campos_obrigatorios", { validos: CAMPOS_VALIDOS });
          const invalidas = keys.filter((k) => !(CAMPOS_VALIDOS as readonly string[]).includes(k));
          if (invalidas.length > 0) {
            return fail("campos_invalidos", { invalidas, validos: CAMPOS_VALIDOS });
          }
          const after: Rec = { ...before, ...campos };
          if (Object.prototype.hasOwnProperty.call(campos, "pause") && !("restSeconds" in campos)) {
            const n = Number(String(campos.pause ?? "").replace(/[^\d.]/g, ""));
            after.restSeconds = Number.isFinite(n) && n > 0 ? Math.round(n) : after.restSeconds;
          }
          exercises[exIdx] = after;
          touchedBefore.push({ dia: dayObj.day, ...before });
          touchedAfter.push({ dia: dayObj.day, ...after });
          aplicadas.push({ indice: idx, antes: before, depois: after });
          continue;
        }

        if (tipo === "trocar_exercicio") {
          const novoNome = String(m.novo_exercicio ?? "").trim();
          if (!novoNome) return fail("novo_exercicio_obrigatorio");
          const cat = findCatalog(novoNome);
          if (cat.length === 0) {
            return fail("exercicio_inexistente_na_base", { sugestoes: similares(novoNome) }, 404);
          }
          const after: Rec = {
            ...before,
            exercise: cat[0].nome,
            exerciseId: cat[0].id,
            variation: "",
          };
          exercises[exIdx] = after;
          touchedBefore.push({ dia: dayObj.day, ...before });
          touchedAfter.push({ dia: dayObj.day, ...after });
          aplicadas.push({ indice: idx, antes: before, depois: after });
          continue;
        }

        if (tipo === "remover_exercicio") {
          exercises.splice(exIdx, 1);
          touchedBefore.push({ dia: dayObj.day, ...before });
          touchedAfter.push({ dia: dayObj.day, exercise: null });
          aplicadas.push({ indice: idx, antes: before, depois: null });
          continue;
        }

        if (tipo === "observacao") {
          const texto = String(m.texto ?? "").trim();
          if (!texto) return fail("texto_obrigatorio");
          const atual = String(before.description ?? "").trim();
          const limpo = atual === "-" ? "" : atual;
          const after: Rec = { ...before, description: limpo ? `${limpo} · ${texto}` : texto };
          exercises[exIdx] = after;
          touchedBefore.push({ dia: dayObj.day, ...before });
          touchedAfter.push({ dia: dayObj.day, ...after });
          aplicadas.push({ indice: idx, antes: before, depois: after });
          continue;
        }

        return fail("tipo_invalido", {
          tipos: ["ajustar_exercicio", "trocar_exercicio", "adicionar_exercicio", "remover_exercicio", "observacao"],
        });
      }

      const novoMarkdown = workoutJsonToMarkdown(working);
      const currentVersion = Number(plan.version ?? 1);

      const { data: adminRole, error: adminError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (adminError) return json({ erro: adminError.message }, 500);
      const professorId = adminRole?.user_id ?? null;

      const reason = `jarvis editar_treino: ${mudancas.length} mudança(s)`;

      const { error: versionError } = await supabase.from("workout_plan_versions").insert({
        plan_id: plan.id,
        student_id: plan.student_id,
        version_number: currentVersion,
        status: "archived",
        generated_by: "jarvis",
        titulo: plan.titulo ?? "Treino",
        conteudo: plan.conteudo ?? "",
        fase: plan.fase ?? null,
        snapshot_json: planJson,
        reason_summary: reason,
        archived_at: new Date().toISOString(),
      });
      if (versionError) return json({ erro: versionError.message }, 500);

      if (professorId) {
        const { error: editError } = await supabase.from("workout_prescription_edits").insert({
          professor_id: professorId,
          student_id: plan.student_id,
          plan_id: plan.id,
          plan_version: currentVersion,
          // constraint do banco só aceita os valores manuais; origem real fica no snapshot
          source: "manual_training_mode",
          action_origin: "manual",
          before_json: touchedBefore,
          after_json: touchedAfter,
          changes: mudancas,
          context_snapshot: { origin: "jarvis", channel: "voice", note },
        });
        if (editError) return json({ erro: editError.message }, 500);
      }

      const updatePayload: Rec = {
        conteudo_json: working,
        content_revision: currentRevision + 1,
        version: currentVersion + 1,
      };
      if (novoMarkdown) updatePayload.conteudo = novoMarkdown;

      const { data: updated, error: updateError } = await supabase
        .from("ai_plans")
        .update(updatePayload)
        .eq("id", plan.id)
        .eq("content_revision", currentRevision)
        .select("content_revision, version")
        .maybeSingle();
      if (updateError) return json({ erro: updateError.message }, 500);
      if (!updated) return json({ erro: "revisao_desatualizada", content_revision: currentRevision }, 409);

      return json({
        ok: true,
        aplicadas,
        content_revision: updated.content_revision,
        version: updated.version,
        markdown_regenerado: Boolean(novoMarkdown),
      });
    }


    if (operacao === "listar_alimentos") {
      const busca = typeof body.busca === "string" ? body.busca.trim() : "";
      let q = supabase
        .from("foods")
        .select("id, name, brand, portion, portion_size, calories, protein, carbs, fats")
        .order("name")
        .limit(30);
      if (busca) q = q.ilike("name", `%${busca}%`);
      const { data, error } = await q;
      if (error) return json({ erro: error.message }, 500);
      return json({ alimentos: data ?? [] });
    }

    return json({ erro: "operacao_desconhecida" }, 400);

  } catch (e) {
    console.error("[jarvis-bridge] falha:", String((e as Error)?.message ?? e));
    return json({ erro: "erro_interno" }, 500);
  }
});
