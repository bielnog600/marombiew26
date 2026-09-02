/**
 * CAMADA DE PERIODIZAÇÃO — FONTE CANÔNICA (determinística)
 * ========================================================
 *
 * Este módulo é a ÚNICA fonte da verdade da periodização. Ele roda tanto na
 * Edge Function (`trainer-agent`, `workout-renewal-analyzer`) quanto no
 * frontend (`src/lib/periodization.ts` apenas reexporta este arquivo), o que
 * elimina drift entre runtimes por construção.
 *
 * Princípios (ver AJUSTES AO PLANO):
 *  1. A escolha do modelo no modo AUTOMÁTICA é determinística e auditável.
 *     A LLM recebe a decisão pronta — nunca escolhe o modelo.
 *  2. S1/S2/S3/Deload continuam sendo a TIMELINE semanal já existente
 *     (`ai_plans.fase`). Aqui elas apenas ganham significado dentro de
 *     MODELO + BLOCO. Nenhuma fase nova é criada.
 *  3. Campos derivados (semana, volume, intensidade, RIR, reps) NÃO viram
 *     colunas: são calculados por `resolveWeekStrategy` e, quando é preciso
 *     congelar o que foi usado na geração, salvos em `periodization_snapshot`.
 *  4. Progressão quantitativa continua no progression engine. Aqui só se
 *     define o CONTEXTO permitido (preferência por reps/carga, deload trava).
 *  5. Sem FatigueScore: RPE, aderência, performance, feedback e dor são
 *     sinais independentes.
 */

export type PeriodizationModel =
  | 'linear'
  | 'ondulatoria'
  | 'blocos'
  | 'concorrente'
  // Preparados na arquitetura, NÃO selecionáveis nesta versão:
  | 'linear_reversa'
  | 'trifasica'
  // Planos anteriores à camada de periodização:
  | 'legacy';

/** Opção exposta na UI (inclui a automática). */
export type PeriodizationSelection = 'automatica' | PeriodizationModel;

export const SELECTABLE_MODELS: PeriodizationModel[] = [
  'linear',
  'ondulatoria',
  'blocos',
  'concorrente',
];

export const MODEL_LABELS: Record<PeriodizationModel | 'automatica', string> = {
  automatica: 'Automática — o sistema decide',
  linear: 'Linear',
  ondulatoria: 'Ondulatória',
  blocos: 'Por blocos',
  concorrente: 'Concorrente',
  linear_reversa: 'Linear reversa',
  trifasica: 'Trifásica',
  legacy: 'Padrão (plano anterior)',
};

export const MODEL_DESCRIPTIONS: Record<PeriodizationModel | 'automatica', string> = {
  automatica: 'Escolhe o modelo pelo perfil, frequência, histórico e adesão do aluno.',
  linear: 'Progressão simples e previsível ao longo das semanas.',
  ondulatoria: 'Sessões com perfis diferentes (tensão, hipertrofia, volume) na mesma semana.',
  blocos: 'Ciclos com foco distinto: acumulação, intensificação e transição.',
  concorrente: 'Coordena musculação com outra capacidade programada (ex.: corrida).',
  linear_reversa: 'Reduz volume e aumenta intensidade ao longo do ciclo.',
  trifasica: 'Três fases distintas de estímulo dentro do mesmo mesociclo.',
  legacy: 'Plano gerado antes da camada de periodização.',
};

export type BlockType = 'acumulacao' | 'intensificacao' | 'especializacao' | 'transicao';

export const BLOCK_LABELS: Record<BlockType, string> = {
  acumulacao: 'Acumulação',
  intensificacao: 'Intensificação',
  especializacao: 'Especialização',
  transicao: 'Transição / Deload',
};

/** Fase semanal existente no sistema (ai_plans.fase). */
export type WeekPhase = 'semana_1' | 'semana_2' | 'semana_3' | 'deload';

export const WEEK_PHASES: WeekPhase[] = ['semana_1', 'semana_2', 'semana_3', 'deload'];

export const phaseToWeekNumber = (phase: WeekPhase): number =>
  Math.max(1, WEEK_PHASES.indexOf(phase) + 1);

