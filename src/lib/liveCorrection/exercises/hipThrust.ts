/**
 * Regra "hip_thrust" (elevação pélvica, hip thrust) — vista lateral.
 * Não exige a pessoa em pé: libera com ombro, quadril, joelho e tornozelo do lado aparecendo.
 */
import {
  DEFAULT_DEPTH_LEVEL, SIDE_POINTS, angleAt, normalizeDepthLevel, pickSide, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { arePointsVisible, round6 } from './common';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Quadril (ombro-quadril-joelho) abaixo disto = desceu, começou a rep. */
export const HIP_THRUST_REP_START_HIP_ANGLE = 150;
/** Quadril acima disto = subiu, chegou no topo. */
export const HIP_THRUST_REP_END_HIP_ANGLE = 165;
/** Pico do quadril a partir disto = completa (alinhado). */
export const HIP_THRUST_MIN_PEAK = 170;
/** Faltou até isto (graus) = "Sobe um pouco mais" (continua incompleta). */
export const HIP_THRUST_NEAR_MARGIN = 5;
/** Tempo acima do topo menor que isto (s) = "Segura 1 segundo em cima". */
export const HIP_THRUST_MIN_HOLD_SECONDS = 0.5;
/** Segurando no topo por isto (ms), a rep fecha sem esperar a descida. */
export const HIP_THRUST_TOP_SETTLE_MS = 1000;
/** Joelho no topo acima disto = "Pés mais perto do banco". */
export const HIP_THRUST_MAX_TOP_KNEE = 115;
/** Joelho no topo abaixo disto = "Pés mais longe". */
export const HIP_THRUST_MIN_TOP_KNEE = 70;
/** Descida (do topo até embaixo) mais rápida que isto (s) = "Controla a descida". */
export const HIP_THRUST_MIN_DESCENT_SECONDS = 1.5;
/** Subiu pelo menos isto do fundo e voltou a cair sem chegar no topo = rep parcial (incompleta). */
export const HIP_THRUST_PARTIAL_RISE = 20;
export const HIP_THRUST_PARTIAL_DROP = 10;
/** Quadril sem mudar mais que isto (graus) por HIP_THRUST_REST_MS = parado (fim automático). */
export const HIP_THRUST_REST_TOLERANCE = 5;
export const HIP_THRUST_REST_MS = 1000;

export type HipThrustError = 'hip_low' | 'hip_near' | 'hold' | 'feet_closer' | 'feet_farther' | 'descent';
export const HIP_THRUST_MESSAGES: Record<HipThrustError, string> = {
  hip_low: 'Sobe o quadril até alinhar',
  hip_near: 'Sobe um pouco mais',
  hold: 'Segura 1 segundo em cima',
  feet_closer: 'Pés mais perto do banco',
  feet_farther: 'Pés mais longe',
  descent: 'Controla a descida',
};
/** Avisos de pés: falados no máximo 1x por série. */
export const HIP_THRUST_SPEAK_ONCE: HipThrustError[] = ['feet_closer', 'feet_farther'];

export const HIP_THRUST_INSTRUCTION = 'Celular no chão, de lado, na altura do banco, com o corpo inteiro aparecendo';

export interface HipThrustMetrics {
  hipAngle: number;
  kneeAngle: number;
}

export function hipThrustMetrics(lms: Landmark[], width: number, height: number, side: Side): HipThrustMetrics {
  const p = SIDE_POINTS[side];
  const sh = toPx(lms[p.shoulder], width, height);
  const hip = toPx(lms[p.hip], width, height);
  const knee = toPx(lms[p.knee], width, height);
  const ankle = toPx(lms[p.ankle], width, height);
  return { hipAngle: angleAt(sh, hip, knee), kneeAngle: angleAt(hip, knee, ankle) };
}

export function judgeHipThrustPeak(peak: number) {
  const p = round6(peak);
  if (p >= HIP_THRUST_MIN_PEAK) return { complete: true, near: false };
  return { complete: false, near: p >= HIP_THRUST_MIN_PEAK - HIP_THRUST_NEAR_MARGIN };
}

export interface HipThrustRep extends LiveRep {
  peakHipAngle: number;
  /** Segundos acima do topo; null = parcial ou sem tempo. */
  holdSeconds: number | null;
  topKneeAngle: number | null;
}

export class HipThrustCounter implements LiveRepCounter {
  readonly ruleId = 'hip_thrust' as const;
  readonly reps: HipThrustRep[] = [];
  private phase: 'up' | 'down' | 'top' = 'up';
  private last: number | null = null;
  private lastT: number | null = null;
  private min = Infinity;
  private bottomAt: number | null = null;
  private riseMax = -Infinity;
  private descentStartAt: number | null = null;
  private topSince: number | null = null;
  private peak = 0;
  private peakKnee: number | null = null;
  private restRef: number | null = null;
  private restSince: number | null = null;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get inRep() { return this.phase !== 'up'; }
  get atTop() { return this.phase === 'up' && this.last != null && this.last > HIP_THRUST_REP_END_HIP_ANGLE; }
  /** No topo (rep fechada) ou com o quadril parado ≥ 1 s (ex.: sentado embaixo no fim da série). */
  get resting() {
    if (this.phase === 'top') return false;
    if (this.atTop) return true;
    return this.lastT != null && this.restSince != null && this.lastT - this.restSince >= HIP_THRUST_REST_MS;
  }

  reset() { this.reps.length = 0; this.clear(); }
  abortRep() { this.clear(); }
  /** Não exige a pessoa em pé nem no topo: começar embaixo já conta a primeira subida. */
  waitForStanding() { this.clear(); }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(hipThrustMetrics(lms, width, height, side), t);
  }

  flush(): HipThrustRep | null {
    if (this.phase !== 'top') return null;
    const hold = this.lastT != null && this.topSince != null ? (this.lastT - this.topSince) / 1000 : null;
    const rep = this.close(this.peak, hold, this.peakKnee, false);
    this.phase = 'up';
    return rep;
  }

  private clear() {
    this.phase = 'up';
    this.last = null;
    this.lastT = null;
    this.startDown(Infinity, null);
    this.descentStartAt = null;
    this.topSince = null;
    this.peak = 0;
    this.peakKnee = null;
    this.restRef = null;
    this.restSince = null;
  }

  private startDown(angle: number, t: number | null) {
    this.min = angle;
    this.bottomAt = t;
    this.riseMax = angle;
  }

  push(m: HipThrustMetrics, t?: number): HipThrustRep | null {
    const a = m.hipAngle;
    const prev = this.last;
    const now = t ?? null;
    this.last = a;
    this.lastT = now;
    if (this.restRef == null || Math.abs(a - this.restRef) > HIP_THRUST_REST_TOLERANCE) {
      this.restRef = a;
      this.restSince = now;
    }

    if (this.phase === 'up') {
      if (a > HIP_THRUST_REP_END_HIP_ANGLE) this.descentStartAt = null;
      else if (now != null && prev != null && prev > HIP_THRUST_REP_END_HIP_ANGLE) this.descentStartAt = now;
      if (a < HIP_THRUST_REP_START_HIP_ANGLE) {
        this.phase = 'down';
        this.startDown(a, now);
      }
      return null;
    }

    if (this.phase === 'down') {
      if (a < this.min) { this.startDown(a, now); return null; }
      if (a > HIP_THRUST_REP_END_HIP_ANGLE) {
        this.phase = 'top';
        this.topSince = now;
        this.peak = a;
        this.peakKnee = m.kneeAngle;
        return null;
      }
      this.riseMax = Math.max(this.riseMax, a);
      // Subiu bem e voltou a cair sem chegar no topo: rep parcial.
      if (this.riseMax - this.min >= HIP_THRUST_PARTIAL_RISE && a <= this.riseMax - HIP_THRUST_PARTIAL_DROP) {
        const rep = this.close(this.riseMax, null, null, true);
        this.descentStartAt = null;
        this.startDown(a, now);
        return rep;
      }
      return null;
    }

    // topo
    if (a > HIP_THRUST_REP_END_HIP_ANGLE) {
      if (a > this.peak) { this.peak = a; this.peakKnee = m.kneeAngle; }
      if (now != null && this.topSince != null && now - this.topSince >= HIP_THRUST_TOP_SETTLE_MS) {
        const rep = this.close(this.peak, (now - this.topSince) / 1000, this.peakKnee, false);
        this.phase = 'up';
        return rep;
      }
      return null;
    }
    const hold = now != null && this.topSince != null ? (now - this.topSince) / 1000 : null;
    const rep = this.close(this.peak, hold, this.peakKnee, false);
    this.phase = 'up';
    this.descentStartAt = now;
    if (a < HIP_THRUST_REP_START_HIP_ANGLE) {
      this.phase = 'down';
      this.startDown(a, now);
    }
    return rep;
  }

  private close(peak: number, hold: number | null, knee: number | null, partial: boolean): HipThrustRep {
    const errors: HipThrustError[] = [];
    const verdict = judgeHipThrustPeak(peak);
    if (!verdict.complete) errors.push(verdict.near ? 'hip_near' : 'hip_low');
    if (!partial && hold != null && round6(hold) < HIP_THRUST_MIN_HOLD_SECONDS) errors.push('hold');
    if (!partial && knee != null) {
      if (round6(knee) > HIP_THRUST_MAX_TOP_KNEE) errors.push('feet_closer');
      else if (round6(knee) < HIP_THRUST_MIN_TOP_KNEE) errors.push('feet_farther');
    }
    const descentSeconds = this.descentStartAt != null && this.bottomAt != null && this.bottomAt >= this.descentStartAt
      ? Math.round((this.bottomAt - this.descentStartAt) / 10) / 100
      : null;
    const fastDescent = descentSeconds != null && descentSeconds < HIP_THRUST_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: HipThrustRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds,
      fastDescent,
      peakHipAngle: Math.round(peak),
      holdSeconds: hold == null ? null : Math.round(hold * 100) / 100,
      topKneeAngle: knee == null ? null : Math.round(knee),
    };
    this.reps.push(rep);
    this.topSince = null;
    this.peak = 0;
    this.peakKnee = null;
    this.min = Infinity;
    this.bottomAt = null;
    this.riseMax = -Infinity;
    return rep;
  }
}

const hint = `quadril até ${HIP_THRUST_MIN_PEAK}° (alinhado)`;

export const hipThrustRule: ExerciseRule = {
  id: 'hip_thrust',
  label: 'Elevação pélvica',
  keywords: ['ELEVACAO PELVICA', 'HIP THRUST'],
  view: 'side',
  instruction: () => HIP_THRUST_INSTRUCTION,
  silhouette: () => 'hip_thrust',
  messages: HIP_THRUST_MESSAGES,
  minDescentSeconds: HIP_THRUST_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new HipThrustCounter(level),
  isBodyVisible: (lms, side) => arePointsVisible(lms, Object.values(SIDE_POINTS[side])),
  speakOncePerSeries: HIP_THRUST_SPEAK_ONCE,
};
