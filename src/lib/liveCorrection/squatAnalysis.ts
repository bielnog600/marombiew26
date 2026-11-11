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
 * Este é o nível "Intermediário" (padrão); cada aluno pode ter outro nível (DEPTH_LEVELS).
 */
export const DEPTH_TOLERANCE = 0.15;
/** Nenhum nível pode ter folga maior que isto. */
export const MAX_DEPTH_TOLERANCE = 0.25;
/**
 * Trava contra agachamento parcial, independente da folga: se o menor ângulo do
 * joelho da rep for MAIOR que isto (graus), a rep é incompleta ("Desce mais").
 */
export const MAX_BOTTOM_KNEE_ANGLE = 110;
/** Faltou até isto para o exigido pelo nível (fração da coxa) = "Desce um pouco mais" (continua incompleta). */
export const NEAR_DEPTH_MARGIN = 0.1;

/** Profundidade exigida, escolhida pelo admin na ficha do aluno. */
export type DepthLevel = 'iniciante' | 'intermediario' | 'avancado' | 'pro';
export const DEFAULT_DEPTH_LEVEL: DepthLevel = 'intermediario';
/**
 * minHipDepth = menor hipDepth máximo da rep que conta como completa
 * (fração da coxa; negativo = quadril acima da linha do joelho, positivo = abaixo).
 */
export const DEPTH_LEVELS: Record<DepthLevel, { label: string; minHipDepth: number; hint: string }> = {
  iniciante: { label: 'Iniciante', minHipDepth: -0.25, hint: 'quadril até 25% da coxa acima do joelho' },
  intermediario: { label: 'Intermediário', minHipDepth: -DEPTH_TOLERANCE, hint: 'quadril até 15% da coxa acima do joelho' },
  avancado: { label: 'Avançado', minHipDepth: -0.05, hint: 'praticamente paralelo (até 5% acima)' },
  pro: { label: 'Pro', minHipDepth: 0.05, hint: 'abaixo do paralelo (5% da coxa abaixo do joelho)' },
};
export const DEPTH_LEVEL_ORDER: DepthLevel[] = ['iniciante', 'intermediario', 'avancado', 'pro'];
/** Nomes antigos salvos antes da troca de nomes. */
const LEGACY_DEPTH_LEVELS: Record<string, DepthLevel> = {
  mobilidade_reduzida: 'iniciante',
  padrao: 'intermediario',
  paralelo: 'avancado',
};

export function isDepthLevel(v: unknown): v is DepthLevel {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEPTH_LEVELS, v);
}
/** Nível salvo → nível válido (nomes antigos convertidos; desconhecido/vazio = Intermediário). */
export function normalizeDepthLevel(v: unknown): DepthLevel {
  if (isDepthLevel(v)) return v;
  if (typeof v === 'string' && LEGACY_DEPTH_LEVELS[v]) return LEGACY_DEPTH_LEVELS[v];
  return DEFAULT_DEPTH_LEVEL;
}
/** Profundidade mínima do quadril exigida pelo nível; nunca mais permissiva que −MAX_DEPTH_TOLERANCE. */
export function requiredHipDepthFor(level: unknown): number {
  return Math.max(-MAX_DEPTH_TOLERANCE, DEPTH_LEVELS[normalizeDepthLevel(level)].minHipDepth);
}
/** Folga do nível acima da linha do joelho (negativa no Pro, que exige passar da linha). */
export function depthToleranceFor(level: unknown): number {
  return -requiredHipDepthFor(level);
}

export interface DepthVerdict {
  deepEnough: boolean;
  /** Incompleta, mas faltou pouco: "Desce um pouco mais". */
  near: boolean;
}
/**
 * Decide a profundidade da rep. Completa = quadril chegou ao exigido pelo nível E joelho
 * chegou a MAX_BOTTOM_KNEE_ANGLE ou menos. "Quase" só quando o joelho passou na trava
 * e faltou até NEAR_DEPTH_MARGIN para o exigido — parcial nunca é "quase".
 */
export function judgeDepth(maxHipDepth: number, minKneeAngle: number, level: unknown = DEFAULT_DEPTH_LEVEL): DepthVerdict {
  const required = requiredHipDepthFor(level);
  const kneeOk = minKneeAngle <= MAX_BOTTOM_KNEE_ANGLE;
  // Arredonda para não errar por ruído de ponto flutuante na borda (ex.: 0.05 exato).
  const hip = Math.round(maxHipDepth * 1e6) / 1e6;
  const hipOk = hip >= required;
  if (kneeOk && hipOk) return { deepEnough: true, near: false };
  const near = kneeOk && hip >= Math.round((required - NEAR_DEPTH_MARGIN) * 1e6) / 1e6;
  return { deepEnough: false, near };
}
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