export const weekNumberToPhase = (week: number): WeekPhase =>
  WEEK_PHASES[Math.min(Math.max(Math.trunc(week), 1), 4) - 1];

export type VolumeTarget = 'baixo' | 'moderado' | 'moderado_alto' | 'alto';
export type IntensityTarget = 'baixa' | 'moderada' | 'moderada_alta' | 'alta';
export type ProgressionPreference = 'reps_volume' | 'carga' | 'manter';

export interface SessionProfile {
  /** Índice da sessão dentro da semana (0-based). */
  sessionIndex: number;
  profile: 'tensao' | 'hipertrofia' | 'volume';
  repRange: string;
  rir: string;
}

export interface WeekStrategy {
  weekNumber: number;
  phase: WeekPhase;
  label: string;
  volumeTarget: VolumeTarget;
  intensityTarget: IntensityTarget;
  /** RIR alvo textual (ex.: "2-3"). */
  effortTarget: string;
  repStrategy: string;
  progressionPreference: ProgressionPreference;
  /** Bloqueia recomendações agressivas de carga (deload). */
  blockAggressiveProgression: boolean;
  /** Perfis por sessão — só na ondulatória. */
  sessionProfiles: SessionProfile[];
  notes: string;
}

// ------------------------------------------------------------------
// 1. Seleção automática do modelo (determinística)
// ------------------------------------------------------------------

export interface PeriodizationContext {
  objective?: string | null;
  level?: 'iniciante' | 'intermediario' | 'avancado' | string | null;
  daysPerWeek?: number | null;
  /** Nº de estímulos semanais por grupo muscular (derivado da divisão). */
  weeklyStimuliPerMuscle?: number | null;
  /** Aderência ponderada 0-100 da última semana avaliada. */
  adherencePct?: number | null;
  /** Quantos planos/ciclos o aluno já completou. */
  completedPlans?: number | null;
  /** Segunda capacidade com relevância programática real (ex.: prova de corrida). */
  cardioIsProgrammatic?: boolean | null;
  /** Cardio apenas complementar (Z2 leve, saúde) — NÃO torna concorrente. */
  cardioIsComplementary?: boolean | null;
  primaryCapacity?: string | null;
  secondaryCapacity?: string | null;
  /** Prioridade real de um grupo/capacidade — habilita especialização. */
  priorityFocus?: string | null;
  /** Dor / restrição relevante reportada. */
  painFlags?: boolean | null;
}

export interface ModelDecision {
  model: PeriodizationModel;
  reason: string;
  eligible: PeriodizationModel[];
  /** true quando a decisão veio de escolha manual do professor. */
  manual: boolean;
  dataSufficiency: 'low' | 'medium' | 'high';
}

const normalizeLevel = (level?: string | null): 'iniciante' | 'intermediario' | 'avancado' => {
  const v = String(level || '').toLowerCase();
  if (v.startsWith('avanc')) return 'avancado';
  if (v.startsWith('interm')) return 'intermediario';
  return 'iniciante';
};

export const assessDataSufficiency = (ctx: PeriodizationContext): 'low' | 'medium' | 'high' => {
  let score = 0;
  if (ctx.level) score++;
  if (ctx.daysPerWeek) score++;
  if (ctx.objective) score++;
  if (typeof ctx.adherencePct === 'number') score++;
  if (typeof ctx.completedPlans === 'number' && (ctx.completedPlans ?? 0) > 0) score++;
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
};

/**
 * Escolhe o modelo. Regra de fallback: na dúvida ou com baixa informação,
 * preferir LINEAR em vez de um modelo mais complexo.
 */
