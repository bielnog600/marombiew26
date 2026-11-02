import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { pickStudent, safeEqual } from './lib.ts'
import * as core from '../_shared/generated/officeCore.js'

const profiles = [
  { user_id: '11111111-1111-1111-1111-111111111111', nome: 'Heracto Carneiro', email: 'h@x.com' },
  { user_id: '22222222-2222-2222-2222-222222222222', nome: 'Ana Souza', email: 'ana@x.com' },
  { user_id: '33333333-3333-3333-3333-333333333333', nome: 'Ana Lima', email: 'lima@x.com' },
  { user_id: '44444444-4444-4444-4444-444444444444', nome: 'Admin', email: 'adm@x.com' },
]
const admins = new Set(['44444444-4444-4444-4444-444444444444'])

Deno.test('token comparado só bate igual', () => {
  assertEquals(safeEqual('abc', 'abc'), true)
  assertEquals(safeEqual('abc', 'abd'), false)
  assertEquals(safeEqual('abc', 'abcd'), false)
})

Deno.test('resolve aluno por id, email, nome e ambiguidade', () => {
  assertEquals(pickStudent('11111111-1111-1111-1111-111111111111', profiles, admins).kind, 'one')
  assertEquals(pickStudent('ANA@x.com', profiles, admins).kind, 'one')
  assertEquals(pickStudent('heracto', profiles, admins).kind, 'one')
  assertEquals(pickStudent('Ana', profiles, admins).kind, 'many')
  assertEquals(pickStudent('Admin', profiles, admins).kind, 'none')
})

Deno.test('bundle compartilhado carrega no Deno e valida respostas', () => {
  const miss = core.validateTreinoAnswers({ nivel: 'iniciante' })
  assertEquals(miss.ok, false)
  const ok = core.validateTreinoAnswers({ nivel: 'iniciante', dias_semana: 4, divisao: 'upper_lower', semana_ciclo: '1', equipamento: 'completa' }, 'foco em glúteo')
  assertEquals(ok.ok, true)
})
