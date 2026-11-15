/**
 * Meta de depósitos (desafio da grade) — regras puras.
 *
 * - A grade tem quadrados 1..N; cada número é um depósito desse valor em €,
 *   feito uma única vez, em qualquer ordem. Soma 1..N = N·(N+1)/2.
 * - N = menor número com N·(N+1)/2 ≥ meta.
 * - Guardado = soma de TODOS os depósitos da meta, incluindo os que ficaram
 *   acima de N depois de uma mudança de meta ("fora da grade" — nunca somem).
 * - Falta = soma dos quadrados 1..N ainda não depositados.
 * - Esperado hoje = meta × fração do período já passada (dias, inclusive).
 * Datas são strings locais 'YYYY-MM-DD'; a aritmética é feita em UTC para não
 * sofrer com mudança de hora.
 */

export const MAX_GRID_SIZE = 5000;

export type SavingsGoal = {
  id: string;
  nome: string;
  meta_valor: number;
  inicio: string;
  fim: string;
  max_valor: number;
};

export type SavingsDeposit = {
  id: string;
  goal_id: string;
  valor: number;
  depositado_em: string;
  created_at?: string;
};

/* ---------------- números e formato ---------------- */

export function gridTotal(n: number): number {
  const k = Math.max(0, Math.floor(n));
  return (k * (k + 1)) / 2;
}

/** Menor N com N·(N+1)/2 ≥ meta (mínimo 1). */
export function gridSizeForGoal(meta: number): number {
  if (!Number.isFinite(meta) || meta <= 1) return 1;
  let n = Math.floor((Math.sqrt(8 * meta + 1) - 1) / 2);
  while (gridTotal(n) < meta) n++;
  while (n > 1 && gridTotal(n - 1) >= meta) n--;
  return Math.min(n, MAX_GRID_SIZE);
}

