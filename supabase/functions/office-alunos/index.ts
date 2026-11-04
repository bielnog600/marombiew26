// Read-only feed for the external follow-up assistant. Never writes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { dayNum, lisbonDate, planDates, planFields, recentSessions } from './planos.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0)
  return diff === 0 && x.length === y.length
}


const DDIS = ['351', '55', '1', '44', '34', '33', '49', '39', '41', '352', '244', '258', '238', '239', '245']
function ddi(tel: string | null): string | null {
  if (!tel) return null
  const t = tel.trim()
  const digits = t.replace(/\D/g, '')
  if (!digits) return null
  if (t.startsWith('+') || t.startsWith('00')) {
    const d = t.startsWith('00') ? digits.slice(2) : digits
    const hit = [...DDIS].sort((a, b) => b.length - a.length).find((c) => d.startsWith(c))
    return hit ? `+${hit}` : null
  }
  if (digits.length === 9 && digits.startsWith('9')) return '+351'
  if (digits.length === 10 || digits.length === 11) return '+55'
  return null
}

// deno-lint-ignore no-explicit-any
async function readAll(q: () => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('OFFICE_FEED_TOKEN')
  const token = req.headers.get('x-office-token') ?? ''
  if (!secret || !token || !safeEqual(token, secret)) return json({ error: 'Unauthorized' }, 401)

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const now = new Date()
    const today = dayNum(lisbonDate(now))
    const since30 = new Date(now.getTime() - 31 * 86400000).toISOString()
    const since30Date = new Date(now.getTime() - 31 * 86400000).toISOString().slice(0, 10)

    const [roles, profiles, sps, plans, wlRecent, wlLast, ws, dc, cs, rs] = await Promise.all([
      readAll(() => sb.from('user_roles').select('user_id, role')),
      readAll(() => sb.from('profiles').select('user_id, nome, telefone, created_at')),
      readAll(() => sb.from('students_profile').select('user_id, sexo, ativo, presencial, access_status')),
      readAll(() => sb.from('ai_plans').select('student_id, tipo, created_at, published_at, is_draft').eq('is_draft', false).in('tipo', ['treino', 'dieta', 'cardio'])),
      readAll(() => sb.from('weight_logs').select('student_id, peso, data, created_at').gte('data', since30Date).order('data').order('created_at')),
      readAll(() => sb.from('weight_logs').select('student_id, peso, data, created_at').order('data', { ascending: false }).order('created_at', { ascending: false })),
      readAll(() => sb.from('workout_sessions').select('student_id, completed_at, day_name, duration_minutes, avg_rpe, total_sets, exercises_completed, total_exercises').not('completed_at', 'is', null).order('completed_at', { ascending: false })),
      readAll(() => sb.from('diet_checkins').select('student_id, completed_at').not('completed_at', 'is', null).order('completed_at', { ascending: false })),
      readAll(() => sb.from('cardio_sessions').select('student_id, completed_at').not('completed_at', 'is', null).order('completed_at', { ascending: false })),
      readAll(() => sb.from('run_sessions').select('student_id, completed_at').not('completed_at', 'is', null).order('completed_at', { ascending: false })),
    ])

    const admins = new Set(roles.filter((r) => r.role === 'admin').map((r) => r.user_id))
    const students = new Set(roles.filter((r) => r.role === 'aluno').map((r) => r.user_id))
    const spBy = new Map(sps.map((s) => [s.user_id, s]))
    const profBy = new Map(profiles.map((p) => [p.user_id, p]))
    const ids = [...new Set([...students, ...spBy.keys()])].filter((id) => !admins.has(id))

    const lastWeight = new Map<string, any>()
    for (const w of wlLast) if (!lastWeight.has(w.student_id)) lastWeight.set(w.student_id, w)
    const recentBy = new Map<string, any[]>()
    for (const w of wlRecent) {
      if (dayNum(w.data) < today - 30) continue
      ;(recentBy.get(w.student_id) ?? recentBy.set(w.student_id, []).get(w.student_id)!).push(w)
    }
    const firstBy = (rows: any[]) => {
      const m = new Map<string, string>()
      for (const r of rows) if (!m.has(r.student_id)) m.set(r.student_id, r.completed_at)
      return m
    }
    const lastWs = firstBy(ws), lastDc = firstBy(dc)
    const lastCardio = firstBy([...cs, ...rs].sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)))
    const ws7 = new Map<string, number>(), ws30 = new Map<string, number>()
    for (const s of ws) {
      const age = today - dayNum(lisbonDate(new Date(s.completed_at)))
      if (age <= 6) ws7.set(s.student_id, (ws7.get(s.student_id) ?? 0) + 1)
      if (age <= 29) ws30.set(s.student_id, (ws30.get(s.student_id) ?? 0) + 1)
    }
    // Published plans only (is_draft = false). Office drafts live in office_plan_drafts
    // and in ai_plans with is_draft = true, so they never reach this list.
    const planDate = planDates(plans)
    // Completed sessions of the last 14 days (newest first, max 20 per student).
    const recentWs = recentSessions(ws, today)

    const alunos = ids.map((id) => {
      const sp = spBy.get(id), pr = profBy.get(id)
      const lw = lastWeight.get(id)
      const rec = recentBy.get(id) ?? []
      const lt = lastWs.get(id) ?? null
      return {
        id,
        nome: pr?.nome ?? null,
        sexo: sp?.sexo ?? null,
        ativo: sp ? sp.ativo !== false : false,
        telefone_ddi: ddi(pr?.telefone ?? null),
        modalidade: sp?.presencial == null ? null : sp.presencial ? 'presencial' : 'online',
        cadastro: pr?.created_at ? lisbonDate(new Date(pr.created_at)) : null,
        acesso: sp?.access_status ?? null,
        planos: planFields(planDate, id),
        peso: {
          ultimo: lw ? { data: lw.data, kg: Number(lw.peso) } : null,
          registros30d: rec.length,
          variacao30dKg: rec.length >= 2 ? Math.round((Number(rec[rec.length - 1].peso) - Number(rec[0].peso)) * 10) / 10 : null,
          diasSemPesar: lw ? today - dayNum(lw.data) : null,
        },
        treino: {
          ultimo: lt,
          sessoes7d: ws7.get(id) ?? 0,
          sessoes30d: ws30.get(id) ?? 0,
          diasSemTreinar: lt ? today - dayNum(lisbonDate(new Date(lt))) : null,
          recentes: recentWs.get(id) ?? [],
        },
        dieta: { ultimoCheckin: lastDc.get(id) ?? null },
        cardio: { ultimo: lastCardio.get(id) ?? null },
      }
    })
    alunos.sort((a, b) => {
      const x = a.peso.diasSemPesar, y = b.peso.diasSemPesar
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return y - x
    })
    return json({ updatedAt: now.toISOString(), alunos })
  } catch (e) {
    console.error('office-alunos error', e instanceof Error ? e.message : e)
    return json({ error: 'Internal error' }, 500)
  }
})
