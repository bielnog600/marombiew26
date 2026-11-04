import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { dayNum, planDates, planFields, recentSessions, weightHistory } from './planos.ts'

const row = (student_id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  student_id,
  tipo,
  created_at: null,
  published_at: null,
  is_draft: false,
  block_end_date: null,
  ...extra,
})

Deno.test('publicado sem published_at usa a data de criação', () => {
  const d = planDates([row('a1', 'treino', { created_at: '2026-10-30T19:12:19.707+00:00' })])
  assertEquals(planFields(d, 'a1'), {
    treino: true, dieta: false, cardio: false,
    treino_data: '2026-10-30', dieta_data: null, cardio_data: null,
    treino_fim: null, dieta_fim: null, cardio_fim: null,
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
    row('a1', 'treino', { created_at: '2026-11-02T10:00:00+00:00', is_draft: true, block_end_date: '2026-12-01' }),
  ])
  assertEquals(planFields(d, 'a1'), {
    treino: false, dieta: false, cardio: false,
    treino_data: null, dieta_data: null, cardio_data: null,
    treino_fim: null, dieta_fim: null, cardio_fim: null,
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

Deno.test('treino_fim vem do treino publicado mais recente', () => {
  const d = planDates([
    row('a1', 'treino', { created_at: '2026-09-20T12:00:00+00:00', block_end_date: '2026-10-18' }),
    row('a1', 'treino', { created_at: '2026-11-02T23:15:17.630+00:00', block_end_date: '2026-11-30' }),
    row('a1', 'treino', { created_at: '2026-10-01T12:00:00+00:00', block_end_date: '2026-10-29' }),
  ])
  assertEquals(planFields(d, 'a1').treino_fim, '2026-11-30')
})

Deno.test('treino_fim usa o bloco do plano escolhido pelo published_at', () => {
  const d = planDates([
    row('a1', 'treino', { created_at: '2026-11-01T10:00:00+00:00', block_end_date: '2026-11-20' }),
    row('a1', 'treino', {
      created_at: '2026-10-30T10:00:00+00:00',
      published_at: '2026-11-03T23:36:51.368+00:00',
      block_end_date: '2026-12-01',
    }),
  ])
  assertEquals(planFields(d, 'a1').treino_data, '2026-11-03')
  assertEquals(planFields(d, 'a1').treino_fim, '2026-12-01')
})

Deno.test('treino publicado sem block_end_date dá treino_fim null', () => {
  const d = planDates([row('a1', 'treino', { created_at: '2026-11-02T23:15:17.630+00:00' })])
  assertEquals(planFields(d, 'a1').treino_data, '2026-11-02')
  assertEquals(planFields(d, 'a1').treino_fim, null)
})

Deno.test('dieta ou cardio publicados não definem treino_fim', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-11-02T10:00:00+00:00', block_end_date: '2026-12-15' }),
    row('a1', 'cardio', { created_at: '2026-11-02T10:00:00+00:00', block_end_date: '2026-12-15' }),
  ])
  assertEquals(planFields(d, 'a1').treino_fim, null)
})

Deno.test('dieta_fim vem da dieta publicada mais recente', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-09-20T12:00:00+00:00', block_end_date: '2026-10-18' }),
    row('a1', 'dieta', { created_at: '2026-11-02T23:15:17.630+00:00', block_end_date: '2026-11-30' }),
    row('a1', 'dieta', { created_at: '2026-10-01T12:00:00+00:00', block_end_date: '2026-10-29' }),
  ])
  assertEquals(planFields(d, 'a1').dieta_data, '2026-11-02')
  assertEquals(planFields(d, 'a1').dieta_fim, '2026-11-30')
})

Deno.test('cardio_fim vem do cardio publicado mais recente', () => {
  const d = planDates([
    row('a1', 'cardio', { created_at: '2026-09-20T12:00:00+00:00', block_end_date: '2026-10-18' }),
    row('a1', 'cardio', { created_at: '2026-11-02T23:15:17.630+00:00', block_end_date: '2026-12-20' }),
  ])
  assertEquals(planFields(d, 'a1').cardio_data, '2026-11-02')
  assertEquals(planFields(d, 'a1').cardio_fim, '2026-12-20')
})

Deno.test('dieta_fim usa o bloco do plano escolhido pelo published_at', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-11-01T10:00:00+00:00', block_end_date: '2026-11-20' }),
    row('a1', 'dieta', {
      created_at: '2026-10-30T10:00:00+00:00',
      published_at: '2026-11-03T23:36:51.368+00:00',
      block_end_date: '2026-12-01',
    }),
  ])
  assertEquals(planFields(d, 'a1').dieta_data, '2026-11-03')
  assertEquals(planFields(d, 'a1').dieta_fim, '2026-12-01')
})

