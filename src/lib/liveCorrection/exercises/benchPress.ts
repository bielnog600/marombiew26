/**
 * Regra "bench_press" (supino reto/inclinado, halteres ou barra) — vista lateral, deitado no banco.
 * Não exige a pessoa em pé: libera com ombro, cotovelo, punho e quadril do braço mais próximo.
 */
import {
  DEFAULT_DEPTH_LEVEL, angleAt, normalizeDepthLevel, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { round6 } from './common';
import { SIDE_UPPER_STILL_POINTS, isSideArmVisible, pickArmSide, upperBodyStillScale } from './arms';
import { ARM_POINTS } from './lateralRaise';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Cotovelo abaixo disto = começou a descer. */
export const BENCH_REP_START_ELBOW_ANGLE = 150;
/** Cotovelo acima disto = esticou de novo, fim da rep. */
export const BENCH_REP_END_ELBOW_ANGLE = 155;
/** Menor ângulo até isto (e cotovelo na altura do ombro ou abaixo) = completa. */
export const BENCH_MAX_BOTTOM_ANGLE = 90;
/** Ângulo até isto acima do exigido = "Desce um pouco mais" (continua incompleta). */
export const BENCH_NEAR_MARGIN = 10;
/** Quadril subindo mais que isto (fração do tronco) em relação ao início da série = "Quadril no banco". */
export const BENCH_MAX_HIP_LIFT = 0.1;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const BENCH_MIN_DESCENT_SECONDS = 1.5;
/**
 * Subiu pelo menos isto do fundo e voltou a descer BENCH_REBOUND_DROP sem passar de 155° =
 * não esticou em cima: fecha a rep com "Estica em cima" e começa a próxima.
 */
export const BENCH_REBOUND_RISE = 30;
export const BENCH_REBOUND_DROP = 10;
/** Frames antes da 1ª rep usados como referência da altura do quadril. */
export const BENCH_BASELINE_FRAMES = 15;

export type BenchError = 'bench_low' | 'bench_near' | 'lockout' | 'hip_bench' | 'descent';
export const BENCH_MESSAGES: Record<BenchError, string> = {
  bench_low: 'Desce mais',
  bench_near: 'Desce um pouco mais',
  lockout: 'Estica em cima',
  hip_bench: 'Quadril no banco',
  descent: 'Controla a descida',
};

export const BENCH_INSTRUCTION = 'Celular no chão, de lado do banco, com o tronco e os braços aparecendo';

export interface BenchMetrics {
  elbowAngle: number;
  /** (cotovelo.y − ombro.y) ÷ tronco: ≥ 0 = cotovelo na altura do ombro ou abaixo (na imagem). */
  elbowDrop: number;
  /** (ombro.y − quadril.y) ÷ tronco: aumenta quando o quadril sobe. */
  hipLift: number;
}

export function benchMetrics(lms: Landmark[], width: number, height: number, side: Side): BenchMetrics {
  const a = ARM_POINTS[side];
  const P = (i: number) => toPx(lms[i], width, height);
  const sh = P(a.shoulder), el = P(a.elbow), wr = P(a.wrist), hip = P(a.hip);
  const trunk = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 1;
  return { elbowAngle: angleAt(sh, el, wr), elbowDrop: (el.y - sh.y) / trunk, hipLift: (sh.y - hip.y) / trunk };
}

export function judgeBenchBottom(minElbow: number, elbowReachedShoulder: boolean) {
  const m = round6(minElbow);
  if (m <= BENCH_MAX_BOTTOM_ANGLE && elbowReachedShoulder) return { complete: true, near: false };
  return { complete: false, near: m <= BENCH_MAX_BOTTOM_ANGLE + BENCH_NEAR_MARGIN };
}

export interface BenchRep extends LiveRep {
  minElbowAngle: number;
  /** Maior ângulo no topo da rep quando não esticou (null = passou de 155°). */
  topElbowAngle: number | null;
  elbowReachedShoulder: boolean;
  hipLift: number;
}

export class BenchPressCounter implements LiveRepCounter {
  readonly ruleId = 'bench_press' as const;
  readonly reps: BenchRep[] = [];
  private phase: 'up' | 'down' = 'up';
  private armed = true;
  private last: number | null = null;
  private min = Infinity;
  private bottomAt: number | null = null;
  private descentStartAt: number | null = null;
  private riseMax = -Infinity;
  private riseMaxAt: number | null = null;
  private maxDrop = -Infinity;
  private maxHipLift = -Infinity;
  private baselineSamples: number[] = [];
  private baseline: number | null = null;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get inRep() { return this.phase === 'down'; }
  /** Braços esticados em cima (posição inicial). */
  get atTop() { return this.phase === 'up' && this.last != null && this.last > BENCH_REP_END_ELBOW_ANGLE; }
  /** Referência da altura do quadril no início da série (null = ainda não medida). */
  get hipBaseline() { return this.baseline; }

  reset() {
    this.reps.length = 0;
    this.armed = true;
    this.baselineSamples = [];
    this.baseline = null;
    this.clear();
  }
  abortRep() { this.armed = false; this.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickArmSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(benchMetrics(lms, width, height, side), t);
  }

  private clear() {
    this.phase = 'up';
    this.last = null;
    this.descentStartAt = null;
    this.resetRep();
  }

  private resetRep() {
    this.min = Infinity;
    this.bottomAt = null;
    this.riseMax = -Infinity;
    this.riseMaxAt = null;
    this.maxDrop = -Infinity;
    this.maxHipLift = -Infinity;
  }

  private startRep(m: BenchMetrics, t: number | null) {
    if (this.baseline == null && this.baselineSamples.length) this.fixBaseline();
    this.phase = 'down';
    this.min = m.elbowAngle;
    this.bottomAt = t;
    this.riseMax = m.elbowAngle;
    this.riseMaxAt = t;
    this.maxDrop = m.elbowDrop;
    this.maxHipLift = m.hipLift;
  }

  push(m: BenchMetrics, t?: number): BenchRep | null {
    const a = m.elbowAngle;
    const now = t ?? null;
    const prev = this.last;
    this.last = a;
    if (this.phase === 'up') {
      if (!this.armed) {
        if (a <= BENCH_REP_END_ELBOW_ANGLE) return null;
        this.armed = true;
      }
      if (this.baseline == null) {
        this.baselineSamples.push(m.hipLift);
        if (this.baselineSamples.length >= BENCH_BASELINE_FRAMES) this.fixBaseline();
      }
      if (a > BENCH_REP_END_ELBOW_ANGLE) this.descentStartAt = null;
      else if (now != null && prev != null && prev > BENCH_REP_END_ELBOW_ANGLE) this.descentStartAt = now;
      if (a < BENCH_REP_START_ELBOW_ANGLE) this.startRep(m, now);
      return null;
    }

    this.maxDrop = Math.max(this.maxDrop, m.elbowDrop);
    this.maxHipLift = Math.max(this.maxHipLift, m.hipLift);
    if (a < this.min) {
      this.min = a;
      this.bottomAt = now;
      this.riseMax = a;
      this.riseMaxAt = now;
      return null;
    }
    if (a > BENCH_REP_END_ELBOW_ANGLE) {
      const rep = this.close(null);
      this.phase = 'up';
      this.descentStartAt = null;
      return rep;
    }
    if (a > this.riseMax) { this.riseMax = a; this.riseMaxAt = now; }
    if (this.riseMax - this.min >= BENCH_REBOUND_RISE && a <= this.riseMax - BENCH_REBOUND_DROP) {
      // Não esticou em cima e já voltou a descer: fecha esta e começa a próxima.
      const rep = this.close(this.riseMax);
      this.descentStartAt = this.riseMaxAt;
      this.startRep(m, now);
      return rep;
    }
    return null;
  }

  private close(partialTop: number | null): BenchRep {
    const errors: BenchError[] = [];
    const reached = round6(this.maxDrop) >= 0;
    const verdict = judgeBenchBottom(this.min, reached);
    if (!verdict.complete) errors.push(verdict.near ? 'bench_near' : 'bench_low');
    if (partialTop != null) errors.push('lockout');
    const lift = this.baseline != null && Number.isFinite(this.maxHipLift) ? this.maxHipLift - this.baseline : 0;
    if (round6(lift) > BENCH_MAX_HIP_LIFT) errors.push('hip_bench');
    const descentSeconds = this.descentStartAt != null && this.bottomAt != null && this.bottomAt >= this.descentStartAt
      ? Math.round((this.bottomAt - this.descentStartAt) / 10) / 100
      : null;
    const fastDescent = descentSeconds != null && descentSeconds < BENCH_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: BenchRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds,
      fastDescent,
      minElbowAngle: Math.round(this.min),
      topElbowAngle: partialTop == null ? null : Math.round(partialTop),
      elbowReachedShoulder: reached,
      hipLift: Math.round(lift * 100) / 100,
    };
    this.reps.push(rep);
    this.resetRep();
    return rep;
  }

  private fixBaseline() {
    this.baseline = this.baselineSamples.reduce((s, v) => s + v, 0) / this.baselineSamples.length;
  }
}

const hint = `cotovelo até ${BENCH_MAX_BOTTOM_ANGLE}° e na altura do ombro`;

export const benchPressRule: ExerciseRule = {
  id: 'bench_press',
  label: 'Supino',
  keywords: ['SUPINO RETO', 'SUPINO INCLINADO'],
  view: 'side',
  instruction: () => BENCH_INSTRUCTION,
  silhouette: () => 'bench',
  messages: BENCH_MESSAGES,
  minDescentSeconds: BENCH_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new BenchPressCounter(level),
  isBodyVisible: (lms, side) => isSideArmVisible(lms, side),
  lostMessage: 'Tronco e braço na câmera',
  stillPoints: SIDE_UPPER_STILL_POINTS,
  stillScale: (lms, width, height) => upperBodyStillScale(lms, width, height),
  skeleton: 'arm_side',
  startHint: 'A contagem começa sozinha quando ombro, braço e quadril aparecerem parados por 2 segundos.',
};
