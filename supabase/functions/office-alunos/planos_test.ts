import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { planDates, planFields } from './planos.ts'

const row = (student_id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  student_id,
  tipo,
  created_at: null,
  published_at: null,
  is_draft: false,
  ...extra,
})

Deno.test('publicado sem published_at usa a data de criação', () => {
  const d = planDates([row('a1', 'treino', { created_at: '2026-10-30T19:12:19.707+00:00' })])
  assertEquals(planFields(d, 'a1'), {
    treino: true, dieta: false, cardio: false,
    treino_data: '2026-10-30', dieta_data: null, cardio_data: null,
  })
})

Deno.test('published_at vence sobre created_at', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-11-01T10:00:00+00:00', published_at: '2026-11-02T23:36:51.368+00:00' }),
  ])
  assertEquals(planFields(d, 'a1').dieta_data, '2026-11-02')
})

Deno.test('rascunho do escritório não conta', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-11-02T10:00:00+00:00', is_draft: true }),
    row('a1', 'treino', { created_at: '2026-11-02T10:00:00+00:00', is_draft: true }),
  ])
  assertEquals(planFields(d, 'a1'), {
    treino: false, dieta: false, cardio: false,
    treino_data: null, dieta_data: null, cardio_data: null,
  })
})

Deno.test('vale o plano publicado mais recente', () => {
  const d = planDates([
    row('a1', 'treino', { created_at: '2026-09-20T12:00:00+00:00' }),
    row('a1', 'treino', { created_at: '2026-11-02T23:15:17.630+00:00' }),
    row('a1', 'treino', { created_at: '2026-10-01T12:00:00+00:00' }),
  ])
  assertEquals(planFields(d, 'a1').treino_data, '2026-11-02')
})

Deno.test('aluno sem plano publicado', () => {
  const d = planDates([row('a2', 'dieta', { created_at: '2026-11-01T12:00:00+00:00' })])
  assertEquals(planFields(d, 'a1'), {
    treino: false, dieta: false, cardio: false,
    treino_data: null, dieta_data: null, cardio_data: null,
  })
})

Deno.test('tabata não entra nos três planos', () => {
  const d = planDates([row('a1', 'tabata', { created_at: '2026-07-05T17:19:05+00:00' })])
  assertEquals(planFields(d, 'a1').treino, false)
})

Deno.test('data contada no horário de Lisboa', () => {
  // 23:30 UTC de 1/8 ainda é 2/8 em Lisboa (UTC+1 no verão)
  const d = planDates([row('a1', 'cardio', { created_at: '2026-08-01T23:30:00+00:00' })])
  assertEquals(planFields(d, 'a1').cardio_data, '2026-08-02')
})

Deno.test('linha sem data nenhuma é ignorada', () => {
  const d = planDates([row('a1', 'treino')])
  assertEquals(planFields(d, 'a1').treino, false)
})
