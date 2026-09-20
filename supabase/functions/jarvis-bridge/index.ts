// jarvis-bridge — endpoint somente leitura para o projeto "Jarvis Marombiew".
// Autenticação por header X-Jarvis-Token (secret JARVIS_BRIDGE_TOKEN).
// Nunca registra o token em logs. Puramente aditivo: não altera nada do projeto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadFoodCatalog } from "../_shared/foodCatalog.ts";
import { hydrateDietPlanFromFoods } from "../_shared/dietHydration.ts";
import { canonicalDietPlanToMarkdown } from "../_shared/canonicalDietMarkdown.ts";
import { normalizeDietTitle } from "../_shared/dietTitle.ts";
import {
  buildPublishedSnapshotPlan,
  collectFoodAssertions,
  collectPublicationBlockers,
  isStructuredPlan,
  stripPublicationSnapshots,
  validatePublicationPlan,
  validateSnapshotAssertionIntegrity,
} from "../_shared/dietPublication.ts";
import {
  buildDietGenerationRequest,
  checkDietDataReadiness,
  loadDietStudentContext,
} from "../_shared/dietGenerationContext.ts";
import {
  buildTrainerGenerationRequest,
  checkTrainerDataReadiness,
  loadTrainerStudentContext,
  summarizeWorkoutPlan,
  type TrainerGenerationInput,
} from "../_shared/trainerGenerationContext.ts";


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


/* Valores aceitos pelas CHECK constraints / convenções de ai_plans. */
const DEFAULT_PLAN_FASE = "semana_1";
const ALLOWED_PLAN_FASE = ["semana_1", "semana_2", "semana_3", "deload"];
const ALLOWED_GENERATION_INTENT = ["new", "regenerate", "update"];
const ALLOWED_STRATEGY_SOURCE = ["ai", "manual"];
const ALLOWED_PLAN_TIPO = ["treino", "dieta", "cardio", "tabata"];
const ALLOWED_CYCLE_STATUS = [
  "em_dia", "renovado", "renovacao_sugerida", "aguardando_dados", "pre_renovacao", "rascunho_gerado",
];
const ALLOWED_DRAFT_SOURCE = ["manual", "auto", "jarvis"];
const ALLOWED_MIGRATION_STATUS = ["pending", "completed", "failed"];

const SINTOMA_KEYS = [

  "fome_excessiva",
  "baixa_energia",
  "insonia",
  "irritabilidade",
  "fraqueza",
  "dor_cabeca",
  "pele_fina",
  "reduziu_peso",
] as const;

