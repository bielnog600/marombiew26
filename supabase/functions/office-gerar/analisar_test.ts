// Analisar (só leitura): com `id` analisa o RASCUNHO do escritório; sem `id`,
// o treino vigente. Rodar: deno test --allow-env supabase/functions/office-gerar/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { analisar } from './ajustar.ts'

const S = '11111111-1111-1111-1111-111111111111'
const OUTRO = '22222222-2222-2222-2222-222222222222'
const V = '33333333-3333-3333-3333-333333333333'
const B = '44444444-4444-4444-4444-444444444444'
const D1 = '55555555-5555-5555-5555-555555555555'
const D2 = '66666666-6666-6666-6666-666666666666'

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>

class Q {
  rows: Row[]
  constructor(public table: string, rows: Row[]) { this.rows = rows }
  select() { return this }
  eq(col: string, v: unknown) { this.rows = this.rows.filter((r) => r[col] === v); return this }
  order() { return this }
  limit() { return this }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }) }
  then(onFulfilled: (v: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.rows, error: null }).then(onFulfilled)
  }
}
const sb = (tables: Record<string, Row[]>) => ({
  from: (t: string) => new Q(t, (tables[t] ?? []).map((r) => ({ ...r }))),
})

const ex = (id: string, exercise: string, o: Row = {}) => ({
  id, exercise, series: '3', reps: '8-10', restSeconds: 60, variation: `Variação ${id}`, ...o,
})
const plan = (dia: string, exercise: string) => ({
  version: '2.0', type: 'workout', metadata: {},
  days: [{ id: `${dia}-1`, day: dia, focus: 'Peito', exercises: [ex('1', exercise)] }],
})

const draft = (id: string, extra: Row = {}) => ({
  id, tipo: 'treino', student_id: S, status: 'pronto',
  result_payload: { json: plan('Rascunho A', 'Supino reto') },
  request_payload: {}, ai_plan_id: null, ...extra,
})

const tables = (extra: Row[] = []): Record<string, Row[]> => ({
  // Extras vêm primeiro: um `draft(D1, ...)` sobrescreve o rascunho padrão.
  office_plan_drafts: [...extra, draft(D1)],
  ai_plans: [{
    id: V, student_id: S, tipo: 'treino', is_draft: false, titulo: 'Treino vigente',
    conteudo_json: plan('Vigente A', 'Supino inclinado'), created_at: new Date().toISOString(),
  }],
  exercises: [{ nome: 'Supino reto', grupo_muscular: 'peito' }, { nome: 'Supino inclinado', grupo_muscular: 'peito' }],
})

Deno.test('analisar sem id analisa o treino vigente', async () => {
  const r = await analisar(sb(tables()), S)
  assertEquals(r.ok, true)
  if (!r.ok) return
  assertEquals(r.data.origem, 'vigente')
  assertEquals(r.data.plano_id, V)
  assertEquals(r.data.titulo, 'Treino vigente')
  assertEquals(r.data.texto.includes('Vigente A'), true)
})

Deno.test('analisar com id analisa o rascunho, não o vigente', async () => {
  const r = await analisar(sb(tables()), S, D1)
  assertEquals(r.ok, true)
  if (!r.ok) return
  assertEquals(r.data.origem, 'rascunho')
  assertEquals(r.data.rascunho_id, D1)
  assertEquals(r.data.plano_id, null)
  assertEquals(r.data.texto.includes('Rascunho A'), true)
  assertEquals(r.data.texto.includes('Vigente A'), false)
  // Rascunho gerado: o bloco só começa na publicação → semana 1.
  assertEquals(r.data.texto.includes('semana 1 do ciclo'), true)
})

Deno.test('rascunho de ajuste usa o bloco do treino de origem', async () => {
  const base = {
    id: B, student_id: S, tipo: 'treino', is_draft: false, titulo: 'Treino base',
    conteudo_json: plan('Base A', 'Supino reto'),
    block_start_date: new Date(Date.now() - 22 * 86400000).toISOString().slice(0, 10),
  }
  const t = tables([{
    id: D2, tipo: 'treino', student_id: S, status: 'pronto', ai_plan_id: null,
    result_payload: { modo: 'ajuste', json: plan('Ajuste A', 'Supino reto'), base_plan_id: B, base_conteudo_json: {} },
    request_payload: {},
  }])
  t.ai_plans.push(base)
  const r = await analisar(sb(t), S, D2)
  assertEquals(r.ok, true)
  if (!r.ok) return
  assertEquals(r.data.plano_id, B)
  assertEquals(r.data.titulo, 'Treino base')
  assertEquals(r.data.texto.includes('Ajuste A'), true)
  assertEquals(r.data.texto.includes('semana 4 do ciclo'), true)
})

Deno.test('rascunho de outro aluno, em geração, publicado ou inexistente é recusado', async () => {
  const casos: Array<[Row, string, number]> = [
    [draft(D1, { student_id: OUTRO }), 'rascunho_de_outro_aluno', 409],
    [draft(D1, { status: 'gerando' }), 'rascunho_nao_pronto', 409],
    [draft(D1, { status: 'publicado' }), 'ja_publicado', 409],
    [draft(D1, { tipo: 'cardio' }), 'rascunho_nao_encontrado', 404],
  ]
  for (const [row, error, status] of casos) {
    const r = await analisar(sb(tables([row])), S, D1)
    assertEquals(r.ok, false)
    if (r.ok) return
    assertEquals(r.body.error, error)
    assertEquals(r.status, status)
  }
  const inexistente = await analisar(sb(tables()), S, '99999999-9999-9999-9999-999999999999')
  assertEquals(inexistente.ok, false)
  if (inexistente.ok) return
  assertEquals(inexistente.body.error, 'rascunho_nao_encontrado')
  assertEquals(inexistente.status, 404)
})

Deno.test('rascunho publicado aponta para a análise do vigente', async () => {
  const r = await analisar(sb(tables([draft(D1, { status: 'publicado' })])), S, D1)
  assertEquals(r.ok, false)
  if (r.ok) return
  assertEquals(String(r.body.detalhe).includes('analise sem id'), true)
})

Deno.test('rascunho sem treino em JSON estruturado é recusado', async () => {
  const r = await analisar(sb(tables([draft(D1, { result_payload: {} })])), S, D1)
  assertEquals(r.ok, false)
  if (r.ok) return
  assertEquals(r.body.error, 'rascunho_sem_json')
  assertEquals(r.status, 409)
})

Deno.test('aluno sem treino vigente continua com 404', async () => {
  const t = tables()
  t.ai_plans = []
  const r = await analisar(sb(t), S)
  assertEquals(r.ok, false)
  if (r.ok) return
  assertEquals(r.status, 404)
  assertEquals(r.body.error, 'sem_plano_vigente')
})
