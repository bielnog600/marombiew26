/**
 * Ponte entre o fluxo de RENOVAÇÃO de treino e a camada canônica de
 * periodização (`./periodization.ts`).
 *
 * Aqui NÃO existe matemática nova: só montagem de sinais a partir do que os
 * engines já calcularam (aderência, performance, RPE, feedback) e tradução da
 * decisão do resolver em snapshot + contexto de prompt.
 */

import {
  resolvePeriodization,
  resolveNextStep,
  auditAnchors,
  judgeContinuity,
  buildPeriodizationPromptBlock,
  BLOCK_LABELS,
  MODEL_LABELS,
  phaseToWeekNumber,
  weekNumberToPhase,
  type AnchorAudit,
  type BlockType,
  type NextStepDecision,
  type PeriodizationModel,
  type PeriodizationSelection,
  type PeriodizationSnapshot,
  type WeekPhase,
} from "./periodization.ts";

export interface RenewalPlanLike {
  fase?: string | null;
  fase_inicio_data?: string | null;
  version?: number | null;
  renewal_mode?: string | null;
  conteudo?: string | null;
  periodization_model?: string | null;
  periodization_snapshot?: Record<string, unknown> | null;
  block_type?: string | null;
  block_number?: number | null;
  block_total?: number | null;
  next_block_type?: string | null;
}

export interface RenewalContextLike {
  adherence_score?: number | null;
  avg_rpe?: number | null;
  sessions_in_window?: number | null;
  session_frequency?: number | null;
  data_quality?: string | null;
  pain_alerts?: unknown[] | null;
  recent_checkins?: Record<string, unknown>[] | null;
  objetivo?: string | null;
  restricoes?: string | null;
  lesoes?: string | null;
  recent_exercise_stats?: ExerciseStat[] | null;
  load_progression?: string | null;
  reps_progression?: string | null;
}

export interface ExerciseStat {
  name: string;
  sets: number;
  load_trend?: string | null;
  reps_trend?: string | null;
  max_load_kg?: number | null;
}

const VALID_MODELS = new Set([
  "linear",
  "ondulatoria",
  "blocos",
  "concorrente",
  "linear_reversa",
  "trifasica",
]);

const VALID_BLOCKS = new Set(["acumulacao", "intensificacao", "especializacao", "transicao"]);

/** Semana planejada atual: snapshot > fase do plano > timeline > 1. */
export const resolvePlannedWeek = (plan: RenewalPlanLike, now: Date = new Date()): number => {
  const snapWeek = (plan.periodization_snapshot as any)?.week?.weekNumber;
  if (typeof snapWeek === "number" && snapWeek >= 1 && snapWeek <= 4) return snapWeek;

  const fase = plan.fase ?? null;
  if (fase && ["semana_1", "semana_2", "semana_3", "deload"].includes(fase)) {
    return phaseToWeekNumber(fase as WeekPhase);
  }

  if (plan.fase_inicio_data) {
    const start = new Date(plan.fase_inicio_data);
    if (!Number.isNaN(start.getTime())) {
      const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
      if (days >= 0) return (Math.floor(days / 7) % 4) + 1;
    }
  }
  return 1;
};

/** Sinais objetivos do resolver — todos vindos dos engines existentes. */
export const buildNextStepSignals = (plan: RenewalPlanLike, ctx: RenewalContextLike) => {
  const plannedWeek = resolvePlannedWeek(plan);
  const adherence =
    typeof ctx.adherence_score === "number" ? Math.round(ctx.adherence_score * 100) : null;

  const painFlags =
    (ctx.pain_alerts?.length ?? 0) > 0 ||
    hasPainFeedback(ctx.recent_checkins ?? []);

  const feedbackFlags = hasProblemFeedback(ctx.recent_checkins ?? []);

  const improved = countTrend(ctx.recent_exercise_stats ?? [], "subindo");
  const regressed = countTrend(ctx.recent_exercise_stats ?? [], "descendo");
  const neutral = (ctx.recent_exercise_stats?.length ?? 0) - improved - regressed;

  const dataSufficiency: "low" | "medium" | "high" =
    ctx.data_quality === "sufficient" ? "high" : ctx.data_quality === "partial" ? "medium" : "low";

  return {
    plannedWeek,
    completedSessions: ctx.sessions_in_window ?? null,
    weightedAdherence: adherence,
    progressionSummary: { improved, regressed, neutral: Math.max(0, neutral) },
    recentRpe: ctx.avg_rpe ?? null,
    painFlags,
    feedbackFlags,
    blockCompleted: plannedWeek >= 4,
    dataSufficiency,
  };
};

