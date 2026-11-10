/**
 * Correção ao vivo — agachamento em vista lateral.
 * Lógica pura (sem câmera nem MediaPipe) para poder ser testada.
 * Ajuste os limites nas constantes abaixo.
 */

/** Joelho abaixo deste ângulo (graus) = começou a descer. */
export const REP_START_KNEE_ANGLE = 150;
/** Joelho acima deste ângulo (graus) = voltou em pé, fim da rep. */
export const REP_END_KNEE_ANGLE = 165;
/** Tronco mais inclinado que isto (graus da vertical) no fundo = "Peito pra cima". */
export const MAX_TRUNK_ANGLE = 50;
/** Descida (de 165° até o ponto mais baixo) mais rápida que isto, em segundos = "Controla a descida". */
export const MIN_DESCENT_SECONDS = 1.5;
/**
 * Folga da profundidade, em fração do comprimento da coxa: o quadril precisa
 * chegar até (altura do joelho − folga). 0 = exatamente na altura do joelho.
 */
export const DEPTH_TOLERANCE = 0.05;
/** Quantos frames entram na média que suaviza os pontos. */
export const SMOOTHING_FRAMES = 5;
/** Tempo com o corpo inteiro visível antes de começar a contar. */
export const FULL_BODY_HOLD_MS = 2000;
/** Visibilidade mínima de cada ponto para considerar o corpo inteiro. */
export const MIN_VISIBILITY = 0.5;
/** Intervalo mínimo entre falas da voz. */
export const VOICE_COOLDOWN_MS = 3000;
/** Cor do esqueleto. */
export const SKELETON_COLOR = '#FACC15';

/** Índices do MediaPipe Pose. */
export const LM = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const;

export type Side = 'left' | 'right';
export const SIDE_POINTS: Record<Side, { shoulder: number; hip: number; knee: number; ankle: number }> = {
  left: { shoulder: LM.leftShoulder, hip: LM.leftHip, knee: LM.leftKnee, ankle: LM.leftAnkle },
  right: { shoulder: LM.rightShoulder, hip: LM.rightHip, knee: LM.rightKnee, ankle: LM.rightAnkle },
};

export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface Point { x: number; y: number }

export type SquatError = 'depth' | 'trunk' | 'descent';
export const ERROR_MESSAGES: Record<SquatError, string> = {
  depth: 'Desce mais',
  trunk: 'Peito pra cima',
  descent: 'Controla a descida',
};

/** Média móvel dos últimos N frames, ponto a ponto. */
export class LandmarkSmoother {
  private history: Landmark[][] = [];
  constructor(private readonly size = SMOOTHING_FRAMES) {}
  reset() { this.history = []; }
  push(frame: Landmark[]): Landmark[] {
    this.history.push(frame);
    if (this.history.length > this.size) this.history.shift();
    const n = this.history.length;
    return frame.map((_, i) => {
      let x = 0, y = 0, z = 0, v = 0;
      for (const f of this.history) {
        const p = f[i] ?? frame[i];
        x += p.x; y += p.y; z += p.z ?? 0; v += p.visibility ?? 1;
      }
      return { x: x / n, y: y / n, z: z / n, visibility: v / n };
    });
  }
}

