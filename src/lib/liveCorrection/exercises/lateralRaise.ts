/**
 * Regra "lateral_raise" (elevação lateral) — VISTA DE FRENTE.
 * Não exige o corpo inteiro: ombros, cotovelos, punhos e quadril.
 */
import {
  DEFAULT_DEPTH_LEVEL, LM, normalizeDepthLevel, pickSide, toPx, angleAt,
  type DepthLevel, type Landmark, type Point, type Side,
} from '../squatAnalysis';
import { arePointsVisible, round6 } from './common';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Pontos do MediaPipe usados só pelos braços. */
export const ARM_LM = {
  leftEar: 7, rightEar: 8,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
} as const;
export const ARM_POINTS: Record<Side, { shoulder: number; elbow: number; wrist: number; hip: number; ear: number }> = {
  left: { shoulder: LM.leftShoulder, elbow: ARM_LM.leftElbow, wrist: ARM_LM.leftWrist, hip: LM.leftHip, ear: ARM_LM.leftEar },
  right: { shoulder: LM.rightShoulder, elbow: ARM_LM.rightElbow, wrist: ARM_LM.rightWrist, hip: LM.rightHip, ear: ARM_LM.rightEar },
};

/** Média dos dois braços acima disto = começou a subir. */
export const LATERAL_REP_START_ABDUCTION = 40;
/** Média dos dois braços abaixo disto = desceu, fim da rep. */
export const LATERAL_REP_END_ABDUCTION = 25;
/** Pico da rep (média dos braços) a partir disto = completa (linha do ombro). */
export const LATERAL_MIN_PEAK = 80;
/** Faltou até isto (graus) = "Sobe um pouco mais" (continua incompleta). */
export const LATERAL_NEAR_MARGIN = 10;
/** Pico acima disto = "Não precisa passar do ombro" (a rep conta). */
export const LATERAL_MAX_PEAK = 105;
/** Inclinação do tronco variando mais que isto (graus) na rep = "Sem balanço". */
export const LATERAL_MAX_SWAY = 10;
/** Ombro→orelha encurtando mais que isto (fração) em relação ao início da série = "Ombro longe da orelha". */
export const LATERAL_MAX_SHRUG = 0.25;
/** Diferença de pico entre os braços acima disto (graus) = "Sobe os dois iguais". */
export const LATERAL_MAX_ASYMMETRY = 15;
/** Descida (do pico até o fim) mais rápida que isto (s) = "Controla a descida". */
export const LATERAL_MIN_DESCENT_SECONDS = 1.5;
/** A descida começa no último frame a até isto (graus) do pico, para não contar a pausa em cima. */
export const LATERAL_DESCENT_PEAK_MARGIN = 5;
/** Frames com os braços embaixo, antes da 1ª rep, usados como referência ombro→orelha. */
export const LATERAL_BASELINE_FRAMES = 15;

export type LateralRaiseError = 'raise_low' | 'raise_near' | 'raise_high' | 'swing' | 'shrug' | 'asymmetry' | 'descent';
export const LATERAL_MESSAGES: Record<LateralRaiseError, string> = {
  raise_low: 'Sobe até a linha do ombro',
  raise_near: 'Sobe um pouco mais',
  raise_high: 'Não precisa passar do ombro',
  swing: 'Sem balanço',
  shrug: 'Ombro longe da orelha',
  asymmetry: 'Sobe os dois iguais',
  descent: 'Controla a descida',
};

export const LATERAL_INSTRUCTION =
  'Coloca o celular no chão ou apoiado, de frente pra você, com o corpo da cintura pra cima e os braços aparecendo';

