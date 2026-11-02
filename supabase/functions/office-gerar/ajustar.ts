// office-gerar → ajustar (treino/dieta/cardio) e analisar (treino, só leitura).
// Prompts, validação e "O que mudou" vêm do código compartilhado com o app
// (officeCore ← src/lib/officeWizard/officeAdjust.ts). Ajustes de dieta passam
// pelos MESMOS reparos determinísticos e validações do diet-agent.
import * as core from '../_shared/generated/officeCore.js'
import { anthropicChat } from '../_shared/anthropic.ts'
import { loadExerciseCatalog, buildCatalogBlock, snapPlanToCatalog } from '../_shared/exerciseCatalog.ts'
import { loadFoodCatalog, formatFoodCatalogPrompt } from '../_shared/foodCatalog.ts'
import { repairInvalidFoodIds, enforceProteinFloors, fitDayProtein } from '../_shared/dietAutoRepair.ts'
import { rebalanceDayCarbs } from '../_shared/dayCarbRebalance.ts'
import { hydrateDietPlanFromFoods } from '../_shared/dietHydration.ts'
import { normalizeStructuredDietOutput } from '../_shared/structuredDietOutput.ts'

// deno-lint-ignore no-explicit-any
type Sb = any

const AJUSTE_TOOL_SCHEMA = {
  type: 'object',
  properties: { plan: { type: 'object' }, mudancas: { type: 'array', items: { type: 'string' } } },
  required: ['plan'],
}

async function chatAjuste(m: { system: string; user: string }, maxTokens = 20000) {
  const resp = await anthropicChat({
    method: 'POST',
    body: JSON.stringify({
      messages: [{ role: 'system', content: m.system }, { role: 'user', content: m.user }],
      max_tokens: maxTokens,
      response_format: { type: 'json_object', tool_schema: AJUSTE_TOOL_SCHEMA },
    }),
  })
  if (!resp.ok) {
    const d = await resp.json().catch(() => ({}))
    throw Object.assign(new Error(d?.error ?? 'Falha na IA'), { detail: { status: resp.status } })
  }
  const data = await resp.json()
  const parsed = core.parseAjusteResposta(data?.choices?.[0]?.message?.content ?? '')
  if (!parsed) throw new Error('Resposta da IA fora do formato esperado.')
  return parsed
}

export const loadVigente = (sb: Sb, studentId: string, tipo: 'treino' | 'dieta' | 'cardio') => {
  const cols = tipo === 'treino' ? 'id, titulo, conteudo_json, version, fase, fase_inicio_data, block_start_date, created_at'
    : tipo === 'dieta' ? 'id, titulo, conteudo_json, protocols, diet_strategy, created_at'
    : 'id, titulo, conteudo, created_at'
  let q = sb.from('ai_plans').select(cols).eq('student_id', studentId).eq('tipo', tipo)
  if (tipo !== 'cardio') q = q.eq('is_draft', false)
  return q.order('created_at', { ascending: false }).limit(1).maybeSingle()
}

// ─── analisar ───────────────────────────────────────────────────────

export interface AnaliseDados {
  origem: 'vigente' | 'rascunho'
  plano_id: string | null
  titulo: string | null
  texto: string
  rascunho_id?: string
}
export type AnaliseRes =
  | { ok: true; data: AnaliseDados }
  | { ok: false; status: number; body: Record<string, unknown> }

const mapaGrupos = (rows: Array<{ nome?: string; grupo_muscular?: string | null }> | null) => {
  const grupos = new Map<string, string | null>()
  for (const r of rows ?? []) grupos.set(String(r.nome ?? '').trim().toLowerCase(), r.grupo_muscular ?? null)
  return (n: string) => grupos.get(String(n).trim().toLowerCase()) ?? null
}

/**
 * Analisa o treino VIGENTE, ou o RASCUNHO do escritório quando `draftId` vem
 * (office_plan_drafts, status pronto). Só leitura: nada é gravado, nenhuma IA.
 */
