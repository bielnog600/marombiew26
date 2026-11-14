import { describe, it, expect } from 'vitest';
import { parseTabata, type TabataBlock } from '@/lib/tabataParser';
import {
  tabataDayFromTitle, resolveTabataDayChange, changeRoundExercise, fillBlockPattern,
  blockExerciseSummary, isQuickSetupExercise, tabataCatalogForDay, enforceQuickSetup,
  tabataPlanWarnings, quickSetupReplacement,
} from '@/lib/tabataRules';

const plans = [
  { id: 'q', titulo: 'Quinta — TABATA — Finisher (editado)', created_at: '2026-11-14T18:02:16Z' },
  { id: 't', titulo: 'Terça — TABATA — Full Body', created_at: '2026-11-14T18:02:15Z' },
  { id: 't-old', titulo: 'Terça — TABATA — Antigo', created_at: '2026-10-01T10:00:00Z' },
];

const block = (names: string[], extra: Partial<TabataBlock> = {}): TabataBlock => ({
  name: 'Bloco 1', format: '8 rounds × 20s / 10s', rounds: 8, workSeconds: 20, restSeconds: 10, restAfterBlock: 60,
  exercises: names.map(name => ({ name, workSeconds: 20, restSeconds: 10, observation: '' })),
  ...extra,
});

describe('troca de dia no Ajuste Rápido', () => {
  it('lê o dia do título', () => {
    expect(tabataDayFromTitle('Terça — TABATA — X')).toBe('Terça');
    expect(tabataDayFromTitle('TERCA — TABATA')).toBe('Terça');
    expect(tabataDayFromTitle('TABATA — sem dia')).toBeNull();
  });
  it('dia com TABATA abre o plano mais recente desse dia', () => {
    expect(resolveTabataDayChange(plans, 'q', 'Terça')).toEqual({ kind: 'load', planId: 't' });
  });
  it('voltar ao dia do próprio plano não recarrega nada', () => {
    expect(resolveTabataDayChange(plans, 'q', 'Quinta')).toEqual({ kind: 'same' });
  });
  it('dia sem TABATA move o plano atual (só ao salvar)', () => {
    expect(resolveTabataDayChange(plans, 'q', 'Sexta')).toEqual({ kind: 'move' });
  });
});

describe('observação do round', () => {
  it('trocar o exercício limpa a observação antiga', () => {
    const ex = { name: 'BURPEES', workSeconds: 20, restSeconds: 10, observation: 'Explosão máxima' };
    expect(changeRoundExercise(ex, 'POLICHINELO').observation).toBe('');
  });
  it('escolher o mesmo exercício mantém a observação', () => {
    const ex = { name: 'BURPEES', workSeconds: 20, restSeconds: 10, observation: 'Explosão máxima' };
    expect(changeRoundExercise(ex, 'BURPEES').observation).toBe('Explosão máxima');
  });
});