export interface LateralMetrics {
  /** Abdução: ângulo entre quadril→ombro e ombro→punho (0 = braço junto ao corpo, 90 = linha do ombro). */
  leftAbduction: number;
  rightAbduction: number;
  /** Inclinação do tronco (meio do quadril → meio dos ombros) vs vertical, com sinal (graus). */
  trunkLean: number;
  /** Ombro→orelha ÷ largura dos ombros (média dos lados visíveis); null = orelhas não aparecem. */
  earRatio: number | null;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function lateralMetrics(lms: Landmark[], width: number, height: number): LateralMetrics {
  const P = (i: number) => toPx(lms[i], width, height);
  const abduction = (s: Side) => {
    const a = ARM_POINTS[s];
    return angleAt(P(a.hip), P(a.shoulder), P(a.wrist));
  };
  const ls = P(LM.leftShoulder), rs = P(LM.rightShoulder), lh = P(LM.leftHip), rh = P(LM.rightHip);
  const midSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const trunkLean = (Math.atan2(midSh.x - midHip.x, midHip.y - midSh.y) * 180) / Math.PI;
  const shoulderW = dist(ls, rs);
  const ratios: number[] = [];
  if (shoulderW > 0) {
    (['left', 'right'] as Side[]).forEach((s) => {
      const ear = lms[ARM_POINTS[s].ear];
      if (ear && (ear.visibility ?? 1) >= 0.5) ratios.push(dist(P(ARM_POINTS[s].shoulder), P(ARM_POINTS[s].ear)) / shoulderW);
    });
  }
  return {
    leftAbduction: abduction('left'),
    rightAbduction: abduction('right'),
    trunkLean,
    earRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
  };
}

/** Amplitude pelo pico da média dos braços. */
export function judgeLateralPeak(peak: number) {
  const p = round6(peak);
  if (p >= LATERAL_MIN_PEAK) return { complete: true, near: false, tooHigh: p > LATERAL_MAX_PEAK };
  return { complete: false, near: p >= LATERAL_MIN_PEAK - LATERAL_NEAR_MARGIN, tooHigh: false };
}

export interface LateralRep extends LiveRep {
  peakAbduction: number;
  peakLeft: number;
  peakRight: number;
  sway: number;
}

export class LateralRaiseCounter implements LiveRepCounter {
  readonly ruleId = 'lateral_raise' as const;
  readonly reps: LateralRep[] = [];
  private phase: 'rest' | 'raise' = 'rest';
  private armed = true;
  private last: number | null = null;
  private peak = 0;
  private peakL = 0;
  private peakR = 0;
  private leanMin = 0;
  private leanMax = 0;
  private minEar = Infinity;
  private descentFrom: number | null = null;
  private baselineSamples: number[] = [];
  private baseline: number | null = null;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get inRep() { return this.phase === 'raise'; }
  /** Braços embaixo (posição inicial). */
  get atTop() { return this.phase === 'rest' && this.last != null && this.last < LATERAL_REP_END_ABDUCTION; }
  /** Referência ombro→orelha do início da série (null = ainda não medida). */
  get earBaseline() { return this.baseline; }

