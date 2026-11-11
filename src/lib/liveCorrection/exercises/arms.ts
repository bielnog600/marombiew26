/**
 * Peças compartilhadas pelas regras de braço/ombro (rosca, tríceps francês, desenvolvimento).
 * Lógica pura, sem câmera.
 */
import { LM, toPx, type Landmark, type Point, type Side } from '../squatAnalysis';
import { arePointsVisible, round6 } from './common';
import { ARM_LM, ARM_POINTS } from './lateralRaise';

const vis = (l?: Landmark) => (l ? l.visibility ?? 1 : 0);

/** Braço mais próximo da câmera (ombro, cotovelo e punho mais visíveis). Empate = esquerdo. */
export function pickArmSide(lms: Landmark[]): Side {
  const score = (s: Side) => {
    const a = ARM_POINTS[s];
    return vis(lms[a.shoulder]) + vis(lms[a.elbow]) + vis(lms[a.wrist]);
  };
  return score('left') >= score('right') ? 'left' : 'right';
}

/** De lado: ombro, cotovelo, punho e quadril do braço medido. */
export function sideArmPoints(side: Side): number[] {
  const a = ARM_POINTS[side];
  return [a.shoulder, a.elbow, a.wrist, a.hip];
}

/** De frente: ombros, cotovelos, punhos e quadril dos dois lados. */
export const FRONT_ARM_POINTS: readonly number[] = [
  LM.leftShoulder, LM.rightShoulder, ARM_LM.leftElbow, ARM_LM.rightElbow,
  ARM_LM.leftWrist, ARM_LM.rightWrist, LM.leftHip, LM.rightHip,
];

export const isSideArmVisible = (lms: Landmark[] | null | undefined, side: Side) => arePointsVisible(lms, sideArmPoints(side));
export const isFrontArmsVisible = (lms: Landmark[] | null | undefined) => arePointsVisible(lms, FRONT_ARM_POINTS);

/** "Parado" de lado: ombros e quadris (o braço de trás aparece pouco e treme). */
export const SIDE_UPPER_STILL_POINTS: readonly number[] = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
/** "Parado" de frente: igual à elevação lateral. */
export const FRONT_UPPER_STILL_POINTS: readonly number[] = [
  LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, ARM_LM.leftWrist, ARM_LM.rightWrist,
];

/** 2× o tronco ≈ a altura usada no corpo inteiro, para o mesmo limite de "parado". */
export function upperBodyStillScale(lms: Landmark[], width: number, height: number): number {
  const P = (i: number) => toPx(lms[i], width, height);
  const ls = P(LM.leftShoulder), rs = P(LM.rightShoulder), lh = P(LM.leftHip), rh = P(LM.rightHip);
  return 2 * Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
}

/** Inclinação de `from`→`to` em relação à vertical para cima, com sinal (graus; 0 = `to` bem acima de `from`). */
export function tiltFromVertical(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
}

/** Depois de passar do fim da rep, espera o topo assentar: cair isto (graus) do pico fecha a rep. */
export const ARM_TOP_DROP = 5;
/** …ou ficar isto (ms) em cima. */
export const ARM_TOP_SETTLE_MS = 1000;
/** Ângulo sem mudar mais que isto (graus) por ARM_REST_MS = parado (fim automático). */
export const ARM_REST_TOLERANCE = 5;
export const ARM_REST_MS = 1000;

/**
 * Topo da rep ainda aberto: a rep já voltou acima do fim, mas o pico (braço esticado) só é
 * conhecido quando o braço para de subir. Fecha ao cair ARM_TOP_DROP do pico, depois de
 * ARM_TOP_SETTLE_MS em cima, quando a próxima rep começa ou ao finalizar a série.
 */
export class LockoutHold<P> {
  private data: P | null = null;
  private max = -Infinity;
  private since: number | null = null;

  get active() { return this.data != null; }
  get peak() { return this.max; }

  open(data: P, angle: number, t: number | null) {
    this.data = data;
    this.max = angle;
    this.since = t;
  }

  /** Atualiza o pico; true = este frame é o novo pico. */
  track(angle: number): boolean {
    if (!this.active || angle <= this.max) return false;
    this.max = angle;
    return true;
  }

  shouldClose(angle: number, t: number | null): boolean {
    if (!this.active) return false;
    if (round6(angle) <= round6(this.max - ARM_TOP_DROP)) return true;
    return t != null && this.since != null && t - this.since >= ARM_TOP_SETTLE_MS;
  }

  take(): { data: P; peak: number } | null {
    if (this.data == null) return null;
    const out = { data: this.data, peak: this.max };
    this.clear();
    return out;
  }

  clear() {
    this.data = null;
    this.max = -Infinity;
    this.since = null;
  }
}

/** Ângulo parado (±ARM_REST_TOLERANCE) por ARM_REST_MS, para o fim automático com os braços em qualquer posição. */
export class AngleRest {
  private ref: number | null = null;
  private since: number | null = null;
  private lastT: number | null = null;

  get resting() {
    return this.lastT != null && this.since != null && this.lastT - this.since >= ARM_REST_MS;
  }

  push(angle: number, t: number | null) {
    this.lastT = t;
    if (this.ref == null || Math.abs(angle - this.ref) > ARM_REST_TOLERANCE) {
      this.ref = angle;
      this.since = t;
    }
  }

  reset() { this.ref = null; this.since = null; this.lastT = null; }
}

export const SIDE_UPPER_START_HINT = 'A contagem começa sozinha quando você aparecer de lado, da cintura pra cima, parado, por 2 segundos.';
export const SIDE_UPPER_LOST_MESSAGE = 'Braço e cintura na câmera';