function formatQuestionario(q: Rec | null): Rec | null {
  if (!q) return null;
  const sintomas = SINTOMA_KEYS.filter((k) => q[k] === true);
  return {
    estilo_dieta: q.estilo_dieta ?? null,
    fase_atual: q.fase_atual ?? null,
    num_refeicoes: q.num_refeicoes ?? null,
    horario_treino: q.horario_treino ?? null,
    dias_treino: q.dias_treino ?? null,
    usa_hormonios: q.usa_hormonios ?? null,
    restricoes_alimentares: q.restricoes_alimentares ?? null,
    preferencias_alimentares: q.preferencias_alimentares ?? null,
    alimentos_por_refeicao: q.alimentos_por_refeicao ?? null,
    como_se_sente: q.como_se_sente ?? null,
    sintomas,
    dores_articulares: q.dores_articulares ?? null,
    dores_observacoes: q.dores_observacoes ?? null,
    observacoes: q.observacoes ?? null,
    responded_at: q.responded_at ?? null,
  };
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
        .select("id, student_id, titulo, conteudo, conteudo_json, fase, version, content_revision, tipo, is_draft, draft_source")
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

      // Rascunho (ainda não publicado): sem snapshot de histórico.
      if (plan.is_draft !== true) {
        const { error: versionError } = await supabase.from("workout_plan_versions").insert({
          plan_id: plan.id,
          student_id: plan.student_id,
          version_number: Number(plan.version ?? 1),
          status: "archived",
          generated_by: "jarvis",
          titulo: plan.titulo ?? "Treino",
          conteudo: plan.conteudo ?? "",
          fase: plan.fase ?? null,
          snapshot_json: planJson ?? {},
          reason_summary: reason,
          archived_at: new Date().toISOString(),
        });
        if (versionError) return json({ erro: versionError.message }, 500);
      }


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
        .select("id, student_id, titulo, conteudo, conteudo_json, fase, version, content_revision, tipo, is_draft, draft_source")
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

      // Rascunho ainda não publicado: ajustar antes de publicar não gera
      // snapshot de histórico (o histórico nasce na publicação).
      if (plan.is_draft !== true) {
        const { error: versionError } = await supabase.from("workout_plan_versions").insert({
          plan_id: plan.id,
          student_id: plan.student_id,
          version_number: currentVersion,
          status: "archived",
          generated_by: "jarvis",
          titulo: plan.titulo ?? "Treino",
          conteudo: plan.conteudo ?? "",
          fase: plan.fase ?? null,
          snapshot_json: planJson ?? {},
          reason_summary: reason,
          archived_at: new Date().toISOString(),
        });
        if (versionError) return json({ erro: versionError.message }, 500);
      }


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

    if (operacao === "cadastrar_alimento") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ erro: "name_obrigatorio" }, 400);
      const num = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const portionSize = num(body.portion_size);
      const calories = num(body.calories) ?? 0;
      const protein = num(body.protein) ?? 0;
      const carbs = num(body.carbs) ?? 0;
      const fats = num(body.fats) ?? 0;
      if (portionSize == null || portionSize <= 0) {
        return json({ erro: "valor_invalido", campo: "portion_size", recebido: body.portion_size, regra: "> 0" }, 400);
      }
      for (const [campo, valor] of [["calories", calories], ["protein", protein], ["carbs", carbs], ["fats", fats]] as Array<[string, number]>) {
        if (valor < 0) return json({ erro: "valor_invalido", campo, recebido: valor, regra: ">= 0" }, 400);
      }
      // Coerência kcal ≈ P*4 + C*4 + G*9 (tolerância 15%). Alimentos sem calorias
      // (ex.: creatina pura) passam quando ambos são ~0.
      const esperado = protein * 4 + carbs * 4 + fats * 9;
      if (esperado > 0 || calories > 0) {
        const base = Math.max(esperado, calories, 1);
        if (Math.abs(calories - esperado) / base > 0.15) {
          return json({
            erro: "calorias_incoerentes",
            recebido: calories,
            esperado: Math.round(esperado * 10) / 10,
            tolerancia: "15%",
            calculo: "P*4 + C*4 + G*9",
          }, 400);
        }
      }

      // Duplicata por nome normalizado (sem acento/caixa, ilike).
      const norm = normalizeName(name);
      const { data: candidatos, error: dupError } = await supabase
        .from("foods")
        .select("id, name, brand, portion, portion_size, calories, protein, carbs, fats, source")
        .ilike("name", `%${name.replace(/[%_]/g, " ")}%`)
        .limit(50);
      if (dupError) return json({ erro: dupError.message }, 500);
      const dup = (candidatos ?? []).find((f: Rec) => normalizeName(f.name) === norm);
      if (dup) return json({ erro: "ja_existe", food: dup }, 409);

      const { data: food, error: insertError } = await supabase
        .from("foods")
        .insert({
          name,
          brand: body.brand == null ? null : String(body.brand).trim() || null,
          portion: body.portion == null ? null : String(body.portion).trim() || null,
          portion_size: portionSize,
          calories,
          protein,
          carbs,
          fats,
          source: "jarvis",
          source_food_id: null,
        })
        .select("id, name, brand, portion, portion_size, calories, protein, carbs, fats, source")
        .single();
      if (insertError) return json({ erro: insertError.message }, 500);
      console.log(`[jarvis-bridge] alimento cadastrado: ${food?.id} ${name}`);
      return json({ ok: true, food });
    }


    if (operacao === "editar_dieta") {
      const planId = String(body.plan_id ?? "").trim();
      const expectedRevision = Number(body.expected_revision);
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
      const forcar = body.forcar === true;
      const mudancas = Array.isArray(body.mudancas) ? (body.mudancas as Rec[]) : null;
      if (!planId) return json({ erro: "plan_id_obrigatorio" }, 400);
      if (!Number.isFinite(expectedRevision)) return json({ erro: "expected_revision_obrigatorio" }, 400);
      if (!mudancas || mudancas.length === 0) return json({ erro: "mudancas_obrigatorias" }, 400);

      const { data: plan, error: planError } = await supabase
        .from("ai_plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();
      if (planError) return json({ erro: planError.message }, 500);
      if (!plan) return json({ erro: "plano_nao_encontrado" }, 404);
      if (plan.tipo !== "dieta" || !isStructuredPlan(plan.conteudo_json)) {
        return json({ erro: "dieta_estruturada_obrigatoria" }, 400);
      }

      const currentRevision = Number(plan.content_revision ?? 1);
      if (currentRevision !== expectedRevision) {
        return json({ erro: "revisao_desatualizada", content_revision: currentRevision }, 409);
      }

      const catalog = await loadFoodCatalog(supabase);
      const base = plan.is_draft === true
        ? JSON.parse(JSON.stringify(plan.conteudo_json))
        : stripPublicationSnapshots(plan.conteudo_json);
      const working = JSON.parse(JSON.stringify(base)) as Rec;
      const dias = Array.isArray(working.days) ? (working.days as Rec[]) : [];
      if (dias.length === 0) return json({ erro: "plano_sem_dias" }, 400);

      const nomesDias = dias.map((d) => d.weekday ?? d.label);
      const findFood = (nome: string) => {
        const alvo = normalizeName(nome);
        const exatos = catalog.foods.filter((f) => normalizeName(f.name) === alvo);
        if (exatos.length > 0) return { matches: exatos };
        return { matches: [] as typeof catalog.foods };
      };
      const foodsSimilares = (nome: string) => {
        const alvo = normalizeName(nome);
        const palavras = alvo.split(" ").filter((w) => w.length > 2);
        return catalog.foods
          .filter((f) => {
            const n = normalizeName(f.name);
            return n.includes(alvo) || palavras.some((w) => n.includes(w));
          })
          .slice(0, 5)
          .map((f) => f.name);
      };

      const totaisDe = (p: Rec) => {
        let kcal = 0, pt = 0, c = 0, g = 0;
        const ds = Array.isArray(p.days) ? (p.days as Rec[]) : [];
        for (const d of ds) {
          for (const meal of (Array.isArray(d.meals) ? (d.meals as Rec[]) : [])) {
            for (const it of (Array.isArray(meal.items) ? (meal.items as Rec[]) : [])) {
              const food = catalog.index.byId.get(String(it.foodId ?? ""));
              const qty = Number(it.qtyGrams) || 0;
              if (!food || qty <= 0) continue;
              const bs = Number(food.portion_size) > 0 ? Number(food.portion_size) : 100;
              const f = qty / bs;
              kcal += Number(food.calories || 0) * f;
              pt += Number(food.protein || 0) * f;
              c += Number(food.carbs || 0) * f;
              g += Number(food.fats || 0) * f;
            }
          }
        }
        const r = (n: number) => Math.round(n * 10) / 10;
        return { kcal: r(kcal), p: r(pt), c: r(c), g: r(g) };
      };

      const totaisAntes = totaisDe(base as Rec);
      const aplicadas: Rec[] = [];

      for (let idx = 0; idx < mudancas.length; idx++) {
        const m = mudancas[idx] ?? {};
        const fail = (erro: string, extra: Rec = {}, status = 400) =>
          json({ erro, indice: idx, ...extra }, status);
        const tipo = String(m.tipo ?? "").trim();

        if (tipo === "ajustar_metas") {
          const alvo = (working.targets ?? {}) as Rec;
          const antes = { ...alvo };
          const setNum = (key: string, raw: unknown) => {
            if (raw === undefined || raw === null || raw === "") return true;
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) return false;
            alvo[key] = n;
            return true;
          };
          if (!setNum("kcal", m.calorias)) return fail("calorias_invalidas");
          if (!setNum("p", m.proteina_g)) return fail("proteina_invalida");
          if (!setNum("c", m.carbo_g)) return fail("carbo_invalido");
          if (!setNum("g", m.gordura_g)) return fail("gordura_invalida");
          working.targets = alvo;
          aplicadas.push({ indice: idx, antes, depois: { ...alvo } });
          continue;
        }

        // Demais mudanças operam sobre uma refeição de um dia.
        const diaRaw = String(m.dia ?? "").trim();
        let diaIdx = 0;
        if (diaRaw) {
          const ms = dias
            .map((d, i) => ({ d, i }))
            .filter(({ d }) =>
              normalizeName(d.weekday) === normalizeName(diaRaw) ||
              normalizeName(d.label) === normalizeName(diaRaw)
            );
          if (ms.length === 0) return fail("dia_nao_encontrado", { dias: nomesDias }, 404);
          if (ms.length > 1) return fail("dia_ambiguo", { dias: nomesDias }, 404);
          diaIdx = ms[0].i;
        } else if (dias.length > 1) {
          return fail("dia_obrigatorio", { dias: nomesDias });
        }

        const dayObj = dias[diaIdx] as Rec;
        const meals = (Array.isArray(dayObj.meals) ? dayObj.meals : []) as Rec[];
        const nomesRefeicoes = meals.map((r) => r.name);
        const refeicao = String(m.refeicao ?? "").trim();
        if (!refeicao) return fail("refeicao_obrigatoria", { refeicoes: nomesRefeicoes });
        const refMatches = meals
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => normalizeName(r.name) === normalizeName(refeicao));
        if (refMatches.length === 0) return fail("refeicao_nao_encontrada", { refeicoes: nomesRefeicoes }, 404);
        if (refMatches.length > 1) return fail("refeicao_ambigua", { refeicoes: nomesRefeicoes }, 404);
        const meal = refMatches[0].r;
        const items = (Array.isArray(meal.items) ? meal.items : []) as Rec[];
        const nomesAlimentos = items.map((i2) => i2.name);

        if (tipo === "observacao") {
          const texto = String(m.texto ?? "").trim();
          if (!texto) return fail("texto_obrigatorio");
          const atual = String(meal.notes ?? "").trim();
          meal.notes = atual ? `${atual} · ${texto}` : texto;
          aplicadas.push({ indice: idx, antes: atual || null, depois: meal.notes });
          continue;
        }

        if (tipo === "adicionar_alimento") {
          const nome = String(m.alimento ?? "").trim();
          const qty = Number(m.quantidade_g);
          if (!nome) return fail("alimento_obrigatorio");
          if (!Number.isFinite(qty) || qty <= 0) return fail("quantidade_g_invalida");
          const { matches } = findFood(nome);
          if (matches.length === 0) {
            return fail("alimento_inexistente_na_base", { sugestoes: foodsSimilares(nome) }, 404);
          }
          if (matches.length > 1) {
            return fail("alimento_ambiguo_na_base", { opcoes: matches.slice(0, 5).map((f) => ({ id: f.id, name: f.name, brand: f.brand })) }, 404);
          }
          const food = matches[0];
          const novo: Rec = {
            foodId: food.id,
            name: food.name,
            qtyGrams: qty,
            portionLabel: `${Math.round(qty)} g`,
            resolutionStatus: "resolved_by_id",
            manualLocked: true,
            macros: { kcal: 0, p: 0, c: 0, g: 0 },
          };
          items.push(novo);
          meal.items = items;
          aplicadas.push({ indice: idx, antes: null, depois: { alimento: food.name, quantidade_g: qty } });
          continue;
        }

        const alimento = String(m.alimento ?? "").trim();
        if (!alimento) return fail("alimento_obrigatorio", { alimentos: nomesAlimentos });
        const itMatches = items
          .map((i2, i) => ({ i2, i }))
          .filter(({ i2 }) => normalizeName(i2.name) === normalizeName(alimento));
        if (itMatches.length === 0) return fail("alimento_nao_encontrado", { alimentos: nomesAlimentos }, 404);
        if (itMatches.length > 1) return fail("alimento_ambiguo", { alimentos: nomesAlimentos }, 404);
        const itemIdx = itMatches[0].i;
        const item = items[itemIdx];
        const antesItem = { alimento: item.name, quantidade_g: Number(item.qtyGrams) || 0 };

        if (tipo === "ajustar_quantidade") {
          const qty = Number(m.quantidade_g);
          if (!Number.isFinite(qty) || qty <= 0) return fail("quantidade_g_invalida");
          item.qtyGrams = qty;
          item.portionLabel = `${Math.round(qty)} g`;
          item.manualLocked = true;
          delete item.nutritionSnapshot;
          aplicadas.push({ indice: idx, antes: antesItem, depois: { alimento: item.name, quantidade_g: qty } });
          continue;
        }

        if (tipo === "substituir_alimento") {
          const novoNome = String(m.novo_alimento ?? "").trim();
          if (!novoNome) return fail("novo_alimento_obrigatorio");
          const { matches } = findFood(novoNome);
          if (matches.length === 0) {
            return fail("alimento_inexistente_na_base", { sugestoes: foodsSimilares(novoNome) }, 404);
          }
          if (matches.length > 1) {
            return fail("alimento_ambiguo_na_base", { opcoes: matches.slice(0, 5).map((f) => ({ id: f.id, name: f.name, brand: f.brand })) }, 404);
          }
          const food = matches[0];
          const qtyRaw = m.quantidade_g;
          const qty = qtyRaw === undefined || qtyRaw === null || qtyRaw === ""
            ? Number(item.qtyGrams) || 0
            : Number(qtyRaw);
          if (!Number.isFinite(qty) || qty <= 0) return fail("quantidade_g_invalida");
          item.foodId = food.id;
          item.name = food.name;
          item.qtyGrams = qty;
          item.portionLabel = `${Math.round(qty)} g`;
          item.resolutionStatus = "resolved_by_id";
          item.manualLocked = true;
          delete item.nutritionSnapshot;
          aplicadas.push({ indice: idx, antes: antesItem, depois: { alimento: food.name, quantidade_g: qty } });
          continue;
        }

        if (tipo === "remover_alimento") {
          items.splice(itemIdx, 1);
          meal.items = items;
          aplicadas.push({ indice: idx, antes: antesItem, depois: null });
          continue;
        }

        return fail("tipo_invalido", {
          tipos: [
            "ajustar_quantidade",
            "substituir_alimento",
            "adicionar_alimento",
            "remover_alimento",
            "ajustar_metas",
            "observacao",
          ],
        });
      }

      const totaisDepois = totaisDe(working);
      const variacao = totaisAntes.kcal > 0
        ? Math.round(((totaisDepois.kcal - totaisAntes.kcal) / totaisAntes.kcal) * 1000) / 10
        : 0;
      if (!forcar && Math.abs(variacao) > 15) {
        return json(
          { erro: "variacao_calorica", antes: totaisAntes.kcal, depois: totaisDepois.kcal, percentual: variacao },
          422,
        );
      }

      // Rehidratação pela base: macros e totais nunca vêm do payload.
      const hydrated = hydrateDietPlanFromFoods(working, catalog, "strict_id");
      if (hydrated.requiresResolution) {
        return json({ erro: "alimentos_nao_resolvidos", itens: hydrated.unresolvedItems.slice(0, 20) }, 422);
      }
      const blockers = collectPublicationBlockers(hydrated.plan, catalog);
      if (blockers.length > 0) {
        return json({ erro: "alimentos_nao_resolvidos", itens: blockers.slice(0, 20) }, 422);
      }

      // Admin responsável (autor da publicação).
      const { data: adminRole, error: adminError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (adminError) return json({ erro: adminError.message }, 500);
      const actorId = adminRole?.user_id ?? null;
      if (!actorId) return json({ erro: "admin_nao_encontrado" }, 500);

      // Histórico: versão anterior preservada antes de publicar.
      const { error: histError } = await supabase.from("diet_plan_versions").insert({
        plan_id: plan.id,
        student_id: plan.student_id,
        version: Number(plan.version ?? 1),
        titulo: plan.titulo ?? "Dieta",
        conteudo: plan.conteudo ?? "",
        fase: plan.fase ?? null,
        source: "jarvis",
        archived_at: new Date().toISOString(),
      });
      if (histError) return json({ erro: histError.message }, 500);

      // Dieta publicada é imutável: a edição vive numa nova linha em rascunho.
      let draft: Rec | null = null;
      if (plan.is_draft === true) {
        draft = plan as Rec;
      } else {
        const { data: existing } = await supabase
          .from("ai_plans")
          .select("*")
          .eq("parent_plan_id", plan.id)
          .eq("tipo", "dieta")
          .eq("is_draft", true)
          .order("created_at", { ascending: false })
          .limit(1);
        if (existing && existing.length > 0) {
          draft = existing[0] as Rec;
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from("ai_plans")
            .insert({
              student_id: plan.student_id,
              tipo: "dieta",
              titulo: normalizeDietTitle(plan.titulo) || "Dieta",
              conteudo: plan.conteudo ?? "",
              conteudo_json: hydrated.plan,
              protocols: plan.protocols,
              fase: plan.fase,
              diet_strategy: plan.diet_strategy,
              strategy_source: plan.strategy_source,
              generation_intent: plan.generation_intent,
              viability_score: plan.viability_score,
              viability_breakdown: plan.viability_breakdown,
              parent_plan_id: plan.id,
              version: Number(plan.version ?? 1) + 1,
              is_draft: true,
              migration_status: "completed",
              whatsapp_notified_at: null,
              whatsapp_notified_count: 0,
            })
            .select("*")
            .single();
          if (insertError) return json({ erro: insertError.message }, 500);
          draft = inserted as Rec;
        }
      }

      const draftId = String(draft!.id);
      const draftRevision = Number(draft!.content_revision ?? 1);

      const { plan: snapshotPlan } = buildPublishedSnapshotPlan(hydrated.plan, catalog);
      const schema = validatePublicationPlan(snapshotPlan);
      if (!schema.ok) return json({ erro: "plano_invalido", detalhes: schema.issues.slice(0, 20) }, 422);

      const finalProtocols = draft!.protocols ?? plan.protocols ?? null;
      const normalizedAdjustments =
        (finalProtocols as Rec | null)?.weekly_energy_schedule &&
        ((finalProtocols as Rec).weekly_energy_schedule as Rec)?.generated_adjustments
          ? ((finalProtocols as Rec).weekly_energy_schedule as Rec).generated_adjustments
          : null;

      const markdown = canonicalDietPlanToMarkdown(snapshotPlan);
      const assertions = collectFoodAssertions(snapshotPlan, catalog, normalizedAdjustments);
      const integrity = validateSnapshotAssertionIntegrity(snapshotPlan, assertions, normalizedAdjustments);
      if (!integrity.ok) return json({ erro: "plano_invalido", detalhes: integrity.issues.slice(0, 20) }, 422);

      // Rascunho sincronizado antes do commit atômico (rascunho é mutável).
      const { error: draftUpdateError } = await supabase
        .from("ai_plans")
        .update({ conteudo_json: hydrated.plan, conteudo: markdown, protocols: finalProtocols })
        .eq("id", draftId)
        .eq("is_draft", true);
      if (draftUpdateError) return json({ erro: draftUpdateError.message }, 500);

      const { data: published, error: rpcError } = await supabase.rpc("publish_diet_plan_atomic_actor", {
        p_actor_id: actorId,
        p_plan_id: draftId,
        p_expected_revision: draftRevision,
        p_final_plan: snapshotPlan,
        p_final_markdown: markdown,
        p_final_protocols: finalProtocols,
        p_food_assertions: assertions,
      });
      if (rpcError) {
        const msg = String(rpcError.message ?? "");
        if (msg.includes("draft_changed_refresh_required")) {
          return json({ erro: "revisao_desatualizada", content_revision: draftRevision }, 409);
        }
        return json({ erro: "publicacao_falhou", detalhes: msg }, 500);
      }

      const publishedRow = (published ?? {}) as Rec;
      return json({
        ok: true,
        aplicadas,
        totais_antes: totaisAntes,
        totais_depois: totaisDepois,
        percentual: variacao,
        plan_id: publishedRow.id ?? draftId,
        version: publishedRow.version ?? null,
        content_revision: publishedRow.content_revision ?? draftRevision + 1,
        note,
      });
    }

    if (operacao === "consultar_questionario_dieta") {
      const studentId = String(body.student_id ?? "").trim();
      if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);

      const { data: questRows } = await supabase
        .from("diet_questionnaires")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "completed")
        .order("responded_at", { ascending: false, nullsFirst: false })
        .limit(1);

      const quest = questRows?.[0] ?? null;
      if (!quest) return json({ erro: "sem_questionario" }, 404);

      return json({ ok: true, student_id: studentId, questionario: formatQuestionario(quest) });
    }

    if (operacao === "checar_dados_dieta" || operacao === "gerar_dieta") {
      const studentId = String(body.student_id ?? "").trim();
      if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);

      const ctx = await loadDietStudentContext(supabase, studentId);
      const readiness = checkDietDataReadiness(ctx);
      if (!readiness.ok) {
        return json({
          erro: "dados_insuficientes",
          faltando: readiness.faltando,
          avisos: readiness.avisos,
          ultima_avaliacao: ctx.data_avaliacao,
          avaliacao_fonte: ctx.avaliacao_fonte,
        }, 422);
      }

      if (operacao === "checar_dados_dieta") {
        return json({
          ok: true,
          peso: ctx.peso,
          peso_fonte: ctx.peso_fonte,
          peso_em: ctx.peso_em,
          altura: ctx.altura,
          data_avaliacao: ctx.data_avaliacao,
          avaliacao_fonte: ctx.avaliacao_fonte,
          avaliacao_id: ctx.avaliacao_id,
          dias_desde_avaliacao: ctx.dias_desde_avaliacao,
          avisos: readiness.avisos,
          dores: ctx.dores,
          lesoes: ctx.lesoes,
          desvios_posturais: ctx.desvios_posturais,
          questionario_em: ctx.questionario_em,
          questionario: formatQuestionario(ctx.questionario as Rec | null),
        });
      }


      // ---------- gerar_dieta ----------
      const intentRaw = body.intent == null ? "new" : String(body.intent).trim();
      if (!ALLOWED_GENERATION_INTENT.includes(intentRaw)) {
        return json({
          erro: "valor_invalido",
          campo: "intent",
          recebido: intentRaw,
          valores_aceitos: ALLOWED_GENERATION_INTENT,
        }, 400);
      }
      const intent = intentRaw;

      // `fase` é SEMPRE a semana do ciclo. A página DietaIA nem envia o campo
      // (fica no default 'semana_1'); dieta nova/regenerada nasce em semana_1.
      // Qualquer `fase` vinda no body é ignorada de propósito — objetivo NÃO vai aqui.
      const faseRaw = DEFAULT_PLAN_FASE;
      // Validação dos campos com CHECK constraint ANTES de gastar a geração.
      const preflight: Array<[string, string, string[]]> = [
        ["fase", faseRaw, ALLOWED_PLAN_FASE],
        ["cycle_status", "em_dia", ALLOWED_CYCLE_STATUS],
        ["strategy_source", "manual", ALLOWED_STRATEGY_SOURCE],
        ["tipo", "dieta", ALLOWED_PLAN_TIPO],
        ["draft_source", "jarvis", ALLOWED_DRAFT_SOURCE],
        ["migration_status", "completed", ALLOWED_MIGRATION_STATUS],
      ];

      for (const [campo, valor, aceitos] of preflight) {
        if (!aceitos.includes(valor)) {
          return json({ erro: "valor_invalido", campo, recebido: valor, valores_aceitos: aceitos }, 400);
        }
      }

      // Suplementação: mesmo mapeamento da página DietaIA —
      // toggle enableSuplementos → extras.suplementos = true + instrução
      // "INCLUIR SUPLEMENTAÇÃO COMPLETA" no prompt. Lista `suplementos` vira
      // observação explícita com dose/horário quando informados.
      const incluirSuplementacao = body.incluir_suplementacao === true;
      const suplementos = Array.isArray(body.suplementos)
        ? (body.suplementos as Rec[])
            .map((s) => ({
              nome: String(s?.nome ?? "").trim(),
              dose: s?.dose != null ? String(s.dose).trim() : "",
              horario: s?.horario != null ? String(s.horario).trim() : "",
            }))
            .filter((s) => s.nome.length > 0)
        : [];
      const observacoesParts: string[] = [];
      if (typeof body.observacoes === "string" && body.observacoes.trim()) {
        observacoesParts.push(body.observacoes.trim());
      }
      if (incluirSuplementacao) {
        observacoesParts.push(
          "- INCLUIR SUPLEMENTAÇÃO COMPLETA: Protocolo de suplementos com dosagem, horário e justificativa.",
        );
      }
      if (suplementos.length > 0) {
        const lista = suplementos
          .map((s) => [s.nome, s.dose, s.horario].filter(Boolean).join(" "))
          .join("; ");
        observacoesParts.push(
          `Suplementos escolhidos pelo professor: ${lista} — usar esses, com dose/horário quando informados, e completar o que faltar.`,
        );
      }
      const observacoesFinal = observacoesParts.length > 0 ? observacoesParts.join("\n") : null;

      const built = buildDietGenerationRequest(ctx, {
        objetivo: String(body.objetivo ?? ""),
        calorias_alvo: body.calorias_alvo as number | null,
        proteina_g: body.proteina_g as number | null,
        carbo_g: body.carbo_g as number | null,
        gordura_g: body.gordura_g as number | null,
        refeicoes: body.refeicoes as number | null,
        estrategia: (body.estrategia as "linear" | "carb_cycle" | null) ?? null,
        estilo: (body.estilo as string | null) ?? null,
        observacoes: observacoesFinal,
      });
      if (!built.ok) return json({ erro: built.erro, detalhes: built.detalhes }, 400);
      const req = built.request;

      // Mesmo motor da página DietaIA: diet-agent em mode "structured".
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      let agentStatus = 500;
      let agentBody: Rec = {};
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/diet-agent`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            mode: "structured",
            progressStream: false,
            messages: [{ role: "user", content: req.prompt }],
            studentContext: ctx,
            dietConfig: req.dietConfig,
            trainingContext: req.trainingContext,
            studentId,
            intent,
            regenerateIntent: intent === "regenerate",
            canonicalTargets: req.canonicalTargets,
            allowedUnresolvedFoods: [],
          }),
        });
        agentStatus = resp.status;
        agentBody = (await resp.json().catch(() => ({}))) as Rec;
      } catch (e) {
        clearTimeout(timer);
        const aborted = (e as Error)?.name === "AbortError";
        return json({ erro: aborted ? "geracao_timeout" : "geracao_falhou", error_code: aborted ? "timeout" : "fetch_error" }, 504);
      }
      clearTimeout(timer);

      if (agentStatus < 200 || agentStatus >= 300 || !agentBody?.plan) {
        return json({
          erro: "geracao_falhou",
          error_code: agentBody?.error_code ?? null,
          detalhes: agentBody?.error ?? agentBody?.details ?? null,
          validation: agentBody?.validationReasons ?? null,
        }, agentStatus >= 400 && agentStatus < 600 ? agentStatus : 502);
      }

      const rawPlan = agentBody.plan as Rec;
      rawPlan.targets = { ...(rawPlan.targets as Rec ?? {}), ...req.canonicalTargets };

      const catalog = await loadFoodCatalog(supabase);
      let finalPlan: Rec = rawPlan;
      const alertas: string[] = [];
      try {
        const hydrated = hydrateDietPlanFromFoods(rawPlan, catalog, "strict_id");
        finalPlan = hydrated.plan as Rec;
        if (hydrated.requiresResolution) {
          alertas.push(`${hydrated.unresolvedItems.length} alimento(s) não validado(s) — resolver no editor antes de publicar.`);
        }
      } catch (e) {
        alertas.push("Não foi possível rehidratar pela base: " + String((e as Error)?.message ?? e));
      }

      // Objetivo (cutting/bulking/...) e estratégia moram no plano (dietConfig),
      // como na página; em `ai_plans` a estratégia calórica vai em diet_strategy.
      finalPlan.dietConfig = { ...((finalPlan.dietConfig as Rec) ?? {}), ...req.dietConfig };


      const markdown = (() => {
        try { return canonicalDietPlanToMarkdown(finalPlan); } catch { return ""; }
      })();

      // Resumo do primeiro dia materializado (calculado ANTES da gravação,
      // para não perder o resultado se o insert falhar).
      const dias = Array.isArray(finalPlan.days) ? (finalPlan.days as Rec[]) : [];
      const dia0 = (dias[0] ?? {}) as Rec;
      const totals = (dia0.totals ?? {}) as Rec;
      const refeicoes = (Array.isArray(dia0.meals) ? (dia0.meals as Rec[]) : []).map((m) => ({
        nome: m.name ?? null,
        horario: m.time ?? null,
        itens: (Array.isArray(m.items) ? (m.items as Rec[]) : []).map((it) => ({
          alimento: it.name ?? null,
          quantidade_g: Number(it.qtyGrams) || 0,
        })),
      }));

      const alvo = req.canonicalTargets;
      const desvio = alvo.kcal > 0 ? Math.abs((Number(totals.kcal) || 0) - alvo.kcal) / alvo.kcal : 1;
      const confianca = Math.max(0, Math.min(100, Math.round(100 - desvio * 300 - alertas.length * 15)));
      const resumo = {
        kcal: Math.round(Number(totals.kcal) || 0),
        proteina_g: Math.round(Number(totals.p) || 0),
        carbo_g: Math.round(Number(totals.c) || 0),
        gordura_g: Math.round(Number(totals.g) || 0),
        refeicoes,
        alertas,
        confianca,
      };
      const dadosUsados = {
        peso: ctx.peso,
        altura: ctx.altura,
        data_avaliacao: ctx.data_avaliacao,
        objetivo: String(body.objetivo ?? ""),
      };

      const version = ctx.activePlan ? ctx.activePlan.version + 1 : 1;
      const { data: inserted, error: insertError } = await supabase
        .from("ai_plans")
        .insert({
          student_id: studentId,
          tipo: "dieta",
          titulo: `Dieta - ${new Date().toLocaleDateString("pt-BR")}`,
          conteudo: markdown,
          conteudo_json: finalPlan,
          // `fase` = fase do CICLO (semana_1..deload), igual à página DietaIA,
          // que nem informa o campo e deixa o default 'semana_1'.
          // O objetivo (cutting/bulking/...) vai em diet_strategy/conteudo_json.
          fase: faseRaw,
          diet_strategy: req.meta.strategy,
          strategy_source: "manual",
          generation_intent: intent,
          draft_source: "jarvis",
          draft_reason: observacoesFinal,
          // Mesmo lugar da página: protocols.extras.suplementos + coluna
          // ai_plans.supplementation com o que o plano estruturado trouxer.
          protocols: { extras: { suplementos: incluirSuplementacao } },
          supplementation: incluirSuplementacao
            ? ((finalPlan.supplementation as Rec | null) ?? null)
            : null,
          parent_plan_id: ctx.activePlan?.id ?? null,
          version,
          is_draft: true,
          cycle_status: "em_dia",
          migration_status: "completed",
        })
        .select("id")
        .single();
      if (insertError) {
        return json({
          ok: false,
          erro: "falha_ao_salvar",
          detalhes: insertError.message,
          draft_plan_id: null,
          resumo,
          plano: finalPlan,
          metas: alvo,
          dados_usados: dadosUsados,
        }, 500);
      }

      return json({
        ok: true,
        draft_plan_id: inserted?.id ?? null,
        resumo,
        metas: alvo,
        dados_usados: dadosUsados,

      });
    }

    if (operacao === "descartar_rascunho_dieta") {
      const draftId = String(body.draft_plan_id ?? "").trim();
      if (!draftId) return json({ erro: "draft_plan_id_obrigatorio" }, 400);
      const { data: draft, error: readError } = await supabase
        .from("ai_plans").select("id, is_draft, draft_source").eq("id", draftId).maybeSingle();
      if (readError) return json({ erro: readError.message }, 500);
      if (!draft) return json({ erro: "plano_nao_encontrado" }, 404);
      if (draft.is_draft !== true || draft.draft_source !== "jarvis") {
        return json({ erro: "rascunho_jarvis_obrigatorio" }, 400);
      }
      const { error: delError } = await supabase
        .from("ai_plans").delete().eq("id", draftId).eq("is_draft", true).eq("draft_source", "jarvis");
      if (delError) return json({ erro: delError.message }, 500);
      return json({ ok: true, descartado: draftId });
    }

    if (operacao === "publicar_rascunho_dieta") {
      const draftId = String(body.draft_plan_id ?? "").trim();
      const expectedRevision = Number(body.expected_revision);
      if (!draftId) return json({ erro: "draft_plan_id_obrigatorio" }, 400);
      if (!Number.isFinite(expectedRevision)) return json({ erro: "expected_revision_obrigatorio" }, 400);

      const { data: draft, error: draftError } = await supabase
        .from("ai_plans").select("*").eq("id", draftId).maybeSingle();
      if (draftError) return json({ erro: draftError.message }, 500);
      if (!draft) return json({ erro: "plano_nao_encontrado" }, 404);
      if (draft.tipo !== "dieta" || draft.is_draft !== true) return json({ erro: "rascunho_obrigatorio" }, 400);
      if (!isStructuredPlan(draft.conteudo_json)) return json({ erro: "dieta_estruturada_obrigatoria" }, 400);

      const draftRevision = Number(draft.content_revision ?? 1);
      if (draftRevision !== expectedRevision) {
        return json({ erro: "revisao_desatualizada", content_revision: draftRevision }, 409);
      }

      const catalog = await loadFoodCatalog(supabase);
      const hydrated = hydrateDietPlanFromFoods(
        JSON.parse(JSON.stringify(draft.conteudo_json)),
        catalog,
        "strict_id",
      );
      if (hydrated.requiresResolution) {
        return json({ erro: "alimentos_nao_resolvidos", itens: hydrated.unresolvedItems.slice(0, 20) }, 422);
      }
      const blockers = collectPublicationBlockers(hydrated.plan, catalog);
      if (blockers.length > 0) {
        return json({ erro: "alimentos_nao_resolvidos", itens: blockers.slice(0, 20) }, 422);
      }

      const { data: adminRole, error: adminError } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
      if (adminError) return json({ erro: adminError.message }, 500);
      const actorId = adminRole?.user_id ?? null;
      if (!actorId) return json({ erro: "admin_nao_encontrado" }, 500);

      const { plan: snapshotPlan } = buildPublishedSnapshotPlan(hydrated.plan, catalog);
      const schema = validatePublicationPlan(snapshotPlan);
      if (!schema.ok) return json({ erro: "plano_invalido", detalhes: schema.issues.slice(0, 20) }, 422);

      const finalProtocols = draft.protocols ?? null;
      const normalizedAdjustments =
        (finalProtocols as Rec | null)?.weekly_energy_schedule &&
        ((finalProtocols as Rec).weekly_energy_schedule as Rec)?.generated_adjustments
          ? ((finalProtocols as Rec).weekly_energy_schedule as Rec).generated_adjustments
          : null;

      const markdown = canonicalDietPlanToMarkdown(snapshotPlan);
      const assertions = collectFoodAssertions(snapshotPlan, catalog, normalizedAdjustments);
      const integrity = validateSnapshotAssertionIntegrity(snapshotPlan, assertions, normalizedAdjustments);
      if (!integrity.ok) return json({ erro: "plano_invalido", detalhes: integrity.issues.slice(0, 20) }, 422);

      // Histórico do plano ativo anterior antes de trocar.
      const { data: previous } = await supabase
        .from("ai_plans")
        .select("id, student_id, version, titulo, conteudo, fase")
        .eq("student_id", draft.student_id).eq("tipo", "dieta").eq("is_draft", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(1);
      const prev = previous?.[0] ?? null;
      if (prev) {
        await supabase.from("diet_plan_versions").insert({
          plan_id: prev.id,
          student_id: prev.student_id,
          version: Number(prev.version ?? 1),
          titulo: prev.titulo ?? "Dieta",
          conteudo: prev.conteudo ?? "",
          fase: prev.fase ?? null,
          source: "jarvis",
          archived_at: new Date().toISOString(),
        });
      }

      const { error: syncError } = await supabase
        .from("ai_plans")
        .update({ conteudo_json: hydrated.plan, conteudo: markdown, protocols: finalProtocols })
        .eq("id", draftId).eq("is_draft", true);
      if (syncError) return json({ erro: syncError.message }, 500);

      const { data: published, error: rpcError } = await supabase.rpc("publish_diet_plan_atomic_actor", {
        p_actor_id: actorId,
        p_plan_id: draftId,
        p_expected_revision: draftRevision,
        p_final_plan: snapshotPlan,
        p_final_markdown: markdown,
        p_final_protocols: finalProtocols,
        p_food_assertions: assertions,
      });
      if (rpcError) {
        const msg = String(rpcError.message ?? "");
        if (msg.includes("draft_changed_refresh_required")) {
          return json({ erro: "revisao_desatualizada", content_revision: draftRevision }, 409);
        }
        return json({ erro: "publicacao_falhou", detalhes: msg }, 500);
      }

      if (prev && prev.id !== draftId) {
        await supabase.from("ai_plans").update({ cycle_status: "renovado" }).eq("id", prev.id);
      }

      const publishedRow = (published ?? {}) as Rec;
      return json({
        ok: true,
        plan_id: publishedRow.id ?? draftId,
        version: publishedRow.version ?? null,
        content_revision: publishedRow.content_revision ?? draftRevision + 1,
        arquivado: prev?.id ?? null,
      });
    }

    // =================== TREINO (espelho das operações de dieta) ===================

    if (operacao === "checar_dados_treino" || operacao === "gerar_treino") {
      const studentId = String(body.student_id ?? "").trim();
      if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);

      const ctx = await loadTrainerStudentContext(supabase, studentId);
      const readiness = checkTrainerDataReadiness(ctx);
      if (!readiness.ok) {
        return json({
          erro: "dados_insuficientes",
          faltando: readiness.faltando,
          avisos: readiness.avisos,
          ultima_avaliacao: ctx.data_avaliacao,
          avaliacao_fonte: ctx.avaliacao_fonte,
          dias_desde_avaliacao: readiness.dias_desde_avaliacao,
        }, 422);
      }

      const ativo = ctx.activePlan;
      const treinoAtivo = ativo
        ? {
            plan_id: ativo.id,
            titulo: ativo.titulo,
            publicado_em: ativo.published_at ?? ativo.created_at,
            content_revision: ativo.content_revision ?? null,
            dias: Array.isArray((ativo.conteudo_json as Rec | null)?.days)
              ? ((ativo.conteudo_json as Rec).days as Rec[]).map((d) => d.day)
              : [],
            split: ((ativo.conteudo_json as Rec | null)?.metadata as Rec | undefined)?.goal ?? null,
          }
        : null;

      if (operacao === "checar_dados_treino") {
        return json({
          ok: true,
          peso: ctx.peso,
          peso_fonte: ctx.peso_fonte,
          peso_em: ctx.peso_em,
          altura: ctx.altura,
          data_avaliacao: ctx.data_avaliacao,
          avaliacao_fonte: ctx.avaliacao_fonte,
          avaliacao_id: ctx.avaliacao_id,
          dias_desde_avaliacao: readiness.dias_desde_avaliacao,
          avisos: readiness.avisos,
          nivel_sugerido: ctx.nivel_sugerido,
          lesoes: ctx.lesoes,
          restricoes: ctx.restricoes,
          dores: ctx.dores,
          desvios_posturais: ctx.desvios_posturais,
          treino_ativo: treinoAtivo,
          ultimo_questionario: formatQuestionario(ctx.questionario as Rec | null),
        });
      }


      // ---------- gerar_treino ----------
      const intentRaw = body.intent == null ? "new" : String(body.intent).trim();
      if (!ALLOWED_GENERATION_INTENT.includes(intentRaw)) {
        return json({
          erro: "valor_invalido",
          campo: "intent",
          recebido: intentRaw,
          valores_aceitos: ALLOWED_GENERATION_INTENT,
        }, 400);
      }

      const built = buildTrainerGenerationRequest(ctx, {
        nivel: String(body.nivel ?? ""),
        dias_semana: Number(body.dias_semana),
        split: String(body.split ?? ""),
        grupos_por_dia: (body.grupos_por_dia as TrainerGenerationInput["grupos_por_dia"]) ?? null,
        grupos_prioritarios: (body.grupos_prioritarios as string[]) ?? null,
        semana: Number(body.semana),
        equipamento: String(body.equipamento ?? ""),
        equipamentos_disponiveis: (body.equipamentos_disponiveis as string[]) ?? null,
        perfil_equipamento: (body.perfil_equipamento as string) ?? "mixed",
        restricoes_estruturadas:
          (body.restricoes_estruturadas as TrainerGenerationInput["restricoes_estruturadas"]) ?? null,
        saude: (body.saude as TrainerGenerationInput["saude"]) ?? null,
        referencia_treino: (body.referencia_treino as string) ?? null,
        observacoes: (body.observacoes as string) ?? null,
      });
      if (!built.ok) {
        return json({
          erro: built.erro,
          campo: built.campo ?? null,
          recebido: built.recebido ?? null,
          valores_aceitos: built.valores_aceitos ?? null,
        }, 400);
      }
      const reqTreino = built.request;

      // Preflight dos campos com CHECK constraint ANTES de gastar a geração.
      const preflightTreino: Array<[string, string, string[]]> = [
        ["fase", reqTreino.fase, ALLOWED_PLAN_FASE],
        ["cycle_status", "em_dia", ALLOWED_CYCLE_STATUS],
        ["tipo", "treino", ALLOWED_PLAN_TIPO],
        ["draft_source", "jarvis", ALLOWED_DRAFT_SOURCE],
        ["migration_status", "completed", ALLOWED_MIGRATION_STATUS],
        ["generation_intent", intentRaw, ALLOWED_GENERATION_INTENT],
      ];
      for (const [campo, valor, aceitos] of preflightTreino) {
        if (!aceitos.includes(valor)) {
          return json({ erro: "valor_invalido", campo, recebido: valor, valores_aceitos: aceitos }, 400);
        }
      }

      // Mesmo motor da página TreinoIA: trainer-agent com outputMode json.
      // Esse motor é lento (pode parecer travado perto do fim) — só o timeout
      // de 180s conta como falha.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      let agentStatus = 500;
      let agentBody: Rec = {};
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/trainer-agent`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            messages: [{ role: "user", content: reqTreino.prompt }],
            studentContext: reqTreino.studentContext,
            outputMode: "json",
            studentId,
            split_slug: reqTreino.split_slug,
            days_available: reqTreino.days_available,
            periodization: reqTreino.periodization,
            phase: reqTreino.phase,
            exercise_profile: reqTreino.exercise_profile,
            available_equipment: reqTreino.available_equipment,
          }),
        });
        agentStatus = resp.status;
        agentBody = (await resp.json().catch(() => ({}))) as Rec;
      } catch (e) {
        clearTimeout(timer);
        const aborted = (e as Error)?.name === "AbortError";
        return json({
          erro: aborted ? "geracao_timeout" : "geracao_falhou",
          error_code: aborted ? "timeout" : "fetch_error",
        }, 504);
      }
      clearTimeout(timer);

      if (agentStatus < 200 || agentStatus >= 300 || !agentBody?.json) {
        return json({
          erro: "geracao_falhou",
          error_code: agentBody?.error_code ?? null,
          detalhes: agentBody?.detail ?? agentBody?.error ?? null,
          validation: agentBody?.validationReasons ?? null,
        }, agentStatus >= 400 && agentStatus < 600 ? agentStatus : 502);
      }

      const planJsonTreino = agentBody.json as Rec;
      const markdownTreino = typeof agentBody.markdown === "string" ? agentBody.markdown : "";
      const titulo = `Treino - ${new Date().toLocaleDateString("pt-BR")}`;

      const resumo = summarizeWorkoutPlan(
        planJsonTreino,
        {
          volumeAudit: (agentBody.volumeAudit as Rec) ?? null,
          restrictionGate: (agentBody.restrictionGate as Rec) ?? null,
          exerciseProfileAudit: (agentBody.exerciseProfileAudit as Rec) ?? null,
          similarity: (agentBody.similarity as Rec) ?? null,
        },
        titulo,
        reqTreino.split_slug,
      );

      const dadosUsados = {
        peso: ctx.peso,
        altura: ctx.altura,
        data_avaliacao: ctx.data_avaliacao,
        objetivo: ctx.studentContext.objetivo ?? null,
        config: reqTreino.config,
        periodizacao: reqTreino.periodization.model,
        plano_anterior: ctx.activePlan?.id ?? null,
      };

      const versionTreino = ctx.activePlan ? Number(ctx.activePlan.version ?? 1) + 1 : 1;
      const { data: insertedTreino, error: insertTreinoError } = await supabase
        .from("ai_plans")
        .insert({
          student_id: studentId,
          tipo: "treino",
          titulo,
          conteudo: markdownTreino,
          conteudo_json: planJsonTreino,
          // `fase` = semana do ciclo (semana_1..deload), conforme a semana escolhida.
          fase: reqTreino.fase,
          fase_inicio_data: (ctx.activePlan?.fase_inicio_data as string) ??
            new Date().toISOString().slice(0, 10),
          generation_intent: intentRaw,
          draft_source: "jarvis",
          draft_reason: (body.observacoes as string) ?? null,
          parent_plan_id: ctx.activePlan?.id ?? null,
          version: versionTreino,
          is_draft: true,
          cycle_status: "em_dia",
          migration_status: "completed",
          ...reqTreino.periodizationColumns,
        })
        .select("id, content_revision")
        .single();

      if (insertTreinoError) {
        return json({
          ok: false,
          erro: "falha_ao_salvar",
          detalhes: insertTreinoError.message,
          draft_plan_id: null,
          resumo,
          plano: planJsonTreino,
          dados_usados: dadosUsados,
        }, 500);
      }

      return json({
        ok: true,
        draft_plan_id: insertedTreino?.id ?? null,
        content_revision: insertedTreino?.content_revision ?? 1,
        resumo,
        dados_usados: dadosUsados,
      });
    }

    if (operacao === "descartar_rascunho_treino") {
      const draftId = String(body.draft_plan_id ?? "").trim();
      if (!draftId) return json({ erro: "draft_plan_id_obrigatorio" }, 400);
      const { data: draft, error: readError } = await supabase
        .from("ai_plans").select("id, tipo, is_draft, draft_source").eq("id", draftId).maybeSingle();
      if (readError) return json({ erro: readError.message }, 500);
      if (!draft) return json({ erro: "plano_nao_encontrado" }, 404);
      if (draft.tipo !== "treino") return json({ erro: "plano_nao_e_treino" }, 400);
      if (draft.is_draft !== true || draft.draft_source !== "jarvis") {
        return json({ erro: "rascunho_jarvis_obrigatorio" }, 400);
      }
      const { error: delError } = await supabase
        .from("ai_plans").delete().eq("id", draftId).eq("is_draft", true).eq("draft_source", "jarvis");
      if (delError) return json({ erro: delError.message }, 500);
      return json({ ok: true, descartado: draftId });
    }

    if (operacao === "publicar_rascunho_treino") {
      const draftId = String(body.draft_plan_id ?? "").trim();
      const expectedRevision = Number(body.expected_revision);
      if (!draftId) return json({ erro: "draft_plan_id_obrigatorio" }, 400);
      if (!Number.isFinite(expectedRevision)) return json({ erro: "expected_revision_obrigatorio" }, 400);

      const { data: draft, error: draftError } = await supabase
        .from("ai_plans").select("*").eq("id", draftId).maybeSingle();
      if (draftError) return json({ erro: draftError.message }, 500);
      if (!draft) return json({ erro: "plano_nao_encontrado" }, 404);
      if (draft.tipo !== "treino" || draft.is_draft !== true) {
        return json({ erro: "rascunho_obrigatorio" }, 400);
      }
      const draftRevision = Number(draft.content_revision ?? 1);
      if (draftRevision !== expectedRevision) {
        return json({ erro: "revisao_desatualizada", content_revision: draftRevision }, 409);
      }
      const draftDays = Array.isArray((draft.conteudo_json as Rec | null)?.days)
        ? ((draft.conteudo_json as Rec).days as Rec[])
        : [];
      if (draftDays.length === 0) return json({ erro: "plano_sem_conteudo_json" }, 400);

      // Histórico do treino ativo anterior antes de trocar (mesma rotina do app).
      const { data: previousRows } = await supabase
        .from("ai_plans")
        .select("id, student_id, version, titulo, conteudo, fase, conteudo_json")
        .eq("student_id", draft.student_id).eq("tipo", "treino").eq("is_draft", false)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(1);
      const prev = (previousRows as Rec[] | null)?.[0] ?? null;

      if (prev && prev.id !== draftId) {
        const { error: versionError } = await supabase.from("workout_plan_versions").insert({
          plan_id: prev.id,
          student_id: prev.student_id,
          version_number: Number(prev.version ?? 1),
          status: "archived",
          generated_by: "jarvis",
          titulo: prev.titulo ?? "Treino",
          conteudo: prev.conteudo ?? "",
          fase: prev.fase ?? null,
          snapshot_json: prev.conteudo_json ?? {},
          reason_summary: "jarvis publicar_rascunho_treino: plano anterior arquivado",
          archived_at: new Date().toISOString(),
        });
        if (versionError) return json({ erro: versionError.message }, 500);
      }

      const { data: publishedTreino, error: publishError } = await supabase
        .from("ai_plans")
        .update({
          is_draft: false,
          draft_reason: null,
          published_at: new Date().toISOString(),
          cycle_status: "em_dia",
          content_revision: draftRevision + 1,
        })
        .eq("id", draftId).eq("is_draft", true).eq("content_revision", draftRevision)
        .select("id, version, content_revision")
        .maybeSingle();
      if (publishError) return json({ erro: publishError.message }, 500);
      if (!publishedTreino) {
        return json({ erro: "revisao_desatualizada", content_revision: draftRevision }, 409);
      }

      if (prev && prev.id !== draftId) {
        await supabase.from("ai_plans").update({ cycle_status: "renovado" }).eq("id", prev.id);
      }

      return json({
        ok: true,
        plan_id: publishedTreino.id,
        version: publishedTreino.version,
        content_revision: publishedTreino.content_revision,
        arquivado: prev?.id ?? null,
      });
    }

    return json({ erro: "operacao_desconhecida" }, 400);



  } catch (e) {
    console.error("[jarvis-bridge] falha:", String((e as Error)?.message ?? e));
    return json({ erro: "erro_interno" }, 500);
  }
});
