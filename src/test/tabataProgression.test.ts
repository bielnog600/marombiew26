import { describe, it, expect } from 'vitest';
import { parseTabata } from '@/lib/tabataParser';
import { serializeTabata } from '@/lib/tabataSerializer';
import {
  tabataPlayerSteps, resolveWarmupBlock, progressionLevels, normalizeWarmupSection,
  ensureBlockIntensities, progressionWarnings, parseTabataIntensity, warmupItemName,
} from '@/lib/tabataProgression';

const table = (rows: [string, number, number][]) =>
  ['| # | Exercício | Trabalho | Descanso | Observação |', '|---|---|---|---|---|', ...rows.map(([n, w, r], i) => `| ${i + 1} | ${n} | ${w}s | ${r}s | ... |`)].join('\n');

const legacy = `# TABATA — Antigo

**Tipo:** Intenso

## 🔥 Aquecimento
- POLICHINELO — 1 min
- AGACHAMENTO — 1 min
- ESCAPULAR — 60s

## Blocos

### Bloco 1 — A
**Formato:** 8 rounds × 20s / 10s

${table([['GLOBET SQUATS', 20, 10], ['SKIPS', 20, 10]])}

**Descanso após bloco:** 1 min

### Bloco 2 — B
**Formato:** 8 rounds × 20s / 10s

${table([['BURPEES', 20, 10], ['JUMPS', 20, 10]])}

**Descanso após bloco:** 1 min

## 🧘 Desaquecimento
- Alongamento de posterior
`;

const timed = `# TABATA — Novo

## 🔥 Aquecimento (4 min)

### Bloco 0 — Aquecimento
**Formato:** 4 rounds × 40s trabalho / 20s transição
**Intensidade:** Leve (RPE 3–4)

${table([['POLICHINELO', 40, 20], ['SKIPS', 40, 20], ['AGACHAMENTO', 40, 20], ['ESCAPULAR', 40, 20]])}

**Descanso após bloco:** 30s

## 💪 Bloco Principal

### Bloco 1 — Base
**Formato:** 8 rounds × 30s / 15s
**Intensidade:** Moderado (RPE 6–7)

${table([['AGACHAMENTO ISOMETRIA', 30, 15]])}

**Descanso após bloco:** 1 min

### Bloco 2 — Final
**Formato:** 8 rounds × 20s / 10s
**Intensidade:** Máximo (RPE 9–10)

${table([['BURPEES', 20, 10]])}

**Descanso após bloco:** 1 min
`;

