/**
 * Regra "shoulder_press" (desenvolvimento, Arnold) — VISTA DE FRENTE, em pé ou sentado.
 * Não exige o corpo inteiro: ombros, cotovelos, punhos e quadril (igual à elevação lateral).
 */
import {
  DEFAULT_DEPTH_LEVEL, angleAt, normalizeDepthLevel, pickSide, toPx,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { RepCycle, round6 } from './common';
import { AngleRest, FRONT_UPPER_STILL_POINTS, LockoutHold, isFrontArmsVisible, upperBodyStillScale } from './arms';
import { ARM_POINTS } from './lateralRaise';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Média dos cotovelos abaixo disto = começou a descer. */
export const PRESS_REP_START_ELBOW_ANGLE = 140;
/** Média dos cotovelos acima disto = voltou a subir, fim da rep. */
export const PRESS_REP_END_ELBOW_ANGLE = 155;
/** Menor média até isto = completa (halter na altura da orelha). */
export const PRESS_MAX_BOTTOM_ANGLE = 95;
/** Faltou até isto (graus) = "Desce um pouco mais" (continua incompleta). */
export const PRESS_NEAR_MARGIN = 10;
/** Maior média no topo abaixo disto = "Estica em cima" (aviso). */
export const PRESS_MIN_LOCKOUT_ANGLE = 160;
/** Diferença entre os braços no topo ou no fundo acima disto (graus) = "Sobe os dois iguais" (aviso). */
export const PRESS_MAX_ASYMMETRY = 15;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const PRESS_MIN_DESCENT_SECONDS = 1.5;

export type PressError = 'press_low' | 'press_near' | 'lockout' | 'asymmetry' | 'descent';
export const PRESS_MESSAGES: Record<PressError, string> = {
  press_low: 'Desce até a altura da orelha',
  press_near: 'Desce um pouco mais',
  lockout: 'Estica em cima',
  asymmetry: 'Sobe os dois iguais',
  descent: 'Controla a descida',
};

export const PRESS_INSTRUCTION =
  'Coloca o celular no chão ou apoiado, de frente pra você, com o corpo da cintura pra cima e os braços aparecendo, também esticados em cima';

export interface PressMetrics {
  leftElbow: number;
  rightElbow: number;
}

export function pressMetrics(lms: Landmark[], width: number, height: number): PressMetrics {
  const P = (i: number) => toPx(lms[i], width, height);
  const elbow = (s: Side) => {
    const a = ARM_POINTS[s];
    return angleAt(P(a.shoulder), P(a.elbow), P(a.wrist));
  };
  return { leftElbow: elbow('left'), rightElbow: elbow('right') };
}

export function judgePressBottom(minAvgElbow: number) {
  const m = round6(minAvgElbow);
  if (m <= PRESS_MAX_BOTTOM_ANGLE) return { complete: true, near: false };
  return { complete: false, near: m <= PRESS_MAX_BOTTOM_ANGLE + PRESS_NEAR_MARGIN };
}

export interface PressRep extends LiveRep {
  minElbowAngle: number;
  topElbowAngle: number;
  bottomArmDiff: number;
  topArmDiff: number;
}

interface Pending { min: number; bottomDiff: number; descent: number | null }

export class ShoulderPressCounter implements LiveRepCounter {
  readonly ruleId = 'shoulder_press' as const;
  readonly reps: PressRep[] = [];
  private cycle = new RepCycle(PRESS_REP_START_ELBOW_ANGLE, PRESS_REP_END_ELBOW_ANGLE);
  private hold = new LockoutHold<Pending>();
  private rest = new AngleRest();
  private bottomDiff = 0;
  private topDiff = 0;
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) { this.depthLevel = normalizeDepthLevel(level); }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  /** Também enquanto o topo da rep ainda não assentou. */
  get inRep() { return this.cycle.inRep || this.hold.active; }
  get atTop() { return !this.hold.active && this.cycle.atTop; }
  /** Braços esticados em cima ou parados em qualquer posição ≥ 1 s (ex.: halteres apoiados no fim da série). */
  get resting() { return !this.hold.active && (this.cycle.atTop || this.rest.resting); }

  reset() { this.cycle.reset(); this.reps.length = 0; this.hold.clear(); this.rest.reset(); }
  abortRep() { this.cycle.abort(); this.hold.clear(); }
  waitForStanding() { this.abortRep(); }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update(lms: Landmark[], width: number, height: number, _side: Side, t?: number) {
    return this.push(pressMetrics(lms, width, height), t);
  }

  flush(): PressRep | null { return this.close(); }

  push(m: PressMetrics, t?: number): PressRep | null {
    const a = (m.leftElbow + m.rightElbow) / 2;
    const diff = Math.abs(m.leftElbow - m.rightElbow);
    const now = t ?? null;
    this.rest.push(a, now);
    const ev = this.cycle.step(a, t);
    let out: PressRep | null = null;
    if (this.hold.active) {
      if (this.hold.track(a)) this.topDiff = diff;
      if (ev === 'start' || this.hold.shouldClose(a, now)) out = this.close();
    }
    if (ev === 'start' || ev === 'bottom') this.bottomDiff = diff;
    if (ev === 'end') {
      this.hold.open({ min: this.cycle.minAngle, bottomDiff: this.bottomDiff, descent: this.cycle.descentSeconds() }, a, now);
      this.topDiff = diff;
      this.cycle.finish();
    }
    return out;
  }

  private close(): PressRep | null {
    const taken = this.hold.take();
    if (!taken) return null;
    const { data, peak } = taken;
    const errors: PressError[] = [];
    const verdict = judgePressBottom(data.min);
    if (!verdict.complete) errors.push(verdict.near ? 'press_near' : 'press_low');
    if (round6(peak) < PRESS_MIN_LOCKOUT_ANGLE) errors.push('lockout');
    if (round6(data.bottomDiff) > PRESS_MAX_ASYMMETRY || round6(this.topDiff) > PRESS_MAX_ASYMMETRY) errors.push('asymmetry');
    const fastDescent = data.descent != null && data.descent < PRESS_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: PressRep = {
      index: this.reps.length + 1,
      complete: verdict.complete,
      errors,
      descentSeconds: data.descent,
      fastDescent,
      minElbowAngle: Math.round(data.min),
      topElbowAngle: Math.round(peak),
      bottomArmDiff: Math.round(data.bottomDiff),
      topArmDiff: Math.round(this.topDiff),
    };
    this.reps.push(rep);
    return rep;
  }
}

const hint = `cotovelos até ${PRESS_MAX_BOTTOM_ANGLE}° (altura da orelha)`;

export const shoulderPressRule: ExerciseRule = {
  id: 'shoulder_press',
  label: 'Desenvolvimento',
  keywords: ['DESENV', 'DESENVOLVIMENTO', 'ARNOLD'],
  view: 'front',
  instruction: () => PRESS_INSTRUCTION,
  silhouette: () => 'front_upper',
  messages: PRESS_MESSAGES,
  minDescentSeconds: PRESS_MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: { iniciante: hint, intermediario: hint, avancado: hint, pro: hint },
  createCounter: (level) => new ShoulderPressCounter(level),
  isBodyVisible: (lms) => isFrontArmsVisible(lms),
  lostMessage: 'Braços e cintura na câmera',
  stillPoints: FRONT_UPPER_STILL_POINTS,
  stillScale: (lms, width, height) => upperBodyStillScale(lms, width, height),
  skeleton: 'arms',
};
