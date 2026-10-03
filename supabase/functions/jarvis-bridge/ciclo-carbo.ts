/**
 * Ciclo de carboidrato e histórico de peso para o Jarvis (operações ADITIVAS da ponte).
 *
 *   previa_ciclo_carbo  { student_id, fase?, estrategia_calorica?, nivel_atividade?,
 *                         frequencia_treino?, calorias_alvo?, proteina_g?, gordura_g?,
 *                         objetivo?, ciclo_carbo? }
 *       → meta base (mesma conta da geração), peso, treino por dia, sugestão
 *         LOW/MEDIUM/HIGH e as metas de cada dia. Não grava nada.
 *
 *   ajustar_ciclo_carbo { student_id, plan_id?, ciclo_carbo?, proteina_g?, gordura_g?,
 *                         calorias_base?, simular? }
 *       → numa dieta que JÁ tem ciclo (protocols.carb_cycling.enabled), recalcula
 *         protocols.carb_cycling + weekly_day_targets com o peso atual do aluno e
 *         grava (content_revision + 1). simular:true só devolve o antes/depois.
 *         Dieta linear → erro dieta_linear (ativar ciclo = gerar rascunho novo).
 *
 *   historico_peso      { student_id, dias? (padrão 180) }
 *       → pesos de weight_logs, check-ins de dieta, reajustes e avaliações,
 *         mais a dieta ativa (metas, fase, ciclo, publicada em).
 */
import {
  checkDietDataReadiness,
  loadDietStudentContext,
} from "../_shared/dietGenerationContext.ts";
import {
  calcularCiclo,
  configDoPedido,
  configSalva,
  mesclarConfig,
  resumoCiclo,
  sugerirDias,
  treinosDaSemana,
  weeklyDayTargets,
  WEEKDAYS,
  type Meta,
} from "./ciclo-carbo-calc.ts";
import { calcularBaseDieta, carregarTreinoAtivo } from "./geracao-completa.ts";

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

const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

async function carregarDieta(supabase: Db, studentId: string, planId: string | null) {
  let q = supabase
    .from("ai_plans")
    .select("id, student_id, is_draft, content_revision, protocols, conteudo_json, diet_strategy, published_at, created_at")
    .eq("student_id", studentId)
    .eq("tipo", "dieta");
  q = planId
    ? q.eq("id", planId)
    : q.eq("is_draft", false).order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as Rec | null;
}