describe('Bloco 0 — aquecimento cronometrado', () => {
  it('lê o Bloco 0 separado dos blocos principais, com intensidade e tempos', () => {
    const p = parseTabata(timed);
    expect(p.blocks).toHaveLength(2);
    expect(p.warmupBlock?.exercises.map(e => e.name)).toEqual(['POLICHINELO', 'SKIPS', 'AGACHAMENTO', 'ESCAPULAR']);
    expect(p.warmupBlock).toMatchObject({ workSeconds: 40, restSeconds: 20, restAfterBlock: 30, intensity: 'leve' });
    expect(p.blocks.map(b => b.intensity)).toEqual(['moderado', 'maximo']);
  });

  it('o Player roda o Bloco 0 primeiro e depois avança para o Bloco 1', () => {
    const steps = tabataPlayerSteps(parseTabata(timed));
    expect(steps.slice(0, 4).every(s => s.isWarmup && s.blockNumber === 0)).toBe(true);
    expect(steps[3].exerciseIndex).toBe(3);
    expect(steps[4]).toMatchObject({ isWarmup: false, blockNumber: 1, blockIndex: 0 });
    expect(steps[4].exercise.name).toBe('AGACHAMENTO ISOMETRIA');
  });

  it('plano antigo com lista de texto vira Bloco 0 de 25s / 5s por exercício', () => {
    const p = parseTabata(legacy);
    const warm = resolveWarmupBlock(p)!;
    expect(warm.exercises.map(e => e.name)).toEqual(['POLICHINELO', 'AGACHAMENTO', 'ESCAPULAR']);
    expect(warm.exercises.every(e => e.workSeconds === 25 && e.restSeconds === 5)).toBe(true);
    const steps = tabataPlayerSteps(p);
    expect(steps.filter(s => s.isWarmup)).toHaveLength(3);
    expect(steps.filter(s => !s.isWarmup)).toHaveLength(4);
  });

  it('o desaquecimento não entra no aquecimento', () => {
    const p = parseTabata(legacy);
    expect(p.warmup).toEqual(['POLICHINELO — 1 min', 'AGACHAMENTO — 1 min', 'ESCAPULAR — 60s']);
    expect(p.cooldown).toEqual(['Alongamento de posterior']);
  });

  it('plano sem aquecimento não ganha Bloco 0', () => {
    const p = parseTabata(legacy.replace(/## 🔥 Aquecimento[\s\S]*?## Blocos/, '## Blocos'));
    expect(resolveWarmupBlock(p)).toBeNull();
    expect(tabataPlayerSteps(p).every(s => !s.isWarmup)).toBe(true);
  });

  it('salvar e reabrir mantém o Bloco 0 e as intensidades', () => {
    const again = parseTabata(serializeTabata(parseTabata(timed)));
    expect(again.warmupBlock?.exercises).toHaveLength(4);
    expect(again.warmupBlock?.intensity).toBe('leve');
    expect(again.blocks.map(b => b.intensity)).toEqual(['moderado', 'maximo']);
    expect(again.blocks).toHaveLength(2);
  });

  it('nome do item da lista sem a duração', () => {
    expect(warmupItemName('POLICHINELO — 1 min')).toBe('POLICHINELO');
    expect(warmupItemName('SKIPS - 60s')).toBe('SKIPS');
    expect(warmupItemName('**CORDA NAVAL (BI)** — 30s')).toBe('CORDA NAVAL (BI)');
  });
});

describe('progressão de intensidade', () => {
  it('Moderado → Forte → Máximo, o último sempre Máximo', () => {
    expect(progressionLevels(3)).toEqual(['moderado', 'forte', 'maximo']);
    expect(progressionLevels(2)).toEqual(['moderado', 'maximo']);
    expect(progressionLevels(4)).toEqual(['moderado', 'forte', 'forte', 'maximo']);
    expect(progressionLevels(1)).toEqual(['forte']);
  });

  it('lê a intensidade escrita de várias formas', () => {
    expect(parseTabataIntensity('MÁXIMO')).toBe('maximo');
    expect(parseTabataIntensity('Forte (RPE 8)')).toBe('forte');
    expect(parseTabataIntensity('moderada')).toBe('moderado');
    expect(parseTabataIntensity('qualquer')).toBeUndefined();
  });

  it('o gerador completa a intensidade dos blocos sem tocar no aquecimento', () => {
    const md = ensureBlockIntensities(normalizeWarmupSection(legacy, true));
    const p = parseTabata(md);
    expect(p.blocks.map(b => b.intensity)).toEqual(['moderado', 'maximo']);
    expect(p.warmupBlock?.intensity).toBe('leve');
  });

  it('bloco que já tem intensidade fica como está', () => {
    const p = parseTabata(ensureBlockIntensities(timed));
    expect(p.blocks.map(b => b.intensity)).toEqual(['moderado', 'maximo']);
    expect(ensureBlockIntensities(timed)).toBe(timed);
  });

  it('avisa quando a intensidade cai ou os explosivos estão no começo', () => {
    const inverted = timed.replace('Moderado (RPE 6–7)', 'TMP').replace('Máximo (RPE 9–10)', 'Moderado (RPE 6–7)').replace('TMP', 'Máximo (RPE 9–10)');
    const w = progressionWarnings(parseTabata(inverted));
    expect(w.some(x => /Bloco 2 \(Moderado\) está mais leve que o Bloco 1 \(Máximo\)/.test(x))).toBe(true);
    const explosiveFirst = parseTabata(legacy);
    explosiveFirst.blocks.reverse();
    expect(progressionWarnings(explosiveFirst).some(x => /explosivos/.test(x))).toBe(true);
    expect(progressionWarnings(parseTabata(timed))).toEqual([]);
  });
});

describe('aquecimento do gerador', () => {
  it('ligado: lista de texto vira Bloco 0 de 25s / 5s', () => {
    const p = parseTabata(normalizeWarmupSection(legacy, true));
    expect(p.warmupBlock?.exercises.map(e => e.name)).toEqual(['POLICHINELO', 'AGACHAMENTO', 'ESCAPULAR']);
    expect(p.warmupBlock?.exercises.every(e => e.workSeconds === 25 && e.restSeconds === 5)).toBe(true);
    expect(p.blocks).toHaveLength(2);
    expect(p.cooldown).toEqual(['Alongamento de posterior']);
  });

  it('desligado: a seção de aquecimento sai e o resto fica igual', () => {
    const md = normalizeWarmupSection(legacy, false);
    const p = parseTabata(md);
    expect(p.warmup).toEqual([]);
    expect(p.warmupBlock).toBeNull();
    expect(p.blocks).toHaveLength(2);
    expect(md).toContain('## 🧘 Desaquecimento');
  });

  it('Bloco 0 já cronometrado não é reescrito', () => {
    expect(normalizeWarmupSection(timed, true)).toBe(timed);
  });
});

describe('aquecimento de no máximo 3 min', () => {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `MOBILIDADE ${i + 1}`);

  it('padrão: 6 exercícios × 25s / 5s = 3 min', () => {
    expect(WARMUP_DEFAULT).toMatchObject({ work: 25, rest: 5, count: 6 });
    const block = newWarmupBlock(names(6));
    expect(warmupTotalSeconds(block)).toBe(180);
    expect(warmupWarnings(block)).toEqual([]);
  });

  it('cabem no máximo 3 min de exercícios conforme os tempos', () => {
    expect(maxWarmupExercises(25, 5)).toBe(6);
    expect(maxWarmupExercises(30, 10)).toBe(4);
    expect(maxWarmupExercises(20, 5)).toBe(7);
  });

  it('trabalho fica entre 20s e 30s e intervalo entre 5s e 10s', () => {
    expect(clampWarmupWork(40)).toBe(30);
    expect(clampWarmupWork(10)).toBe(20);
    expect(clampWarmupRest(20)).toBe(10);
    expect(clampWarmupRest(0)).toBe(5);
    const b = setWarmupTimes(newWarmupBlock(names(3)), 45, 2);
    expect(b.exercises.every(e => e.workSeconds === 30 && e.restSeconds === 5)).toBe(true);
  });

  it('o gerador corta o que passar de 3 min e aplica os tempos escolhidos', () => {
    const fit = fitWarmupBlock(newWarmupBlock(names(8), 40, 20), { work: 25, rest: 5 });
    expect(fit.block.exercises).toHaveLength(6);
    expect(warmupTotalSeconds(fit.block)).toBe(180);
    expect(fit.removed).toEqual(['MOBILIDADE 7', 'MOBILIDADE 8']);
    expect(fit.block.exercises.every(e => e.workSeconds === 25 && e.restSeconds === 5)).toBe(true);
  });

  it('plano antigo com 8 itens na lista roda só os 3 primeiros minutos', () => {
    const warm = warmupBlockFromList(names(8).map(n => `${n} — 1 min`))!;
    expect(warm.exercises).toHaveLength(6);
    expect(warmupTotalSeconds(warm)).toBe(180);
  });

  it('avisa quando o aquecimento passa de 3 min', () => {
    const w = warmupWarnings(newWarmupBlock(names(7)));
    expect(w.some(x => /3:30 — o máximo é 3 min/.test(x))).toBe(true);
  });

  it('a seção reescrita pelo gerador continua sendo lida como Bloco 0', () => {
    const p0 = parseTabata(timed);
    const fit = fitWarmupBlock(p0.warmupBlock!, { work: 25, rest: 5 });
    const p = parseTabata(replaceWarmupSection(timed, fit.block));
    expect(p.warmupBlock?.exercises.map(e => [e.workSeconds, e.restSeconds])).toEqual([[25, 5], [25, 5], [25, 5], [25, 5]]);
    expect(p.blocks).toHaveLength(2);
  });
});
