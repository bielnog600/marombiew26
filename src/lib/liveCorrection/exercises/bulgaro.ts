/**
 * Regra "bulgaro" (búlgaro, afundo, passada) — vista lateral, analisa a perna da frente escolhida.
 */
import {
  DEFAULT_DEPTH_LEVEL, SIDE_POINTS, angleAt, normalizeDepthLevel, toPx, trunkAngle,
  type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import { RepCycle, nameHasKeyword, normalizeExerciseName, round6 } from './common';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

/** Joelho da frente abaixo disto = começou a descer. */
export const LUNGE_REP_START_KNEE_ANGLE = 150;
/** Joelho da frente acima disto = voltou, fim da rep. */
export const LUNGE_REP_END_KNEE_ANGLE = 160;
/** Maior ângulo do joelho da frente no fundo que conta como completa, por nível. */
export const LUNGE_MAX_BOTTOM_KNEE: Record<DepthLevel, number> = {
  iniciante: 115,
  intermediario: 105,
  avancado: 95,
  pro: 90,
};
/** Faltou até isto (graus) para o exigido = "Desce um pouco mais" (continua incompleta). */
export const LUNGE_NEAR_MARGIN = 10;
/** Tronco mais inclinado que isto (graus da vertical) no fundo = "Peito pra cima". */
export const LUNGE_MAX_TRUNK_ANGLE = 45;
/** Descida mais rápida que isto (s) = "Controla a descida". */
export const LUNGE_MIN_DESCENT_SECONDS = 1.5;

export type LungeError = 'depth' | 'depth_near' | 'trunk' | 'descent';
export const LUNGE_MESSAGES: Record<LungeError, string> = {
  depth: 'Desce mais',
  depth_near: 'Desce um pouco mais',
  trunk: 'Peito pra cima',
  descent: 'Controla a descida',
};

export const BULGARO_INSTRUCTION = 'Coloca o celular no chão, de lado, com o banco aparecendo';
export const LUNGE_INSTRUCTION = 'Coloca o celular no chão, de lado pra você, com o corpo inteiro aparecendo';

export interface LungeMetrics {
  frontKneeAngle: number;
  trunkAngle: number;
}

/** Joelho da perna da frente (quadril-joelho-tornozelo) e tronco do mesmo lado. */
export function lungeMetrics(lms: Landmark[], width: number, height: number, frontLeg: Side): LungeMetrics {
  const p = SIDE_POINTS[frontLeg];
  const sh = toPx(lms[p.shoulder], width, height);
  const hip = toPx(lms[p.hip], width, height);
  const knee = toPx(lms[p.knee], width, height);
  const ankle = toPx(lms[p.ankle], width, height);
  return { frontKneeAngle: angleAt(hip, knee, ankle), trunkAngle: trunkAngle(sh, hip) };
}

export function judgeLungeDepth(minFrontKnee: number, level: unknown = DEFAULT_DEPTH_LEVEL) {
  const required = LUNGE_MAX_BOTTOM_KNEE[normalizeDepthLevel(level)];
  const knee = round6(minFrontKnee);
  if (knee <= required) return { deepEnough: true, near: false };
  return { deepEnough: false, near: knee <= required + LUNGE_NEAR_MARGIN };
}

export interface LungeRep extends LiveRep {
  leg: Side;
  minKneeAngle: number;
  bottomTrunkAngle: number;
}

export class LungeRepCounter implements LiveRepCounter {
  readonly ruleId = 'bulgaro' as const;
  readonly reps: LungeRep[] = [];
  private cycle = new RepCycle(LUNGE_REP_START_KNEE_ANGLE, LUNGE_REP_END_KNEE_ANGLE);
  private bottomTrunk = 0;
  private depthLevel: DepthLevel;
  private leg: Side;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL, frontLeg: Side = 'left') {
    this.depthLevel = normalizeDepthLevel(level);
    this.leg = frontLeg;
  }
  get level() { return this.depthLevel; }
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }
  get frontLeg() { return this.leg; }
  /** Troca a perna da frente: cancela a rep em andamento e espera a pessoa voltar ao topo. */
  setFrontLeg(leg: Side) {
    if (leg === this.leg) return;
    this.leg = leg;
    this.abortRep();
  }
  get inRep() { return this.cycle.inRep; }
  get atTop() { return this.cycle.atTop; }
  reset() { this.cycle.reset(); this.reps.length = 0; this.bottomTrunk = 0; }
  abortRep() { this.cycle.abort(); this.bottomTrunk = 0; }
  waitForStanding() { this.abortRep(); }
  /** Sempre mede a perna da frente escolhida. */
  measureSide(): Side { return this.leg; }
  update(lms: Landmark[], width: number, height: number, _side: Side, t?: number) {
    return this.push(lungeMetrics(lms, width, height, this.leg), t);
  }

  push(m: LungeMetrics, t?: number): LungeRep | null {
    const ev = this.cycle.step(m.frontKneeAngle, t);
    if (ev === 'start' || ev === 'bottom') this.bottomTrunk = m.trunkAngle; // tronco no ponto mais baixo
    if (ev !== 'end') return null;

    const errors: LungeError[] = [];
    const minKnee = this.cycle.minAngle;
    const { deepEnough, near } = judgeLungeDepth(minKnee, this.depthLevel);
    if (!deepEnough) errors.push(near ? 'depth_near' : 'depth');
    if (this.bottomTrunk > LUNGE_MAX_TRUNK_ANGLE) errors.push('trunk');
    const descentSeconds = this.cycle.descentSeconds();
    const fastDescent = descentSeconds != null && descentSeconds < LUNGE_MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: LungeRep = {
      index: this.reps.length + 1,
      complete: deepEnough,
      errors,
      descentSeconds,
      fastDescent,
      leg: this.leg,
      minKneeAngle: Math.round(minKnee),
      bottomTrunkAngle: Math.round(this.bottomTrunk),
    };
    this.reps.push(rep);
    this.cycle.finish();
    this.bottomTrunk = 0;
    return rep;
  }
}