export async function tratarCicloCarbo(
  operacao: string,
  body: Rec,
  supabase: Db,
): Promise<Response | null> {
  if (operacao === "previa_ciclo_carbo") {
    const studentId = String(body.student_id ?? "").trim();
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    const ctx = await loadDietStudentContext(supabase, studentId);
    const pronto = checkDietDataReadiness(ctx);
    if (!ctx.peso) return json({ erro: "dados_insuficientes", faltando: pronto.faltando }, 422);
    const calc = calcularBaseDieta(ctx, { objetivo: body.objetivo ?? body.fase ?? "cutting", ...body });
    if (!calc.ok) return json({ erro: calc.erro, detalhes: calc.detalhes ?? null }, 400);
    const b = calc.base;
    const treinos = treinosDaSemana(await carregarTreinoAtivo(supabase, studentId).catch(() => null));
    const sugestao = sugerirDias(treinos);
    const pedido = { ...((body.ciclo_carbo as Rec) ?? {}), dias_altos: body.dias_altos };
    const cfg = configDoPedido(pedido, sugestao);
    const ciclo = calcularCiclo(cfg, b.peso, { kcal: b.kcal, p: b.p, c: b.c, g: b.g });
    return json({
      ok: true,
      peso: b.peso,
      peso_fonte: ctx.peso_fonte,
      peso_em: ctx.peso_em,
      base: {
        kcal: b.kcal,
        p: b.p,
        c: b.c,
        g: b.g,
        tmb: b.bmr,
        get: b.tdee,
        fator_atividade: b.fator,
        estrategia: b.strategy,
        estrategia_pct: b.pct,
        formula: b.formula,
      },
      treinos,
      sugestao_dias: sugestao,
      ciclo: resumoCiclo(ciclo, b.peso),
    });
  }

  if (operacao === "ajustar_ciclo_carbo") {
    const studentId = String(body.student_id ?? "").trim();
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    const planId = String(body.plan_id ?? "").trim() || null;
    const plano = await carregarDieta(supabase, studentId, planId);
    if (!plano) return json({ erro: "plano_nao_encontrado" }, 404);
    const protocols = (plano.protocols ?? {}) as Rec;
    const atual = configSalva(protocols.carb_cycling);
    if (!atual) {
      return json({
        erro: "dieta_linear",
        mensagem:
          "Essa dieta não tem ciclo de carboidrato. Para ativar, gere um rascunho novo com o ciclo usando a dieta atual como modelo.",
        plan_id: plano.id,
      }, 409);
    }

    const ctx = await loadDietStudentContext(supabase, studentId);
    const peso = ctx.peso;
    if (!peso) return json({ erro: "sem_peso" }, 422);

    const weeklyAntes = (protocols.weekly_day_targets ?? {}) as Record<string, Rec>;
    const qualquer = WEEKDAYS.map((wd) => weeklyAntes[wd]).find(Boolean) ?? {};
    const schedule = (protocols.weekly_energy_schedule ?? {}) as Rec;
    const targets = ((plano.conteudo_json as Rec | null)?.targets ?? {}) as Rec;
    const base: Meta = {
      kcal: n(body.calorias_base) ?? n(schedule.base_daily_kcal) ?? n(targets.kcal) ?? 0,
      p: n(body.proteina_g) ?? n(qualquer.p) ?? n(targets.p) ?? 0,
      c: n(targets.c) ?? 0,
      g: n(body.gordura_g) ?? n(qualquer.g) ?? n(targets.g) ?? 0,
    };
    if (!base.p || !base.g) return json({ erro: "metas_base_incompletas", base }, 422);

    const cfg = mesclarConfig(atual, body.ciclo_carbo ?? {});
    const ciclo = calcularCiclo(cfg, peso, base);
    if (!ciclo.valido) return json({ erro: "ciclo_carbo_invalido", detalhes: ciclo.erros }, 400);

    const antes = WEEKDAYS.map((wd) => ({ dia: wd, ...(weeklyAntes[wd] ?? {}) }));
    const depois = weeklyDayTargets(ciclo.semana);
    const resposta = {
      plan_id: plano.id,
      is_draft: plano.is_draft === true,
      peso,
      peso_fonte: ctx.peso_fonte,
      peso_em: ctx.peso_em,
      base,
      antes,
      ciclo: resumoCiclo(ciclo, peso),
    };
    if (body.simular === true) return json({ ok: true, simulado: true, ...resposta });

    const revisao = Number(plano.content_revision ?? 0);
    const novoSchedule = schedule && typeof schedule === "object" && schedule.days
      ? {
          ...schedule,
          base_daily_kcal: base.kcal,
          days: Object.fromEntries(
            WEEKDAYS.map((wd) => {
              const d = ciclo.semana[wd]!;
              const velho = ((schedule.days as Rec)[wd] ?? {}) as Rec;
              return [wd, {
                ...velho,
                base_kcal: base.kcal,
                adjustment_kcal: 0,
                fixed_kcal: d.kcal,
                target_kcal: d.kcal,
                day_type: d.type,
                protein_g: d.p,
                carbs_g: d.c,
                fat_g: d.g,
              }];
            }),
          ),
        }
      : protocols.weekly_energy_schedule ?? null;
    const { data: atualizado, error } = await supabase
      .from("ai_plans")
      .update({
        protocols: {
          ...protocols,
          carb_cycling: JSON.parse(JSON.stringify(ciclo.config)),
          weekly_day_targets: depois,
          weekly_energy_schedule: novoSchedule,
        },
        content_revision: revisao + 1,
      })
      .eq("id", plano.id)
      .eq("content_revision", revisao)
      .select("content_revision")
      .maybeSingle();
    if (error) return json({ erro: error.message }, 500);
    if (!atualizado) return json({ erro: "revisao_desatualizada", content_revision: revisao }, 409);
    return json({ ok: true, gravado: true, content_revision: atualizado.content_revision, ...resposta });
  }

  if (operacao === "historico_peso") {
    const studentId = String(body.student_id ?? "").trim();
    if (!studentId) return json({ erro: "student_id_obrigatorio" }, 400);
    const dias = Math.min(Math.max(Number(body.dias ?? 180) || 180, 14), 730);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const [logs, checkins, reajustes, avaliacoes, dieta] = await Promise.all([
      supabase.from("weight_logs").select("peso, data, observacao").eq("student_id", studentId)
        .gte("data", desde.slice(0, 10)).order("data", { ascending: true }),
      supabase.from("diet_checkins")
        .select("peso_kg, cintura_cm, completed_at, fome, energia, adesao, sono, performance, retencao, decision_action, decision_rationale")
        .eq("student_id", studentId).not("completed_at", "is", null).gte("completed_at", desde)
        .order("completed_at", { ascending: true }),
      supabase.from("diet_readjustments")
        .select("peso_atual, perdeu_peso, ganhou_massa, fome_excessiva, energia_ok, rendimento_treino, created_at")
        .eq("student_id", studentId).gte("created_at", desde).order("created_at", { ascending: true }),
      supabase.from("assessments").select("id, created_at").eq("student_id", studentId)
        .gte("created_at", desde).order("created_at", { ascending: true }),
      carregarDieta(supabase, studentId, null).catch(() => null),
    ]);

    const idsAval = ((avaliacoes.data ?? []) as Rec[]).map((a) => a.id);
    let antropo: Rec[] = [];
    if (idsAval.length > 0) {
      const { data } = await supabase.from("anthropometrics").select("assessment_id, peso, cintura").in("assessment_id", idsAval);
      antropo = (data ?? []) as Rec[];
    }
    const dataAval = new Map(((avaliacoes.data ?? []) as Rec[]).map((a) => [a.id, a.created_at]));

    const registros: Rec[] = [];
    for (const r of (logs.data ?? []) as Rec[]) {
      if (n(r.peso)) registros.push({ data: String(r.data).slice(0, 10), peso: Number(r.peso), fonte: "registro", obs: r.observacao ?? null });
    }
    for (const r of (checkins.data ?? []) as Rec[]) {
      if (n(r.peso_kg)) {
        registros.push({ data: String(r.completed_at).slice(0, 10), peso: Number(r.peso_kg), fonte: "checkin", cintura: r.cintura_cm ?? null });
      }
    }
    for (const r of (reajustes.data ?? []) as Rec[]) {
      if (n(r.peso_atual)) registros.push({ data: String(r.created_at).slice(0, 10), peso: Number(r.peso_atual), fonte: "reajuste" });
    }
    for (const r of antropo) {
      if (n(r.peso)) {
        registros.push({ data: String(dataAval.get(r.assessment_id) ?? "").slice(0, 10), peso: Number(r.peso), fonte: "avaliacao", cintura: r.cintura ?? null });
      }
    }
    registros.sort((a, b) => String(a.data).localeCompare(String(b.data)));

    let dietaAtiva: Rec | null = null;
    if (dieta) {
      const p = (dieta.protocols ?? {}) as Rec;
      const cj = (dieta.conteudo_json ?? {}) as Rec;
      dietaAtiva = {
        plan_id: dieta.id,
        publicada_em: dieta.published_at ?? dieta.created_at,
        fase: ((cj.dietConfig ?? {}) as Rec).objective ?? null,
        estrategia: dieta.diet_strategy ?? ((cj.dietConfig ?? {}) as Rec).strategy ?? null,
        metas: cj.targets ?? null,
        ciclo_carbo: configSalva(p.carb_cycling),
        metas_por_dia: p.weekly_day_targets ?? null,
      };
    }

    return json({
      ok: true,
      student_id: studentId,
      periodo_dias: dias,
      registros,
      checkins: ((checkins.data ?? []) as Rec[]).map((c) => ({
        data: String(c.completed_at).slice(0, 10),
        peso: c.peso_kg ?? null,
        cintura: c.cintura_cm ?? null,
        fome: c.fome ?? null,
        energia: c.energia ?? null,
        adesao: c.adesao ?? null,
        sono: c.sono ?? null,
        performance: c.performance ?? null,
        retencao: c.retencao ?? null,
        decisao: c.decision_action ?? null,
      })),
      reajustes: ((reajustes.data ?? []) as Rec[]).map((r) => ({
        data: String(r.created_at).slice(0, 10),
        peso: r.peso_atual ?? null,
        perdeu_peso: r.perdeu_peso ?? null,
        ganhou_massa: r.ganhou_massa ?? null,
        fome_excessiva: r.fome_excessiva ?? null,
        energia_ok: r.energia_ok ?? null,
        rendimento_treino: r.rendimento_treino ?? null,
      })),
      dieta_ativa: dietaAtiva,
    });
  }

  return null;
}
