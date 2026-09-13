/**
 * FOCO DA SEMANA (Consultoria → Alertas → Para falar hoje)
 * ========================================================
 *
 * Camada PURA que transforma dados determinísticos já existentes
 * (weeklyProgression.performances + quantitativeProgression + vídeos de
 * execução marcados como needs_redo + ações manuais do treinador) em linhas
 * curtas e acionáveis por exercício.
 *
 * NENHUMA decisão de carga/reps é criada aqui: kg e repetições vêm sempre do
 * motor quantitativo. Técnica/amplitude NUNCA são inferidas de carga ou reps —
 * só existem quando o treinador marca manualmente ou quando há vídeo revisado
 * pedindo refazer.
 */

import type { ExercisePerformance } from '@/lib/weeklyProgression';
import type { QuantitativeRecommendation } from '@/lib/quantitativeProgression';

export type CoachingActionType =
  | 'increase_load'
  | 'increase_reps'
  | 'maintain'
  | 'reduce_load'
  | 'technique'
  | 'amplitude'
  | 'request_video'
  | 'review'
  | 'dismissed';

export type CoachingStatus = 'pending' | 'sent' | 'waiting' | 'completed';

export interface ManualCoachingAction {
  id: string;
  student_id: string;
  plan_id: string | null;
  week_start: string;
  exercise_name: string;
  action_type: CoachingActionType;
  message: string | null;
  status: CoachingStatus;
}

export interface VideoNeedsRedo {
  exerciseName: string;
  note: string | null;
}

export interface FocusItem {
  exerciseName: string;
  actionType: Exclude<CoachingActionType, 'dismissed'>;
  /** Linha curta exibida no card. */
  detail: string;
  /** Observação do vídeo (quando houver). */
  videoNote?: string | null;
  source: 'auto' | 'manual' | 'video';
  status: CoachingStatus;
  priority: number;
  loadText?: string | null;
  repsText?: string | null;
}

export const ACTION_LABEL: Record<Exclude<CoachingActionType, 'dismissed'>, string> = {
  increase_load: 'Aumentar carga',
  increase_reps: 'Aumentar reps',
  maintain: 'Manter',
  reduce_load: 'Reduzir carga',
  technique: 'Melhorar execução',
  amplitude: 'Melhorar amplitude',
  request_video: 'Pedir vídeo',
  review: 'Revisar registro',
};

export const STATUS_LABEL: Record<CoachingStatus, string> = {
  pending: 'Pendente',
  sent: 'Enviado',
  waiting: 'Aguardando',
  completed: 'Concluído',
};

export const STATUS_CLASS: Record<CoachingStatus, string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  sent: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  waiting: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
};

const PRIORITY: Record<Exclude<CoachingActionType, 'dismissed'>, number> = {
  reduce_load: 0,
  request_video: 1, // vídeo needs_redo entra aqui; pedido manual é rebaixado abaixo
  increase_load: 2,
  increase_reps: 3,
  amplitude: 4,
  technique: 4,
  review: 6,
  maintain: 7,
};

export const formatKg = (kg: number) => `${String(Math.round(kg * 100) / 100).replace('.', ',')} kg`;

