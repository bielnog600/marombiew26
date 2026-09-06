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

/** Data de vencimento do plano no mês indicado, limitada ao último dia do mês. */
export function planDueDateForMonth(plan: { due_day: number }, key: string): string {
  const { start, end } = monthRange(key);
  const day = Math.min(Math.max(Math.trunc(plan.due_day) || 1, 1), 28);
  const candidate = `${start.slice(0, 8)}${String(day).padStart(2, '0')}`;
  return candidate > end ? end : candidate;
}
