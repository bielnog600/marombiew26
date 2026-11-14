// Regras puras da tela do Player do TABATA: cor/intensidade de cada fase, frases, rótulos
// do topo, linha do tempo (total / faltam), barra por bloco, kcal estimadas e os momentos
// da voz do Fabiew. Só leem os passos de `tabataPlayerSteps`; nada aqui grava o plano.
import type { ParsedTabata } from './tabataParser';
import {
  intensityInfo, progressionLevels, type TabataIntensity, type TabataPlayerStep,
} from './tabataProgression';

export type PlayerPhase = 'idle' | 'prep' | 'work' | 'rest' | 'block_rest' | 'done';
export type PhaseTone = 'warmup' | 'moderado' | 'forte' | 'maximo' | 'rest';

/** "Fique pronto" antes do primeiro exercício. */
export const PREP_SECONDS = 10;

const TONE_VAR: Record<PhaseTone, string> = {
  warmup: '--tabata-warmup',
  moderado: '--tabata-moderate',
  forte: '--tabata-strong',
  maximo: '--tabata-max',
  rest: '--tabata-rest',
};

/** Cor da fase como CSS (token do tema), com transparência opcional. */
export const toneColor = (tone: PhaseTone, alpha?: number) =>
  alpha == null ? `hsl(var(${TONE_VAR[tone]}))` : `hsl(var(${TONE_VAR[tone]}) / ${alpha})`;

/**
 * Intensidade de cada bloco: a gravada no plano (**Intensidade:**) ou, em planos antigos
 * sem a linha, a progressão padrão Moderado → Forte → Máximo pela posição do bloco.
 */
export function blockIntensities(parsed: Pick<ParsedTabata, 'blocks'> | null | undefined): TabataIntensity[] {
  const blocks = parsed?.blocks ?? [];
  const ladder = progressionLevels(blocks.length);
  return blocks.map((b, i) => b.intensity ?? ladder[i]);
}

/** Aquecimento é sempre Leve; blocos seguem `blockIntensities`. */
export function stepIntensity(step: TabataPlayerStep | undefined, levels: TabataIntensity[]): TabataIntensity {
  if (!step || step.isWarmup) return 'leve';
  return levels[step.blockIndex] ?? 'moderado';
}

export const intensityTone = (level: TabataIntensity): PhaseTone => (level === 'leve' ? 'warmup' : level);

/**
 * Cor da fase: descanso entre rodadas = verde; transição entre blocos = cor do próximo bloco;
 * "Fique pronto" = cor do primeiro exercício; trabalho = cor da intensidade do bloco.
 */
export function phaseTone(
  phase: PlayerPhase, steps: TabataPlayerStep[], stepIndex: number, levels: TabataIntensity[],
): PhaseTone {
  if (phase === 'rest') return 'rest';
  if (phase === 'block_rest') return intensityTone(stepIntensity(steps[stepIndex + 1] ?? steps[stepIndex], levels));
  return intensityTone(stepIntensity(steps[stepIndex], levels));
}

const INTENSITY_SYMBOL: Record<TabataIntensity, string> = { leve: '●', moderado: '●', forte: '▲', maximo: '▲▲' };

/** "● Moderado · RPE 6–7", "▲ Forte · RPE 8", "▲▲ Máximo · RPE 9–10". */
export function intensityChipText(level: TabataIntensity): string {
  const info = intensityInfo(level)!;
  return `${INTENSITY_SYMBOL[level]} ${info.label} · ${info.rpe}`;
}

/** Frases da tela, coerentes com a intensidade (nunca "vai com tudo" no aquecimento/moderado). */
export const WORK_PHRASES: Record<TabataIntensity, string[]> = {
  leve: ['SOLTA O CORPO', 'RITMO LEVE', 'AQUECENDO', 'MOVIMENTO SOLTO'],
  moderado: ['RITMO FIRME', 'TÉCNICA PRIMEIRO', 'CONSTANTE', 'CONTROLA O MOVIMENTO'],
  forte: ['ACELERA!', 'FORTE AGORA!', 'SEGURA O RITMO!', 'NÃO DEIXA CAIR!'],
  maximo: ['VAI COM TUDO!', 'FORÇA TOTAL!', 'DÁ TUDO!', 'ÚLTIMO GÁS!'],
};
export const REST_CHIP = 'Respira · solta';

/** Frase do exercício, fixa por passo (não muda a cada segundo). */
export function workPhrase(level: TabataIntensity, seed: number): string {
  const list = WORK_PHRASES[level];
  return list[Math.abs(Math.trunc(seed)) % list.length];
}

/** "BLOCO 1 · RODADA 3/8" ou "AQUECIMENTO · 2/6". */
export function roundLabel(step: TabataPlayerStep | undefined): string {
  if (!step) return '';
  const pos = `${step.exerciseIndex + 1}/${step.block.exercises.length}`;
  return step.isWarmup ? `AQUECIMENTO · ${pos}` : `BLOCO ${step.blockNumber} · RODADA ${pos}`;
}

/** No descanso o topo já mostra a próxima rodada. */
export function headerStepIndex(phase: PlayerPhase, stepIndex: number, total: number): number {
  if ((phase === 'rest' || phase === 'block_rest') && stepIndex + 1 < total) return stepIndex + 1;
  return stepIndex;
}

// ───────────────────────── Linha do tempo ─────────────────────────

/** Pausa depois do passo: descanso da rodada, descanso do bloco no último, nada no fim. */
export function pauseAfter(steps: TabataPlayerStep[], i: number): number {
  const step = steps[i];
  if (!step || i >= steps.length - 1) return 0;
  const lastInBlock = step.exerciseIndex === step.block.exercises.length - 1;
  return Math.max(0, Number(lastInBlock ? step.block.restAfterBlock : step.exercise.restSeconds) || 0);
}

