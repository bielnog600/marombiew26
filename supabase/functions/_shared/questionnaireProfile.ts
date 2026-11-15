/**
 * Ficha do aluno (Questionário de Dieta) → perfil do aluno.
 *
 * Puro (sem imports): usado pela edge function diet-questionnaire, pela página
 * pública da ficha e pela ficha do aluno no admin. Regras:
 *  - campos do perfil opcionais; vazio nunca apaga o que já existe;
 *  - peso só é pedido (e obrigatório) quando não há pesagem nos últimos 15 dias
 *    contando hoje; o servidor recalcula, nunca confia no cliente;
 *  - restrições/lesões vêm das mesmas respostas da ficha; observações são
 *    acrescentadas com a data, sem duplicar.
 */

export const RACA_OPTIONS: { value: string; label: string }[] = [
  { value: 'branco', label: 'Branco' },
  { value: 'negro', label: 'Negro' },
  { value: 'pardo', label: 'Pardo' },
  { value: 'asiatico', label: 'Asiático' },
  { value: 'indigena', label: 'Indígena' },
];

export const OBJETIVO_SUGESTOES = [
  'Hipertrofia', 'Emagrecimento', 'Definição', 'Saúde e qualidade de vida', 'Condicionamento físico',
];

export const PHONE_DDI: { value: string; label: string }[] = [
  { value: '351', label: '🇵🇹 +351' },
  { value: '55', label: '🇧🇷 +55' },
  { value: 'outro', label: 'Outro' },
];

export const WEIGHT_WINDOW_DAYS = 15;
export const NO_PAIN = 'Não sinto dores';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const lisbonToday = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Data local do aluno quando plausível (±1 dia do servidor); senão, Lisboa. */
export const resolveToday = (clientDate: unknown, now: Date): string => {
  const server = lisbonToday(now);
  if (typeof clientDate === 'string' && ISO.test(clientDate)) {
    if (clientDate >= addDays(server, -1) && clientDate <= addDays(server, 1)) return clientDate;
  }
  return server;
};

/** Primeiro dia da janela de 15 dias (hoje conta). */
export const weightWindowStart = (today: string): string => addDays(today, -(WEIGHT_WINDOW_DAYS - 1));

/** Peso é pedido quando o último registro é anterior à janela (ou não existe). */
export const needsWeight = (lastLogDate: string | null | undefined, today: string): boolean => {
  if (!lastLogDate) return true;
  const d = String(lastLogDate).slice(0, 10);
  return d < weightWindowStart(today);
};

export const formatDayPt = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const phoneDigits = (tel: string | null | undefined): string => String(tel ?? '').replace(/\D/g, '');

/** Telefone guardado → DDI (PT/BR/outro) + número para os campos da ficha. */
export const splitPhone = (tel: string | null | undefined): { ddi: string; numero: string } => {
  const digits = phoneDigits(tel);
  if (!digits) return { ddi: '351', numero: '' };
  if (digits.startsWith('351') && digits.length >= 12) return { ddi: '351', numero: digits.slice(3) };
  if (digits.startsWith('55') && digits.length >= 12) return { ddi: '55', numero: digits.slice(2) };
  if (/^9\d{8}$/.test(digits)) return { ddi: '351', numero: digits };
  return { ddi: 'outro', numero: digits };
};

export const joinPhone = (ddi: string, numero: string): string => {
  const n = numero.trim();
  if (!n) return '';
  if (ddi === 'outro') return n.startsWith('+') ? n : `+${n}`;
  return `+${ddi} ${n}`;
};

export interface PerfilClean {
  data_nascimento?: string;
  altura?: number;
  telefone?: string;
  raca?: string;
  objetivo?: string;
  peso?: number;
}

export type PerfilValidation = { ok: true; value: PerfilClean } | { ok: false; error: string };

const blank = (v: unknown) => v == null || String(v).trim() === '';
const num = (v: unknown): number => Number(String(v).trim().replace(',', '.'));

export const birthDateBounds = (today: string) => ({ min: '1930-01-01', max: `${Number(today.slice(0, 4)) - 10}${today.slice(4)}` });

export function validatePerfil(raw: unknown, opts: { today: string; pesoObrigatorio: boolean }): PerfilValidation {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: PerfilClean = {};

  if (!blank(r.data_nascimento)) {
    const v = String(r.data_nascimento).trim();
    const { min, max } = birthDateBounds(opts.today);
    if (!ISO.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) return { ok: false, error: 'Data de nascimento inválida.' };
    if (v < min || v > max) return { ok: false, error: `A data de nascimento tem de estar entre ${formatDayPt(min)} e ${formatDayPt(max)}.` };
    out.data_nascimento = v;
  }
  if (!blank(r.altura)) {
    const v = num(r.altura);
    if (!Number.isFinite(v) || v < 100 || v > 250) return { ok: false, error: 'A altura tem de estar entre 100 e 250 cm.' };
    out.altura = Math.round(v * 10) / 10;
  }
  if (!blank(r.telefone)) {
    const v = String(r.telefone).trim().replace(/\s+/g, ' ');
    if (!/^[+\d ]+$/.test(v)) return { ok: false, error: 'O telefone só pode ter números, espaços e o sinal +.' };
    const d = phoneDigits(v);
    if (d.length < 8 || d.length > 15) return { ok: false, error: 'Telefone inválido. Confira o número com o indicativo do país.' };
    out.telefone = v;
  }
  if (!blank(r.raca)) {
    const v = String(r.raca).trim();
    if (!RACA_OPTIONS.some((o) => o.value === v)) return { ok: false, error: 'Raça inválida.' };
    out.raca = v;
  }
  if (!blank(r.objetivo)) {
    const v = String(r.objetivo).trim();
    if (v.length > 200) return { ok: false, error: 'O objetivo tem de ter no máximo 200 caracteres.' };
    out.objetivo = v;
  }
  if (opts.pesoObrigatorio) {
    if (blank(r.peso)) return { ok: false, error: 'Informe o seu peso corporal (kg).' };
    const v = num(r.peso);
    if (!Number.isFinite(v) || v < 30 || v > 300) return { ok: false, error: 'O peso tem de estar entre 30 e 300 kg.' };
    out.peso = Math.round(v * 10) / 10;
  }
  return { ok: true, value: out };
}

