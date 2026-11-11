/**
 * Regra "stiff" (stiff, RDL, terra romeno) — vista lateral.
 * Não avalia coluna arredondada: os pontos do MediaPipe não permitem com confiança.
 */
import {
  DEFAULT_DEPTH_LEVEL, POSITION_MESSAGES, SIDE_POINTS, angleAt, normalizeDepthLevel, pickSide, toPx, trunkAngle,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { RepCycle, round6 } from './common';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Quadril (ombro-quadril-joelho) abaixo disto = começou a descer. */
export const STIFF_REP_START_HIP_ANGLE = 150;
/** Quadril acima disto = estendido no topo, fim da rep. */
export const STIFF_REP_END_HIP_ANGLE = 165;
/** Joelho no fundo abaixo disto = dobrou demais ("Menos joelho, quadril pra trás"); a rep conta. */
export const STIFF_MIN_KNEE_ANGLE = 135;
/** Inclinação mínima do tronco (ombro-quadril vs vertical) no fundo, por nível. */
export const STIFF_MIN_TRUNK_LEAN: Record<DepthLevel, number> = {
  iniciante: 45,
  intermediario: 55,
  avancado: 65,
  pro: 75,
};
/** Faltou até isto (graus) para o exigido = "Desce um pouco mais" (continua incompleta). */
export const STIFF_NEAR_MARGIN = 10;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const STIFF_MIN_DESCENT_SECONDS = 2.0;

export type StiffError = 'depth' | 'depth_near' | 'knee' | 'descent';
export const STIFF_MESSAGES: Record<StiffError, string> = {
  depth: 'Desce mais',
  depth_near: 'Desce um pouco mais',
  knee: 'Menos joelho, quadril pra trás',
  descent: 'Controla a descida',
};

export interface StiffMetrics {
  hipAngle: number;
  kneeAngle: number;
  /** Inclinação do tronco em relação à vertical (0 = em pé). */
  trunkLean: number;
}

export function stiffMetrics(lms: Landmark[], width: number, height: number, side: Side): StiffMetrics {
  const p = SIDE_POINTS[side];
  const sh = toPx(lms[p.shoulder], width, height);
  const hip = toPx(lms[p.hip], width, height);
  const knee = toPx(lms[p.knee], width, height);
  const ankle = toPx(lms[p.ankle], width, height);
  return { hipAngle: angleAt(sh, hip, knee), kneeAngle: angleAt(hip, knee, ankle), trunkLean: trunkAngle(sh, hip) };
}

export function judgeStiffDepth(maxTrunkLean: number, level: unknown = DEFAULT_DEPTH_LEVEL) {
  const required = STIFF_MIN_TRUNK_LEAN[normalizeDepthLevel(level)];
  const lean = round6(maxTrunkLean);
  if (lean >= required) return { deepEnough: true, near: false };
  return { deepEnough: false, near: lean >= required - STIFF_NEAR_MARGIN };
}

export interface StiffRep extends LiveRep {
  minHipAngle: number;
  bottomKneeAngle: number;
  maxTrunkLean: number;
}

export class StiffRepCounter implements LiveRepCounter {
  readonly ruleId = 'stiff' as const;
  readonly reps: StiffRep[] = [];
  private cycle = new RepCycle(STIFF_REP_START_HIP_ANGLE, STIFF_REP_END_HIP_ANGLE);
  private maxLean = 0;
  private bottomKnee = 180;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get inRep() { return this.cycle.inRep; }
  get atTop() { return this.cycle.atTop; }
  reset() { this.cycle.reset(); this.reps.length = 0; this.maxLean = 0; this.bottomKnee = 180; }
  abortRep() { this.cycle.abort(); this.maxLean = 0; this.bottomKnee = 180; }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(stiffMetrics(lms, width, height, side), t);
  }

  push(m: StiffMetrics, t?: number): StiffRep | null {
    const ev = this.cycle.step(m.hipAngle, t);
    if (ev === 'start') {
      this.maxLean = m.trunkLean;
      this.bottomKnee = m.kneeAngle;
    } else if (ev === 'bottom') {
      this.bottomKnee = m.kneeAngle; // joelho medido no ponto mais baixo
      this.maxLean = Math.max(this.maxLean, m.trunkLean);
    } else if (ev === 'none' && this.cycle.inRep) {
      this.maxLean = Math.max(this.maxLean, m.trunkLean);
    }
    if (ev !== 'end') return null;

    const errors: StiffError[] = [];
    const { deepEnough, near } = judgeStiffDepth(this.maxLean, this.depthLevel);
    if (!deepEnough) errors.push(near ? 'depth_near' : 'depth');
    if (this.bottomKnee < STIFF_MIN_KNEE_ANGLE) errors.push('knee');
    const descentSeconds = this.cycle.descentSeconds();
    const fastDescent = descentSeconds != null && descentSeconds < STIFF_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: StiffRep = {
      index: this.reps.length + 1,
      complete: deepEnough,
      errors,
      descentSeconds,
      fastDescent,
      minHipAngle: Math.round(this.cycle.minAngle),
      bottomKneeAngle: Math.round(this.bottomKnee),
      maxTrunkLean: Math.round(this.maxLean),
    };
    this.reps.push(rep);
    this.cycle.finish();
    this.maxLean = 0;
    this.bottomKnee = 180;
    return rep;
  }
}

export const stiffRule: ExerciseRule = {
  id: 'stiff',
  label: 'Stiff',
  keywords: ['STIFF', 'RDL', 'TERRA ROMENO'],
  view: 'side',
  instruction: () => POSITION_MESSAGES.no_body,
  silhouette: () => 'standing',
  messages: STIFF_MESSAGES,
  minDescentSeconds: STIFF_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: {
    iniciante: `tronco inclinado pelo menos ${STIFF_MIN_TRUNK_LEAN.iniciante}°`,
    intermediario: `tronco inclinado pelo menos ${STIFF_MIN_TRUNK_LEAN.intermediario}°`,
    avancado: `tronco inclinado pelo menos ${STIFF_MIN_TRUNK_LEAN.avancado}°`,
    pro: `tronco inclinado pelo menos ${STIFF_MIN_TRUNK_LEAN.pro}°`,
  },
  createCounter: (level) => new StiffRepCounter(level),
};