Deno.test('plano publicado sem block_end_date dá fim null', () => {
  const d = planDates([
    row('a1', 'dieta', { created_at: '2026-11-02T10:00:00+00:00' }),
    row('a1', 'cardio', { created_at: '2026-11-02T10:00:00+00:00' }),
  ])
  assertEquals(planFields(d, 'a1').dieta_fim, null)
  assertEquals(planFields(d, 'a1').cardio_fim, null)
})

Deno.test('cada tipo define só o próprio fim', () => {
  const d = planDates([
    row('a1', 'treino', { created_at: '2026-11-02T10:00:00+00:00', block_end_date: '2026-11-30' }),
    row('a1', 'cardio', { created_at: '2026-11-02T10:00:00+00:00', block_end_date: '2026-12-20' }),
  ])
  const f = planFields(d, 'a1')
  assertEquals(f.treino_fim, '2026-11-30')
  assertEquals(f.cardio_fim, '2026-12-20')
  assertEquals(f.dieta_fim, null)
})

Deno.test('aluno sem plano publicado', () => {
  const d = planDates([row('a2', 'dieta', { created_at: '2026-11-01T12:00:00+00:00' })])
  assertEquals(planFields(d, 'a1'), {
    treino: false, dieta: false, cardio: false,
    treino_data: null, dieta_data: null, cardio_data: null,
    treino_fim: null, dieta_fim: null, cardio_fim: null,
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

const peso = (student_id: string, data: string | null, pesoKg: unknown, created_at: string | null = null) => ({
  student_id,
  data,
  peso: pesoKg,
  created_at,
  ...{},
})

Deno.test('histórico traz um ponto por dia, do mais antigo para o mais novo', () => {
  const m = weightHistory([
    peso('a1', '2026-11-02', '72.4', '2026-11-02T09:00:00+00:00'),
    peso('a1', '2026-10-01', 74, '2026-10-01T09:00:00+00:00'),
    peso('a1', '2026-11-04', '72.1', '2026-11-04T09:00:00+00:00'),
  ], TODAY)
  assertEquals(m.get('a1'), [
    { data: '2026-10-01', kg: 74 },
    { data: '2026-11-02', kg: 72.4 },
    { data: '2026-11-04', kg: 72.1 },
  ])
})

Deno.test('histórico vale o último registro escrito no dia', () => {
  const m = weightHistory([
    peso('a1', '2026-11-03', 70, '2026-11-03T08:00:00+00:00'),
    peso('a1', '2026-11-03', 70.6, '2026-11-03T21:30:00+00:00'),
    peso('a1', '2026-11-03', 70.2, '2026-11-03T12:00:00+00:00'),
  ], TODAY)
  assertEquals(m.get('a1'), [{ data: '2026-11-03', kg: 70.6 }])
})

Deno.test('histórico pega os 60 dias de Lisboa, nem um a mais', () => {
  const m = weightHistory([
    peso('a1', '2026-11-04', 72), // hoje
    peso('a1', '2026-09-06', 73), // 59 dias atrás: dentro
    peso('a1', '2026-09-05', 74), // 60 dias atrás: fora
  ], TODAY)
  assertEquals(m.get('a1'), [
    { data: '2026-09-06', kg: 73 },
    { data: '2026-11-04', kg: 72 },
  ])
})

Deno.test('histórico no máximo 60 pontos', () => {
  const rows = Array.from({ length: 80 }, (_, i) =>
    peso('a1', new Date(Date.UTC(2026, 10, 4) - i * 86400000).toISOString().slice(0, 10), 70 + i / 10))
  const list = weightHistory(rows, TODAY).get('a1')!
  assertEquals(list.length, 60)
  assertEquals(list[0].data, '2026-09-06')
  assertEquals(list[59].data, '2026-11-04')
})

Deno.test('histórico ignora peso ausente, data ausente e data à frente', () => {
  const m = weightHistory([
    peso('a1', '2026-11-03', null),
    peso('a1', '2026-11-02', 'abc'),
    peso('a1', null, 71),
    peso('a1', '2026-11-05', 71), // amanhã: não é um dos últimos 60 dias
    peso('a1', '2026-11-01', 71.5),
  ], TODAY)
  assertEquals(m.get('a1'), [{ data: '2026-11-01', kg: 71.5 }])
})

Deno.test('aluno sem pesagem nos últimos 60 dias fica de fora do histórico', () => {
  const m = weightHistory([peso('a2', '2026-01-05', 80)], TODAY)
  assertEquals(m.has('a2'), false)
})