export interface QuestionnaireTexts {
  restricoes_alimentares?: string | null;
  dores_articulares?: string[] | null;
  dores_observacoes?: string | null;
  observacoes?: string | null;
}

export interface CurrentProfile {
  observacoes?: string | null;
  telefone?: string | null;
}

export interface ProfileUpdatePlan {
  studentsProfile: Record<string, string | number>;
  telefone: string | null;
  weightLog: { peso: number; data: string } | null;
  /** Campo → valor que fica no perfil vindo da ficha (escrito ou conferido). */
  aplicados: Record<string, string | number>;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export const lesoesFromAnswers = (dores: string[] | null | undefined, obs: string | null | undefined): string | null => {
  const list = (dores ?? []).map((d) => String(d).trim()).filter(Boolean);
  if (list.includes(NO_PAIN)) return null;
  const parts = list.filter((d) => d !== NO_PAIN);
  const o = String(obs ?? '').trim();
  const text = [parts.join(', '), o].filter(Boolean).join('. ');
  return text || null;
};

export const appendObservacao = (existing: string | null | undefined, obs: string | null | undefined, today: string): string | null => {
  const o = String(obs ?? '').trim();
  if (!o) return null;
  const cur = String(existing ?? '');
  if (cur && squash(cur).includes(squash(o))) return null;
  const line = `[ficha ${formatDayPt(today)}] ${o}`;
  return cur.trim() ? `${cur.trimEnd()}\n${line}` : line;
};

export function buildProfileUpdate(input: {
  current: CurrentProfile;
  perfil: PerfilClean;
  answers: QuestionnaireTexts;
  today: string;
}): ProfileUpdatePlan {
  const { current, perfil, answers, today } = input;
  const sp: Record<string, string | number> = {};
  const aplicados: Record<string, string | number> = {};

  for (const k of ['data_nascimento', 'altura', 'raca', 'objetivo'] as const) {
    const v = perfil[k];
    if (v !== undefined && v !== '') { sp[k] = v; aplicados[k] = v; }
  }

  const restr = String(answers.restricoes_alimentares ?? '').trim();
  if (restr) { sp.restricoes = restr; aplicados.restricoes = restr; }

  const lesoes = lesoesFromAnswers(answers.dores_articulares, answers.dores_observacoes);
  if (lesoes) { sp.lesoes = lesoes; aplicados.lesoes = lesoes; }

  const obs = appendObservacao(current.observacoes, answers.observacoes, today);
  if (obs) { sp.observacoes = obs; aplicados.observacoes = obs; }

  let telefone: string | null = null;
  if (perfil.telefone) {
    if (phoneDigits(perfil.telefone) === phoneDigits(current.telefone)) {
      aplicados.telefone = String(current.telefone);
    } else {
      telefone = perfil.telefone;
      aplicados.telefone = perfil.telefone;
    }
  }

  const weightLog = perfil.peso != null ? { peso: perfil.peso, data: today } : null;
  if (weightLog) aplicados.peso = weightLog.peso;

  return { studentsProfile: sp, telefone, weightLog, aplicados };
}

/** Só as colunas da ficha que o aluno pode preencher (nunca student_id/status/token). */
export const QUESTIONNAIRE_COLUMNS = [
  'estilo_dieta', 'num_refeicoes', 'alimentos_por_refeicao', 'horario_treino', 'dias_treino', 'fase_atual',
  'usa_hormonios', 'restricoes_alimentares', 'preferencias_alimentares', 'como_se_sente', 'fraqueza',
  'dor_cabeca', 'reduziu_peso', 'pele_fina', 'fome_excessiva', 'insonia', 'baixa_energia', 'irritabilidade',
  'observacoes', 'dores_articulares', 'dores_observacoes',
] as const;

export const pickQuestionnaireAnswers = (body: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of QUESTIONNAIRE_COLUMNS) if (k in body) out[k] = body[k];
  return out;
};

export interface DadosPerfil {
  enviados?: PerfilClean;
  peso_solicitado?: boolean;
  aplicados?: Record<string, string | number>;
  hoje?: string;
}

const sameValue = (a: unknown, b: unknown, field: string): boolean => {
  if (a == null || b == null) return false;
  if (field === 'altura' || field === 'peso') return Number(a) === Number(b);
  if (field === 'telefone') return phoneDigits(String(a)) === phoneDigits(String(b));
  return String(a).trim() === String(b).trim();
};

/** Campos do perfil que ainda têm o valor vindo da última ficha (selo no admin). */
export const fichaUpdatedFields = (
  dados: DadosPerfil | null | undefined,
  current: Record<string, unknown>,
): Set<string> => {
  const out = new Set<string>();
  const ap = dados?.aplicados ?? {};
  for (const [field, value] of Object.entries(ap)) {
    if (field === 'peso') continue;
    if (sameValue(current[field], value, field)) out.add(field);
  }
  return out;
};
