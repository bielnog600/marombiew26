export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0)
  return diff === 0 && x.length === y.length
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export type Student = { id: string; nome: string | null; email: string | null }
export type Resolved = { kind: 'one'; student: Student } | { kind: 'many'; candidates: Student[] } | { kind: 'none' }

/** Puro: escolhe o aluno por id, e-mail exato ou nome (exato > contém). Admins excluídos. */
export function pickStudent(query: string, profiles: Array<{ user_id: string; nome: string | null; email: string | null }>, admins: Set<string>): Resolved {
  const pool = profiles.filter((p) => !admins.has(p.user_id)).map((p) => ({ id: p.user_id, nome: p.nome, email: p.email }))
  const q = query.trim()
  if (UUID.test(q)) {
    const hit = pool.find((p) => p.id.toLowerCase() === q.toLowerCase())
    return hit ? { kind: 'one', student: hit } : { kind: 'none' }
  }
  if (q.includes('@')) {
    const hits = pool.filter((p) => (p.email ?? '').toLowerCase() === q.toLowerCase())
    return hits.length === 1 ? { kind: 'one', student: hits[0] } : hits.length ? { kind: 'many', candidates: hits } : { kind: 'none' }
  }
  const nq = norm(q)
  const exact = pool.filter((p) => norm(p.nome ?? '') === nq)
  if (exact.length === 1) return { kind: 'one', student: exact[0] }
  if (exact.length > 1) return { kind: 'many', candidates: exact }
  const partial = pool.filter((p) => nq && norm(p.nome ?? '').includes(nq))
  if (partial.length === 1) return { kind: 'one', student: partial[0] }
  if (partial.length > 1) return { kind: 'many', candidates: partial.slice(0, 20) }
  return { kind: 'none' }
}

// deno-lint-ignore no-explicit-any
export async function resolveStudent(sb: any, query: string): Promise<Resolved> {
  const [profiles, roles] = await Promise.all([
    sb.from('profiles').select('user_id, nome, email').limit(5000),
    sb.from('user_roles').select('user_id, role').eq('role', 'admin'),
  ])
  if (profiles.error) throw profiles.error
  const admins = new Set<string>((roles.data ?? []).map((r: { user_id: string }) => r.user_id))
  return pickStudent(query, profiles.data ?? [], admins)
}