export const selectPeriodizationModel = (
  ctx: PeriodizationContext,
  selection: PeriodizationSelection = 'automatica',
): ModelDecision => {
  const dataSufficiency = assessDataSufficiency(ctx);

  if (selection !== 'automatica') {
    return {
      model: selection,
      reason: `Modelo definido manualmente pelo professor: ${MODEL_LABELS[selection]}.`,
      eligible: [selection],
      manual: true,
      dataSufficiency,
    };
  }

  const level = normalizeLevel(ctx.level);
  const days = ctx.daysPerWeek ?? 0;
  const stimuli = ctx.weeklyStimuliPerMuscle ?? (days >= 4 ? 2 : 1);
  const adherence = ctx.adherencePct ?? null;
  const history = ctx.completedPlans ?? 0;

  const eligible: PeriodizationModel[] = ['linear'];

  // CONCORRENTE — só com segunda capacidade programática real.
  const concurrent = !!ctx.cardioIsProgrammatic && !ctx.cardioIsComplementary;
  if (concurrent) eligible.push('concorrente');

  // ONDULATÓRIA — intermediário/avançado, múltiplas exposições, boa adesão.
  const undulating =
    level !== 'iniciante' &&
    stimuli >= 2 &&
    days >= 4 &&
    (adherence === null ? history >= 1 : adherence >= 70);
  if (undulating) eligible.push('ondulatoria');

  // BLOCOS — histórico suficiente e prioridade/fases distintas.
  const blocks =
    level !== 'iniciante' && history >= 2 && dataSufficiency !== 'low';
  if (blocks) eligible.push('blocos');

  if (dataSufficiency === 'low') {
    return {
      model: 'linear',
      reason:
        'Informação insuficiente sobre histórico e adesão — fallback conservador para Linear.',
      eligible,
      manual: false,
      dataSufficiency,
    };
  }

  if (concurrent) {
    return {
      model: 'concorrente',
      reason: `Segunda capacidade com relevância programática (${ctx.secondaryCapacity || 'condicionamento'}) exige coordenação de estímulos.`,
      eligible,
      manual: false,
      dataSufficiency,
    };
  }
  if (blocks && ctx.priorityFocus) {
    return {
      model: 'blocos',
      reason: `Histórico consistente (${history} ciclos) e prioridade clara (${ctx.priorityFocus}) justificam fases distintas.`,
      eligible,
      manual: false,
      dataSufficiency,
    };
  }
  if (undulating) {
    return {
      model: 'ondulatoria',
      reason: `Nível ${level} com ${stimuli} estímulos semanais por grupo e boa adesão — sessões diferenciadas rendem mais.`,
      eligible,
      manual: false,
      dataSufficiency,
    };
  }
  if (blocks) {
    return {
      model: 'blocos',
      reason: `Histórico de ${history} ciclos permite organizar acumulação e intensificação em blocos.`,
      eligible,
      manual: false,
      dataSufficiency,
    };
  }
  return {
    model: 'linear',
    reason:
      level === 'iniciante'
        ? 'Aluno iniciante com objetivo único — progressão linear é a mais eficiente e segura.'
        : 'Perfil sem necessidade real de modelo complexo — Linear é suficiente.',
    eligible,
    manual: false,
    dataSufficiency,
  };
};

// ------------------------------------------------------------------
// 2. Blocos
// ------------------------------------------------------------------

export interface BlockPlan {
  blockType: BlockType;
  blockNumber: number;
  blockTotal: number;
  nextBlockType: BlockType;
  macrocycleWeeks: number;
}

/**
 * Sequência de blocos por objetivo. Especialização só entra quando existe
 * prioridade real — nenhum aluno é obrigado a passar por todas as fases.
 */
export const blockSequenceFor = (
  model: PeriodizationModel,
  hasPriorityFocus: boolean,
): BlockType[] => {
  if (model !== 'blocos') return ['acumulacao'];
  return hasPriorityFocus
    ? ['acumulacao', 'intensificacao', 'especializacao', 'transicao']
    : ['acumulacao', 'intensificacao', 'transicao'];
};

export const resolveBlockPlan = (
  model: PeriodizationModel,
  blockNumber: number,
  hasPriorityFocus: boolean,
): BlockPlan => {
  const seq = blockSequenceFor(model, hasPriorityFocus);
  const total = seq.length;
  const idx = Math.min(Math.max(blockNumber, 1), total) - 1;
  return {
    blockType: seq[idx],
    blockNumber: idx + 1,
    blockTotal: total,
    nextBlockType: seq[(idx + 1) % total],
    macrocycleWeeks: total * 4,
  };
};

// ------------------------------------------------------------------
// 3. Estratégia da semana = MODELO + BLOCO + FASE
// ------------------------------------------------------------------