export async function analisar(sb: Sb, studentId: string, draftId?: string | null): Promise<AnaliseRes> {
  if (draftId) {
    const [r, ex] = await Promise.all([
      loadRascunhoBase(sb, 'treino', draftId, studentId),
      sb.from('exercises').select('nome, grupo_muscular'),
    ])
    if (!r.ok) {
      // Rascunho publicado já é o treino vigente: a análise sem id mostra o mesmo.
      if (r.body.error === 'ja_publicado') {
        return { ok: false, status: r.status, body: { ...r.body, detalhe: 'Esse rascunho já foi publicado; analise sem id para ver o treino vigente.' } }
      }
      return r
    }
    const plan = core.normalizeWorkoutPlan(r.cur.conteudo_json)
    if (!plan) return { ok: false, status: 409, body: { error: 'rascunho_sem_json', detalhe: 'Esse rascunho não tem treino em JSON estruturado.' } }
    const baseId = typeof r.cur.id === 'string' ? r.cur.id : null
    // Rascunho de ajuste: vale o bloco do treino de origem. Rascunho gerado: o
    // bloco só começa quando for publicado, então é a semana 1.
    const base = baseId
      ? (await sb.from('ai_plans').select('id, titulo, block_start_date, fase_inicio_data, created_at').eq('id', baseId).maybeSingle()).data
      : null
    const a = core.analisarTreino(plan, {
      semana: baseId ? core.semanaDoCiclo(base) : 1,
      grupoBanco: mapaGrupos(ex.data),
    })
    return { ok: true, data: { origem: 'rascunho', rascunho_id: draftId, plano_id: baseId, titulo: base?.titulo ?? null, texto: a.texto } }
  }
  const [{ data: cur }, ex] = await Promise.all([
    loadVigente(sb, studentId, 'treino'),
    sb.from('exercises').select('nome, grupo_muscular'),
  ])
  const plan = cur ? core.normalizeWorkoutPlan(cur.conteudo_json) : null
  if (!plan) return { ok: false, status: 404, body: { error: 'sem_plano_vigente', detalhe: 'O aluno não tem treino publicado com JSON estruturado.' } }
  const a = core.analisarTreino(plan, {
    semana: core.semanaDoCiclo(cur),
    grupoBanco: mapaGrupos(ex.data),
  })
  return { ok: true, data: { origem: 'vigente', plano_id: cur.id, titulo: cur.titulo, texto: a.texto } }
}

// ─── treino ─────────────────────────────────────────────────────────

/** `cur`: { id, conteudo_json } do ponto de partida; `herda` sobrescreve o vínculo de publicação (rascunho de origem). */
export async function runAjusteTreino(
  sb: Sb, cur: any, categoria: string, pedido: string, herda?: Record<string, unknown>,
  ctx: { semana?: number | null; aluno?: string | null } = {},
) {
  const original = core.normalizeWorkoutPlan(cur.conteudo_json)
  if (!original) throw new Error('Treino vigente sem JSON estruturado; abra e salve no editor do admin antes de ajustar.')
  const revisar = categoria === 'revisar'
  // Revisar: o servidor aplica sem IA o que é determinístico (dias 4x seg–qui, selects pela tabela).
  const pre = revisar ? core.preRevisarTreino(original) : { plan: original, correcoes: [] as string[] }
  const before = pre.plan
  const [catalog, met, exRows] = await Promise.all([
    loadExerciseCatalog(),
    sb.from('training_methods').select('slug').eq('active', true),
    revisar ? sb.from('exercises').select('nome, grupo_muscular') : Promise.resolve({ data: null }),
  ])
  if (!catalog.length) throw new Error('Banco de exercícios indisponível.')
  const metodos = (met.data ?? []).map((m: any) => m.slug)
  const catalogBlock = buildCatalogBlock(catalog)
  const names = catalog.map((c) => c.nome)
  let correcao: string[] | undefined
  let last: { plan: any; erros: string[]; mudancas: string[]; conv: string[] } | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chatAjuste(
      core.buildTreinoAjusteMessages({ plan: before, categoria, pedido, catalogBlock, metodos, correcao, semana: ctx.semana ?? null, aluno: ctx.aluno ?? null }),
      revisar ? 32000 : 20000,
    )
    snapPlanToCatalog(r.plan, catalog)
    // Selects fora da tabela que a IA devolver também são convertidos antes das validações.
    const norm0 = core.normalizeWorkoutPlan(r.plan)
    const conv = norm0 ? core.converterSelects(norm0) : { plan: r.plan, correcoes: [] as string[] }
    const v = core.validateTreinoAjuste(before, conv.plan, names, metodos, categoria)
    last = { plan: v.plan, erros: v.erros, mudancas: r.mudancas, conv: conv.correcoes }
    if (v.plan && !v.erros.length) break
    correcao = v.erros.slice(0, 40)
  }
  if (!last?.plan || last.erros.length) {
    throw Object.assign(new Error('O ajuste não passou nas validações do editor.'), { detail: { erros: last?.erros ?? [] } })
  }
  const built = core.buildWorkoutPlanUpdatePayload(last.plan, {})
  if (built.success !== true) throw new Error('Treino ajustado inválido: ' + built.error)
  // "O que mudou" compara com o ponto de partida real (antes das correções do servidor).
  const mud = core.mudancasTreino(original, built.json)
  let resumo = core.resumoTreinoCompleto(built.json) + '\n' + core.secaoOQueMudou(mud, revisar ? [] : last.mudancas)
  if (revisar) {
    const corrigido = [
      ...pre.correcoes.map((c: string) => `${c} (servidor)`),
      ...last.conv.map((c: string) => `${c} (servidor)`),
      ...last.mudancas,
    ]
    resumo += '\n' + core.secaoRevisao(original, built.json, corrigido, { semana: ctx.semana ?? 1, grupoBanco: mapaGrupos(exRows.data) })
  }
  return {
    result_payload: { modo: 'ajuste', json: built.json, base_plan_id: cur.id, base_conteudo_json: cur.conteudo_json, ...(herda ?? {}), mudancas: mud, mudancas_ia: last.mudancas, correcoes_servidor: [...pre.correcoes, ...last.conv] },
    resumo_legivel: resumo,
  }
}

