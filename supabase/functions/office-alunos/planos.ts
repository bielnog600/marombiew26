// Read-only helpers for the office feed. No writes, no AI.
// Published plans only: office drafts live in office_plan_drafts or in ai_plans
// with is_draft = true, so they must never show up here.

export const lisbonDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export type PlanRow = {
  student_id: string
  tipo: string
  created_at: string | null
  published_at?: string | null
  is_draft?: boolean | null
}

// Latest published date (YYYY-MM-DD, Lisbon) per student + plan type.
// published_at wins when present; otherwise the row's creation date is the
// publish date, because treino/cardio are saved straight as published.
export function planDates(rows: PlanRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of rows) {
    if (p.is_draft !== false) continue
    if (p.tipo !== 'treino' && p.tipo !== 'dieta' && p.tipo !== 'cardio') continue
    const raw = p.published_at ?? p.created_at
    if (!raw) continue
    const d = lisbonDate(new Date(raw))
    const k = `${p.student_id}|${p.tipo}`
    if (!out.has(k) || d > out.get(k)!) out.set(k, d)
  }
  return out
}

export function planFields(dates: Map<string, string>, studentId: string) {
  const treino = dates.get(`${studentId}|treino`) ?? null
  const dieta = dates.get(`${studentId}|dieta`) ?? null
  const cardio = dates.get(`${studentId}|cardio`) ?? null
  return {
    treino: treino !== null,
    dieta: dieta !== null,
    cardio: cardio !== null,
    treino_data: treino,
    dieta_data: dieta,
    cardio_data: cardio,
  }
}