const DELOAD_STRATEGY = (phase: WeekPhase, weekNumber: number, note: string): WeekStrategy => ({
  weekNumber,
  phase,
  label: 'Deload — recuperação',
  volumeTarget: 'baixo',
  intensityTarget: 'baixa',
  effortTarget: '4-5',
  repStrategy: '8-12 confortáveis, longe da falha',
  progressionPreference: 'manter',
  blockAggressiveProgression: true,
  sessionProfiles: [],
  notes: note,
});

const undulatingProfiles = (daysPerWeek: number, intensify: boolean): SessionProfile[] => {
  const cycle: Array<SessionProfile['profile']> = ['tensao', 'hipertrofia', 'volume'];
  const out: SessionProfile[] = [];
  const days = Math.max(1, daysPerWeek || 3);
  for (let i = 0; i < days; i++) {
    const p = cycle[i % cycle.length];
    out.push({
      sessionIndex: i,
      profile: p,
      repRange: p === 'tensao' ? '5-8' : p === 'hipertrofia' ? '8-12' : '12-18',
      rir: p === 'tensao' ? (intensify ? '1-2' : '2-3') : p === 'hipertrofia' ? (intensify ? '1-2' : '2') : '1-2',
    });
  }
  return out;
};

export interface WeekStrategyInput {
  model: PeriodizationModel;
  blockType: BlockType;
  phase: WeekPhase;
  daysPerWeek?: number | null;
}

export const resolveWeekStrategy = (input: WeekStrategyInput): WeekStrategy => {
  const { model, blockType, phase } = input;
  const weekNumber = phaseToWeekNumber(phase);
  const days = input.daysPerWeek ?? 3;

  if (phase === 'deload' || blockType === 'transicao') {
    return DELOAD_STRATEGY(
      phase,
      weekNumber,
      'Reduzir volume e intensidade. Nenhuma técnica avançada. Nenhum aumento de carga.',
    );
  }

  if (model === 'ondulatoria') {
    const intensify = weekNumber >= 2;
    return {
      weekNumber,
      phase,
      label: weekNumber === 1 ? 'Calibração ondulatória' : weekNumber === 2 ? 'Ondulação com progressão' : 'Ondulação em pico',
      volumeTarget: weekNumber === 3 ? 'alto' : 'moderado_alto',
      intensityTarget: weekNumber === 1 ? 'moderada' : weekNumber === 2 ? 'moderada_alta' : 'alta',
      effortTarget: weekNumber === 1 ? '2-3' : weekNumber === 2 ? '1-2' : '1',
      repStrategy: 'Faixas distintas por sessão (tensão 5-8 / hipertrofia 8-12 / volume 12-18)',
      progressionPreference: weekNumber >= 3 ? 'carga' : 'reps_volume',
      blockAggressiveProgression: false,
      sessionProfiles: undulatingProfiles(days, intensify),
      notes:
        'Cada sessão da semana deve ter perfil funcional próprio (tensão, hipertrofia moderada, volume). Não basta mudar a faixa de reps: seleção de exercícios, pausas e RIR devem acompanhar o perfil.',
    };
  }

  if (model === 'blocos' && blockType === 'intensificacao') {
    return {
      weekNumber,
      phase,
      label: weekNumber === 1 ? 'Entrada na intensificação' : weekNumber === 2 ? 'Progressão de carga' : 'Pico de intensidade',
      volumeTarget: weekNumber === 3 ? 'moderado' : 'moderado_alto',
      intensityTarget: weekNumber === 1 ? 'moderada_alta' : 'alta',
      effortTarget: weekNumber === 1 ? '2' : weekNumber === 2 ? '1-2' : '0-1',
      repStrategy: 'Principais 5-8, acessórios 8-12',
      progressionPreference: 'carga',
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes: 'Bloco de intensificação: prioridade em carga nos exercícios âncora, volume acessório contido.',
    };
  }

  if (model === 'blocos' && blockType === 'especializacao') {
    return {
      weekNumber,
      phase,
      label: `Especialização — semana ${weekNumber}`,
      volumeTarget: weekNumber === 3 ? 'alto' : 'moderado_alto',
      intensityTarget: 'moderada_alta',
      effortTarget: weekNumber === 1 ? '2-3' : '1-2',
      repStrategy: 'Grupo prioritário 8-15 com frequência extra; demais em manutenção',
      progressionPreference: 'reps_volume',
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes: 'Concentrar volume no foco prioritário e manter os demais grupos em volume de manutenção.',
    };
  }

  if (model === 'concorrente') {
    return {
      weekNumber,
      phase,
      label: `Concorrente — semana ${weekNumber}`,
      volumeTarget: weekNumber === 3 ? 'moderado_alto' : 'moderado',
      intensityTarget: weekNumber === 1 ? 'moderada' : 'moderada_alta',
      effortTarget: weekNumber === 1 ? '3' : '2',
      repStrategy: 'Principais 6-10, acessórios 10-15',
      progressionPreference: weekNumber >= 2 ? 'carga' : 'reps_volume',
      blockAggressiveProgression: false,
      sessionProfiles: [],
      notes:
        'Coordenar com a capacidade secundária: evitar dias duros de pernas colados a sessões-chave de cardio, manter progressão conservadora.',
    };
  }

  // LINEAR (e acumulação por blocos / legacy) — progressão semanal simples.
  const accumulation = model === 'blocos' && blockType === 'acumulacao';
  return {
    weekNumber,
    phase,
    label:
      weekNumber === 1
        ? accumulation ? 'Acumulação — calibração' : 'Base técnica'
        : weekNumber === 2
          ? accumulation ? 'Acumulação — progressão de volume' : 'Progressão'
          : accumulation ? 'Acumulação — maior estímulo' : 'Overload',
    volumeTarget: weekNumber === 1 ? 'moderado' : weekNumber === 2 ? 'moderado_alto' : 'alto',
    intensityTarget: weekNumber === 1 ? 'moderada' : weekNumber === 2 ? 'moderada_alta' : 'alta',
    effortTarget: weekNumber === 1 ? '3' : weekNumber === 2 ? '2' : '1-2',
    repStrategy: accumulation ? 'Principais 8-12, acessórios 12-15' : 'Principais 6-10, acessórios 10-15',
    progressionPreference: accumulation ? 'reps_volume' : weekNumber >= 3 ? 'carga' : 'reps_volume',
    blockAggressiveProgression: false,
    sessionProfiles: [],
    notes: accumulation
      ? 'Bloco de acumulação: progredir prioritariamente em repetições e volume antes de subir carga.'
      : 'Progressão linear: mesma estrutura entre semanas, com aumento gradual de exigência.',
  };
};

