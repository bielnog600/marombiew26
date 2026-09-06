/**
 * Helpers puros do módulo financeiro.
 *
 * Regras canónicas:
 * - Valores NUNCA são convertidos entre moedas. Cada moeda é somada e exibida
 *   separadamente.
 * - Um pagamento pendente cuja data de vencimento já passou é tratado como
 *   vencido de forma determinística (mesma regra no ecrã e no servidor).
 * - Receita do mês = pagamentos pagos no mês + pacotes pagos no mês que NÃO
 *   estão ligados a um pagamento (evita contar duas vezes).
 */

export type Currency = 'EUR' | 'BRL';

export const SUPPORTED_CURRENCIES: Currency[] = ['EUR', 'BRL'];

export const CURRENCY_LABELS: Record<Currency, string> = {
  EUR: 'Euro (€)',
  BRL: 'Real (R$)',
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: '€',
  BRL: 'R$',
};

/** Nº de dias para considerar um vencimento como "a vencer em breve". */
export const DUE_SOON_DAYS = 7;

/** Saldo de aulas a partir do qual o pacote é considerado "a acabar". */
export const PACKAGE_ENDING_THRESHOLD = 2;

export function normalizeCurrency(value: string | null | undefined): Currency {
  return value === 'BRL' ? 'BRL' : 'EUR';
}

export function formatMoney(amount: number | string | null | undefined, currency?: string | null): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${CURRENCY_SYMBOLS[normalizeCurrency(currency)]}${safe.toFixed(2)}`;
}

/** Chave de mês 'YYYY-MM' (em horário local). */
export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function isValidMonthKey(key: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

/** Intervalo [start, end] em datas ISO 'YYYY-MM-DD' do mês indicado. */
export function monthRange(key: string): { start: string; end: string } {
  if (!isValidMonthKey(key)) throw new Error('Mês de referência inválido');
  const [y, m] = key.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${key}-01`, end: `${key}-${String(last).padStart(2, '0')}` };
}

