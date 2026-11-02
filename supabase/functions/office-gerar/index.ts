// office-gerar — escritório de IA: perguntas / gerar / status / publicar / descartar.
// Usa o MESMO código do admin (bundle gerado de src/lib/officeWizard) e os
// MESMOS agentes (trainer-agent / cardio-agent). Rascunhos ficam em
// office_plan_drafts; nada chega ao aluno antes de `publicar`.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3'
import * as core from '../_shared/generated/officeCore.js'
import { safeEqual, resolveStudent } from './lib.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const Tipo = z.enum(['treino', 'dieta', 'cardio'])
const Body = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('perguntas'), tipo: Tipo, aluno: z.string().min(1).max(200) }),
  z.object({
    acao: z.literal('gerar'), tipo: Tipo, aluno: z.string().min(1).max(200),
    respostas: z.record(z.unknown()).default({}), instrucoes: z.string().max(5000).optional().nullable(),
  }),
  z.object({ acao: z.literal('status'), id: z.string().uuid() }),
  z.object({ acao: z.literal('publicar'), tipo: Tipo, id: z.string().uuid() }),
  z.object({ acao: z.literal('descartar'), tipo: Tipo, id: z.string().uuid() }),
])

const WAIT_MS = 110_000
const DIETA_PENDENTE = {
  error: 'dieta_indisponivel',
  detalhe: 'A dieta pelo escritório ainda não está disponível: a montagem do Agente de Dieta ainda roda só na tela do admin e está sendo migrada.',
}

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

async function perguntas(sb: Sb, tipo: string, studentId: string) {
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
  const v = tipo === 'treino' ? core.validateTreinoAnswers(respostas, instrucoes) : core.validateCardioAnswers(respostas, instrucoes)
  if (!v.ok) return json({ error: 'respostas_invalidas', faltando: v.faltando, invalidos: v.invalidos }, 422)
  if (tipo === 'treino' && !core.canGenerateTreino(v.state)) return json({ error: 'respostas_invalidas', faltando: [], invalidos: [] }, 422)

  const { data: draft, error } = await sb.from('office_plan_drafts')
    .insert({ student_id: studentId, tipo, status: 'gerando', respostas, instrucoes: instrucoes ?? null })
    .select('id').single()
  if (error) throw error

  const task = (async () => {
    try {
      const out = tipo === 'treino' ? await runTreino(sb, draft.id, studentId, v.state) : await runCardio(sb, draft.id, studentId, v.state)
      await sb.from('office_plan_drafts').update({ status: 'pronto', ...out, error: null }).eq('id', draft.id)
    } catch (e) {
      console.error('[office-gerar] generation_failed', draft.id, e)
      await sb.from('office_plan_drafts').update({ status: 'erro', error: { message: (e as Error).message, detail: (e as any)?.detail ?? null } }).eq('id', draft.id)
    }
  })()
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(task)
  await Promise.race([task, new Promise((r) => setTimeout(r, WAIT_MS))])
  return json(await statusOf(sb, draft.id))
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
  // Trava otimista: só um publicar passa (evita duplicar em chamadas repetidas).
  const { data: lock } = await sb.from('office_plan_drafts').update({ status: 'gerando' }).eq('id', id).eq('status', 'pronto').select('id')
  if (!lock?.length) return json({ error: 'publicacao_em_andamento' }, 409)
  try {
    let planId: string
    if (tipo === 'treino') {
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

async function descartar(sb: Sb, tipo: string, id: string) {
  const { data: d } = await sb.from('office_plan_drafts').select('id, tipo, status').eq('id', id).maybeSingle()
  if (!d || d.tipo !== tipo) return json({ error: 'rascunho_nao_encontrado' }, 404)
  if (d.status === 'publicado') return json({ error: 'ja_publicado' }, 409)
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
    if (b.tipo === 'dieta') return json(DIETA_PENDENTE, 501)
    if (b.acao === 'publicar') return await publicar(sb, b.tipo, b.id)
    if (b.acao === 'descartar') return await descartar(sb, b.tipo, b.id)

    const who = await resolveStudent(sb, b.aluno)
    if (who.kind === 'none') return json({ error: 'aluno_nao_encontrado' }, 404)
    if (who.kind === 'many') return json({ error: 'aluno_ambiguo', candidatos: who.candidates }, 409)
    if (b.acao === 'perguntas') return json({ tipo: b.tipo, aluno: who.student, ...(await perguntas(sb, b.tipo, who.student.id)) })
    return await gerar(sb, b.tipo, who.student.id, b.respostas, b.instrucoes)
  } catch (e) {
    console.error('[office-gerar] error', e)
    return json({ error: 'erro_interno', detalhe: (e as Error).message }, 500)
  }
})
