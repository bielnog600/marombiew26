// office-gerar — escritório de IA: perguntas / gerar / ajustar / analisar / status / publicar / descartar.
// Usa o MESMO código do admin (bundle gerado de src/lib/officeWizard) e os
// MESMOS agentes (trainer-agent / cardio-agent / diet-agent). Rascunhos ficam em
// office_plan_drafts (dieta também em ai_plans com is_draft=true, como o
// "Salvar rascunho" do admin); nada chega ao aluno antes de `publicar`.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import * as core from '../_shared/generated/officeCore.js'
import { safeEqual, resolveStudent } from './lib.ts'
import { analisar, loadVigente, runAjusteTreino, runAjusteDieta, runAjusteCardio, publicarAjusteTreino } from './ajustar.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const Tipo = z.enum(['treino', 'dieta', 'cardio'])
const Body = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('perguntas'), tipo: Tipo, aluno: z.string().min(1).max(200) }),
  z.object({
    acao: z.literal('gerar'), tipo: Tipo, aluno: z.string().min(1).max(200),
    respostas: z.record(z.unknown()).default({}), instrucoes: z.string().max(5000).optional().nullable(),
  }),
  z.object({
    acao: z.literal('ajustar'), tipo: Tipo, aluno: z.string().min(1).max(200),
    categoria: z.string().min(1).max(40), pedido: z.string().trim().min(1).max(5000),
  }),
  z.object({ acao: z.literal('analisar'), tipo: z.literal('treino'), aluno: z.string().min(1).max(200) }),
  z.object({ acao: z.literal('status'), id: z.string().uuid() }),
  z.object({ acao: z.literal('publicar'), tipo: Tipo, id: z.string().uuid() }),
  z.object({ acao: z.literal('descartar'), tipo: Tipo, id: z.string().uuid() }),
])

const WAIT_MS = 110_000

// deno-lint-ignore no-explicit-any
type Sb = any