const countTrend = (stats: ExerciseStat[], t: string) =>
  stats.filter((s) => s.load_trend === t || s.reps_trend === t).length;

const painRe = /dor|lesao|lesão|desconforto|incomod/i;

const hasPainFeedback = (checkins: Record<string, unknown>[]) =>
  checkins.some((c) =>
    Object.entries(c).some(
      ([k, v]) => painRe.test(k) && (v === true || (typeof v === "string" && v.trim().length > 2)),
    ),
  );

const hasProblemFeedback = (checkins: Record<string, unknown>[]) =>
  checkins.some((c) => {
    const dif = Number((c as any).dificuldade ?? NaN);
    const rec = Number((c as any).recuperacao ?? NaN);
    const mot = Number((c as any).motivacao ?? NaN);
    return (
      (!Number.isNaN(dif) && dif >= 9) ||
      (!Number.isNaN(rec) && rec <= 2) ||
      (!Number.isNaN(mot) && mot <= 2)
    );
  });

// ------------------------------------------------------------------
// Anchors
// ------------------------------------------------------------------

export type AnchorClass = "manter" | "progredir" | "rotacionar" | "remover";

export interface AnchorPlan {
  keep: string[];
  progress: string[];
  rotate: string[];
  remove: string[];
  /** Âncoras que devem sobreviver à renovação (manter + progredir). */
  anchors: string[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Extrai nomes de exercícios de uma tabela markdown de treino. */
export const extractPlanExercises = (markdown: string | null | undefined): string[] => {
  if (!markdown) return [];
  const out = new Set<string>();
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    // 1ª coluna = dia, 2ª = exercício (formato oficial das 9 colunas)
    const name = cells[2] ?? "";
    if (!name || /^-+$/.test(name)) continue;
    if (/^(exerc[ií]cio|treino do dia)$/i.test(name)) continue;
    if (name.length < 3) continue;
    out.add(norm(name));
  }
  return Array.from(out);
};

export const classifyAnchors = (
  planExercises: string[],
  stats: ExerciseStat[],
  painTerms: string[] = [],
): AnchorPlan => {
  const byName = new Map(stats.map((s) => [norm(s.name), s]));
  const keep: string[] = [];
  const progress: string[] = [];
  const rotate: string[] = [];
  const remove: string[] = [];

  const painful = (name: string) =>
    painTerms.some((t) => t.length > 2 && name.includes(norm(t)));

  for (const ex of planExercises) {
    if (painful(ex)) {
      remove.push(ex);
      continue;
    }
    const s = byName.get(ex);
    if (!s) {
      keep.push(ex);
      continue;
    }
    if (s.load_trend === "subindo" || s.reps_trend === "subindo") progress.push(ex);
    else if (s.load_trend === "descendo") rotate.push(ex);
    else if (s.sets >= 6 && s.load_trend === "estavel" && s.reps_trend === "estavel") rotate.push(ex);
    else keep.push(ex);
  }

  return { keep, progress, rotate, remove, anchors: [...keep, ...progress] };
};

// ------------------------------------------------------------------
// Resolução da renovação
// ------------------------------------------------------------------

export interface RenewalPeriodization {
  snapshot: PeriodizationSnapshot;
  nextStep: NextStepDecision;
  anchors: AnchorPlan;
  reviewRequired: boolean;
  plannedWeek: number;
}

const asModel = (v: unknown): PeriodizationModel | null =>
  typeof v === "string" && VALID_MODELS.has(v) ? (v as PeriodizationModel) : null;

const asBlock = (v: unknown): BlockType | null =>
  typeof v === "string" && VALID_BLOCKS.has(v) ? (v as BlockType) : null;

export const resolveRenewalPeriodization = (
  plan: RenewalPlanLike,
  ctx: RenewalContextLike,
  now: Date = new Date(),
): RenewalPeriodization => {
  const signals = buildNextStepSignals(plan, ctx);
  const nextStep = resolveNextStep(signals);
  const plannedWeek = signals.plannedWeek;

  const currentBlockNumber = plan.block_number ?? 1;
  let blockNumber = currentBlockNumber;
  let phase: WeekPhase;

  switch (nextStep.action) {
    case "advance_block":
      blockNumber = currentBlockNumber + 1;
      phase = "semana_1";
      break;
    case "deload":
      phase = "deload";
      break;
    case "repeat_week":
      phase = weekNumberToPhase(plannedWeek);
      break;
    case "review_required":
      phase = weekNumberToPhase(plannedWeek);
      break;
    default: // continue_block
      phase = weekNumberToPhase(Math.min(4, plannedWeek + 1));
      break;
  }

  const existingModel = asModel(plan.periodization_model);
  const selection: PeriodizationSelection = existingModel ?? "automatica";

  const snapshot = resolvePeriodization({
    selection,
    phase,
    blockNumber,
    now,
    context: {
      objective: ctx.objetivo ?? null,
      level: null,
      daysPerWeek: ctx.session_frequency ? Math.round(ctx.session_frequency) : null,
      completedPlans: plan.version ?? 1,
      painFlags: signals.painFlags,
    },
  });

  // Continuidade de bloco: continue/repeat/deload NÃO mudam o tipo de bloco atual.
  const currentBlock = asBlock(plan.block_type);
  if (currentBlock && nextStep.action !== "advance_block") {
    snapshot.block = { ...snapshot.block, blockType: currentBlock };
  }

  const painTerms = [ctx.lesoes ?? "", ctx.restricoes ?? ""]
    .join(" ")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const anchors = classifyAnchors(
    extractPlanExercises(plan.conteudo),
    ctx.recent_exercise_stats ?? [],
    painTerms,
  );

  return {
    snapshot,
    nextStep,
    anchors,
    reviewRequired: nextStep.action === "review_required",
    plannedWeek,
  };
};

// ------------------------------------------------------------------
// Contexto para o trainer-agent
// ------------------------------------------------------------------

const list = (xs: string[], max = 12) =>
  xs.length === 0 ? "— (nenhum)" : xs.slice(0, max).join(", ") + (xs.length > max ? ", …" : "");

export const buildRenewalPromptBlock = (r: RenewalPeriodization, retryReason?: string): string => {
  const s = r.snapshot;
  const lines: string[] = [
    buildPeriodizationPromptBlock(s),
    "=== PERIODIZATION RENEWAL CONTEXT ===",
    `MODELO: ${MODEL_LABELS[s.model]} (${s.model})`,
    `BLOCO ATUAL: ${BLOCK_LABELS[s.block.blockType]} (${s.block.blockNumber}/${s.block.blockTotal})`,
    `SEMANA ATUAL PLANEJADA: ${r.plannedWeek} → SEMANA DESTA RENOVAÇÃO: ${s.week.weekNumber}`,
    `DECISÃO DO RESOLVER: ${r.nextStep.action} — ${r.nextStep.reason}`,
    `PRÓXIMO BLOCO: ${BLOCK_LABELS[s.block.nextBlockType]}`,
    `ESTRATÉGIA DE VOLUME: ${s.week.volumeTarget}`,
    `ESTRATÉGIA DE INTENSIDADE: ${s.week.intensityTarget}`,
    `ESFORÇO ALVO (RIR): ${s.week.effortTarget}`,
    `FAIXAS DE REPETIÇÃO: ${s.week.repStrategy}`,
    `ÂNCORAS A MANTER: ${list(r.anchors.keep)}`,
    `ÂNCORAS A PROGREDIR (mesma seleção, mais carga/reps): ${list(r.anchors.progress)}`,
    `ELEGÍVEIS PARA ROTAÇÃO (só se necessário): ${list(r.anchors.rotate)}`,
    `REMOVER (dor/restrição): ${list(r.anchors.remove)}`,
    "REQUISITO DE CONTINUIDADE: altere primeiro carga, reps, RIR, séries, técnicas e acessórios. Só troque um exercício âncora que continua funcionando se houver motivo técnico explícito.",
  ];

  if (r.nextStep.action === "repeat_week") {
    lines.push(
      "REPETIR SEMANA: preservar modelo, bloco, arquitetura, âncoras e volume aproximado. Ajustar apenas o necessário para o aluno completar a estratégia planejada.",
    );
  }
  if (r.nextStep.action === "continue_block") {
    lines.push("CONTINUAR BLOCO: não iniciar um bloco novo; manter a característica do bloco atual.");
  }
  if (r.nextStep.action === "deload") {
    lines.push(
      "DELOAD REQUIRED: reduzir volume e esforço, sem overload agressivo e sem técnicas avançadas. Âncoras podem permanecer — não troque tudo só porque é deload.",
    );
  }
  if (r.reviewRequired) {
    lines.push(
      "REVIEW REQUIRED: proposta conservadora. Não introduza mudanças agressivas; o professor vai revisar antes de publicar.",
    );
  }
  if (retryReason) {
    lines.push(`CORREÇÃO OBRIGATÓRIA DA TENTATIVA ANTERIOR: ${retryReason}`);
  }

  lines.push(
    "A decisão de periodização acima foi calculada deterministicamente pelo MAROMBIEW. Você NÃO pode trocar o modelo, o bloco ou o next_step. Sua função é prescrever o treino dentro desta estratégia.",
    "=== FIM PERIODIZATION RENEWAL CONTEXT ===",
    "",
  );
  return lines.join("\n");
};

// ------------------------------------------------------------------
// Validação de continuidade pós-geração
// ------------------------------------------------------------------

export interface ContinuityCheck {
  ok: boolean;
  similarity: number;
  audit: AnchorAudit;
  reason: string;
}

/** Similaridade simples por sobreposição de exercícios (sinal, não meta). */
export const exerciseOverlap = (prev: string[], next: string[]): number => {
  if (prev.length === 0) return 1;
  const n = new Set(next.map(norm));
  const hits = prev.filter((p) => n.has(norm(p))).length;
  return hits / prev.length;
};

export const checkRenewalContinuity = (
  r: RenewalPeriodization,
  newContent: string,
  technicalReason?: string | null,
): ContinuityCheck => {
  const nextExercises = extractPlanExercises(newContent);
  const audit = auditAnchors(r.anchors.anchors, nextExercises, r.anchors.progress);
  const similarity = exerciseOverlap(
    [...r.anchors.keep, ...r.anchors.progress, ...r.anchors.rotate],
    nextExercises,
  );
  const judgement = judgeContinuity(similarity, audit, technicalReason ?? null);
  return {
    ok: judgement.ok,
    similarity,
    audit,
    reason: judgement.ok
      ? judgement.reason
      : `CONTINUITY VALIDATION FAILED: similaridade ${Math.round(similarity * 100)}%, âncoras mantidas ${audit.anchorsRetained}/${audit.anchorsPrevious}. Preserve as âncoras adequadas e reduza rotação sem justificativa.`,
  };
};

export { snapshotToPlanColumns } from "./periodization.ts";
