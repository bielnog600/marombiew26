/**
 * Peças compartilhadas pelas regras de exercício (lógica pura, sem câmera).
 */
import { MIN_VISIBILITY, TURN_SIDEWAYS_MESSAGE, type Landmark, type Side } from '../squatAnalysis';
import type { CameraView, LiveRep } from './types';

/** Aviso de vista errada numa regra de frente (elevação lateral). */
export const FACE_CAMERA_MESSAGE = 'Fica de frente pra câmera';

/** Vista errada: de frente numa regra de lado, ou de lado numa regra de frente. */
export function isWrongView(view: CameraView, facingCamera: boolean, hasBody: boolean): boolean {
  return view === 'side' ? facingCamera : hasBody && !facingCamera;
}

/** O que falar/mostrar quando a vista está errada. */
export function wrongViewMessage(view: CameraView): string {
  return view === 'front' ? FACE_CAMERA_MESSAGE : TURN_SIDEWAYS_MESSAGE;
}

/** Todos os pontos visíveis (visibilidade mínima) e dentro do quadro. */
export function arePointsVisible(lms: Landmark[] | null | undefined, ids: readonly number[]): boolean {
  if (!lms || lms.length < 29) return false;
  return ids.every((i) => {
    const l = lms[i];
    return !!l && (l.visibility ?? 1) >= MIN_VISIBILITY && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1;
  });
}

/** Avisos da rep que ainda podem ser falados (os de "1x por série" que já foram falados saem). */
export function speakableErrors(errors: readonly string[], oncePerSeries: readonly string[] | undefined, spoken: ReadonlySet<string>): string[] {
  if (!oncePerSeries?.length) return [...errors];
  return errors.filter((e) => !(oncePerSeries.includes(e) && spoken.has(e)));
}

/** Marca como falados os avisos de "1x por série" que entraram na fala. */
export function markSpokenOnce(errors: readonly string[], oncePerSeries: readonly string[] | undefined, spoken: Set<string>): void {
  if (!oncePerSeries?.length) return;
  for (const e of errors) if (oncePerSeries.includes(e)) spoken.add(e);
}

/** Nome do exercício → maiúsculas, sem acento, só letras/números separados por espaço. */
export function normalizeExerciseName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** A palavra-chave aparece no começo de alguma palavra do nome ("GLOBET" casa "GLOBET SQUATS"). */
export function nameHasKeyword(normalizedName: string, keyword: string): boolean {
  if (!normalizedName || !keyword) return false;
  return ` ${normalizedName}`.includes(` ${normalizeExerciseName(keyword)}`);
}

/**
 * Ciclo de uma rep guiado por um ângulo: começa quando o ângulo fica abaixo de `startBelow`,
 * termina quando volta acima de `endAbove`. Mede a descida (de `endAbove` para baixo até o
 * ponto mais baixo). Mesmo comportamento do contador do agachamento.
 */
export class RepCycle {
  private phase: 'up' | 'down' = 'up';
  private armed = true;
  private last: number | null = null;
  private descentStartAt: number | null = null;
  private bottomAt: number | null = null;
  private min = Infinity;

  constructor(readonly startBelow: number, readonly endAbove: number) {}

  get inRep() { return this.phase === 'down'; }
  /** Último ângulo visto está acima do fim (posição inicial). */
  get atTop() { return this.phase === 'up' && this.last != null && this.last > this.endAbove; }
  get minAngle() { return this.min; }

  reset() {
    this.armed = true;
    this.clear();
  }

  /** Cancela a rep e espera ver o topo antes da próxima. */
  abort() {
    this.armed = false;
    this.clear();
  }

  private clear() {
    this.phase = 'up';
    this.last = null;
    this.descentStartAt = null;
    this.bottomAt = null;
    this.min = Infinity;
  }

  /** 'start' = começou (também é o primeiro fundo); 'bottom' = novo ponto mais baixo; 'end' = terminou. */
  step(angle: number, t?: number): 'start' | 'bottom' | 'end' | 'none' {
    const prev = this.last;
    this.last = angle;
    if (this.phase === 'up') {
      if (!this.armed) {
        if (angle <= this.endAbove) return 'none';
        this.armed = true;
      }
      if (angle > this.endAbove) this.descentStartAt = null;
      else if (t != null && prev != null && prev > this.endAbove) this.descentStartAt = t;
      if (angle < this.startBelow) {
        this.phase = 'down';
        this.min = angle;
        this.bottomAt = t ?? null;
        return 'start';
      }
      return 'none';
    }
    if (angle < this.min) {
      this.min = angle;
      this.bottomAt = t ?? null;
      return 'bottom';
    }
    if (angle <= this.endAbove) return 'none';
    return 'end';
  }

  /** Segundos da descida da rep atual; null = não deu para medir. */
  descentSeconds(): number | null {
    return this.descentStartAt != null && this.bottomAt != null && this.bottomAt >= this.descentStartAt
      ? Math.round((this.bottomAt - this.descentStartAt) / 10) / 100
      : null;
  }

  /** Fecha a rep que acabou de terminar. */
  finish() {
    this.phase = 'up';
    this.min = Infinity;
    this.descentStartAt = null;
    this.bottomAt = null;
  }
}

/** Arredonda para não errar por ruído de ponto flutuante na borda. */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface LiveSessionSummary {
  total: number;
  complete: number;
  incomplete: number;
  errors: { key: string; label: string; count: number }[];
  avgDescentSeconds: number | null;
  fastDescentReps: number;
}

const avg = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;

export function summarizeLiveReps(reps: LiveRep[], messages: Record<string, string>): LiveSessionSummary {
  const counts = new Map<string, number>();
  for (const r of reps) for (const e of r.errors) counts.set(e, (counts.get(e) ?? 0) + 1);
  const complete = reps.filter((r) => r.complete).length;
  return {
    total: reps.length,
    complete,
    incomplete: reps.length - complete,
    errors: [...counts.entries()]
      .map(([key, count]) => ({ key, label: messages[key] ?? key, count }))
      .sort((a, b) => b.count - a.count),
    avgDescentSeconds: avg(reps.map((r) => r.descentSeconds).filter((d): d is number => d != null)),
    fastDescentReps: reps.filter((r) => r.fastDescent).length,
  };
}

export interface LegSummary {
  leg: Side;
  total: number;
  complete: number;
  avgDescentSeconds: number | null;
}

/** Resumo separado por perna da frente (só reps com perna). Esquerda primeiro. */
export function summarizeByLeg(reps: LiveRep[]): LegSummary[] {
  return (['left', 'right'] as Side[])
    .map((leg) => {
      const own = reps.filter((r) => r.leg === leg);
      return {
        leg,
        total: own.length,
        complete: own.filter((r) => r.complete).length,
        avgDescentSeconds: avg(own.map((r) => r.descentSeconds).filter((d): d is number => d != null)),
      };
    })
    .filter((s) => s.total > 0);
}

export const LEG_LABELS: Record<Side, string> = { left: 'Esquerda', right: 'Direita' };