// ------------------------------------------------------------------
// 4. Snapshot (congela o que foi usado na geração)
// ------------------------------------------------------------------

export interface PeriodizationSnapshot {
  version: 1;
  model: PeriodizationModel;
  reason: string;
  manual: boolean;
  dataSufficiency: 'low' | 'medium' | 'high';
  block: BlockPlan;
  week: WeekStrategy;
  resolvedAt: string;
}

export interface ResolvePeriodizationInput {
  selection?: PeriodizationSelection;
  context: PeriodizationContext;
  phase: WeekPhase;
  blockNumber?: number;
  now?: Date;
}

/** Resolve tudo de uma vez: modelo + bloco + estratégia da semana. */
export const resolvePeriodization = (
  input: ResolvePeriodizationInput,
): PeriodizationSnapshot => {
  const decision = selectPeriodizationModel(input.context, input.selection ?? 'automatica');
  const block = resolveBlockPlan(
    decision.model,
    input.blockNumber ?? 1,
    !!input.context.priorityFocus,
  );
  const week = resolveWeekStrategy({
    model: decision.model,
    blockType: block.blockType,
    phase: input.phase,
    daysPerWeek: input.context.daysPerWeek ?? null,
  });
  return {
    version: 1,
    model: decision.model,
    reason: decision.reason,
    manual: decision.manual,
    dataSufficiency: decision.dataSufficiency,
    block,
    week,
    resolvedAt: (input.now ?? new Date()).toISOString(),
  };
};

// ------------------------------------------------------------------
// 5. Próximo passo do ciclo (sinais objetivos, sem decisão clínica)
// ------------------------------------------------------------------

export type NextStepAction =
  | 'continue_block'
  | 'advance_block'
  | 'repeat_week'
  | 'deload'
  | 'review_required';

