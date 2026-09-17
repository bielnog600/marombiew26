/**
 * HOTFIX UX — mensagem de WhatsApp da DIETA.
 *
 * Helpers PUROS (sem React, sem rede) para montar a mensagem enviada ao aluno.
 * Não altera dieta, publicação, targets nem Carb Cycling — apenas LÊ.
 */

export type DietWhatsAppState = 'new' | 'adjusted' | 'resend';

export interface CarbCycleWhatsAppDay {
  key: string;
  label: string;
  type: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  kcal: number | null;
}

const WEEKDAY_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
  dom: 'Domingo',
};

const TYPE_EMOJI: Record<string, string> = {
  HIGH: '🟢',
  MEDIUM: '🟡',
  LOW: '🔵',
};

const KEY_ALIASES: Record<string, string> = {
  seg: 'seg', segunda: 'seg', mon: 'seg', monday: 'seg',
  ter: 'ter', terca: 'ter', 'terça': 'ter', tue: 'ter', tuesday: 'ter',
  qua: 'qua', quarta: 'qua', wed: 'qua', wednesday: 'qua',
  qui: 'qui', quinta: 'qui', thu: 'qui', thursday: 'qui',
  sex: 'sex', sexta: 'sex', fri: 'sex', friday: 'sex',
  sab: 'sab', sabado: 'sab', 'sábado': 'sab', sat: 'sab', saturday: 'sab',
  dom: 'dom', domingo: 'dom', sun: 'dom', sunday: 'dom',
};

const normalizeKey = (raw: string): string | null => {
  const k = String(raw || '').trim().toLowerCase();
  return KEY_ALIASES[k] ?? null;
};

const normalizeType = (raw: unknown): 'HIGH' | 'MEDIUM' | 'LOW' | null => {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t === 'HIGH' || t === 'MEDIUM' || t === 'LOW') return t;
  if (t === 'ALTO') return 'HIGH';
  if (t === 'MEDIO' || t === 'MÉDIO') return 'MEDIUM';
  if (t === 'BAIXO') return 'LOW';
  return null;
};

const positiveNumber = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const indexByWeekday = (table: unknown): Record<string, any> => {
  const out: Record<string, any> = {};
  if (!table || typeof table !== 'object') return out;
  for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
    const key = normalizeKey(k);
    if (key) out[key] = v;
  }
  return out;
};

/**
 * Resolve o ciclo semanal a partir de protocols.
 * Prioridade: weekly_day_targets válido > carb_cycling.assignments > null (linear).
 */
export const resolveCarbCycleWhatsAppDays = (
  protocols: any,
): CarbCycleWhatsAppDay[] | null => {
  const weekly = indexByWeekday(protocols?.weekly_day_targets);
  const assignments = indexByWeekday(protocols?.carb_cycling?.assignments);
  const enabled = protocols?.carb_cycling?.enabled === true;

  // weekly_day_targets só conta como ciclo quando está realmente materializado
  // como tal: pelo menos 2 tipos diferentes entre HIGH/MEDIUM/LOW.
  const weeklyTypes = new Set(
    WEEKDAY_KEYS.map((k) => normalizeType(weekly[k]?.type)).filter(Boolean) as string[],
  );
  const weeklyIsCycle = weeklyTypes.size >= 2;

  // enabled === false tem PRIORIDADE: assignments residuais nunca ativam ciclo.
  const isCycle = enabled || weeklyIsCycle;
  if (!isCycle) return null;

  const days = WEEKDAY_KEYS.map((key) => {
    const row = weekly[key];
    const type = normalizeType(row?.type) ?? (enabled ? normalizeType(assignments[key]) : null);
    const kcal = positiveNumber(row?.kcal);
    return { key, label: WEEKDAY_LABELS[key], type, kcal };
  });

  const meaningful = days.some((d) => d.type !== null || d.kcal !== null);
  return meaningful ? days : null;
};

export interface DietWhatsAppTargets {
  kcal: number;
  p: number;
  c: number;
  g: number;
}