const normalize = (s: string) =>
  (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const loadOf = (q?: QuantitativeRecommendation, p?: ExercisePerformance): number | null => {
  if (q?.currentLoadKg && q.currentLoadKg > 0) return q.currentLoadKg;
  if (p?.bestSet && p.bestSet.weightKg > 0) return p.bestSet.weightKg;
  return null;
};

const repRangeText = (q?: QuantitativeRecommendation, p?: ExercisePerformance): string | null => {
  const range = q?.repRange ?? p?.repRange ?? null;
  if (range) return `${range.min}–${range.max} reps`;
  if (q?.targetReps) return `${q.targetReps} reps`;
  return null;
};

/** Texto curto (uma linha) da orientação. */
export const buildDetail = (
  actionType: Exclude<CoachingActionType, 'dismissed'>,
  ctx: { quantitative?: QuantitativeRecommendation; performance?: ExercisePerformance; videoNote?: string | null } = {},
): { detail: string; loadText: string | null; repsText: string | null } => {
  const q = ctx.quantitative;
  const p = ctx.performance;
  const current = loadOf(q, p);
  const reps = repRangeText(q, p);

  switch (actionType) {
    case 'increase_load': {
      if (q?.recommendedLoadKg && q.recommendedLoadKg > 0 && q.recommendedLoadKg !== current) {
        const t = `Subir para ${formatKg(q.recommendedLoadKg)}`;
        return { detail: t, loadText: formatKg(q.recommendedLoadKg), repsText: reps };
      }
      if (q?.incrementKg && q.incrementKg > 0) {
        return { detail: `+${formatKg(q.incrementKg)}`, loadText: `+${formatKg(q.incrementKg)}`, repsText: reps };
      }
      return { detail: 'Subir carga no menor incremento', loadText: null, repsText: reps };
    }
    case 'increase_reps': {
      const base = current ? `Manter ${formatKg(current)}` : 'Manter carga';
      return {
        detail: reps ? `${base} • buscar ${reps}` : `${base} • +1 rep`,
        loadText: current ? formatKg(current) : null,
        repsText: reps,
      };
    }
    case 'maintain':
      return { detail: current ? `Manter ${formatKg(current)}` : 'Manter carga', loadText: current ? formatKg(current) : null, repsText: reps };
    case 'reduce_load':
      return { detail: 'Reduzir carga • recuperar execução', loadText: current ? formatKg(current) : null, repsText: reps };
    case 'amplitude':
      return { detail: 'Manter carga • melhorar amplitude', loadText: current ? formatKg(current) : null, repsText: null };
    case 'technique':
      return { detail: 'Melhorar execução e controle', loadText: null, repsText: null };
    case 'request_video':
      return { detail: ctx.videoNote ? 'Pedir novo vídeo' : 'Pedir vídeo de execução', loadText: null, repsText: null };
    case 'review':
    default:
      return { detail: 'Revisar execução / registrar dados', loadText: null, repsText: null };
  }
};

export interface BuildFocusInput {
  performances?: ExercisePerformance[];
  quantitative?: QuantitativeRecommendation[];
  videosNeedsRedo?: VideoNeedsRedo[];
  manualActions?: ManualCoachingAction[];
  deload?: boolean;
}

/**
 * Monta a lista ordenada de orientações da semana.
 * Ações manuais sobrepõem a recomendação automática do mesmo exercício;
 * `dismissed` remove o exercício da lista.
 */
export const buildWeeklyFocus = (input: BuildFocusInput): FocusItem[] => {
  const perfByName = new Map<string, ExercisePerformance>();
  for (const p of input.performances ?? []) perfByName.set(normalize(p.exerciseName), p);
  const quantByName = new Map<string, QuantitativeRecommendation>();
  for (const q of input.quantitative ?? []) quantByName.set(normalize(q.exerciseName), q);

  const manualByName = new Map<string, ManualCoachingAction>();
  for (const m of input.manualActions ?? []) manualByName.set(normalize(m.exercise_name), m);

  const videoByName = new Map<string, VideoNeedsRedo>();
  for (const v of input.videosNeedsRedo ?? []) videoByName.set(normalize(v.exerciseName), v);

  const items = new Map<string, FocusItem>();

  const push = (exerciseName: string, actionType: Exclude<CoachingActionType, 'dismissed'>, source: FocusItem['source'], videoNote?: string | null) => {
    const key = normalize(exerciseName);
    const perf = perfByName.get(key);
    const quant = quantByName.get(key);
    const { detail, loadText, repsText } = buildDetail(actionType, { performance: perf, quantitative: quant, videoNote });
    const manual = manualByName.get(key);
    items.set(key, {
      exerciseName,
      actionType,
      detail,
      videoNote: videoNote ?? null,
      source,
      status: manual?.status ?? 'pending',
      priority: source === 'video' ? 1 : source === 'manual' && actionType === 'request_video' ? 5 : PRIORITY[actionType],
      loadText,
      repsText,
    });
  };

  // 1. Recomendações automáticas (determinísticas).
  for (const p of input.performances ?? []) {
    let action: Exclude<CoachingActionType, 'dismissed'>;
    if (p.status === 'missing' || p.status === 'insufficient_data') action = 'review';
    else if (p.nextAction === 'increase_load' || p.nextAction === 'increase_reps') {
      action = input.deload ? 'maintain' : p.nextAction;
    } else if (p.nextAction === 'reduce_load') action = 'reduce_load';
    else if (p.nextAction === 'review') action = 'review';
    else action = 'maintain';
    push(p.exerciseName, action, 'auto');
  }

  // 2. Vídeos marcados para refazer (evidência real, nunca inferência).
  for (const v of input.videosNeedsRedo ?? []) {
    push(v.exerciseName, 'request_video', 'video', v.note);
  }

  // 3. Ações manuais do treinador sobrepõem tudo.
  for (const m of input.manualActions ?? []) {
    const key = normalize(m.exercise_name);
    if (m.action_type === 'dismissed') {
      items.delete(key);
      continue;
    }
    const video = videoByName.get(key);
    push(m.exercise_name, m.action_type, 'manual', m.action_type === 'request_video' ? video?.note ?? null : null);
    const it = items.get(key);
    if (it) it.status = m.status;
  }

  return Array.from(items.values()).sort(
    (a, b) => a.priority - b.priority || a.exerciseName.localeCompare(b.exerciseName),
  );
};

// ------------------------------------------------------------------
// Mensagens (texto em bullets / roteiro de áudio) — mesmas orientações
// ------------------------------------------------------------------

const firstName = (full: string) => (full || 'aluno').trim().split(/\s+/)[0];

const textLine = (i: FocusItem): string => {
  switch (i.actionType) {
    case 'increase_load':
      return `• ${i.exerciseName}: tenta ${i.loadText ?? 'subir um pouco a carga'} mantendo boa execução.`;
    case 'increase_reps':
      return `• ${i.exerciseName}: mantém ${i.loadText ?? 'a carga'} e busca ${i.repsText ?? 'mais repetições'}.`;
    case 'maintain':
      return `• ${i.exerciseName}: mantém ${i.loadText ?? 'a carga'} e foca na execução.`;
    case 'reduce_load':
      return `• ${i.exerciseName}: reduz um pouco a carga e recupera a execução.`;
    case 'amplitude':
      return `• ${i.exerciseName}: mantém a carga e prioriza amplitude e controle.`;
    case 'technique':
      return `• ${i.exerciseName}: foca em execução controlada.`;
    case 'request_video':
      return i.videoNote
        ? `• ${i.exerciseName}: me manda outro vídeo. Quero conferir principalmente ${i.videoNote.toLowerCase()}`
        : `• ${i.exerciseName}: me manda um vídeo de uma das séries para eu conferir sua execução.`;
    case 'review':
    default:
      return `• ${i.exerciseName}: registra carga e reps no app para eu acompanhar.`;
  }
};

export const buildFocusTextMessage = (studentName: string, items: FocusItem[]): string => {
  const name = firstName(studentName);
  if (items.length === 0) return `Oi ${name}! 💪 Essa semana seguimos com o mesmo plano. Vai registrando as cargas e reps no app.`;
  return [
    `Oi ${name}! 💪`,
    'Para os treinos desta semana:',
    '',
    ...items.map(textLine),
    '',
    'Vai registrando as cargas e reps no app para eu acompanhar.',
  ].join('\n');
};

const spokenLine = (i: FocusItem): string => {
  switch (i.actionType) {
    case 'increase_load':
      return `no ${i.exerciseName} quero que você tente ${i.loadText ?? 'subir um pouco a carga'}`;
    case 'increase_reps':
      return `no ${i.exerciseName} mantém ${i.loadText ?? 'a carga'} e busca ${i.repsText ?? 'mais repetições'}`;
    case 'maintain':
      return `no ${i.exerciseName} mantém a carga e caprichar na execução`;
    case 'reduce_load':
      return `no ${i.exerciseName} baixa um pouco a carga para recuperar a execução`;
    case 'amplitude':
      return `no ${i.exerciseName} mantém a carga e foca bastante na amplitude`;
    case 'technique':
      return `no ${i.exerciseName} foca no controle do movimento`;
    case 'request_video':
      return i.videoNote
        ? `me manda outro vídeo do ${i.exerciseName}, quero conferir ${i.videoNote.toLowerCase()}`
        : `me manda um vídeo do ${i.exerciseName} para eu conferir sua execução`;
    case 'review':
    default:
      return `no ${i.exerciseName} registra a carga e as reps no app`;
  }
};

export const buildFocusAudioScript = (studentName: string, items: FocusItem[]): string => {
  const name = firstName(studentName);
  if (items.length === 0) {
    return `${name}, essa semana seguimos com o mesmo plano. Mantém a execução e vai registrando tudo no app. Depois me conta como foi.`;
  }
  const body = items.map(spokenLine);
  const joined = body.length === 1
    ? body[0]
    : `${body.slice(0, -1).join(', ')} e ${body[body.length - 1]}`;
  return `${name}, para essa semana ${joined}. Depois me conta como foi.`;
};