/** Janela (ms) usada para medir se a pessoa está parada. */
export const STILL_WINDOW_MS = 500;
/**
 * Movimento máximo de quadril/ombro/tornozelo dentro da janela, em fração da
 * altura do corpo (ombro→tornozelo), para considerar a pessoa PARADA.
 */
export const STILL_MAX_MOVEMENT = 0.05;
/**
 * Vista de frente: (largura ombro-ombro + largura quadril-quadril) / 2, dividida
 * pela altura do tronco (meio dos ombros → meio dos quadris). Acima disto = de frente.
 */
export const FRONTAL_WIDTH_RATIO = 0.4;
/** Tempo que a vista (de frente/de lado) precisa se manter para mudar o estado. */
export const FRONTAL_HOLD_MS = 400;
/** Contagem regressiva antes de liberar as reps ("3, 2, 1"). */
export const COUNTDOWN_SECONDS = 3;
/** Depois da primeira rep: tempo em pé sem rep nova que encerra a série sozinha. */
export const AUTO_FINISH_IDLE_MS = 5000;
/** Depois da primeira rep: tempo com o corpo fora do quadro (saiu/aproximou) que encerra a série. */
export const AUTO_FINISH_LOST_MS = 1000;

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

export type SquatError = 'depth' | 'depth_near' | 'trunk' | 'descent';
export const ERROR_MESSAGES: Record<SquatError, string> = {
  depth: 'Desce mais',
  depth_near: 'Desce um pouco mais',
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
  /** (quadril.y − joelho.y) / coxa. ≥ −folga do nível = chegou na altura do joelho. */
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
  /** false = precisa ver a pessoa em pé (> 165°) antes de aceitar uma nova descida. */
  private armed = true;
  readonly reps: RepResult[] = [];
  private depthLevel: DepthLevel;

  constructor(level: unknown = DEFAULT_DEPTH_LEVEL) {
    this.depthLevel = normalizeDepthLevel(level);
  }

  get level(): DepthLevel { return this.depthLevel; }
  /** Troca a profundidade exigida (vale para as próximas reps). */
  setDepthLevel(level: unknown) { this.depthLevel = normalizeDepthLevel(level); }

  get inRep() { return this.phase === 'down'; }

  /** Só aceita a próxima rep depois de ver a pessoa em pé (início da série, volta de lado). */
  waitForStanding() {
    this.abortRep();
  }

  reset() {
    this.armed = true;
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
    this.armed = false;
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
      if (!this.armed) {
        if (m.kneeAngle <= REP_END_KNEE_ANGLE) return null;
        this.armed = true;
      }
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
    const { deepEnough, near } = judgeDepth(this.maxDepth, this.minKnee, this.depthLevel);
    if (!deepEnough) errors.push(near ? 'depth_near' : 'depth');
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

// ---------------------------------------------------------------------------
// Posicionamento, vista de frente e fim automático
// ---------------------------------------------------------------------------

const STILL_POINTS = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftAnkle, LM.rightAnkle];

/** Mede quanto quadril/ombro/tornozelo se mexeram nos últimos STILL_WINDOW_MS. */
export class StillnessDetector {
  private frames: { t: number; pts: Point[]; bodyHeight: number }[] = [];
  constructor(private readonly windowMs = STILL_WINDOW_MS) {}
  reset() { this.frames = []; }

  /** Devolve o movimento (fração da altura do corpo) ou null se a janela ainda não encheu. */
  push(lms: Landmark[], t: number, width = 1, height = 1, side: Side = pickSide(lms)): number | null {
    const p = SIDE_POINTS[side];
    const sh = toPx(lms[p.shoulder], width, height), an = toPx(lms[p.ankle], width, height);
    const bodyHeight = Math.hypot(sh.x - an.x, sh.y - an.y) || 1;
    this.frames.push({ t, pts: STILL_POINTS.map((i) => toPx(lms[i], width, height)), bodyHeight });
    while (this.frames.length > 1 && t - this.frames[1].t >= this.windowMs) this.frames.shift();
    if (t - this.frames[0].t < this.windowMs * 0.8) return null;
    let max = 0;
    for (let k = 0; k < STILL_POINTS.length; k++) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const f of this.frames) {
        const q = f.pts[k];
        if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
      }
      max = Math.max(max, Math.hypot(maxX - minX, maxY - minY));
    }
    return max / bodyHeight;
  }
}

