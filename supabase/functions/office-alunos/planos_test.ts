import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { dayNum, planDates, planFields, recentSessions } from './planos.ts'

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

const TODAY = dayNum('2026-11-04')

const sess = (student_id: string, completed_at: string | null, extra: Record<string, unknown> = {}) => ({
  student_id,
  completed_at,
  day_name: 'Terça',
  duration_minutes: 52,
  avg_rpe: '8.5',
  total_sets: 21,
  exercises_completed: 9,
  total_exercises: 9,
  ...extra,
})

Deno.test('traz só as sessões concluídas dos últimos 14 dias', () => {
  const m = recentSessions([
    sess('a1', '2026-11-04T09:00:00+00:00'),
    sess('a1', '2026-11-03T09:00:00+00:00'),
    sess('a1', '2026-10-22T09:00:00+00:00'), // 13 dias atrás: dentro
    sess('a1', '2026-10-21T09:00:00+00:00'), // 14 dias atrás: fora
    sess('a1', null),
  ], TODAY)
  assertEquals(m.get('a1')?.map((s) => s.completed_at), [
    '2026-11-04T09:00:00+00:00',
    '2026-11-03T09:00:00+00:00',
    '2026-10-22T09:00:00+00:00',
  ])
})

Deno.test('saem da mais nova para a mais antiga, seja qual for a ordem de chegada', () => {
  const m = recentSessions([
    sess('a1', '2026-11-01T09:00:00+00:00'),
    sess('a1', '2026-11-04T09:00:00+00:00'),
    sess('a1', '2026-11-02T09:00:00+00:00'),
  ], TODAY)
  assertEquals(m.get('a1')?.map((s) => s.completed_at), [
    '2026-11-04T09:00:00+00:00',
    '2026-11-02T09:00:00+00:00',
    '2026-11-01T09:00:00+00:00',
  ])
})

Deno.test('no máximo 20 sessões por aluno', () => {
  const rows = Array.from({ length: 25 }, (_, i) =>
    sess('a1', new Date(Date.UTC(2026, 10, 4, 12) - i * 3600000).toISOString()))
  const list = recentSessions(rows, TODAY).get('a1')!
  assertEquals(list.length, 20)
  assertEquals(list[0].completed_at, rows[0].completed_at)
  assertEquals(list[19].completed_at, rows[19].completed_at)
})

Deno.test('campos saem com os nomes e tipos pedidos', () => {
  const [s] = recentSessions([sess('a1', '2026-11-03T18:00:00+00:00')], TODAY).get('a1')!
  assertEquals(s, {
    completed_at: '2026-11-03T18:00:00+00:00',
    dia: 'Terça',
    duracao_min: 52,
    rpe: 8.5,
    series: 21,
    exercicios_feitos: 9,
    exercicios_total: 9,
  })
})

Deno.test('valores ausentes viram null', () => {
  const [s] = recentSessions(
    [sess('a1', '2026-11-03T18:00:00+00:00', { day_name: null, avg_rpe: null, total_sets: null })],
    TODAY,
  ).get('a1')!
  assertEquals(s.dia, null)
  assertEquals(s.rpe, null)
  assertEquals(s.series, null)
})

Deno.test('sessão com hora à frente no tempo conta como hoje', () => {
  const m = recentSessions([sess('a1', '2026-11-05T09:00:00+00:00')], TODAY)
  assertEquals(m.get('a1')?.length, 1)
})

Deno.test('aluno sem sessão concluída nos últimos 14 dias fica de fora', () => {
  const m = recentSessions([sess('a2', '2026-01-05T09:00:00+00:00')], TODAY)
  assertEquals(m.has('a2'), false)
})

