// Regras puras do bloco de aquecimento cronometrado (Bloco 0) e da progressão de intensidade
// entre os blocos do TABATA. O plano continua salvo em markdown; estas regras só leem/escrevem
// linhas compatíveis com o parser, então planos antigos abrem sem migração.
import type { ParsedTabata, TabataBlock, TabataExercise } from './tabataParser';

export type TabataIntensity = 'leve' | 'moderado' | 'forte' | 'maximo';

export const TABATA_INTENSITIES: { value: TabataIntensity; label: string; rpe: string }[] = [
  { value: 'leve', label: 'Leve', rpe: 'RPE 3–4' },
  { value: 'moderado', label: 'Moderado', rpe: 'RPE 6–7' },
  { value: 'forte', label: 'Forte', rpe: 'RPE 8' },
  { value: 'maximo', label: 'Máximo', rpe: 'RPE 9–10' },
];

const INTENSITY_RANK: Record<TabataIntensity, number> = { leve: 0, moderado: 1, forte: 2, maximo: 3 };

const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** "Moderado (RPE 6–7)" / "MÁXIMO" / "forte" → valor; texto desconhecido → undefined. */
export function parseTabataIntensity(text: string | null | undefined): TabataIntensity | undefined {
  const n = norm(text || '');
  if (!n) return undefined;
  if (/maxim/.test(n)) return 'maximo';
  if (/fort|intens/.test(n)) return 'forte';
  if (/moder/.test(n)) return 'moderado';
  if (/leve|light/.test(n)) return 'leve';
  return undefined;
}

export const intensityInfo = (v: TabataIntensity | undefined) => TABATA_INTENSITIES.find(i => i.value === v);

/** Texto gravado na linha **Intensidade:** do bloco. */
export const intensityText = (v: TabataIntensity) => {
  const i = intensityInfo(v)!;
  return `${i.label} (${i.rpe})`;
};

/** Progressão Moderado → Forte → Máximo distribuída pelos blocos (o último é sempre Máximo). */
export function progressionLevels(blockCount: number): TabataIntensity[] {
  if (blockCount <= 0) return [];
  if (blockCount === 1) return ['forte'];
  const ladder: TabataIntensity[] = ['moderado', 'forte', 'maximo'];
  return Array.from({ length: blockCount }, (_, i) => ladder[Math.round((i * 2) / (blockCount - 1))]);
}

// ───────────────────────── Bloco 0 — Aquecimento ─────────────────────────

export const WARMUP_BLOCK_NAME = 'Bloco 0 — Aquecimento';
/** Padrão do Bloco 0: 6 exercícios × 25s / 5s = 3 min, depois 10s de "Prepare-se". */
export const WARMUP_DEFAULT = { work: 25, rest: 5, afterBlock: 10, count: 6 } as const;
/** Limites do aquecimento: trabalho 20–30s, intervalo 5–10s, no máximo 3 min no total. */
export const WARMUP_LIMITS = { workMin: 20, workMax: 30, restMin: 5, restMax: 10, maxSeconds: 180 } as const;
/** Planos antigos (lista de texto): convertidos com o padrão atual, respeitando os 3 min. */
export const LEGACY_WARMUP_SECONDS = WARMUP_DEFAULT.work;

const clampInt = (v: number, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
};
export const clampWarmupWork = (s: number) => clampInt(s, WARMUP_LIMITS.workMin, WARMUP_LIMITS.workMax, WARMUP_DEFAULT.work);
export const clampWarmupRest = (s: number) => clampInt(s, WARMUP_LIMITS.restMin, WARMUP_LIMITS.restMax, WARMUP_DEFAULT.rest);

/** Duração do aquecimento: soma de trabalho + intervalo de cada exercício (6 × 25s/5s = 180s). */
export const warmupTotalSeconds = (block: Pick<TabataBlock, 'exercises'> | null | undefined) =>
  (block?.exercises ?? []).reduce((sum, e) => sum + (Number(e.workSeconds) || 0) + (Number(e.restSeconds) || 0), 0);

/** Quantos exercícios cabem em 3 min com esses tempos (já limitados a 20–30s / 5–10s). */
export const maxWarmupExercises = (work: number, rest: number) =>
  Math.max(1, Math.floor(WARMUP_LIMITS.maxSeconds / (clampWarmupWork(work) + clampWarmupRest(rest))));

