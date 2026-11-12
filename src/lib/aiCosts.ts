// Pure rules for "Custos de IA": labels, periods, aggregation, projection and
// margin. Rows come from ai_usage_logs; costs were priced server-side when the
// call happened, so editing a price changes only future rows.

export interface AiUsageRow {
  id?: string;
  created_at: string;
  student_id: string | null;
  target_student_id: string | null;
  actor_role: 'aluno' | 'admin' | 'sistema' | string;
  feature: string;
  provider: string;
  model: string;
  cost_usd: number | string | null;
  ok: boolean;
  request_id?: string | null;
  image_count?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  characters?: number | null;
  price_found?: boolean | null;
}

export const AI_FEATURES: Record<string, { label: string; unit: string }> = {
  pesar_visor: { label: 'Pesar refeição — leitura do visor', unit: 'foto' },
  escanear_prato: { label: 'Pesar refeição — escanear prato', unit: 'foto' },
  prato_pronto: { label: 'Prato pronto', unit: 'foto' },
  scanner_foto: { label: 'Scanner por foto', unit: 'foto' },
  scanner_rotulo: { label: 'Scanner — leitura da tabela nutricional', unit: 'foto' },
  scanner_barcode_ia: { label: 'Scanner — avaliação do produto', unit: 'avaliação' },
  traducao: { label: 'Tradução dos planos', unit: 'tradução' },
  voz_elevenlabs: { label: 'Voz da Correção ao vivo (ElevenLabs)', unit: 'fala' },
  treino_ia: { label: 'Treino com IA', unit: 'geração' },
  treino_edicao_ia: { label: 'Edição de treino com IA', unit: 'edição' },
  dieta_ia: { label: 'Dieta com IA', unit: 'geração' },
  dieta_edicao_ia: { label: 'Edição de dieta com IA', unit: 'edição' },
  cardio_ia: { label: 'Cardio com IA', unit: 'geração' },
  tabata_ia: { label: 'Tabata com IA', unit: 'geração' },
  renovacao_treino_ia: { label: 'Renovação do treino (análise)', unit: 'análise' },
  renovacao_dieta_ia: { label: 'Renovação da dieta (análise)', unit: 'análise' },
  office_ia: { label: 'Assistente (ajustes e análises)', unit: 'pedido' },
  postura_ia: { label: 'Análise postural', unit: 'análise' },
  composicao_corporal_ia: { label: 'Composição corporal por foto', unit: 'análise' },
  busca_alimento_ia: { label: 'Busca de alimentos com IA', unit: 'busca' },
  variacoes_exercicio_ia: { label: 'Organizar variações de exercícios', unit: 'pedido' },
  metadados_exercicio_ia: { label: 'Revisão dos dados dos exercícios', unit: 'exercício' },
  scanner: { label: 'Scanner (outros)', unit: 'uso' },
  outra_ia: { label: 'Outras chamadas de IA', unit: 'uso' },
};

export const featureLabel = (f: string) => AI_FEATURES[f]?.label ?? f;
export const featureUnit = (f: string) => AI_FEATURES[f]?.unit ?? 'uso';

export const DEFAULT_EUR_RATE = 0.9024;
export const EUR_RATE_SETTING_KEY = 'ai_cost_eur_rate';