/**
 * Ponto de partida de um ajuste a partir de um RASCUNHO do escritório.
 * Treino/cardio: office_plan_drafts (status pronto). Dieta: id do office_plan_drafts
 * ou do próprio ai_plans com is_draft=true. O rascunho de origem não é alterado.
 */
export async function loadRascunhoBase(sb: Sb, tipo: 'treino' | 'dieta' | 'cardio', id: string, studentId: string):
  Promise<{ ok: true; cur: any; herda?: Record<string, unknown>; request_extra?: Record<string, unknown> } | { ok: false; status: number; body: Record<string, unknown> }> {
  const { data: d } = await sb.from('office_plan_drafts').select('id, tipo, student_id, status, result_payload, request_payload, ai_plan_id').eq('id', id).maybeSingle()
  if (tipo === 'dieta') {
    const aiId = d ? (d.ai_plan_id ?? d.result_payload?.ai_plan_id) : id
    if (d && d.tipo !== 'dieta') return { ok: false, status: 404, body: { error: 'rascunho_nao_encontrado' } }
    const { data: row } = aiId
      ? await sb.from('ai_plans').select('id, student_id, is_draft, titulo, conteudo_json, protocols, diet_strategy, created_at').eq('id', aiId).eq('tipo', 'dieta').maybeSingle()
      : { data: null }
    if (!row) return { ok: false, status: 404, body: { error: 'rascunho_nao_encontrado' } }
    if (row.student_id !== studentId) return { ok: false, status: 409, body: { error: 'rascunho_de_outro_aluno' } }
    if (row.is_draft !== true) return { ok: false, status: 409, body: { error: 'ja_publicado', detalhe: 'Esse rascunho já foi publicado; ajuste sem id para partir da dieta vigente.' } }
    return { ok: true, cur: row }
  }
  if (!d || d.tipo !== tipo) return { ok: false, status: 404, body: { error: 'rascunho_nao_encontrado' } }
  if (d.student_id !== studentId) return { ok: false, status: 409, body: { error: 'rascunho_de_outro_aluno' } }
  if (d.status === 'publicado') return { ok: false, status: 409, body: { error: 'ja_publicado', detalhe: 'Esse rascunho já foi publicado; ajuste sem id para partir do plano vigente.' } }
  if (d.status !== 'pronto') return { ok: false, status: 409, body: { error: 'rascunho_nao_pronto', status: d.status } }
  const rp = d.result_payload ?? {}
  if (tipo === 'cardio') return { ok: true, cur: { id: d.id, conteudo: JSON.stringify(rp.payload ?? null) }, request_extra: { origem_rascunho_id: d.id } }
  // Treino: publicar o novo rascunho deve fazer o MESMO que publicaria o de origem.
  if (rp.modo === 'ajuste') {
    return { ok: true, cur: { id: rp.base_plan_id, conteudo_json: rp.json }, herda: { base_plan_id: rp.base_plan_id, base_conteudo_json: rp.base_conteudo_json, origem_rascunho_id: d.id } }
  }
  return {
    ok: true, cur: { id: null, conteudo_json: rp.json },
    herda: { modo: 'gerado', base_plan_id: null, base_conteudo_json: null, origem_rascunho_id: d.id },
    request_extra: { snapshot: d.request_payload?.snapshot ?? null, last_plan_id: d.request_payload?.last_plan_id ?? null, agent: d.request_payload?.agent ?? 'trainer-agent', origem_rascunho_id: d.id },
  }
}