/**
 * Meta diária da dieta LINEAR.
 * Prioridade: conteudo_json.targets > campos legados (dailyTarget/target/macros).
 */
export const resolveLinearDietTargets = (
  conteudoJson: any,
): DietWhatsAppTargets | null => {
  const candidates = [
    conteudoJson?.targets,
    conteudoJson?.dailyTarget,
    conteudoJson?.target,
    conteudoJson?.macros,
  ];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const kcal = positiveNumber(raw.kcal ?? raw.calories);
    if (kcal === null) continue;
    return {
      kcal,
      p: Math.round(Number(raw.p ?? raw.protein) || 0),
      c: Math.round(Number(raw.c ?? raw.carbs) || 0),
      g: Math.round(Number(raw.g ?? raw.fat ?? raw.fats) || 0),
    };
  }
  return null;
};

export const resolveDietWhatsAppState = (
  count: number | null | undefined,
  notifiedAt: string | null | undefined,
): DietWhatsAppState => {
  const c = Number(count ?? 0);
  if (!(c > 0)) return 'new';
  return notifiedAt ? 'resend' : 'adjusted';
};

const OPENING: Record<DietWhatsAppState, string> = {
  new: 'Sua nova Dieta já está disponível no app.',
  adjusted: 'Atualizei a sua Dieta e as alterações já estão disponíveis no app.',
  resend: 'Estou te reenviando as informações da sua Dieta disponível no app.',
};

const GREETING_EMOJI: Record<DietWhatsAppState, string> = {
  new: '🚀',
  adjusted: '👋',
  resend: '👋',
};

export interface BuildDietWhatsAppMessageInput {
  firstName: string;
  plan: {
    titulo?: string | null;
    conteudo_json?: any;
    protocols?: any;
  };
  resendState: DietWhatsAppState;
}

export const buildDietWhatsAppMessage = ({
  firstName,
  plan,
  resendState,
}: BuildDietWhatsAppMessageInput): string => {
  const name = (firstName || 'aluno').trim().split(' ')[0] || 'aluno';
  const cycle = resolveCarbCycleWhatsAppDays(plan?.protocols);
  const parts: string[] = [];

  parts.push(`Oi ${name}! ${GREETING_EMOJI[resendState]}`);
  parts.push(OPENING[resendState]);

  if (cycle) {
    parts.push(
      resendState === 'resend'
        ? '🔄 Estamos usando Ciclo de Carboidratos.'
        : '🔄 Nesta fase vamos utilizar Ciclo de Carboidratos.',
    );
    const lines = cycle.map((d) => {
      const emoji = d.type ? TYPE_EMOJI[d.type] : '⚪';
      const typeLabel = d.type ? ` — ${d.type}` : '';
      const kcalLabel = d.kcal !== null ? ` · ${d.kcal} kcal` : '';
      return `${emoji} ${d.label}${typeLabel}${kcalLabel}`;
    });
    parts.push(`📅 Sua semana ficou assim:\n\n${lines.join('\n')}`);
    parts.push(
      'As quantidades e o cardápio podem mudar de um dia para o outro, então siga sempre o dia correspondente no app.',
    );
    parts.push(
      'Abra a área Dieta para conferir os alimentos, as quantidades e marcar as refeições conforme for realizando.',
    );
  } else {
    const t = resolveLinearDietTargets(plan?.conteudo_json);
    if (t) {
      parts.push(`🔥 Meta diária: ${t.kcal} kcal`);
    }
    if (resendState === 'new') {
      parts.push(
        'Organizei o plano com as quantidades e refeições que você deve seguir no dia a dia.',
      );
      parts.push(
        'Abra o app para conferir o cardápio completo, as quantidades e marcar suas refeições conforme for realizando.',
      );
    } else if (resendState === 'adjusted') {
      parts.push('Abra o app para conferir as novas quantidades e refeições.');
    } else {
      parts.push('Abra o app para conferir o cardápio completo.');
    }
  }

  parts.push('Qualquer dúvida ou dificuldade com algum alimento, me chama por aqui. 💪');

  return parts.join('\n\n');
};