export function isStillMovement(movement: number | null): boolean {
  return movement != null && movement <= STILL_MAX_MOVEMENT;
}

/** Largura média ombros/quadris ÷ altura do tronco. Grande = pessoa de frente para a câmera. */
export function frontalRatio(lms: Landmark[], width = 1, height = 1): number {
  const P = (i: number) => toPx(lms[i], width, height);
  const ls = P(LM.leftShoulder), rs = P(LM.rightShoulder), lh = P(LM.leftHip), rh = P(LM.rightHip);
  const shoulderW = Math.abs(ls.x - rs.x), hipW = Math.abs(lh.x - rh.x);
  const midSh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const trunk = Math.hypot(midSh.x - midHip.x, midSh.y - midHip.y);
  if (trunk === 0) return Infinity;
  return (shoulderW + hipW) / 2 / trunk;
}

export function isFacingCamera(lms: Landmark[] | null | undefined, width = 1, height = 1): boolean {
  if (!lms || lms.length < 29) return false;
  return frontalRatio(lms, width, height) > FRONTAL_WIDTH_RATIO;
}

/** Só troca entre "de frente" e "de lado" depois que a vista se mantém FRONTAL_HOLD_MS (evita piscar). */
export class FacingGate {
  private state = false;
  private pending: boolean | null = null;
  private pendingSince = 0;
  get frontal() { return this.state; }
  reset() { this.state = false; this.pending = null; }
  update(rawFrontal: boolean, t: number): boolean {
    if (rawFrontal === this.state) { this.pending = null; return this.state; }
    if (this.pending !== rawFrontal) { this.pending = rawFrontal; this.pendingSince = t; }
    if (t - this.pendingSince >= FRONTAL_HOLD_MS) { this.state = rawFrontal; this.pending = null; }
    return this.state;
  }
}

export type PositionIssue = 'no_body' | 'cut' | 'frontal' | 'moving' | 'ok';
export const POSITION_MESSAGES: Record<Exclude<PositionIssue, 'ok'>, string> = {
  no_body: 'Coloca o celular no chão, de lado pra você, com o corpo inteiro aparecendo',
  cut: 'Afasta um pouco',
  frontal: 'Fica de lado',
  moving: 'Fica parado',
};
export const TURN_SIDEWAYS_MESSAGE = 'Vira de lado';
export const AUTO_FINISH_MESSAGE = 'Fechou a série';

/** O que impede de liberar a contagem (na ordem: sem corpo → cortado → de frente → mexendo). */
export function diagnosePositioning(input: { hasBody: boolean; fullBody: boolean; frontal: boolean; still: boolean }): PositionIssue {
  if (!input.hasBody) return 'no_body';
  if (!input.fullBody) return 'cut';
  if (input.frontal) return 'frontal';
  if (!input.still) return 'moving';
  return 'ok';
}

/** Número da contagem regressiva (3, 2, 1) ou 0 quando acabou. */
export function countdownValue(startAt: number, now: number, seconds = COUNTDOWN_SECONDS): number {
  const elapsed = Math.max(0, now - startAt);
  return Math.max(0, seconds - Math.floor(elapsed / 1000));
}

export type AutoFinishReason = 'idle' | 'left';

/**
 * Encerra a série sozinha depois da primeira rep: AUTO_FINISH_IDLE_MS em pé sem rep nova,
 * ou AUTO_FINISH_LOST_MS com o corpo fora do quadro (saiu ou chegou perto da câmera).
 */
export class AutoFinishDetector {
  private standingSince: number | null = null;
  private lostSince: number | null = null;
  reset() { this.standingSince = null; this.lostSince = null; }
  update(input: { t: number; repCount: number; fullBody: boolean; inRep: boolean; kneeAngle: number | null }): AutoFinishReason | null {
    const { t, repCount, fullBody, inRep, kneeAngle } = input;
    if (!fullBody) {
      this.standingSince = null;
      if (this.lostSince == null) this.lostSince = t;
      return repCount > 0 && t - this.lostSince >= AUTO_FINISH_LOST_MS ? 'left' : null;
    }
    this.lostSince = null;
    const standing = !inRep && kneeAngle != null && kneeAngle > REP_END_KNEE_ANGLE;
    if (!standing) { this.standingSince = null; return null; }
    if (this.standingSince == null) this.standingSince = t;
    return repCount > 0 && t - this.standingSince >= AUTO_FINISH_IDLE_MS ? 'idle' : null;
  }
}