// ─── dieta ──────────────────────────────────────────────────────────

export async function runAjusteDieta(sb: Sb, studentId: string, cur: any, categoria: string, pedido: string) {
  const before = core.parseDietPlanLoose(cur.conteudo_json)
  if (!before) throw new Error('Dieta vigente sem JSON estruturado.')
  const t = before.targets
  const cc = cur.protocols?.carb_cycling?.enabled === true && cur.protocols?.weekly_day_targets
  const weeklyCarbTargets = cc ? cur.protocols.weekly_day_targets : null
  const schedule = cc
    ? { days: Object.fromEntries(Object.entries(weeklyCarbTargets).map(([wd, d]: [string, any]) => [wd, { carbs_g: d.c, target_kcal: d.kcal, fat_g: d.g, protein_g: d.p }])) }
    : null
  const linear = cc ? null : { carbs_g: t.c, target_kcal: t.kcal, fat_g: t.g }
  const floors = { main: t.p > 0 ? Math.min(30, Math.round(t.p * 0.25)) : 30, breakfast: t.p > 0 ? Math.min(15, Math.round(t.p * 0.12)) : 15 }
  const [catalog, foods] = await Promise.all([loadFoodCatalog(sb), core.loadDietFoodRecords(sb)])
  const foodCatalogBlock = formatFoodCatalogPrompt(catalog)
  const mealCount = before.days?.[0]?.meals?.length ?? 0

  let correcao: string[] | undefined
  let last: any = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chatAjuste(core.buildDietaAjusteMessages({ plan: before, categoria, pedido, foodCatalogBlock, correcao }), 24000)
    let raw = normalizeStructuredDietOutput(r.plan)
    const erros: string[] = []
    if (!raw || !Array.isArray(raw.days)) { erros.push('Plano sem dias.'); correcao = erros; last = { erros }; continue }
    raw.targets = { ...t }
    raw = repairInvalidFoodIds(raw, catalog).plan
    // Mesma ordem do diet-agent: piso de proteína → proteína do dia → carbo/gordura, até 3 voltas.
    for (let round = 0; round < 3; round++) {
      raw = enforceProteinFloors(raw, catalog, floors).plan
      raw = fitDayProtein(raw, catalog, schedule, floors, linear ? { protein_g: t.p } : null).plan
      raw = (schedule ? rebalanceDayCarbs(raw, schedule, catalog) : rebalanceDayCarbs(raw, null, catalog, linear)).plan
    }
    raw = enforceProteinFloors(raw, catalog, floors).plan
    const hydrated = hydrateDietPlanFromFoods(raw, catalog, 'strict_id')
    const fin = core.finalizeDietAgentPlan(hydrated.plan, { kcal: t.kcal, p: t.p, c: t.c, g: t.g })
    if (!fin.plan) { erros.push('Resposta fora do contrato da dieta.'); correcao = erros; last = { erros }; continue }
    const assessment = core.assessGeneratedDiet({
      plan: fin.plan, foods, carbCyclingEnabled: !!cc,
      target: { calories: t.kcal, protein: t.p, carbs: t.c, fats: t.g },
      weeklyCarbTargets: weeklyCarbTargets ?? {}, questionnaire: null, adherencePct: null, mealCount,
    })
    erros.push(...core.dietaItensProibidos(fin.plan))
    if (!assessment.validation.valid) erros.push(...assessment.validation.reasons)
    if (assessment.unresolved.length) erros.push(...assessment.unresolved.map((u: string) => `Alimento fora da base: ${u}`))
    last = { plan: fin.plan, assessment, erros, mudancas: r.mudancas }
    if (!erros.length) break
    correcao = erros.slice(0, 30)
  }
  if (!last?.plan || last.erros.length) {
    throw Object.assign(new Error('O ajuste da dieta não passou nas validações (meta/tolerâncias/base).'), { detail: { erros: last?.erros ?? [] } })
  }
  const insert = core.buildDietDraftInsert({
    studentId, markdown: core.dietPlanToMarkdown(last.plan), protocols: cur.protocols ?? null, plan: last.plan,
    strategy: cur.diet_strategy ?? '', intent: 'update',
    viability: last.assessment.viability ? { score: last.assessment.viability.score, breakdown: last.assessment.viability.breakdown } : null,
  })
  const ins = await sb.from('ai_plans').insert(insert).select('id').single()
  if (ins.error) throw ins.error
  const mud = core.mudancasDieta(before, last.plan)
  return {
    ai_plan_id: ins.data.id,
    result_payload: { modo: 'ajuste', ai_plan_id: ins.data.id, base_plan_id: cur.id, assessment: last.assessment, mudancas: mud, mudancas_ia: last.mudancas },
    resumo_legivel: core.resumoDietaCompleto(last.plan, last.assessment, []) + '\n' + core.secaoOQueMudou(mud, last.mudancas),
  }
}