/** "40.186 €" — inteiro arredondado com ponto de milhar. */
export function formatEuro(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits} €`;
}

/* ---------------- datas ---------------- */

const DAY_MS = 86_400_000;

function toUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isIsoDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const t = toUtc(day);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}

export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Dias de a até b, contando os dois (b < a → 0). */
export function daysInclusive(a: string, b: string): number {
  const diff = Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
  return diff < 0 ? 0 : diff + 1;
}

/** Meses de calendário de a até b, contando os dois (b < a → 0). */
export function monthsInclusive(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  const n = (yb - ya) * 12 + (mb - ma) + 1;
  return n < 0 ? 0 : n;
}

export function yearPeriod(year: number): { inicio: string; fim: string } {
  return { inicio: `${year}-01-01`, fim: `${year}-12-31` };
}

/** "dd/mm" */
export function formatDayShort(day: string): string {
  const [, m, d] = day.split('-');
  return `${d}/${m}`;
}

export function formatDayLong(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/* ---------------- plano da meta ---------------- */

export type GoalPlan = {
  n: number;
  total: number;
  months: number;
  days: number;
  perMonth: number;
  depositsPerMonth: number;
  perDay: number;
};

export function planForGoal(meta: number, inicio: string, fim: string): GoalPlan {
  const n = gridSizeForGoal(meta);
  const total = gridTotal(n);
  const months = Math.max(1, monthsInclusive(inicio, fim));
  const days = Math.max(1, daysInclusive(inicio, fim));
  return {
    n,
    total,
    months,
    days,
    perMonth: total / months,
    depositsPerMonth: n / months,
    perDay: total / days,
  };
}

/** "283 depósitos de 1 € a 283 € · total 40.186 € · média 3.349 €/mês · ~24 depósitos/mês · ~110 €/dia" */
export function describePlan(plan: GoalPlan): string {
  return [
    `${plan.n} depósitos de 1 € a ${formatEuro(plan.n)}`,
    `total ${formatEuro(plan.total)}`,
    `média ${formatEuro(plan.perMonth)}/mês`,
    `~${Math.round(plan.depositsPerMonth)} depósitos/mês`,
    `~${formatEuro(plan.perDay)}/dia`,
  ].join(' · ');
}

/** "Quanto consigo guardar por mês" → meta = valor × meses do período. */
export function goalFromMonthly(perMonth: number, inicio: string, fim: string): { meta: number; n: number; total: number } {
  const months = Math.max(1, monthsInclusive(inicio, fim));
  const meta = Math.max(1, Math.round(perMonth * months));
  const n = gridSizeForGoal(meta);
  return { meta, n, total: gridTotal(n) };
}

/* ---------------- progresso ---------------- */

export type GoalProgress = {
  n: number;
  total: number;
  saved: number;
  savedPct: number;
  remaining: number;
  remainingCount: number;
  doneInGrid: number;
  outside: SavingsDeposit[];
  outsideSum: number;
  avgPerMonth: number;
  elapsedMonths: number;
  expected: number;
  expectedPct: number;
  onPace: boolean;
  behindBy: number;
  monthsLeft: number;
  neededPerMonth: number;
};

/** Fração do período já passada (0..1), em dias inclusive. */
export function elapsedFraction(inicio: string, fim: string, today: string): number {
  const total = daysInclusive(inicio, fim);
  if (total <= 0) return 1;
  if (toUtc(today) < toUtc(inicio)) return 0;
  return Math.min(1, daysInclusive(inicio, today) / total);
}

export function expectedByToday(meta: number, inicio: string, fim: string, today: string): number {
  return meta * elapsedFraction(inicio, fim, today);
}

export function goalProgress(goal: Pick<SavingsGoal, 'meta_valor' | 'inicio' | 'fim'> & { max_valor?: number }, deposits: SavingsDeposit[], today: string): GoalProgress {
  const meta = Number(goal.meta_valor) || 0;
  const n = goal.max_valor && goal.max_valor > 0 ? goal.max_valor : gridSizeForGoal(meta);
  const total = gridTotal(n);
  const saved = deposits.reduce((s, d) => s + d.valor, 0);
  const inGrid = deposits.filter(d => d.valor >= 1 && d.valor <= n);
  const outside = deposits.filter(d => d.valor > n).sort((a, b) => a.valor - b.valor);
  const inGridSum = inGrid.reduce((s, d) => s + d.valor, 0);
  const remaining = Math.max(0, total - inGridSum);
  const remainingCount = Math.max(0, n - inGrid.length);

  const periodMonths = Math.max(1, monthsInclusive(goal.inicio, goal.fim));
  const elapsedMonths = toUtc(today) < toUtc(goal.inicio)
    ? 0
    : Math.min(periodMonths, monthsInclusive(goal.inicio, today));
  const avgPerMonth = elapsedMonths > 0 ? saved / elapsedMonths : 0;

  const expected = expectedByToday(meta, goal.inicio, goal.fim, today);
  const behindBy = Math.max(0, expected - saved);
  const onPace = behindBy < 0.5;

  const from = toUtc(today) < toUtc(goal.inicio) ? goal.inicio : today;
  const monthsLeft = toUtc(today) > toUtc(goal.fim) ? 0 : monthsInclusive(from, goal.fim);
  const neededPerMonth = monthsLeft > 0 ? remaining / monthsLeft : remaining;

  return {
    n,
    total,
    saved,
    savedPct: meta > 0 ? (saved / meta) * 100 : 0,
    remaining,
    remainingCount,
    doneInGrid: inGrid.length,
    outside,
    outsideSum: outside.reduce((s, d) => s + d.valor, 0),
    avgPerMonth,
    elapsedMonths,
    expected,
    expectedPct: meta > 0 ? Math.min(100, (expected / meta) * 100) : 0,
    onPace,
    behindBy,
    monthsLeft,
    neededPerMonth,
  };
}

/* ---------------- mudança de meta ---------------- */

export type GoalChangePreview = {
  before: { n: number; total: number; perMonth: number; remaining: number; outsideCount: number; outsideSum: number };
  after: { n: number; total: number; perMonth: number; remaining: number; outsideCount: number; outsideSum: number };
  savedUnchanged: number;
};

/** Antes/depois de mudar meta/período. Depósitos nunca mudam; só N e o que fica fora da grade. */
export function previewGoalChange(
  before: Pick<SavingsGoal, 'meta_valor' | 'inicio' | 'fim' | 'max_valor'>,
  after: Pick<SavingsGoal, 'meta_valor' | 'inicio' | 'fim'>,
  deposits: SavingsDeposit[],
  today: string,
): GoalChangePreview {
  const nAfter = gridSizeForGoal(Number(after.meta_valor));
  const pb = goalProgress(before, deposits, today);
  const pa = goalProgress({ ...after, max_valor: nAfter }, deposits, today);
  const monthsB = Math.max(1, monthsInclusive(before.inicio, before.fim));
  const monthsA = Math.max(1, monthsInclusive(after.inicio, after.fim));
  return {
    before: { n: pb.n, total: pb.total, perMonth: pb.total / monthsB, remaining: pb.remaining, outsideCount: pb.outside.length, outsideSum: pb.outsideSum },
    after: { n: pa.n, total: pa.total, perMonth: pa.total / monthsA, remaining: pa.remaining, outsideCount: pa.outside.length, outsideSum: pa.outsideSum },
    savedUnchanged: pa.saved,
  };
}

/* ---------------- sorteio ---------------- */

/** Sorteia um valor de 1..N ainda não depositado; null se a grade está completa. */
export function drawUndeposited(n: number, deposited: Iterable<number>, rng: () => number = Math.random): number | null {
  const done = new Set(deposited);
  const pool: number[] = [];
  for (let v = 1; v <= n; v++) if (!done.has(v)) pool.push(v);
  if (pool.length === 0) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}

/* ---------------- gráfico e listas ---------------- */

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export type MonthBar = { key: string; label: string; total: number; count: number };

/** Guardado por mês: todos os meses do período + meses de depósitos fora dele, em ordem. */
export function savedByMonth(goal: Pick<SavingsGoal, 'inicio' | 'fim'>, deposits: SavingsDeposit[]): MonthBar[] {
  const map = new Map<string, MonthBar>();
  const label = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return `${MONTH_SHORT[m - 1]}/${String(y).slice(2)}`;
  };
  const add = (key: string) => {
    if (!map.has(key)) map.set(key, { key, label: label(key), total: 0, count: 0 });
    return map.get(key)!;
  };
  const [ys, ms] = goal.inicio.split('-').map(Number);
  const months = Math.max(1, monthsInclusive(goal.inicio, goal.fim));
  for (let i = 0; i < months && i < 240; i++) {
    const y = ys + Math.floor((ms - 1 + i) / 12);
    const m = ((ms - 1 + i) % 12) + 1;
    add(`${y}-${String(m).padStart(2, '0')}`);
  }
  for (const d of deposits) {
    const bar = add(d.depositado_em.slice(0, 7));
    bar.total += d.valor;
    bar.count += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function latestDeposits(deposits: SavingsDeposit[], limit = 10): SavingsDeposit[] {
  return [...deposits]
    .sort((a, b) => b.depositado_em.localeCompare(a.depositado_em) || (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.valor - a.valor)
    .slice(0, limit);
}

/** Meta mostrada por padrão: a que contém hoje; senão a próxima a começar; senão a mais recente. */
export function defaultGoalId(goals: Pick<SavingsGoal, 'id' | 'inicio' | 'fim'>[], today: string): string | null {
  if (goals.length === 0) return null;
  const current = goals.filter(g => g.inicio <= today && today <= g.fim).sort((a, b) => b.inicio.localeCompare(a.inicio));
  if (current.length) return current[0].id;
  const future = goals.filter(g => g.inicio > today).sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (future.length) return future[0].id;
  return [...goals].sort((a, b) => b.fim.localeCompare(a.fim))[0].id;
}

/* ---------------- validação do formulário ---------------- */

export type GoalDraft = { nome: string; meta_valor: number; inicio: string; fim: string };

export function validateGoalDraft(d: GoalDraft): string | null {
  if (!d.nome.trim()) return 'Dá um nome à meta.';
  if (!Number.isFinite(d.meta_valor) || d.meta_valor < 1) return 'O valor da meta tem de ser pelo menos 1 €.';
  if (d.meta_valor > gridTotal(MAX_GRID_SIZE)) return `O valor máximo da meta é ${formatEuro(gridTotal(MAX_GRID_SIZE))}.`;
  if (!isIsoDay(d.inicio) || !isIsoDay(d.fim)) return 'Indica as datas de início e fim.';
  if (d.fim < d.inicio) return 'A data de fim tem de ser depois do início.';
  return null;
}