export function monthLabel(key: string): string {
  if (!isValidMonthKey(key)) return key;
  const [y, m] = key.split('-').map(Number);
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${names[m - 1]} ${y}`;
}

/** Lista de meses (mais recente primeiro) terminando no mês de `ref`. */
export function recentMonthKeys(ref: Date, count = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(monthKey(new Date(ref.getFullYear(), ref.getMonth() - i, 1)));
  }
  return out;
}

function toDayString(value: string | Date): string {
  return value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : value.slice(0, 10);
}

/**
 * Estado efetivo de um pagamento: 'pendente' com vencimento no passado
 * conta como 'vencido'. Qualquer outro estado é devolvido tal como está.
 */
export function effectivePaymentStatus(
  payment: { status: string; due_date?: string | null },
  today: Date = new Date(),
): string {
  if (payment.status !== 'pendente') return payment.status;
  if (!payment.due_date) return 'pendente';
  return payment.due_date < toDayString(today) ? 'vencido' : 'pendente';
}

/** Dias até o vencimento (negativo = já venceu). */
export function daysUntilDue(dueDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
  const ref = new Date(`${toDayString(today)}T00:00:00Z`).getTime();
  return Math.round((due - ref) / 86400000);
}

export function isDueSoon(dueDate: string | null | undefined, today: Date = new Date(), days = DUE_SOON_DAYS): boolean {
  const d = daysUntilDue(dueDate, today);
  return d !== null && d >= 0 && d <= days;
}

export type MoneyByCurrency = Record<Currency, number>;

export function emptyMoney(): MoneyByCurrency {
  return { EUR: 0, BRL: 0 };
}

export function addMoney(target: MoneyByCurrency, amount: number | string | null | undefined, currency?: string | null): MoneyByCurrency {
  const c = normalizeCurrency(currency);
  const n = Number(amount ?? 0);
  target[c] += Number.isFinite(n) ? n : 0;
  return target;
}

/** Formata só as moedas com valor; se tudo for zero, mostra a moeda base. */
export function formatMoneyByCurrency(money: MoneyByCurrency, base: Currency = 'EUR'): string {
  const parts = SUPPORTED_CURRENCIES.filter(c => Math.abs(money[c]) > 0.005).map(c => formatMoney(money[c], c));
  return parts.length > 0 ? parts.join(' + ') : formatMoney(0, base);
}

/** Um pacote conta para a receita própria apenas quando não está ligado a um pagamento. */
export function packageCountsAsOwnRevenue(pkg: { payment_id?: string | null }): boolean {
  return !pkg.payment_id;
}

export function packageIsEnding(pkg: { status: string; remaining_classes: number }): boolean {
  return pkg.status === 'ativo' && pkg.remaining_classes <= PACKAGE_ENDING_THRESHOLD;
}

/** Pacote pode ser apagado apenas enquanto nenhuma aula tiver sido consumida. */
export function packageCanBeDeleted(pkg: { used_classes: number }): boolean {
  return Number(pkg.used_classes ?? 0) <= 0;
}

export const BILLING_SERVICE_LABELS: Record<string, string> = {
  consultoria_online: 'Consultoria Online',
  plano_hibrido: 'Plano Híbrido',
  outro_recorrente: 'Outro (recorrente)',
};

export const BILLING_PLAN_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  ended: 'Encerrado',
};

export const BILLING_PLAN_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ended: 'bg-muted text-muted-foreground border-muted',
};

/** Um plano está vigente no mês indicado? (mesma regra usada no servidor) */
export function planIsDueInMonth(
  plan: { status: string; billing_frequency: string; start_date: string; end_date?: string | null },
  key: string,
): boolean {
  if (plan.status !== 'active' || plan.billing_frequency !== 'monthly') return false;
  const { start, end } = monthRange(key);
  if (plan.start_date > end) return false;
  if (plan.end_date && plan.end_date < start) return false;
  return true;
}

/**
 * Vencimento do plano no mês indicado.
 *
 * Regra determinística (idêntica no servidor, em generate_recurring_charges):
 * 1. candidato = dia `due_day` do mês, limitado ao último dia do mês;
 * 2. no primeiro mês, nunca antes de `start_date` → usa `start_date`;
 * 3. se o plano termina dentro do mês, nunca depois de `end_date` → usa `end_date`.
 */
export function planDueDateForMonth(
  plan: { due_day: number; start_date?: string | null; end_date?: string | null },
  key: string,
): string {
  const { start, end } = monthRange(key);
  const day = Math.min(Math.max(Math.trunc(plan.due_day) || 1, 1), 31);
  const candidate = `${start.slice(0, 8)}${String(day).padStart(2, '0')}`;
  let due = candidate > end ? end : candidate;
  const startDate = (plan.start_date || '').slice(0, 10);
  if (startDate && startDate >= start && startDate <= end && due < startDate) due = startDate;
  const endDate = (plan.end_date || '').slice(0, 10);
  if (endDate && endDate >= start && endDate <= end && due > endDate) due = endDate;
  return due;
}

/* ------------------------------------------------------------------ *
 * Isolamento mensal
 * ------------------------------------------------------------------ */

/**
 * Uma cobrança pertence ao mês selecionado quando:
 * - tem `reference_month` igual ao mês; ou
 * - na ausência de `reference_month`, o `due_date` cai dentro do mês.
 * Cobranças sem referência temporal fiável nunca entram no resumo mensal.
 */
export function paymentBelongsToMonth(
  payment: { reference_month?: string | null; due_date?: string | null },
  key: string,
): boolean {
  if (payment.reference_month) return payment.reference_month.slice(0, 7) === key;
  const due = (payment.due_date || '').slice(0, 10);
  if (!due) return false;
  const { start, end } = monthRange(key);
  return due >= start && due <= end;
}

/** Um recebimento entra na receita do mês em que foi efetivamente pago. */
export function paymentReceivedInMonth(
  payment: { status: string; paid_at?: string | null },
  key: string,
): boolean {
  if (payment.status !== 'pago') return false;
  const paid = (payment.paid_at || '').slice(0, 10);
  if (!paid) return false;
  const { start, end } = monthRange(key);
  return paid >= start && paid <= end;
}

/** Um pacote sem pagamento associado entra na receita do mês do `payment_date`. */
export function packageReceivedInMonth(
  pkg: { payment_id?: string | null; payment_status: string; payment_date?: string | null },
  key: string,
): boolean {
  if (!packageCountsAsOwnRevenue(pkg)) return false;
  if (pkg.payment_status !== 'pago') return false;
  const day = (pkg.payment_date || '').slice(0, 10);
  if (!day) return false;
  const { start, end } = monthRange(key);
  return day >= start && day <= end;
}

/**
 * Vigência HISTÓRICA de um pacote num mês civil: sobreposição de intervalos.
 * Pacote sem `expiry_date` é considerado vigente de `start_date` em diante.
 *
 * O estado ATUAL (incl. `cancelado`) não é usado aqui: um pacote cancelado hoje
 * não deixa de ter existido em meses passados. Para decisões operacionais do
 * momento use `packageIsOperationalInMonth`.
 */
export function packageIsRelevantInMonth(
  pkg: { status: string; start_date?: string | null; expiry_date?: string | null },
  key: string,
): boolean {
  const { start, end } = monthRange(key);
  const startDate = (pkg.start_date || '').slice(0, 10);
  if (startDate && startDate > end) return false;
  const expiry = (pkg.expiry_date || '').slice(0, 10);
  if (expiry && expiry < start) return false;
  return true;
}

/** Pacote operacionalmente ativo: vigente no mês E com estado atual `ativo`. */
export function packageIsOperationalInMonth(
  pkg: { status: string; start_date?: string | null; expiry_date?: string | null },
  key: string,
): boolean {
  return pkg.status === 'ativo' && packageIsRelevantInMonth(pkg, key);
}

/**
 * Um lançamento aparece na lista do mês pela primeira referência disponível:
 * reference_month → due_date → paid_at (se pago) → created_at (fallback).
 */
export function paymentVisibleInMonth(
  payment: {
    reference_month?: string | null;
    due_date?: string | null;
    status?: string;
    paid_at?: string | null;
    created_at?: string | null;
  },
  key: string,
): boolean {
  const { start, end } = monthRange(key);
  const inMonth = (value?: string | null) => {
    const d = (value || '').slice(0, 10);
    return !!d && d >= start && d <= end;
  };
  if (payment.reference_month) return payment.reference_month.slice(0, 7) === key;
  if (payment.due_date) return inMonth(payment.due_date);
  if (payment.status === 'pago' && payment.paid_at) return inMonth(payment.paid_at);
  return inMonth(payment.created_at);
}


/* ------------------------------------------------------------------ *
 * Timezone
 * ------------------------------------------------------------------ */

/** Timezone operacional do admin. */
export const OPERATIONAL_TIMEZONE = 'Europe/Lisbon';

function timezoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcDate)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return (asUtc - utcDate.getTime()) / 60000;
}

/** Converte um instante local (YYYY-MM-DDTHH:mm[:ss]) do timezone indicado em UTC. */
export function localDateTimeToUtcIso(local: string, timeZone: string = OPERATIONAL_TIMEZONE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) throw new Error('Data/hora inválida');
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  // Duas passagens resolvem as transições de horário de verão.
  let guess = naive - timezoneOffsetMinutes(new Date(naive), timeZone) * 60000;
  guess = naive - timezoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess).toISOString();
}

/**
 * Intervalo UTC [startUtc, endExclusiveUtc) correspondente ao mês civil local.
 * Resolve corretamente o horário de verão.
 */
export function monthUtcRangeForTimezone(
  key: string,
  timeZone: string = OPERATIONAL_TIMEZONE,
): { startUtc: string; endExclusiveUtc: string } {
  if (!isValidMonthKey(key)) throw new Error('Mês de referência inválido');
  const [y, m] = key.split('-').map(Number);
  const nextKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return {
    startUtc: localDateTimeToUtcIso(`${key}-01T00:00:00`, timeZone),
    endExclusiveUtc: localDateTimeToUtcIso(`${nextKey}-01T00:00:00`, timeZone),
  };
}


/* ------------------------------------------------------------------ *
 * Resumo mensal (puro)
 * ------------------------------------------------------------------ */

export type MonthlyPaymentLike = {
  student_id: string;
  amount: number | string;
  currency?: string | null;
  status: string;
  paid_at?: string | null;
  due_date?: string | null;
  reference_month?: string | null;
};

export type MonthlyPackageLike = {
  student_id: string;
  total_amount: number | string;
  currency?: string | null;
  payment_id?: string | null;
  payment_status: string;
  payment_date?: string | null;
};

export type MonthlyTotals = {
  received: MoneyByCurrency;
  toReceive: MoneyByCurrency;
  overdue: MoneyByCurrency;
  dueSoon: MoneyByCurrency;
  expectedTotal: MoneyByCurrency;
  studentsOverdue: number;
};

/**
 * Resumo isolado ao mês selecionado.
 *
 * - Recebido: pago com `paid_at` dentro do mês (pagamentos) ou `payment_date`
 *   dentro do mês (pacotes sem `payment_id`).
 * - A receber / Vencidos / Vence em 7 dias / Alunos em atraso: apenas cobranças
 *   que pertencem ao mês (reference_month, ou due_date/payment_date no mês).
 * - Total previsto = recebido + a receber + vencidos do próprio mês.
 */
export function summarizeMonth(
  payments: MonthlyPaymentLike[],
  packages: MonthlyPackageLike[],
  key: string,
  today: Date = new Date(),
): MonthlyTotals {
  const totals: MonthlyTotals = {
    received: emptyMoney(),
    toReceive: emptyMoney(),
    overdue: emptyMoney(),
    dueSoon: emptyMoney(),
    expectedTotal: emptyMoney(),
    studentsOverdue: 0,
  };
  const overdueStudents = new Set<string>();
  const { start, end } = monthRange(key);

  for (const p of payments) {
    if (paymentReceivedInMonth(p, key)) addMoney(totals.received, p.amount, p.currency);
    if (!paymentBelongsToMonth(p, key)) continue;
    const status = effectivePaymentStatus(p, today);
    if (status === 'pendente') {
      addMoney(totals.toReceive, p.amount, p.currency);
      if (isDueSoon(p.due_date, today)) addMoney(totals.dueSoon, p.amount, p.currency);
    } else if (status === 'vencido') {
      addMoney(totals.overdue, p.amount, p.currency);
      overdueStudents.add(p.student_id);
    }
  }

  for (const pkg of packages) {
    if (!packageCountsAsOwnRevenue(pkg)) continue; // já contado pelo pagamento
    if (packageReceivedInMonth(pkg, key)) addMoney(totals.received, pkg.total_amount, pkg.currency);
    const day = (pkg.payment_date || '').slice(0, 10);
    if (!day || day < start || day > end) continue;
    if (pkg.payment_status === 'pendente') {
      addMoney(totals.toReceive, pkg.total_amount, pkg.currency);
      if (isDueSoon(day, today)) addMoney(totals.dueSoon, pkg.total_amount, pkg.currency);
    } else if (pkg.payment_status === 'vencido') {
      addMoney(totals.overdue, pkg.total_amount, pkg.currency);
      overdueStudents.add(pkg.student_id);
    }
  }

  for (const c of SUPPORTED_CURRENCIES) {
    totals.expectedTotal[c] = totals.received[c] + totals.toReceive[c] + totals.overdue[c];
  }
  totals.studentsOverdue = overdueStudents.size;
  return totals;
}

/** Recebido por aluno no mês: pagamentos pagos + pacotes pagos sem `payment_id`. */
export function receivedByStudentInMonth(
  payments: (MonthlyPaymentLike & { student_name?: string })[],
  packages: (MonthlyPackageLike & { student_name?: string })[],
  key: string,
): { name: string; currency: Currency; amount: number }[] {
  const acc = new Map<string, { name: string; currency: Currency; amount: number }>();
  const add = (name: string, currency: string | null | undefined, amount: number | string) => {
    const c = normalizeCurrency(currency);
    const k = `${name}|${c}`;
    const prev = acc.get(k);
    const n = Number(amount ?? 0);
    if (prev) prev.amount += Number.isFinite(n) ? n : 0;
    else acc.set(k, { name, currency: c, amount: Number.isFinite(n) ? n : 0 });
  };
  for (const p of payments) {
    if (paymentReceivedInMonth(p, key)) add(p.student_name || 'Desconhecido', p.currency, p.amount);
  }
  for (const pkg of packages) {
    if (packageReceivedInMonth(pkg, key)) add(pkg.student_name || 'Desconhecido', pkg.currency, pkg.total_amount);
  }
  return [...acc.values()].sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ *
 * Próxima aula agendada
 * ------------------------------------------------------------------ */

/** Estados da agenda que NÃO contam como aula futura. */
export const NEXT_CLASS_EXCLUDED_STATUSES = [
  'cancelado', 'reagendado', 'concluido', 'falta', 'falta_justificada',
] as const;

export type ScheduledEventLike = { start_datetime: string; status: string };

/** Devolve o próximo evento futuro válido (mais próximo), ou null. */
export function pickNextClass<T extends ScheduledEventLike>(events: T[], now: Date = new Date()): T | null {
  const ts = now.getTime();
  const valid = events
    .filter(e => !(NEXT_CLASS_EXCLUDED_STATUSES as readonly string[]).includes(e.status))
    .filter(e => new Date(e.start_datetime).getTime() > ts)
    .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
  return valid[0] || null;
}

/** Rótulo curto "10/09 às 18:00" no timezone operacional. */
export function formatNextClassLabel(iso: string, timeZone: string = OPERATIONAL_TIMEZONE): string {
  const d = new Date(iso);
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('pt-PT', {
    timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)) parts[p.type] = p.value;
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DDTHH:mm" agora, no timezone operacional (para inputs datetime-local). */
export function nowInOperationalTimezone(now: Date = new Date(), timeZone: string = OPERATIONAL_TIMEZONE): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}T${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}`;
}