const agentUrl = (name: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`
async function callAgent(name: string, body: unknown) {
  const resp = await fetch(agentUrl(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => null)
  return { ok: resp.ok, status: resp.status, data }
}

// ─── Dieta ──────────────────────────────────────────────────────────

const CURRENT_DIET_COLS = 'id, titulo, conteudo_json, protocols, diet_strategy, fase, created_at, published_at'
const loadCurrentDiet = (sb: Sb, studentId: string) =>
  sb.from('ai_plans').select(CURRENT_DIET_COLS).eq('student_id', studentId).eq('tipo', 'dieta').eq('is_draft', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

/** Motivos (em PT-BR) que impedem gerar — os mesmos bloqueios do botão Gerar da tela. */
function dietBlockers(d: any): string[] {
  const out: string[] = [...d.baseKcalIssues]
  if (d.macroResolution.status !== 'ok') out.push(`Macros não fecham com a meta (${d.macroResolution.status}).`)
  if (!d.carbCyclingValidity.valid) out.push(d.carbCyclingValidity.reason ?? 'Carb cycling inválido.')
  if (d.weeklySchedule) out.push(...d.scheduleIssues)
  return Array.from(new Set(out))
}

function metaPrevia(d: any) {
  return {
    kcal: d.baseKcal.base_daily_kcal, p: d.canonicalTargets.p, c: d.canonicalTargets.c, g: d.canonicalTargets.g,
    origem: d.baseKcal.source, formula: d.baseKcal.calculation.formula ?? null, tmb: d.baseKcal.calculation.bmr,
    get: d.baseKcal.calculation.tdee, fator_atividade: d.baseKcal.calculation.activity_factor,
    ...(d.carbCycling.enabled ? { carb_cycling_por_dia: d.weeklyCarbTargets } : {}),
  }
}

async function loadDietInputs(sb: Sb, studentId: string) {
  const [data, md] = await Promise.all([core.loadDietaStudentData(sb, studentId), core.loadActiveTrainingMarkdown(sb, studentId)])
  return { ...data, trainingMarkdown: md, workoutByWeekday: md ? core.parseWeekdayWorkouts(md) : {} }
}

async function perguntasDieta(sb: Sb, studentId: string) {
  const [inp, cur] = await Promise.all([loadDietInputs(sb, studentId), loadCurrentDiet(sb, studentId)])
  const fields = core.dietaFields()
  const sug = core.suggestDietaValues(fields, { prefill: inp.prefill, latestQuestionnaire: inp.latestQuestionnaire, currentDiet: cur.data, ctx: inp.ctx })
  // Prévia da meta com os valores atuais (mesmo cálculo da tela; nada é gerado).
  const answers: Record<string, unknown> = {}
  for (const f of fields) if (sug[f.id]?.valor_atual != null) answers[f.id] = sug[f.id].valor_atual
  const v = core.validateDietaAnswers(answers, null)
  let previa: unknown = { disponivel: false, motivo: 'responda os campos obrigatórios para calcular a meta' }
  if (v.ok) {
    const d = core.deriveDietaWizard(v.state, inp.ctx, inp.workoutByWeekday)
    previa = d.canGenerate ? { disponivel: true, ...metaPrevia(d) } : { disponivel: false, motivos: dietBlockers(d) }
  }
  return {
    campos: fields.map((f: any) => ({ ...core.publicField(f), ...sug[f.id] })),
    resumo_atual: core.resumoDietaAtual(cur.data),
    meta_previa_com_valores_atuais: previa,
    dados_corporais: { peso: inp.ctx?.peso ?? null, altura: inp.ctx?.altura ?? null, percentual_gordura: inp.ctx?.percentual_gordura ?? null, massa_magra: inp.ctx?.massa_magra ?? null, sexo: inp.ctx?.sexo ?? null },
  }
}

async function runDieta(sb: Sb, draftId: string, studentId: string, state: any) {
  const inp = await loadDietInputs(sb, studentId)
  const d = core.deriveDietaWizard(state, inp.ctx, inp.workoutByWeekday)
  if (!d.canGenerate || !d.weeklySchedule) throw Object.assign(new Error('Meta da dieta inválida'), { detail: { motivos: dietBlockers(d) } })
  const g = core.buildDietGenerationPrompts({
    state, studentCtx: inp.ctx, baseKcal: d.baseKcal, macroConfig: d.macroConfig, macroResolution: d.macroResolution,
    macroBody: d.macroBody, canonicalTargets: d.canonicalTargets, carbCycling: d.carbCycling,
    weeklyCarbTargets: d.weeklyCarbTargets, weeklySchedule: d.weeklySchedule,
  })
  const foods = await core.loadDietFoodRecords(sb)
  const hints = core.buildDietFoodHints(state.modelDiet, core.dietPreferencesText(state), foods)
  const intent = 'new'
  const body = core.buildDietAgentBody({
    userPrompt: g.structuredPrompt, foodAliasBlock: hints.foodAliasBlock, studentCtx: inp.ctx, dietConfig: g.dietConfig,
    trainingContext: core.buildDietTrainingContext(inp.trainingMarkdown, state.trainingTime), studentId,
    variationIntensity: state.variationIntensity, intent, modelDiet: state.modelDiet, targets: g.targets,
    allowedUnresolvedFoods: hints.allowedUnresolvedFoods,
  })
  await sb.from('office_plan_drafts').update({ request_payload: { agent: 'diet-agent', body, meta: metaPrevia(d), alimentos_sem_cadastro: hints.unmatchedModel } }).eq('id', draftId)

  const resp = await fetch(agentUrl('diet-agent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  // Erro antes do stream (JSON) ou evento `result` do SSE — igual à tela.
  const final = resp.ok && !(resp.headers.get('content-type') ?? '').includes('application/json')
    ? core.parseDietAgentSse(text)
    : { status: resp.status, body: text }
  const data = (() => { try { return JSON.parse(final.body) } catch { return null } })()
  if (final.status < 200 || final.status >= 300 || !data) {
    throw Object.assign(new Error(data?.error || 'diet-agent falhou'), {
      detail: {
        status: final.status, error_code: data?.error_code ?? null, details: data?.details ?? null,
        validationReasons: data?.validationReasons ?? null, missing_days: data?.missing_days ?? null,
        dayTargetIssues: data?.dayTargetIssues ?? null,
        ...(data ? {} : { message: 'A conexão com a IA foi interrompida antes da resposta final.' }),
      },
    })
  }
  let dailyAdjustments: any = null
  let warnings: string[] = []
  const adjRaw = data?.dailyAdjustments ?? null
  if (g.dietConfig?.weeklyEnergySchedule && adjRaw && typeof adjRaw === 'object') {
    const r = core.processDietDailyAdjustments(adjRaw, d.weeklySchedule)
    dailyAdjustments = r.adjustments
    warnings = r.warnings
  }
  const fin = core.finalizeDietAgentPlan(data?.plan, g.targets)
  if (!fin.plan) throw Object.assign(new Error('Resposta da IA fora do formato esperado.'), { detail: { error_code: fin.errorCode ?? 'schema_rejected', issues: fin.issues ?? null } })
  const plan = fin.plan
  const assessment = core.assessGeneratedDiet({
    plan, foods, carbCyclingEnabled: d.carbCycling.enabled,
    target: { calories: g.currentTargets.calories, protein: g.currentTargets.protein, carbs: g.currentTargets.carbs, fats: g.currentTargets.fats },
    weeklyCarbTargets: d.weeklyCarbTargets, questionnaire: inp.ctx?.questionario_dieta ?? null,
    adherencePct: inp.ctx?.historico_processo?.aderencia_recente?.percentual_aderencia ?? null,
    mealCount: Number(state.mealCount) || 0,
  })
  const protocols = core.buildDietProtocols({
    selectedAdjustments: state.selectedAdjustments, enableFitoterapia: state.enableFitoterapia,
    enableSuplementos: state.enableSuplementos, enableEmagrecimentoRapido: state.enableEmagrecimentoRapido,
    enableJejumIntermitente: state.enableJejumIntermitente, weeklySchedule: d.weeklySchedule, dailyAdjustments,
    carbCycling: d.carbCycling, weeklyCarbTargets: d.weeklyCarbTargets,
  })
  const insert = core.buildDietDraftInsert({
    studentId, markdown: core.dietPlanToMarkdown(plan), protocols, plan, strategy: state.strategy, intent,
    viability: assessment.viability ? { score: assessment.viability.score, breakdown: assessment.viability.breakdown } : null,
  })
  const ins = await sb.from('ai_plans').insert(insert).select('id').single()
  if (ins.error) throw ins.error
  return {
    ai_plan_id: ins.data.id,
    result_payload: { ai_plan_id: ins.data.id, similarity: data?.similarity ?? null, assessment, warnings },
    resumo_legivel: core.resumoDietaCompleto(plan, assessment, warnings),
  }
}

/** Publica o rascunho pela MESMA função do botão Publicar do admin (publish-diet-plan). */
async function publishDietDraft(aiPlanId: string) {
  const resp = await fetch(agentUrl('publish-diet-plan'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      'x-office-token': Deno.env.get('OFFICE_FEED_TOKEN') ?? '',
    },
    body: JSON.stringify({ planId: aiPlanId }),
  })
  const data = await resp.json().catch(() => null)
  return { ok: resp.ok && data?.ok === true, status: resp.status, data }
}

async function perguntas(sb: Sb, tipo: string, studentId: string) {
  if (tipo === 'dieta') return await perguntasDieta(sb, studentId)
  if (tipo === 'treino') {
    const [{ health }, last] = await Promise.all([
      core.loadTreinoWizardData(sb, studentId),
      sb.from('ai_plans').select('id, titulo, conteudo_json, fase, periodization_model, mobility_count, main_exercises_count, created_at')
        .eq('student_id', studentId).eq('tipo', 'treino').eq('is_draft', false)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const fields = core.treinoFields()
    const sug = core.suggestTreinoValues(fields, { lastPlan: last.data, health })
    return { campos: fields.map((f: any) => ({ ...core.publicField(f), ...sug[f.id] })), resumo_atual: core.resumoTreinoAtual(last.data) }
  }
  const last = await sb.from('ai_plans').select('id, titulo, conteudo, created_at')
    .eq('student_id', studentId).eq('tipo', 'cardio').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const fields = core.cardioFields()
  const sug = core.suggestCardioValues(fields, last.data)
  return { campos: fields.map((f: any) => ({ ...core.publicField(f), ...sug[f.id] })), resumo_atual: core.resumoCardioAtual(last.data) }
}

async function runTreino(sb: Sb, draftId: string, studentId: string, state: any) {
  const { ctx, lastWorkoutPlan } = await core.loadTreinoWizardData(sb, studentId)
  const { snapshot, body } = core.buildTreinoGenerationRequest({ state, studentCtx: ctx, studentId, lastWorkoutPlan })
  await sb.from('office_plan_drafts').update({ request_payload: { agent: 'trainer-agent', body, snapshot, last_plan_id: lastWorkoutPlan?.id ?? null } }).eq('id', draftId)
  const r = await callAgent('trainer-agent', body)
  if (!r.ok) throw Object.assign(new Error('trainer-agent falhou'), { detail: { status: r.status, ...(r.data ?? {}) } })
  const plan = core.normalizeWorkoutPlan(r.data?.json)
  if (!plan || typeof r.data?.markdown !== 'string' || !r.data.markdown) throw new Error('Resposta da IA inválida (sem JSON estruturado).')
  return {
    result_payload: { json: plan, similarity: r.data.similarity ?? null, volumeAudit: r.data.volumeAudit ?? null, restrictionGate: r.data.restrictionGate ?? null, exerciseProfileAudit: r.data.exerciseProfileAudit ?? null },
    resumo_legivel: core.resumoTreinoCompleto(plan),
  }
}

async function runCardio(sb: Sb, draftId: string, studentId: string, state: any) {
  const { studentCtx, hrZones } = await core.loadCardioWizardData(sb, studentId)
  const body = core.buildCardioRequestBody(state, studentCtx, hrZones)
  await sb.from('office_plan_drafts').update({ request_payload: { agent: 'cardio-agent', body } }).eq('id', draftId)
  const r = await callAgent('cardio-agent', body)
  if (!r.ok) throw Object.assign(new Error('cardio-agent falhou'), { detail: { status: r.status, ...(r.data ?? {}) } })
  const payload = r.data?.weekly ?? r.data?.protocol ?? null
  if (!payload) throw new Error('Plano não retornado')
  return { result_payload: { payload }, resumo_legivel: core.resumoCardioCompleto(payload) }
}

async function gerar(sb: Sb, tipo: string, studentId: string, respostas: Record<string, unknown>, instrucoes: string | null | undefined) {
  const v = tipo === 'treino' ? core.validateTreinoAnswers(respostas, instrucoes)
    : tipo === 'dieta' ? core.validateDietaAnswers(respostas, instrucoes)
    : core.validateCardioAnswers(respostas, instrucoes)
  if (!v.ok) return json({ error: 'respostas_invalidas', faltando: v.faltando, invalidos: v.invalidos }, 422)
  if (tipo === 'treino' && !core.canGenerateTreino(v.state)) return json({ error: 'respostas_invalidas', faltando: [], invalidos: [] }, 422)
  if (tipo === 'dieta') {
    // Mesmo bloqueio do botão Gerar: sem meta calórica/macros válidos não chama a IA.
    const inp = await loadDietInputs(sb, studentId)
    const d = core.deriveDietaWizard(v.state, inp.ctx, inp.workoutByWeekday)
    if (!d.canGenerate) return json({ error: 'meta_invalida', faltando: [], invalidos: [], motivos: dietBlockers(d) }, 422)
  }

  const { data: draft, error } = await sb.from('office_plan_drafts')
    .insert({ student_id: studentId, tipo, status: 'gerando', respostas, instrucoes: instrucoes ?? null })
    .select('id').single()
  if (error) throw error
  return await runInBackground(sb, draft.id, () =>
    tipo === 'treino' ? runTreino(sb, draft.id, studentId, v.state)
      : tipo === 'dieta' ? runDieta(sb, draft.id, studentId, v.state)
      : runCardio(sb, draft.id, studentId, v.state))
}

/** Roda a geração/ajuste em segundo plano; responde em até ~110 s (senão status "gerando"). */
async function runInBackground(sb: Sb, draftId: string, fn: () => Promise<Record<string, unknown>>) {
  const task = (async () => {
    try {
      const out = await fn()
      await sb.from('office_plan_drafts').update({ status: 'pronto', ...out, error: null }).eq('id', draftId)
    } catch (e) {
      console.error('[office-gerar] generation_failed', draftId, e)
      await sb.from('office_plan_drafts').update({ status: 'erro', error: { message: (e as Error).message, detail: (e as any)?.detail ?? null } }).eq('id', draftId)
    }
  })()
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(task)
  await Promise.race([task, new Promise((r) => setTimeout(r, WAIT_MS))])
  return json(await statusOf(sb, draftId))
}

async function ajustar(sb: Sb, tipo: 'treino' | 'dieta' | 'cardio', studentId: string, categoria: string, pedido: string) {
  if (!core.categoriaValida(tipo, categoria)) {
    return json({ error: 'categoria_invalida', categorias_validas: core.AJUSTE_CATEGORIAS[tipo] }, 422)
  }
  const { data: cur } = await loadVigente(sb, studentId, tipo)
  if (!cur) return json({ error: 'sem_plano_vigente', detalhe: `O aluno não tem ${tipo} publicado para ajustar.` }, 404)
  const { data: draft, error } = await sb.from('office_plan_drafts')
    .insert({
      student_id: studentId, tipo, status: 'gerando', respostas: {}, instrucoes: pedido,
      request_payload: { modo: 'ajuste', categoria, pedido, base_plan_id: cur.id },
    })
    .select('id').single()
  if (error) throw error
  return await runInBackground(sb, draft.id, () =>
    tipo === 'treino' ? runAjusteTreino(sb, cur, categoria, pedido)
      : tipo === 'dieta' ? runAjusteDieta(sb, studentId, cur, categoria, pedido)
      : runAjusteCardio(cur, categoria, pedido))
}

async function statusOf(sb: Sb, id: string) {
  const { data } = await sb.from('office_plan_drafts').select('id, tipo, student_id, status, resumo_legivel, error, published_plan_id, created_at, updated_at').eq('id', id).maybeSingle()
  if (!data) return { id, status: 'nao_encontrado' }
  return {
    id: data.id, tipo: data.tipo, aluno_id: data.student_id, status: data.status,
    ...(data.status === 'pronto' || data.status === 'publicado' ? { resumo_legivel: data.resumo_legivel } : {}),
    ...(data.status === 'erro' ? { erro: data.error } : {}),
    ...(data.published_plan_id ? { plano_publicado_id: data.published_plan_id } : {}),
  }
}

async function publicar(sb: Sb, tipo: string, id: string) {
  const { data: d } = await sb.from('office_plan_drafts').select('*').eq('id', id).maybeSingle()
  if (!d || d.tipo !== tipo) return json({ error: 'rascunho_nao_encontrado' }, 404)
  if (d.status === 'publicado') return json({ id, status: 'publicado', plano_publicado_id: d.published_plan_id })
  if (d.status !== 'pronto') return json({ error: 'rascunho_nao_pronto', status: d.status }, 409)
  if (tipo === 'dieta') return await publicarDieta(sb, d)
  // Trava otimista: só um publicar passa (evita duplicar em chamadas repetidas).
  const { data: lock } = await sb.from('office_plan_drafts').update({ status: 'gerando' }).eq('id', id).eq('status', 'pronto').select('id')
  if (!lock?.length) return json({ error: 'publicacao_em_andamento' }, 409)
  try {
    let planId: string
    if (tipo === 'treino' && d.result_payload?.modo === 'ajuste') {
      const r = await publicarAjusteTreino(sb, d)
      if ('conflict' in r) {
        await sb.from('office_plan_drafts').update({ status: 'pronto' }).eq('id', id)
        return json({ error: 'plano_vigente_mudou', detalhe: r.conflict }, 409)
      }
      planId = r.planId
    } else if (tipo === 'treino') {
      const req = d.request_payload ?? {}
      const built = core.buildWorkoutPlanInsertPayload(d.student_id, d.result_payload.json, {
        titulo: `Treino - ${new Date().toLocaleDateString('pt-BR')}`,
        cycle_status: 'em_dia',
        periodization: req.snapshot ? core.snapshotToPlanColumns(req.snapshot, null) : null,
      })
      if (built.success !== true) throw new Error('Erro ao salvar: ' + built.error)
      const ins = await sb.from('ai_plans').insert(built.payload).select('id').single()
      if (ins.error) throw ins.error
      planId = ins.data.id
      if (req.last_plan_id) await sb.from('ai_plans').update({ cycle_status: 'renovado' }).eq('id', req.last_plan_id)
    } else {
      const ins = await sb.from('ai_plans').insert(core.buildCardioPlanInsert(d.student_id, d.result_payload.payload)).select('id').single()
      if (ins.error) throw ins.error
      planId = ins.data.id
    }
    await sb.from('office_plan_drafts').update({ status: 'publicado', published_plan_id: planId, published_at: new Date().toISOString() }).eq('id', id)
    return json({ id, status: 'publicado', plano_publicado_id: planId })
  } catch (e) {
    await sb.from('office_plan_drafts').update({ status: 'pronto' }).eq('id', id)
    return json({ error: 'falha_ao_publicar', detalhe: (e as Error).message }, 500)
  }
}

async function publicarDieta(sb: Sb, d: any) {
  const id = d.id
  const aiPlanId = d.ai_plan_id ?? d.result_payload?.ai_plan_id
  if (!aiPlanId) return json({ error: 'rascunho_sem_dieta' }, 409)
  const { data: row } = await sb.from('ai_plans').select('id, is_draft').eq('id', aiPlanId).maybeSingle()
  if (!row) return json({ error: 'rascunho_nao_encontrado', detalhe: 'O rascunho da dieta foi apagado no admin.' }, 404)
  const markPublished = () => sb.from('office_plan_drafts')
    .update({ status: 'publicado', published_plan_id: aiPlanId, published_at: new Date().toISOString() }).eq('id', id)
  if (row.is_draft === false) {
    // Já publicado pelo admin: só sincroniza o status.
    await markPublished()
    return json({ id, status: 'publicado', plano_publicado_id: aiPlanId })
  }
  const { data: lock } = await sb.from('office_plan_drafts').update({ status: 'gerando' }).eq('id', id).eq('status', 'pronto').select('id')
  if (!lock?.length) return json({ error: 'publicacao_em_andamento' }, 409)
  const r = await publishDietDraft(aiPlanId)
  if (!r.ok) {
    await sb.from('office_plan_drafts').update({ status: 'pronto' }).eq('id', id)
    return json({ error: 'publicacao_bloqueada', error_code: r.data?.error_code ?? 'publication_failed', detalhes: r.data?.details ?? null, status_publicacao: r.status }, r.status >= 400 && r.status < 500 ? 422 : 502)
  }
  await markPublished()
  return json({ id, status: 'publicado', plano_publicado_id: aiPlanId })
}

async function descartar(sb: Sb, tipo: string, id: string) {
  const { data: d } = await sb.from('office_plan_drafts').select('id, tipo, status, ai_plan_id').eq('id', id).maybeSingle()
  if (!d || d.tipo !== tipo) return json({ error: 'rascunho_nao_encontrado' }, 404)
  if (d.status === 'publicado') return json({ error: 'ja_publicado' }, 409)
  if (tipo === 'dieta' && d.ai_plan_id) {
    const { data: row } = await sb.from('ai_plans').select('id, is_draft').eq('id', d.ai_plan_id).maybeSingle()
    if (row && row.is_draft === false) return json({ error: 'ja_publicado', detalhe: 'Esta dieta já foi publicada pelo admin.' }, 409)
    if (row) {
      const del = await sb.from('ai_plans').delete().eq('id', d.ai_plan_id).eq('tipo', 'dieta').eq('is_draft', true)
      if (del.error) throw del.error
    }
  }
  const { error } = await sb.from('office_plan_drafts').delete().eq('id', id).neq('status', 'publicado')
  if (error) throw error
  return json({ id, status: 'descartado' })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('OFFICE_FEED_TOKEN')
  const token = req.headers.get('x-office-token') ?? ''
  if (!secret || !token || !safeEqual(token, secret)) return json({ error: 'Unauthorized' }, 401)

  const raw = await req.json().catch(() => null)
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return json({ error: 'entrada_invalida', detalhes: parsed.error.flatten() }, 400)
  const b = parsed.data

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    if (b.acao === 'status') return json(await statusOf(sb, b.id))
    if (b.acao === 'publicar') return await publicar(sb, b.tipo, b.id)
    if (b.acao === 'descartar') return await descartar(sb, b.tipo, b.id)

    const who = await resolveStudent(sb, b.aluno)
    if (who.kind === 'none') return json({ error: 'aluno_nao_encontrado' }, 404)
    if (who.kind === 'many') return json({ error: 'aluno_ambiguo', candidatos: who.candidates }, 409)
    if (b.acao === 'analisar') {
      const a = await analisar(sb, who.student.id)
      if (!a) return json({ error: 'sem_plano_vigente', detalhe: 'O aluno não tem treino publicado com JSON estruturado.' }, 404)
      return json({ tipo: 'treino', aluno: who.student, ...a })
    }
    if (b.acao === 'ajustar') return await ajustar(sb, b.tipo, who.student.id, b.categoria, b.pedido)
    if (b.acao === 'perguntas') return json({ tipo: b.tipo, aluno: who.student, ...(await perguntas(sb, b.tipo, who.student.id)) })
    return await gerar(sb, b.tipo, who.student.id, b.respostas, b.instrucoes)
  } catch (e) {
    console.error('[office-gerar] error', e)
    return json({ error: 'erro_interno', detalhe: (e as Error).message }, 500)
  }
})