  reset() {
    this.reps.length = 0;
    this.armed = true;
    this.baselineSamples = [];
    this.baseline = null;
    this.clear();
  }
  abortRep() { this.armed = false; this.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update(lms: Landmark[], width: number, height: number, _side: Side, t?: number) {
    return this.push(lateralMetrics(lms, width, height), t);
  }

  private clear() {
    this.phase = 'rest';
    this.last = null;
    this.peak = 0;
    this.peakL = 0;
    this.peakR = 0;
    this.minEar = Infinity;
    this.descentFrom = null;
  }

  push(m: LateralMetrics, t?: number): LateralRep | null {
    const avg = (m.leftAbduction + m.rightAbduction) / 2;
    this.last = avg;
    if (this.phase === 'rest') {
      if (!this.armed) {
        if (avg >= LATERAL_REP_END_ABDUCTION) return null;
        this.armed = true;
      }
      if (avg < LATERAL_REP_END_ABDUCTION && this.baseline == null && m.earRatio != null) {
        this.baselineSamples.push(m.earRatio);
        if (this.baselineSamples.length >= LATERAL_BASELINE_FRAMES) this.fixBaseline();
      }
      if (avg > LATERAL_REP_START_ABDUCTION) {
        if (this.baseline == null && this.baselineSamples.length) this.fixBaseline();
        this.phase = 'raise';
        this.peak = avg;
        this.peakL = m.leftAbduction;
        this.peakR = m.rightAbduction;
        this.leanMin = this.leanMax = m.trunkLean;
        this.minEar = m.earRatio ?? Infinity;
        this.descentFrom = t ?? null;
      }
      return null;
    }

    this.peak = Math.max(this.peak, avg);
    this.peakL = Math.max(this.peakL, m.leftAbduction);
    this.peakR = Math.max(this.peakR, m.rightAbduction);
    this.leanMin = Math.min(this.leanMin, m.trunkLean);
    this.leanMax = Math.max(this.leanMax, m.trunkLean);
    if (m.earRatio != null) this.minEar = Math.min(this.minEar, m.earRatio);
    if (avg >= this.peak - LATERAL_DESCENT_PEAK_MARGIN) this.descentFrom = t ?? null;
    if (avg >= LATERAL_REP_END_ABDUCTION) return null;

    const errors: LateralRaiseError[] = [];
    const verdict = judgeLateralPeak(this.peak);
    if (!verdict.complete) errors.push(verdict.near ? 'raise_near' : 'raise_low');
    if (verdict.tooHigh) errors.push('raise_high');
    const sway = this.leanMax - this.leanMin;
    if (round6(sway) > LATERAL_MAX_SWAY) errors.push('swing');
    if (this.baseline != null && Number.isFinite(this.minEar) && round6(this.minEar) < round6(this.baseline * (1 - LATERAL_MAX_SHRUG))) {
      errors.push('shrug');
    }
    if (round6(Math.abs(this.peakL - this.peakR)) > LATERAL_MAX_ASYMMETRY) errors.push('asymmetry');
    const descentSeconds = t != null && this.descentFrom != null && t >= this.descentFrom
      ? Math.round((t - this.descentFrom) / 10) / 100
      : null;
    const fastDescent = descentSeconds != null && descentSeconds < LATERAL_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: LateralRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds,
      fastDescent,
      peakAbduction: Math.round(this.peak),
      peakLeft: Math.round(this.peakL),
      peakRight: Math.round(this.peakR),
      sway: Math.round(sway),
    };
    this.reps.push(rep);
    this.clear();
    this.last = avg;
    return rep;
  }

  private fixBaseline() {
    this.baseline = this.baselineSamples.reduce((a, b) => a + b, 0) / this.baselineSamples.length;
  }
}

const REQUIRED_POINTS = [
  LM.leftShoulder, LM.rightShoulder, ARM_LM.leftElbow, ARM_LM.rightElbow,
  ARM_LM.leftWrist, ARM_LM.rightWrist, LM.leftHip, LM.rightHip,
];

const hint = `braços até ${LATERAL_MIN_PEAK}° (linha do ombro)`;

export const lateralRaiseRule: ExerciseRule = {
  id: 'lateral_raise',
  label: 'Elevação lateral',
  keywords: ['ELEVACAO LATERAL'],
  view: 'front',
  instruction: () => LATERAL_INSTRUCTION,
  silhouette: () => 'front_upper',
  messages: LATERAL_MESSAGES,
  minDescentSeconds: LATERAL_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new LateralRaiseCounter(level),
  isBodyVisible: (lms) => arePointsVisible(lms, REQUIRED_POINTS),
  lostMessage: 'Braços e cintura na câmera',
  stillPoints: [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, ARM_LM.leftWrist, ARM_LM.rightWrist],
  // 2× o tronco ≈ a altura usada no corpo inteiro, para o mesmo limite de "parado".
  stillScale: (lms, width, height) => {
    const P = (i: number) => toPx(lms[i], width, height);
    const ls = P(LM.leftShoulder), rs = P(LM.rightShoulder), lh = P(LM.leftHip), rh = P(LM.rightHip);
    return 2 * Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
  },
  skeleton: 'arms',
};
