/**
 * Regra "plank" (prancha, prancha frontal) — vista lateral, EXERCÍCIO DE TEMPO (não conta reps).
 * O cronômetro só anda em boa posição; o resumo grava os segundos no lugar das reps.
 */
import {
  DEFAULT_DEPTH_LEVEL, SIDE_POINTS, angleAt, normalizeDepthLevel, pickSide, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { arePointsVisible, round6, type LiveSessionSummary } from './common';
import type { ExerciseRule, LiveRep, TimedCounter, TimedFrame, TimedSummary } from './types';

/** Linha do corpo (ombro-quadril-tornozelo) a partir disto = boa posição. */
export const PLANK_MIN_LINE_ANGLE = 165;
/** Ombro→tornozelo inclinado até isto (graus) em relação ao chão = corpo na horizontal. */
export const PLANK_MAX_TILT = 30;
/** Joelho (quadril-joelho-tornozelo) abaixo disto = joelho no chão / pernas dobradas, fora da posição. */
export const PLANK_MIN_KNEE_ANGLE = 150;
/** Erro de quadril só conta (e fala) depois de se manter por isto (ms), para não piscar. */
export const PLANK_FAULT_MS = 300;
/** Fora da posição por mais que isto (ms) encerra a série ("Fechou"). */
export const PLANK_OUT_FINISH_MS = 3000;
/** Fala o tempo em boa posição a cada isto (s): "dez", "vinte"… */
export const PLANK_SPEAK_EVERY_SECONDS = 10;
/** Frame mais longo que isto (ms, ex.: app em segundo plano) conta só até este limite. */
export const PLANK_MAX_FRAME_MS = 500;
export const PLANK_FINISH_MESSAGE = 'Fechou';

export type PlankFault = 'plank_hip_low' | 'plank_hip_high';
export const PLANK_MESSAGES: Record<PlankFault, string> = {
  plank_hip_low: 'Sobe o quadril',
  plank_hip_high: 'Desce o quadril',
};

export const PLANK_INSTRUCTION = 'Coloca o celular no chão, de lado, com o corpo inteiro aparecendo na prancha';
export const PLANK_NOT_HORIZONTAL_MESSAGE = 'Fica na posição de prancha';
export const PLANK_KNEE_DOWN_MESSAGE = 'Tira o joelho do chão';

export interface PlankMetrics {
  /** Ombro-quadril-tornozelo (180 = reto). */
  lineAngle: number;
  /** Quadril abaixo (+) ou acima (−) da linha ombro→tornozelo, na imagem, em fração dessa linha. */
  hipOffset: number;
  /** Inclinação de ombro→tornozelo em relação à horizontal (0 = deitado reto). */
  tilt: number;
  kneeAngle: number;
}

export function plankMetrics(lms: Landmark[], width: number, height: number, side: Side): PlankMetrics {
  const p = SIDE_POINTS[side];
  const sh = toPx(lms[p.shoulder], width, height);
  const hip = toPx(lms[p.hip], width, height);
  const knee = toPx(lms[p.knee], width, height);
  const ankle = toPx(lms[p.ankle], width, height);
  const dx = ankle.x - sh.x, dy = ankle.y - sh.y;
  const len2 = dx * dx + dy * dy || 1;
  const k = ((hip.x - sh.x) * dx + (hip.y - sh.y) * dy) / len2;
  const lineY = sh.y + k * dy;
  return {
    lineAngle: angleAt(sh, hip, ankle),
    hipOffset: (hip.y - lineY) / Math.sqrt(len2),
    tilt: (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI,
    kneeAngle: angleAt(hip, knee, ankle),
  };
}

/** O que impede de estar na prancha (null = na posição). */
export function plankPositionIssue(m: PlankMetrics): string | null {
  if (round6(m.tilt) > PLANK_MAX_TILT) return PLANK_NOT_HORIZONTAL_MESSAGE;
  if (round6(m.kneeAngle) < PLANK_MIN_KNEE_ANGLE) return PLANK_KNEE_DOWN_MESSAGE;
  return null;
}

/** Erro de quadril na posição (null = boa posição). */
export function judgePlank(m: PlankMetrics): PlankFault | null {
  if (round6(m.lineAngle) >= PLANK_MIN_LINE_ANGLE) return null;
  return m.hipOffset > 0 ? 'plank_hip_low' : 'plank_hip_high';
}

export class PlankCounter implements TimedCounter {
  readonly ruleId = 'plank' as const;
  readonly timed = true as const;
  /** Prancha não conta reps. */
  readonly reps: LiveRep[] = [];
  readonly inRep = false;
  private lastT: number | null = null;
  private totalMs = 0;
  private goodMs = 0;
  private fault: PlankFault | null = null;
  private candidate: PlankFault | null = null;
  private candidateSince: number | null = null;
  private faults: Record<PlankFault, number> = { plank_hip_low: 0, plank_hip_high: 0 };
  private outSince: number | null = null;
  private everIn = false;
  private lastTen = 0;
  private lastIn = false;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get atTop() { return this.lastIn; }

  reset() {
    this.lastT = null;
    this.totalMs = 0;
    this.goodMs = 0;
    this.fault = null;
    this.candidate = null;
    this.candidateSince = null;
    this.faults = { plank_hip_low: 0, plank_hip_high: 0 };
    this.outSince = null;
    this.everIn = false;
    this.lastTen = 0;
    this.lastIn = false;
  }
  abortRep() { /* sem reps */ }
  waitForStanding() { /* o cronômetro já só anda na posição */ }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update() { return null; }

  track(lms: Landmark[] | null, width: number, height: number, side: Side, t: number): TimedFrame {
    return this.push(lms ? plankMetrics(lms, width, height, side) : null, t);
  }

  /** `m` null = fora do quadro ou de frente. */
  push(m: PlankMetrics | null, t: number): TimedFrame {
    const dt = this.lastT == null ? 0 : Math.min(Math.max(0, t - this.lastT), PLANK_MAX_FRAME_MS);
    this.lastT = t;
    const inPosition = m != null && plankPositionIssue(m) == null;
    const raw = inPosition && m ? judgePlank(m) : null;
    const good = inPosition && raw == null;
    this.lastIn = inPosition;
    if (inPosition) this.totalMs += dt;
    if (good) this.goodMs += dt;

    // Erro de quadril confirmado depois de PLANK_FAULT_MS.
    let newFault: PlankFault | null = null;
    if (raw !== this.candidate) { this.candidate = raw; this.candidateSince = t; }
    if (this.candidate !== this.fault && this.candidateSince != null && t - this.candidateSince >= PLANK_FAULT_MS) {
      this.fault = this.candidate;
      if (this.fault) { this.faults[this.fault] += 1; newFault = this.fault; }
    }
    if (!inPosition) { this.fault = null; this.candidate = null; }

    let autoFinish = false;
    if (inPosition) { this.everIn = true; this.outSince = null; }
    else {
      if (this.outSince == null) this.outSince = t;
      autoFinish = this.everIn && t - this.outSince > PLANK_OUT_FINISH_MS;
    }

    let tenMark: number | null = null;
    const tens = Math.floor(this.goodMs / (PLANK_SPEAK_EVERY_SECONDS * 1000));
    if (tens > this.lastTen) { this.lastTen = tens; tenMark = tens * PLANK_SPEAK_EVERY_SECONDS; }

    return { inPosition, good, fault: this.fault, newFault, tenMark, autoFinish, goodMs: this.goodMs, totalMs: this.totalMs };
  }

  summary(): TimedSummary {
    const totalSeconds = Math.floor(this.totalMs / 1000);
    const goodSeconds = Math.floor(this.goodMs / 1000);
    return {
      totalSeconds,
      goodSeconds,
      goodPercent: this.totalMs > 0 ? Math.round((this.goodMs / this.totalMs) * 100) : 0,
      faults: { ...this.faults },
    };
  }
}

/**
 * Resumo de tempo no formato salvo em camera_sessions: total = segundos na posição,
 * completas = segundos em boa posição (vai para as reps da série), erros = vezes que o quadril caiu/subiu.
 */
export function timedToSessionSummary(s: TimedSummary, messages: Record<string, string>): LiveSessionSummary {
  return {
    total: s.totalSeconds,
    complete: s.goodSeconds,
    incomplete: Math.max(0, s.totalSeconds - s.goodSeconds),
    errors: Object.entries(s.faults)
      .filter(([, n]) => n > 0)
      .map(([key, count]) => ({ key, label: messages[key] ?? key, count }))
      .sort((a, b) => b.count - a.count),
    avgDescentSeconds: null,
    fastDescentReps: 0,
  };
}

/** Cronômetro "m:ss". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Ombro, quadril, joelho e tornozelo do lado medido. */
export const plankPoints = (side: Side) => Object.values(SIDE_POINTS[side]);

const hint = `linha do corpo a partir de ${PLANK_MIN_LINE_ANGLE}°`;

export const plankRule: ExerciseRule = {
  id: 'plank',
  label: 'Prancha',
  keywords: ['PRANCHA'],
  // Prancha lateral é outro exercício (de frente pra câmera).
  excludeKeywords: ['LATERAL'],
  view: 'side',
  instruction: () => PLANK_INSTRUCTION,
  silhouette: () => 'plank',
  messages: PLANK_MESSAGES,
  minDescentSeconds: 0,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new PlankCounter(level),
  isBodyVisible: (lms, side) => arePointsVisible(lms, plankPoints(side)),
  lostMessage: 'Corpo inteiro na câmera',
  notReadyMessage: (lms, side, width, height) => plankPositionIssue(plankMetrics(lms, width, height, side)),
  timed: true,
  startHint: 'O cronômetro começa sozinho quando você ficar na prancha, de lado, parado por 2 segundos.',
};
