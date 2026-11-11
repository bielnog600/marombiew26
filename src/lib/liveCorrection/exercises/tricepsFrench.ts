/**
 * Regra "triceps_french" (tríceps francês) — vista lateral, braço mais próximo da câmera.
 * Não exige o corpo inteiro: ombro, cotovelo, punho e quadril do braço medido.
 */
import {
  DEFAULT_DEPTH_LEVEL, angleAt, normalizeDepthLevel, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { RepCycle, round6 } from './common';
import {
  AngleRest, LockoutHold, SIDE_UPPER_LOST_MESSAGE, SIDE_UPPER_START_HINT, SIDE_UPPER_STILL_POINTS,
  isSideArmVisible, pickArmSide, tiltFromVertical, upperBodyStillScale,
} from './arms';
import { ARM_POINTS } from './lateralRaise';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Cotovelo abaixo disto = começou a descer atrás da cabeça. */
export const TRICEPS_REP_START_ELBOW_ANGLE = 140;
/** Cotovelo acima disto = voltou a esticar, fim da rep. */
export const TRICEPS_REP_END_ELBOW_ANGLE = 150;
/** Menor ângulo do cotovelo até isto = completa (desceu tudo). */
export const TRICEPS_MAX_BOTTOM_ANGLE = 70;
/** Faltou até isto (graus) = "Desce um pouco mais" (continua incompleta). */
export const TRICEPS_NEAR_MARGIN = 10;
/** Maior ângulo no topo abaixo disto = "Estica em cima" (aviso). */
export const TRICEPS_MIN_LOCKOUT_ANGLE = 160;
/** Braço (ombro→cotovelo) mudando de inclinação mais que isto (graus) na rep = "Cotovelo parado" (aviso). */
export const TRICEPS_MAX_ARM_TILT_CHANGE = 20;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const TRICEPS_MIN_DESCENT_SECONDS = 1.5;

export type TricepsError = 'triceps_low' | 'triceps_near' | 'lockout' | 'elbow_still' | 'descent';
export const TRICEPS_MESSAGES: Record<TricepsError, string> = {
  triceps_low: 'Desce mais atrás da cabeça',
  triceps_near: 'Desce um pouco mais',
  lockout: 'Estica em cima',
  elbow_still: 'Cotovelo parado',
  descent: 'Controla a descida',
};

export const TRICEPS_INSTRUCTION = 'Celular de lado, com o corpo da cintura pra cima e o braço aparecendo, também acima da cabeça';

export interface TricepsMetrics {
  elbowAngle: number;
  /** Inclinação do braço (ombro→cotovelo) vs vertical para cima, com sinal. */
  armTilt: number;
}

export function tricepsMetrics(lms: Landmark[], width: number, height: number, side: Side): TricepsMetrics {
  const a = ARM_POINTS[side];
  const P = (i: number) => toPx(lms[i], width, height);
  const sh = P(a.shoulder), el = P(a.elbow), wr = P(a.wrist);
  return { elbowAngle: angleAt(sh, el, wr), armTilt: tiltFromVertical(sh, el) };
}

export function judgeTricepsBottom(minElbow: number) {
  const m = round6(minElbow);
  if (m <= TRICEPS_MAX_BOTTOM_ANGLE) return { complete: true, near: false };
  return { complete: false, near: m <= TRICEPS_MAX_BOTTOM_ANGLE + TRICEPS_NEAR_MARGIN };
}

export interface TricepsRep extends LiveRep {
  minElbowAngle: number;
  topElbowAngle: number;
  armTiltChange: number;
}

interface Pending { min: number; tilt: number; descent: number | null }

export class TricepsFrenchCounter implements LiveRepCounter {
  readonly ruleId = 'triceps_french' as const;
  readonly reps: TricepsRep[] = [];
  private cycle = new RepCycle(TRICEPS_REP_START_ELBOW_ANGLE, TRICEPS_REP_END_ELBOW_ANGLE);
  private hold = new LockoutHold<Pending>();
  private rest = new AngleRest();
  private tiltMin = 0;
  private tiltMax = 0;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  /** Também enquanto o topo da rep ainda não assentou. */
  get inRep() { return this.cycle.inRep || this.hold.active; }
  get atTop() { return !this.hold.active && this.cycle.atTop; }
  /** Braço esticado em cima ou parado em qualquer posição ≥ 1 s (ex.: halter apoiado no fim da série). */
  get resting() { return !this.hold.active && (this.cycle.atTop || this.rest.resting); }

  reset() { this.cycle.reset(); this.reps.length = 0; this.hold.clear(); this.rest.reset(); }
  abortRep() { this.cycle.abort(); this.hold.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickArmSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number) {
    return this.push(tricepsMetrics(lms, width, height, side), t);
  }

  flush(): TricepsRep | null { return this.close(); }

  push(m: TricepsMetrics, t?: number): TricepsRep | null {
    const a = m.elbowAngle;
    const now = t ?? null;
    this.rest.push(a, now);
    const ev = this.cycle.step(a, t);
    let out: TricepsRep | null = null;
    if (this.hold.active) {
      this.hold.track(a);
      if (ev === 'start' || this.hold.shouldClose(a, now)) out = this.close();
    }
    if (ev === 'start') {
      this.tiltMin = this.tiltMax = m.armTilt;
    } else if (this.cycle.inRep || ev === 'end') {
      this.tiltMin = Math.min(this.tiltMin, m.armTilt);
      this.tiltMax = Math.max(this.tiltMax, m.armTilt);
    }
    if (ev === 'end') {
      this.hold.open({ min: this.cycle.minAngle, tilt: this.tiltMax - this.tiltMin, descent: this.cycle.descentSeconds() }, a, now);
      this.cycle.finish();
    }
    return out;
  }

  private close(): TricepsRep | null {
    const taken = this.hold.take();
    if (!taken) return null;
    const { data, peak } = taken;
    const errors: TricepsError[] = [];
    const verdict = judgeTricepsBottom(data.min);
    if (!verdict.complete) errors.push(verdict.near ? 'triceps_near' : 'triceps_low');
    if (round6(peak) < TRICEPS_MIN_LOCKOUT_ANGLE) errors.push('lockout');
    if (round6(data.tilt) > TRICEPS_MAX_ARM_TILT_CHANGE) errors.push('elbow_still');
    const fastDescent = data.descent != null && data.descent < TRICEPS_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: TricepsRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds: data.descent,
      fastDescent,
      minElbowAngle: Math.round(data.min),
      topElbowAngle: Math.round(peak),
      armTiltChange: Math.round(data.tilt),
    };
    this.reps.push(rep);
    return rep;
  }
}

const hint = `cotovelo até ${TRICEPS_MAX_BOTTOM_ANGLE}° atrás da cabeça`;

export const tricepsFrenchRule: ExerciseRule = {
  id: 'triceps_french',
  label: 'Tríceps francês',
  keywords: ['TRICEPS FRANCES', 'FRANCES'],
  view: 'side',
  instruction: () => TRICEPS_INSTRUCTION,
  silhouette: () => 'side_upper',
  messages: TRICEPS_MESSAGES,
  minDescentSeconds: TRICEPS_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new TricepsFrenchCounter(level),
  isBodyVisible: (lms, side) => isSideArmVisible(lms, side),
  lostMessage: SIDE_UPPER_LOST_MESSAGE,
  stillPoints: SIDE_UPPER_STILL_POINTS,
  stillScale: (lms, width, height) => upperBodyStillScale(lms, width, height),
  skeleton: 'arm_side',
  startHint: SIDE_UPPER_START_HINT,
};