export const costOf = (r: Pick<AiUsageRow, 'cost_usd'>) => {
  const n = Number(r.cost_usd);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Student the cost belongs to: who used it, else who the admin/system call was for. */
export const attributedStudent = (r: Pick<AiUsageRow, 'student_id' | 'target_student_id'>) => r.student_id ?? r.target_student_id ?? null;

/** One "uso" = one request to a function (a generation may retry the AI several times). */
const useKey = (r: AiUsageRow, i: number) => r.request_id || r.id || `row-${i}`;

export type PeriodKind = 'hoje' | '7d' | 'mes' | 'custom';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** [from, to) in local time; `days` is the number of calendar days the period covers so far (≥ 1). */
export function periodRange(kind: PeriodKind, now: Date, custom?: { from: string; to: string }) {
  let from: Date;
  let to: Date = now;
  if (kind === 'hoje') from = startOfDay(now);
  else if (kind === '7d') from = addDays(startOfDay(now), -6);
  else if (kind === 'mes') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else {
    const a = ymdToDate(custom?.from || dayKey(now));
    const b = ymdToDate(custom?.to || dayKey(now));
    from = a <= b ? a : b;
    to = addDays(a <= b ? b : a, 1);
    if (to > now) to = now;
  }
  const days = Math.max(1, Math.round((startOfDay(to < now ? addDays(to, -1) : now).getTime() - from.getTime()) / 864e5) + 1);
  return { from, to, days };
}

export interface FeatureSummary {
  feature: string;
  label: string;
  unit: string;
  costUsd: number;
  calls: number;
  uses: number;
  avgPerUseUsd: number;
}
export interface StudentSummary { studentId: string; costUsd: number; uses: number; calls: number }

export interface AiCostSummary {
  totalUsd: number;
  calls: number;
  uses: number;
  errors: number;
  unpricedCalls: number;
  byFeature: FeatureSummary[];
  byStudent: StudentSummary[];
  activeStudents: number;
  /** Students' cost ÷ active students, scaled to 30 days. */
  avgPerActiveStudentMonthUsd: number;
  /** Premium students' cost ÷ all premium students (including those with no use), scaled to 30 days. */
  avgPerPremiumStudentMonthUsd: number | null;
  premiumStudents: number;
  daily: { day: string; costUsd: number }[];
}

export function summarizeAiUsage(
  rows: AiUsageRow[],
  opts: { from: Date; to: Date; days: number; premiumIds?: Iterable<string> },
): AiCostSummary {
  const fromMs = opts.from.getTime();
  const toMs = opts.to.getTime();
  const list = rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= fromMs && t < toMs;
  });
  const features = new Map<string, { cost: number; calls: number; uses: Set<string> }>();
  const students = new Map<string, { cost: number; calls: number; uses: Set<string> }>();
  const daily = new Map<string, number>();
  const allUses = new Set<string>();
  let total = 0;
  let errors = 0;
  let unpriced = 0;
  list.forEach((r, i) => {
    const c = costOf(r);
    const key = useKey(r, i);
    total += c;
    allUses.add(key);
    if (!r.ok) errors += 1;
    if (r.ok && r.price_found === false) unpriced += 1;
    const f = features.get(r.feature) ?? { cost: 0, calls: 0, uses: new Set<string>() };
    f.cost += c; f.calls += 1; f.uses.add(key);
    features.set(r.feature, f);
    const sid = attributedStudent(r);
    if (sid) {
      const s = students.get(sid) ?? { cost: 0, calls: 0, uses: new Set<string>() };
      s.cost += c; s.calls += 1; s.uses.add(key);
      students.set(sid, s);
    }
    const day = dayKey(new Date(r.created_at));
    daily.set(day, (daily.get(day) ?? 0) + c);
  });
  const byFeature: FeatureSummary[] = [...features.entries()].map(([feature, v]) => ({
    feature,
    label: featureLabel(feature),
    unit: featureUnit(feature),
    costUsd: v.cost,
    calls: v.calls,
    uses: v.uses.size,
    avgPerUseUsd: v.uses.size ? v.cost / v.uses.size : 0,
  })).sort((a, b) => b.costUsd - a.costUsd || b.uses - a.uses);
  const byStudent: StudentSummary[] = [...students.entries()].map(([studentId, v]) => ({
    studentId, costUsd: v.cost, uses: v.uses.size, calls: v.calls,
  })).sort((a, b) => b.costUsd - a.costUsd || b.uses - a.uses);
  const monthScale = 30 / Math.max(1, opts.days);
  const studentsCost = byStudent.reduce((a, s) => a + s.costUsd, 0);
  const premium = new Set(opts.premiumIds ?? []);
  const premiumCost = byStudent.filter((s) => premium.has(s.studentId)).reduce((a, s) => a + s.costUsd, 0);
  const days: { day: string; costUsd: number }[] = [];
  for (let d = startOfDay(opts.from); d.getTime() < toMs && days.length < 400; d = addDays(d, 1)) {
    const k = dayKey(d);
    days.push({ day: k, costUsd: daily.get(k) ?? 0 });
  }
  return {
    totalUsd: total,
    calls: list.length,
    uses: allUses.size,
    errors,
    unpricedCalls: unpriced,
    byFeature,
    byStudent,
    activeStudents: byStudent.length,
    avgPerActiveStudentMonthUsd: byStudent.length ? (studentsCost / byStudent.length) * monthScale : 0,
    avgPerPremiumStudentMonthUsd: premium.size ? (premiumCost / premium.size) * monthScale : null,
    premiumStudents: premium.size,
    daily: days,
  };
}

/** Month-to-date spend extrapolated by the days elapsed (today counts as a full day). */
export function projectMonth(rows: AiUsageRow[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const spent = rows.reduce((a, r) => {
    const t = new Date(r.created_at).getTime();
    return t >= start && t <= now.getTime() ? a + costOf(r) : a;
  }, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = now.getDate();
  return { spentUsd: spent, projectedUsd: (spent / elapsed) * daysInMonth, elapsedDays: elapsed, daysInMonth };
}

export const usdToEur = (usd: number, rate: number) => usd * (Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_RATE);

/** "Se cobrar X €/mês por aluno premium": margin after the average AI cost of a premium student. */
export function premiumMargin(priceEur: number, costUsdPerStudentMonth: number, rate: number) {
  const costEur = usdToEur(Math.max(0, costUsdPerStudentMonth), rate);
  const price = Number.isFinite(priceEur) ? Math.max(0, priceEur) : 0;
  const marginEur = price - costEur;
  return { costEur, marginEur, marginPct: price > 0 ? (marginEur / price) * 100 : null };
}

/** Small amounts keep enough decimals to be useful (US$ 0,0042 por foto). */
export function formatMoney(value: number, currency: 'USD' | 'EUR') {
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  const n = value.toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency === 'USD' ? `US$ ${n}` : `${n} €`;
}
