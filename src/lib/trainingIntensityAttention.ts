/**
 * CAMADA DETERMINÍSTICA DE ATENÇÃO POR INTENSIDADE (RPE DA SESSÃO)
 * ================================================================
 *
 * Esta camada NÃO é um motor de progressão. O que decide
 * `increase_load | increase_reps | maintain` continua sendo
 * `buildQuantitativeProgressionRecommendation` (quantitativeProgression.ts).
 *
 * Aqui apenas transformamos o RPE global REAL da sessão
 * (`workout_sessions.avg_rpe`, escala 0–10) em:
 *   - um status de intensidade;
 *   - uma prioridade de atenção para o admin.
 *
 * RPE nunca é inferido a partir de carga/reps/RIR.
 */

export type IntensityStatus = 'very_low' | 'low' | 'target' | 'maximal' | 'unknown';

export type AttentionPriority = 'high' | 'medium' | 'attention_only' | 'none';

export type ProgressionAction = 'increase_load' | 'increase_reps' | 'maintain';

/** Thresholds centralizados — não espalhar magic numbers. */
export const RPE_THRESHOLDS = {
  veryLowMax: 5,
  lowMax: 7,
  targetMin: 8,
  targetMax: 9,
  maximal: 10,
} as const;

/** Alvo operacional exibido ao admin/aluno. */
export const RPE_TARGET_LABEL = '8–9/10';

/** Status de sessão aceitos como comparáveis para gerar alerta. */
export const COMPARABLE_SESSION_STATUSES = ['completed'] as const;

export const classifySessionRpe = (rpe: number | null | undefined): IntensityStatus => {
  if (rpe == null || !Number.isFinite(Number(rpe))) return 'unknown';
  const v = Number(rpe);
  if (v < 0 || v > 10) return 'unknown';
  if (v <= RPE_THRESHOLDS.veryLowMax) return 'very_low';
  if (v <= RPE_THRESHOLDS.lowMax) return 'low';
  if (v <= RPE_THRESHOLDS.targetMax) return 'target';
  return 'maximal';
};

export const intensityLabel = (status: IntensityStatus): string => {
  switch (status) {
    case 'very_low': return 'Intensidade muito baixa';
    case 'low': return 'Intensidade baixa';
    case 'target': return 'Dentro do alvo';
    case 'maximal': return 'Esforço máximo';
    default: return 'Sem dado de esforço';
  }
};

export interface AttentionInput {
  /** Status real da sessão (workout_sessions.status). */
  sessionStatus?: string | null;
  /** RPE global real da sessão (0–10) ou null. */
  rpe?: number | null;
  /** Fase resolvida (currentPhase.ts). Deload/S4 não gera alerta. */
  phase?: string | null;
  /** Recomendações quantitativas já calculadas pelo motor existente. */
  actions?: ProgressionAction[];
  /** Sessão considerada comparável pela arquitetura existente. */
  comparable?: boolean;
}

export interface AttentionResult {
  intensityStatus: IntensityStatus;
  attentionPriority: AttentionPriority;
  attentionReasons: string[];
}

const isDeloadPhase = (phase?: string | null) => {
  if (!phase) return false;
  const p = String(phase).toLowerCase();
  return p === 's4' || p === 'semana_4' || p.includes('deload');
};

export const isComparableSession = (input: AttentionInput): boolean => {
  if (input.comparable === false) return false;
  const status = (input.sessionStatus || '').toLowerCase();
  return (COMPARABLE_SESSION_STATUSES as readonly string[]).includes(status);
};

export const buildAttentionPriority = (input: AttentionInput): AttentionResult => {
  const intensityStatus = classifySessionRpe(input.rpe);
  const reasons: string[] = [];
  const actions = (input.actions || []).filter((a) => a !== 'maintain');
  const hasProgression = actions.length > 0;

  if (!isComparableSession(input)) {
    return {
      intensityStatus,
      attentionPriority: 'none',
      attentionReasons: ['Sessão não comparável (parcial, abandonada ou ausente)'],
    };
  }

  if (isDeloadPhase(input.phase)) {
    return {
      intensityStatus,
      attentionPriority: 'none',
      attentionReasons: ['Fase de deload — intensidade reduzida é esperada'],
    };
  }

  if (intensityStatus === 'unknown') {
    return {
      intensityStatus,
      attentionPriority: 'none',
      attentionReasons: ['Sem RPE registrado na sessão'],
    };
  }

  const lowIntensity = intensityStatus === 'very_low' || intensityStatus === 'low';

  if (lowIntensity && hasProgression) {
    reasons.push(`Esforço abaixo do alvo (${RPE_TARGET_LABEL})`);
    reasons.push(`${actions.length} progressão(ões) disponível(is)`);
    return { intensityStatus, attentionPriority: 'high', attentionReasons: reasons };
  }

  if (lowIntensity && !hasProgression) {
    reasons.push('Intensidade abaixo do alvo — revisar execução/esforço');
    return { intensityStatus, attentionPriority: 'attention_only', attentionReasons: reasons };
  }

  if (intensityStatus === 'target' && hasProgression) {
    reasons.push('Esforço dentro do alvo com progressão disponível');
    return { intensityStatus, attentionPriority: 'medium', attentionReasons: reasons };
  }

  if (intensityStatus === 'maximal') {
    reasons.push('Esforço máximo — não aumentar carga automaticamente');
    return { intensityStatus, attentionPriority: 'none', attentionReasons: reasons };
  }

  return { intensityStatus, attentionPriority: 'none', attentionReasons: ['Sem pendência de atenção'] };
};

export const attentionPriorityLabel = (p: AttentionPriority): string => {
  switch (p) {
    case 'high': return 'ALTA';
    case 'medium': return 'MÉDIA';
    case 'attention_only': return 'REVISAR';
    default: return '—';
  }
};

const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  high: 0,
  attention_only: 1,
  medium: 2,
  none: 3,
};

export interface SortableReview {
  studentName: string;
  hasPendingReview: boolean;
  attentionPriority: AttentionPriority;
  latestSessionRpe?: number | null;
}

/**
 * Ordem: HIGH pendente → ATTENTION_ONLY pendente → MEDIUM pendente → enviados → nome.
 * Dentro de HIGH: menor RPE primeiro.
 */
export const sortProgressionReviews = <T extends SortableReview>(reviews: T[]): T[] =>
  [...reviews].sort((a, b) => {
    if (a.hasPendingReview !== b.hasPendingReview) return a.hasPendingReview ? -1 : 1;
    if (a.hasPendingReview && b.hasPendingReview) {
      const pa = PRIORITY_ORDER[a.attentionPriority];
      const pb = PRIORITY_ORDER[b.attentionPriority];
      if (pa !== pb) return pa - pb;
      if (a.attentionPriority === 'high') {
        const ra = a.latestSessionRpe ?? 99;
        const rb = b.latestSessionRpe ?? 99;
        if (ra !== rb) return ra - rb;
      }
    }
    return a.studentName.localeCompare(b.studentName);
  });