// ─── cardio ─────────────────────────────────────────────────────────

export async function runAjusteCardio(cur: any, categoria: string, pedido: string) {
  const before = core.parseCardioPayload(cur.conteudo)
  if (!before) throw new Error('Cardio vigente fora do formato estruturado.')
  const r = await chatAjuste(core.buildCardioAjusteMessages({ payload: before, categoria, pedido }), 12000)
  const after = core.parseCardioPayload(JSON.stringify(r.plan))
  if (!after) throw new Error('Resposta da IA fora do formato do cardio.')
  const antes = core.resumoCardioCompleto(before)
  const depois = core.resumoCardioCompleto(after)
  const mud = core.mudancasTexto(antes, depois)
  return {
    result_payload: { modo: 'ajuste', payload: after, base_plan_id: cur.id ?? null, mudancas: mud, mudancas_ia: r.mudancas },
    resumo_legivel: depois + '\n' + core.secaoOQueMudou(mud, r.mudancas),
  }
}

// ─── publicar ajuste de treino (igual ao botão Salvar do editor) ────

export async function publicarAjusteTreino(sb: Sb, d: any): Promise<{ planId: string } | { conflict: string }> {
  const rp = d.result_payload ?? {}
  const { data: plan } = await sb.from('ai_plans').select('id, student_id, conteudo_json, version').eq('id', rp.base_plan_id).maybeSingle()
  if (!plan) return { conflict: 'O treino vigente que foi ajustado não existe mais.' }
  if (JSON.stringify(plan.conteudo_json) !== JSON.stringify(rp.base_conteudo_json)) {
    return { conflict: 'O treino vigente foi alterado depois do ajuste. Descarte e peça o ajuste de novo.' }
  }
  const built = core.buildWorkoutPlanUpdatePayload(rp.json, {})
  if (built.success !== true) throw new Error('Erro ao salvar: ' + built.error)
  const up = await sb.from('ai_plans').update(built.updates).eq('id', plan.id)
  if (up.error) throw up.error
  // Mesmo registro de edição do editor (telemetria: falha não desfaz o save).
  try {
    const before = core.normalizeWorkoutPlan(plan.conteudo_json)
    const changes = before ? core.diffWorkoutPlans(before, built.json) : []
    const { data: admin } = await sb.from('user_roles').select('user_id').eq('role', 'admin').limit(1).maybeSingle()
    if (before && changes.length && admin?.user_id && admin.user_id !== plan.student_id) {
      const row = core.buildPrescriptionEditRow({
        before, after: built.json, studentId: plan.student_id, planId: plan.id, source: 'manual_plan_editor',
        actionOrigin: 'ai_assisted', planVersion: plan.version ?? null, professorId: admin.user_id,
      }, changes)
      const r = await sb.from('workout_prescription_edits').insert(row)
      if (r.error) console.error('[office-gerar] prescription_edit_failed', r.error.message)
    }
  } catch (e) {
    console.error('[office-gerar] prescription_edit_failed', (e as Error).message)
  }
  return { planId: plan.id }
}
