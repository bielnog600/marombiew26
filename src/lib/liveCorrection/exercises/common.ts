/**
 * Peças compartilhadas pelas regras de exercício (lógica pura, sem câmera).
 */
import type { Side } from '../squatAnalysis';
import type { LiveRep } from './types';

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
