/**
 * Regra "curl" (rosca direta, alternada, martelo, Scott) — vista lateral, braço mais próximo da câmera.
 * Não exige o corpo inteiro: ombro, cotovelo, punho e quadril do braço medido.
 */
import {
  DEFAULT_DEPTH_LEVEL, angleAt, normalizeDepthLevel, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { nameHasKeyword, normalizeExerciseName, round6 } from './common';
import {
  SIDE_UPPER_LOST_MESSAGE, SIDE_UPPER_START_HINT, SIDE_UPPER_STILL_POINTS,
  isSideArmVisible, pickArmSide, tiltFromVertical, upperBodyStillScale,
} from './arms';
import { ARM_POINTS } from './lateralRaise';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Cotovelo (ombro-cotovelo-punho) abaixo disto = começou a subir. */
export const CURL_REP_START_ELBOW_ANGLE = 140;
/** Cotovelo acima disto = voltou embaixo, fim da rep. */
export const CURL_REP_END_ELBOW_ANGLE = 150;
/** Menor ângulo do cotovelo até isto = completa (subiu tudo). */
export const CURL_MAX_TOP_ANGLE = 60;
/** Faltou até isto (graus) = "Sobe um pouco mais" (continua incompleta). */
export const CURL_NEAR_MARGIN = 10;
/** Ângulo quadril-ombro-cotovelo acima disto no topo = "Cotovelo colado no corpo" (aviso). */
export const CURL_MAX_ELBOW_DRIFT = 25;
/** Inclinação do tronco variando mais que isto (graus) na rep = "Sem balanço" (aviso). */
export const CURL_MAX_SWAY = 10;
/** Descida (do topo até esticar) mais rápida que isto (s) = "Controla a descida". */
export const CURL_MIN_DESCENT_SECONDS = 1.5;
/** A descida começa no último frame a até isto (graus) do topo, para não contar a pausa em cima. */
export const CURL_DESCENT_TOP_MARGIN = 5;
/**
 * Voltou pelo menos até o início da rep (140°) sem passar do fim (150°), depois de descer
 * CURL_REBOUND_RISE do topo, e subiu de novo CURL_REBOUND_DROP = não esticou embaixo:
 * fecha a rep com "Estica o braço embaixo" e começa a próxima.
 */
export const CURL_REBOUND_RISE = 20;
export const CURL_REBOUND_DROP = 10;

export type CurlError = 'curl_low' | 'curl_near' | 'curl_extend' | 'elbow_tuck' | 'swing' | 'descent';
export const CURL_MESSAGES: Record<CurlError, string> = {
  curl_low: 'Sobe mais',
  curl_near: 'Sobe um pouco mais',
  curl_extend: 'Estica o braço embaixo',
  elbow_tuck: 'Cotovelo colado no corpo',
  swing: 'Sem balanço',
  descent: 'Controla a descida',
};

export const CURL_INSTRUCTION = 'Celular de lado, com o corpo da cintura pra cima e o braço aparecendo';

/** Rosca Scott: braço apoiado, sem checar cotovelo nem balanço. */
export function isScottCurl(name: string | null | undefined): boolean {
  return nameHasKeyword(normalizeExerciseName(name), 'SCOTT');
}

export interface CurlMetrics {
  elbowAngle: number;
  /** Quadril-ombro-cotovelo: 0 = cotovelo junto ao corpo. */
  elbowDrift: number;
  /** Inclinação do tronco (quadril→ombro) vs vertical, com sinal. */
  trunkLean: number;
}

export function curlMetrics(lms: Landmark[], width: number, height: number, side: Side): CurlMetrics {
  const a = ARM_POINTS[side];
  const P = (i: number) => toPx(lms[i], width, height);
  const sh = P(a.shoulder), el = P(a.elbow), wr = P(a.wrist), hip = P(a.hip);
  return { elbowAngle: angleAt(sh, el, wr), elbowDrift: angleAt(hip, sh, el), trunkLean: tiltFromVertical(hip, sh) };
}

export function judgeCurlTop(minElbow: number) {
  const m = round6(minElbow);
  if (m <= CURL_MAX_TOP_ANGLE) return { complete: true, near: false };
  return { complete: false, near: m <= CURL_MAX_TOP_ANGLE + CURL_NEAR_MARGIN };
}

export interface CurlRep extends LiveRep {
  minElbowAngle: number;
  /** Maior ângulo do cotovelo no fim da rep (null = passou do fim, braço esticado). */
  bottomElbowAngle: number | null;
  topElbowDrift: number;
  sway: number;
}

export class CurlCounter implements LiveRepCounter {
  readonly ruleId = 'curl' as const;
  readonly reps: CurlRep[] = [];
  private phase: 'up' | 'down' = 'up';
  private armed = true;
  private last: number | null = null;
  private min = Infinity;
  private topDrift = 0;
  private descentFrom: number | null = null;
  private riseMax = -Infinity;
  private riseMaxAt: number | null = null;
  private leanMin = 0;
  private leanMax = 0;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL, readonly scott = false) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get inRep() { return this.phase === 'down'; }
  /** Braço esticado embaixo (posição inicial). */
  get atTop() { return this.phase === 'up' && this.last != null && this.last > CURL_REP_END_ELBOW_ANGLE; }

  reset() { this.reps.length = 0; this.armed = true; this.clear(); }
  abortRep() { this.armed = false; this.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickArmSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(curlMetrics(lms, width, height, side), t);
  }

  private clear() {
    this.phase = 'up';
    this.last = null;
    this.min = Infinity;
    this.descentFrom = null;
    this.riseMax = -Infinity;
    this.riseMaxAt = null;
  }

  private startRep(m: CurlMetrics, t: number | null) {
    this.phase = 'down';
    this.min = m.elbowAngle;
    this.topDrift = m.elbowDrift;
    this.descentFrom = t;
    this.riseMax = m.elbowAngle;
    this.riseMaxAt = t;
    this.leanMin = this.leanMax = m.trunkLean;
  }

  push(m: CurlMetrics, t?: number): CurlRep | null {
    const a = m.elbowAngle;
    const now = t ?? null;
    this.last = a;
    if (this.phase === 'up') {
      if (!this.armed) {
        if (a <= CURL_REP_END_ELBOW_ANGLE) return null;
        this.armed = true;
      }
      if (a < CURL_REP_START_ELBOW_ANGLE) this.startRep(m, now);
      return null;
    }

    this.leanMin = Math.min(this.leanMin, m.trunkLean);
    this.leanMax = Math.max(this.leanMax, m.trunkLean);
    if (a < this.min) {
      this.min = a;
      this.topDrift = m.elbowDrift;
      this.descentFrom = now;
      this.riseMax = a;
      this.riseMaxAt = now;
      return null;
    }
    if (a <= this.min + CURL_DESCENT_TOP_MARGIN) this.descentFrom = now;
    if (a > CURL_REP_END_ELBOW_ANGLE) {
      const rep = this.close(null, now);
      this.phase = 'up';
      return rep;
    }
    if (a > this.riseMax) { this.riseMax = a; this.riseMaxAt = now; }
    if (
      this.riseMax >= CURL_REP_START_ELBOW_ANGLE
      && this.riseMax - this.min >= CURL_REBOUND_RISE
      && a <= this.riseMax - CURL_REBOUND_DROP
    ) {
      // Não esticou embaixo e já voltou a subir: fecha esta e começa a próxima.
      const rep = this.close(this.riseMax, this.riseMaxAt);
      this.startRep(m, now);
      return rep;
    }
    return null;
  }

  private close(partialBottom: number | null, descentEnd: number | null): CurlRep {
    const errors: CurlError[] = [];
    const verdict = judgeCurlTop(this.min);
    if (!verdict.complete) errors.push(verdict.near ? 'curl_near' : 'curl_low');
    if (partialBottom != null) errors.push('curl_extend');
    const sway = this.leanMax - this.leanMin;
    if (!this.scott) {
      if (round6(this.topDrift) > CURL_MAX_ELBOW_DRIFT) errors.push('elbow_tuck');
      if (round6(sway) > CURL_MAX_SWAY) errors.push('swing');
    }
    const descentSeconds = descentEnd != null && this.descentFrom != null && descentEnd >= this.descentFrom
      ? Math.round((descentEnd - this.descentFrom) / 10) / 100
      : null;
    const fastDescent = descentSeconds != null && descentSeconds < CURL_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: CurlRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds,
      fastDescent,
      minElbowAngle: Math.round(this.min),
      bottomElbowAngle: partialBottom == null ? null : Math.round(partialBottom),
      topElbowDrift: Math.round(this.topDrift),
      sway: Math.round(sway),
    };
    this.reps.push(rep);
    this.min = Infinity;
    this.descentFrom = null;
    this.riseMax = -Infinity;
    this.riseMaxAt = null;
    return rep;
  }
}

const hint = `cotovelo até ${CURL_MAX_TOP_ANGLE}° em cima`;

export const curlRule: ExerciseRule = {
  id: 'curl',
  label: 'Rosca',
  keywords: ['ROSCA DIRETA', 'ROSCA ALTERNADA', 'ROSCA MARTELO', 'BICEPS MARTELO', 'ROSCA SCOTT'],
  view: 'side',
  instruction: () => CURL_INSTRUCTION,
  silhouette: () => 'side_upper',
  messages: CURL_MESSAGES,
  minDescentSeconds: CURL_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level, _leg, exerciseName) => new CurlCounter(level, isScottCurl(exerciseName)),
  isBodyVisible: (lms, side) => isSideArmVisible(lms, side),
  lostMessage: SIDE_UPPER_LOST_MESSAGE,
  stillPoints: SIDE_UPPER_STILL_POINTS,
  stillScale: (lms, width, height) => upperBodyStillScale(lms, width, height),
  skeleton: 'arm_side',
  startHint: SIDE_UPPER_START_HINT,
};