const stepSpan = (steps: TabataPlayerStep[], i: number) =>
  Math.max(0, Number(steps[i]?.exercise.workSeconds) || 0) + pauseAfter(steps, i);

export function totalSeconds(steps: TabataPlayerStep[], prep = PREP_SECONDS): number {
  return prep + steps.reduce((sum, _s, i) => sum + stepSpan(steps, i), 0);
}

/** Segundos decorridos no roteiro (pular avança o roteiro, pausar não conta). */
export function elapsedSeconds(
  steps: TabataPlayerStep[], phase: PlayerPhase, stepIndex: number, secondsLeft: number, prep = PREP_SECONDS,
): number {
  if (phase === 'idle') return 0;
  const total = totalSeconds(steps, prep);
  if (phase === 'done') return total;
  if (phase === 'prep') return Math.max(0, prep - secondsLeft);
  let before = prep;
  for (let j = 0; j < stepIndex; j++) before += stepSpan(steps, j);
  const work = Math.max(0, Number(steps[stepIndex]?.exercise.workSeconds) || 0);
  const value = phase === 'work'
    ? before + (work - secondsLeft)
    : before + work + (pauseAfter(steps, stepIndex) - secondsLeft);
  return Math.min(total, Math.max(0, value));
}

/** 252 → "4:12". */
export const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export interface ProgressSegment {
  blockNumber: number;
  tone: PhaseTone;
  /** Duração do segmento (o aquecimento fica mais curto na barra). */
  seconds: number;
  /** 0..1 já percorrido. */
  fill: number;
}

/** Um segmento por bloco (aquecimento incluso), na cor da intensidade. */
export function progressSegments(
  steps: TabataPlayerStep[], levels: TabataIntensity[], elapsed: number, prep = PREP_SECONDS,
): ProgressSegment[] {
  const out: (ProgressSegment & { start: number })[] = [];
  let cursor = prep;
  steps.forEach((step, i) => {
    const span = stepSpan(steps, i);
    let seg = out[out.length - 1];
    if (!seg || seg.blockNumber !== step.blockNumber) {
      seg = { blockNumber: step.blockNumber, tone: intensityTone(stepIntensity(step, levels)), seconds: 0, fill: 0, start: cursor };
      out.push(seg);
    }
    seg.seconds += span;
    cursor += span;
  });
  return out.map(({ start, ...s }) => ({
    ...s,
    fill: s.seconds > 0 ? Math.min(1, Math.max(0, (elapsed - start) / s.seconds)) : elapsed >= start ? 1 : 0,
  }));
}

// ───────────────────────── Resumo final ─────────────────────────

/** kcal por minuto de trabalho em cada intensidade, e nas pausas. */
export const KCAL_PER_MIN: Record<TabataIntensity, number> & { pausa: number } = {
  leve: 5, moderado: 9, forte: 11, maximo: 13, pausa: 3,
};

/** kcal estimadas: trabalho feito pela intensidade + o resto do tempo como pausa. */
export function estimateKcal(
  steps: TabataPlayerStep[], doneStepIndexes: Iterable<number>, levels: TabataIntensity[], durationSec: number,
): number {
  let kcal = 0;
  let workSec = 0;
  for (const i of new Set(doneStepIndexes)) {
    const step = steps[i];
    if (!step) continue;
    const w = Math.max(0, Number(step.exercise.workSeconds) || 0);
    workSec += w;
    kcal += (w / 60) * KCAL_PER_MIN[stepIntensity(step, levels)];
  }
  kcal += (Math.max(0, durationSec - workSec) / 60) * KCAL_PER_MIN.pausa;
  return Math.round(kcal);
}

export interface SessionCounts { rounds: number; totalRounds: number; blocks: number; totalBlocks: number }

/** Rodadas = exercícios dos blocos (aquecimento fora); bloco conta quando todas as rodadas foram feitas. */
export function sessionCounts(steps: TabataPlayerStep[], doneStepIndexes: Iterable<number>): SessionCounts {
  const done = new Set(doneStepIndexes);
  const main = steps.map((s, i) => ({ s, i })).filter(x => !x.s.isWarmup);
  const byBlock = new Map<number, number[]>();
  main.forEach(({ s, i }) => byBlock.set(s.blockIndex, [...(byBlock.get(s.blockIndex) ?? []), i]));
  return {
    rounds: main.filter(x => done.has(x.i)).length,
    totalRounds: main.length,
    blocks: [...byBlock.values()].filter(idx => idx.every(i => done.has(i))).length,
    totalBlocks: byBlock.size,
  };
}

export const RPE_LABELS: Record<number, string> = {
  1: 'Muito leve', 2: 'Muito leve', 3: 'Leve', 4: 'Leve', 5: 'Moderado', 6: 'Moderado',
  7: 'Pesado', 8: 'Muito pesado', 9: 'Quase no limite', 10: 'Máximo',
};

/** "Sobe a intensidade · Forte" na transição entre blocos. */
export function transitionChip(from: TabataIntensity, to: TabataIntensity): string {
  const rank: Record<TabataIntensity, number> = { leve: 0, moderado: 1, forte: 2, maximo: 3 };
  const label = intensityInfo(to)!.label;
  if (rank[to] > rank[from]) return `${INTENSITY_SYMBOL[to]} Sobe a intensidade · ${label}`;
  if (rank[to] < rank[from]) return `${INTENSITY_SYMBOL[to]} Baixa a intensidade · ${label}`;
  return `${INTENSITY_SYMBOL[to]} Mantém a intensidade · ${label}`;
}

// A voz do Fabiew (momentos, variações e frequência) fica em tabataVoiceCues.ts.