export interface NextStepSignals {
  plannedWeek: number;
  completedSessions?: number | null;
  plannedSessions?: number | null;
  weightedAdherence?: number | null;
  /** Resumo do progression engine: quantos exercícios progrediram / regrediram. */
  progressionSummary?: { improved: number; regressed: number; neutral: number } | null;
  recentRpe?: number | null;
  painFlags?: boolean | null;
  feedbackFlags?: boolean | null;
  blockCompleted?: boolean | null;
  dataSufficiency?: 'low' | 'medium' | 'high';
}

export interface NextStepDecision {
  action: NextStepAction;
  reason: string;
}

export const resolveNextStep = (s: NextStepSignals): NextStepDecision => {
  if (s.painFlags) {
    return { action: 'review_required', reason: 'Dor ou restrição reportada — revisão humana obrigatória.' };
  }
  if (s.feedbackFlags) {
    return { action: 'review_required', reason: 'Feedback do aluno sinaliza problema — revisão humana antes de avançar.' };
  }

  const adherence = s.weightedAdherence ?? null;
  const sufficiency = s.dataSufficiency ?? 'medium';

  if (sufficiency === 'low' || adherence === null) {
    // Sem dados suficientes: planejamento temporal conservador.
    if (s.plannedWeek >= 4) return { action: 'deload', reason: 'Sem dados suficientes — seguindo a timeline: semana 4 é deload.' };
    return { action: 'continue_block', reason: 'Sem dados suficientes — seguir a timeline planejada sem sofisticar.' };
  }

  if (s.plannedWeek >= 4) {
    return s.blockCompleted
      ? { action: 'advance_block', reason: 'Deload concluído e bloco fechado — avançar para o próximo bloco.' }
      : { action: 'deload', reason: 'Semana 4 do bloco — executar deload antes de avançar.' };
  }

  if (adherence < 50) {
    return { action: 'repeat_week', reason: `Aderência de ${Math.round(adherence)}% — repetir a semana antes de progredir.` };
  }

  if (typeof s.recentRpe === 'number' && s.recentRpe >= 9.5 && (s.progressionSummary?.regressed ?? 0) > (s.progressionSummary?.improved ?? 0)) {
    return { action: 'deload', reason: 'RPE muito alto com performance em queda — antecipar deload.' };
  }

  return { action: 'continue_block', reason: 'Aderência e performance dentro do esperado — seguir o bloco.' };
};

// ------------------------------------------------------------------
// 6. Anchors e similaridade na renovação
// ------------------------------------------------------------------

export interface AnchorAudit {
  anchorsPrevious: number;
  anchorsRetained: number;
  anchorsProgressed: number;
  anchorsRotated: number;
  retentionRate: number;
}

const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export const auditAnchors = (
  previousAnchors: string[],
  nextExercises: string[],
  progressedAnchors: string[] = [],
): AnchorAudit => {
  const next = new Set(nextExercises.map(normalizeName));
  const prev = previousAnchors.map(normalizeName);
  const retained = prev.filter((a) => next.has(a));
  const progressedSet = new Set(progressedAnchors.map(normalizeName));
  return {
    anchorsPrevious: prev.length,
    anchorsRetained: retained.length,
    anchorsProgressed: retained.filter((a) => progressedSet.has(a)).length,
    anchorsRotated: prev.length - retained.length,
    retentionRate: prev.length === 0 ? 1 : retained.length / prev.length,
  };
};

export interface SimilarityJudgement {
  ok: boolean;
  action: 'accept' | 'review';
  reason: string;
}

/**
 * Similaridade é SINAL DE QUALIDADE DE CONTINUIDADE, não meta.
 * Sem threshold rígido: cruzamos similaridade geral, retenção de anchors e
 * existência de motivo técnico para a mudança.
 */