/** 180 → "3:00"; 150 → "2:30". */
export const formatWarmupClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec % 60)).padStart(2, '0')}`;

/** "POLICHINELO — 1 min" → "POLICHINELO". */
export function warmupItemName(item: string): string {
  return (item || '')
    .replace(/\*+/g, '')
    .split(/\s+[—–-]\s+|\s*:\s+/)[0]
    .replace(/\(\s*\d+\s*(s|seg|min)[^)]*\)\s*$/i, '')
    .trim();
}

const warmupFormat = (count: number, work: number, rest: number) => `${count} rounds × ${work}s / ${rest}s`;

export function newWarmupBlock(names: string[], work: number = WARMUP_DEFAULT.work, rest: number = WARMUP_DEFAULT.rest): TabataBlock {
  const list = names.map(n => n.trim()).filter(Boolean);
  const exercises: TabataExercise[] = (list.length ? list : ['']).map(name => ({ name, workSeconds: work, restSeconds: rest, observation: '' }));
  return {
    name: WARMUP_BLOCK_NAME,
    format: warmupFormat(exercises.length, work, rest),
    rounds: exercises.length,
    workSeconds: work,
    restSeconds: rest,
    exercises,
    restAfterBlock: WARMUP_DEFAULT.afterBlock,
    intensity: 'leve',
  };
}

/** Mesmos tempos em todos os exercícios do aquecimento (trabalho 20–30s, intervalo 5–10s). */
export function setWarmupTimes(block: TabataBlock, work: number, rest: number): TabataBlock {
  const w = clampWarmupWork(work);
  const r = clampWarmupRest(rest);
  return {
    ...block,
    workSeconds: w,
    restSeconds: r,
    format: warmupFormat(block.exercises.length, w, r),
    exercises: block.exercises.map(e => ({ ...e, workSeconds: w, restSeconds: r })),
  };
}

export interface WarmupFit {
  block: TabataBlock;
  /** Exercícios cortados para caber em 3 min. */
  removed: string[];
  /** Algum tempo foi trocado para ficar em 20–30s / 5–10s (ou nos tempos escolhidos). */
  timesChanged: boolean;
  changed: boolean;
}

/**
 * Encaixa o aquecimento nas regras: tempos de cada exercício em 20–30s / 5–10s (ou os tempos
 * escolhidos no wizard), no máximo `count` exercícios e no máximo 3 min no total.
 */
export function fitWarmupBlock(block: TabataBlock, target: { work?: number; rest?: number; count?: number } = {}): WarmupFit {
  let timesChanged = false;
  const exercises = block.exercises.filter(e => e.name.trim()).map(e => {
    const w = target.work !== undefined ? clampWarmupWork(target.work) : clampWarmupWork(e.workSeconds);
    const r = target.rest !== undefined ? clampWarmupRest(target.rest) : clampWarmupRest(e.restSeconds);
    if (w !== e.workSeconds || r !== e.restSeconds) timesChanged = true;
    return { ...e, workSeconds: w, restSeconds: r };
  });
  const kept: TabataExercise[] = [];
  const removed: string[] = [];
  let total = 0;
  const maxCount = target.count && target.count > 0 ? target.count : Infinity;
  for (const e of exercises) {
    const d = e.workSeconds + e.restSeconds;
    if (kept.length < maxCount && total + d <= WARMUP_LIMITS.maxSeconds) { kept.push(e); total += d; }
    else removed.push(e.name);
  }
  const first = kept[0];
  const w = first?.workSeconds ?? clampWarmupWork(block.workSeconds);
  const r = first?.restSeconds ?? clampWarmupRest(block.restSeconds);
  const next: TabataBlock = {
    ...block,
    exercises: kept,
    rounds: kept.length,
    workSeconds: w,
    restSeconds: r,
    format: warmupFormat(kept.length, w, r),
    intensity: block.intensity ?? 'leve',
  };
  return { block: next, removed, timesChanged, changed: timesChanged || removed.length > 0 };
}

/** Avisos do aquecimento no editor/wizard (não altera nada). */
export function warmupWarnings(block: TabataBlock | null | undefined): string[] {
  if (!block) return [];
  const out: string[] = [];
  const total = warmupTotalSeconds(block);
  if (total > WARMUP_LIMITS.maxSeconds) {
    out.push(`O aquecimento tem ${formatWarmupClock(total)} — o máximo é 3 min. Tire um exercício ou reduza os tempos.`);
  }
  const named = block.exercises.filter(e => e.name.trim());
  if (named.some(e => e.workSeconds < WARMUP_LIMITS.workMin || e.workSeconds > WARMUP_LIMITS.workMax)) {
    out.push('Trabalho do aquecimento deve ficar entre 20s e 30s.');
  }
  if (named.some(e => e.restSeconds < WARMUP_LIMITS.restMin || e.restSeconds > WARMUP_LIMITS.restMax)) {
    out.push('Intervalo do aquecimento deve ficar entre 5s e 10s.');
  }
  return out;
}

/** Lista de texto antiga → Bloco 0 cronometrado (25s / 5s por exercício, até 3 min). */
export function warmupBlockFromList(items: string[]): TabataBlock | null {
  const names = items.map(warmupItemName).filter(Boolean);
  if (!names.length) return null;
  return fitWarmupBlock(newWarmupBlock(names)).block;
}

/** Bloco de aquecimento que o Player roda: o cronometrado salvo ou a conversão da lista antiga. */
export function resolveWarmupBlock(parsed: ParsedTabata): TabataBlock | null {
  const saved = parsed.warmupBlock;
  if (saved && saved.exercises.some(e => e.name.trim())) {
    return { ...saved, intensity: saved.intensity ?? 'leve', exercises: saved.exercises.filter(e => e.name.trim()) };
  }
  return warmupBlockFromList(parsed.warmup || []);
}

// ───────────────────────── Player ─────────────────────────

export interface TabataPlayerStep {
  /** Índice em `parsed.blocks`; -1 no aquecimento. */
  blockIndex: number;
  /** Número mostrado: 0 no aquecimento, 1.. nos blocos. */
  blockNumber: number;
  isWarmup: boolean;
  exerciseIndex: number;
  block: TabataBlock;
  exercise: TabataExercise;
}

/** Sequência do Player: Bloco 0 (aquecimento) e depois os blocos na ordem. */
export function tabataPlayerSteps(parsed: ParsedTabata | null | undefined): TabataPlayerStep[] {
  if (!parsed) return [];
  const steps: TabataPlayerStep[] = [];
  const warm = resolveWarmupBlock(parsed);
  warm?.exercises.forEach((exercise, exerciseIndex) =>
    steps.push({ blockIndex: -1, blockNumber: 0, isWarmup: true, exerciseIndex, block: warm, exercise }));
  parsed.blocks.forEach((block, blockIndex) => {
    block.exercises.forEach((exercise, exerciseIndex) =>
      steps.push({ blockIndex, blockNumber: blockIndex + 1, isWarmup: false, exerciseIndex, block, exercise }));
  });
  return steps;
}

// ───────────────────────── Gerador (markdown) ─────────────────────────

const isWarmupHeader = (t: string) => /^##\s+/.test(t) && !/^###/.test(t) && /aquecimento/i.test(t) && !/desaquecimento/i.test(t);
const isH2 = (t: string) => /^##\s+/.test(t) && !/^###/.test(t);

function blockMarkdown(b: TabataBlock): string[] {
  const lines = [`### ${b.name}`, `**Formato:** ${b.format || `${b.rounds} rounds × ${b.workSeconds}s / ${b.restSeconds}s`}`];
  if (b.intensity) lines.push(`**Intensidade:** ${intensityText(b.intensity)}`);
  lines.push('', '| # | Exercício | Trabalho | Descanso | Observação |', '|---|-----------|----------|----------|------------|');
  b.exercises.forEach((ex, i) => lines.push(`| ${i + 1} | ${ex.name} | ${ex.workSeconds}s | ${ex.restSeconds}s | ${ex.observation || '...'} |`));
  const rest = b.restAfterBlock >= 60 && b.restAfterBlock % 60 === 0 ? `${b.restAfterBlock / 60} min` : `${b.restAfterBlock}s`;
  lines.push('', `**Descanso após bloco:** ${rest}`);
  return lines;
}
export { blockMarkdown as tabataBlockMarkdown };