/** Nome sem afundo/passada (ou vazio, no teste) = búlgaro, com banco. */
const isBulgaroName = (name?: string | null) => {
  const n = normalizeExerciseName(name);
  return !n || nameHasKeyword(n, 'BULGARO') || !(nameHasKeyword(n, 'AFUNDO') || nameHasKeyword(n, 'PASSADA'));
};

export const bulgaroRule: ExerciseRule = {
  id: 'bulgaro',
  label: 'Búlgaro / afundo',
  keywords: ['BULGARO', 'AFUNDO', 'PASSADA'],
  view: 'side',
  instruction: (name) => (isBulgaroName(name) ? BULGARO_INSTRUCTION : LUNGE_INSTRUCTION),
  silhouette: (name) => (isBulgaroName(name) ? 'split_bench' : 'split'),
  messages: LUNGE_MESSAGES,
  minDescentSeconds: LUNGE_MIN_DESCENT_SECONDS,
  needsFrontLeg: true,
  levelHints: {
    iniciante: `joelho da frente até ${LUNGE_MAX_BOTTOM_KNEE.iniciante}°`,
    intermediario: `joelho da frente até ${LUNGE_MAX_BOTTOM_KNEE.intermediario}°`,
    avancado: `joelho da frente até ${LUNGE_MAX_BOTTOM_KNEE.avancado}°`,
    pro: `joelho da frente até ${LUNGE_MAX_BOTTOM_KNEE.pro}°`,
  },
  createCounter: (level, frontLeg) => new LungeRepCounter(level, frontLeg),
};

/**
 * Fim automático do búlgaro: só depois de reps nas duas pernas (trocar de perna leva tempo
 * e a pessoa sai do quadro). Com uma perna só, a série fecha no botão Finalizar.
 */
export function lungeAutoFinishRepCount(reps: LiveRep[]): number {
  const legs = new Set(reps.map((r) => r.leg).filter(Boolean));
  return legs.size >= 2 ? reps.length : 0;
}
