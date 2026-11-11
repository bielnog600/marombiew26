/**
 * Regra "leg_press" (leg press 45°, leg 180) — vista lateral, sentado/deitado na máquina.
 * Não exige o corpo inteiro: quadril, joelho e tornozelo do lado mais próximo.
 */
import {
  DEFAULT_DEPTH_LEVEL, LM, SIDE_POINTS, angleAt, normalizeDepthLevel, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { RepCycle, arePointsVisible, round6 } from './common';
import { LockoutHold } from './arms';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Joelho (quadril-joelho-tornozelo) abaixo disto = começou a descer. */
export const LEG_PRESS_REP_START_KNEE_ANGLE = 150;
/** Joelho acima disto = empurrou de volta, fim da rep. */
export const LEG_PRESS_REP_END_KNEE_ANGLE = 160;
/** Menor ângulo do joelho exigido, por nível. */
export const LEG_PRESS_MAX_BOTTOM_KNEE: Record<DepthLevel, number> = {
  iniciante: 100,
  intermediario: 90,
  avancado: 80,
  pro: 70,
};
/** Faltou até isto (graus) = "Desce um pouco mais" (continua incompleta). */
export const LEG_PRESS_NEAR_MARGIN = 10;
/** Maior ângulo no topo acima disto = "Não trava o joelho" (aviso). */
export const LEG_PRESS_MAX_TOP_KNEE = 175;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const LEG_PRESS_MIN_DESCENT_SECONDS = 1.5;

export type LegPressError = 'leg_low' | 'leg_near' | 'knee_lock' | 'descent';
export const LEG_PRESS_MESSAGES: Record<LegPressError, string> = {
  leg_low: 'Desce mais',
  leg_near: 'Desce um pouco mais',
  knee_lock: 'Não trava o joelho',
  descent: 'Controla a descida',
};

export const LEG_PRESS_INSTRUCTION = 'Celular de lado da máquina, com quadril, joelho e pé aparecendo';

const vis = (l?: Landmark) => (l ? l.visibility ?? 1 : 0);

/** Lado com quadril, joelho e tornozelo mais visíveis. Empate = esquerdo. */
export function pickLegSide(lms: Landmark[]): Side {
  const score = (s: Side) => vis(lms[SIDE_POINTS[s].hip]) + vis(lms[SIDE_POINTS[s].knee]) + vis(lms[SIDE_POINTS[s].ankle]);
  return score('left') >= score('right') ? 'left' : 'right';
}

export function legPressKneeAngle(lms: Landmark[], width: number, height: number, side: Side): number {
  const p = SIDE_POINTS[side];
  return angleAt(toPx(lms[p.hip], width, height), toPx(lms[p.knee], width, height), toPx(lms[p.ankle], width, height));
}

export function judgeLegPressDepth(minKnee: number, level: unknown = DEFAULT_DEPTH_LEVEL) {
  const required = LEG_PRESS_MAX_BOTTOM_KNEE[normalizeDepthLevel(level)];
  const m = round6(minKnee);
  if (m <= required) return { deepEnough: true, near: false };
  return { deepEnough: false, near: m <= required + LEG_PRESS_NEAR_MARGIN };
}

export interface LegPressRep extends LiveRep {
  minKneeAngle: number;
  topKneeAngle: number;
}

interface Pending { min: number; descent: number | null }

export class LegPressCounter implements LiveRepCounter {
  readonly ruleId = 'leg_press' as const;
  readonly reps: LegPressRep[] = [];
  private cycle = new RepCycle(LEG_PRESS_REP_START_KNEE_ANGLE, LEG_PRESS_REP_END_KNEE_ANGLE);
  private hold = new LockoutHold<Pending>();
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  /** Também enquanto o topo da rep ainda não assentou. */
  get inRep() { return this.cycle.inRep || this.hold.active; }
  get atTop() { return !this.hold.active && this.cycle.atTop; }

  reset() { this.cycle.reset(); this.reps.length = 0; this.hold.clear(); }
  abortRep() { this.cycle.abort(); this.hold.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickLegSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(legPressKneeAngle(lms, width, height, side), t);
  }

  flush(): LegPressRep | null { return this.close(); }

  push(kneeAngle: number, t?: number): LegPressRep | null {
    const now = t ?? null;
    const ev = this.cycle.step(kneeAngle, t);
    let out: LegPressRep | null = null;
    if (this.hold.active) {
      this.hold.track(kneeAngle);
      if (ev === 'start' || this.hold.shouldClose(kneeAngle, now)) out = this.close();
    }
    if (ev === 'end') {
      this.hold.open({ min: this.cycle.minAngle, descent: this.cycle.descentSeconds() }, kneeAngle, now);
      this.cycle.finish();
    }
    return out;
  }

  private close(): LegPressRep | null {
    const taken = this.hold.take();
    if (!taken) return null;
    const { data, peak } = taken;
    const errors: LegPressError[] = [];
    const { deepEnough, near } = judgeLegPressDepth(data.min, this.depthLevel);
    if (!deepEnough) errors.push(near ? 'leg_near' : 'leg_low');
    if (round6(peak) > LEG_PRESS_MAX_TOP_KNEE) errors.push('knee_lock');
    const fastDescent = data.descent != null && data.descent < LEG_PRESS_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: LegPressRep = {
      index: this.reps.length + 1,
      complete: deepEnough,
      errors,
      descentSeconds: data.descent,
      fastDescent,
      minKneeAngle: Math.round(data.min),
      topKneeAngle: Math.round(peak),
    };
    this.reps.push(rep);
    return rep;
  }
}

/** Quadril, joelho e tornozelo do lado medido. */
export const legPressPoints = (side: Side) => [SIDE_POINTS[side].hip, SIDE_POINTS[side].knee, SIDE_POINTS[side].ankle];

export const legPressRule: ExerciseRule = {
  id: 'leg_press',
  label: 'Leg press',
  keywords: ['LEG PRESS', 'LEG 180', 'LEG 45'],
  view: 'side',
  instruction: () => LEG_PRESS_INSTRUCTION,
  silhouette: () => 'leg_press',
  messages: LEG_PRESS_MESSAGES,
  minDescentSeconds: LEG_PRESS_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: {
    iniciante: `joelho até ${LEG_PRESS_MAX_BOTTOM_KNEE.iniciante}°`,
    intermediario: `joelho até ${LEG_PRESS_MAX_BOTTOM_KNEE.intermediario}°`,
    avancado: `joelho até ${LEG_PRESS_MAX_BOTTOM_KNEE.avancado}°`,
    pro: `joelho até ${LEG_PRESS_MAX_BOTTOM_KNEE.pro}°`,
  },
  createCounter: (level) => new LegPressCounter(level),
  isBodyVisible: (lms, side) => arePointsVisible(lms, legPressPoints(side)),
  lostMessage: 'Quadril, joelho e pé na câmera',
  stillPoints: [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle],
  // 2× a perna (quadril→joelho→tornozelo) ≈ a altura usada no corpo inteiro, para o mesmo limite de "parado".
  stillScale: (lms, width, height, side) => {
    const p = SIDE_POINTS[side];
    const hip = toPx(lms[p.hip], width, height), knee = toPx(lms[p.knee], width, height), ankle = toPx(lms[p.ankle], width, height);
    return 2 * (Math.hypot(hip.x - knee.x, hip.y - knee.y) + Math.hypot(knee.x - ankle.x, knee.y - ankle.y));
  },
  startHint: 'A contagem começa sozinha quando quadril, joelho e pé aparecerem parados por 2 segundos.',
};