export const judgeContinuity = (
  overallSimilarity: number,
  anchors: AnchorAudit,
  technicalChangeReason?: string | null,
): SimilarityJudgement => {
  const hasReason = !!(technicalChangeReason && technicalChangeReason.trim().length > 0);
  if (anchors.retentionRate >= 0.5 || hasReason) {
    return {
      ok: true,
      action: 'accept',
      reason: hasReason
        ? `Mudanças justificadas tecnicamente (${technicalChangeReason}).`
        : `Âncoras preservadas (${anchors.anchorsRetained}/${anchors.anchorsPrevious}).`,
    };
  }
  if (overallSimilarity >= 0.6) {
    return { ok: true, action: 'accept', reason: 'Alta continuidade geral com o plano anterior.' };
  }
  return {
    ok: false,
    action: 'review',
    reason: `Baixa continuidade (${Math.round(overallSimilarity * 100)}%) sem preservação de âncoras nem motivo técnico declarado.`,
  };
};

// ------------------------------------------------------------------
// 7. Bloco de contexto enviado ao trainer-agent
// ------------------------------------------------------------------

export const buildPeriodizationPromptBlock = (snap: PeriodizationSnapshot): string => {
  const w = snap.week;
  const lines: string[] = [
    '',
    '========================================',
    '📐 CAMADA DE PERIODIZAÇÃO (DECISÃO JÁ TOMADA PELO SISTEMA — NÃO ESCOLHER OUTRO MODELO)',
    '========================================',
    `MODELO: ${MODEL_LABELS[snap.model]} (${snap.model})`,
    `MOTIVO DA ESCOLHA: ${snap.reason}`,
    `BLOCO: ${BLOCK_LABELS[snap.block.blockType]} (${snap.block.blockNumber}/${snap.block.blockTotal}) — próximo bloco: ${BLOCK_LABELS[snap.block.nextBlockType]}`,
    `SEMANA: ${w.weekNumber} de 4 — ${w.label}`,
    `VOLUME ALVO: ${w.volumeTarget}`,
    `INTENSIDADE ALVO: ${w.intensityTarget}`,
    `RIR ALVO: ${w.effortTarget}`,
    `FAIXAS DE REPETIÇÃO (tendência dos principais): ${w.repStrategy}`,
    `PREFERÊNCIA DE PROGRESSÃO: ${w.progressionPreference}`,
    `OBSERVAÇÃO DO MODELO: ${w.notes}`,
  ];

  if (w.blockAggressiveProgression) {
    lines.push('⚠️ DELOAD ATIVO: PROIBIDO aumentar carga, volume ou usar técnicas avançadas.');
  }

  if (w.sessionProfiles.length > 0) {
    lines.push('PERFIL POR SESSÃO (ondulação real, não aleatória) — a faixa abaixo é TENDÊNCIA DOS EXERCÍCIOS PRINCIPAIS, não faixa única do dia:');
    for (const p of w.sessionProfiles) {
      lines.push(`  • Dia ${p.sessionIndex + 1}: perfil ${p.profile} — reps dos principais ${p.repRange}, RIR ${p.rir}. Acessórios, pequenos grupos, panturrilha, core e mobilidade seguem as faixas da sua função.`);
    }
    lines.push('  Dois dias com o mesmo perfil e mesmas faixas NÃO são ondulação — diferencie seleção de exercícios, pausas e ênfase.');
  }

  lines.push(
    'REGRA: o modelo acima deve influenciar de fato volume, intensidade, RIR, faixas de repetição e diferenciação entre sessões. Você pode EXPLICAR a escolha no resumo, mas NUNCA trocá-la.',
    '========================================',
    '',
  );
  return lines.join('\n');
};

/** Campos persistidos em ai_plans (apenas decisões estruturais + snapshot). */
export const snapshotToPlanColumns = (
  snap: PeriodizationSnapshot,
  blockStartDate?: string | null,
): Record<string, unknown> => {
  const start = blockStartDate ?? new Date().toISOString().slice(0, 10);
  const end = new Date(start);
  end.setDate(end.getDate() + 28);
  return {
    periodization_model: snap.model,
    periodization_reason: snap.reason,
    macrocycle_weeks: snap.block.macrocycleWeeks,
    block_type: snap.block.blockType,
    block_number: snap.block.blockNumber,
    block_total: snap.block.blockTotal,
    next_block_type: snap.block.nextBlockType,
    block_start_date: start,
    block_end_date: end.toISOString().slice(0, 10),
    periodization_snapshot: snap as unknown as Record<string, unknown>,
  };
};