describe('Repetir padrão', () => {
  it('4 exercícios em 8 rounds = A-B-C-D-A-B-C-D', () => {
    const next = fillBlockPattern(block(['X']), ['A', 'B', 'C', 'D']);
    expect(next.exercises.map(e => e.name)).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
  });
  it('2 exercícios em 8 rounds = A-B repetido', () => {
    const next = fillBlockPattern(block([]), ['A', 'B']);
    expect(next.exercises.map(e => e.name)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B']);
  });
  it('mantém o trabalho/descanso de cada round e usa os do bloco nos rounds novos', () => {
    const b = block(['X', 'Y'], { workSeconds: 30, restSeconds: 15 });
    b.exercises[1] = { ...b.exercises[1], workSeconds: 40, restSeconds: 20 };
    const next = fillBlockPattern(b, ['A', 'B', 'C']);
    expect(next.exercises[1]).toMatchObject({ name: 'B', workSeconds: 40, restSeconds: 20 });
    expect(next.exercises[5]).toMatchObject({ name: 'C', workSeconds: 30, restSeconds: 15 });
    expect(next.exercises).toHaveLength(8);
  });
});

describe('resumo do card', () => {
  it('lista os exercícios diferentes de cada bloco', () => {
    const md = `# TABATA\n\n## Blocos\n\n### Bloco 1 — Pernas\n**Formato:** 8 rounds × 20s / 10s\n\n| # | Exercício | Trabalho | Descanso | Observação |\n|---|---|---|---|---|\n| 1 | GLOBET SQUATS | 20s | 10s | ... |\n| 2 | AFUNDO ALTERNANDO | 20s | 10s | ... |\n| 3 | SALTO LATERAL | 20s | 10s | ... |\n| 4 | AGACHAMENTO ISOMETRIA | 20s | 10s | ... |\n| 5 | GLOBET SQUATS | 20s | 10s | ... |\n`;
    expect(blockExerciseSummary(parseTabata(md))).toEqual([
      { label: 'Bloco 1', text: 'Globet squats, Afundo alternando, Salto lateral, Agachamento isometria' },
    ]);
  });
});

describe('gerador: montagem rápida', () => {
  it('aceita peso corporal, halter, kettlebell e corda naval', () => {
    for (const n of ['GLOBET SQUATS', 'AFUNDO HALTERES', 'SWING', 'CORDA NAVAL (BI)', 'POLICHINELO', 'STIFF HALTERES']) {
      expect(isQuickSetupExercise(n, 'QUADRÍCEPS')).toBe(true);
    }
  });
  it('proíbe barra, smith e máquinas', () => {
    for (const n of ['AGACHAMENTO LIVRE', 'AGACHAMENTO SMITH', 'AFUNDO C/ BARRA', 'STIFF ROMENO', 'SUPINO RETO', 'LEG PRESS', 'REMADA MÁQUINA']) {
      expect(isQuickSetupExercise(n, 'CARDIO')).toBe(false);
    }
  });
  it('troca AGACHAMENTO LIVRE por GLOBET SQUATS na tabela', () => {
    const md = `### Bloco 1\n| Round | Exercício | Trabalho | Descanso | Observação |\n|---|---|---|---|---|\n| 1 | AGACHAMENTO LIVRE | 20s | 10s | Desça fundo |\n| 2 | STIFF ROMENO | 20s | 10s | ... |\n`;
    const out = enforceQuickSetup(md, ['GLOBET SQUATS', 'STIFF HALTERES']);
    expect(out.markdown).toContain('| GLOBET SQUATS |');
    expect(out.markdown).toContain('| STIFF HALTERES |');
    expect(out.markdown).not.toContain('AGACHAMENTO LIVRE');
    expect(out.replaced).toEqual([['AGACHAMENTO LIVRE', 'GLOBET SQUATS'], ['STIFF ROMENO', 'STIFF HALTERES']]);
  });
  it('supino com barra vira flexão de braço', () => {
    expect(quickSetupReplacement('SUPINO INCLINADO BARRA', ['FLEXÃO DE BRAÇO'])).toBe('FLEXÃO DE BRAÇO');
  });
  it('dia de superiores tira burpee e flexão da lista', () => {
    const cat = ['BURPEES', 'FLEXÃO DE BRAÇO', 'POLICHINELO', 'GLOBET SQUATS'].map(nome => ({ nome, grupo_muscular: 'CARDIO', video_embed: 'x' }));
    expect(tabataCatalogForDay(cat, 'superiores').map(e => e.nome)).toEqual(['POLICHINELO', 'GLOBET SQUATS']);
    expect(tabataCatalogForDay(cat, 'inferiores').map(e => e.nome)).toHaveLength(4);
  });
});

describe('gerador: avisos', () => {
  const md = (names: string[]) => `### Bloco 1\n| # | Exercício | T | D | O |\n|---|---|---|---|---|\n${names.map((n, i) => `| ${i + 1} | ${n} | 20s | 10s | ... |`).join('\n')}\n`;
  it('bloco com menos de 4 exercícios diferentes', () => {
    const w = tabataPlanWarnings(parseTabata(md(['A', 'B', 'C', 'A', 'B', 'C'])));
    expect(w).toContain('Bloco 1 tem 3 exercícios diferentes (mínimo 4).');
  });
  it('exercício repetido de outro dia da semana', () => {
    const w = tabataPlanWarnings(parseTabata(md(['BURPEES', 'POLICHINELO', 'SKIPS', 'JUMPS'])), { otherDaysExercises: ['POLICHINELO'] });
    expect(w.some(x => x.includes('Repete de outro dia') && x.includes('Polichinelo'))).toBe(true);
  });
  it('dia de inferiores com mais de 1 salto/afundo por bloco', () => {
    const w = tabataPlanWarnings(parseTabata(md(['JUMPS', 'AFUNDO ALTERNANDO', 'PRANCHA FRONTAL', 'CORDA NAVAL (BI)'])), { dayKind: 'inferiores' });
    expect(w.some(x => x.includes('saltos/afundos'))).toBe(true);
  });
});
