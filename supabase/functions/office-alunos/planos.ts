// Read-only helpers for the office feed. No writes, no AI.
// Published plans only: office drafts live in office_plan_drafts or in ai_plans
// with is_draft = true, so they must never show up here.

export const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export const dayNum = (ymd: string) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000)

export type PlanRow = {
  student_id: string
  tipo: string
  created_at: string | null
  published_at?: string | null
  is_draft?: boolean | null
  block_end_date?: string | null
}

// Latest published plan (date + block end) per student + plan type.
// published_at wins when present; otherwise the row's creation date is the
// publish date, because treino/cardio are saved straight as published.
export type PlanInfo = { date: string; end: string | null }

// block_end_date is a plain `date` column, so it is already a calendar day:
// no timezone shifting here, only a shape guard.
const endDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

export function planDates(rows: PlanRow[]): Map<string, PlanInfo> {
  const out = new Map<string, PlanInfo>()
  for (const p of rows) {
    if (p.is_draft !== false) continue
    if (p.tipo !== 'treino' && p.tipo !== 'dieta' && p.tipo !== 'cardio') continue
    const raw = p.published_at ?? p.created_at
    if (!raw) continue
    const d = lisbonDate(new Date(raw))
    const k = `${p.student_id}|${p.tipo}`
    const cur = out.get(k)
    if (!cur || d > cur.date) out.set(k, { date: d, end: endDate(p.block_end_date) })
  }
  return out
}

export function planFields(dates: Map<string, PlanInfo>, studentId: string) {
  const treino = dates.get(`${studentId}|treino`) ?? null
  const dieta = dates.get(`${studentId}|dieta`) ?? null
  const cardio = dates.get(`${studentId}|cardio`) ?? null
  return {
    treino: treino !== null,
    dieta: dieta !== null,
    cardio: cardio !== null,
    treino_data: treino?.date ?? null,
    dieta_data: dieta?.date ?? null,
    cardio_data: cardio?.date ?? null,
    treino_fim: treino?.end ?? null,
    dieta_fim: dieta?.end ?? null,
    cardio_fim: cardio?.end ?? null,
  }
}

// Weight entries, as selected by the office-alunos feed query.
export type WeightRow = {
  student_id: string
  data: string | null
  peso: number | string | null
  created_at?: string | null
}

export type WeightPoint = { data: string; kg: number }

// One point per calendar day (the last entry written that day), oldest first,
// at most `limit` days of the last `days` Lisbon days. A row dated ahead of
// today is not part of the past 60 days, so it is left out; a row whose weight
// is missing or unreadable is skipped too.
export function weightHistory(
  rows: WeightRow[],
  today: number,
  days = 60,
  limit = 60,
): Map<string, WeightPoint[]> {
  const byDay = new Map<string, Map<number, { data: string; kg: number; at: string }>>()
  for (const w of rows) {
    const s = w.data === null || w.data === undefined ? '' : String(w.data)
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) continue
    const ymd = s.slice(0, 10)
    const day = dayNum(ymd)
    const age = today - day
    if (age > days - 1 || age < 0) continue
    const kg = numOr(w.peso)
    if (kg === null) continue
    const at = w.created_at ? String(w.created_at) : ''
    const map = byDay.get(w.student_id) ?? new Map<number, { data: string; kg: number; at: string }>()
    const cur = map.get(day)
    if (!cur || at >= cur.at) map.set(day, { data: ymd, kg, at })
    byDay.set(w.student_id, map)
  }
  const out = new Map<string, WeightPoint[]>()
  for (const [id, map] of byDay) {
    const list = [...map.values()]
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
      .slice(-limit)
      .map(({ data, kg }) => ({ data, kg }))
    out.set(id, list)
  }
  return out
}

// Completed workout sessions, as selected by the office-alunos feed query.
export type SessionRow = {
  student_id: string
  completed_at: string | null
  day_name?: string | null
  duration_minutes?: number | string | null
  avg_rpe?: number | string | null
  total_sets?: number | string | null
  exercises_completed?: number | string | null
  total_exercises?: number | string | null
}

export type RecentSession = {
  completed_at: string
  dia: string | null
  duracao_min: number | null
  rpe: number | null
  series: number | null
  exercicios_feitos: number | null
  exercicios_total: number | null
}

// PostgREST may send numerics (avg_rpe) as strings; everything leaves as a
// plain number or null so the assistant never has to guess.
const numOr = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// Completed sessions of the last `days` Lisbon days (today included), newest
// first, at most `limit` per student. A row dated slightly in the future is
// kept as today's session instead of being dropped.
export function recentSessions(rows: SessionRow[], today: number, days = 14, limit = 20): Map<string, RecentSession[]> {
  const out = new Map<string, RecentSession[]>()
  for (const s of rows) {
    if (!s.completed_at) continue
    const age = today - dayNum(lisbonDate(new Date(s.completed_at)))
    if (age > days - 1) continue
    const list = out.get(s.student_id) ?? []
    list.push({
      completed_at: s.completed_at,
      dia: s.day_name ?? null,
      duracao_min: numOr(s.duration_minutes),
      rpe: numOr(s.avg_rpe),
      series: numOr(s.total_sets),
      exercicios_feitos: numOr(s.exercises_completed),
      exercicios_total: numOr(s.total_exercises),
    })
    out.set(s.student_id, list)
  }
  for (const [id, list] of out) {
    list.sort((a, b) => (a.completed_at < b.completed_at ? 1 : a.completed_at > b.completed_at ? -1 : 0))
    out.set(id, list.slice(0, limit))
  }
  return out
}