function warmupSectionRange(lines: string[]): [number, number] | null {
  const start = lines.findIndex(l => isWarmupHeader(l.trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (isH2(lines[i].trim())) { end = i; break; }
  return [start, end];
}

const warmupHeaderLine = (block: TabataBlock) => `## 🔥 Aquecimento (${formatWarmupClock(warmupTotalSeconds(block))} min)`;

/**
 * Correção determinística do aquecimento gerado: com o switch ligado, uma seção de aquecimento
 * só com lista vira o Bloco 0 cronometrado (tempos do wizard, padrão 25s/5s, até 3 min); com o
 * switch desligado, a seção sai. O resto do markdown (blocos, segurança, dicas) fica igual.
 */
export function normalizeWarmupSection(
  markdown: string,
  include: boolean,
  target: { work?: number; rest?: number; count?: number } = {},
): string {
  const lines = (markdown || '').split('\n');
  const range = warmupSectionRange(lines);
  if (!range) return markdown;
  const [start, end] = range;
  const section = lines.slice(start + 1, end);
  if (!include) {
    const out = [...lines.slice(0, start), ...lines.slice(end)];
    return out.join('\n');
  }
  if (section.some(l => /^###\s+/.test(l.trim()))) return markdown;
  const items = section.map(l => l.trim()).filter(l => /^[-*]\s+/.test(l)).map(l => l.replace(/^[-*]\s+/, ''));
  const names = items.map(warmupItemName).filter(Boolean);
  if (!names.length) return markdown;
  const block = fitWarmupBlock(newWarmupBlock(names), target).block;
  return [...lines.slice(0, start), warmupHeaderLine(block), '', ...blockMarkdown(block), '', ...lines.slice(end)].join('\n');
}

/** Reescreve a seção de aquecimento com o Bloco 0 informado (o resto do markdown fica igual). */
export function replaceWarmupSection(markdown: string, block: TabataBlock): string {
  const lines = (markdown || '').split('\n');
  const range = warmupSectionRange(lines);
  if (!range) return markdown;
  const [start, end] = range;
  return [...lines.slice(0, start), warmupHeaderLine(block), '', ...blockMarkdown(block), '', ...lines.slice(end)].join('\n');
}

/**
 * Progressão ligada: escreve **Intensidade:** nos blocos principais que vieram sem ela,
 * seguindo Moderado → Forte → Máximo. Blocos que já têm intensidade ficam como estão.
 */
export function ensureBlockIntensities(markdown: string): string {
  const lines = (markdown || '').split('\n');
  const blockHeaders: number[] = [];
  let inWarmup = false;
  lines.forEach((l, i) => {
    const t = l.trim();
    if (isH2(t)) inWarmup = isWarmupHeader(t);
    else if (/^###\s+/.test(t) && !inWarmup && !/^###\s+bloco\s*0\b/i.test(t)) blockHeaders.push(i);
  });
  const levels = progressionLevels(blockHeaders.length);
  const inserts: { at: number; text: string }[] = [];
  blockHeaders.forEach((h, bi) => {
    const stop = blockHeaders[bi + 1] ?? lines.length;
    let fmt = -1;
    let has = false;
    for (let i = h + 1; i < stop; i++) {
      const t = lines[i].trim();
      if (isH2(t)) break;
      if (/^\*\*Intensidade:\*\*/i.test(t)) has = true;
      if (fmt < 0 && /^\*\*Formato:\*\*/i.test(t)) fmt = i;
    }
    if (!has) inserts.push({ at: (fmt >= 0 ? fmt : h) + 1, text: `**Intensidade:** ${intensityText(levels[bi])}` });
  });
  for (const ins of inserts.reverse()) lines.splice(ins.at, 0, ins.text);
  return lines.join('\n');
}

// Exercícios explosivos/metabólicos — devem ficar nos blocos finais.
const EXPLOSIVE = /\b(BURPEES?|JUMPS?|JUMPING|SALTOS?|SKIPS?|SPRINTS?|CORDA NAVAL|THRUSTERS?|SWING|POLICHINELO|MOUNTAIN|MOUTAIN|ALPINISTA|TESOURINHA)\b/;
export const isExplosiveExercise = (name: string) =>
  EXPLOSIVE.test((name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());

/** Avisos da progressão (não altera nada): intensidade caindo ou bloco inicial mais explosivo que o final. */
export function progressionWarnings(parsed: ParsedTabata): string[] {
  const out: string[] = [];
  const blocks = parsed.blocks;
  for (let i = 1; i < blocks.length; i++) {
    const a = blocks[i - 1].intensity, b = blocks[i].intensity;
    if (a && b && INTENSITY_RANK[b] < INTENSITY_RANK[a]) {
      out.push(`Bloco ${i + 1} (${intensityInfo(b)!.label}) está mais leve que o Bloco ${i} (${intensityInfo(a)!.label}).`);
    }
  }
  if (blocks.length >= 2) {
    const count = (b: TabataBlock) => new Set(b.exercises.map(e => e.name).filter(isExplosiveExercise).map(norm)).size;
    const first = count(blocks[0]);
    const last = count(blocks[blocks.length - 1]);
    if (first > last) out.push(`Bloco 1 tem mais exercícios explosivos que o Bloco ${blocks.length}; os mais intensos devem ficar no fim.`);
  }
  return out;
}