/** Ângulo ABC (em B), em graus. */
export function angleAt(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Ângulo entre a linha quadril→ombro e a vertical, em graus (0 = tronco em pé). */
export function trunkAngle(shoulder: Point, hip: Point): number {
  const dx = shoulder.x - hip.x, dy = shoulder.y - hip.y;
  const m = Math.hypot(dx, dy);
  if (m === 0) return 0;
  // vertical para cima na imagem = (0, -1)
  const cos = Math.min(1, Math.max(-1, -dy / m));
  return (Math.acos(cos) * 180) / Math.PI;
}

const vis = (l?: Landmark) => (l ? l.visibility ?? 1 : 0);

/** Lado do corpo mais visível para a câmera. */
export function pickSide(lms: Landmark[]): Side {
  const score = (s: Side) => Object.values(SIDE_POINTS[s]).reduce((sum, i) => sum + vis(lms[i]), 0);
  return score('left') >= score('right') ? 'left' : 'right';
}

const inFrame = (l?: Landmark) => !!l && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;

/** Corpo inteiro visível: cabeça + ombro, quadril, joelho e tornozelo do lado escolhido. */
export function isFullBodyVisible(lms: Landmark[] | null | undefined, side: Side): boolean {
  if (!lms || lms.length < 29) return false;
  const ids = [LM.nose, ...Object.values(SIDE_POINTS[side])];
  return ids.every((i) => vis(lms[i]) >= MIN_VISIBILITY && inFrame(lms[i]));
}

/** Converte coordenadas normalizadas para pixels, para que os ângulos respeitem a proporção do vídeo. */
export function toPx(l: Landmark, width: number, height: number): Point {
  return { x: l.x * width, y: l.y * height };
}

export interface FrameMetrics {
  side: Side;
  kneeAngle: number;
  trunkAngle: number;
  /** (quadril.y − joelho.y) / coxa. ≥ −DEPTH_TOLERANCE = chegou na altura do joelho. */
  hipDepth: number;
}

export function frameMetrics(lms: Landmark[], width: number, height: number, side: Side = pickSide(lms)): FrameMetrics {
  const p = SIDE_POINTS[side];
  const sh = toPx(lms[p.shoulder], width, height);
  const hip = toPx(lms[p.hip], width, height);
  const knee = toPx(lms[p.knee], width, height);
  const ankle = toPx(lms[p.ankle], width, height);
  const thigh = Math.hypot(hip.x - knee.x, hip.y - knee.y) || 1;
  return {
    side,
    kneeAngle: angleAt(hip, knee, ankle),
    trunkAngle: trunkAngle(sh, hip),
    hipDepth: (hip.y - knee.y) / thigh,
  };
}

export interface RepResult {
  index: number;
  complete: boolean;
  errors: SquatError[];
  minKneeAngle: number;
  bottomTrunkAngle: number;
  maxHipDepth: number;
  /** Segundos do joelho passar de 165° para baixo até o ponto mais baixo; null = não deu para medir. */
  descentSeconds: number | null;
  /** Descida mais rápida que MIN_DESCENT_SECONDS (não deixa a rep incompleta). */
  fastDescent: boolean;
}

/** Contador de reps: começa < 150°, termina > 165°. */
export class SquatRepCounter {
  private phase: 'up' | 'down' = 'up';
  private minKnee = 180;
  private bottomTrunk = 0;
  private maxDepth = -Infinity;
  /** Último ângulo do joelho visto (para detectar a passagem por 165°). */
  private lastKnee: number | null = null;
  /** Momento em que o joelho passou de 165° para baixo. */
  private descentStartAt: number | null = null;
  /** Momento do ponto mais baixo da rep atual. */
  private bottomAt: number | null = null;
  readonly reps: RepResult[] = [];

  get inRep() { return this.phase === 'down'; }

  reset() {
    this.phase = 'up';
    this.minKnee = 180;
    this.bottomTrunk = 0;
    this.maxDepth = -Infinity;
    this.lastKnee = null;
    this.descentStartAt = null;
    this.bottomAt = null;
    this.reps.length = 0;
  }

  /** Cancela uma rep em andamento (ex.: corpo saiu do quadro). */
  abortRep() {
    this.phase = 'up';
    this.minKnee = 180;
    this.maxDepth = -Infinity;
    this.lastKnee = null;
    this.descentStartAt = null;
    this.bottomAt = null;
  }

  /**
   * Alimenta um frame; devolve a rep quando ela termina.
   * `t` = horário do frame em ms (necessário para medir a descida).
   */
  update(m: FrameMetrics, t?: number): RepResult | null {
    const prevKnee = this.lastKnee;
    this.lastKnee = m.kneeAngle;
    if (this.phase === 'up') {
      if (m.kneeAngle > REP_END_KNEE_ANGLE) {
        this.descentStartAt = null; // em pé: a descida ainda não começou
      } else if (t != null && prevKnee != null && prevKnee > REP_END_KNEE_ANGLE) {
        this.descentStartAt = t; // passou de 165° para baixo
      }
      if (m.kneeAngle < REP_START_KNEE_ANGLE) {
        this.phase = 'down';
        this.minKnee = m.kneeAngle;
        this.bottomTrunk = m.trunkAngle;
        this.maxDepth = m.hipDepth;
        this.bottomAt = t ?? null;
      }
      return null;
    }
    if (m.kneeAngle < this.minKnee) {
      this.minKnee = m.kneeAngle;
      this.bottomTrunk = m.trunkAngle; // tronco medido no ponto mais baixo
      this.bottomAt = t ?? null;
    }
    if (m.hipDepth > this.maxDepth) this.maxDepth = m.hipDepth;
    if (m.kneeAngle <= REP_END_KNEE_ANGLE) return null;

    const errors: SquatError[] = [];
    const deepEnough = this.maxDepth >= -DEPTH_TOLERANCE;
    if (!deepEnough) errors.push('depth');
    if (this.bottomTrunk > MAX_TRUNK_ANGLE) errors.push('trunk');
    const descentSeconds = this.descentStartAt != null && this.bottomAt != null && this.bottomAt >= this.descentStartAt
      ? Math.round((this.bottomAt - this.descentStartAt) / 10) / 100
      : null;
    const fastDescent = descentSeconds != null && descentSeconds < MIN_DESCENT_SECONDS;
    if (fastDescent) errors.push('descent');
    const rep: RepResult = {
      index: this.reps.length + 1,
      complete: deepEnough,
      errors,
      minKneeAngle: Math.round(this.minKnee),
      bottomTrunkAngle: Math.round(this.bottomTrunk),
      maxHipDepth: Math.round(this.maxDepth * 100) / 100,
      descentSeconds,
      fastDescent,
    };
    this.reps.push(rep);
    this.phase = 'up';
    this.minKnee = 180;
    this.maxDepth = -Infinity;
    this.descentStartAt = null;
    this.bottomAt = null;
    return rep;
  }
}

export interface SessionSummary {
  total: number;
  complete: number;
  incomplete: number;
  /** Contagem por erro, maior primeiro. */
  errors: { key: SquatError; label: string; count: number }[];
  /** Média, em segundos, das descidas medidas; null se nenhuma foi medida. */
  avgDescentSeconds: number | null;
  /** Reps com descida mais rápida que MIN_DESCENT_SECONDS. */
  fastDescentReps: number;
}

export function summarizeReps(reps: RepResult[]): SessionSummary {
  const counts = new Map<SquatError, number>();
  for (const r of reps) for (const e of r.errors) counts.set(e, (counts.get(e) ?? 0) + 1);
  const complete = reps.filter((r) => r.complete).length;
  const descents = reps.map((r) => r.descentSeconds).filter((d): d is number => d != null);
  const avgDescentSeconds = descents.length
    ? Math.round((descents.reduce((a, b) => a + b, 0) / descents.length) * 100) / 100
    : null;
  return {
    total: reps.length,
    complete,
    incomplete: reps.length - complete,
    errors: [...counts.entries()]
      .map(([key, count]) => ({ key, label: ERROR_MESSAGES[key], count }))
      .sort((a, b) => b.count - a.count),
    avgDescentSeconds,
    fastDescentReps: reps.filter((r) => r.fastDescent).length,
  };
}

export function errorsToJson(summary: SessionSummary): Record<string, number> {
  return Object.fromEntries(summary.errors.map((e) => [e.key, e.count]));
}

/** Botão só em exercícios de agachamento (sem diferenciar acento/maiúsculas). */
export function isSquatExercise(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('agachamento');
}

/** Limita falas a uma a cada VOICE_COOLDOWN_MS. */
export function canSpeak(lastSpokeAt: number | null, now: number): boolean {
  return lastSpokeAt == null || now - lastSpokeAt >= VOICE_COOLDOWN_MS;
}

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Número por extenso em português (1–999): 1 → "um", 21 → "vinte e um". */
export function repNumberWord(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100), rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10), u = rest % 10;
    if (t) parts.push(TENS[t]);
    if (u) parts.push(UNITS[u]);
  }
  return parts.join(' e ');
}

export interface RepSpeech {
  /** Falas na ordem: número primeiro, depois a correção. */
  texts: string[];
  /** A correção entrou (reinicia o intervalo de 3 s das correções). */
  correctionSpoken: boolean;
}

/**
 * O que falar ao fim de uma rep. O número (só reps completas) sempre fala e não
 * entra no limite; a correção respeita uma fala a cada VOICE_COOLDOWN_MS.
 */
export function planRepSpeech(rep: RepResult, completeCount: number, lastCorrectionAt: number | null, now: number): RepSpeech {
  const texts: string[] = [];
  if (rep.complete) texts.push(repNumberWord(completeCount));
  let correctionSpoken = false;
  if (rep.errors.length && canSpeak(lastCorrectionAt, now)) {
    texts.push(rep.errors.map((e) => ERROR_MESSAGES[e]).join('. '));
    correctionSpoken = true;
  }
  return { texts, correctionSpoken };
}
